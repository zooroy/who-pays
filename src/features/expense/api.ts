import { supabase } from '../../lib/supabase'
import type { Expense, expensePayload } from './model'

export async function getExpenses(tripId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(
      'id,title,amount,currency,spent_on,paid_by,updated_by,created_at,receipt_path,receipt_raw,expense_splits(member_id),expense_items(name,name_zh,qty,unit_price,amount,position)',
    )
    .eq('trip_id', tripId)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false })
    .returns<Expense[]>()
  if (error) throw error
  return data
}
export async function saveExpense(payload: ReturnType<typeof expensePayload>) {
  const { error } = await supabase.rpc('upsert_expense', { payload })
  if (error) throw error
}
export async function deleteExpense(expense: Expense) {
  if (expense.receipt_path) {
    const { error } = await supabase.storage.from('receipts').remove([expense.receipt_path])
    if (error) throw error
  }
  const { error } = await supabase.rpc('delete_expense', { expense_id: expense.id })
  if (error) throw error
}
