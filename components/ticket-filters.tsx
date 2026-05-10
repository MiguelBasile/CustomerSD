"use client";

import type { CustomerPriority, CustomerStatus, TicketFilters } from "@/lib/types";

const statuses: Array<CustomerStatus | ""> = ["", "New", "Investigating", "Waiting", "Resolved", "Closed"];
const priorities: Array<CustomerPriority | ""> = ["", "P1", "P2", "P3"];

export function TicketFilters({
  filters,
  onChange
}: {
  filters: TicketFilters;
  onChange: (next: TicketFilters) => void;
}) {
  return (
    <div className="toolbar">
      <div className="field">
        <label htmlFor="search">Search</label>
        <input
          id="search"
          placeholder="Ticket ID or title"
          value={filters.search ?? ""}
          onChange={(event) => onChange({ ...filters, search: event.target.value || undefined })}
        />
      </div>
      <div className="field">
        <label htmlFor="status">Status</label>
        <select
          id="status"
          value={filters.status ?? ""}
          onChange={(event) => onChange({ ...filters, status: (event.target.value || undefined) as TicketFilters["status"] })}
        >
          {statuses.map((status) => (
            <option key={status || "all"} value={status}>
              {status || "All"}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="priority">Priority</label>
        <select
          id="priority"
          value={filters.priority ?? ""}
          onChange={(event) =>
            onChange({ ...filters, priority: (event.target.value || undefined) as TicketFilters["priority"] })
          }
        >
          {priorities.map((priority) => (
            <option key={priority || "all"} value={priority}>
              {priority || "All"}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="from">From</label>
        <input id="from" type="date" value={filters.from ?? ""} onChange={(event) => onChange({ ...filters, from: event.target.value || undefined })} />
      </div>
      <div className="field">
        <label htmlFor="to">To</label>
        <input id="to" type="date" value={filters.to ?? ""} onChange={(event) => onChange({ ...filters, to: event.target.value || undefined })} />
      </div>
    </div>
  );
}
