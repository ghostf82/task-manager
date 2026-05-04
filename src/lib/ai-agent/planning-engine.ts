import "server-only";

/** Short context passed into the planner (from DB or in-memory). */
export type MemoryContext = {
  recentUserPhrases: string[];
  licensedToolSlugs: string[];
  tenantNames: string[];
};

export type PlanIntent =
  | "read_email"
  | "reply_email"
  | "check_odoo_tasks"
  | "create_task"
  | "update_task"
  | "read_excel"
  | "write_excel"
  | "add_calendar_event"
  | "combined";

export type PlanStep = {
  tool: string;
  description: string;
  requiresApproval: boolean;
  fallback: string;
};

export type ExecutionPlan = {
  intent: PlanIntent;
  steps: PlanStep[];
};

const NORM = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u0640\u200f\u200e]/g, "")
    .trim();

function hasAny(hay: string, needles: string[]) {
  const h = NORM(hay);
  return needles.some((n) => h.includes(NORM(n)));
}

/**
 * Rule-based intent + step planner for Arabic/English mixed commands.
 * Extend with LLM later; kept deterministic for governance and tests.
 */
export function analyzeIntent(userText: string, context: MemoryContext): ExecutionPlan {
  const t = userText.trim();
  if (!t) {
    return {
      intent: "combined",
      steps: [
        {
          tool: "llm_clarify",
          description: "طلب توضيح من المستخدم حول المطلوب تنفيذه",
          requiresApproval: false,
          fallback: "إنهاء المحادثة بأدب حتى يُعاد صياغة الطلب",
        },
      ],
    };
  }

  const emailRead =
    hasAny(t, ["ايميل", "إيميل", "بريد", "رسائل", "inbox", "email"]) &&
    hasAny(t, ["اقرا", "اعرض", "شوف", "ابحث", "read", "list", "show"]);
  const emailReply =
    hasAny(t, ["رد", "ارسل", "أرسل", "ابعث", "ابعت", "reply", "send"]) &&
    hasAny(t, ["ايميل", "إيميل", "بريد", "email"]);
  const odooLate =
    hasAny(t, ["اودو", "أودو", "odoo"]) &&
    hasAny(t, ["متأخر", "متاخرة", "late", "overdue", "delay"]);
  const odooTasks = hasAny(t, ["اودو", "أودو", "odoo"]) && hasAny(t, ["مهام", "tasks"]);
  const excelRead = hasAny(t, ["excel", "اكسل", "إكسل", "xlsx", "sheet"]);
  const excelWrite =
    excelRead && hasAny(t, ["اكتب", "احفظ", "صدر", "export", "write", "generate"]);
  const calendar = hasAny(t, ["تقويم", "موعد", "اجتماع", "calendar", "event", "google"]);
  const corpTask = hasAny(t, ["مهمة شركة", "create task", "انشاء مهمة", "إنشاء مهمة"]);
  const summarizeToManager =
    hasAny(t, ["ملخص", "summary"]) &&
    hasAny(t, ["مدير", "manager"]) &&
    (odooLate || odooTasks);

  const steps: PlanStep[] = [];

  if (summarizeToManager) {
    steps.push(
      {
        tool: "odoo_read_tasks",
        description: "قراءة المهام المتأخرة أو المفتوحة من Odoo ضمن صلاحياتك",
        requiresApproval: false,
        fallback: "استخدام قائمة مهام الشركات من النظام إن لم يتوفر Odoo",
      },
      {
        tool: "llm_summarize",
        description: "تجميع المهام في ملخص عربي واضح",
        requiresApproval: false,
        fallback: "عرض قائمة المهام خام دون تلخيص",
      },
      {
        tool: "email_draft",
        description: "صياغة مسودة بريد للمدير يتضمن الملخص",
        requiresApproval: true,
        fallback: "عرض الملخص في الواجهة فقط دون بريد",
      },
      {
        tool: "email_send",
        description: "إرسال البريد بعد موافقتك الصريحة",
        requiresApproval: true,
        fallback: "إلغاء الإرسال والإبقاء على المسودة",
      }
    );
    return { intent: "combined", steps };
  }

  if (emailReply && hasAny(t, ["عميل", "احمد", "أحمد", "client", "customer"])) {
    steps.push(
      {
        tool: "email_read",
        description: "البحث عن رسائل العميل المذكور في البريد",
        requiresApproval: false,
        fallback: "عرض آخر رسائل الوارد العامة إن تعذر التصفية بالاسم",
      },
      {
        tool: "llm_analyze",
        description: "تحليل المحتوى وصياغة رد مناسب",
        requiresApproval: false,
        fallback: "اقتراح نقاط رد بدون صياغة كاملة",
      },
      {
        tool: "email_draft",
        description: "عرض مسودة الرد للمراجعة",
        requiresApproval: true,
        fallback: "إيقاف التنفيذ عند هذه الخطوة",
      },
      {
        tool: "email_send",
        description: "إرسال الرد بعد الموافقة",
        requiresApproval: true,
        fallback: "عدم الإرسال والاحتفاظ بالمسودة",
      }
    );
    return { intent: "combined", steps };
  }

  if (emailRead) {
    steps.push({
      tool: "email_read",
      description: "جلب ملخص الرسائل غير المقروءة من IMAP",
      requiresApproval: false,
      fallback: "إعلام المستخدم بعدم توفر بيانات بريد",
    });
    return { intent: "read_email", steps };
  }

  if (emailReply) {
    steps.push(
      {
        tool: "email_read",
        description: "تحديد الرسالة المستهدفة للرد",
        requiresApproval: false,
        fallback: "طلب معرف الرسالة أو الموضوع يدوياً",
      },
      {
        tool: "email_draft",
        description: "إعداد مسودة الرد",
        requiresApproval: true,
        fallback: "إيقاف التنفيذ",
      },
      {
        tool: "email_send",
        description: "إرسال الرد بعد الموافقة",
        requiresApproval: true,
        fallback: "إلغاء الإرسال",
      }
    );
    return { intent: "reply_email", steps };
  }

  if (odooLate || odooTasks) {
    steps.push({
      tool: "odoo_read_tasks",
      description: odooLate
        ? "قراءة المهام المتأخرة من Odoo"
        : "قراءة مهام Odoo المرتبطة بحسابك",
      requiresApproval: false,
      fallback: "عرض مهام الشركات من قاعدة البيانات الداخلية",
    });
    return { intent: "check_odoo_tasks", steps };
  }

  if (excelWrite) {
    steps.push(
      {
        tool: "read_excel",
        description: "قراءة أي ملف مصدر إن وُجد",
        requiresApproval: false,
        fallback: "بدء ملف جديد فارغ",
      },
      {
        tool: "write_excel",
        description: "توليد ملف Excel وفق البيانات المطلوبة",
        requiresApproval: true,
        fallback: "عرض البيانات كنص JSON",
      }
    );
    return { intent: "write_excel", steps };
  }

  if (excelRead) {
    steps.push({
      tool: "read_excel",
      description: "قراءة ورقة Excel من الرابط أو الملف المرفوع",
      requiresApproval: false,
      fallback: "طلب رابط أو ملف صالح",
    });
    steps.push({
      tool: "analyze_excel",
      description: "تحليل الأعمدة واستخراج ملخص أرقامي",
      requiresApproval: false,
      fallback: "عرض أول 20 صفاً فقط",
    });
    return { intent: "read_excel", steps };
  }

  if (calendar) {
    steps.push({
      tool: "calendar_list",
      description: "عرض المواعيد القادمة (وضعية تجريبية)",
      requiresApproval: false,
      fallback: "إعلام المستخدم بربط Google Calendar لاحقاً",
    });
    steps.push({
      tool: "calendar_add",
      description: "إضافة الموعد بعد التأكد من التفاصيل",
      requiresApproval: true,
      fallback: "إلغاء إنشاء الحدث",
    });
    return { intent: "add_calendar_event", steps };
  }

  if (corpTask) {
    steps.push({
      tool: "create_corporate_task",
      description: "إنشاء مهمة شركة عبر مقترح يحتاج موافقة",
      requiresApproval: true,
      fallback: "طلب بيانات إضافية (الشركة، العنوان، التاريخ)",
    });
    return { intent: "create_task", steps };
  }

  if (hasAny(t, ["حدث", "عدل", "update"]) && odooTasks) {
    steps.push({
      tool: "odoo_update_task",
      description: "تحديث مرحلة مهمة Odoo عبر مقترح",
      requiresApproval: true,
      fallback: "عرض حالة المهمة الحالية فقط",
    });
    return { intent: "update_task", steps };
  }

  if (hasAny(t, ["pdf", "ملف", "file", "upload"])) {
    steps.push({
      tool: "file_read",
      description: "قراءة محتوى نصي أو استخراج ملخص PDF (تجريبي)",
      requiresApproval: false,
      fallback: "طلب ملف أصغر أو نصياً",
    });
    return { intent: "combined", steps };
  }

  const hint =
    context.recentUserPhrases[0] &&
    hasAny(t, [context.recentUserPhrases[0].slice(0, 12)])
      ? ` آخر سياق: ${context.recentUserPhrases[0].slice(0, 80)}`
      : "";
  return {
    intent: "combined",
    steps: [
      {
        tool: "llm_route",
        description: `تحليل الطلب العام واقتراح أدوات مناسبة ضمن: ${context.licensedToolSlugs.join(", ") || "لا أدوات مرخّصة"}.${hint}`,
        requiresApproval: false,
        fallback: "طلب إعادة صياغة الطلب بشكل أوضح",
      },
    ],
  };
}
