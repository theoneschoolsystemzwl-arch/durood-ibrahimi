# Member identity, owner login and DI serial numbers

## Approved user experience

- **DI-1** is the owner's first permanent **member number**, not a username, not a password and not a Firebase Authentication UID.
- Each new member receives the next immutable, unique serial **DI-2, DI-3, DI-4, …** once registration is fully confirmed.
- Never reassign a previously issued serial number after deletion or account suspension.
- Member number is displayed **after** registration on the member's profile, membership card, directory and owner dashboard. Never prefill it on the initial login screen.
- Login screen is the same for the owner and other members: **Username** and **Password**. Optional email login for owner is acceptable.
- No sample-login buttons, default demo credentials, visible demonstration member accounts or registration shortcut on the production login screen.
- Owner's first account is created through a one-time, secure owner bootstrap/claim process; **do not automatically grant owner privileges to any public registration or merely to a client-supplied DI-1**.
- After the owner is initialized, ordinary public signup requires an authorized invitation code, following the existing app model.

## Important Firebase technical constraints

Firebase **Email/Password** Authentication directly accepts an email and a password, not a username and password. To provide username-only login, implement a **secure server-mediated username-to-authentication mapping or a custom authentication service**. Never put a user password, shared owner password, login mapping that permits unauthorized use, or Admin SDK/service credentials in browser code. Owner can use their real email and password as the simplest first version.

The Firebase Authentication **UID** is an internal unique identifier. It is separate from DI serial and may be long. Do not replace or delete an existing Authentication user to shorten their UID. Hide UID from the public UI.

Store each member document keyed by Auth UID, with separate fields `memberNumber`, `serial`, `username`, `role`, `inviterUid`, and created timestamps. Enforce unique usernames on trusted backend. Allocate sequential DI numbers with a **trusted backend Firestore transaction**, not a client-side counter, to prevent duplicates from simultaneous signups. Configure verified Firebase Auth and Firestore Security Rules for per-user access and admin roles.

## Current repository status

- `source/Durood-Ibrahimi-Global-Original.html` is the preserved original offline demo app.
- `development/index.html` is a **UI-only staging copy**: DI login hints/demo login buttons removed and username-only form shown. **It still contains offline/demo data and is not production-safe. Do not publish this staging file as a real login service.**
- `src/firebase.js` has Firebase SDK configuration. Production authentication, database logic, rules and hosting deployment remain to implement and verify.

## Cleanup guidance

Do not delete `DI-1`, the Firebase project, Firebase Authentication provider or any real owner's user record to remove visible UI text. Remove UI placeholders and demo seed data in the production migration; confirm any actual account targeted for deletion and its data impact first.
