# Durood-e-Ibrahimi Global — production deployment

The original single-file web application is preserved in `source/Durood-Ibrahimi-Global-Original.html` for migration. It is a browser-local DEMO with seeded users, demo passwords and recovery codes. **Do not publish it as a production authentication system.**

## Next required setup
1. Create or select the Firebase project in Firebase Console and enable Firebase Authentication and Cloud Firestore.
2. Replace demo account/authentication/storage logic with secure Firebase Auth and Firestore; do not treat client-side checks as access control. Create and test Firestore security rules.
3. Put the tested production web build in `public/`.
4. Deploy from an authenticated Firebase CLI session or configure GitHub Actions with a Firebase service-account secret and the exact project ID. Hosting settings are preconfigured in `firebase.json`.

**Status:** source backed up, Hosting config prepared. Not yet live; no project ID or Firebase deployment authorization is connected here.
