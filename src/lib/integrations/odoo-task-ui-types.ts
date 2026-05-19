/** Client-safe shape for Odoo tasks shown in the AI Agent panel. */
export type OdooTaskUiRow = {
  id: number;
  name: string;
  stage: string;
  stageId: number | null;
  project: string;
  projectId: number | null;
  deadline: string;
  creator: string;
  creatorId: number | null;
  responsible: string;
  responsibleId: number | null;
  assigneeIds: number[];
  assignees: Array<{ id: number; name: string }>;
  tags: string[];
  tagIds: number[];
  description: string;
  descriptionPlain: string;
  priority: string;
  active: boolean;
};

export type OdooTaskStageOption = {
  id: number;
  name: string;
  projectIds: number[];
};

export type OdooUserOption = {
  id: number;
  name: string;
};
