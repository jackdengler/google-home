# Nest Thermostat PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an installable iOS PWA on GitHub Pages that securely reads and controls one Google Nest thermostat through a Google Cloud Function.

**Architecture:** An npm workspace contains a Preact/Vite static PWA and an Express-compatible Google Cloud Function. Pure domain modules own temperature conversion, state normalization, command validation, sessions, and command coalescing; adapters own Google OAuth/SDM and browser HTTP. GitHub Actions verifies both workspaces and deploys only the static build.

**Tech Stack:** Node.js 22, TypeScript 5, npm workspaces, Preact, Vite, vite-plugin-pwa, Express, Google Functions Framework, jose, Zod, Vitest, Testing Library, Playwright, GitHub Actions, Google Secret Manager.

**Spec:** `docs/superpowers/specs/2026-08-18-nest-thermostat-pwa-design.md`

## Global Constraints

- The PWA controls one configured thermostat for two personal users and is not multi-tenant.
- The browser receives no OAuth client secret, refresh token, thermostat resource name, access-code hash, or session-signing secret.
- Shared access codes must be at least eight digits or an equivalently strong passphrase.
- Sessions last 30 days and are revoked by rotating the signing secret.
- UI temperatures use the configured display scale; SDM commands use Celsius.
- Rapid setpoint input is coalesced to respect the five-command-per-minute thermostat limit.
- The UI distinguishes optimistic input, pending commands, confirmed state, stale state, and failures.
- Static assets may be cached; API responses, sessions, and authorization headers may not.
- Touch targets are at least 44 by 44 CSS pixels and all state is conveyed without relying on color alone.
- No schedules, history, geofencing, analytics, multi-home selection, or general Google Home controls.

---

## File map

- `package.json`: root workspace scripts and Node version.
- `tsconfig.base.json`: shared strict TypeScript settings.
- `.gitignore`: dependencies, build output, local secrets, and browser artifacts.
- `function/src/config.ts`: validated environment and secret inputs.
- `function/src/domain.ts`: public API types, Celsius/Fahrenheit conversion, state normalization, and command creation.
- `function/src/session.ts`: scrypt access-code verification and signed 30-day sessions.
- `function/src/rate-limit.ts`: conservative per-client unlock throttling.
- `function/src/google.ts`: OAuth refresh and SDM HTTP adapter.
- `function/src/app.ts`: dependency-injected Express application and stable error mapping.
- `function/src/index.ts`: deployed function composition root.
- `function/test/*.test.ts`: backend unit and HTTP contract tests.
- `web/src/api.ts`: typed browser API client and session storage.
- `web/src/thermostat.ts`: confirmed/draft/pending thermostat state machine and coalescing.
- `web/src/app.tsx`: unlock and focused-dial application composition.
- `web/src/components/*.tsx`: focused controls and status/error presentation.
- `web/src/styles.css`: responsive, accessible visual system.
- `web/public/*`: icons and static PWA assets.
- `web/test/*.test.tsx`: frontend state and component tests.
- `web/e2e/app.spec.ts`: fake-backend browser flow.
- `.github/workflows/verify.yml`: install, lint, type-check, test, and build.
- `.github/workflows/pages.yml`: verified GitHub Pages artifact deployment.
- `docs/setup.md`: exact Google Device Access, Cloud Function, secrets, and iPhone setup.
- `README.md`: project overview and local commands.

### Task 1: Workspace and backend domain

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`
- Create: `function/package.json`, `function/tsconfig.json`
- Create: `function/src/domain.ts`
- Test: `function/test/domain.test.ts`

**Interfaces:**
- Produces: `ThermostatState`, `SdmDevice`, `normalizeDevice(device, scale)`, `createModeCommand(mode)`, `createSetpointCommand(mode, request, bounds)`, `toCelsius(value, scale)`, and `fromCelsius(value, scale)`.

- [ ] **Step 1: Write failing domain tests** for Fahrenheit/Celsius conversion, normalized missing traits, mode commands, incompatible setpoints, and safe bounds. Tests must assert that `72°F` becomes approximately `22.222°C`, OFF rejects setpoints, and HEAT creates `sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat`.
- [ ] **Step 2: Run `npm test -w function -- domain.test.ts`** and confirm failure because `function/src/domain.ts` does not exist.
- [ ] **Step 3: Implement strict tagged types and pure functions.** Parse known SDM traits defensively; never fabricate an unavailable value. Use Zod at HTTP boundaries, not inside normalization.
- [ ] **Step 4: Run `npm test -w function -- domain.test.ts` and `npm run typecheck -w function`** and confirm both pass.
- [ ] **Step 5: Commit** with `git commit -m "feat: add thermostat domain model"`.

### Task 2: Backend authentication and Google adapter

**Files:**
- Create: `function/src/config.ts`
- Create: `function/src/session.ts`
- Create: `function/src/rate-limit.ts`
- Create: `function/src/google.ts`
- Test: `function/test/session.test.ts`
- Test: `function/test/google.test.ts`

**Interfaces:**
- Consumes: domain command payloads from Task 1.
- Produces: `hashAccessCode(code, salt?)`, `verifyAccessCode(code, encodedHash)`, `issueSession(secret, now?)`, `verifySession(token, secret, now?)`, `UnlockLimiter.consume(key, now?)`, and class `GoogleSdmClient` with `getThermostat()` and `execute(command)`.

- [ ] **Step 1: Write failing tests** proving short access codes are rejected, scrypt hashes verify without revealing the code, sessions expire after 30 days, malformed tokens fail, repeated unlock failures throttle, access tokens are cached, and a 401 refreshes once.
- [ ] **Step 2: Run `npm test -w function -- session.test.ts google.test.ts`** and confirm missing-module failures.
- [ ] **Step 3: Implement authentication** with Node `crypto.scrypt`, random 16-byte salts, timing-safe comparison, HS256 JWTs through `jose`, a `thermostat:control` scope, and an in-memory limiter keyed by the forwarded client address.
- [ ] **Step 4: Implement `GoogleSdmClient`** with injected `fetch`, a cached access token expiring 60 seconds early, OAuth refresh at `https://oauth2.googleapis.com/token`, SDM requests at `https://smartdevicemanagement.googleapis.com/v1`, one authorization retry, and sanitized typed errors.
- [ ] **Step 5: Run backend tests and type-check** and confirm success.
- [ ] **Step 6: Commit** with `git commit -m "feat: add secure Nest API adapter"`.

### Task 3: Cloud Function HTTP API

**Files:**
- Create: `function/src/app.ts`
- Create: `function/src/index.ts`
- Test: `function/test/app.test.ts`

**Interfaces:**
- Consumes: `GoogleSdmClient`, domain validators, session functions, and `UnlockLimiter`.
- Produces: `createApp(dependencies): Express` and deployed export `api`.
- HTTP: `POST /v1/session`, `GET /v1/thermostat`, `POST /v1/thermostat/mode`, `POST /v1/thermostat/setpoint`, `GET /healthz`.

- [ ] **Step 1: Write failing Supertest contract tests** for exact-origin CORS, unlock, bearer authorization, normalized state, mode/setpoint commands, unsafe input, expired sessions, offline device, upstream throttling, and redacted 500 responses.
- [ ] **Step 2: Run `npm test -w function -- app.test.ts`** and confirm missing-app failure.
- [ ] **Step 3: Implement the Express application** with JSON size limit, request IDs, Zod schemas, bearer middleware, no-store response headers, stable `{ error: { code, message, requestId } }` envelopes, and no raw upstream body in logs or responses.
- [ ] **Step 4: Compose production dependencies** from validated environment variables: `ALLOWED_ORIGIN`, `DEVICE_ACCESS_PROJECT_ID`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REFRESH_TOKEN`, `THERMOSTAT_RESOURCE_NAME`, `ACCESS_CODE_HASH`, `SESSION_SIGNING_SECRET`, `DISPLAY_SCALE`, `MIN_SETPOINT`, and `MAX_SETPOINT`.
- [ ] **Step 5: Run all backend tests, lint, and type-check** and confirm success.
- [ ] **Step 6: Commit** with `git commit -m "feat: expose thermostat cloud function API"`.

### Task 4: PWA client state and focused dial

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`
- Create: `web/src/api.ts`, `web/src/thermostat.ts`, `web/src/main.tsx`, `web/src/app.tsx`
- Create: `web/src/components/ThermostatDial.tsx`, `web/src/components/ModeSelector.tsx`, `web/src/components/StatusPanel.tsx`
- Create: `web/src/styles.css`
- Test: `web/test/thermostat.test.ts`, `web/test/app.test.tsx`, `web/test/setup.ts`

**Interfaces:**
- Consumes: the Task 3 HTTP contract.
- Produces: `ThermostatApi`, `createThermostatController(api, delayMs)`, and the installable focused-dial UI.

- [ ] **Step 1: Write failing state tests** proving rapid `+` taps update draft state immediately, emit one final request after 650 ms, serialize in-flight commands, restore confirmed state on failure, and label cached state stale.
- [ ] **Step 2: Write failing component tests** for unlock, current/target temperature, status text, 44-pixel controls, mode support, pending state, offline disabling, and an accessible live error message.
- [ ] **Step 3: Run `npm test -w web`** and confirm missing-module failures.
- [ ] **Step 4: Implement the API client and state controller.** Store only the signed session token and last confirmed normalized state in local storage; apply `cache: "no-store"` and bearer authorization to API requests.
- [ ] **Step 5: Implement the focused dial UI** with semantic buttons, explicit heating/cooling/off labels, warm and cool themes, a responsive safe-area layout, reduced-motion handling, and no color-only meaning.
- [ ] **Step 6: Run frontend tests, lint, type-check, and build** and confirm success.
- [ ] **Step 7: Commit** with `git commit -m "feat: build focused Nest thermostat PWA"`.

### Task 5: Installability, offline behavior, and browser verification

**Files:**
- Modify: `web/vite.config.ts`
- Create: `web/public/icon.svg`, `web/public/apple-touch-icon.svg`
- Create: `web/e2e/app.spec.ts`, `web/playwright.config.ts`
- Test: `web/test/pwa.test.ts`

**Interfaces:**
- Consumes: the built PWA from Task 4.
- Produces: manifest, service worker, icons, offline app shell, and fake-backend end-to-end verification.

- [ ] **Step 1: Write a failing PWA configuration test** asserting standalone display, theme colors, 192/512 maskable icons, `apple-mobile-web-app-capable`, and API exclusion from runtime caching.
- [ ] **Step 2: Configure `vite-plugin-pwa`** with the repository base path `/google-home/`, generated manifest, versioned static precache, navigation fallback, and no API runtime cache rule.
- [ ] **Step 3: Add Playwright coverage** for unlock, state display, three rapid temperature taps producing one request, a mode change, command rollback, offline stale state, and a 390-by-844 iPhone viewport.
- [ ] **Step 4: Run unit tests, build, and Playwright** and confirm success.
- [ ] **Step 5: Commit** with `git commit -m "feat: make thermostat app installable offline"`.

### Task 6: CI, deployment, and operator documentation

**Files:**
- Create: `.github/workflows/verify.yml`, `.github/workflows/pages.yml`
- Create: `README.md`, `docs/setup.md`
- Modify: root `package.json`

**Interfaces:**
- Consumes: verified workspaces from Tasks 1–5.
- Produces: repeatable CI, GitHub Pages deployment, Cloud Function commands, and a complete owner setup path.

- [ ] **Step 1: Add root scripts** for `lint`, `typecheck`, `test`, `build`, and `verify`, each delegating to both workspaces.
- [ ] **Step 2: Add `verify.yml`** using Node 22, `npm ci`, cached npm dependencies, and `npm run verify` on pull requests and pushes.
- [ ] **Step 3: Add `pages.yml`** with `pages: write` and `id-token: write`, build-time `VITE_API_BASE_URL` from the repository variable, artifact upload from `web/dist`, and official Pages deployment actions.
- [ ] **Step 4: Write setup documentation** with exact `gcloud` commands for APIs, Secret Manager values, access-code hashing, function deployment, public function invocation, Device Access authorization, repository variable configuration, Pages enablement, and iOS installation. Mark the function unusable until real owner secrets are configured.
- [ ] **Step 5: Run `npm run verify`, inspect the built manifest/service worker, and run `git diff --check`** with all checks passing.
- [ ] **Step 6: Commit** with `git commit -m "docs: add deployment and owner setup"`.

### Task 7: Publish and verify

**Files:**
- Modify only files required by verified deployment defects.

**Interfaces:**
- Consumes: complete repository and owner-provided cloud configuration when available.
- Produces: pushed `main`, a GitHub Pages deployment, and an evidence-backed readiness report for the Google Cloud bridge.

- [ ] **Step 1: Run the full verification suite from a clean install** using `npm ci && npm run verify` and record the exact outcome.
- [ ] **Step 2: Inspect `git status`, staged scope, and secret scans** using `git diff --check` and `rg` for OAuth/token/private-key patterns; resolve any finding before publishing.
- [ ] **Step 3: Push `main`** and inspect the Pages workflow until it succeeds or returns an actionable permission/configuration error.
- [ ] **Step 4: Open the published URL** and verify the manifest, service worker, focused dial, responsive viewport, and expected locked/setup state.
- [ ] **Step 5: If `gcloud` is authenticated and Device Access values are available, deploy and smoke-test the function; otherwise leave no guessed values and report the exact owner commands still required.**
- [ ] **Step 6: Commit any deployment-only correction** with `git commit -m "fix: correct production deployment"`, push, and re-verify.
