import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Avatar, Button, Notice, Ticket, TicketRow } from '../../components'
import { formatMoney, splitEvenly } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { tripKey, type Member } from '../trip/api'
import { deleteExpense } from './api'
import { SAVE_ERROR, dateLabel, type Expense } from './model'
import './expense.css'

export function ExpenseDetail({
  expense,
  members,
  tripId,
  path,
}: {
  expense: Expense
  members: Member[]
  tripId: string
  path: string
}) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const client = useQueryClient()
  const navigate = useNavigate()
  const receipt = useQuery({
    queryKey: [...tripKey(tripId), 'receipt', expense.receipt_path],
    enabled: !!expense.receipt_path,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('receipts')
        .createSignedUrl(expense.receipt_path!, 3600)
      if (error) throw error
      return data.signedUrl
    },
    staleTime: 50 * 60 * 1000,
    refetchInterval: 50 * 60 * 1000,
  })
  const payer = members.find((m) => m.id === expense.paid_by)
  // getMembers returns created_at order (then id for a deterministic tie-break).
  const splitters = members.filter((m) => expense.expense_splits.some((s) => s.member_id === m.id))
  const shares = splitters.length
    ? splitEvenly(
        expense.amount,
        splitters.map((m) => m.id),
      )
    : new Map<string, number>()
  const items = [...expense.expense_items].sort((a, b) => a.position - b.position)
  const difference = Math.abs(
    items.reduce((total, item) => total + item.amount, 0) - expense.amount,
  )
  async function remove() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await deleteExpense(expense)
      await client.invalidateQueries({ queryKey: tripKey(tripId) })
      navigate(path)
    } catch {
      setError(SAVE_ERROR)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="trip-stack">
      <Ticket
        stub={
          <p className="expense-stub">
            最後由 {members.find((m) => m.id === expense.updated_by)?.name ?? '未知成員'} 修改
          </p>
        }
      >
        <div className="expense-head">
          <h2 className="expense-head__title">{expense.title}</h2>
          <p className="expense-total amount">{formatMoney(expense.amount, expense.currency)}</p>
          <p className="expense-head__meta">{dateLabel(expense.spent_on)}</p>
          {payer && (
            <div className="trip-member">
              <Avatar avatarId={payer.avatar_id} decorative />
              <span>{payer.name} 付款</span>
            </div>
          )}
        </div>
      </Ticket>
      <section className="expense-section" aria-labelledby="expense-split-title">
        <h3 id="expense-split-title">分攤（{splitters.length} 人）</h3>
        <Ticket>
          <ul className="expense-rows">
            {splitters.map((m) => (
              <li key={m.id}>
                <TicketRow
                  title={m.name}
                  leading={<Avatar avatarId={m.avatar_id} size="small" decorative />}
                  amount={formatMoney(shares.get(m.id) ?? 0, expense.currency)}
                />
              </li>
            ))}
          </ul>
        </Ticket>
      </section>
      {items.length > 0 && (
        <section className="expense-section" aria-labelledby="expense-items-title">
          <h3 id="expense-items-title">品項明細</h3>
          <Ticket>
            <ul className="expense-rows">
              {items.map((item) => (
                <li key={item.position}>
                  <TicketRow
                    title={
                      <>
                        {item.name}
                        {item.name_zh && item.name_zh !== item.name && (
                          <span className="expense-translation">{item.name_zh}</span>
                        )}
                      </>
                    }
                    meta={`數量 ${item.qty}${item.unit_price !== null ? `，單價 ${formatMoney(item.unit_price, expense.currency)}` : ''}`}
                    amount={formatMoney(item.amount, expense.currency)}
                  />
                </li>
              ))}
            </ul>
          </Ticket>
          {difference !== 0 && (
            <Notice>品項加總與總額差 {formatMoney(difference, expense.currency)}</Notice>
          )}
        </section>
      )}
      {expense.receipt_path && (
        <details className="expense-photo">
          <summary>查看收據照片</summary>
          {receipt.isPending && <p role="status">載入照片中…</p>}
          {receipt.isError && (
            <Notice
              tone="problem"
              action={<Button onClick={() => void receipt.refetch()}>重新載入照片</Button>}
            >
              無法讀取收據照片。
            </Notice>
          )}
          {receipt.data && (
            <a href={receipt.data} target="_blank" rel="noreferrer">
              <img
                className="expense-receipt"
                src={receipt.data}
                alt={`${expense.title}的收據，點開看大圖`}
              />
            </a>
          )}
        </details>
      )}
      {error && <Notice tone="problem">{error}</Notice>}
      {confirm ? (
        <section className="trip-stack" aria-label="確認刪除支出">
          <p>確定要刪除這筆支出嗎？</p>
          <Button busy={busy} onClick={() => void remove()}>
            確定刪除
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>
            取消
          </Button>
        </section>
      ) : (
        <div className="trip-actions">
          <Button onClick={() => navigate(`${path}/expenses/${expense.id}/edit`)}>編輯支出</Button>
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            刪除支出
          </Button>
        </div>
      )}
      <Button variant="quiet" disabled={busy} onClick={() => navigate(path)}>
        回到列表
      </Button>
    </div>
  )
}
