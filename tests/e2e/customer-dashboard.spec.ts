import { expect, test } from "@playwright/test";

type TicketSummary = {
  id: number;
  title: string;
  status: string;
  priority: string;
};

test.describe("customer dashboard regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/tickets", async (route) => {
      await route.fulfill({ json: { tickets: mockTickets } });
    });

    await page.route("**/api/tickets?**", async (route) => {
      await route.fulfill({ json: { tickets: mockTickets } });
    });

    await page.route("**/api/tickets/*", async (route) => {
      if (route.request().url().endsWith("/api/tickets/2401")) {
        await route.fulfill({ json: { ticket: mockTicketDetail } });
        return;
      }

      await route.fulfill({ status: 404, json: { error: "Ticket not found" } });
    });
  });

  test("renders the dashboard, summary cards, filters, and safe ticket links", async ({ page }) => {
    const firstTicket = mockTickets[0];
    const searchableWord = firstTicket.title.split(/\s+/).find((word) => word.length >= 4) ?? String(firstTicket.id);

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Support tickets" })).toBeVisible();
    await expect(page.getByText("Live source")).toBeVisible();
    await expect(page.getByText("Azure DevOps", { exact: true })).toBeVisible();
    await expect(page.locator(".summary-card.accent").getByText("Visible tickets")).toBeVisible();
    await expect(page.locator(".summary-card.active").getByText("Active")).toBeVisible();
    await expect(page.locator(".summary-card.urgent").getByText("P1 / P2")).toBeVisible();
    await expect(page.locator(".summary-card.waiting").getByText("Waiting")).toBeVisible();

    await expect(page.getByRole("link", { name: firstTicket.title })).toHaveAttribute("href", `/ticket?id=${firstTicket.id}`);

    await page.getByLabel("Search").fill(searchableWord);
    await expect(page.getByRole("link", { name: firstTicket.title })).toBeVisible();

    await page.getByLabel("Search").fill("");
    if (["P1", "P2", "P3"].includes(firstTicket.priority)) {
      await page.getByLabel("Priority").selectOption(firstTicket.priority);
      await expect(page.getByRole("link", { name: firstTicket.title })).toBeVisible();
    }
  });

  test("renders ticket detail without leaking internal fields or tokens", async ({ page }) => {
    const [firstTicket] = mockTickets;
    await page.goto(`/ticket?id=${firstTicket.id}`);

    await expect(page.getByRole("heading", { name: firstTicket.title })).toBeVisible();
    await expect(page.getByText(`Current status: ${firstTicket.status}`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Updates" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Status timeline" })).toBeVisible();

    const html = await page.content();
    expect(html).not.toContain("engineer@example.com");
    expect(html).not.toContain("SecurityNotes");
    expect(html).not.toContain("[internal]");
    expect(page.url()).not.toContain("token=");
  });

  test("handles missing ticket details cleanly", async ({ page }) => {
    await page.goto("/ticket?id=999999");
    await expect(page.getByText("Ticket not found.")).toBeVisible();
  });
});

const mockTickets: TicketSummary[] = [
  {
    id: 2401,
    title: "Unable to access finance portal",
    status: "Investigating",
    priority: "P1"
  }
];

const mockTicketDetail = {
  ...mockTickets[0],
  createdDate: "2026-04-28T22:10:00.000Z",
  lastUpdated: "2026-05-01T01:30:00.000Z",
  progress: 25,
  description: "Users are seeing an access denied message after login.",
  timeline: [
    { status: "New", date: "2026-04-28T22:10:00.000Z" },
    { status: "Investigating", date: "2026-04-28T22:30:00.000Z" }
  ],
  updates: [
    {
      authorName: "Support Team",
      body: "We have confirmed the issue and are reviewing conditional access logs.",
      createdDate: "2026-05-01T00:10:00.000Z"
    }
  ],
  sla: {
    atRisk: true,
    dueDate: "2026-05-01T04:00:00.000Z",
    label: "SLA attention required"
  }
};
