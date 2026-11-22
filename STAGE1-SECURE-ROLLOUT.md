# Stage 1 — Gender-scoped invitations and device sessions

Status: **draft / not merged / not deployed to production.**
Stable backup: `backup-stable-2026-11-22-before-gender-separation`.
The Firebase Spark site uses client-side Auth and Firestore; deployed Cloud Functions are NOT a prerequisite and cannot silently substitute for published Firestore Security Rules.

## What the staging code does

- Registers each new account with immutable `gender: male|female` and synchronizes the oath wording/confirmation with the chosen gender.
- Existing accounts without a gender are *treated as male in application logic*, with no automatic mass overwrite or deletion.
- Owner-created single-use codes use `gender: any`; member-created codes are locked to the member's gender. Server rules check inviter identity, inviter gender, chosen gender, and one-use consumption in the same transaction. Previous Owner codes without gender are treated as any, previous ordinary-member codes as their issuer's gender.
- Stores `activeLogins/{memberUid}` after successful password login, with Firebase signed `auth_time` and local session identifier. A second login shows an already-online message and is refused; only the first browser's explicit Logout releases the lease. Firestore rules deny old-auth-time access. Owner is exempt. No second-device forced logout or device registration is used. Logout conditionally releases only its own lease.
- Limits gender-specific member profile/count visibility and includes checks in the dormant server-side callable code.

## Reasons it MUST NOT be deployed yet

1. **No independent Firebase data backup has been verified.** The stable Git branch backs up source code but not Firestore/Auth records.
2. **Firestore Rules publication is not connected/verified.** Pushing to GitHub/Cloudflare updates the website only; it does NOT install new security rules. New registration and session writes would fail under the current live rules. A staged rules/client release and rollback plan are required.
3. **Legacy memberCounts documents may lack gender.** Backfill should be done using verified Admin credentials with preservation and reversible audit before gender-filtered rankings are activated.
4. **Strict one-device enforcement needs stronger per-device server-issued identity for absolute guarantees.** Firebase `auth_time` uses second resolution; simultaneous logins in the same second can share the claim. The present implementation offers takeover and blocks sessions with different auth times, but cannot cryptographically distinguish those same-second sessions with standard password-auth Firestore claims alone.
5. **Live integration tests are still needed** for new-user account creation, email/password login, network reconnection, a two-phone rejected-login and manual-logout transfer, Owner multi-device access, gender-isolated reads, and two-sided invitation codes. Emulator tests are necessary but not sufficient.
6. The female side's inaugural member/Owner switch UI, and separate per-side public statistics/complete app data flows, belong to later stages; do not call those finished.

## Safe rollout

- Confirm Firebase project and authenticated deployment method, snapshot Firestore/Auth data before editing.
- Run GitHub structural checks and local Firebase Firestore emulator permissions tests.
- Prepare two-phase backward-compatible policy migration, legacy gender tagging, indexes, and session enrollment. Never blindly publish a strict rule that blocks users still on the old client.
- Test the entire release on a disposable Firebase project and at least two actual Android devices.
- Publish rules + matching client only when verified, monitor failures, and retain a tested rollback that does not lose newly created gender/account data.

Do not overwrite the currently published app, original design, user records or backups just to satisfy a green CI check.
