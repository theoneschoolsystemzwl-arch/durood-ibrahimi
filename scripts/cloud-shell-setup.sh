#!/usr/bin/env bash
# Compatibility entrypoint for existing Cloud Shell instructions.
# User requested Spark (no billing / Blaze). Do not attempt a paid deployment.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
echo "Spark plan selected: no billing, no paid Cloud Functions."
echo "This will publish only Firebase Hosting and the Firestore Rules."
exec bash scripts/spark-hosting.sh
