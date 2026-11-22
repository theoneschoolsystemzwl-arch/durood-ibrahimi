# Durood Global — implementation and deployment report
Date: 22 November 2026

## Status definitions

- **LIVE:** verified website behaviour on Cloudflare Pages.
- **STAGED:** code in protected draft pull request; tested locally or in GitHub CI, but not installed in production Firebase.
- **BLOCKED:** requires authenticated Firebase/Google Cloud project administration and real data migration.

## LIVE and preserved

- Original classic dashboard, colors, layout and member data remain unchanged on production.
- Mobile WebView stability fix (fixed frame size and navigation row sizing) is merged on `main`.
- "Keep me logged in" uses Firebase local browser persistence; app minimization does not intentionally call logout.
- Login error wording is brief.
- Cloudflare web URL: https://durood-ibrahimi.pages.dev/
- Source backup: `backup-stable-2026-11-22-before-gender-separation`.
- Most recent pre-stability backup: `backup-live-before-mobile-stability-2026-11-22`.
- **Neither Git branch is a Firestore/Auth database backup.**

## STAGED in pull request #3

1. Registration: exactly one Male/Female choice, matching Urdu oath and oath checkbox; gender saved as immutable account metadata.
2. Owner-issued one-use invitation codes accept Male or Female; ordinary members' invitations are locked to their own side. Server rules reject cross-gender codes.
3. UID-based Firebase email/password authentication remains independent of the DI member number. DI-1 belongs to the Owner; newly created accounts use the next global DI number.
4. Female Side's first account is a normal member, not a second Owner. The owner of the invitation increments their own direct-referral count; a new female member starts with zero invitations.
5. Gender-separated Firestore member profiles, private prayer records, counts, rankings, member totals, and group messages.
6. Both sides use the SAME original classic UI. Owner can switch views via the profile card and administer accounts on either side.
7. Group messages live in `groupChats/male/messages` and `groupChats/female/messages` with server-side cross-gender permission checks and sender attribution.
8. Owner can suspend, restore, and reversibly soft-delete members (no irreversible Auth deletion, no DI number recycling).
   Owner may explicitly clear a lost-phone login lock; a second device cannot reset the first device's lease.
9. Owner can explicitly classify old gender-less profiles once; the app must not guess the gender of existing users.
10. Member first-device-wins session: later login attempts are refused; the original session cannot be replaced by the other phone. Explicit logout releases its lease. Owner has multiple device access.
11. New per-side aggregates: `genderMembers/{male|female}` and `genderStats/{male|female}`, with atomic transactions.
12. Original Android viewport and bottom-tab stability changes are retained.
13. Firestore indexes defined in `firestore.indexes.json`; test suite checks classic script syntax and Firebase rules.

## Actual CI testing

- GitHub "Verify web app and Firebase backend": parses JS, including original dashboard inline scripts, and validates contracts.
- GitHub "Validate Spark Firestore security": Firebase Firestore emulator verifies DI registration, gender-scoped reads, one-device lease, cross-gender messaging rejection, Owner control and reversible member status.
- A separate emulated registration scenario checks Owner invites first female **DI-3** following a male **DI-2** enrolment, with zero personal referrals for the new female.
- These CI tests do **not** verify access to production Firestore, users' real records, or two physical Android devices.

## Why production gender mode is NOT deployed yet

1. **No Firebase admin plugin/credential currently connected.** The GitHub Firebase Hosting workflow failed with Google Workload Identity `invalid_target` because the referenced identity provider is missing, disabled or incorrect. GitHub/Cloudflare hosting succeeds independently, but **does not deploy Firestore Rules**.
2. A full and separately verified Firestore/Auth backup is not available. Original data must never be overwritten or genders guessed.
3. The legacy member profiles and memberCount documents need an owner-approved gender assignment and a backfill of gender-specific totals before strict rules are enabled.
4. Firestore indexes must be published and READY.
5. Publishing strict rules without the matching new website could break existing active members. Publishing the new website before strict rules could break registrations and stats. A coordinated cutover, maintenance window, and rollback are necessary.
6. Firebase Authentication `auth_time` has one-second precision. The current Spark-only session lease substantially restricts other logins but cannot cryptographically guarantee absolute one-device access for two logins with the same auth timestamp. Full guarantee requires a stronger server-issued per-session authentication design (usually a privileged backend).
7. Physical device tests and production end-to-end checks remain outstanding.

## Prepared migration

`functions/scripts/prepare-gender-migration.cjs` supports audit mode and an explicitly authorized apply mode. Apply requires the exact Firebase project confirmation, a user-controlled private backup path, and explicit gender mapping for unknown legacy members; it refuses to alter records if data is ambiguous or totals do not reconcile. It never deletes legacy members or prayer data. This script has **NOT** run against production.

## Required release procedure

1. Enable authenticated Firebase project administration and confirm the exact Owner UID and Firestore project.
2. Make and verify a real Firestore/Auth backup.
3. Audit legacy members; obtain explicit gender assignments; run the safe migration only after approval and backup verification.
4. Deploy the composite Firestore index and wait for it to become ready.
5. Coordinate an outage-minimizing rules/client cutover and test actual male/female account creation, referral totals, chat and owner switching.
6. Test two real phones: original stays logged in; second is rejected; original manually logs out; second logs in; owner works on both. Check app relaunch and navbar stability. Include a lost-phone recovery test initiated only by the Owner.
7. Record the deployment commit and retain an audited rollback.

**Note:** 22 November 2026: No authenticated Firebase Admin access has been provided to this chat. The latest GitHub Firebase Hosting run failed at `google-github-actions/auth` with `invalid_target` for the Google Workload Identity provider. The successful emulator tests do not authorize production deployment.

**Do not merge draft PR #3 or ask the user to register the wife until these conditions are met.**
