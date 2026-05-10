"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import useSWR from "swr";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TicketFilters as TicketFiltersControl } from "./ticket-filters";
import { StatusProgress } from "./status-progress";
import { getMockTickets } from "@/lib/mock-data";
import type { CustomerTicketSummary, TicketFilters } from "@/lib/types";

type TicketListResponse = {
  tickets: CustomerTicketSummary[];
};

const mockMode = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

export function TicketList() {
  const [filters, setFilters] = useState<TicketFilters>({});
  const [token, setToken] = useState(() => readStoredToken());
  const query = useMemo(() => new URLSearchParams(compactFilters(filters)).toString(), [filters]);
  const url = query ? `/api/tickets?${query}` : "/api/tickets";

  const { data, error, isLoading } = useSWR<TicketListResponse, Error, [string, string] | null>(
    mockMode ? null : [url, token],
    ([requestUrl, customerToken]: [string, string]) => fetchJson(requestUrl, customerToken)
  );

  const tickets = mockMode ? getMockTickets("contoso", filters) : data?.tickets ?? [];
  const totalTickets = tickets.length;
  const urgentTickets = tickets.filter((ticket) => ticket.priority === "P1" || ticket.priority === "P2").length;
  const activeTickets = tickets.filter((ticket) => !["Resolved", "Closed"].includes(ticket.status)).length;
  const waitingTickets = tickets.filter((ticket) => ticket.status === "Waiting").length;
  const recentlyUpdated = [...tickets]
    .sort((left, right) => new Date(right.lastUpdated).getTime() - new Date(left.lastUpdated).getTime())
    .slice(0, 5);
  const attentionTickets = tickets.filter((ticket) => ticket.priority === "P1" || ticket.priority === "P2").slice(0, 4);
  const waitingList = tickets.filter((ticket) => ticket.status === "Waiting").slice(0, 3);

  function updateToken(nextToken: string) {
    setToken(nextToken);
    if (nextToken) {
      window.localStorage.setItem("customerAccessToken", nextToken);
    } else {
      window.localStorage.removeItem("customerAccessToken");
    }
  }

  return (
    <div className="dashboard-shell">
      <div className="summary-grid">
        <SummaryCard label="Visible tickets" value={totalTickets} helper="Current customer scope" tone="accent" />
        <SummaryCard label="Active work" value={activeTickets} helper="Open or in progress" tone="active" />
        <SummaryCard label="P1 / P2 attention" value={urgentTickets} helper="High priority" tone="urgent" />
        <SummaryCard label="Waiting warning" value={waitingTickets} helper="Customer response due" tone="waiting" />
      </div>

      <div className="dashboard-grid">
        <section className="panel dashboard-panel">
          {!mockMode && (
            <div className="token-bar">
              <div className="field">
                <label htmlFor="token">Customer access token</label>
                <input
                  id="token"
                  type="password"
                  autoComplete="off"
                  placeholder="Paste token"
                  value={token}
                  onChange={(event) => updateToken(event.target.value)}
                />
              </div>
              <button className="button secondary" type="button" onClick={() => updateToken("")}>
                Clear
              </button>
            </div>
          )}

          <div className="work-header">
            <div>
              <h2>My Active Work Area</h2>
              <p>Operate the current ticket queue and drill into detail without exposing internal notes or assignments.</p>
            </div>
            <div className="work-actions" aria-label="Ticket table actions">
              <button className="button secondary" type="button">Columns</button>
              <button className="button secondary" type="button">Export CSV</button>
            </div>
          </div>

          <TicketFiltersControl filters={filters} onChange={setFilters} />

          <div className="view-tabs" aria-label="Ticket views">
            <span className="view-tab active">My Active - {activeTickets}</span>
            <span className="view-tab">Waiting on Customer - {waitingTickets}</span>
            <span className="view-tab">Needs Action - {urgentTickets}</span>
            <span className="view-tab">Recently Updated - {recentlyUpdated.length}</span>
          </div>

          {error && <div className="error">Unable to load tickets. Check your customer token or try again.</div>}
          {isLoading && <div className="empty">Loading tickets...</div>}
          {!isLoading && !error && tickets.length === 0 && <div className="empty">No tickets match these filters.</div>}

          {tickets.length > 0 && (
            <table className="ticket-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="ticket-id">#{ticket.id}</td>
                    <td>
                      <Link className="ticket-title" href={`/ticket?id=${ticket.id}`}>
                        {ticket.title}
                      </Link>
                      <div className="ticket-subtitle">Customer-visible Azure DevOps record</div>
                    </td>
                    <td>
                      <span className="badge">{ticket.status}</span>
                      <StatusProgress status={ticket.status} progress={ticket.progress} />
                    </td>
                    <td>
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td>{formatRelative(ticket.lastUpdated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <aside className="rail-stack" aria-label="Customer ticket highlights">
          <RailCard title="Waiting on Customer" description="Tickets at risk of stalling because the next response is due.">
            {waitingList.length === 0 ? (
              <div className="rail-item">
                <strong>No waiting tickets</strong>
                <span>Nothing currently needs a customer response.</span>
              </div>
            ) : (
              waitingList.map((ticket) => <RailTicket key={ticket.id} ticket={ticket} />)
            )}
          </RailCard>

          <RailCard title="Needs Action" description="Critical and high-risk items elevated by priority or SLA posture.">
            {attentionTickets.length === 0 ? (
              <div className="rail-item">
                <strong>No elevated tickets</strong>
                <span>P1 and P2 queues are clear for this customer view.</span>
              </div>
            ) : (
              attentionTickets.map((ticket) => <RailTicket key={ticket.id} ticket={ticket} showPriority />)
            )}
          </RailCard>

          <RailCard title="Recent Activity" description="Latest customer-safe changes from Azure DevOps.">
            {recentlyUpdated.map((ticket) => (
              <Link
                aria-label={`Open recently updated ticket ${ticket.id}`}
                className="activity-item"
                href={`/ticket?id=${ticket.id}`}
                key={ticket.id}
              >
                <strong>#{ticket.id} updated</strong>
                <span>{ticket.status} - {formatRelative(ticket.lastUpdated)}</span>
              </Link>
            ))}
          </RailCard>
        </aside>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  tone
}: {
  label: string;
  value: number;
  helper: string;
  tone: "accent" | "active" | "urgent" | "waiting";
}) {
  return (
    <div className={`summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
      <div className="metric-delta">Live</div>
    </div>
  );
}

function RailCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="panel rail-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="rail-list">{children}</div>
    </section>
  );
}

function RailTicket({
  ticket,
  showPriority = false
}: {
  ticket: CustomerTicketSummary;
  showPriority?: boolean;
}) {
  return (
    <Link aria-label={`Open highlighted ticket ${ticket.id}`} className="rail-item" href={`/ticket?id=${ticket.id}`}>
      <strong>#{ticket.id} - {ticket.title}</strong>
      <span>
        {ticket.status}
        {showPriority ? ` - ${ticket.priority}` : ""} - {formatRelative(ticket.lastUpdated)}
      </span>
    </Link>
  );
}

function readStoredToken(): string {
  if (mockMode || typeof window === "undefined") return "";
  return window.localStorage.getItem("customerAccessToken") ?? "";
}

function PriorityBadge({ priority }: { priority: CustomerTicketSummary["priority"] }) {
  const className = priority === "P1" ? "badge danger" : priority === "P2" ? "badge warning" : "badge";
  return <span className={className}>{priority}</span>;
}

function compactFilters(filters: TicketFilters): Record<string, string> {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value))) as Record<string, string>;
}

async function fetchJson(url: string, token: string): Promise<TicketListResponse> {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });

  if (!response.ok) throw new Error("Ticket request failed");
  return response.json();
}

function formatRelative(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${formatDistanceToNow(date, { addSuffix: true })}`;
}
