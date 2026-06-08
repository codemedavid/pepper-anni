-- Promo subscribers: secure write-only signup.
--
-- Background: the original create migration enabled RLS with an INSERT policy for
-- anon, but (a) the table had no table-level GRANT for anon and (b) the client
-- used supabase-js .upsert() which exercises the ON CONFLICT path. That path
-- requires SELECT/UPDATE policies, which anon must NOT have (it would expose the
-- entire subscriber email list to anyone holding the public anon key).
--
-- Fix: keep the table readable only by authenticated users, and expose a
-- SECURITY DEFINER function for public signup. anon can call the function (which
-- only inserts) but can never read or modify the table directly.

-- Ensure anon can perform the insert the function relies on is unnecessary
-- (SECURITY DEFINER runs as the function owner), but keep a clean permissive
-- INSERT policy + grant in case of direct inserts.
drop policy if exists "Allow anonymous inserts" on public.promo_subscribers;
drop policy if exists "tmp_public_insert" on public.promo_subscribers;

create policy "promo_subscribers_insert"
  on public.promo_subscribers
  for insert
  to public
  with check (true);

grant insert on public.promo_subscribers to anon, authenticated;

create or replace function public.subscribe_to_promos(p_email text, p_source text default 'tbs_promo_popup')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'invalid email';
  end if;

  insert into public.promo_subscribers (email, source)
  values (lower(trim(p_email)), coalesce(p_source, 'tbs_promo_popup'))
  on conflict (email) do nothing;
end;
$$;

revoke all on function public.subscribe_to_promos(text, text) from public;
grant execute on function public.subscribe_to_promos(text, text) to anon, authenticated;
