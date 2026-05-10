import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  getBearerToken,
  verifyCustomerToken,
  AuthError,
  getCustomerWorkItems,
  applyTicketFilters,
  toTicketSummary,
  getMockTickets,
  type TicketFilters
} from "../shared";

app.http("tickets", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tickets",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const principal = verifyCustomerToken(getBearerToken(request.headers));
      const filters = readFilters(request);

      if (process.env.MOCK_MODE === "true") {
        return json({ tickets: getMockTickets(principal.customerId, filters) });
      }

      const workItems = await getCustomerWorkItems(principal.customerId);
      const tickets = applyTicketFilters(workItems.map(toTicketSummary), filters);
      return json({ tickets });
    } catch (error) {
      context.error(error);
      return errorResponse(error);
    }
  }
});

function readFilters(request: HttpRequest): TicketFilters {
  return {
    status: request.query.get("status") as TicketFilters["status"],
    priority: request.query.get("priority") as TicketFilters["priority"],
    from: request.query.get("from") ?? undefined,
    to: request.query.get("to") ?? undefined,
    search: request.query.get("search") ?? undefined
  };
}

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: {
      "Cache-Control": "no-store"
    }
  };
}

function errorResponse(error: unknown): HttpResponseInit {
  if (error instanceof AuthError) {
    return json({ error: error.message }, error.status);
  }

  return json({ error: "Unable to load customer tickets" }, 500);
}
