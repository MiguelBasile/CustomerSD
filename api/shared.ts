import crypto from "node:crypto";

export type CustomerStatus =
  | "New"
  | "Investigating"
  | "Waiting"
  | "Resolved"
  | "Closed"
  | "Declared"
  | "Identified"
  | "Mitigated"
  | "Monitoring";

export type CustomerPriority = "P1" | "P2" | "P3" | "Unknown";

export type TicketFilters = {
  status?: CustomerStatus;
  priority?: CustomerPriority;
  from?: string;
  to?: string;
  search?: string;
};

type AdoWorkItem = {
  id: number;
  fields: Record<string, unknown>;
};

type AdoComment = {
  text?: string;
  createdDate?: string;
  createdBy?: { displayName?: string };
  isDeleted?: boolean;
};

type AdoRevision = {
  fields?: Record<string, unknown>;
};

const customerFields = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.WorkItemType",
  "System.CreatedDate",
  "System.ChangedDate",
  "System.Description",
  "Microsoft.VSTS.Common.Priority",
  "Microsoft.VSTS.Scheduling.DueDate",
  "Custom.Customer"
];

const standardFlow: CustomerStatus[] = ["New", "Investigating", "Waiting", "Resolved", "Closed"];
const majorFlow: CustomerStatus[] = ["New", "Declared", "Investigating", "Identified", "Mitigated", "Monitoring", "Closed"];
const internalPatterns = [/\[internal\]/i, /\[private\]/i, /\[security\]/i, /internal note:/i, /engineer note:/i];

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class AdoRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getBearerToken(headers: Headers): string | undefined {
  const authorization = headers.get("authorization");
  const tokenHeader = headers.get("x-customer-token");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return tokenHeader?.trim();
}

export function verifyCustomerToken(token: string | undefined) {
  const localDevCustomerId = process.env.LOCAL_DEV_CUSTOMER_ID;
  if (!token && localDevCustomerId && process.env.NODE_ENV !== "production") {
    return { customerId: localDevCustomerId, displayName: localDevCustomerId };
  }

  if (process.env.MOCK_MODE === "true" && !token) {
    return { customerId: "contoso", displayName: "Contoso" };
  }

  const secret = process.env.CUSTOMER_TOKEN_SECRET;
  if (!secret) throw new AuthError("Customer token secret is not configured", 500);
  if (!token) throw new AuthError("Missing customer token", 401);

  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) throw new AuthError("Invalid customer token", 401);

  const expected = crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
  const left = Buffer.from(signaturePart);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new AuthError("Invalid customer token", 401);
  }

  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
    customerId?: string;
    name?: string;
    exp?: number;
  };

  if (!payload.customerId) throw new AuthError("Invalid customer token", 401);
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new AuthError("Expired customer token", 401);
  return { customerId: payload.customerId, displayName: payload.name };
}

export async function getCustomerWorkItems(customerId: string): Promise<AdoWorkItem[]> {
  const customerField = process.env.ADO_CUSTOMER_FIELD || "Custom.CustomerId";
  const workItemTypes = getConfiguredWorkItemTypes();
  const wiql = {
    query: `
      SELECT [System.Id]
      FROM WorkItems
      WHERE [${customerField}] = '${customerId.replace(/'/g, "''")}'
      AND [System.WorkItemType] IN (${workItemTypes.map((type) => `'${type.replace(/'/g, "''")}'`).join(", ")})
      ORDER BY [System.ChangedDate] DESC
    `
  };

  const result = await adoFetch("wit/wiql?api-version=7.1", {
    method: "POST",
    body: JSON.stringify(wiql)
  });

  const ids = (result.workItems ?? []).map((item: { id: number }) => item.id).slice(0, 200);
  if (ids.length === 0) return [];

  return adoFetch(
    `wit/workitems?ids=${ids.join(",")}&fields=${[...customerFields, customerField].map(encodeURIComponent).join(",")}&api-version=7.1`
  ).then((body) => body.value ?? []);
}

export async function getAdoConnectionStatus() {
  const org = requireEnv("ADO_ORG");
  const project = requireEnv("ADO_PROJECT");
  requireEnv("ADO_PAT");

  const fieldsResponse = await adoFetch("wit/fields?api-version=7.1");

  return {
    connected: true,
    org,
    project,
    customerField: process.env.ADO_CUSTOMER_FIELD || "Custom.CustomerId",
    availableFieldCount: Array.isArray(fieldsResponse.value) ? fieldsResponse.value.length : 0
  };
}

export async function getCustomerWorkItemById(customerId: string, id: number): Promise<AdoWorkItem | undefined> {
  const customerField = process.env.ADO_CUSTOMER_FIELD || "Custom.CustomerId";
  let workItem: AdoWorkItem;

  try {
    workItem = await adoFetch(
      `wit/workitems/${id}?fields=${[...customerFields, customerField].map(encodeURIComponent).join(",")}&api-version=7.1`
    );
  } catch (error) {
    if (error instanceof AdoRequestError && (error.status === 404 || error.status === 400)) {
      return undefined;
    }

    throw error;
  }

  return String(workItem.fields?.[customerField] ?? "").toLowerCase() === customerId.toLowerCase() ? workItem : undefined;
}

export async function getWorkItemComments(id: number): Promise<AdoComment[]> {
  const result = await adoFetch(`wit/workItems/${id}/comments?api-version=7.1-preview.4`);
  return result.comments ?? [];
}

export async function getWorkItemRevisions(id: number): Promise<AdoRevision[]> {
  const result = await adoFetch(`wit/workItems/${id}/revisions?api-version=7.1`);
  return result.value ?? [];
}

export async function adoFetch(path: string, init: RequestInit = {}) {
  const org = requireEnv("ADO_ORG");
  const project = requireEnv("ADO_PROJECT");
  const pat = requireEnv("ADO_PAT");
  const auth = Buffer.from(`:${pat}`).toString("base64");

  const response = await fetch(`https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (!response.ok) throw new AdoRequestError(`ADO request failed: ${response.status}`, response.status);
  return response.json();
}

export function toTicketSummary(workItem: AdoWorkItem) {
  const fields = workItem.fields;
  const workItemType = fields["System.WorkItemType"];
  const status = mapStatus(fields["System.State"], workItemType);

  return {
    id: workItem.id,
    title: String(fields["System.Title"] ?? `Ticket ${workItem.id}`),
    status,
    priority: mapPriority(fields["Microsoft.VSTS.Common.Priority"] ?? fields["Custom.Priority"]),
    createdDate: String(fields["System.CreatedDate"] ?? ""),
    lastUpdated: String(fields["System.ChangedDate"] ?? fields["System.CreatedDate"] ?? ""),
    progress: progressFor(status, workItemType)
  };
}

export function toTicketDetail(workItem: AdoWorkItem, comments: AdoComment[], revisions: AdoRevision[]) {
  const summary = toTicketSummary(workItem);
  const fields = workItem.fields;

  return {
    ...summary,
    description: sanitize(fields["System.Description"] ?? fields["Custom.CustomerDescription"]),
    timeline: revisions
      .map((revision) => revision.fields ?? {})
      .filter((fields) => fields["System.State"] && fields["System.ChangedDate"])
      .map((fields) => ({
        status: mapStatus(fields["System.State"], workItem.fields["System.WorkItemType"]),
        date: String(fields["System.ChangedDate"])
      }))
      .filter((item, index, items) => items.findIndex((candidate) => candidate.status === item.status) === index),
    updates: comments
      .filter(
        (comment) =>
          !comment.isDeleted &&
          comment.text &&
          /\[customer\]/i.test(comment.text) &&
          !internalPatterns.some((pattern) => pattern.test(comment.text ?? ""))
      )
      .map((comment) => ({
        authorName: comment.createdBy?.displayName ? "Support Team" : undefined,
        body: sanitize(comment.text).replace(/\[customer\]/gi, "").trim(),
        createdDate: String(comment.createdDate ?? "")
      })),
    sla: buildSla(fields)
  };
}

export function applyTicketFilters<T extends ReturnType<typeof toTicketSummary>>(tickets: T[], filters: TicketFilters): T[] {
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

export function getMockTickets(customerId: string, filters: TicketFilters) {
  const items = mockWorkItems.filter((item) => String(item.fields["Custom.CustomerId"]).toLowerCase() === customerId.toLowerCase());
  return applyTicketFilters(items.map(toTicketSummary), filters);
}

export function getMockTicket(customerId: string, id: number) {
  const item = mockWorkItems.find(
    (workItem) => workItem.id === id && String(workItem.fields["Custom.CustomerId"]).toLowerCase() === customerId.toLowerCase()
  );
  return item ? toTicketDetail(item, mockComments[id] ?? [], mockRevisions[id] ?? []) : undefined;
}

function mapStatus(stateValue: unknown, workItemTypeValue?: unknown): CustomerStatus {
  const state = String(stateValue ?? "").toLowerCase();
  const workItemType = String(workItemTypeValue ?? "").toLowerCase();

  if (workItemType.includes("major")) {
    if (state.includes("declared")) return "Declared";
    if (state.includes("identified")) return "Identified";
    if (state.includes("mitigated")) return "Mitigated";
    if (state.includes("monitoring")) return "Monitoring";
    if (state.includes("resolved")) return "Monitoring";
  }

  if (state.includes("closed") || state.includes("done") || state.includes("completed")) return "Closed";
  if (state.includes("resolved")) return "Resolved";
  if (state.includes("waiting") || state.includes("blocked") || state.includes("hold")) return "Waiting";
  if (state.includes("active") || state.includes("investigat") || state.includes("committed")) return "Investigating";
  return "New";
}

function mapPriority(value: unknown): CustomerPriority {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "1" || raw.includes("p1") || raw.includes("critical")) return "P1";
  if (raw === "2" || raw.includes("p2") || raw.includes("high")) return "P2";
  if (raw === "3" || raw.includes("p3") || raw.includes("medium") || raw.includes("normal")) return "P3";
  return "Unknown";
}

function progressFor(status: CustomerStatus, workItemType: unknown): number {
  const flow = String(workItemType ?? "").toLowerCase().includes("major") ? majorFlow : standardFlow;
  const index = flow.indexOf(status);
  return index === -1 ? 0 : Math.round((index / (flow.length - 1)) * 100);
}

function sanitize(value: unknown): string {
  return String(value ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .split(/\r?\n/)
    .filter((line) => !internalPatterns.some((pattern) => pattern.test(line)))
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildSla(fields: Record<string, unknown>) {
  const priority = mapPriority(fields["Microsoft.VSTS.Common.Priority"] ?? fields["Custom.Priority"]);
  const dueDate = fields["Custom.SlaDueDate"] ?? fields["Microsoft.VSTS.Scheduling.DueDate"];
  if (priority === "Unknown" && !dueDate) return undefined;
  const dueTime = dueDate ? Date.parse(String(dueDate)) : Number.NaN;
  const atRisk = priority === "P1" || priority === "P2" || (Number.isFinite(dueTime) && dueTime < Date.now());
  return { atRisk, dueDate: dueDate ? String(dueDate) : undefined, label: atRisk ? "SLA attention required" : "SLA tracking" };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getConfiguredWorkItemTypes(): string[] {
  const configured = process.env.ADO_WORK_ITEM_TYPES?.split(",").map((type) => type.trim()).filter(Boolean);
  if (configured?.length) return configured;

  return ["Incident", "Major Incident", "Service Request", "Operational Task", "Task", "User Story", "Feature", "Epic", "Bug", "Issue"];
}

const mockWorkItems: AdoWorkItem[] = [
  {
    id: 2401,
    fields: {
      "System.Title": "Unable to access finance portal",
      "System.State": "Investigating",
      "System.WorkItemType": "Incident",
      "System.CreatedDate": "2026-04-28T22:10:00.000Z",
      "System.ChangedDate": "2026-05-01T01:30:00.000Z",
      "System.Description": "<p>Users are seeing an access denied message after login.</p>",
      "Microsoft.VSTS.Common.Priority": 1,
      "Custom.CustomerId": "contoso",
      "Custom.SlaDueDate": "2026-05-01T04:00:00.000Z"
    }
  },
  {
    id: 2412,
    fields: {
      "System.Title": "New starter laptop request",
      "System.State": "Waiting on Customer",
      "System.WorkItemType": "Service Request",
      "System.CreatedDate": "2026-04-25T03:45:00.000Z",
      "System.ChangedDate": "2026-04-30T23:12:00.000Z",
      "System.Description": "<p>Provision laptop and standard application bundle.</p>",
      "Microsoft.VSTS.Common.Priority": 3,
      "Custom.CustomerId": "contoso"
    }
  }
];

const mockComments: Record<number, AdoComment[]> = {
  2401: [{ text: "[customer] We have confirmed the issue and are reviewing access logs.", createdDate: "2026-05-01T00:10:00.000Z" }],
  2412: [{ text: "[customer] Waiting for confirmation of delivery address.", createdDate: "2026-04-30T23:12:00.000Z" }]
};

const mockRevisions: Record<number, AdoRevision[]> = {
  2401: [
    { fields: { "System.State": "New", "System.ChangedDate": "2026-04-28T22:10:00.000Z" } },
    { fields: { "System.State": "Investigating", "System.ChangedDate": "2026-04-28T22:30:00.000Z" } }
  ],
  2412: [
    { fields: { "System.State": "New", "System.ChangedDate": "2026-04-25T03:45:00.000Z" } },
    { fields: { "System.State": "Waiting on Customer", "System.ChangedDate": "2026-04-30T23:12:00.000Z" } }
  ]
};
