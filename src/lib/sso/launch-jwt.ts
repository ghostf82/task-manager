import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from "jose";

import {
  DEFAULT_JWT_MAX_TTL_SECONDS,
  PORTAL_ISSUER,
  PROGRAM_AUDIENCE,
  PROGRAM_SLUG,
  audienceList,
  isPlatformUserId,
  type LaunchErrorCode,
  type LaunchJwtClaims,
} from "./contract";

export type JwtVerifyConfig = {
  issuer: string;
  audience: string;
  secret?: Uint8Array;
  jwksUrl?: string;
  maxTtlSeconds?: number;
  nowSeconds?: number;
};

export class LaunchJwtError extends Error {
  readonly code: LaunchErrorCode;
  constructor(code: LaunchErrorCode, message: string) {
    super(message);
    this.name = "LaunchJwtError";
    this.code = code;
  }
}

function asRecord(payload: JWTPayload): Record<string, unknown> {
  return payload as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function parseLaunchClaims(
  payload: JWTPayload,
  cfg: Pick<JwtVerifyConfig, "issuer" | "audience" | "maxTtlSeconds" | "nowSeconds">
): LaunchJwtClaims {
  const rec = asRecord(payload);
  const sub = readString(payload.sub);
  const iss = readString(payload.iss);
  const jti = readString(payload.jti);
  const exp = payload.exp;
  const iat = payload.iat;
  const now = cfg.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxTtl = cfg.maxTtlSeconds ?? DEFAULT_JWT_MAX_TTL_SECONDS;

  if (!sub || !isPlatformUserId(sub)) {
    throw new LaunchJwtError("invalid", "sub must be platform_user_id (UUID)");
  }
  if (sub.includes("@")) {
    throw new LaunchJwtError("invalid", "sub must not be an email");
  }
  if (!iss || iss !== cfg.issuer) {
    throw new LaunchJwtError("invalid", "issuer mismatch");
  }
  const aud = audienceList(payload.aud as string | string[] | undefined);
  if (!aud.includes(cfg.audience) && !aud.includes(PROGRAM_AUDIENCE)) {
    throw new LaunchJwtError("invalid", "audience mismatch");
  }
  if (!jti) {
    throw new LaunchJwtError("invalid", "jti required");
  }
  if (typeof exp !== "number" || typeof iat !== "number") {
    throw new LaunchJwtError("invalid", "iat/exp required");
  }
  if (exp <= now) {
    throw new LaunchJwtError("expired", "launch token expired");
  }
  if (exp - iat > maxTtl) {
    throw new LaunchJwtError("invalid", "launch token ttl exceeds max");
  }

  const slug = readString(rec.slug) ?? readString(rec.program);
  if (slug !== PROGRAM_SLUG) {
    throw new LaunchJwtError("invalid", "slug mismatch");
  }

  const grant = readBool(rec.grant) ?? true;

  return {
    sub,
    iss,
    aud: payload.aud as string | string[],
    exp,
    iat,
    nbf: typeof payload.nbf === "number" ? payload.nbf : undefined,
    jti,
    slug: PROGRAM_SLUG,
    program: PROGRAM_SLUG,
    grant,
    email: readString(rec.email),
    name: readString(rec.name),
  };
}

export async function verifyLaunchJwt(
  token: string,
  cfg: JwtVerifyConfig
): Promise<LaunchJwtClaims> {
  if (!token.trim()) {
    throw new LaunchJwtError("missing_token", "missing launch token");
  }
  if (!cfg.secret && !cfg.jwksUrl) {
    throw new LaunchJwtError("unconfigured", "no jwt verifier configured");
  }

  const algorithms = cfg.jwksUrl && !cfg.secret
    ? (["ES256", "RS256"] as const)
    : (["HS256"] as const);

  try {
    const key = cfg.secret
      ? cfg.secret
      : createRemoteJWKSet(new URL(cfg.jwksUrl!));
    const { payload } = await jwtVerify(token, key, {
      issuer: cfg.issuer,
      audience: cfg.audience,
      algorithms: [...algorithms],
      clockTolerance: 5,
    });
    return parseLaunchClaims(payload, cfg);
  } catch (err) {
    if (err instanceof LaunchJwtError) throw err;
    const msg = err instanceof Error ? err.message : "invalid token";
    if (err instanceof errors.JWTExpired) {
      throw new LaunchJwtError("expired", msg);
    }
    throw new LaunchJwtError("invalid", msg);
  }
}

export function readJwtConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): JwtVerifyConfig | { error: LaunchErrorCode } {
  const enabled = env.PLATFORM_SSO_ENABLED === "true";
  const issuer = env.PLATFORM_SSO_ISSUER?.trim() || PORTAL_ISSUER;
  const audience = env.PLATFORM_SSO_AUDIENCE?.trim() || PROGRAM_AUDIENCE;
  const secret = env.PLATFORM_SSO_JWT_SECRET?.trim();
  const jwksUrl = env.PLATFORM_SSO_JWKS_URL?.trim();
  const maxTtlRaw = env.PLATFORM_SSO_JWT_MAX_TTL?.trim();
  const maxTtlSeconds = maxTtlRaw
    ? Number.parseInt(maxTtlRaw, 10)
    : DEFAULT_JWT_MAX_TTL_SECONDS;

  if (!enabled || (!secret && !jwksUrl)) {
    return { error: "unconfigured" };
  }
  if (!Number.isFinite(maxTtlSeconds) || maxTtlSeconds <= 0 || maxTtlSeconds > 120) {
    return { error: "unconfigured" };
  }

  return {
    issuer,
    audience,
    secret: secret ? new TextEncoder().encode(secret) : undefined,
    jwksUrl,
    maxTtlSeconds,
  };
}
