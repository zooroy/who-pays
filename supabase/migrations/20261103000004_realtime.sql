-- Child tables already carry trip_id, allowing the same trip filter on all five tables.
alter publication supabase_realtime add table
  public.members,
  public.expenses,
  public.expense_splits,
  public.expense_items,
  public.settlements;
