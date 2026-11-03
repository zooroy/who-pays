import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Avatar, Button, Notice, Ticket, TicketRow } from '../../components'
import { formatMoney, splitEvenly } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { tripKey, type Member } from '../trip/api'
import { deleteExpense } from './api'
import { SAVE_ERROR, type Expense } from './model'
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
      <h2>{expense.title}</h2>
      <p className="expense-total amount">{formatMoney(expense.amount, expense.currency)}</p>
      <p>日期：{expense.spent_on}</p>
      <section className="trip-stack">
        <h3>付款人</h3>
        {payer && (
          <div className="trip-member">
            <Avatar avatarId={payer.avatar_id} decorative />
            <span>{payer.name}</span>
          </div>
        )}
      </section>
      <section className="trip-stack">
        <h3>分攤者</h3>
        {splitters.map((m) => (
          <Ticket key={m.id}>
            <TicketRow
              title={m.name}
              leading={<Avatar avatarId={m.avatar_id} decorative />}
              amount={formatMoney(shares.get(m.id) ?? 0, expense.currency)}
            />
          </Ticket>
        ))}
      </section>
      {items.length > 0 && (
        <section className="trip-stack">
          <h3>品項明細</h3>
          {items.map((item) => (
            <Ticket key={item.position}>
              <TicketRow
                title={
                  <>
                    {item.name}
                    {item.name_zh && item.name_zh !== item.name && (
                      <span className="expense-translation">{item.name_zh}</span>
                    )}
                  </>
                }
                meta={`數量 ${item.qty}${item.unit_price !== null ? ` · 單價 ${formatMoney(item.unit_price, expense.currency)}` : ''}`}
                amount={formatMoney(item.amount, expense.currency)}
              />
            </Ticket>
          ))}
          {difference !== 0 && (
            <Notice>品項加總與總額差 {formatMoney(difference, expense.currency)}</Notice>
          )}
        </section>
      )}
      {expense.receipt_path && (
        <section className="trip-stack">
          <h3>收據照片</h3>
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
        </section>
      )}
      <p>最後由 {members.find((m) => m.id === expense.updated_by)?.name ?? '未知成員'} 修改</p>
      {error && <Notice tone="problem">{error}</Notice>}
      {confirm ? (
        <section className="trip-stack" aria-label="確認刪除支出">
          <p>確定要刪除這筆支出嗎？</p>
          <Button busy={busy} onClick={() => void remove()}>
            刪除支出
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>
            取消
          </Button>
        </section>
      ) : (
        <div className="trip-actions">
          <Button onClick={() => navigate(`${path}/expenses/${expense.id}/edit`)}>編輯</Button>
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            刪除
          </Button>
        </div>
      )}
      <Button variant="quiet" disabled={busy} onClick={() => navigate(path)}>
        回到列表
      </Button>
    </div>
  )
}
