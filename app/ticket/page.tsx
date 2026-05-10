import { TicketDetail } from "@/components/ticket-detail";
import { Suspense } from "react";

export default function TicketPage() {
  return (
    <main className="page-shell">
      <Suspense fallback={<div className="panel empty">Loading ticket...</div>}>
        <TicketDetailFromQuery />
      </Suspense>
    </main>
  );
}

function TicketDetailFromQuery() {
  return <TicketDetail />;
}
