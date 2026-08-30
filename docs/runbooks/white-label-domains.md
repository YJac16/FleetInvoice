# White-label custom domains

Map a hostname to an organisation via **White-label** in the ops app (`/white-label`). Middleware calls `lookup_white_label` and sets theme cookies.

## Steps

1. Apply migration `00014_phase9_white_label.sql` on the WorkOps Supabase project.
2. In Vercel → Project **workops** → Domains → add `client.example.com`.
3. Point DNS (CNAME to `cname.vercel-dns.com` or as Vercel instructs).
4. Create/update the white-label row: hostname + optional logo/primary/accent.
5. Update Supabase Auth redirect allow-list for the custom host if users sign in there.

Theme tokens are applied client-side from the `workops_wl` cookie.
