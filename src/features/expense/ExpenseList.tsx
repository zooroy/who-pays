import { useNavigate } from 'react-router'
import { Avatar, Ticket, TicketRow } from '../../components'
import { formatMoney } from '../../lib/money'
import type { Member } from '../trip/api'
import { dateLabel, groupExpenses, type Expense } from './model'

export function ExpenseList({
  expenses,
  members,
  path,
}: {
  expenses: Expense[]
  members: Member[]
  path: string
}) {
  const navigate = useNavigate()
  if (!expenses.length)
    return (
      <Ticket>
        <p className="trip-empty">還沒有支出。拍下第一張收據，或手動新增一筆。</p>
      </Ticket>
    )
  return (
    <div className="trip-stack">
      {groupExpenses(expenses).map((group) => (
        <section key={group.date} className="expense-day" aria-label={dateLabel(group.date)}>
          <h2 className="expense-day__date">{dateLabel(group.date)}</h2>
          {group.expenses.map((expense) => {
            const payer = members.find((m) => m.id === expense.paid_by)
            const count = expense.expense_splits.length
            const amount = formatMoney(expense.amount, expense.currency)
            return (
              <Ticket
                key={expense.id}
                onClick={() => navigate(`${path}/expenses/${expense.id}`)}
                label={`${expense.title}，${amount}，${payer?.name ?? '未知成員'}付，${count} 人分`}
              >
                <TicketRow
                  title={expense.title}
                  amount={amount}
                  leading={payer && <Avatar avatarId={payer.avatar_id} decorative />}
                  meta={count === members.length ? '全員分' : `${count} 人分`}
                />
              </Ticket>
            )
          })}
        </section>
      ))}
    </div>
  )
}
