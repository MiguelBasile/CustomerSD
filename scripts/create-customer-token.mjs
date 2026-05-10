import crypto from "node:crypto";

const [customerId, daysArg = "30", name = customerId] = process.argv.slice(2);
const secret = process.env.CUSTOMER_TOKEN_SECRET;

if (!customerId || !secret) {
  console.error("Usage: CUSTOMER_TOKEN_SECRET=<secret> node scripts/create-customer-token.mjs <customerId> [days] [name]");
  process.exit(1);
}

const days = Number(daysArg);
const payload = {
  customerId,
  name,
  exp: Math.floor(Date.now() / 1000) + Math.max(1, Number.isFinite(days) ? days : 30) * 24 * 60 * 60
};

const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
const signature = crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");

console.log(`${payloadPart}.${signature}`);
