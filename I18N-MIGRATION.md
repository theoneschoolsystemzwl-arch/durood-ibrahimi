# Three-language migration — staged review branch

- Existing locale switch cycles Urdu, English, Indonesian and persists selection. The Urdu RTL layout stays fixed. Prayer names stay in Arabic script.
- 294 additional exact UI strings cover the login portal and common wirid cards, controls, forms, and static guidance. The earlier Indonesian dictionary has 329 entries.
- Arabic text and explicitly marked user-authored fields are not translated by the static-label scanner. No database fields or counting rules changed.
- Incomplete: dynamic phrases, browser confirm dialogs, remaining untranslated dashboard/portal/PDF/PWA texts, custom user-authored translations (require separate language-specific fields), and mobile visual/functional regression checks. Exact-label localization is deliberately conservative; unmatched content remains unchanged. Do not deploy as a finished translation yet.
