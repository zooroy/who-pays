import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar, Button, Notice, PaidStamp, Ticket, TicketRow } from '../../components'
import { CURRENCIES, CURRENCY_CODES, formatMoney, type CurrencyCode } from '../../lib/money'
import type { Transfer } from '../../lib/settle'
import { tripKey, type Member, type Trip } from '../trip/api'
import type { Expense } from '../expense/model'
import { deleteSettlement, getSettlements, recordSettlement } from './api'
import { settleView, transferKey, type Settlement } from './model'
import './settle.css'

/** How long a just-stamped transfer stays on screen before it leaves the list. */
const STAMP_HOLD_MS = 1200

function shortDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function SettlePage({
  trip,
  members,
  expenses,
  me,
}: {
  trip: Trip
  members: Member[]
  expenses: Expense[]
  me: Member
}) {
  const settlements = useQuery({
    queryKey: [...tripKey(trip.id), 'settlements'],
    queryFn: () => getSettlements(trip.id),
  })
  if (settlements.isPending) return <p role="status">載入中…</p>
  if (!settlements.data)
    return (
      <Notice
        tone="problem"
        action={<Button onClick={() => void settlements.refetch()}>重新載入</Button>}
      >
        無法讀取結算，請再試一次。
      </Notice>
    )
  return (
    <SettleContent
      trip={trip}
      members={members}
      expenses={expenses}
      me={me}
      settlements={settlements.data}
    />
  )
}

interface Stamped {
  currency: CurrencyCode
  transfer: Transfer
  date: string
}

function SettleContent({
  trip,
  members,
  expenses,
  me,
  settlements,
}: {
  trip: Trip
  members: Member[]
  expenses: Expense[]
  me: Member
  settlements: Settlement[]
}) {
  const queryClient = useQueryClient()
  const [stamped, setStamped] = useState<Record<string, Stamped>>({})
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const byId = new Map(members.map((m) => [m.id, m]))
  const view = settleView(
    members.map((m) => m.id),
    expenses,
    settlements,
    me.id,
  )
  const refresh = () => queryClient.invalidateQueries({ queryKey: tripKey(trip.id) })

  async function markPaid(currency: CurrencyCode, transfer: Transfer) {
    const key = transferKey(currency, transfer)
    if (busyKey) return
    setBusyKey(key)
    setError('')
    try {
      await recordSettlement({
        tripId: trip.id,
        from: transfer.from,
        to: transfer.to,
        amount: transfer.amount,
        currency,
        createdBy: me.id,
      })
      // Keep the ticket on screen while the stamp lands, even if a realtime
      // refetch removes the suggestion first.
      setStamped((s) => ({ ...s, [key]: { currency, transfer, date: shortDate(new Date()) } }))
      void refresh()
      timers.current.push(
        window.setTimeout(() => {
          setStamped(({ [key]: _done, ...rest }) => rest)
        }, STAMP_HOLD_MS),
      )
    } catch {
      setError('無法標記已付，請確認網路連線後再試一次。')
    } finally {
      setBusyKey(null)
    }
  }

  async function remove(id: string) {
    setDeletingId(id)
    setError('')
    try {
      await deleteSettlement(id)
      setConfirmId(null)
      await refresh()
    } catch {
      setError('無法刪除這筆還款，請確認網路連線後再試一次。')
    } finally {
      setDeletingId(null)
    }
  }

  const name = (id: string) => byId.get(id)?.name ?? '未知成員'
  const pair = (from: string, to: string) => {
    const a = byId.get(from)
    const b = byId.get(to)
    return (
      <span className="settle-pair" aria-hidden="true">
        {a && <Avatar avatarId={a.avatar_id} size="small" decorative />}
        <span className="settle-pair__arrow">→</span>
        {b && <Avatar avatarId={b.avatar_id} size="small" decorative />}
      </span>
    )
  }

  // Sections still showing: currencies with suggestions, plus any whose last
  // transfer was just stamped.
  const pendingStamps = Object.entries(stamped)
  const sectionCurrencies = CURRENCY_CODES.filter(
    (c) =>
      view.transfers.some((s) => s.currency === c) ||
      pendingStamps.some(([, v]) => v.currency === c),
  )
  const showAllSettled = view.allSettled && pendingStamps.length === 0

  return (
    <div className="trip-stack">
      {error && <Notice tone="problem">{error}</Notice>}

      {expenses.length === 0 ? (
        <Ticket>
          <p className="trip-empty">還沒有支出。新增支出後，這裡會算出誰該付給誰。</p>
        </Ticket>
      ) : showAllSettled ? (
        <section className="settle-done" aria-labelledby="settle-done-title">
          <PaidStamp size="large" />
          <h2 id="settle-done-title">全部結清</h2>
          <p>每個人在每種幣別都已經還清了。</p>
        </section>
      ) : (
        <section className="trip-stack" aria-labelledby="settle-mine-title">
          <h2 id="settle-mine-title" className="settle-heading">
            <Avatar avatarId={me.avatar_id} size="small" isMe decorative />
            你的結算
          </h2>
          <Ticket>
            <ul className="settle-rows">
              {view.mine.map(({ currency, net }) => (
                <li key={currency}>
                  <TicketRow
                    title={net < 0 ? '你要付出' : net > 0 ? '你會收回' : '已結清'}
                    meta={CURRENCIES[currency].label}
                    amount={net === 0 ? '—' : formatMoney(Math.abs(net), currency)}
                  />
                </li>
              ))}
            </ul>
          </Ticket>
        </section>
      )}

      {sectionCurrencies.length > 0 && (
        <section className="trip-stack" aria-labelledby="settle-transfers-title">
          <h2 id="settle-transfers-title">轉帳建議</h2>
          {sectionCurrencies.map((currency) => {
            const live = view.transfers.find((s) => s.currency === currency)?.transfers ?? []
            const liveKeys = new Set(live.map((t) => transferKey(currency, t)))
            const leaving = pendingStamps
              .filter(([k, v]) => v.currency === currency && !liveKeys.has(k))
              .map(([, v]) => v.transfer)
            return (
              <section key={currency} className="trip-stack settle-currency">
                <h3>{CURRENCIES[currency].label}</h3>
                {[...leaving, ...live].map((t) => {
                  const key = transferKey(currency, t)
                  const amount = formatMoney(t.amount, currency)
                  const stamp = stamped[key]
                  return (
                    <Ticket
                      key={key}
                      stub={
                        <div className="settle-stub">
                          <Button
                            variant="secondary"
                            className={stamp ? 'settle-stub__hidden' : undefined}
                            busy={busyKey === key}
                            disabled={stamp !== undefined || (busyKey !== null && busyKey !== key)}
                            onClick={() => void markPaid(currency, t)}
                            aria-label={`標記已付：${name(t.from)} 付給 ${name(t.to)} ${amount}`}
                          >
                            標記已付
                          </Button>
                          {stamp && (
                            <span className="settle-stub__stamp">
                              <PaidStamp animate date={stamp.date} />
                            </span>
                          )}
                        </div>
                      }
                    >
                      <TicketRow
                        leading={pair(t.from, t.to)}
                        title={`${name(t.from)} 付給 ${name(t.to)}`}
                        amount={amount}
                      />
                    </Ticket>
                  )
                })}
              </section>
            )
          })}
        </section>
      )}

      {view.totals.length > 0 && (
        <section className="trip-stack" aria-labelledby="settle-total-title">
          <h2 id="settle-total-title">旅程總花費</h2>
          <Ticket>
            <ul className="settle-rows">
              {view.totals.map(({ currency, amount }) => (
                <li key={currency}>
                  <TicketRow
                    title={CURRENCIES[currency].label}
                    amount={formatMoney(amount, currency)}
                  />
                </li>
              ))}
            </ul>
          </Ticket>
        </section>
      )}

      {settlements.length > 0 && (
        <section className="trip-stack" aria-labelledby="settle-records-title">
          <h2 id="settle-records-title">還款紀錄</h2>
          <Ticket>
            <ul className="settle-rows">
              {settlements.map((s) => {
                const amount = formatMoney(s.amount, s.currency)
                const confirming = confirmId === s.id
                return (
                  <li key={s.id} className="settle-record">
                    <TicketRow
                      leading={pair(s.from_member, s.to_member)}
                      title={`${name(s.from_member)} 付給 ${name(s.to_member)}`}
                      meta={`${shortDate(new Date(s.created_at))} 標記已付`}
                      amount={amount}
                    />
                    <div className="settle-record__actions">
                      {confirming ? (
                        <>
                          <Button
                            variant="secondary"
                            disabled={deletingId === s.id}
                            onClick={() => setConfirmId(null)}
                          >
                            取消
                          </Button>
                          <Button busy={deletingId === s.id} onClick={() => void remove(s.id)}>
                            確定刪除
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="quiet"
                          onClick={() => setConfirmId(s.id)}
                          aria-label={`刪除還款：${name(s.from_member)} 付給 ${name(s.to_member)} ${amount}`}
                        >
                          刪除
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Ticket>
        </section>
      )}
    </div>
  )
}
