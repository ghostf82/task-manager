/** Optional display aliases for war rooms when tenant names differ from division branding. */
const ALIASES: Array<{ match: RegExp; aliasKey: string }> = [
  { match: /marble|رخام/i, aliasKey: "executive.warRoom.aliasMarble" },
  { match: /ready\s*mix|جاهز/i, aliasKey: "executive.warRoom.aliasReadyMix" },
  { match: /mining|تعدين|محجر/i, aliasKey: "executive.warRoom.aliasMining" },
  { match: /logistic|نقل|توزيع/i, aliasKey: "executive.warRoom.aliasLogistics" },
  { match: /holding|قابضة|مجموعة/i, aliasKey: "executive.warRoom.aliasHolding" },
];

export function warRoomAliasKeyForTenantName(name: string): string | undefined {
  for (const rule of ALIASES) {
    if (rule.match.test(name)) return rule.aliasKey;
  }
  return undefined;
}

export function tenantNameMatchesProject(tenantName: string, projectOrLabel: string): boolean {
  const a = tenantName.toLowerCase().trim();
  const b = projectOrLabel.toLowerCase().trim();
  if (!a || !b) return false;
  return b.includes(a) || a.includes(b);
}
