#!/usr/bin/env bash
# Run from your private repo folder in Google Cloud Shell.
# Never paste passwords, access tokens or service account credentials into chat.
set -euo pipefail
PROJECT="durood-e-ibrahimi-global-c74e0"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
echo "Durood-e-Ibrahimi Global - authorized Firebase production setup"
echo "Project: $PROJECT"
for program in firebase gcloud git node npm; do
  if ! command -v "$program" >/dev/null 2>&1; then
    echo "Missing required program: $program"; exit 1
  fi
done
for file in firebase.json firestore.rules functions/index.js public/index.html; do
  test -s "$file" || { echo "Missing production file: $file"; exit 1; }
done
firebase --version
CURRENT="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "$CURRENT" != "$PROJECT" ]]; then
  echo "Cloud Shell is currently on project $CURRENT"
  echo "Switching gcloud active project to $PROJECT."
  gcloud config set project "$PROJECT"
fi
echo "Checking Cloud Billing (required for Cloud Functions)..."
BILLING="$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null || true)"
if [[ "${BILLING,,}" != "true" ]]; then
  echo "STOP: Blaze billing not confirmed or billing information inaccessible."
  echo "Open https://console.firebase.google.com/project/$PROJECT/usage/details"
  echo "Check the pricing plan yourself before approving any charge."
  exit 1
fi
echo "Checking Google Application Default Credentials for secure owner setup..."
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "STOP: Admin SDK authorization is not yet present."
  echo "Run: gcloud auth application-default login"
  echo "Approve the browser request on your own device, then rerun this script."
  exit 1
fi
echo "Installing Firebase Cloud Functions dependencies..."
npm install --prefix functions --no-audit --no-fund
node --check functions/index.js
node --check public/app.js
node --check public/member-auth.js
echo "Checking the existing owner and membership numbering before continuing..."
if node functions/scripts/check-owner.mjs; then
  echo "Existing owner verified; retaining current accounts, passwords and DI numbers."
else
  status=$?
  if [[ "$status" != "2" ]]; then
    echo "STOP: The owner records need review. Deployment cancelled to protect members."
    exit "$status"
  fi
  echo
  echo "No member records or Auth users found. Preparing the first owner (DI-1)."
  read -r -p "Owner username (3-24 lowercase letters / numbers / . _ -): " OWNER_USERNAME
  read -r -p "Owner full name: " OWNER_NAME
  read -r -s -p "New owner password (not displayed): " OWNER_PASSWORD
  printf '\n'
  export OWNER_USERNAME OWNER_NAME OWNER_PASSWORD
  trap 'unset OWNER_PASSWORD OWNER_USERNAME OWNER_NAME' EXIT
  node functions/scripts/bootstrap-owner.mjs
  unset OWNER_PASSWORD OWNER_USERNAME OWNER_NAME
  trap - EXIT
fi
echo
echo "Owner initialized and checked. Deploying Hosting, Firestore security rules and Functions..."
firebase deploy --project "$PROJECT" --only hosting,firestore,functions --non-interactive
echo "Deployment command completed. Verify sign-in at:"
echo "https://$PROJECT.web.app"
