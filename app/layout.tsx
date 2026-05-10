import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Customer Support Dashboard",
  description: "Secure customer view of Azure DevOps support tickets"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="app-frame">
          <aside className="sidebar" aria-label="Customer dashboard navigation">
            <div className="brand-lockup">
              <div className="brand-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div>
                <strong>FiveTwo Customer Portal</strong>
                <span>Service visibility layer</span>
              </div>
            </div>

            <nav className="side-nav" aria-label="Dashboard sections">
              <p>Navigation</p>
              <Link className="active" href="/">
                Dashboard <span aria-hidden="true">&gt;</span>
              </Link>
              <Link href="/">Open Tickets</Link>
              <Link href="/">Major Incidents</Link>
              <Link href="/">SLA Watch</Link>
              <Link href="/">Waiting on Customer</Link>
              <Link href="/">Resolved</Link>
              <Link href="/">Reports</Link>
            </nav>

            <section className="saved-views" aria-label="Saved views">
              <h2>Saved Views</h2>
              <article>
                <strong>My Open Tickets</strong>
                <span>Customer-visible work still moving through support.</span>
              </article>
              <article>
                <strong>P1 / P2 Watch</strong>
                <span>High-priority records that need close attention.</span>
              </article>
              <article>
                <strong>Waiting Response</strong>
                <span>Tickets currently waiting on the next customer input.</span>
              </article>
              <article>
                <strong>Recently Updated</strong>
                <span>Fresh changes reflected directly from Azure DevOps.</span>
              </article>
            </section>

            <div className="role-card">
              <span>Role</span>
              <strong>Customer Viewer</strong>
              <small>Secure ticket view</small>
            </div>
          </aside>

          <div className="content-frame">{children}</div>
        </div>
      </body>
    </html>
  );
}
