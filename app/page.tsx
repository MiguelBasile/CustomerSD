import { TicketList } from "@/components/ticket-list";

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="page-header ops-header">
        <div>
          <p className="eyebrow">FiveTwo customer operations</p>
          <h1>Support tickets</h1>
          <p className="lede">Track customer-visible tickets, live status, priority, updates, and SLA attention from Azure DevOps.</p>
        </div>
        <div className="command-bar" aria-label="Dashboard controls">
          <div className="command-pill">
            <span aria-hidden="true">[]</span>
            Last 7 days
          </div>
          <div className="command-pill">
            <span aria-hidden="true">*</span>
            Saved preset
          </div>
          <div className="command-pill search-pill">
            <span aria-hidden="true">#</span>
            Search ticket, title, or customer
          </div>
          <div className="user-chip">
            <strong>Customer</strong>
            <span>Live source</span>
            <em>Azure DevOps</em>
          </div>
        </div>
      </header>
      <TicketList />
    </main>
  );
}
