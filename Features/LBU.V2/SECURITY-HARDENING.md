# Security Hardening Checklist

This project now has a stricter database model for office-only use:

- `public.admin_users` is the real database-backed admin allow-list.
- `public.lb_records` is protected by RLS through `public.has_admin_record_access(auth.uid())`.
- `public.record_audit_logs` stores insert, update, and delete audit events.
- Cloud-mode records are now kept in memory during the browser session instead of being mirrored back into `localStorage`.
- `/_headers` adds safer HTTP headers for Netlify deployments.

## 1. Re-run the SQL setup

Run [`supabase/setup.sql`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/supabase/setup.sql) again in the Supabase SQL Editor so the new tables, functions, policies, and triggers are created.

## 2. Register the real admin in the database

After the Supabase Auth user exists, run this in the SQL Editor:

```sql
select public.upsert_admin_user('cnlajarastaff@gmail.com', 'admin', true, false);
```

If you want to remove old database-backed admins:

```sql
delete from public.admin_users
where lower(email) <> 'cnlajarastaff@gmail.com';
```

## 3. Review the audit log

You can inspect recent record changes with:

```sql
select
    action_at,
    action,
    actor_email,
    record_id
from public.record_audit_logs
order by action_at desc
limit 100;
```

## 4. MFA note

The database now has a `require_mfa` flag per admin user so you can enforce stronger sessions later.

Important:

- This static app does **not** yet include a full TOTP enrollment and challenge flow for office staff.
- Because of that, do **not** set `require_mfa = true` on live admin rows until you are ready to roll out the MFA workflow for those users.

When you are ready, update the admin row:

```sql
update public.admin_users
set require_mfa = true
where lower(email) = 'cnlajarastaff@gmail.com';
```

## 5. Netlify access gate

For an internal office deployment, add another gate in Netlify:

- enable password protection or stronger visitor-access controls
- keep the site link private
- if possible, restrict access to office-managed accounts or networks

## 6. Backups and recovery

In Supabase:

- confirm daily backups are enabled for your plan
- if budget allows, enable Point-in-Time Recovery
- document who is allowed to restore data

## 7. Operational controls

- Use one account per staff member.
- Do not share passwords.
- Remove access immediately when a staff member leaves.
- Use only office-approved computers for this system.
- Maintain a written list of who can view, edit, or delete records.
- Periodically review `admin_users` and `record_audit_logs`.
