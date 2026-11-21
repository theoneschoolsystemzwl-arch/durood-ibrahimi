# Owner and member account setup (Durood-e-Ibrahimi Global)

## Confirmed requirements

- One main account form with **Login** and **New User** tabs (same page, shared account-form).
- Same username/password login for everyone. No owner-specific login button, no visible member number on the login form.
- The first securely initialized owner receives `DI-1`. New members receive `DI-2`, `DI-3`, ... after successful registration.
- Firebase Authentication UID is internal and unrelated to the member serial number.
- Owner may view and manage all member accounts, but must not be created or promoted through an ordinary public form.
- Other members can read their own private profile and request an invitation from the backend; no client may edit its own role, member serial or sequence.

## What is implemented in GitHub

- `development/index.html`: one account card with Login/New User tabs and the original inner interface retained **as a non-production offline prototype**. The old browser-based demo account system and local storage logic still exist; DO NOT publish this file as a secure production application.
- `firestore.rules`: deny-by-default. Individual members may read their own profile. Owner may read/list member profiles. Writes and authority/number allocations require the Admin SDK backend.
- `functions/index.js`: callable `registerMember`, `createInvitation`, `setMemberActive` and `updateMyProfile`. Generates sequential member numbers in a Firestore transaction.
- `functions/scripts/bootstrap-owner.mjs`: one-time trusted owner setup. Prevents silently reusing member serials when existing records/sequence already exist.
- `web/member-auth.js`: modular browser Firebase Auth / callable Functions adapter; ready to connect during the original app's offline-to-online migration.

## Owner creation: important safety restriction

The owner was reportedly deleted from the Firebase Console. This repository **does not assume that all Auth accounts, membership documents or sequence counters are gone**. Before a new owner can be initialized, verify the existing `members` and `system/membership` documents and Firebase Authentication users.

The bootstrap script **refuses to start** if any member record or sequence counter already exists. This prevents accidental duplicate `DI-1` identifiers. It must be executed with owner-authorized Google credentials; it is never a publicly callable endpoint.

If the database is known to be empty and no matching Auth user exists, a trusted operator may run, from a secure authorized terminal:

```bash
cd functions
npm install
# Authenticate Google Application Default Credentials for the correct project first.
export OWNER_USERNAME="your-username"
export OWNER_NAME="Your full name"
read -rs -p "Owner password: " OWNER_PASSWORD; echo
export OWNER_PASSWORD
node scripts/bootstrap-owner.mjs
unset OWNER_PASSWORD
```

**Never** paste the password, service-account JSON, or an Admin SDK access token into a chat, screenshot, public file, or GitHub repository.

## Firebase Auth and username login

Firebase Email/Password Auth requires an email-shaped identifier. The backend derives a deterministic internal email alias from the entered username. The user still types only Username and Password. This is an internal alias, not a deliverable mailbox.

**Limitation:** Standard email-based password recovery will NOT work for these synthetic aliases. The existing public demo recovery shortcut is hidden in the staged login UI. Implement secure owner-controlled password reset/recovery (and rate-limiting / App Check) before production public signup.

## Deployment requirements

1. Verify the project's Firebase Firestore and Authentication state; confirm active owner and DI sequence integrity.
2. On a trusted device, authenticate Firebase CLI to `durood-e-ibrahimi-global-c74e0`.
3. Initialize the owner securely, if truly the first and only member.
4. Test real username/password sign-in, one-time invitations, simultaneous registrations, owner permissions, suspended member behavior and Firestore rules (use Firebase Emulator Suite).
5. Finish replacing **all** offline/demo account, recitation, dashboard and profile data paths in the original application with Firebase-backed data and backend authorization.
6. Configure any necessary Cloud Functions billing (Blaze may be required), and deploy security rules and functions only once reviewed.
7. Create `public/` from the fully tested production build, then deploy Hosting.

**Current state: files staged in GitHub; no confirmed Firebase deployment, production owner account, or public website.**
