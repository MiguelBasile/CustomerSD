# ADO Customer Dashboard

Secure customer-facing dashboard for Azure DevOps tickets.

## Architecture

- Next.js exports the customer UI as static HTML/CSS/JS into `out/`.
- Azure Static Web Apps serves the static UI on the free tier.
- Managed Azure Functions in `api/` serve `/api/tickets` and `/api/tickets/{id}`.
- Azure Functions also serve `/api/ado/status` so you can verify that the configured Entra service principal can reach the ADO project.
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

Mock mode is enabled by default. To use real ADO data, set `NEXT_PUBLIC_MOCK_MODE=false`, `MOCK_MODE=false`, fill in the ADO and Entra env vars, and run Azure Functions with:

```bash
npm run dev:api
```

For local Functions settings, copy `api/local.settings.example.json` to `api/local.settings.json`.

ADO access credentials belong only in `api/local.settings.json` or Azure Static Web App application settings. They are never entered into the dashboard UI.

## Required Environment Variables

```env
ADO_ORG=
ADO_PROJECT=
ADO_AUTH_MODE=entra
ADO_ENTRA_TENANT_ID=
ADO_ENTRA_CLIENT_ID=
ADO_ENTRA_CLIENT_SECRET=
ADO_ENTRA_SCOPE=https://app.vssps.visualstudio.com/.default
ADO_CUSTOMER_FIELD=Custom.Customer
ADO_WORK_ITEM_TYPES=Incident,Major Incident,Service Request,Operational Task,Task,User Story,Feature,Epic,Bug,Issue
ALLOWED_USER_UPNS=miguel.basile@fivetwo.nz,janicebasile@fivetwo.nz
CUSTOMER_TOKEN_SECRET=
NEXT_PUBLIC_MOCK_MODE=true
MOCK_MODE=true
```

`NEXT_PUBLIC_MOCK_MODE` is a build-time frontend value. All ADO and token settings are server-side Function settings in Azure.

`ADO_AUTH_MODE=entra` is the production default. A PAT fallback still exists only for emergency/local troubleshooting if `ADO_AUTH_MODE=pat` and `ADO_PAT` are explicitly configured.

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

- `GET /api/tickets` uses a server-side Entra access token, filters by `ADO_CUSTOMER_FIELD`, and returns customer-safe ticket summaries.
- `GET /api/tickets/{id}` uses a server-side Entra access token, confirms the ticket belongs to that customer, and returns customer-safe detail, timeline, comments, and SLA data.
- `GET /api/ado/status` uses the server-side Entra access token to confirm the ADO project and fields endpoint are reachable. It returns only connection metadata, never secrets or access tokens.
- `GET /api/session` reads the Static Web Apps signed-in principal and reports whether the user is in `ALLOWED_USER_UPNS`.

## Azure Static Web Apps

- App location: `/`
- API location: `api`
- Build command: `npm run build`
- Output location: `out`
- API build command: `npm run build`
- Node.js build/runtime target: `22`
- Managed Functions runtime: `node:22`
- Configure Static Web App application settings for `ADO_ORG`, `ADO_PROJECT`, `ADO_AUTH_MODE=entra`, `ADO_ENTRA_TENANT_ID`, `ADO_ENTRA_CLIENT_ID`, `ADO_ENTRA_CLIENT_SECRET`, `ADO_ENTRA_SCOPE`, `ADO_CUSTOMER_FIELD=Custom.Customer`, `ADO_WORK_ITEM_TYPES`, `ALLOWED_USER_UPNS`, `CUSTOMER_TOKEN_SECRET`, and `MOCK_MODE=false`.

The free tier can host the exported static app and managed Azure Functions API together. Secrets must be configured as Static Web App application settings, never as `NEXT_PUBLIC_*` variables.

The Azure-created GitHub Actions workflow deploys on pushes to `main`. Runtime API secrets still need to be configured on the Azure Static Web Apps resource.

## Azure DevOps Entra Access

ADO access uses Microsoft Entra client credentials from the Azure Function runtime:

- `ADO_ENTRA_TENANT_ID`: Entra tenant ID.
- `ADO_ENTRA_CLIENT_ID`: App registration client/application ID.
- `ADO_ENTRA_CLIENT_SECRET`: App registration client secret.
- `ADO_ENTRA_SCOPE`: Azure DevOps resource scope. Use the default `https://app.vssps.visualstudio.com/.default` unless Microsoft changes the ADO resource.

In Azure DevOps, add the service principal represented by `ADO_ENTRA_CLIENT_ID` to the organization/project and grant it only the read permissions needed for work items, revisions, and comments. The app does not request delegated user access and never sends this token to the browser.

## Microsoft Entra Login

Azure Static Web Apps built-in Microsoft Entra sign-in is configured at the route layer:

- `/` and `/ticket?id={ticketId}` require the built-in SWA `authenticated` role.
- Unauthenticated UI requests redirect to `/.auth/login/aad`.
- `/login` redirects to `/.auth/login/aad`.
- `/logout` redirects to `/.auth/logout`.
- `/.auth/*` remains reachable so the SWA authentication callbacks work.
- `/api/*` remains reachable at the SWA layer because the Functions validate both the signed-in user allowlist and customer token before returning customer-scoped DTOs.

This adds an Entra gate in front of the static dashboard, but it does not replace customer-token authorization. Customers still need a valid customer token for API data access, and the token is still sent only in request headers.

Set `ALLOWED_USER_UPNS` to a comma-separated list of approved Microsoft Entra user principal names. Signed-in users who are not in that list see an unauthorized state and cannot load API data.

The built-in Entra provider works without committing client IDs or secrets. If you later need to restrict sign-in to a specific tenant through a custom Entra app registration, use the Static Web Apps Standard plan and add an `auth.identityProviders.azureActiveDirectory` block in `staticwebapp.config.json` that references app settings for the client ID and secret. Use these callback URLs in the Entra app registration after the SWA URL exists:

```text
https://<your-static-web-app-host>/.auth/login/aad/callback
https://<your-static-web-app-host>/.auth/logout/aad/callback
```

## Security Notes

- The frontend imports only customer-safe DTO types and mock data.
- Real ADO access exists only in `api/shared.ts`, which is imported by Azure Functions only.
- ADO Entra client credentials are read only by Azure Functions and are never exposed as `NEXT_PUBLIC_*`.
- API responses use allowlist mapping, so internal ADO fields, assignee emails, security notes, and internal comments are never serialized to customers.
- Customer comments must be explicitly tagged `[customer]`; `[internal]`, `[private]`, `[security]`, and deleted comments are blocked.
