import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAllowedUserAccess } from "./shared";

app.http("session", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "session",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const access = getAllowedUserAccess(request.headers);
      return json(
        {
          authenticated: access.authenticated,
          allowed: access.allowed,
          reason: access.reason,
          user: access.user
        },
        access.status
      );
    } catch (error) {
      context.error(error);
      return json({ authenticated: false, allowed: false, error: "Unable to read dashboard session" }, 500);
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
