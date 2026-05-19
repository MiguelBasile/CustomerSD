"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import useSWR from "swr";
import { useState } from "react";
import { StatusProgress } from "./status-progress";
import { fetchDashboardSession } from "@/lib/dashboard-session";
import { getMockTicket } from "@/lib/mock-data";
import type { CustomerTicketDetail } from "@/lib/types";

type TicketDetailResponse = {
  ticket: CustomerTicketDetail;
};

const mockMode = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

export function TicketDetail({ ticketId: explicitTicketId }: { ticketId?: string }) {
  const searchParams = useSearchParams();
  const [token] = useState(() => readStoredToken());
  const ticketId = explicitTicketId ?? searchParams.get("id") ?? "";
  const id = Number(ticketId);
  const validId = Number.isInteger(id) && id > 0;
  const {
    data: session,
    error: sessionError,
    isLoading: isSessionLoading
  } = useSWR(mockMode ? null : "/api/session", fetchDashboardSession, { shouldRetryOnError: false });
  const accessAllowed = mockMode || session?.allowed === true;
  const requiresCustomerToken = !mockMode && accessAllowed && session?.customerAuthMode === "customer-token";
  const customerNotConfigured = !mockMode && accessAllowed && session?.customerAuthMode === "not-configured";
  const waitingForCustomerToken = requiresCustomerToken && !token;
  const canLoadTicket = mockMode || (validId && accessAllowed && !customerNotConfigured && !waitingForCustomerToken);

  const { data, error, isLoading } = useSWR<TicketDetailResponse, Error, [string, string] | null>(
    mockMode || !canLoadTicket ? null : [`/api/tickets/${ticketId}`, requiresCustomerToken ? token : ""],
    ([url, customerToken]: [string, string]) => fetchJson(url, customerToken)
  );

  const ticket = mockMode && validId ? getMockTicket("contoso", id) : data?.ticket;

  if (!validId) {
    return <div className="panel empty">Ticket not found.</div>;
  }

  if (!mockMode && isSessionLoading) {
    return <div className="panel empty">Checking access...</div>;
  }

  if (!mockMode && sessionError) {
    return <div className="panel error">Unable to verify access. Refresh the page or sign in again.</div>;
  }

  if (!mockMode && !accessAllowed) {
    return (
      <section className="panel empty">
        <h2>Access not authorized</h2>
        <p>Your signed-in account is not on the dashboard allowlist.</p>
        <a className="button secondary" href="/logout">Sign out</a>
      </section>
    );
  }

  if (customerNotConfigured) {
    return (
      <section className="panel empty">
        <h2>Customer access not configured</h2>
        <p>Your signed-in account is allowed into the dashboard but is not mapped to a customer.</p>
        <a className="button secondary" href="/logout">Sign out</a>
      </section>
    );
  }

  if (error?.message === "Ticket not found") {
    return <div className="panel empty">Ticket not found.</div>;
  }

  if (waitingForCustomerToken) {
    return <div className="panel empty">Customer access token required for this account.</div>;
  }

  if (error) {
    return (
      <div className="panel error">
        {requiresCustomerToken
          ? "Unable to load this ticket. Check your customer token or try again."
          : "Unable to load this ticket. Check the customer mapping or ADO permissions."}
      </div>
    );
  }

  if (isLoading || !ticket) {
    return <div className="panel empty">{mockMode && !ticket ? "Ticket not found." : "Loading ticket..."}</div>;
  }

  const major = ticket.timeline.some((item) => ["Declared", "Identified", "Mitigated", "Monitoring"].includes(item.status));

  return (
    <div className="stack">
      <Link href="/" className="button secondary" style={{ width: "fit-content", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
        Back to tickets
      </Link>

      <section className="panel detail-hero">
        <p className="eyebrow">Ticket #{ticket.id}</p>
        <h1>{ticket.title}</h1>
        <p className="lede">Current status: {ticket.status}</p>
      </section>

      <div className="detail-grid">
        <div className="stack">
          <section className="panel stack">
            <h2>Summary</h2>
            <div className="meta-grid">
              <Meta label="Status" value={ticket.status} />
              <Meta label="Priority" value={ticket.priority} />
              <Meta label="Created" value={formatDate(ticket.createdDate)} />
              <Meta label="Last updated" value={formatDate(ticket.lastUpdated)} />
            </div>
            <StatusProgress status={ticket.status} progress={ticket.progress} major={major} />
          </section>

          <section className="panel stack">
            <h2>Description</h2>
            <p className="description">{ticket.description || "No customer-visible description is available."}</p>
          </section>

          <section className="panel">
            <h2>Updates</h2>
            {ticket.updates.length === 0 && <p className="empty">No customer-visible updates yet.</p>}
            {ticket.updates.map((update, index) => (
              <div className="update" key={`${update.createdDate}-${index}`}>
                <div className="meta-label">{formatDate(update.createdDate)}</div>
                <p className="description">{update.body}</p>
              </div>
            ))}
          </section>
        </div>

        <aside className="stack">
          {ticket.sla && (
            <section className="panel stack">
              <h2>SLA</h2>
              <span className={ticket.sla.atRisk ? "badge danger" : "badge success"}>{ticket.sla.label}</span>
              {ticket.sla.dueDate && <Meta label="Due" value={formatDate(ticket.sla.dueDate)} />}
            </section>
          )}

          <section className="panel">
            <h2>Status timeline</h2>
            <div style={{ marginTop: 12 }}>
              {ticket.timeline.length === 0 && <p className="empty">Timeline is not available.</p>}
              {ticket.timeline.map((item) => (
                <div className="state-line" key={`${item.status}-${item.date}`}>
                  <span className="dot" />
                  <div>
                    <strong>{item.status}</strong>
                    <div className="meta-label">{formatDate(item.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function readStoredToken(): string {
  if (mockMode || typeof window === "undefined") return "";
  return window.localStorage.getItem("customerAccessToken") ?? "";
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="meta-label">{label}</div>
      <div className="meta-value">{value}</div>
    </div>
  );
}

async function fetchJson(url: string, token: string): Promise<TicketDetailResponse> {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });

  if (response.status === 404) throw new Error("Ticket not found");
  if (!response.ok) throw new Error("Ticket request failed");
  return response.json();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return format(date, "PP p");
}
