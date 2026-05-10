import type {
  AdoComment,
  AdoRevision,
  AdoWorkItem,
  CustomerPriority,
  CustomerStatus,
  CustomerTicketDetail,
  CustomerTicketSummary,
  TicketFilters
} from "./types";

const STANDARD_FLOW: CustomerStatus[] = ["New", "Investigating", "Waiting", "Resolved", "Closed"];
const MAJOR_INCIDENT_FLOW: CustomerStatus[] = [
  "New",
  "Declared",
  "Investigating",
  "Identified",
  "Mitigated",
  "Monitoring",
  "Closed"
];

const INTERNAL_PATTERNS = [
  /\[internal\]/i,
  /\[private\]/i,
  /\[security\]/i,
  /internal note:/i,
  /engineer note:/i,
  /root cause \(internal\):/i
];

export function mapAdoStateToCustomerStatus(stateValue: unknown, workItemTypeValue?: unknown): CustomerStatus {
  const state = String(stateValue ?? "").trim().toLowerCase();
  const workItemType = String(workItemTypeValue ?? "").trim().toLowerCase();
  const isMajorIncident = workItemType.includes("major");

  if (isMajorIncident) {
    if (state.includes("declared")) return "Declared";
    if (state.includes("identified")) return "Identified";
    if (state.includes("mitigated")) return "Mitigated";
    if (state.includes("monitoring")) return "Monitoring";
    if (state.includes("resolved")) return "Monitoring";
  }

  if (state.includes("closed") || state.includes("done") || state.includes("completed")) return "Closed";
  if (state.includes("resolved")) return "Resolved";
  if (state.includes("waiting") || state.includes("blocked") || state.includes("hold")) return "Waiting";
  if (state.includes("active") || state.includes("investigat") || state.includes("committed")) {
    return "Investigating";
  }
  return "New";
}

export function mapAdoPriority(value: unknown): CustomerPriority {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "1" || raw.includes("p1") || raw.includes("critical")) return "P1";
  if (raw === "2" || raw.includes("p2") || raw.includes("high")) return "P2";
  if (raw === "3" || raw.includes("p3") || raw.includes("medium") || raw.includes("normal")) return "P3";
  return "Unknown";
}

export function calculateProgress(status: CustomerStatus, workItemType?: unknown): number {
  const flow = String(workItemType ?? "").toLowerCase().includes("major") ? MAJOR_INCIDENT_FLOW : STANDARD_FLOW;
  const index = flow.indexOf(status);
  if (index === -1) return 0;
  return Math.round((index / (flow.length - 1)) * 100);
}

export function sanitizeHtmlText(value: unknown): string {
  const withoutTags = String(value ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");

  return withoutTags
    .split(/\r?\n/)
    .filter((line) => !INTERNAL_PATTERNS.some((pattern) => pattern.test(line)))
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function isCustomerSafeComment(comment: AdoComment): boolean {
  if (comment.isDeleted) return false;
  const text = comment.text ?? "";
  if (!text.trim()) return false;
  if (INTERNAL_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return /\[customer\]/i.test(text);
}

export function toTicketSummary(workItem: AdoWorkItem): CustomerTicketSummary {
  const fields = workItem.fields;
  const workItemType = fields["System.WorkItemType"];
  const status = mapAdoStateToCustomerStatus(fields["System.State"], workItemType);

  return {
    id: workItem.id,
    title: String(fields["System.Title"] ?? `Ticket ${workItem.id}`),
    status,
    priority: mapAdoPriority(fields["Microsoft.VSTS.Common.Priority"] ?? fields["Custom.Priority"]),
    createdDate: String(fields["System.CreatedDate"] ?? ""),
    lastUpdated: String(fields["System.ChangedDate"] ?? fields["System.CreatedDate"] ?? ""),
    progress: calculateProgress(status, workItemType)
  };
}

export function toTicketDetail(
  workItem: AdoWorkItem,
  comments: AdoComment[] = [],
  revisions: AdoRevision[] = []
): CustomerTicketDetail {
  const summary = toTicketSummary(workItem);
  const fields = workItem.fields;

  return {
    ...summary,
    description: sanitizeHtmlText(fields["System.Description"] ?? fields["Custom.CustomerDescription"]),
    timeline: buildTimeline(revisions, fields["System.WorkItemType"]),
    updates: comments.filter(isCustomerSafeComment).map((comment) => ({
      authorName: comment.createdBy?.displayName ? "Support Team" : undefined,
      body: sanitizeHtmlText(comment.text).replace(/\[customer\]/gi, "").trim(),
      createdDate: String(comment.createdDate ?? "")
    })),
    sla: buildSla(fields)
  };
}

export function applyTicketFilters<T extends CustomerTicketSummary>(tickets: T[], filters: TicketFilters): T[] {
  const search = filters.search?.trim().toLowerCase();
  const from = filters.from ? Date.parse(filters.from) : undefined;
  const to = filters.to ? Date.parse(filters.to) : undefined;

  return tickets.filter((ticket) => {
    if (filters.status && ticket.status !== filters.status) return false;
    if (filters.priority && ticket.priority !== filters.priority) return false;
    if (search && !String(ticket.id).includes(search) && !ticket.title.toLowerCase().includes(search)) return false;

    const updatedAt = Date.parse(ticket.lastUpdated);
    if (from && Number.isFinite(updatedAt) && updatedAt < from) return false;
    if (to && Number.isFinite(updatedAt) && updatedAt > to + 86_399_999) return false;

    return true;
  });
}

function buildTimeline(revisions: AdoRevision[], workItemType: unknown): Array<{ status: CustomerStatus; date: string }> {
  const seen = new Set<CustomerStatus>();
  const timeline: Array<{ status: CustomerStatus; date: string }> = [];

  for (const revision of revisions) {
    const fields = revision.fields ?? {};
    const rawState = fields["System.State"];
    const changedDate = fields["System.ChangedDate"];
    if (!rawState || !changedDate) continue;

    const status = mapAdoStateToCustomerStatus(rawState, workItemType);
    if (seen.has(status)) continue;

    seen.add(status);
    timeline.push({ status, date: String(changedDate) });
  }

  return timeline;
}

function buildSla(fields: Record<string, unknown>): CustomerTicketDetail["sla"] {
  const priority = mapAdoPriority(fields["Microsoft.VSTS.Common.Priority"] ?? fields["Custom.Priority"]);
  const dueDate = fields["Custom.SlaDueDate"] ?? fields["Microsoft.VSTS.Scheduling.DueDate"];

  if (priority === "Unknown" && !dueDate) return undefined;

  const dueTime = dueDate ? Date.parse(String(dueDate)) : Number.NaN;
  const atRisk = priority === "P1" || priority === "P2" || (Number.isFinite(dueTime) && dueTime < Date.now());

  return {
    atRisk,
    dueDate: dueDate ? String(dueDate) : undefined,
    label: atRisk ? "SLA attention required" : "SLA tracking"
  };
}
