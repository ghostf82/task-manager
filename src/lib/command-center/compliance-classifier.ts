export type ComplianceCategory =
  | "commercial_registration"
  | "industrial_license"
  | "environmental_permit"
  | "iso_certification"
  | "chamber_membership"
  | "transportation_license"
  | "government_compliance"
  | "contract"
  | "renewal"
  | "general";

type CategoryRule = { category: ComplianceCategory; tokens: string[] };

const RULES: CategoryRule[] = [
  {
    category: "commercial_registration",
    tokens: [
      "commercial registration",
      "cr ",
      "cr-",
      "سجل تجاري",
      "السجل التجاري",
      "تجاري",
    ],
  },
  {
    category: "industrial_license",
    tokens: ["industrial license", "industrial", "رخصة صناعية", "صناعي", "مصنع"],
  },
  {
    category: "environmental_permit",
    tokens: ["environmental", "environment", "بيئي", "بيئة", "تصريح بيئي"],
  },
  {
    category: "iso_certification",
    tokens: ["iso", "certification", "شهادة iso", "اعتماد", "جودة"],
  },
  {
    category: "chamber_membership",
    tokens: ["chamber", "غرفة تجارية", "عضوية الغرفة", "غرفة"],
  },
  {
    category: "transportation_license",
    tokens: ["transport", "transportation", "نقل", "ترخيص نقل", "مركبات"],
  },
  {
    category: "government_compliance",
    tokens: [
      "government",
      "municipality",
      "ministry",
      "regulatory",
      "حكومي",
      "بلدية",
      "وزارة",
      "امتثال",
      "تنظيمي",
    ],
  },
  {
    category: "contract",
    tokens: ["contract", "agreement", "عقد", "اتفاقية", "تعاقد"],
  },
  {
    category: "renewal",
    tokens: ["renewal", "renew", "تجديد", "تجديدات", "expires", "expiry", "انتهاء"],
  },
];

export function classifyComplianceText(text: string): ComplianceCategory {
  const blob = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.tokens.some((t) => blob.includes(t.toLowerCase()))) {
      return rule.category;
    }
  }
  return "general";
}

export function isComplianceRelatedText(text: string): boolean {
  const cat = classifyComplianceText(text);
  return cat !== "general" || /license|permit|certificate|renew|تجديد|رخصة|شهادة|ترخيص/i.test(text);
}
