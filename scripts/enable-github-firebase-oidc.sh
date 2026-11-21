#!/usr/bin/env bash
# One-time setup of GitHub -> Google Cloud keyless deployment authentication.
# Run as the Google Cloud project owner in Cloud Shell. Never create or paste JSON keys.
set -euo pipefail
PROJECT_ID="durood-e-ibrahimi-global-c74e0"
EXPECTED_PROJECT_NUMBER="277153649028"
SERVICE_ACCOUNT="github-firebase-deploy@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_ID="durood-github"
PROVIDER_ID="github-main"
REPOSITORY="theoneschoolsystemzwl-arch/durood-ibrahimi"

echo "Verifying selected Firebase project..."
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
if [[ "$PROJECT_NUMBER" != "$EXPECTED_PROJECT_NUMBER" ]]; then
  echo "Unexpected project number. Aborting without changing IAM." >&2
  exit 1
fi
gcloud iam service-accounts describe "$SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null

echo "Enabling only APIs used for keyless identity..."
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  --project="$PROJECT_ID"

echo "Creating GitHub-only workload identity pool..."
if ! gcloud iam workload-identity-pools describe "$POOL_ID" --location="global" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --project="$PROJECT_ID" --location="global" \
    --display-name="Durood GitHub deployment"
fi

echo "Creating repository and main-branch-restricted GitHub OIDC provider..."
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
   --workload-identity-pool="$POOL_ID" --location="global" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location="global" \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub main only" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository == '$REPOSITORY' && assertion.ref == 'refs/heads/main'"
fi

echo "Granting only the selected GitHub repository permission to impersonate the deployment account..."
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.repository/$REPOSITORY"

echo
echo "Keyless GitHub authentication is configured for the $REPOSITORY main branch."
echo "Future authorized pushes should deploy Hosting automatically. No JSON key or recurring user login is required."
