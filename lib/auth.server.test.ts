import { describe, expect, it } from "vitest";
import { createCustomerToken, verifyCustomerToken } from "./auth.server";

describe("customer token auth", () => {
  it("verifies signed customer tokens", () => {
    process.env.CUSTOMER_TOKEN_SECRET = "test-secret";
    const token = createCustomerToken({ customerId: "contoso", exp: Math.floor(Date.now() / 1000) + 60 }, "test-secret");

    expect(verifyCustomerToken(token)).toEqual({ customerId: "contoso", displayName: undefined });
  });

  it("rejects tampered tokens", () => {
    process.env.CUSTOMER_TOKEN_SECRET = "test-secret";
    const token = createCustomerToken({ customerId: "contoso" }, "test-secret");

    expect(() => verifyCustomerToken(`${token}x`)).toThrow("Invalid customer token");
  });
});
