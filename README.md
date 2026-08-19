# Nest Dial

Nest Dial is a private iPhone PWA for one Google Nest thermostat. The focused dial runs on GitHub Pages; a Google Cloud Function keeps Nest OAuth credentials private and proxies a strict set of Smart Device Management API operations.

## What works

- Installable iOS home-screen experience
- Current temperature, humidity, connectivity, HVAC activity, and target temperature
- Heat, Cool, Heat · Cool, and Off modes when the thermostat exposes them
- Debounced setpoint changes that respect Nest rate limits
- Shared access code with 30-day signed sessions
- Explicit pending, offline, authorization, and rate-limit states
- Offline-cached application shell without cached API responses or credentials

The GitHub Pages build is safe to publish before Nest setup. Until `VITE_API_BASE_URL` is configured, unlock explains that the private bridge still needs setup.

## Development

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run verify
npm run e2e
```

Run the PWA locally:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8080 npm run dev -w web
```

Run the compiled function after exporting the variables documented in [`docs/setup.md`](docs/setup.md):

```bash
npm run build -w function
npm run start -w function
```

## Deployment

Read [`docs/setup.md`](docs/setup.md). The order is Google Device Access → secrets → Cloud Function → GitHub repository variable → Pages → iPhone installation.

## Security

Never commit `.env` files, OAuth credentials, refresh tokens, access-code hashes, session secrets, or thermostat resource names. Rotate `SESSION_SIGNING_SECRET` to sign out both phones.
