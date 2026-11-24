import { LOCAL_ACCOUNT_TAKEN_MESSAGE, type IdentityLink, type LaunchErrorCode } from "./contract";
import {
  applyPlatformGrant,
  applyPlatformRevoke,
  canOpenFromPlatformGrant,
} from "./grant";
import { assertLocalAccountAvailable, resolveLinkForLaunch } from "./identity";
import { LaunchJwtError, verifyLaunchJwt, type JwtVerifyConfig } from "./launch-jwt";
import { decideJit, provisionedLink } from "./jit";

export type CreatedLocalUser = {
  localUserId: string;
  email: string;
};

export type SsoPorts = {
  findLinkByPlatformUserId(platformUserId: string): Promise<IdentityLink | null>;
  listLinks(): Promise<IdentityLink[]>;
  saveLink(link: IdentityLink): Promise<void>;
  consumeJti(jti: string, expiresAtSeconds: number): Promise<"ok" | "replay">;
  createLocalUser(spec: {
    platformUserId: string;
    displayName?: string;
    email: string;
    localRole: "employee";
    isSuperAdmin: false;
    mustChangePassword: false;
    copyPassword: false;
  }): Promise<CreatedLocalUser>;
  openSession(localUserId: string): Promise<void>;
  signOutLocal(localUserId: string): Promise<void>;
  checkLiveGrant?(platformUserId: string): Promise<boolean | null>;
};

export type LaunchOk = {
  ok: true;
  localUserId: string;
  created: boolean;
  platformUserId: string;
};

export type LaunchErr = { ok: false; code: LaunchErrorCode; message: string };

export type LaunchResult = LaunchOk | LaunchErr;

function fail(code: LaunchErrorCode, message: string): LaunchErr {
  return { ok: false, code, message };
}

export async function consumeLaunchToken(
  token: string,
  cfg: JwtVerifyConfig,
  ports: SsoPorts
): Promise<LaunchResult> {
  let claims;
  try {
    claims = await verifyLaunchJwt(token, cfg);
  } catch (err) {
    if (err instanceof LaunchJwtError) {
      return fail(err.code, err.message);
    }
    return fail("invalid", "invalid launch token");
  }

  const jti = await ports.consumeJti(claims.jti, claims.exp);
  if (jti === "replay") {
    return fail("replay", "launch token already used");
  }

  if (claims.grant !== true) {
    const existing = await ports.findLinkByPlatformUserId(claims.sub);
    if (existing) {
      const revoked = applyPlatformRevoke(existing);
      await ports.saveLink(revoked);
      await ports.signOutLocal(existing.localUserId);
    }
    return fail("grant", "platform grant is not active");
  }

  if (ports.checkLiveGrant) {
    const live = await ports.checkLiveGrant(claims.sub);
    if (live === false) {
      return fail("grant", "platform grant check failed");
    }
  }

  const links = await ports.listLinks();
  const existing =
    (await ports.findLinkByPlatformUserId(claims.sub)) ??
    resolveLinkForLaunch({
      platformUserId: claims.sub,
      jwtEmail: claims.email,
      links,
    });

  if (existing?.linkStatus === "revoked") {
    await ports.signOutLocal(existing.localUserId);
    return fail("grant", "identity link is revoked; admin re-link required");
  }

  const decision = decideJit({
    platformUserId: claims.sub,
    displayName: claims.name,
    existing,
  });

  let localUserId: string;
  let created = false;

  if (decision.action === "reuse" && decision.link) {
    localUserId = decision.link.localUserId;
  } else {
    const spec = decision.spec!;
    const createdUser = await ports.createLocalUser(spec);
    localUserId = createdUser.localUserId;
    created = true;
  }

  try {
    assertLocalAccountAvailable(links, localUserId, claims.sub);
  } catch (err) {
    const message = err instanceof Error ? err.message : LOCAL_ACCOUNT_TAKEN_MESSAGE;
    return fail("conflict", message);
  }

  const link = applyPlatformGrant(
    provisionedLink({
      platformUserId: claims.sub,
      localUserId,
      existing,
    })
  );

  if (!canOpenFromPlatformGrant({ link, platformGrant: true })) {
    return fail("grant", "platform grant is not active");
  }

  await ports.saveLink(link);
  await ports.openSession(localUserId);
  return {
    ok: true,
    localUserId,
    created,
    platformUserId: claims.sub,
  };
}

export async function consumeRevokeToken(
  token: string,
  cfg: JwtVerifyConfig,
  ports: SsoPorts
): Promise<{ ok: true; platformUserId: string } | LaunchErr> {
  let claims;
  try {
    claims = await verifyLaunchJwt(token, cfg);
  } catch (err) {
    if (err instanceof LaunchJwtError) {
      return fail(err.code, err.message);
    }
    return fail("invalid", "invalid revoke token");
  }

  const jti = await ports.consumeJti(`revoke:${claims.jti}`, claims.exp);
  if (jti === "replay") {
    return fail("replay", "revoke token already used");
  }

  if (claims.grant !== false) {
    return fail("invalid", "revoke token must set grant=false");
  }

  const existing = await ports.findLinkByPlatformUserId(claims.sub);
  if (!existing) {
    return { ok: true, platformUserId: claims.sub };
  }
  await ports.saveLink(applyPlatformRevoke(existing));
  await ports.signOutLocal(existing.localUserId);
  return { ok: true, platformUserId: claims.sub };
}
