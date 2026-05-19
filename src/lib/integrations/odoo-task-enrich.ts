import "server-only";

import type { OdooCredentialBundle, OdooWebTaskLite } from "@/lib/integrations/odoo-client";
import {
  enrichOdooTagNames,
  enrichOdooUserDisplayNames,
  readOdooMany2onePair,
} from "@/lib/integrations/odoo-client";

import type { OdooTaskUiRow } from "@/lib/integrations/odoo-task-ui-types";

export type { OdooTaskUiRow };

function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function priorityLabel(priority: string): string {
  const p = String(priority || "").trim();
  if (p === "0") return "عادية";
  if (p === "1") return "مهمة";
  if (p === "2") return "عاجلة جداً";
  if (p === "3") return "حرجة";
  return p || "—";
}

export async function enrichOdooWebTasksToUiRows(
  bundle: OdooCredentialBundle,
  raw: OdooWebTaskLite[]
): Promise<OdooTaskUiRow[]> {
  const userIds = new Set<number>();
  const tagIds = new Set<number>();

  for (const t of raw) {
    const stage = readOdooMany2onePair(t.stage_id);
    const project = readOdooMany2onePair(t.project_id);
    const creator = readOdooMany2onePair(t.create_uid);
    const responsible = readOdooMany2onePair(t.user_id);
    if (stage.id) void stage;
    if (project.id) void project;
    if (creator.id) userIds.add(creator.id);
    if (responsible.id) userIds.add(responsible.id);
    for (const uid of t.user_ids ?? []) {
      if (Number.isFinite(uid) && uid > 0) userIds.add(uid);
    }
    const tags = Array.isArray(t.tag_ids) ? t.tag_ids : [];
    for (const tid of tags) {
      const id = typeof tid === "number" ? tid : readOdooMany2onePair(tid).id;
      if (id) tagIds.add(id);
    }
  }

  const [userNames, tagNames] = await Promise.all([
    enrichOdooUserDisplayNames(bundle, [...userIds]),
    enrichOdooTagNames(bundle, [...tagIds]),
  ]);

  return raw.map((t) => {
    const stage = readOdooMany2onePair(t.stage_id);
    const project = readOdooMany2onePair(t.project_id);
    const creator = readOdooMany2onePair(t.create_uid);
    const responsible = readOdooMany2onePair(t.user_id);
    const assigneeIds = [...new Set((t.user_ids ?? []).map(Number).filter((n) => n > 0))];
    const assignees = assigneeIds.map((id) => ({
      id,
      name: userNames.get(id) ?? `مستخدم #${id}`,
    }));
    const tagIdList: number[] = [];
    const tagLabels: string[] = [];
    for (const rawTag of Array.isArray(t.tag_ids) ? t.tag_ids : []) {
      if (typeof rawTag === "number" && rawTag > 0) {
        tagIdList.push(rawTag);
        tagLabels.push(tagNames.get(rawTag) ?? `وسم #${rawTag}`);
      } else {
        const pair = readOdooMany2onePair(rawTag);
        if (pair.id) {
          tagIdList.push(pair.id);
          tagLabels.push(pair.name || tagNames.get(pair.id) || `وسم #${pair.id}`);
        }
      }
    }

    const creatorName =
      creator.name || (creator.id ? userNames.get(creator.id) : null) || "—";
    const responsibleName =
      responsible.name ||
      (responsible.id ? userNames.get(responsible.id) : null) ||
      (assignees[0]?.name ?? "—");

    const descRaw = typeof t.description === "string" ? t.description : "";
    const descriptionPlain = stripHtml(descRaw);

    return {
      id: Number(t.id),
      name: String(t.name ?? "").trim() || `مهمة #${t.id}`,
      stage: stage.name || "—",
      stageId: stage.id,
      project: project.name || "—",
      projectId: project.id,
      deadline:
        typeof t.date_deadline === "string" && t.date_deadline.trim()
          ? t.date_deadline.trim()
          : "—",
      creator: creatorName,
      creatorId: creator.id,
      responsible: responsibleName,
      responsibleId: responsible.id,
      assigneeIds,
      assignees,
      tags: tagLabels,
      tagIds: tagIdList,
      description: descRaw,
      descriptionPlain: descriptionPlain || "",
      priority: priorityLabel(typeof t.priority === "string" ? t.priority : ""),
      active: Boolean(t.active ?? true),
    };
  });
}
