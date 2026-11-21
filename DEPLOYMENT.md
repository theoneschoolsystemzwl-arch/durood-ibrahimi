# Durood-e-Ibrahimi Global: free Spark deployment status

Project ID: `durood-e-ibrahimi-global-c74e0`
Expected Hosting URL: https://durood-e-ibrahimi-global-c74e0.web.app/
Repo: `theoneschoolsystemzwl-arch/durood-ibrahimi`

## Spark-friendly production architecture

This project is prepared for the **Firebase Spark (no billing)** plan:

- `public/` contains the member website and installable PWA shell.
- `public/member-auth.js` uses Firebase Authentication and `public/spark-data.js` uses Cloud Firestore transactions instead of paid Cloud Functions.
- `firestore.rules` enforces member registration, one-use invitation consumption, sequential DI-2 and onward, personal and global recitation counters, prayer privacy and owner permissions.
- The existing first owner is **DI-1** only if correctly created in Firebase Auth and Firestore. Its role is privileged by an Auth custom claim.
- GitHub Action `spark-rules.yml` runs an actual local Firestore emulator test of permissions and DI-2 signup. This test does not change the live Firebase project.
- `scripts/spark-hosting.sh` and `scripts/cloud-shell-setup.sh` deploy **Hosting and Firestore Rules only**. These scripts will not enable Blaze or bill the user.
- `.github/workflows/firebase-hosting-spark.yml` is set up to automatically deploy Hosting and Firestore on code changes **once** the protected repository secret `FIREBASE_SERVICE_ACCOUNT_DUROOD` is authorized by the Firebase project owner. Without it the publish step is skipped.
- `.github/workflows/firebase-deploy.yml` offers a Spark-only manual action with the same secret.

## Required one-time project prerequisites (not completed remotely)

1. Firebase default Firestore database is enabled in the correct project.
2. Firebase Authentication > Email/Password is enabled.
3. DI-1 has been established and verified in Firebase Authentication and Firestore. The secure owner creation script in `functions/scripts/bootstrap-owner.mjs` checks that **no** existing Auth users or member records are present before creating an owner. It must not be bypassed or rerun blindly.
4. Authorized Firebase deploy credentials are connected either through the project owner's Cloud Shell or the GitHub Actions repository secret. Do not paste credentials into ChatGPT.
5. Deploy Hosting and Firestore Security Rules, then confirm the site loads and perform real Auth/Firestore member sign-up/login tests.

**Important:** A green GitHub Actions run is not proof of deployment: the automatic Hosting workflow can finish successfully while skipping deployment when the secret is missing. Always verify the live site.

## Mobile app updates without APK

`public/manifest.webmanifest`, `public/pwa.js` and `public/service-worker.js` add a standalone web experience with network-first refreshes on new web deployments. These can update a PWA or an Android WebView that loads this hosted URL when it opens. They **cannot** replace native code or bundled HTML inside an existing APK.

## Remaining limitations

- The old demo file under `source/` is preserved; not every feature of that original standalone HTML has been ported.
- The installable web app includes no mechanism to reset a forgotten password by email because account usernames use Firebase-internal email aliases. Signed-in members can change their passwords.
- Client-enforced rates cannot prevent every authenticated abuse case within the free Spark quota; more monitoring and hardening are needed before broad public rollout.
- Actual Cloud Firestore availability, DI-1 owner setup, live registration and deployment remain unverified from ChatGPT because there is no connected Firebase administration credential.
