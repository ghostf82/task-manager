import { LOCAL_ACCOUNT_TAKEN_MESSAGE, type IdentityLink, type LaunchErrorCode } from "./contract";
import type { AccessSignalsPoll } from "./access-signals";
import {
  applyPlatformGrant,
  applyPlatformRevoke,
  canOpenFromPlatformGrant,
  grantBlockedByStaleLaunch,
  revokedPlatformTombstone,
  type LiveGrantDecision,
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
  /**
   * Insert new or update same local user.
   * `"exists"` = another local user already owns this platform id.
   * `"stale"` = CAS lost (concurrent revoke changed `revoked_at`).
   */
  saveLink(
    link: IdentityLink,
    cas?: { expectedRevokedAt: number | null }
  ): Promise<"ok" | "exists" | "stale">;
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
  checkLiveGrant?(platformUserId: string): Promise<LiveGrantDecision>;
  pollAccessSignals?(platformUserId: string): Promise<AccessSignalsPoll>;
};

export type SsoPortsSource = SsoPorts | (() => SsoPorts);

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

function resolvePorts(ports: SsoPortsSource): SsoPorts {
  return typeof ports === "function" ? ports() : ports;
}

async function signOutIfPresent(
  ports: SsoPorts,
  localUserId: string | null | undefined
): Promise<void> {
  if (localUserId) await ports.signOutLocal(localUserId);
}

async function abortIfConcurrentRevoke(
  ports: SsoPorts,
  platformUserId: string,
  localUserId: string,
  iat: number
): Promise<LaunchErr | null> {
  const current = await ports.findLinkByPlatformUserId(platformUserId);
  if (
    current &&
    (current.linkStatus === "revoked" ||
      grantBlockedByStaleLaunch(current, iat) ||
      !current.grantActive)
  ) {
    await signOutIfPresent(ports, localUserId);
    if (current.localUserId && current.localUserId !== localUserId) {
      await ports.signOutLocal(current.localUserId);
    }
    return fail("grant", "identity link is revoked");
  }
  return null;
}

async function persistPlatformDisable(
  ports: SsoPorts,
  existing: IdentityLink | null,
  platformUserId: string
): Promise<void> {
  const row = existing ?? revokedPlatformTombstone(platformUserId);
  const saved = await ports.saveLink(applyPlatformRevoke(row));
  let live = await ports.findLinkByPlatformUserId(platformUserId);
  if (saved === "exists" || saved === "stale" || live?.grantActive) {
    if (live) {
      await ports.saveLink(applyPlatformRevoke(live));
      live = await ports.findLinkByPlatformUserId(platformUserId);
    }
  }
  if (!live || live.grantActive) {
    throw new Error("platform revoke did not persist");
  }
  await signOutIfPresent(ports, live.localUserId);
  if (row.localUserId && row.localUserId !== live.localUserId) {
    await signOutIfPresent(ports, row.localUserId);
  }
}

export async function consumeLaunchToken(
  token: string,
  cfg: JwtVerifyConfig,
  portsSource: SsoPortsSource
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

  const ports = resolvePorts(portsSource);

  if (claims.grant !== true) {
    await persistPlatformDisable(
      ports,
      await ports.findLinkByPlatformUserId(claims.sub),
      claims.sub
    );
    await ports.consumeJti(claims.jti, claims.exp);
    return fail("grant", "platform grant is not active");
  }

  const existingForDisable = await ports.findLinkByPlatformUserId(claims.sub);

  if (ports.checkLiveGrant) {
    const live = await ports.checkLiveGrant(claims.sub);
    if (live.status === "unknown") {
      return fail("failed", "platform grant check unavailable");
    }
    if (live.status === "confirmed" && live.granted === false) {
      await persistPlatformDisable(ports, existingForDisable, claims.sub);
      await ports.consumeJti(claims.jti, claims.exp);
      return fail("grant", "platform grant check failed");
    }
  }

  const links = await ports.listLinks();
  const existing =
    existingForDisable ??
    resolveLinkForLaunch({
      platformUserId: claims.sub,
      jwtEmail: claims.email,
      links,
    });

  if (existing?.linkStatus === "revoked") {
    await signOutIfPresent(ports, existing.localUserId);
    await ports.consumeJti(claims.jti, claims.exp);
    return fail("grant", "identity link is revoked; admin re-link required");
  }

  if (existing && grantBlockedByStaleLaunch(existing, claims.iat)) {
    await signOutIfPresent(ports, existing.localUserId);
    await ports.consumeJti(claims.jti, claims.exp);
    return fail("grant", "launch token predates platform revoke");
  }

  const jti = await ports.consumeJti(claims.jti, claims.exp);
  if (jti === "replay") {
    return fail("replay", "launch token already used");
  }

  const decision = decideJit({
    platformUserId: claims.sub,
    displayName: claims.name,
    existing,
  });

  let localUserId: string;
  let created = false;

  if (decision.action === "reuse" && decision.link?.localUserId) {
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

  const expectedRevokedAt = existing?.revokedAt ?? null;
  const saved = await ports.saveLink(link, { expectedRevokedAt });
  if (saved === "stale") {
    const current = await ports.findLinkByPlatformUserId(claims.sub);
    // CAS miss can be a concurrent restore (revoked_at T → null) or a revoke.
    // Only sign out if the live row is still revoked.
    if (
      current?.grantActive &&
      current.linkStatus !== "revoked" &&
      current.localUserId
    ) {
      localUserId = current.localUserId;
      created = false;
    } else {
      await signOutIfPresent(ports, localUserId);
      if (current?.localUserId && current.localUserId !== localUserId) {
        await ports.signOutLocal(current.localUserId);
      }
      return fail("grant", "launch lost to concurrent revoke");
    }
  }
  if (saved === "exists") {
    const winner = await ports.findLinkByPlatformUserId(claims.sub);
    if (!winner) {
      return fail("conflict", LOCAL_ACCOUNT_TAKEN_MESSAGE);
    }
    if (
      winner.linkStatus === "revoked" ||
      grantBlockedByStaleLaunch(winner, claims.iat) ||
      !winner.localUserId ||
      !canOpenFromPlatformGrant({ link: winner, platformGrant: true })
    ) {
      await signOutIfPresent(ports, localUserId);
      await signOutIfPresent(ports, winner.localUserId);
      return fail("grant", "identity link is revoked");
    }
    localUserId = winner.localUserId;
    created = false;
  }

  const blocked = await abortIfConcurrentRevoke(ports, claims.sub, localUserId, claims.iat);
  if (blocked) return blocked;

  await ports.openSession(localUserId);

  const blockedAfterSession = await abortIfConcurrentRevoke(
    ports,
    claims.sub,
    localUserId,
    claims.iat
  );
  if (blockedAfterSession) return blockedAfterSession;

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
  portsSource: SsoPortsSource
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

  const ports = resolvePorts(portsSource);

  if (claims.grant !== false) {
    return fail("invalid", "revoke token must set grant=false");
  }

  await persistPlatformDisable(
    ports,
    await ports.findLinkByPlatformUserId(claims.sub),
    claims.sub
  );

  await ports.consumeJti(`revoke:${claims.jti}`, claims.exp);
  return { ok: true, platformUserId: claims.sub };
}
