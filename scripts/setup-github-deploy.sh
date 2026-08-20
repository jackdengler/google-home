#!/usr/bin/env bash
set -euo pipefail

project_id="budget-together-491405"
project_number="862279562724"
repository="jackdengler/google-home"
pool_id="github"
provider_id="google-home"
service_account_id="github-deployer"
service_account="${service_account_id}@${project_id}.iam.gserviceaccount.com"
pool_name="projects/${project_number}/locations/global/workloadIdentityPools/${pool_id}"

gcloud config set project "$project_id"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com

if ! gcloud iam service-accounts describe "$service_account" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$service_account_id" \
    --display-name="GitHub deployer for google-home"
fi

gcloud projects add-iam-policy-binding "$project_id" \
  --member="serviceAccount:${service_account}" \
  --role="roles/cloudfunctions.developer" \
  --condition=None

gcloud projects add-iam-policy-binding "$project_id" \
  --member="serviceAccount:${service_account}" \
  --role="roles/iam.serviceAccountUser" \
  --condition=None

if ! gcloud iam workload-identity-pools describe "$pool_id" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$pool_id" \
    --location=global \
    --display-name="GitHub Actions"
fi

if ! gcloud iam workload-identity-pools providers describe "$provider_id" \
  --location=global \
  --workload-identity-pool="$pool_id" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$provider_id" \
    --location=global \
    --workload-identity-pool="$pool_id" \
    --display-name="google-home main branch" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository == '${repository}' && assertion.ref == 'refs/heads/main'" \
    --issuer-uri="https://token.actions.githubusercontent.com"
fi

gcloud iam service-accounts add-iam-policy-binding "$service_account" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${pool_name}/attribute.repository/${repository}"

echo "GitHub backend deployment is configured. Wait five minutes, then run the Deploy Backend workflow."
