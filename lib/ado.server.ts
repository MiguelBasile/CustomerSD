import type { AdoComment, AdoRevision, AdoWorkItem, TicketFilters } from "./types";

const CUSTOMER_FIELDS = [
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

export async function adoFetch(path: string, init: RequestInit = {}) {
  const org = requiredEnv("ADO_ORG");
  const project = requiredEnv("ADO_PROJECT");
  const pat = requiredEnv("ADO_PAT");
  const auth = Buffer.from(`:${pat}`).toString("base64");

  const res = await fetch(`https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (!res.ok) {
    throw new Error(`ADO request failed: ${res.status}`);
  }

  return res.json();
}

export async function getCustomerWorkItems(customerId: string, filters: TicketFilters): Promise<AdoWorkItem[]> {
  const customerField = process.env.ADO_CUSTOMER_FIELD || "Custom.CustomerId";
  const conditions = [
    `[${customerField}] = '${escapeWiql(customerId)}'`,
    "[System.WorkItemType] IN ('Incident', 'Major Incident', 'Service Request', 'Operational Task', 'Bug', 'Issue')"
  ];

  const wiql = {
    query: `
      SELECT [System.Id]
      FROM WorkItems
      WHERE ${conditions.join(" AND ")}
      ORDER BY [System.ChangedDate] DESC
    `
  };

  const result = await adoFetch("wit/wiql?api-version=7.1", {
    method: "POST",
    body: JSON.stringify(wiql)
  });

  const ids = (result.workItems ?? []).map((item: { id: number }) => item.id).slice(0, 200);
  if (ids.length === 0) return [];

  return getWorkItems(ids, [...CUSTOMER_FIELDS, customerField]);
}

export async function getCustomerWorkItemById(customerId: string, id: number): Promise<AdoWorkItem | undefined> {
  const customerField = process.env.ADO_CUSTOMER_FIELD || "Custom.CustomerId";
  const workItem = await getWorkItem(id, [...CUSTOMER_FIELDS, customerField]);
  const owner = String(workItem.fields[customerField] ?? "").toLowerCase();

  if (owner !== customerId.toLowerCase()) {
    return undefined;
  }

  return workItem;
}

export async function getWorkItemComments(id: number): Promise<AdoComment[]> {
  const result = await adoFetch(`wit/workItems/${id}/comments?api-version=7.1-preview.4`);
  return result.comments ?? [];
}

export async function getWorkItemRevisions(id: number): Promise<AdoRevision[]> {
  const result = await adoFetch(`wit/workItems/${id}/revisions?api-version=7.1`);
  return result.value ?? [];
}

async function getWorkItems(ids: number[], fields: string[]): Promise<AdoWorkItem[]> {
  const path = `wit/workitems?ids=${ids.join(",")}&fields=${fields.map(encodeURIComponent).join(",")}&api-version=7.1`;
  const result = await adoFetch(path);
  return result.value ?? [];
}

async function getWorkItem(id: number, fields: string[]): Promise<AdoWorkItem> {
  const path = `wit/workitems/${id}?fields=${fields.map(encodeURIComponent).join(",")}&api-version=7.1`;
  return adoFetch(path);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function escapeWiql(value: string): string {
  return value.replace(/'/g, "''");
}
