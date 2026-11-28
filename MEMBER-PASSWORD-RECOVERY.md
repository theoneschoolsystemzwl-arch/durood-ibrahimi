# Member password recovery (Firebase Spark)

This recovery changes an existing ordinary member's Firebase Authentication password without email. It requires an authorized Google Cloud account for the existing project. It does not delete the account, modify its Firestore records, or enable billing.

## Reset the member's password

Click the command's **Run in Cloud Shell** control, then press Enter if prompted.

```bash
python3 scripts/reset-member-password.py
```

Enter the Firebase UID shown on the member profile. Check the displayed name, username and UID, then confirm the UID. Enter the new password twice in the terminal; it will not be displayed.

If the script reports an authorization or account error, stop. Do not delete or recreate the member.

## Finish

Only after the script reports a successful password update should the member sign in using their existing username and new password. Never share the password in chat, GitHub, or logs.
