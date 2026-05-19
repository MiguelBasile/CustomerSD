export type DashboardSession = {
  authenticated: boolean;
  allowed: boolean;
  reason?: string;
  user?: {
    identityProvider?: string;
    userDetails: string;
    userId?: string;
  };
};

export async function fetchDashboardSession(): Promise<DashboardSession> {
  const response = await fetch("/api/session", {
    headers: {
      Accept: "application/json"
    }
  });
  const body = (await response.json().catch(() => ({}))) as Partial<DashboardSession>;

  if (response.status === 401 || response.status === 403) {
    return {
      authenticated: Boolean(body.authenticated),
      allowed: false,
      reason: body.reason,
      user: body.user
    };
  }

  if (!response.ok) {
    throw new Error("Dashboard session request failed");
  }

  return {
    authenticated: Boolean(body.authenticated),
    allowed: Boolean(body.allowed),
    reason: body.reason,
    user: body.user
  };
}
