import {
  isActiveLinkStatus,
  leastPrivilegeLocalRole,
  syntheticSsoEmail,
  type IdentityLink,
  type JitUserSpec,
} from "./contract";

export type JitDecision =
  | { action: "reuse"; link: IdentityLink; spec: null }
  | { action: "create"; link: null; spec: JitUserSpec };

/**
 * First launch provisions a least-privilege local row keyed by platform_user_id.
 * Existing privileged local roles are never copied. Password is never part of the spec.
 */
export function decideJit(input: {
  platformUserId: string;
  displayName?: string;
  existing: IdentityLink | null;
  jwtRole?: string | null;
}): JitDecision {
  if (input.existing?.localUserId) {
    return { action: "reuse", link: input.existing, spec: null };
  }

  return {
    action: "create",
    link: null,
    spec: {
      platformUserId: input.platformUserId,
      displayName: input.displayName,
      email: syntheticSsoEmail(input.platformUserId),
      localRole: leastPrivilegeLocalRole(),
      isSuperAdmin: false,
      mustChangePassword: false,
      copyPassword: false,
      joinKey: "platform_user_id",
    },
  };
}

export function provisionedLink(input: {
  platformUserId: string;
  localUserId: string;
  existing?: IdentityLink | null;
}): IdentityLink {
  return {
    platformUserId: input.platformUserId,
    localUserId: input.localUserId,
    localRole:
      input.existing && isActiveLinkStatus(input.existing.linkStatus)
        ? input.existing.localRole
        : leastPrivilegeLocalRole(),
    linkStatus: nextLinkStatus(input.existing),
    grantActive: input.existing?.linkStatus !== "revoked",
    suggestedBy: input.existing?.suggestedBy ?? "jit",
  };
}

function nextLinkStatus(existing?: IdentityLink | null): IdentityLink["linkStatus"] {
  if (existing?.linkStatus === "revoked") return "revoked";
  if (existing?.linkStatus === "linked") return "linked";
  return "provisioned";
}
