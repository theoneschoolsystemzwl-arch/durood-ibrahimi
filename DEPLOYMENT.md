# Durood-e-Ibrahimi Global — deployment status

**Project ID:** `durood-e-ibrahimi-global-c74e0`
**Firebase Hosting URL (not yet confirmed deployed):** https://durood-e-ibrahimi-global-c74e0.web.app/
**Repository:** `theoneschoolsystemzwl-arch/durood-ibrahimi`

## Current web implementation
The `public/` directory is the live-build target and contains a new Firebase-backed member portal. It is distinct from `development/index.html`, which is an older local demo copy. Do **not** deploy that demo as the production app.

The new web portal provides:
- Shared Login and New User tabs on one form
- Username/password account access through Firebase Auth using internal alias emails
- One-time owner bootstrap with owner member number DI-1 and separate admin custom claim
- Automatic sequential DI-2 / DI-3 / ... member numbers via server transaction
- Invite codes, member profiles, authenticated recitation tally and global counts
- Prayer attendance, referral list, member leaderboard and owner account controls
- Member password changes requiring current-password reauthentication

**Important scope limitation:** some advanced features of the original 579KB single-file demo (detailed prayer timing, qaza planning, full historical dashboards, other demo-specific preferences) have **not yet been migrated** into the Firebase-backed portal. Preserve the source file; do not call this a pixel-for-pixel or full feature-for-feature conversion.

## Deployment preparation
- `.firebaserc`, `firebase.json`, `firestore.rules` and `functions/` are configured.
- `.github/workflows/verify.yml` validates structure, JavaScript syntax, and interface contracts.
- `.github/workflows/firebase-deploy.yml` is a **manual** deployment workflow. It requires `FIREBASE_SERVICE_ACCOUNT_DUROOD` in GitHub Actions secrets. This secret has NOT been created by ChatGPT and should never be pasted into a chat.
- `scripts/cloud-shell-setup.sh` performs preflight checks before deploying. Run only with authorized project access and after reviewing possible Blaze billing charges.
- `functions/scripts/bootstrap-owner.mjs` stops if any Firebase Auth user, member or sequence record already exists. This guards DI-1 identity; inspect existing data rather than bypassing that check.

## What is not yet completed
- No verified Firebase project administration connection exists in this ChatGPT runtime.
- The original owner account has not been directly created or verified in the target Firebase project by ChatGPT.
- Firestore existence, Cloud Billing, Cloud Functions deployment and production sign-in tests have not been verified from this runtime.
- The standard `web.app` address most recently returned **Site Not Found (HTTP 404)**.
- Android APK delivery is not yet possible without a working verified backend and an Android build.

A passing GitHub Actions validation workflow only confirms build-contract checks, **not** a successful Firebase deployment.

## Security note
Firebase public configuration fields (apiKey, projectId, etc.) are not Admin SDK credentials. **Never** commit service account JSON, owner passwords, access tokens or private keys into this repository or the chat. The account owner's permission is required for billing, secure owner bootstrap and deployment authorization.
