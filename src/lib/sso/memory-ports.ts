import { randomUUID } from "node:crypto";

import type { AccessSignal } from "./access-signals";
import { interpretAccessSignalsHttp } from "./access-signals";
import type { IdentityLink } from "./contract";
import type { CreatedLocalUser, SsoPorts } from "./consume";

export type MemorySsoState = {
  links: IdentityLink[];
  jtis: Set<string>;
  users: Map<string, { email: string; isSuperAdmin: boolean; passwordCopied: boolean }>;
  sessions: Set<string>;
  signedOut: string[];
  liveGrant: Map<string, boolean | "unknown">;
  accessSignals: AccessSignal[];
  /** Isolated test control. 404 is fail-closed, not "no signals". */
  accessSignalsHttpStatus: number | null;
  sessionStartedAt: Map<string, string>;
  /** Inclusive consume cursor (ISO). Never wall-clock; only consumed event `at`. */
  signalsSeenAt: Map<string, string>;
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
    accessSignals: initial?.accessSignals ? [...initial.accessSignals] : [],
    accessSignalsHttpStatus: initial?.accessSignalsHttpStatus ?? null,
    sessionStartedAt: new Map(initial?.sessionStartedAt ?? []),
    signalsSeenAt: new Map(initial?.signalsSeenAt ?? []),
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
        if (current.localUserId && current.localUserId !== link.localUserId) {
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
      state.sessionStartedAt.set(localUserId, new Date().toISOString());
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
    async signalsSeenAt(platformUserId) {
      return state.signalsSeenAt.get(platformUserId) ?? null;
    },
    async markSignalsSeen(platformUserId, at) {
      const prev = state.signalsSeenAt.get(platformUserId) ?? null;
      const prevMs = prev ? Date.parse(prev) : Number.NaN;
      const nextMs = Date.parse(at);
      if (!Number.isFinite(nextMs)) return;
      if (Number.isFinite(prevMs) && nextMs <= prevMs) return;
      state.signalsSeenAt.set(platformUserId, at);
    },
    async pollAccessSignals(platformUserId) {
      if (state.accessSignalsHttpStatus != null) {
        const body =
          state.accessSignalsHttpStatus === 200
            ? {
                signals: state.accessSignals.filter(
                  (row) => row.platform_user_id === platformUserId
                ),
              }
            : null;
        return interpretAccessSignalsHttp({
          status: state.accessSignalsHttpStatus,
          body,
        });
      }
      return {
        status: "ok" as const,
        signals: state.accessSignals.filter(
          (row) => row.platform_user_id === platformUserId
        ),
      };
    },
  };

  return { ports, state };
}
