# Customer-Facing ADO Dashboard Architecture

## Code Review Notes

The existing internal developer dashboard is in:

```text
C:\Users\MiguelBasile\OneDrive - FiveTwo\ADO Dashboard
```

During implementation, the source tree was visible but OneDrive blocked file reads with `The cloud file provider is not running`. The review therefore could not inspect source contents line-by-line. The visible structure showed a Next.js app with API routes, dashboard pages, an ADO client package, domain logic, mock data, shared UI, and tests.

This customer dashboard is implemented separately in:

```text
C:\Users\MiguelBasile\OneDrive - FiveTwo\ADO customer Dashboard
```

That separation prevents customer routes from inheriting the developer dashboard's full ticket visibility.

## Refactored Architecture

- Next.js exports the customer UI as static files in `out/`.
- Azure Functions expose `/api/tickets` and `/api/tickets/{id}`.
- Azure Functions expose `/api/ado/status` for safe Entra-backed ADO connectivity checks.
- Azure Functions expose `/api/session` so the static UI can show the current allowlist access state.
- The repo targets Node.js 22 for local development, GitHub Actions builds, and the Static Web Apps managed Functions runtime.
- Azure Static Web Apps route rules require the built-in `authenticated` role for the static dashboard while leaving `/api/*` guarded by the Functions.
- Azure Functions call Azure DevOps REST APIs using a server-side Microsoft Entra service principal token.
- The browser never calls ADO and never receives raw ADO work items.
- ADO remains the system of record. No local ticket state is stored.
- `api/shared.ts` converts raw ADO work items into customer-safe DTOs through an allowlist and validates signed customer tokens.

## Updated Folder Structure

```text
app/
  page.tsx
  ticket/page.tsx
  globals.css
api/
  host.json
  package.json
  tsconfig.json
  shared.ts
  tickets/index.ts
  tickets/[id].ts
  ado/status.ts
components/
  status-progress.tsx
  ticket-detail.tsx
  ticket-filters.tsx
  ticket-list.tsx
lib/
  customer-ticket-mapper.ts
  mock-data.ts
  types.ts
public/
  staticwebapp.config.json
staticwebapp.config.json
package.json
next.config.mjs
.nvmrc
.env.example
README.md
```

## Secure API Snippet

```ts
const body = new URLSearchParams({
  client_id: process.env.ADO_ENTRA_CLIENT_ID!,
  client_secret: process.env.ADO_ENTRA_CLIENT_SECRET!,
  grant_type: "client_credentials",
  scope: "https://app.vssps.visualstudio.com/.default"
});

const tokenResponse = await fetch(
  `https://login.microsoftonline.com/${process.env.ADO_ENTRA_TENANT_ID}/oauth2/v2.0/token`,
  { method: "POST", body }
);
const { access_token } = await tokenResponse.json();

export async function adoFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(
    `https://dev.azure.com/${process.env.ADO_ORG}/${process.env.ADO_PROJECT}/_apis/${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers
      }
    }
  );

  if (!res.ok) throw new Error(`ADO request failed: ${res.status}`);
  return res.json();
}
```

## Ticket List Snippet

```tsx
const { data, error, isLoading } = useSWR(
  mockMode ? null : [url, token],
  ([requestUrl, customerToken]) => fetchJson(requestUrl, customerToken)
);

const tickets = mockMode ? getMockTickets("contoso", filters) : data?.tickets ?? [];
```

## Ticket Detail Snippet

```tsx
const { data } = useSWR(
  mockMode ? null : [`/api/tickets/${ticketId}`, token],
  ([url, customerToken]) => fetchJson(url, customerToken)
);

const ticket = mockMode ? getMockTicket("contoso", id) : data?.ticket;
```

## Security Controls

- ADO Entra client credentials are read only by `api/shared.ts` in Azure Functions.
- Azure Functions request ADO access tokens server-side and never return tokens or client secrets to the browser.
- Signed-in users are checked against `ALLOWED_USER_UPNS` before any ticket, status, or ADO data is returned.
- Customer tokens are verified on every API request.
- Customer filtering uses `ADO_CUSTOMER_FIELD`, defaulting to `Custom.Customer`.
- API responses include only ticket ID, title, customer-safe status, priority, created date, last updated date, progress, sanitized description, customer-safe updates, timeline, and SLA display data.
- Assignee emails, internal comments, security notes, raw ADO fields, and internal tags are never serialized.
- Real ADO comments are shown only when explicitly tagged `[customer]`; comments tagged `[internal]`, `[private]`, `[security]`, `internal note:`, or `engineer note:` are always blocked.
- Customer tokens are stored in browser local storage for MVP preview and are not placed in ticket URLs.

## Local Run

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
```

Mock mode is enabled by default. Real ADO mode requires Azure Functions:

```bash
npm run dev:api
```

## Azure Static Web Apps

- App location: `/`
- API location: `api`
- Build command: `npm run build`
- Output location: `out`
- API build command: `npm run build`
- Node.js build/runtime target: `22`
- API runtime: `node:22`
- Entra sign-in path: `/.auth/login/aad`
- Entra sign-out path: `/.auth/logout`
- Required SWA role: `authenticated`
- Configure app settings:
  - `ADO_ORG`
  - `ADO_PROJECT`
  - `ADO_AUTH_MODE=entra`
  - `ADO_ENTRA_TENANT_ID`
  - `ADO_ENTRA_CLIENT_ID`
  - `ADO_ENTRA_CLIENT_SECRET`
  - `ADO_ENTRA_SCOPE=https://app.vssps.visualstudio.com/.default`
  - `ADO_CUSTOMER_FIELD=Custom.Customer`
  - `ADO_WORK_ITEM_TYPES`
  - `ALLOWED_USER_UPNS`
  - `CUSTOMER_TOKEN_SECRET`
  - `MOCK_MODE=false`
