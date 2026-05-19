# ADO Customer Dashboard

Secure customer-facing dashboard for Azure DevOps tickets.

## Architecture

- Next.js exports the customer UI as static HTML/CSS/JS into `out/`.
- Azure Static Web Apps serves the static UI on the free tier.
- Managed Azure Functions in `api/` serve `/api/tickets` and `/api/tickets/{id}`.
- Azure Functions also serve `/api/ado/status` so you can verify that the configured ADO PAT can reach the project.
- The browser never calls Azure DevOps directly.
- Azure DevOps remains the system of record. The app does not store ticket state.
- API responses are allowlisted customer DTOs, not raw ADO work items.

## Local Development

Use Node.js 22 for the web app and the Functions API. The repo includes `.nvmrc`, root `package.json` engines, API `package.json` engines, and Static Web Apps `apiRuntime: node:22` so local, CI, and Azure Functions runtime settings agree.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy UI env values:

   ```bash
   copy .env.example .env.local
   ```

3. Start the UI:

   ```bash
   npm run dev
   ```

4. Open:

   ```text
   http://localhost:3000
   ```

Mock mode is enabled by default. To use real ADO data, set `NEXT_PUBLIC_MOCK_MODE=false`, `MOCK_MODE=false`, fill in the ADO env vars, and run Azure Functions with:

```bash
npm run dev:api
```

For local Functions settings, copy `api/local.settings.example.json` to `api/local.settings.json`.

The ADO PAT belongs only in `api/local.settings.json` or Azure Static Web App application settings. It is never entered into the dashboard UI.

## Required Environment Variables

```env
ADO_ORG=
ADO_PROJECT=
ADO_PAT=
ADO_CUSTOMER_FIELD=Custom.CustomerId
CUSTOMER_TOKEN_SECRET=
NEXT_PUBLIC_MOCK_MODE=true
MOCK_MODE=true
```

`NEXT_PUBLIC_MOCK_MODE` is a build-time frontend value. All ADO and token settings are server-side Function settings in Azure.

## Customer Token

The MVP token format is:

```text
base64url({"customerId":"contoso","exp":1893456000}).base64url(hmacSha256(payload, CUSTOMER_TOKEN_SECRET))
```

Use the token as:

```http
Authorization: Bearer <token>
```

or paste it into the dashboard token field.
The dashboard stores the token in browser local storage for the MVP preview and does not put it in ticket URLs.

Create a local customer token:

```powershell
$env:CUSTOMER_TOKEN_SECRET="replace-with-your-secret"
npm run token:create -- contoso 30 "Contoso"
```

Then paste the generated customer token into the dashboard when mock mode is off.

For local-only preview without manually pasting a token, set `LOCAL_DEV_CUSTOMER_ID` in `.env.local`. Do not configure this setting in Azure production.

## ADO API Functions

- `GET /api/tickets` uses the server-side `ADO_PAT`, filters by `ADO_CUSTOMER_FIELD`, and returns customer-safe ticket summaries.
- `GET /api/tickets/{id}` uses the server-side `ADO_PAT`, confirms the ticket belongs to that customer, and returns customer-safe detail, timeline, comments, and SLA data.
- `GET /api/ado/status` uses the server-side `ADO_PAT` to confirm the ADO project and fields endpoint are reachable. It returns only connection metadata, never the PAT.

## Azure Static Web Apps

- App location: `/`
- API location: `api`
- Build command: `npm run build`
- Output location: `out`
- API build command: `npm run build`
- Node.js build/runtime target: `22`
- Managed Functions runtime: `node:22`
- Configure Static Web App application settings for `ADO_ORG`, `ADO_PROJECT`, `ADO_PAT`, `ADO_CUSTOMER_FIELD`, `ADO_WORK_ITEM_TYPES`, `CUSTOMER_TOKEN_SECRET`, and `MOCK_MODE=false`.

The free tier can host the exported static app and managed Azure Functions API together. Secrets must be configured as Static Web App application settings, never as `NEXT_PUBLIC_*` variables.

The included GitHub Actions workflow is manual-only until you add `AZURE_STATIC_WEB_APPS_API_TOKEN` as a repository secret. Runtime API secrets still need to be configured on the Azure Static Web Apps resource.

## Microsoft Entra ID

Azure Static Web Apps built-in Microsoft Entra sign-in is configured at the route layer:

- `/` and `/ticket?id={ticketId}` require the SWA `authenticated` role.
- Unauthenticated UI requests redirect to `/.auth/login/aad`.
- `/login` redirects to `/.auth/login/aad`.
- `/logout` redirects to `/.auth/logout`.
- `/.auth/*` remains reachable so the SWA authentication callbacks work.
- `/api/*` remains reachable at the SWA layer because the Functions validate the signed customer token and return customer-scoped DTOs.

This adds an Entra gate in front of the static dashboard, but it does not replace customer-token authorization. Customers still need a valid customer token for API data access, and the token is still sent only in request headers.

The built-in Entra provider works without committing client IDs or secrets. If you later need to restrict sign-in to a specific tenant through a custom Entra app registration, use the Static Web Apps Standard plan and add an `auth.identityProviders.azureActiveDirectory` block in `staticwebapp.config.json` that references app settings for the client ID and secret. Use these callback URLs in the Entra app registration after the SWA URL exists:

```text
https://<your-static-web-app-host>/.auth/login/aad/callback
https://<your-static-web-app-host>/.auth/logout/aad/callback
```

## Security Notes

- The frontend imports only customer-safe DTO types and mock data.
- Real ADO access exists only in `api/shared.ts`, which is imported by Azure Functions only.
- API responses use allowlist mapping, so internal ADO fields, assignee emails, security notes, and internal comments are never serialized to customers.
- Customer comments must be explicitly tagged `[customer]`; `[internal]`, `[private]`, `[security]`, and deleted comments are blocked.
