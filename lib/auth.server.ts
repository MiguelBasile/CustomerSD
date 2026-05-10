import crypto from "node:crypto";
import type { CustomerPrincipal } from "./types";

type TokenPayload = {
  customerId?: string;
  name?: string;
  exp?: number;
};

export function getBearerToken(headers: Headers | Record<string, string | undefined>): string | undefined {
  const authorization = getHeader(headers, "authorization");
  const tokenHeader = getHeader(headers, "x-customer-token");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return tokenHeader?.trim();
}

export function verifyCustomerToken(token: string | undefined): CustomerPrincipal {
  if (process.env.MOCK_MODE === "true" && !token) {
    return { customerId: "contoso", displayName: "Contoso" };
  }

  const secret = process.env.CUSTOMER_TOKEN_SECRET;
  if (!secret) {
    throw new AuthError("Customer token secret is not configured", 500);
  }

  if (!token) {
    throw new AuthError("Missing customer token", 401);
  }

  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    throw new AuthError("Invalid customer token", 401);
  }

  const expected = signPayload(payloadPart, secret);
  if (!timingSafeEqual(signaturePart, expected)) {
    throw new AuthError("Invalid customer token", 401);
  }

  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as TokenPayload;
  if (!payload.customerId) {
    throw new AuthError("Invalid customer token", 401);
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AuthError("Expired customer token", 401);
  }

  return { customerId: payload.customerId, displayName: payload.name };
}

export function createCustomerToken(payload: TokenPayload, secret: string): string {
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadPart}.${signPayload(payloadPart, secret)}`;
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function signPayload(payloadPart: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getHeader(headers: Headers | Record<string, string | undefined>, name: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1];
}
