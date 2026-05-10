import { applyTicketFilters, toTicketDetail, toTicketSummary } from "./customer-ticket-mapper";
import type { AdoComment, AdoRevision, AdoWorkItem, CustomerTicketDetail, CustomerTicketSummary, TicketFilters } from "./types";

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
  },
  {
    id: 2420,
    fields: {
      "System.Title": "Email delivery delay",
      "System.State": "Resolved",
      "System.WorkItemType": "Major Incident",
      "System.CreatedDate": "2026-04-26T11:05:00.000Z",
      "System.ChangedDate": "2026-04-30T18:20:00.000Z",
      "System.Description": "<p>Inbound email delivery was delayed for a subset of users.</p>",
      "Microsoft.VSTS.Common.Priority": 2,
      "Custom.CustomerId": "contoso"
    }
  }
];

const mockComments: Record<number, AdoComment[]> = {
  2401: [
    {
      text: "[customer] We have confirmed the issue and are reviewing conditional access logs.",
      createdDate: "2026-05-01T00:10:00.000Z",
      createdBy: { displayName: "Support Engineer" }
    },
    {
      text: "[internal] Engineer note: token trace attached.",
      createdDate: "2026-05-01T00:15:00.000Z",
      createdBy: { displayName: "Support Engineer" }
    }
  ],
  2412: [
    {
      text: "[customer] Waiting for confirmation of delivery address.",
      createdDate: "2026-04-30T23:12:00.000Z",
      createdBy: { displayName: "Service Desk" }
    }
  ],
  2420: [
    {
      text: "[customer] Mail flow has recovered and monitoring remains in place.",
      createdDate: "2026-04-30T18:20:00.000Z",
      createdBy: { displayName: "Major Incident Manager" }
    }
  ]
};

const mockRevisions: Record<number, AdoRevision[]> = {
  2401: [
    { fields: { "System.State": "New", "System.ChangedDate": "2026-04-28T22:10:00.000Z" } },
    { fields: { "System.State": "Investigating", "System.ChangedDate": "2026-04-28T22:30:00.000Z" } }
  ],
  2412: [
    { fields: { "System.State": "New", "System.ChangedDate": "2026-04-25T03:45:00.000Z" } },
    { fields: { "System.State": "Waiting on Customer", "System.ChangedDate": "2026-04-30T23:12:00.000Z" } }
  ],
  2420: [
    { fields: { "System.State": "New", "System.ChangedDate": "2026-04-26T11:05:00.000Z" } },
    { fields: { "System.State": "Declared", "System.ChangedDate": "2026-04-26T11:15:00.000Z" } },
    { fields: { "System.State": "Investigating", "System.ChangedDate": "2026-04-26T11:30:00.000Z" } },
    { fields: { "System.State": "Mitigated", "System.ChangedDate": "2026-04-30T17:40:00.000Z" } },
    { fields: { "System.State": "Resolved", "System.ChangedDate": "2026-04-30T18:20:00.000Z" } }
  ]
};

export function getMockTickets(customerId: string, filters: TicketFilters): CustomerTicketSummary[] {
  const customerField = process.env.ADO_CUSTOMER_FIELD || "Custom.CustomerId";
  const tickets = mockWorkItems
    .filter((item) => String(item.fields[customerField] ?? "").toLowerCase() === customerId.toLowerCase())
    .map(toTicketSummary);

  return applyTicketFilters(tickets, filters);
}

export function getMockTicket(customerId: string, id: number): CustomerTicketDetail | undefined {
  const customerField = process.env.ADO_CUSTOMER_FIELD || "Custom.CustomerId";
  const item = mockWorkItems.find(
    (workItem) =>
      workItem.id === id && String(workItem.fields[customerField] ?? "").toLowerCase() === customerId.toLowerCase()
  );

  if (!item) return undefined;
  return toTicketDetail(item, mockComments[id] ?? [], mockRevisions[id] ?? []);
}
