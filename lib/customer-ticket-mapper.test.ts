import { describe, expect, it } from "vitest";
import {
  applyTicketFilters,
  isCustomerSafeComment,
  mapAdoStateToCustomerStatus,
  sanitizeHtmlText,
  toTicketDetail
} from "./customer-ticket-mapper";

describe("customer ticket mapper", () => {
  it("maps incident and major incident states to customer statuses", () => {
    expect(mapAdoStateToCustomerStatus("Active", "Incident")).toBe("Investigating");
    expect(mapAdoStateToCustomerStatus("Waiting on Customer", "Incident")).toBe("Waiting");
    expect(mapAdoStateToCustomerStatus("Declared", "Major Incident")).toBe("Declared");
    expect(mapAdoStateToCustomerStatus("Mitigated", "Major Incident")).toBe("Mitigated");
    expect(mapAdoStateToCustomerStatus("Resolved", "Major Incident")).toBe("Monitoring");
  });

  it("sanitizes script tags and internal labels", () => {
    expect(sanitizeHtmlText("<p>Hello</p><script>alert(1)</script>\n[internal] Engineer note: secret")).toBe("Hello");
  });

  it("blocks internal comments", () => {
    expect(isCustomerSafeComment({ text: "[internal] private update" })).toBe(false);
    expect(isCustomerSafeComment({ text: "[customer] safe update" })).toBe(true);
    expect(isCustomerSafeComment({ text: "untagged support note" })).toBe(false);
  });

  it("allowlists detail fields and customer-safe updates", () => {
    const detail = toTicketDetail(
      {
        id: 1,
        fields: {
          "System.Title": "Portal issue",
          "System.State": "Resolved",
          "System.CreatedDate": "2026-01-01T00:00:00Z",
          "System.ChangedDate": "2026-01-02T00:00:00Z",
          "System.Description": "<p>Customer-visible description</p>",
          "System.AssignedTo": { uniqueName: "engineer@example.com" },
          "Custom.SecurityNotes": "do not leak"
        }
      },
      [{ text: "[customer] Fixed", createdDate: "2026-01-02T00:00:00Z" }, { text: "[internal] RCA" }]
    );

    expect(JSON.stringify(detail)).not.toContain("engineer@example.com");
    expect(JSON.stringify(detail)).not.toContain("SecurityNotes");
    expect(detail.updates).toHaveLength(1);
  });

  it("filters by search, status, priority, and date", () => {
    const tickets = [
      {
        id: 10,
        title: "Finance portal",
        status: "Investigating" as const,
        priority: "P1" as const,
        createdDate: "2026-01-01T00:00:00Z",
        lastUpdated: "2026-01-05T00:00:00Z",
        progress: 25
      }
    ];

    expect(applyTicketFilters(tickets, { search: "finance", status: "Investigating", priority: "P1", from: "2026-01-01" })).toHaveLength(1);
    expect(applyTicketFilters(tickets, { search: "missing" })).toHaveLength(0);
  });
});
