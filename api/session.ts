import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAllowedUserAccess, getMappedCustomerForUser, isUserCustomerMapConfigured } from "./shared";

app.http("session", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "session",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const access = getAllowedUserAccess(request.headers);
      const customer = access.allowed ? getMappedCustomerForUser(access.user?.userDetails) : undefined;
      const customerMapConfigured = isUserCustomerMapConfigured();
      return json(
        {
          authenticated: access.authenticated,
          allowed: access.allowed,
          reason: access.reason,
          user: access.user,
          customer,
          customerAuthMode: access.allowed ? getCustomerAuthMode(Boolean(customer), customerMapConfigured) : undefined
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

function getCustomerAuthMode(
  customerMapped: boolean,
  customerMapConfigured: boolean
): "entra-user-map" | "not-configured" | "customer-token" {
  if (customerMapped) return "entra-user-map";
  return customerMapConfigured ? "not-configured" : "customer-token";
}
