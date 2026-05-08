# Supabase And Publish Steps

This project can now run in two modes:

- Local fallback mode: browser-only storage, useful before cloud setup.
- Shared online mode: records are stored in Supabase and auto-refresh across computers.
- Hardened office mode: access is approved through the database-backed `admin_users` table and record changes are written to audit logs.

## 1. Create Supabase project

1. Create a new Supabase project.
2. Open the SQL editor.
3. Run [`supabase/setup.sql`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/supabase/setup.sql).
4. Run the smaller files in [`supabase/ceu-seed-parts`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/supabase/ceu-seed-parts), from `ceu-seed-part-01.sql` through `ceu-seed-part-12.sql`, to import the initial CEU Database records through the Supabase SQL Editor.

## 2. Create the admin user in Supabase Auth

1. In Supabase Auth, create the admin user with email and password.
2. Confirm the user email if required.
3. Add the same email in [`assets/js/supabase-config.js`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/assets/js/supabase-config.js) for login-page convenience.

## 3. Register the admin in the database

After the Supabase Auth user exists, open SQL Editor and run:

```sql
select public.upsert_admin_user('cnlajarastaff@gmail.com', 'admin', true, false);
```

This is the real allow-list now. The frontend email list is no longer the security boundary.

## 4. Fill the browser config

Edit [`assets/js/supabase-config.js`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/assets/js/supabase-config.js):

- `enabled: true`
- `url: "https://YOUR_PROJECT.supabase.co"`
- `anonKey: "YOUR_SUPABASE_ANON_KEY"`
- `adminEmails: ["cnlajarastaff@gmail.com"]`

`adminEmail` is still supported as a legacy fallback, but `adminEmails` is better when you want two or more allowed accounts.

## 5. Test locally

1. Open [`admin-login.html`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/admin-login.html).
2. Log in with the Supabase admin account.
3. If this browser already had old `localStorage` records, open [`import-tools.html`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/import-tools.html) and use the **One-Time Supabase Import Tool**.
4. Verify the imported records in the table, then clear the browser backup from the same Import Tools page.
5. Open the site on two browsers or two computers.
6. Add, edit, and delete a record to confirm both screens update.

## 6. Publish the site

Use any static host such as Netlify or Vercel and upload the whole project folder.

- Entry page: [`index.html`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/index.html)
- Main records page: [`client-records.html`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/client-records.html)

## Notes

- Draft form autosave still uses local browser storage on purpose.
- Shared records, edits, and deletes now use the cloud data layer when Supabase is enabled.
- CEU CRUD uses the `ceu_records` table from `supabase/setup.sql`. Run the split SQL files in `supabase/ceu-seed-parts` once after setup to import the initial CEU records into Supabase through the SQL Editor.
- In cloud mode, live records are kept in memory during the session instead of being mirrored back into browser `localStorage`.
- The old browser record list is preserved only as a one-time migration backup until you import or clear it.
- The Supabase anon key is intended for browser use. Never expose the service role key in this project.
- Review [`SECURITY-HARDENING.md`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/SECURITY-HARDENING.md) before storing sensitive office data.
