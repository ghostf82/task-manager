import { randomUUID } from "node:crypto";

import type { IdentityLink } from "./contract";
import type { CreatedLocalUser, SsoPorts } from "./consume";

export type MemorySsoState = {
  links: IdentityLink[];
  jtis: Set<string>;
  users: Map<string, { email: string; isSuperAdmin: boolean; passwordCopied: boolean }>;
  sessions: Set<string>;
  signedOut: string[];
  liveGrant: Map<string, boolean | "unknown">;
};

export function createMemoryPorts(initial?: Partial<MemorySsoState>): {
  ports: SsoPorts;
  state: MemorySsoState;
} {
  const state: MemorySsoState = {
    links: initial?.links ? [...initial.links] : [],
    jtis: new Set(initial?.jtis ?? []),
    users: new Map(initial?.users ?? []),
    sessions: new Set(initial?.sessions ?? []),
    signedOut: initial?.signedOut ? [...initial.signedOut] : [],
    liveGrant: new Map(initial?.liveGrant ?? []),
  };

  const ports: SsoPorts = {
    async findLinkByPlatformUserId(platformUserId) {
      return state.links.find((l) => l.platformUserId === platformUserId) ?? null;
    },
    async listLinks() {
      return [...state.links];
    },
    async saveLink(link, cas) {
      const idx = state.links.findIndex((l) => l.platformUserId === link.platformUserId);
      if (idx >= 0) {
        const current = state.links[idx]!;
        if (
          current.localUserId &&
          link.localUserId &&
          current.localUserId !== link.localUserId
        ) {
          return "exists";
        }
        if (link.grantActive && cas) {
          const actual = current.revokedAt ?? null;
          if (actual !== cas.expectedRevokedAt || current.linkStatus === "revoked") {
            return "stale";
          }
        }
        state.links[idx] = link;
        return "ok";
      }
      state.links.push(link);
      return "ok";
    },
    async consumeJti(jti) {
      if (state.jtis.has(jti)) return "replay";
      state.jtis.add(jti);
      return "ok";
    },
    async createLocalUser(spec) {
      if (spec.copyPassword !== false || spec.isSuperAdmin !== false) {
        throw new Error("JIT must not copy passwords or mint super_admin");
      }
      const localUserId = randomUUID();
      state.users.set(localUserId, {
        email: spec.email,
        isSuperAdmin: spec.isSuperAdmin,
        passwordCopied: spec.copyPassword,
      });
      const created: CreatedLocalUser = { localUserId, email: spec.email };
      return created;
    },
    async openSession(localUserId) {
      state.sessions.add(localUserId);
    },
    async signOutLocal(localUserId) {
      state.sessions.delete(localUserId);
      state.signedOut.push(localUserId);
    },
    async checkLiveGrant(platformUserId) {
      if (!state.liveGrant.has(platformUserId)) return { status: "skipped" as const };
      const value = state.liveGrant.get(platformUserId);
      if (value === "unknown") return { status: "unknown" as const };
      return { status: "confirmed" as const, granted: value === true };
    },
  };

  return { ports, state };
}
