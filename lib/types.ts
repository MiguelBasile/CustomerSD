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

export type CustomerTicketSummary = {
  id: number;
  title: string;
  status: CustomerStatus;
  priority: CustomerPriority;
  createdDate: string;
  lastUpdated: string;
  progress: number;
};

export type CustomerTicketDetail = CustomerTicketSummary & {
  description: string;
  timeline: Array<{ status: CustomerStatus; date: string }>;
  updates: Array<{ authorName?: string; body: string; createdDate: string }>;
  sla?: { atRisk: boolean; dueDate?: string; label: string };
};

export type TicketFilters = {
  status?: CustomerStatus;
  priority?: CustomerPriority;
  from?: string;
  to?: string;
  search?: string;
};

export type CustomerPrincipal = {
  customerId: string;
  displayName?: string;
};

export type AdoWorkItem = {
  id: number;
  fields: Record<string, unknown>;
};

export type AdoComment = {
  text?: string;
  createdDate?: string;
  createdBy?: {
    displayName?: string;
    uniqueName?: string;
  };
  isDeleted?: boolean;
};

export type AdoRevision = {
  fields?: Record<string, unknown>;
};
