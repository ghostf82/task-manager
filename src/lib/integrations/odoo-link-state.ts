export type OdooLinkRecord = {
  login_username: string;
  updated_at: string;
};

/** High-level UX states for the employee Odoo link card. */
export type OdooLinkUxState =
  | "admin_missing"
  | "not_connected"
  | "connected"
  | "connection_error"
  | "reconnect_needed";

export type OdooLinkViewModel = {
  state: OdooLinkUxState;
  /** Shown when state is connected, connection_error, or reconnect_needed. */
  link: OdooLinkRecord | null;
  errorMessage: string | null;
  justLinked: boolean;
};

const RECONNECT_HINT_CODES = new Set([
  "odoo_password",
  "odoo_save",
]);

function isLikelyAuthFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("login") ||
    m.includes("password") ||
    m.includes("credential") ||
    m.includes("authentication") ||
    m.includes("access denied") ||
    m.includes("كلمة المرور") ||
    m.includes("تسجيل الدخول") ||
    m.includes("بيانات الدخول")
  );
}

export function deriveOdooLinkViewModel(input: {
  companyBaseUrl: string;
  link: OdooLinkRecord | null;
  errorCode: string | null;
  errorMessage: string | null;
  justLinked: boolean;
  inlineTestError: string | null;
}): OdooLinkViewModel {
  if (!input.companyBaseUrl.trim()) {
    return {
      state: "admin_missing",
      link: input.link,
      errorMessage: null,
      justLinked: false,
    };
  }

  const linked = Boolean(input.link?.login_username?.trim());
  const resolvedError = input.inlineTestError ?? input.errorMessage;

  if (!linked) {
    return {
      state: resolvedError ? "connection_error" : "not_connected",
      link: null,
      errorMessage: resolvedError,
      justLinked: false,
    };
  }

  if (resolvedError) {
    const reconnect =
      (input.errorCode && RECONNECT_HINT_CODES.has(input.errorCode)) ||
      isLikelyAuthFailure(resolvedError);
    return {
      state: reconnect ? "reconnect_needed" : "connection_error",
      link: input.link,
      errorMessage: resolvedError,
      justLinked: input.justLinked,
    };
  }

  return {
    state: "connected",
    link: input.link,
    errorMessage: null,
    justLinked: input.justLinked,
  };
}
