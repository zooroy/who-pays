import { supabase } from '../../lib/supabase'
import { isCurrencyCode, type CurrencyCode } from '../../lib/money'
import type { Settlement } from './model'

function isSettlement(row: unknown): row is Settlement {
  if (typeof row !== 'object' || row === null) return false
  const r = row as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.from_member === 'string' &&
    typeof r.to_member === 'string' &&
    typeof r.amount === 'number' &&
    isCurrencyCode(r.currency) &&
    typeof r.created_at === 'string'
  )
}

export async function getSettlements(tripId: string): Promise<Settlement[]> {
  const { data, error } = await supabase
    .from('settlements')
    .select('id,from_member,to_member,amount,currency,created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((row: unknown) => {
    if (!isSettlement(row)) throw new Error('Invalid settlement')
    return row
  })
}

export async function recordSettlement(input: {
  tripId: string
  from: string
  to: string
  amount: number
  currency: CurrencyCode
  createdBy: string
}) {
  const { error } = await supabase.from('settlements').insert({
    trip_id: input.tripId,
    from_member: input.from,
    to_member: input.to,
    amount: input.amount,
    currency: input.currency,
    created_by: input.createdBy,
  })
  if (error) throw error
}

export async function deleteSettlement(id: string) {
  const { error } = await supabase.from('settlements').delete().eq('id', id)
  if (error) throw error
}
