import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
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
  applyPlatformRevoke,
  canOpenFromPlatformGrant,
  localPasswordLoginAllowed,
} from "./grant";
import { launchRedirectStatus } from "./http";
import { resolveLinkForLaunch, suggestEmailMatch } from "./identity";
import { decideJit, provisionedLink } from "./jit";
import { LaunchJwtError, parseLaunchClaims, verifyLaunchJwt } from "./launch-jwt";
import { readLaunchTokenFromParts } from "./launch-request";
import { isPlatformGrantBlockingFromLookup } from "./lookup";
import { createMemoryPorts } from "./memory-ports";
import { revokeSessionsForUserId } from "./sessions";

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
  const jwt = new SignJWT({
    slug: PROGRAM_SLUG,
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(PORTAL_ISSUER)
    .setAudience(PROGRAM_AUDIENCE)
    .setJti(extra?.jti ?? randomUUID())
    .setIssuedAt(extra?.iatOffsetSec ? Math.floor(Date.now() / 1000) + extra.iatOffsetSec : undefined)
    .setExpirationTime(extra?.exp ?? "60s");
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
});

describe("grant lookup fail-closed", () => {
  it("treats lookup errors as blocked, not as unlinked", () => {
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
});

describe("POST launch redirect", () => {
  it("uses 303 for POST and 307 for GET", () => {
    expect(launchRedirectStatus("POST")).toBe(303);
    expect(launchRedirectStatus("GET")).toBe(307);
  });
});

describe("session revoke by user id", () => {
  it("calls sso_revoke_local_sessions with the user UUID, not auth.admin.signOut", async () => {
    const calls: unknown[] = [];
    await revokeSessionsForUserId(
      {
        async rpc(fn, args) {
          calls.push([fn, args]);
          return { error: null };
        },
      },
      "11111111-1111-4111-8111-111111111111"
    );
    expect(calls).toEqual([
      ["sso_revoke_local_sessions", { p_user: "11111111-1111-4111-8111-111111111111" }],
    ]);
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
    expect(sql).not.toMatch(/encrypted_password|createUser|123456/);
    expect(sql).toMatch(/never copied/i);
    expect(sql).toMatch(/Email and username are never the durable join key/);
  });
});
