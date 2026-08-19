# Google Home Nest Thermostat PWA Design

Date: 2026-08-18  
Status: Approved for implementation planning

## Summary

Build a personal, installable iOS Progressive Web App for two people to monitor and control one Google Nest thermostat. GitHub Pages hosts the static PWA. A Google Cloud Function, owned by the same Google account used for Nest Device Access, protects credentials and forwards a narrow set of commands to Google's Smart Device Management (SDM) API.

The product prioritizes a fast, focused thermostat experience. The primary screen uses a Nest-like circular temperature dial, reacts immediately to input, and confirms changes against the real thermostat state. Typical command submission should feel responsive within roughly one to three seconds, without promising parity with the native Google Home app.

## Goals

- Install from Safari onto two iPhones as a standalone PWA.
- Show current temperature, target temperature, humidity, connectivity, HVAC activity, and thermostat mode.
- Set the thermostat to Heat, Cool, Heat/Cool, or Off when supported.
- Change heat, cool, or range setpoints safely.
- Protect access with one shared high-entropy access code and persistent device sessions.
- Keep every Google OAuth credential, Nest token, signing secret, and access-code hash out of GitHub and browser-delivered assets.
- Deploy the frontend through GitHub Pages and the privileged API through Google Cloud.
- Behave clearly during slow commands, loss of connectivity, authorization problems, and Nest API failures.

## Non-goals for the first version

- App Store distribution or a native iOS application.
- Multiple homes or thermostat selection.
- Public or multi-tenant use.
- Google, GitHub, or other third-party sign-in for the two users.
- Schedules, temperature history, analytics, geofencing, or presence detection.
- Replacing Nest's built-in scheduling and safety behavior.
- General Google Home device control.
- Commercial Device Access certification.

## Constraints and external requirements

- A GitHub account hosts the public repository and GitHub Pages site.
- The existing Google account owns a Google Cloud project and Device Access project.
- Device Access registration, including Google's applicable one-time registration fee, must be completed.
- The Google account must authorize the thermostat through Partner Connections Manager.
- Google SDM access tokens expire after one hour and must be refreshed server-side.
- SDM setpoint commands accept Celsius. The PWA presents the thermostat's configured scale and converts values at the API boundary.
- Personal-use sandbox limits include 10 execute-command requests per minute per user, five requests per minute for a particular command and device, and a thermostat device-instance limit of five commands per minute or 100 per hour.
- Google does not publish a command latency guarantee. The design targets a warm-path user experience of approximately one to three seconds and handles longer waits explicitly.

## System architecture

### GitHub Pages PWA

The static frontend lives under `web/` and is written in TypeScript with a minimal build toolchain. It includes:

- the installable web manifest and iOS metadata;
- an application-shell service worker;
- the unlock screen;
- the focused-dial thermostat screen;
- a small typed API client;
- explicit loading, pending, offline, stale, and error states; and
- accessible labels and live status announcements.

The frontend contains only the public Cloud Function base URL. It contains no Google project secrets, OAuth client secret, refresh token, thermostat identifier, access-code hash, or session-signing key.

### Google Cloud Function

The backend lives under `function/` and exposes a versioned HTTPS interface:

- `POST /v1/session` validates the shared access code and returns a signed session token.
- `GET /v1/thermostat` returns normalized thermostat state.
- `POST /v1/thermostat/mode` changes the standard thermostat mode.
- `POST /v1/thermostat/setpoint` changes the appropriate setpoint or range for the confirmed mode.

The function owns all integration with OAuth and SDM. It reads configuration from environment variables and sensitive values from Google Secret Manager. It caches a valid one-hour Google access token in warm process memory and refreshes it when necessary. A request may retry once after an authorization failure caused by an expired access token; other command failures are not automatically repeated.

The backend is configured for the single authorized thermostat. The browser cannot supply a project ID, enterprise path, arbitrary device ID, SDM command name, or arbitrary upstream URL.

### Secrets

Google Secret Manager stores:

- OAuth client secret;
- OAuth refresh token;
- shared access-code password hash;
- session-signing secret; and
- configured thermostat resource name if it is treated as sensitive.

Non-secret environment configuration includes the Device Access project ID, OAuth client ID, allowed GitHub Pages origin, temperature scale, and safe setpoint bounds.

Secret values must never be printed in deployment output, function logs, GitHub Actions logs, or client error responses.

## Authentication and authorization

The shared credential must be at least eight random digits or a comparably strong short passphrase. The backend stores a salted, computationally expensive password hash rather than the original value and uses timing-safe verification.

A successful unlock returns a signed bearer token valid for 30 days. The token contains a version, issued-at time, expiration time, and the sole thermostat-control scope. It contains no Nest or Google credential. The PWA stores it locally on that iPhone. Rotating the session-signing secret revokes all sessions, which is the recovery mechanism for a lost phone.

The session endpoint applies conservative throttling and an increasing delay to failed attempts. Responses do not reveal whether failure came from a wrong code, malformed request, or throttling. Every thermostat endpoint validates the signature, expiry, version, and scope.

CORS allows only the exact production GitHub Pages origin and an explicitly configured local development origin. CORS is defense in depth and is not treated as authentication.

## Thermostat state model

The Cloud Function converts Google trait payloads into one stable client object containing:

- observation timestamp;
- display name and room when available;
- online status;
- ambient temperature;
- target heat and/or cool setpoints when available;
- temperature scale;
- relative humidity when available;
- configured mode;
- active HVAC status;
- Eco status; and
- capabilities derived from the traits actually returned by the device.

Unsupported or absent traits become explicit unavailable values rather than fabricated defaults. The frontend renders controls from capabilities instead of assuming every Nest model exposes every optional function.

## Command handling

The backend supports only explicit mode and setpoint operations. It rejects unknown fields, invalid mode values, non-finite temperatures, incompatible mode/setpoint combinations, and values outside configured safe limits.

The focused dial changes locally with each tap. After a short inactivity interval, the client sends only the final desired value. This coalesces rapid changes, keeps the interface responsive, and stays within SDM rate limits. A pending request displays “Setting…” and disables conflicting mode changes.

The client does not claim success from an empty SDM command response alone. After command acceptance, it retrieves fresh thermostat state with bounded retry timing. When confirmed, the UI displays Heating, Cooling, Idle, or Off. If confirmation fails, the UI restores the last confirmed setting and offers a retry.

Concurrent input is serialized. A newer desired setpoint supersedes an older unsent value. Once a command is in flight, later input becomes one queued final command rather than several requests.

## PWA user experience

The home screen uses the approved focused-dial layout:

- room and connectivity at the top;
- a status line such as “Heating to 72°”;
- a large circular target-temperature dial;
- current indoor temperature as secondary information;
- large minus and plus controls;
- mode controls for the supported standard modes; and
- secondary humidity and HVAC details without competing with the dial.

The theme uses warm color for heating, cool blue for cooling, and neutral styling for idle or off. It honors reduced motion, provides at least 44-by-44-point touch targets, supports browser text scaling without clipping, and does not rely on color alone for state.

The service worker caches only versioned static assets. Thermostat API responses, session responses, and Authorization headers are never placed in Cache Storage. When offline, the app may show the last confirmed reading from local storage with its timestamp and a prominent “Last updated” label, while disabling controls.

## Error behavior

The API returns a small stable error envelope with a machine-readable code and safe user-facing message. It distinguishes:

- invalid or expired app session;
- Nest authorization revoked or refresh failed;
- thermostat offline;
- incompatible device state, such as changing a setpoint while Off or in Eco;
- SDM rate limiting;
- validation failure;
- upstream timeout; and
- unexpected backend failure.

The frontend responds with a relevant recovery action: unlock again, reconnect Nest using the documented owner procedure, wait and retry, change mode first, or check the Google Home app. It never displays raw Google payloads or stack traces.

## Repository layout

```text
/
├── .github/workflows/
│   ├── pages.yml
│   └── verify.yml
├── docs/
│   ├── setup.md
│   └── superpowers/specs/2026-08-18-nest-thermostat-pwa-design.md
├── function/
│   ├── src/
│   ├── test/
│   ├── package.json
│   └── tsconfig.json
├── web/
│   ├── public/
│   ├── src/
│   ├── test/
│   ├── package.json
│   └── tsconfig.json
├── .gitignore
├── README.md
└── package.json
```

The root package scripts provide consistent install, lint, type-check, test, and build commands without merging frontend and backend runtime concerns.

## Testing strategy

Backend unit tests cover authentication, token expiry, request validation, safe temperature bounds, command allowlisting, Celsius conversion, Google token refresh, normalized state, and every mapped SDM error. Upstream Google calls are represented by fixtures and a narrow injected client.

Frontend unit tests cover temperature display and rounding, mode-dependent dial behavior, command coalescing, optimistic pending state, confirmation rollback, session expiry, offline presentation, and capability-driven controls.

Browser tests exercise unlock, state display, mode change, rapid setpoint changes producing one API request, failure recovery, stale offline state, and responsive layout against a fake backend.

Before production use, a manual physical-device checklist verifies authorization, state parity with Google Home, each supported mode, setpoint changes, rate-limit behavior, PWA installation, relaunch persistence, weak-network handling, and sign-out by signing-secret rotation.

## Deployment and operations

1. Create the Google Cloud and Device Access projects under the existing Google account.
2. Enable SDM, complete Device Access registration, and authorize the Nest thermostat.
3. Store sensitive configuration in Secret Manager and deploy the Cloud Function.
4. Restrict allowed origins and configure safe Fahrenheit or Celsius bounds.
5. Verify the function with read-only state retrieval, then with deliberate real commands.
6. Store only the public function URL as a GitHub repository variable.
7. Run verification in GitHub Actions and deploy the built `web/` artifact to GitHub Pages.
8. Install the production PWA from Safari on each iPhone and unlock it with the shared access code.

Logs include request IDs, route names, timing, normalized outcome codes, and upstream status categories. Logs exclude request authorization headers, access codes, OAuth values, device state payloads, and secrets. Initial operation relies on Google Cloud's standard logs; custom analytics and alerting are outside the first-version scope.

## Acceptance criteria

- Both iPhones can install and relaunch the PWA from the home screen.
- A valid shared access code creates a persistent session; invalid codes do not.
- No privileged credential appears in repository content, browser assets, browser cache, or normal logs.
- The PWA accurately shows confirmed thermostat state and timestamps stale data.
- Supported mode and temperature changes reach the configured Nest thermostat.
- Rapid temperature taps produce at most one final SDM command after the debounce interval.
- The UI never represents an unconfirmed command as confirmed.
- Offline, expired-session, revoked-Nest-access, thermostat-offline, rate-limit, and command-failure cases present clear recovery paths.
- Automated tests and the production build pass before GitHub Pages deployment.
