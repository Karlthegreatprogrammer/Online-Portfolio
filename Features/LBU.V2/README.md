# LBU.V2 Structure

Current patch version: `v2.0.1`

Recent system updates are tracked in [`CHANGELOG.md`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/CHANGELOG.md).

This project is organized into three main areas:

- `index.html`: simple entry page that redirects to the live client records view.
- Root HTML files: the active Lingkod Bayan pages used by the app.
- `assets/`: shared CSS, JavaScript, and images for the live app.

Supporting folders:

- `data/source-workbooks/`: project workbook files and backups kept inside the project.
- `archive/legacy-client-records-prototype/`: the old prototype that used to live in the numeric `090326` folder.
- `archive/workbook-inspection/`: unpacked spreadsheet contents kept only for reference.
- `archive/legacy-google-form-export.html`: archived raw Google Form export that is not part of the live app.
- `scripts/`: helper scripts such as `generate-ceu-data.ps1`.
- `supabase/`: SQL setup files for the shared online database.

Cleanup completed in this pass:

- Renamed the old `example4.html` redirect page to `index.html`.
- Moved workbook/source artifacts out of the project root.
- Kept the CEU import script pointed at the expected `FOR OJT.xlsx` workbook instead of the smaller contacts backup file.
- Removed deprecated unused files `assets/js/form.js` and `assets/js/extra.js`.

Shared online mode:

- `assets/js/supabase-config.js`: fill in your Supabase project URL, anon key, and admin email here.
- `assets/js/supabase-client.js`: loads the browser SDK and creates the shared client.
- `assets/js/data-store.js`: syncs client records to Supabase, keeps live cloud data in memory, and only preserves a one-time browser backup for migration.
- `assets/js/auth.js`: now supports both local fallback auth and Supabase Auth, plus database-backed admin validation.
- `supabase/setup.sql`: creates the shared records table, the `admin_users` allow-list, audit logging, and stricter RLS policies.
- CEU Database records now load from the `ceu_records` Supabase table. Run `supabase/setup.sql`, then the split files in `supabase/ceu-seed-parts` to populate the initial CEU data through the Supabase SQL Editor.
- `SUPABASE-DEPLOYMENT.md`: step-by-step setup and publish checklist.
- `SECURITY-HARDENING.md`: security checklist for sensitive office deployments.
- `import-tools.html`: dedicated admin page for the one-time browser-backup import tool and Excel import workflow.
- `_headers`: Netlify security headers for the deployed site.
