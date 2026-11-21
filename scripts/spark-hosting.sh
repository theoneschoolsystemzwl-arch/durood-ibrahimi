#!/usr/bin/env bash
# Deploy only Firebase Hosting on the no-cost Spark plan.
# This never enables billing, creates cloud resources, or deploys Cloud Functions.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
PROJECT="durood-e-ibrahimi-global-c74e0"
test -s public/index.html
test -s public/manifest.webmanifest
test -s firebase.json
echo "Deploying frontend and Firestore Security Rules on the free Spark plan..."
echo "NOTICE: Firebase Cloud Functions are NOT deployable on Spark."
echo "This version uses Firebase Authentication and Firestore; Cloud Functions are not required."
echo "Firestore must already be enabled in the project and owner DI-1 securely initialized."
echo "If Firebase asks for the first/default Hosting site ID, choose: $PROJECT"
firebase deploy --project "$PROJECT" --only hosting,firestore
echo "Website frontend deployed: https://$PROJECT.web.app/"
