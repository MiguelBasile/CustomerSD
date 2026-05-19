import { describe, expect, it } from "vitest";
import {
  getAllowedUserAccess,
  getMappedCustomerForUser,
  parseAllowedUserUpns,
  parseSwaClientPrincipal,
  parseUserCustomerMap,
  resolveCustomerPrincipal,
  verifyCustomerToken
} from "./shared";

describe("Static Web Apps allowed user access", () => {
  it("parses allowed user UPNs case-insensitively", () => {
    expect(parseAllowedUserUpns(" Miguel.Basile@FiveTwo.nz, janicebasile@fivetwo.nz ")).toEqual([
      "miguel.basile@fivetwo.nz",
      "janicebasile@fivetwo.nz"
    ]);
  });

  it("parses user-to-customer mappings while preserving customer ids", () => {
    expect(parseUserCustomerMap(" Miguel.Basile@FiveTwo.nz=FiveTwo, janicebasile@fivetwo.nz=fivetwo ")).toEqual([
      { userDetails: "miguel.basile@fivetwo.nz", customerId: "FiveTwo", displayName: "FiveTwo" },
      { userDetails: "janicebasile@fivetwo.nz", customerId: "fivetwo", displayName: "fivetwo" }
    ]);
  });

  it("parses the SWA client principal header", () => {
    const headers = principalHeaders("Miguel.Basile@FiveTwo.nz");

    expect(parseSwaClientPrincipal(headers)?.userDetails).toBe("Miguel.Basile@FiveTwo.nz");
  });

  it("treats a missing principal as unauthenticated", () => {
    expect(getAllowedUserAccess(new Headers(), liveEnv()).status).toBe(401);
  });

  it("treats a malformed principal as unauthenticated", () => {
    const headers = new Headers({ "x-ms-client-principal": "not-valid-base64-json" });

    expect(getAllowedUserAccess(headers, liveEnv()).status).toBe(401);
  });

  it("rejects a signed-in user who is not allowlisted", () => {
    const access = getAllowedUserAccess(principalHeaders("other@fivetwo.nz"), liveEnv());

    expect(access.status).toBe(403);
    expect(access.allowed).toBe(false);
  });

  it("rejects missing allowlist configuration", () => {
    const access = getAllowedUserAccess(principalHeaders("miguel.basile@fivetwo.nz"), liveEnv({ ALLOWED_USER_UPNS: "" }));

    expect(access.status).toBe(500);
    expect(access.reason).toBe("missing-allowlist");
  });

  it("allows signed-in users from the allowlist", () => {
    const access = getAllowedUserAccess(principalHeaders("Miguel.Basile@FiveTwo.nz"), liveEnv());

    expect(access.status).toBe(200);
    expect(access.allowed).toBe(true);
    expect(access.user?.userDetails).toBe("miguel.basile@fivetwo.nz");
  });

  it("maps an allowlisted user to a customer without a customer token", () => {
    const env = liveEnv({ USER_CUSTOMER_MAP: "miguel.basile@fivetwo.nz=fivetwo" });

    expect(getMappedCustomerForUser("Miguel.Basile@FiveTwo.nz", env)).toEqual({
      customerId: "fivetwo",
      displayName: "fivetwo"
    });
    expect(resolveCustomerPrincipal(principalHeaders("Miguel.Basile@FiveTwo.nz"), env)).toEqual({
      customerId: "fivetwo",
      displayName: "fivetwo"
    });
  });

  it("falls back to customer token auth when no user customer mapping exists", () => {
    const env = liveEnv({ USER_CUSTOMER_MAP: "", CUSTOMER_TOKEN_SECRET: "test-secret" });

    expect(() => resolveCustomerPrincipal(principalHeaders("Miguel.Basile@FiveTwo.nz"), env)).toThrow("Missing customer token");
  });

  it("blocks customer access when mappings are configured but the signed-in user is not mapped", () => {
    const env = liveEnv({ USER_CUSTOMER_MAP: "other@fivetwo.nz=other-customer", CUSTOMER_TOKEN_SECRET: "test-secret" });

    expect(() => resolveCustomerPrincipal(principalHeaders("Miguel.Basile@FiveTwo.nz"), env)).toThrow(
      "Customer access is not configured for this account"
    );
  });

  it("still requires the customer token after allowlist access succeeds", () => {
    const previousSecret = process.env.CUSTOMER_TOKEN_SECRET;
    const previousMockMode = process.env.MOCK_MODE;

    try {
      process.env.CUSTOMER_TOKEN_SECRET = "test-secret";
      process.env.MOCK_MODE = "false";

      expect(getAllowedUserAccess(principalHeaders("Miguel.Basile@FiveTwo.nz"), liveEnv()).allowed).toBe(true);
      expect(() => verifyCustomerToken(undefined)).toThrow("Missing customer token");
    } finally {
      restoreEnv("CUSTOMER_TOKEN_SECRET", previousSecret);
      restoreEnv("MOCK_MODE", previousMockMode);
    }
  });
});

function principalHeaders(userDetails: string): Headers {
  return new Headers({
    "x-ms-client-principal": Buffer.from(
      JSON.stringify({
        identityProvider: "aad",
        userId: "user-id",
        userDetails,
        userRoles: ["anonymous", "authenticated"]
      })
    ).toString("base64")
  });
}

function liveEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    MOCK_MODE: "false",
    NODE_ENV: "production",
    ALLOWED_USER_UPNS: "miguel.basile@fivetwo.nz,janicebasile@fivetwo.nz",
    ...overrides
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
