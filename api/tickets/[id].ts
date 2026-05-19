import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  getCustomerWorkItemById,
  getWorkItemComments,
  getWorkItemRevisions,
  getBearerToken,
  verifyCustomerToken,
  AuthError,
  toTicketDetail,
  getMockTicket,
  verifyAllowedDashboardUser
} from "../shared";

app.http("ticketDetail", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tickets/{id:int}",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      verifyAllowedDashboardUser(request.headers);
      const principal = verifyCustomerToken(getBearerToken(request.headers));
      const id = Number(request.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return json({ error: "Invalid ticket id" }, 400);
      }

      if (process.env.MOCK_MODE === "true") {
        const ticket = getMockTicket(principal.customerId, id);
        return ticket ? json({ ticket }) : json({ error: "Ticket not found" }, 404);
      }

      const workItem = await getCustomerWorkItemById(principal.customerId, id);
      if (!workItem) {
        return json({ error: "Ticket not found" }, 404);
      }

      const [comments, revisions] = await Promise.all([getWorkItemComments(id).catch(() => []), getWorkItemRevisions(id).catch(() => [])]);
      return json({ ticket: toTicketDetail(workItem, comments, revisions) });
    } catch (error) {
      context.error(error);
      return errorResponse(error);
    }
  }
});

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

  return json({ error: "Unable to load customer ticket" }, 500);
}
