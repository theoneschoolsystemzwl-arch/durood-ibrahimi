# Three-language migration — staged review branch

Existing Urdu/English translator now supports Indonesian (512 dictionary keys), fixed RTL root direction, Arabic-script prayer names, and saved locale selection. Static dictionary has 323 exact entries for common login/wirid UI. Saved custom content is protected; known built-in instructions are translated. No Firebase data changes.

Validation: JavaScript parsing passed for localization scripts and wirid source (imports excluded for parsing). Five direct localization assertions passed. Added node:test tests; full browser and regression suite not run.

Remaining: dynamic/composite labels, all other hard-coded dashboard, portal, PWA/PDF and alert texts, and custom user-authored translations (need separate per-language data fields). Mobile layout and regression checks remain. Do not deploy as completed localization.
