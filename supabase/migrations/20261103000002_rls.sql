-- Row level security (design.md §2): a user can see a trip and everything in it
-- only after join_trip / create_trip has written their trip_access row.
-- Writes to trips, members and expenses go through the security definer RPCs;
-- settlements are written directly, so they get insert/delete policies.

create function public.has_trip_access(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_access a
    where a.trip_id = p_trip_id and a.user_id = auth.uid()
  );
$$;

revoke all on function public.has_trip_access(uuid) from public, anon;
grant execute on function public.has_trip_access(uuid) to authenticated;

create policy "members of a trip can read it"
  on public.trips for select to authenticated
  using (public.has_trip_access(id));

create policy "users can read their own access rows"
  on public.trip_access for select to authenticated
  using (user_id = auth.uid());

create policy "trip members can read members"
  on public.members for select to authenticated
  using (public.has_trip_access(trip_id));

create policy "trip members can read expenses"
  on public.expenses for select to authenticated
  using (public.has_trip_access(trip_id));

create policy "trip members can read expense splits"
  on public.expense_splits for select to authenticated
  using (public.has_trip_access(trip_id));

create policy "trip members can read expense items"
  on public.expense_items for select to authenticated
  using (public.has_trip_access(trip_id));

create policy "trip members can read settlements"
  on public.settlements for select to authenticated
  using (public.has_trip_access(trip_id));

create policy "trip members can record settlements"
  on public.settlements for insert to authenticated
  with check (public.has_trip_access(trip_id));

create policy "trip members can delete settlements"
  on public.settlements for delete to authenticated
  using (public.has_trip_access(trip_id));

-- Defense in depth: the anon role (no session at all) gets nothing, even if a
-- policy is later written without "to authenticated".
revoke all on public.trips, public.trip_access, public.members, public.expenses,
  public.expense_splits, public.expense_items, public.settlements from anon;

-- Authenticated users only need what the policies above allow.
revoke insert, update, delete, truncate, references, trigger on public.trips, public.trip_access,
  public.members, public.expenses, public.expense_splits, public.expense_items from authenticated;
revoke update, truncate, references, trigger on public.settlements from authenticated;
