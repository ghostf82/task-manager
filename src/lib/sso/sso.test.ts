import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import {
  LAUNCH_SUCCESS_PATH,
  LAUNCH_TOKEN_FIELD,
  PORTAL_ISSUER,
  PROGRAM_AUDIENCE,
  PROGRAM_SLUG,
  isPlatformUserId,
  leastPrivilegeLocalRole,
  programAudience,
  syntheticSsoEmail,
} from "./contract";
import { consumeLaunchToken, consumeRevokeToken } from "./consume";
import {
  applyPlatformGrant,
  applyPlatformRevoke,
  canOpenFromPlatformGrant,
  grantBlockedByStaleLaunch,
  interpretLiveGrantResponse,
  livePlatformAllowsAccess,
  localPasswordLoginAllowed,
  resolveRevokeWriteAfterCas,
  revokedPlatformTombstone,
} from "./grant";
import { isNativeLaunchLanding, launchRedirectStatus, relativeLaunchLocation } from "./http";
import { handleHrLaunch } from "./launch-handler";
import { resolveLinkForLaunch, suggestEmailMatch } from "./identity";
import { decideJit, provisionedLink } from "./jit";
import { LaunchJwtError, parseLaunchClaims, verifyLaunchJwt } from "./launch-jwt";
import { queryCarriesLaunchToken, readLaunchTokenFromParts } from "./launch-request";
import {
  classifyIdentityLinkQueryError,
  isMissingRelation,
  isPlatformGrantBlockingFromLookup,
} from "./lookup";
import {
  isolatedAuthDecision,
  isolatedLoopbackEnabled,
  isolatedLoopbackEnabledForRequest,
  isolatedLoopbackHostFromHeaders,
  isolatedLoopbackRemotePlatform,
  isIsolatedLoopbackHost,
  peekIsolatedSidLive,
} from "./isolated-flag";
import {
  decideAccessSignals,
  fetchPortalAccessSignals,
  interpretAccessSignalsHttp,
} from "./access-signals";
import {
  getIsolatedRuntime,
  mintIsolatedCookie,
  revokeIsolatedSid,
} from "./isolated-loopback";
import { createMemoryPorts } from "./memory-ports";
import { resolveAuthSessionMint, revokeSessionsForUserId } from "./sessions";

const SECRET = new TextEncoder().encode("preview-task-sso-secret-not-prod");
const cfg = {
  issuer: PORTAL_ISSUER,
  audience: PROGRAM_AUDIENCE,
  secret: SECRET,
  maxTtlSeconds: 60,
};

function platformUserId() {
  return randomUUID();
}

async function signToken(
  claims: Record<string, unknown>,
  extra?: { exp?: string; iatOffsetSec?: number; sub?: string; jti?: string }
) {
  const sub = extra?.sub ?? platformUserId();
  const now = Math.floor(Date.now() / 1000);
  const iat = extra?.iatOffsetSec != null ? now + extra.iatOffsetSec : now;
  const jwt = new SignJWT({
    slug: PROGRAM_SLUG,
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(PORTAL_ISSUER)
    .setAudience(PROGRAM_AUDIENCE)
    .setJti(extra?.jti ?? randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(extra?.exp ?? iat + 60);
  return { token: await jwt.sign(SECRET), sub };
}

describe("launch JWT contract", () => {
  it("requires sub to be platform_user_id UUID, not email", async () => {
    const { token, sub } = await signToken({});
    const claims = await verifyLaunchJwt(token, cfg);
    expect(isPlatformUserId(claims.sub)).toBe(true);
    expect(claims.sub).toBe(sub);
    expect(claims.sub.includes("@")).toBe(false);
    expect(claims.slug).toBe("taskmanager");
    expect(claims.program).toBe("taskmanager");
    expect(claims.grant).toBe(true);
    expect(claims.iss).toBe(PORTAL_ISSUER);
    expect(claims.aud).toBe(PROGRAM_AUDIENCE);
  });

  it("accepts a portal token without a grant claim", async () => {
    const { token } = await signToken({});
    const claims = await verifyLaunchJwt(token, cfg);
    expect(claims.grant).toBe(true);
    expect(claims.slug).toBe(PROGRAM_SLUG);
  });

  it("rejects an email as sub", () => {
    expect(() =>
      parseLaunchClaims(
        {
          sub: "asm@smsh.com.sa",
          iss: PORTAL_ISSUER,
          aud: PROGRAM_AUDIENCE,
          exp: Math.floor(Date.now() / 1000) + 60,
          iat: Math.floor(Date.now() / 1000),
          jti: "j1",
          slug: PROGRAM_SLUG,
        },
        cfg
      )
    ).toThrow(LaunchJwtError);
  });

  it("rejects expired tokens and ttl above max", async () => {
    const expired = await signToken({}, { exp: "0s" });
    await expect(verifyLaunchJwt(expired.token, cfg)).rejects.toMatchObject({
      code: expect.stringMatching(/expired|invalid/),
    });

    const long = await new SignJWT({ slug: PROGRAM_SLUG })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(platformUserId())
      .setIssuer(PORTAL_ISSUER)
      .setAudience(PROGRAM_AUDIENCE)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(SECRET);
    await expect(verifyLaunchJwt(long, cfg)).rejects.toMatchObject({ code: "invalid" });
  });

  it("rejects wrong audience", async () => {
    const token = await new SignJWT({ slug: "attendance" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(platformUserId())
      .setIssuer(PORTAL_ISSUER)
      .setAudience(programAudience("attendance"))
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(SECRET);
    await expect(verifyLaunchJwt(token, cfg)).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("launch_token form field", () => {
  it("reads launch_token ahead of the token alias", () => {
    const form = new Map<string, string>([
      [LAUNCH_TOKEN_FIELD, "from-launch"],
      ["token", "from-token"],
    ]);
    expect(
      readLaunchTokenFromParts({
        method: "POST",
        formGet: (name) => form.get(name) ?? null,
      })
    ).toBe("from-launch");
  });

  it("does not read query-string tokens and flags them as rejected", () => {
    const query = new URLSearchParams({ [LAUNCH_TOKEN_FIELD]: "from-query" });
    expect(queryCarriesLaunchToken(query)).toBe(true);
    expect(queryCarriesLaunchToken(new URLSearchParams({ token: "from-token" }))).toBe(true);
    expect(
      readLaunchTokenFromParts({
        method: "POST",
        query,
        formGet: (name) => (name === LAUNCH_TOKEN_FIELD ? "from-form" : null),
      })
    ).toBe("");
  });
});

describe("identity_links", () => {
  it("does not auto-link by email even when a local user shares the JWT email", () => {
    const platformUserIdValue = platformUserId();
    const localByEmail = new Map([["asm@smsh.com.sa", "local-asm-existing"]]);
    const suggestion = suggestEmailMatch({
      jwtEmail: "asm@smsh.com.sa",
      localUsersByEmail: localByEmail,
    });
    expect(suggestion).toEqual({ localUserId: "local-asm-existing", autoLinked: false });
    const resolved = resolveLinkForLaunch({
      platformUserId: platformUserIdValue,
      jwtEmail: "asm@smsh.com.sa",
      links: [],
      localUsersByEmail: localByEmail,
    });
    expect(resolved).toBeNull();
  });

  it("reuses an existing link keyed by platform_user_id", () => {
    const id = platformUserId();
    const link = {
      platformUserId: id,
      localUserId: "local-1",
      localRole: "employee",
      linkStatus: "provisioned" as const,
      grantActive: true,
      suggestedBy: "jit" as const,
    };
    expect(
      resolveLinkForLaunch({
        platformUserId: id,
        jwtEmail: "other@example.com",
        links: [link],
      })
    ).toEqual(link);
  });
});

describe("JIT least privilege", () => {
  it("creates employee, never super_admin, and never copies a password", () => {
    const id = platformUserId();
    const decision = decideJit({
      platformUserId: id,
      displayName: "Asm",
      existing: null,
      jwtRole: "super_admin",
    });
    expect(decision.action).toBe("create");
    expect(decision.spec?.localRole).toBe(leastPrivilegeLocalRole());
    expect(decision.spec?.localRole).toBe("employee");
    expect(decision.spec?.isSuperAdmin).toBe(false);
    expect(decision.spec?.copyPassword).toBe(false);
    expect(decision.spec?.joinKey).toBe("platform_user_id");
    expect(decision.spec?.email).toBe(syntheticSsoEmail(id));
    expect(JSON.stringify(decision.spec)).not.toContain("123456");
    expect(decision.spec && "password" in decision.spec).toBe(false);
  });

  it("is idempotent for the same platform_user_id", () => {
    const id = platformUserId();
    const first = decideJit({ platformUserId: id, existing: null });
    expect(first.action).toBe("create");
    const existing = {
      platformUserId: id,
      localUserId: "already",
      localRole: "employee",
      linkStatus: "provisioned" as const,
      grantActive: true,
      suggestedBy: "jit" as const,
    };
    const second = decideJit({ platformUserId: id, existing });
    expect(second.action).toBe("reuse");
    expect(second.link?.localUserId).toBe("already");
  });
});

describe("consume launch + revoke", () => {
  it("JITs once, then reuses, and ignores JWT email as a join key", async () => {
    const { ports, state } = createMemoryPorts();
    const existingLocal = "already-local";
    state.users.set(existingLocal, {
      email: "asm@smsh.com.sa",
      isSuperAdmin: true,
      passwordCopied: false,
    });

    const { token, sub } = await signToken({
      email: "asm@smsh.com.sa",
      name: "Asm",
      role: "tenant_admin",
    });
    const first = await consumeLaunchToken(token, cfg, ports);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.created).toBe(true);
    expect(first.localUserId).not.toBe(existingLocal);
    expect(state.users.get(first.localUserId)?.isSuperAdmin).toBe(false);
    expect(state.users.get(first.localUserId)?.passwordCopied).toBe(false);
    expect(state.sessions.has(first.localUserId)).toBe(true);
    expect(state.links[0]?.platformUserId).toBe(sub);
    expect(state.links[0]?.localRole).toBe("employee");

    const { token: again } = await signToken({ email: "asm@smsh.com.sa" }, { sub });
    const second = await consumeLaunchToken(again, cfg, ports);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.created).toBe(false);
    expect(second.localUserId).toBe(first.localUserId);
    expect(state.links).toHaveLength(1);
  });

  it("rejects replayed jti", async () => {
    const { ports } = createMemoryPorts();
    const jti = randomUUID();
    const { token } = await signToken({}, { jti });
    const first = await consumeLaunchToken(token, cfg, ports);
    expect(first.ok).toBe(true);
    const second = await consumeLaunchToken(token, cfg, ports);
    expect(second).toMatchObject({ ok: false, code: "replay" });
  });

  it("launch with grant=false revokes and signs out; password fallback is refused", async () => {
    const { ports, state } = createMemoryPorts();
    const { token, sub } = await signToken({ grant: true });
    const launched = await consumeLaunchToken(token, cfg, ports);
    expect(launched.ok).toBe(true);
    if (!launched.ok) return;

    const { token: revoke } = await signToken({ grant: false }, { sub });
    const revoked = await consumeRevokeToken(revoke, cfg, ports);
    expect(revoked.ok).toBe(true);
    expect(state.links[0]?.grantActive).toBe(false);
    expect(state.links[0]?.localUserId).toBe(launched.localUserId);
    expect(state.sessions.has(launched.localUserId)).toBe(false);
    expect(state.signedOut).toContain(launched.localUserId);

    expect(
      canOpenFromPlatformGrant({
        link: state.links[0]!,
        platformGrant: false,
      })
    ).toBe(false);
    expect(
      localPasswordLoginAllowed({
        link: state.links[0]!,
        platformGrant: false,
      })
    ).toBe(false);

    const { token: relauch } = await signToken({ grant: true }, { sub });
    const back = await consumeLaunchToken(relauch, cfg, ports);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.created).toBe(false);
    expect(back.localUserId).toBe(launched.localUserId);
    expect(state.links[0]?.grantActive).toBe(true);
    expect(state.links[0]?.revokedAt).toBeNull();
  });

  it("persists a platform_user_id tombstone so unused launch JWT cannot JIT after revoke", async () => {
    const { ports, state } = createMemoryPorts();
    const { token: unused, sub } = await signToken({}, { iatOffsetSec: -10 });
    const { token: revoke } = await signToken({ grant: false }, { sub });
    expect(await consumeRevokeToken(revoke, cfg, ports)).toMatchObject({ ok: true });
    expect(state.links[0]?.platformUserId).toBe(sub);
    expect(state.links[0]?.localUserId).toBeNull();
    expect(state.links[0]?.grantActive).toBe(false);
    expect(state.links[0]?.revokedAt).toBeGreaterThan(0);
    expect(state.users.size).toBe(0);

    const blocked = await consumeLaunchToken(unused, cfg, ports);
    expect(blocked).toMatchObject({ ok: false, code: "grant" });
    expect(state.users.size).toBe(0);
    expect(state.sessions.size).toBe(0);
    expect(state.links[0]?.grantActive).toBe(false);
    expect(state.links[0]?.localUserId).toBeNull();

    const { token: fresh } = await signToken({}, { sub });
    const restored = await consumeLaunchToken(fresh, cfg, ports);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.created).toBe(true);
    expect(state.links[0]?.localUserId).toBe(restored.localUserId);
    expect(state.links[0]?.grantActive).toBe(true);
  });

  it("does not let a tombstone null out an existing local_user_id", async () => {
    const { ports, state } = createMemoryPorts();
    const { token, sub } = await signToken({});
    const launched = await consumeLaunchToken(token, cfg, ports);
    expect(launched.ok).toBe(true);
    if (!launched.ok) return;

    expect(await ports.saveLink(revokedPlatformTombstone(sub))).toBe("exists");
    expect(state.links[0]?.localUserId).toBe(launched.localUserId);
    expect(state.links[0]?.grantActive).toBe(true);

    const { token: revoke } = await signToken({ grant: false }, { sub });
    expect(await consumeRevokeToken(revoke, cfg, ports)).toMatchObject({ ok: true });
    expect(state.links[0]?.localUserId).toBe(launched.localUserId);
    expect(state.links[0]?.grantActive).toBe(false);
    expect(state.sessions.has(launched.localUserId)).toBe(false);
  });

  it("revokes and signs out a concurrent first-launch user instead of a null tombstone", async () => {
    const { ports, state } = createMemoryPorts();
    const sub = platformUserId();
    const concurrentLocal = randomUUID();
    const originalSave = ports.saveLink;
    ports.saveLink = async (link, cas) => {
      if (!link.localUserId && !state.links.length) {
        state.links.push({
          platformUserId: sub,
          localUserId: concurrentLocal,
          localRole: "employee",
          linkStatus: "provisioned",
          grantActive: true,
          suggestedBy: "jit",
        });
        state.sessions.add(concurrentLocal);
      }
      return originalSave(link, cas);
    };

    const { token: revoke } = await signToken({ grant: false }, { sub });
    expect(await consumeRevokeToken(revoke, cfg, ports)).toMatchObject({ ok: true });
    expect(state.links[0]?.localUserId).toBe(concurrentLocal);
    expect(state.links[0]?.grantActive).toBe(false);
    expect(state.sessions.has(concurrentLocal)).toBe(false);
  });

  it("does not consume revoke jti if a concurrent launch keeps grant active", async () => {
    const { ports, state } = createMemoryPorts();
    const { token, sub } = await signToken({});
    const launched = await consumeLaunchToken(token, cfg, ports);
    expect(launched.ok).toBe(true);
    if (!launched.ok) return;
    const jtis = state.jtis.size;
    const originalSave = ports.saveLink;
    ports.saveLink = async (link, cas) => {
      const saved = await originalSave(link, cas);
      if (!link.grantActive && state.links[0]) {
        state.links[0] = applyPlatformGrant(state.links[0]!);
        state.sessions.add(state.links[0]!.localUserId ?? launched.localUserId);
      }
      return saved;
    };
    const { token: revoke } = await signToken({ grant: false }, { sub });
    await expect(consumeRevokeToken(revoke, cfg, ports)).rejects.toThrow(
      /platform revoke did not persist/
    );
    expect(state.jtis.size).toBe(jtis);
    expect(state.links[0]?.grantActive).toBe(true);
  });

  it("does not restore grant from an unused JWT issued before revoked_at", async () => {
    const { ports, state } = createMemoryPorts();
    const { token, sub } = await signToken({});
    const launched = await consumeLaunchToken(token, cfg, ports);
    expect(launched.ok).toBe(true);
    if (!launched.ok) return;

    const { token: stale } = await signToken({}, { sub, iatOffsetSec: -10 });
    const { token: revoke } = await signToken({ grant: false }, { sub });
    expect(await consumeRevokeToken(revoke, cfg, ports)).toMatchObject({ ok: true });
    expect(state.links[0]?.grantActive).toBe(false);
    expect(state.links[0]?.revokedAt).toBeGreaterThan(0);
    expect(
      grantBlockedByStaleLaunch(state.links[0]!, Math.floor(Date.now() / 1000) - 10)
    ).toBe(true);

    const blocked = await consumeLaunchToken(stale, cfg, ports);
    expect(blocked).toMatchObject({ ok: false, code: "grant" });
    expect(state.links[0]?.grantActive).toBe(false);
    expect(
      localPasswordLoginAllowed({ link: state.links[0]!, platformGrant: false })
    ).toBe(false);
  });

  it("does not flip a revoked identity link to provisioned on grant:true launch", async () => {
    const sub = platformUserId();
    const localUserId = randomUUID();
    const { ports, state } = createMemoryPorts({
      links: [
        {
          platformUserId: sub,
          localUserId,
          localRole: "employee",
          linkStatus: "revoked",
          grantActive: false,
          suggestedBy: "jit",
        },
      ],
      sessions: new Set([localUserId]),
    });
    const flipped = provisionedLink({
      platformUserId: sub,
      localUserId,
      existing: state.links[0],
    });
    expect(flipped.linkStatus).toBe("revoked");
    expect(flipped.grantActive).toBe(false);

    const { token } = await signToken({ grant: true }, { sub });
    const result = await consumeLaunchToken(token, cfg, ports);
    expect(result).toMatchObject({ ok: false, code: "grant" });
    expect(state.links[0]?.linkStatus).toBe("revoked");
    expect(state.links[0]?.grantActive).toBe(false);
    expect(state.sessions.has(localUserId)).toBe(false);
  });

  it("keeps the identity row on revoke (no local user delete)", () => {
    const link = applyPlatformRevoke({
      platformUserId: platformUserId(),
      localUserId: "keep-me",
      localRole: "employee",
      linkStatus: "provisioned",
      grantActive: true,
      suggestedBy: "jit",
    });
    expect(link.localUserId).toBe("keep-me");
    expect(link.grantActive).toBe(false);
    expect(link.linkStatus).toBe("provisioned");
    expect(link.revokedAt).toBeGreaterThan(0);
  });

  it("refuses to attach one local account to a second platform_user_id", async () => {
    const takenLocal = randomUUID();
    const owner = platformUserId();
    const { ports } = createMemoryPorts({
      links: [
        {
          platformUserId: owner,
          localUserId: takenLocal,
          localRole: "employee",
          linkStatus: "provisioned",
          grantActive: true,
          suggestedBy: "jit",
        },
      ],
    });
    ports.createLocalUser = async () => ({
      localUserId: takenLocal,
      email: "dup@sso.taskmanager.local",
    });
    const { token } = await signToken({});
    const result = await consumeLaunchToken(token, cfg, ports);
    expect(result).toMatchObject({ ok: false, code: "conflict" });
  });

  it("refuses launch when live platform grant is false", async () => {
    const { ports, state } = createMemoryPorts();
    const { token, sub } = await signToken({});
    state.liveGrant.set(sub, false);
    const result = await consumeLaunchToken(token, cfg, ports);
    expect(result).toMatchObject({ ok: false, code: "grant" });
    expect(state.sessions.size).toBe(0);
  });

  it("does not open a session for a losing concurrent JIT user", async () => {
    const sub = platformUserId();
    const { ports, state } = createMemoryPorts();
    const originalCreate = ports.createLocalUser;
    ports.createLocalUser = async (spec) => {
      const created = await originalCreate(spec);
      state.links.push({
        platformUserId: sub,
        localUserId: "winner-local",
        localRole: "employee",
        linkStatus: "provisioned",
        grantActive: true,
        suggestedBy: "jit",
      });
      return created;
    };
    const { token } = await signToken({}, { sub });
    const result = await consumeLaunchToken(token, cfg, ports);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.localUserId).toBe("winner-local");
    expect(result.created).toBe(false);
    expect(state.sessions.has("winner-local")).toBe(true);
    expect([...state.sessions]).toEqual(["winner-local"]);
  });

  it("does not consume revoke jti if session delete fails", async () => {
    const { ports, state } = createMemoryPorts();
    const { token, sub } = await signToken({});
    const launched = await consumeLaunchToken(token, cfg, ports);
    expect(launched.ok).toBe(true);
    const launchJtis = state.jtis.size;
    ports.signOutLocal = async () => {
      throw new Error("session revoke failed: 404");
    };
    const { token: revoke } = await signToken({ grant: false }, { sub });
    await expect(consumeRevokeToken(revoke, cfg, ports)).rejects.toThrow(
      /session revoke failed: 404/
    );
    expect(state.jtis.size).toBe(launchJtis);
  });

  it("does not persist revoke or consume jti when live grant check is unknown", async () => {
    const { ports, state } = createMemoryPorts();
    const { token, sub } = await signToken({});
    const launched = await consumeLaunchToken(token, cfg, ports);
    expect(launched.ok).toBe(true);
    if (!launched.ok) return;
    const jtis = state.jtis.size;
    state.liveGrant.set(sub, "unknown");
    const { token: again } = await signToken({}, { sub });
    const result = await consumeLaunchToken(again, cfg, ports);
    expect(result).toMatchObject({ ok: false, code: "failed" });
    expect(state.links[0]?.grantActive).toBe(true);
    expect(state.links[0]?.revokedAt ?? null).toBeNull();
    expect(state.jtis.size).toBe(jtis);
    expect(
      isPlatformGrantBlockingFromLookup({
        status: "unavailable",
        reason: "live grant unknown",
      })
    ).toBe(true);
  });

  it("does not let a launch that started before revoke clear revoked_at", async () => {
    const { ports, state } = createMemoryPorts();
    const { token, sub } = await signToken({});
    const launched = await consumeLaunchToken(token, cfg, ports);
    expect(launched.ok).toBe(true);
    if (!launched.ok) return;

    const originalSave = ports.saveLink;
    ports.saveLink = async (link, cas) => {
      if (link.grantActive && state.links[0]) {
        state.links[0] = applyPlatformRevoke(state.links[0]!);
      }
      return originalSave(link, cas);
    };

    const { token: again } = await signToken({}, { sub });
    const result = await consumeLaunchToken(again, cfg, ports);
    expect(result).toMatchObject({ ok: false, code: "grant" });
    expect(state.links[0]?.grantActive).toBe(false);
    expect(state.links[0]?.revokedAt).toBeGreaterThan(0);
    expect(state.sessions.has(launched.localUserId)).toBe(false);
  });

  it("does not sign out a concurrent launch that already restored grant", async () => {
    const { ports, state } = createMemoryPorts();
    const { token, sub } = await signToken({});
    const launched = await consumeLaunchToken(token, cfg, ports);
    expect(launched.ok).toBe(true);
    if (!launched.ok) return;

    const { token: revoke } = await signToken({ grant: false }, { sub });
    expect(await consumeRevokeToken(revoke, cfg, ports)).toMatchObject({ ok: true });
    expect(state.sessions.has(launched.localUserId)).toBe(false);

    const originalSave = ports.saveLink;
    ports.saveLink = async (link, cas) => {
      if (link.grantActive && state.links[0]) {
        state.links[0] = applyPlatformGrant(state.links[0]!);
        const winnerId = state.links[0]!.localUserId;
        if (winnerId) state.sessions.add(winnerId);
      }
      return originalSave(link, cas);
    };

    const { token: again } = await signToken({}, { sub });
    const result = await consumeLaunchToken(again, cfg, ports);
    expect(result.ok).toBe(true);
    expect(state.links[0]?.grantActive).toBe(true);
    expect(state.links[0]?.revokedAt ?? null).toBeNull();
    expect(state.sessions.has(launched.localUserId)).toBe(true);
  });

  it("persists disable and signs out when live platform grant is revoked after launch", async () => {
    const { ports, state } = createMemoryPorts();
    const { token, sub } = await signToken({});
    const launched = await consumeLaunchToken(token, cfg, ports);
    expect(launched.ok).toBe(true);
    if (!launched.ok) return;
    state.liveGrant.set(sub, false);
    const { token: again } = await signToken({}, { sub });
    const result = await consumeLaunchToken(again, cfg, ports);
    expect(result).toMatchObject({ ok: false, code: "grant" });
    expect(state.links[0]?.grantActive).toBe(false);
    expect(state.links[0]?.revokedAt).toBeGreaterThan(0);
    expect(state.sessions.has(launched.localUserId)).toBe(false);
    expect(
      localPasswordLoginAllowed({ link: state.links[0]!, platformGrant: false })
    ).toBe(false);
  });
});

describe("live platform grant body", () => {
  it("requires program grant true and does not treat membership disable as access", () => {
    expect(livePlatformAllowsAccess({ grant: true })).toBe(true);
    expect(livePlatformAllowsAccess({ grant: true, membership: false })).toBe(false);
    expect(livePlatformAllowsAccess({ grant: true, disabled: true })).toBe(false);
    expect(livePlatformAllowsAccess({ grant: false })).toBe(false);
    expect(livePlatformAllowsAccess({ granted: true, active: false })).toBe(false);
  });

  it("treats portal HTTP errors and malformed bodies as unknown, not confirmed false", () => {
    expect(interpretLiveGrantResponse({ httpOk: false, body: { grant: false } })).toEqual({
      status: "unknown",
    });
    expect(interpretLiveGrantResponse({ httpOk: true, body: "not-json-object" })).toEqual({
      status: "unknown",
    });
    expect(interpretLiveGrantResponse({ httpOk: true, body: null })).toEqual({
      status: "unknown",
    });
    expect(interpretLiveGrantResponse({ httpOk: true, body: {} })).toEqual({
      status: "unknown",
    });
    expect(interpretLiveGrantResponse({ httpOk: true, body: [] })).toEqual({
      status: "unknown",
    });
    expect(interpretLiveGrantResponse({ httpOk: true, body: { status: "ok" } })).toEqual({
      status: "unknown",
    });
    expect(interpretLiveGrantResponse({ httpOk: true, body: { grant: false } })).toEqual({
      status: "confirmed",
      granted: false,
    });
    expect(interpretLiveGrantResponse({ httpOk: true, body: { grant: true } })).toEqual({
      status: "confirmed",
      granted: true,
    });
  });
});

describe("session mint identity", () => {
  it("binds GoTrue mint to auth user id and ignores mutable profile email", () => {
    const localUserId = randomUUID();
    const minted = resolveAuthSessionMint({
      localUserId,
      authUser: { id: localUserId, email: "sso.user@sso.taskmanager.local" },
      profileEmail: "super-admin@example.com",
    });
    expect(minted).toEqual({
      localUserId,
      authEmail: "sso.user@sso.taskmanager.local",
    });
    expect(() =>
      resolveAuthSessionMint({
        localUserId,
        authUser: { id: randomUUID(), email: "super-admin@example.com" },
        profileEmail: "super-admin@example.com",
      })
    ).toThrow(/auth user id/);
  });
});

describe("grant lookup fail-closed", () => {
  const pgrst205 = {
    code: "PGRST205",
    message:
      "Could not find the table 'public.platform_identity_links' in the schema cache",
  };
  const undefinedTable = {
    code: "42P01",
    message: 'relation "platform_identity_links" does not exist',
  };

  it("treats lookup errors as blocked, not as unlinked", () => {
    expect(
      isPlatformGrantBlockingFromLookup({
        status: "found",
        dropSession: true,
        link: {
          platformUserId: platformUserId(),
          localUserId: "u1",
          localRole: "employee",
          linkStatus: "linked",
          grantActive: true,
          suggestedBy: "jit",
        },
      })
    ).toBe(true);
    expect(
      isPlatformGrantBlockingFromLookup({
        status: "unavailable",
        reason: "connection reset",
      })
    ).toBe(true);
    expect(isPlatformGrantBlockingFromLookup({ status: "missing" })).toBe(false);
    expect(
      isPlatformGrantBlockingFromLookup({
        status: "found",
        link: {
          platformUserId: platformUserId(),
          localUserId: "u1",
          localRole: "employee",
          linkStatus: "revoked",
          grantActive: false,
          suggestedBy: "jit",
        },
      })
    ).toBe(true);
  });

  it("treats PostgREST PGRST205 as a missing table, not a real query failure", () => {
    expect(isMissingRelation(pgrst205)).toBe(true);
    expect(isMissingRelation(undefinedTable)).toBe(true);
    expect(isMissingRelation({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingRelation({ code: "PGRST116", message: "JSON object requested" })).toBe(
      false
    );
  });

  it("does not lock out password login when SSO is off and the table is missing", () => {
    const lookup = classifyIdentityLinkQueryError(pgrst205, false);
    expect(lookup).toEqual({ status: "missing" });
    expect(isPlatformGrantBlockingFromLookup(lookup)).toBe(false);
    expect(
      isPlatformGrantBlockingFromLookup(classifyIdentityLinkQueryError(undefinedTable, false))
    ).toBe(false);
  });

  it("fails closed when SSO is on, even if the table is missing", () => {
    const lookup = classifyIdentityLinkQueryError(pgrst205, true);
    expect(lookup.status).toBe("unavailable");
    expect(isPlatformGrantBlockingFromLookup(lookup)).toBe(true);
  });

  it("fails closed on real DB errors even when SSO is off", () => {
    const lookup = classifyIdentityLinkQueryError(
      { code: "42501", message: "permission denied for table platform_identity_links" },
      false
    );
    expect(lookup.status).toBe("unavailable");
    expect(isPlatformGrantBlockingFromLookup(lookup)).toBe(true);
    expect(
      isPlatformGrantBlockingFromLookup({
        status: "unavailable",
        reason: "connection reset",
      })
    ).toBe(true);
  });
});

describe("POST launch redirect", () => {
  it("uses 303 for POST and 307 for GET", () => {
    expect(launchRedirectStatus("POST")).toBe(303);
    expect(launchRedirectStatus("GET")).toBe(307);
  });

  it("lands on native /dashboard, not an SSO proof page", async () => {
    expect(LAUNCH_SUCCESS_PATH).toBe("/dashboard");
    expect(isNativeLaunchLanding(LAUNCH_SUCCESS_PATH)).toBe(true);
    expect(isNativeLaunchLanding("/sso/proof")).toBe(false);
    expect(isNativeLaunchLanding("/login")).toBe(false);

    const { ports } = createMemoryPorts();
    const { token } = await signToken({ grant: true });
    const request = new Request("http://127.0.0.1:3012/auth/hr-launch", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ [LAUNCH_TOKEN_FIELD]: token }).toString(),
    });
    const { NextRequest } = await import("next/server");
    const res = await handleHrLaunch(new NextRequest(request), {
      jwtConfig: cfg,
      ports,
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/dashboard");
    expect(relativeLaunchLocation("/dashboard")).toBe("/dashboard");
    expect(() => relativeLaunchLocation("http://localhost:3012/dashboard")).toThrow(
      /origin-relative/
    );
    const loc = new URL(res.headers.get("location") ?? "", "http://127.0.0.1:3012");
    expect(loc.pathname).toBe("/dashboard");
    expect(loc.host).toBe("127.0.0.1:3012");
    expect(isNativeLaunchLanding(loc.pathname)).toBe(true);
    expect(loc.pathname).not.toMatch(/proof|iam-sso/i);
    const html = await res.text();
    expect(html).not.toMatch(/دخول موحّد من بوابة الموارد البشرية/);
  });
});

describe("session revoke by user id", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  it("calls sso_revoke_local_sessions with the user UUID, not auth.admin.signOut", async () => {
    const calls: unknown[] = [];
    await revokeSessionsForUserId(
      {
        async rpc(fn, args) {
          calls.push([fn, args]);
          return { error: null };
        },
      },
      userId
    );
    expect(calls).toEqual([["sso_revoke_local_sessions", { p_user: userId }]]);
  });

  it("does not treat REST 404 as a successful revoke when SQL revoke failed", async () => {
    const prev = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
    try {
      const failingRpc = {
        async rpc() {
          return { error: { code: "PGRST202", message: "function missing" } };
        },
      };
      await expect(
        revokeSessionsForUserId(failingRpc, userId, (async () =>
          new Response("", { status: 404 })
        ) as typeof fetch)
      ).rejects.toThrow(/session revoke failed: 404/);

      await expect(
        revokeSessionsForUserId(failingRpc, userId, (async () =>
          new Response("", { status: 200 })
        ) as typeof fetch)
      ).resolves.toBeUndefined();
    } finally {
      if (prev.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.url;
      if (prev.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prev.anon;
      if (prev.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.key;
    }
  });
});

describe("preview SQL", () => {
  it("is labeled non-production and stores platform_user_id not email as the join key", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/staging-only/20261124150000_iam_preview_sso_adapter.sql"
      ),
      "utf8"
    );
    expect(sql).toMatch(/PREVIEW \/ STAGING ONLY/i);
    expect(sql).toMatch(/Do not apply to Production/i);
    expect(sql).toContain("platform_user_id");
    expect(sql).toContain("platform_identity_links_local_unique");
    expect(sql).toContain("platform_sso_jti");
    expect(sql).toContain("sso_revoke_local_sessions");
    expect(sql).toContain("revoked_at");
    expect(sql).toMatch(/alter column local_user_id drop not null/i);
    expect(sql).toMatch(/tombstone/i);
    expect(sql).not.toMatch(/encrypted_password|createUser|123456/);
    expect(sql).toMatch(/never copied/i);
    expect(sql).toMatch(/Email and username are never the durable join key/);
  });
});

describe("isolated loopback session", () => {
  afterEach(() => {
    delete (globalThis as { __tmIsolatedLoopback?: unknown }).__tmIsolatedLoopback;
  });

  it("TM-1: refuses HR_IAM_ISOLATED_LOOPBACK=1 on production and Netlify", () => {
    expect(
      isolatedLoopbackEnabled({
        HR_IAM_ISOLATED_LOOPBACK: "1",
        NODE_ENV: "production",
      })
    ).toBe(false);
    expect(
      isolatedLoopbackEnabled({
        HR_IAM_ISOLATED_LOOPBACK: "1",
        NODE_ENV: "development",
        HR_IAM_ISOLATED_HOST: "127.0.0.1",
        NETLIFY: "true",
      })
    ).toBe(false);
    expect(
      isolatedLoopbackEnabled({
        HR_IAM_ISOLATED_LOOPBACK: "1",
        NODE_ENV: "test",
        NETLIFY: "true",
      })
    ).toBe(false);
    expect(
      isolatedLoopbackEnabled({
        HR_IAM_ISOLATED_LOOPBACK: "1",
        NODE_ENV: "development",
        CONTEXT: "deploy-preview",
        URL: "https://deploy-preview-1--hr-task-manager.netlify.app",
      })
    ).toBe(false);
    expect(
      isolatedLoopbackRemotePlatform({
        NETLIFY: "true",
        URL: "https://hr-task-manager.netlify.app",
      })
    ).toBe(true);
  });

  it("TM-1: allows NODE_ENV=test or an explicit loopback host only", () => {
    expect(
      isolatedLoopbackEnabled({
        HR_IAM_ISOLATED_LOOPBACK: "1",
        NODE_ENV: "test",
      })
    ).toBe(true);
    expect(
      isolatedLoopbackEnabled({
        HR_IAM_ISOLATED_LOOPBACK: "1",
        VITEST: "true",
      })
    ).toBe(true);
    expect(
      isolatedLoopbackEnabled({
        HR_IAM_ISOLATED_LOOPBACK: "1",
        NODE_ENV: "development",
        HR_IAM_ISOLATED_HOST: "127.0.0.1",
      })
    ).toBe(true);
    expect(
      isolatedLoopbackEnabled(
        { HR_IAM_ISOLATED_LOOPBACK: "1", NODE_ENV: "development" },
        "localhost"
      )
    ).toBe(true);
    expect(
      isolatedLoopbackEnabled({
        HR_IAM_ISOLATED_LOOPBACK: "1",
        NODE_ENV: "development",
      })
    ).toBe(false);
    expect(
      isolatedLoopbackEnabled(
        {
          HR_IAM_ISOLATED_LOOPBACK: "1",
          NODE_ENV: "development",
          HR_IAM_ISOLATED_HOST: "127.0.0.1",
        },
        "hr-task-manager.netlify.app"
      )
    ).toBe(false);
    expect(
      isolatedLoopbackEnabled({
        HR_IAM_ISOLATED_LOOPBACK: "1",
        NODE_ENV: "development",
        HR_IAM_ISOLATED_HOST: "evil.example",
      })
    ).toBe(false);
    expect(isolatedLoopbackEnabled({ NODE_ENV: "test" })).toBe(false);
    expect(isIsolatedLoopbackHost("127.0.0.1:3012")).toBe(true);
    expect(isIsolatedLoopbackHost("[::1]:3012")).toBe(true);
    expect(isIsolatedLoopbackHost("hr-task-manager.netlify.app")).toBe(false);
  });

  it("TM-1: middleware Host and RSC headers agree; omitted host is fail-closed", () => {
    const env = {
      HR_IAM_ISOLATED_LOOPBACK: "1",
      NODE_ENV: "development",
    };
    const loopbackHeaders = {
      get(name: string) {
        return name.toLowerCase() === "host" ? "127.0.0.1:3012" : null;
      },
    };
    const localhostHeaders = {
      get(name: string) {
        return name.toLowerCase() === "host" ? "localhost:3012" : null;
      },
    };
    expect(isolatedLoopbackEnabled(env)).toBe(false);
    expect(isolatedLoopbackEnabled(env, loopbackHeaders)).toBe(true);
    expect(isolatedLoopbackEnabled(env, localhostHeaders)).toBe(true);
    expect(
      isolatedLoopbackEnabledForRequest(
        { headers: loopbackHeaders, nextUrl: { hostname: "localhost" } },
        env
      )
    ).toBe(true);
    expect(
      isolatedLoopbackEnabledForRequest(
        { headers: localhostHeaders, nextUrl: { hostname: "localhost" } },
        env
      )
    ).toBe(isolatedLoopbackEnabled(env, localhostHeaders));
    expect(
      isolatedLoopbackHostFromHeaders({
        get(name: string) {
          if (name === "host") return "127.0.0.1:3012";
          if (name === "x-forwarded-host") return "hr-task-manager.netlify.app";
          return null;
        },
      })
    ).toBe("hr-task-manager.netlify.app");
    expect(
      isolatedLoopbackEnabled(
        { ...env, NETLIFY: "true" },
        loopbackHeaders
      )
    ).toBe(false);
    expect(
      isolatedLoopbackEnabled(env, {
        get(name: string) {
          return name === "host" ? "hr-task-manager.netlify.app" : null;
        },
      })
    ).toBe(false);
  });

  it("honors live tm_sso and ignores leftover GoTrue on /login", () => {
    expect(isolatedAuthDecision({ pathname: "/dashboard", tmSso: "sid", live: true })).toBe("next");
    expect(isolatedAuthDecision({ pathname: "/login", tmSso: "sid", live: true })).toBe("dashboard");
    expect(isolatedAuthDecision({ pathname: "/dashboard", tmSso: undefined, live: false })).toBe("login");
    expect(isolatedAuthDecision({ pathname: "/login", tmSso: undefined, live: false })).toBe("next");
    expect(isolatedAuthDecision({ pathname: "/", tmSso: "", live: false })).toBe("next");
  });

  it("does not bounce /login to /dashboard for stale or unknown SIDs", () => {
    expect(isolatedAuthDecision({ pathname: "/login", tmSso: "stale", live: false })).toBe("next");
    expect(isolatedAuthDecision({ pathname: "/dashboard", tmSso: "stale", live: false })).toBe("login");
    expect(isolatedAuthDecision({ pathname: "/login", tmSso: "sid", live: "unknown" })).toBe("next");
    expect(isolatedAuthDecision({ pathname: "/dashboard", tmSso: "sid", live: "unknown" })).toBe("next");
    expect(peekIsolatedSidLive("leftover-after-restart")).toBe("unknown");
  });

  it("treats a SID missing from this isolate's maps as stale", () => {
    const runtime = getIsolatedRuntime();
    const localUserId = randomUUID();
    runtime.state.users.set(localUserId, {
      email: "sso.user@sso.taskmanager.local",
      isSuperAdmin: false,
      passwordCopied: false,
    });
    const sid = mintIsolatedCookie(localUserId);
    expect(peekIsolatedSidLive(sid)).toBe(true);
    expect(isolatedAuthDecision({ pathname: "/login", tmSso: sid, live: true })).toBe("dashboard");
    revokeIsolatedSid(sid);
    expect(peekIsolatedSidLive(sid)).toBe(false);
    expect(isolatedAuthDecision({ pathname: "/login", tmSso: sid, live: false })).toBe("next");
    expect(isolatedAuthDecision({ pathname: "/dashboard", tmSso: sid, live: false })).toBe("login");
  });

  it("clears tm_sso mapping and in-memory session on isolated sign-out", () => {
    const runtime = getIsolatedRuntime();
    const localUserId = randomUUID();
    runtime.state.users.set(localUserId, {
      email: "sso.user@sso.taskmanager.local",
      isSuperAdmin: false,
      passwordCopied: false,
    });
    const sid = mintIsolatedCookie(localUserId);
    expect(runtime.state.sessions.has(localUserId)).toBe(true);
    expect(runtime.cookies.get(sid)).toBe(localUserId);
    revokeIsolatedSid(sid);
    expect(runtime.state.sessions.has(localUserId)).toBe(false);
    expect(runtime.cookies.has(sid)).toBe(false);
    expect(runtime.state.signedOut).toContain(localUserId);
  });
});

describe("portal access_signals poll", () => {
  const platformUserId = "11111111-1111-4111-8111-111111111111";

  it("fails closed on HTTP 404 and does not persist revoke", () => {
    const poll = interpretAccessSignalsHttp({
      status: 404,
      body: { signals: [] },
    });
    expect(poll).toEqual({ status: "unavailable", reason: "access_signals 404" });
    const decision = decideAccessSignals(poll);
    expect(decision.action).toBe("deny");
    if (decision.action === "deny") {
      expect(decision.persistRevoke).toBe(false);
      expect(decision.signOut).toBe(true);
    }
  });

  it("drops leftover session on logout after session start, not before", () => {
    const logout = {
      platform_user_id: platformUserId,
      kind: "logout",
      at: "2026-11-24T20:00:00.000Z",
      program_slug: null,
    };
    const after = decideAccessSignals(
      { status: "ok", signals: [logout] },
      { sessionStartedAt: "2026-11-24T19:00:00.000Z" }
    );
    expect(after.action).toBe("deny");
    if (after.action === "deny") expect(after.persistRevoke).toBe(false);
    expect(
      decideAccessSignals(
        { status: "ok", signals: [logout] },
        { sessionStartedAt: "2026-11-24T21:00:00.000Z" }
      ).action
    ).toBe("allow");
  });

  it("applies logout/revoke and 404 fail-closed when session start is unknown", async () => {
    const logout = {
      platform_user_id: platformUserId,
      kind: "logout",
      at: "2026-11-24T20:00:00.000Z",
      program_slug: null,
    };
    const revoke = {
      platform_user_id: platformUserId,
      kind: "revoke_grant",
      program_slug: "taskmanager",
      at: "2026-11-24T20:00:00.000Z",
    };
    const missingLogout = decideAccessSignals(
      { status: "ok", signals: [logout] },
      { sessionStartedAt: null }
    );
    expect(missingLogout.action).toBe("deny");
    if (missingLogout.action === "deny") {
      expect(missingLogout.persistRevoke).toBe(false);
    }
    const missingRevoke = decideAccessSignals(
      { status: "ok", signals: [revoke] },
      { sessionStartedAt: undefined }
    );
    expect(missingRevoke.action).toBe("deny");
    if (missingRevoke.action === "deny") {
      expect(missingRevoke.persistRevoke).toBe(true);
    }
    const poll404 = interpretAccessSignalsHttp({
      status: 404,
      body: { signals: [] },
    });
    expect(decideAccessSignals(poll404, { sessionStartedAt: null }).action).toBe(
      "deny"
    );
    let fetched = 0;
    const poll = await fetchPortalAccessSignals(
      platformUserId,
      { PLATFORM_SSO_ACCESS_SIGNALS_URL: "https://portal.test/__mock/access-signals" },
      (async () => {
        fetched += 1;
        return new Response("{}", { status: 404 });
      }) as typeof fetch,
      null
    );
    expect(fetched).toBe(1);
    expect(poll.status).toBe("unavailable");
    expect(decideAccessSignals(poll, { sessionStartedAt: null }).action).toBe(
      "deny"
    );
    const failed = await fetchPortalAccessSignals(
      platformUserId,
      { PLATFORM_SSO_ACCESS_SIGNALS_URL: "https://portal.test/__mock/access-signals" },
      (async () => {
        throw new Error("network");
      }) as typeof fetch,
      null
    );
    expect(failed).toEqual({
      status: "unavailable",
      reason: "access_signals fetch failed",
    });
    expect(decideAccessSignals(failed, { sessionStartedAt: null }).action).toBe(
      "deny"
    );
  });

  it("revokes taskmanager grant and ignores other program slugs", () => {
    const started = "2026-11-24T19:00:00.000Z";
    const revokeThis = decideAccessSignals(
      {
        status: "ok",
        signals: [
          {
            platform_user_id: platformUserId,
            kind: "revoke_grant",
            program_slug: "taskmanager",
            at: "2026-11-24T20:00:00.000Z",
          },
        ],
      },
      { sessionStartedAt: started }
    );
    expect(revokeThis.action).toBe("deny");
    if (revokeThis.action === "deny") expect(revokeThis.persistRevoke).toBe(true);
    expect(
      decideAccessSignals(
        {
          status: "ok",
          signals: [
            {
              platform_user_id: platformUserId,
              kind: "revoke_grant",
              program_slug: "attendance",
              at: "2026-11-24T20:00:00.000Z",
            },
          ],
        },
        { sessionStartedAt: started }
      ).action
    ).toBe("allow");
  });

  it("does not overwrite a concurrent grant restore after a stale revoke CAS", () => {
    const snapshot = {
      platformUserId,
      localUserId: "u1",
      localRole: "employee" as const,
      linkStatus: "linked" as const,
      grantActive: false,
      suggestedBy: "jit" as const,
      revokedAt: 1_700_000_000,
    };
    const restored = applyPlatformGrant(snapshot);
    expect((restored.revokedAt ?? null) === (snapshot.revokedAt ?? null)).toBe(
      false
    );
    const lost = resolveRevokeWriteAfterCas({
      snapshot,
      wrote: false,
      live: restored,
    });
    expect(lost.dropSession).toBe(false);
    expect(lost.link.grantActive).toBe(true);
    expect(lost.link.revokedAt ?? null).toBeNull();
    const won = resolveRevokeWriteAfterCas({
      snapshot,
      wrote: true,
      live: applyPlatformRevoke(snapshot),
    });
    expect(won.dropSession).toBe(true);
    expect(won.link.grantActive).toBe(false);
  });

  it("keeps an isolated in-memory grant when revoke CAS loses to restore", () => {
    const runtime = getIsolatedRuntime();
    const snapshot = {
      platformUserId,
      localUserId: "u-cas",
      localRole: "employee" as const,
      linkStatus: "linked" as const,
      grantActive: false,
      suggestedBy: "jit" as const,
      revokedAt: 1_700_000_000,
    };
    runtime.state.links.push(applyPlatformGrant(snapshot));
    const idx = runtime.state.links.findIndex(
      (row) => row.platformUserId === platformUserId
    );
    const current = runtime.state.links[idx]!;
    const wrote =
      (current.revokedAt ?? null) === (snapshot.revokedAt ?? null);
    if (wrote) {
      runtime.state.links[idx] = applyPlatformRevoke(snapshot);
    }
    const resolved = resolveRevokeWriteAfterCas({
      snapshot,
      wrote,
      live: runtime.state.links[idx]!,
    });
    expect(wrote).toBe(false);
    expect(resolved.dropSession).toBe(false);
    expect(runtime.state.links[idx]?.grantActive).toBe(true);
    expect(runtime.state.links[idx]?.revokedAt ?? null).toBeNull();
    runtime.state.links.splice(idx, 1);
  });

  it("passes last_sign_in_at from getRouteUser and CASes signal revoke on revoked_at", () => {
    const route = readFileSync(
      join(process.cwd(), "src/lib/supabase/route-handler.ts"),
      "utf8"
    );
    expect(route).toMatch(
      /isPlatformGrantBlocking\(user\.id,\s*user\.last_sign_in_at \?\? null\)/
    );
    const ports = readFileSync(
      join(process.cwd(), "src/lib/sso/supabase-ports.ts"),
      "utf8"
    );
    expect(ports).toMatch(/persistRevokeCas/);
    expect(ports).toMatch(/\.is\("revoked_at", null\)/);
    expect(ports).toMatch(/\.eq\("revoked_at"/);
    expect(ports).not.toMatch(/if \(!opts\?\.sessionStartedAt\)/);
    expect(ports).toMatch(/fetchPortalAccessSignals\(/);
  });

  it("treats memory poll HTTP 404 as unavailable", async () => {
    const { ports, state } = createMemoryPorts();
    state.accessSignalsHttpStatus = 404;
    const poll = await ports.pollAccessSignals!(platformUserId);
    expect(poll.status).toBe("unavailable");
    expect(decideAccessSignals(poll).action).toBe("deny");
  });
});
