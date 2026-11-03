import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { tripKey } from './api'

const TRIP_TABLES = ['members', 'expenses', 'expense_splits', 'expense_items', 'settlements']

/**
 * Keeps a trip's queries fresh while its screens are open (design.md §6).
 *
 * INSERT and UPDATE are filtered to this trip. Supabase cannot filter DELETE
 * events, so deletes of expenses and settlements (the only rows the app ever
 * deletes; splits and items cascade with their expense) are subscribed without a
 * filter. A delete event carries only the row id, so any delete simply refetches
 * this trip; that is cheap at this app's scale.
 */
export function useTripRealtime(tripId: string) {
  const client = useQueryClient()
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({ queryKey: tripKey(tripId) })
    }
    const channel = supabase.channel(`trip:${tripId}`)
    for (const table of TRIP_TABLES) {
      for (const event of ['INSERT', 'UPDATE'] as const) {
        channel.on(
          'postgres_changes',
          { event, schema: 'public', table, filter: `trip_id=eq.${tripId}` },
          refresh,
        )
      }
    }
    for (const table of ['expenses', 'settlements']) {
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, refresh)
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') refresh()
    })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [client, tripId])
}
