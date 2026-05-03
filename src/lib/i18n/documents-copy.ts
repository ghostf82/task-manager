import type { CompanyDocumentStatus } from "@/lib/company-documents";

export type DocumentsPageCopy = {
  title: string;
  subtitle: string;
  exportExcel: string;
  addDocument: string;
  allTenants: string;
  loadError: string;
  emptyTitle: string;
  emptyDescription: string;
  linkLabel: string;
  edit: string;
  delete: string;
  dialogNewTitle: string;
  dialogNewDescription: string;
  dialogEditTitle: string;
  dialogEditDescription: string;
  cancel: string;
  save: string;
  saveChanges: string;
  form: {
    tenant: string;
    documentName: string;
    documentNamePh: string;
    documentNumber: string;
    expiry: string;
    alertDays: string;
    status: string;
    fileUrl: string;
    fileUrlPh: string;
  };
  status: Record<CompanyDocumentStatus, string>;
  toast: {
    added: string;
    updated: string;
    deleted: string;
    saveFail: string;
    deleteFail: string;
  };
  confirmDelete: string;
  table: {
    company: string;
    document: string;
    number: string;
    expiry: string;
    alertBefore: string;
    status: string;
    days: string;
    attachment: string;
  };
};

export function buildDocumentsCopy(t: (path: string) => string): DocumentsPageCopy {
  return {
    title: t("documentsPage.title"),
    subtitle: t("documentsPage.subtitle"),
    exportExcel: t("documentsPage.exportExcel"),
    addDocument: t("documentsPage.addDocument"),
    allTenants: t("documentsPage.allTenants"),
    loadError: t("documentsPage.loadError"),
    emptyTitle: t("documentsPage.emptyTitle"),
    emptyDescription: t("documentsPage.emptyDescription"),
    linkLabel: t("documentsPage.linkLabel"),
    edit: t("documentsPage.edit"),
    delete: t("documentsPage.delete"),
    dialogNewTitle: t("documentsPage.dialogNewTitle"),
    dialogNewDescription: t("documentsPage.dialogNewDescription"),
    dialogEditTitle: t("documentsPage.dialogEditTitle"),
    dialogEditDescription: t("documentsPage.dialogEditDescription"),
    cancel: t("documentsPage.cancel"),
    save: t("documentsPage.save"),
    saveChanges: t("documentsPage.saveChanges"),
    form: {
      tenant: t("documentsPage.form.tenant"),
      documentName: t("documentsPage.form.documentName"),
      documentNamePh: t("documentsPage.form.documentNamePh"),
      documentNumber: t("documentsPage.form.documentNumber"),
      expiry: t("documentsPage.form.expiry"),
      alertDays: t("documentsPage.form.alertDays"),
      status: t("documentsPage.form.status"),
      fileUrl: t("documentsPage.form.fileUrl"),
      fileUrlPh: t("documentsPage.form.fileUrlPh"),
    },
    status: {
      valid: t("documentsPage.status.valid"),
      expired: t("documentsPage.status.expired"),
      renewal_pending: t("documentsPage.status.renewal_pending"),
    },
    toast: {
      added: t("documentsPage.toast.added"),
      updated: t("documentsPage.toast.updated"),
      deleted: t("documentsPage.toast.deleted"),
      saveFail: t("documentsPage.toast.saveFail"),
      deleteFail: t("documentsPage.toast.deleteFail"),
    },
    confirmDelete: t("documentsPage.confirmDelete"),
    table: {
      company: t("documentsPage.table.company"),
      document: t("documentsPage.table.document"),
      number: t("documentsPage.table.number"),
      expiry: t("documentsPage.table.expiry"),
      alertBefore: t("documentsPage.table.alertBefore"),
      status: t("documentsPage.table.status"),
      days: t("documentsPage.table.days"),
      attachment: t("documentsPage.table.attachment"),
    },
  };
}
