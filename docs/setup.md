# Owner setup

This setup uses only the existing GitHub account and the Google account that owns the Nest home. Commands assume macOS or Linux, `gcloud`, GitHub CLI (`gh`), Node.js 22, and repository owner access.

## 1. Register Google Device Access

1. Open [Google Device Access](https://console.nest.google.com/device-access), accept the terms, and pay Google's one-time registration fee.
2. Create a Google Cloud project in [Google Cloud Console](https://console.cloud.google.com/) and note its project ID.
3. Enable the Smart Device Management API and configure an external OAuth consent screen with the Nest owner's Google account as a test user.
4. Create a Web application OAuth client. Record its client ID and client secret.
5. Create a Device Access project and associate the OAuth client ID. Record the Device Access project ID.

All Nest thermostat models are supported by SDM. Personal use remains in Google's Sandbox environment.

## 2. Authorize the Nest account

Replace the shell values before running these commands. Do not paste their output into GitHub issues, commits, or Actions.

```bash
export DEVICE_ACCESS_PROJECT_ID='replace-with-device-access-project-id'
export OAUTH_CLIENT_ID='replace-with-oauth-client-id'
export OAUTH_CLIENT_SECRET='replace-with-oauth-client-secret'
```

Open this URL in a normal browser, choose the Google account that owns the thermostat, and grant access:

```text
https://nestservices.google.com/partnerconnections/DEVICE_ACCESS_PROJECT_ID/auth?redirect_uri=https://www.google.com&access_type=offline&prompt=consent&client_id=OAUTH_CLIENT_ID&response_type=code&scope=https://www.googleapis.com/auth/sdm.service
```

Copy the `code` query parameter from the redirect, then exchange it:

```bash
export AUTHORIZATION_CODE='replace-with-code'
curl -sS -X POST https://oauth2.googleapis.com/token \
  -d client_id="$OAUTH_CLIENT_ID" \
  -d client_secret="$OAUTH_CLIENT_SECRET" \
  -d code="$AUTHORIZATION_CODE" \
  -d grant_type=authorization_code \
  -d redirect_uri=https://www.google.com
```

Securely record the returned `refresh_token`. Use the returned temporary access token once to list devices and copy the thermostat's full `name`, such as `enterprises/PROJECT/devices/DEVICE`:

```bash
export ACCESS_TOKEN='replace-with-temporary-access-token'
curl -sS -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://smartdevicemanagement.googleapis.com/v1/enterprises/$DEVICE_ACCESS_PROJECT_ID/devices"
```

## 3. Create backend secrets

Select the Google Cloud project and enable deployment services:

```bash
export GOOGLE_CLOUD_PROJECT_ID='replace-with-google-cloud-project-id'
gcloud config set project "$GOOGLE_CLOUD_PROJECT_ID"
gcloud services enable smartdevicemanagement.googleapis.com cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

Generate the shared access-code hash locally. Replace the example code with a private passphrase of at least eight characters:

```bash
export SHARED_ACCESS_CODE='replace-with-private-passphrase'
node -e 'const c=require("node:crypto");const s=c.randomBytes(16);c.scrypt(process.env.SHARED_ACCESS_CODE,s,64,(e,k)=>{if(e)throw e;console.log(`scrypt:${s.toString("base64url")}:${k.toString("base64url")}`)})'
```

Generate the session secret with `openssl rand -base64 48`.

Create each secret without leaving a plaintext file behind. Run each command and replace the uppercase prompt with the corresponding value:

```bash
printf 'PASTE_OAUTH_CLIENT_SECRET' | gcloud secrets create oauth-client-secret --data-file=-
printf 'PASTE_OAUTH_REFRESH_TOKEN' | gcloud secrets create oauth-refresh-token --data-file=-
printf 'PASTE_SCRYPT_HASH' | gcloud secrets create access-code-hash --data-file=-
printf 'PASTE_SESSION_SECRET' | gcloud secrets create session-signing-secret --data-file=-
printf 'PASTE_ENTERPRISES_DEVICE_NAME' | gcloud secrets create thermostat-resource-name --data-file=-
```

For an existing secret, run `printf 'NEW_VALUE' | gcloud secrets versions add SECRET_NAME --data-file=-`.

## 4. Deploy the Google Cloud Function

From the repository root, choose the closest region and deploy. The function allows unauthenticated invocation because application authorization happens through the signed shared-code session.

```bash
export REGION='us-west1'
export GITHUB_PAGES_ORIGIN='https://jackdengler.github.io'
gcloud functions deploy nest-thermostat-api \
  --gen2 \
  --runtime=nodejs22 \
  --region="$REGION" \
  --source=function \
  --entry-point=api \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars="ALLOWED_ORIGIN=$GITHUB_PAGES_ORIGIN,DEVICE_ACCESS_PROJECT_ID=$DEVICE_ACCESS_PROJECT_ID,OAUTH_CLIENT_ID=$OAUTH_CLIENT_ID,DISPLAY_SCALE=F,MIN_SETPOINT=50,MAX_SETPOINT=90" \
  --set-secrets="OAUTH_CLIENT_SECRET=oauth-client-secret:latest,OAUTH_REFRESH_TOKEN=oauth-refresh-token:latest,ACCESS_CODE_HASH=access-code-hash:latest,SESSION_SIGNING_SECRET=session-signing-secret:latest,THERMOSTAT_RESOURCE_NAME=thermostat-resource-name:latest"
```

Read the deployed URL and check the health endpoint:

```bash
export FUNCTION_URL="$(gcloud functions describe nest-thermostat-api --gen2 --region="$REGION" --format='value(serviceConfig.uri)')"
curl -sS "$FUNCTION_URL/healthz"
```

Expected response: `{"ok":true}`.

## 5. Connect GitHub Pages

Set the public function URL as a repository variable. It is not a credential.

```bash
gh variable set VITE_API_BASE_URL --repo jackdengler/google-home --body "$FUNCTION_URL"
```

In GitHub repository settings, open **Pages** and choose **GitHub Actions** as the source. Run the **Deploy PWA** workflow or push `main`. The site URL is `https://jackdengler.github.io/google-home/`.

## 6. Install on both iPhones

1. Open the published URL in Safari.
2. Tap Share → Add to Home Screen → Add.
3. Open Nest Dial from the home screen.
4. Enter the shared access code. The signed session lasts 30 days.

If a phone is lost, add a new version of `session-signing-secret` and redeploy the function. Both phones will be signed out; unlock the remaining phone again.

## Operational limits

Google's personal-use Sandbox limits thermostat commands to five per minute per device and 100 per hour. Nest Dial combines rapid temperature taps into one final command. It shows local input immediately, then waits for the Cloud Function and SDM API to confirm the real device state.
