import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router'
import {
  AppShell,
  Avatar,
  AvatarRow,
  Button,
  CameraIcon,
  PencilIcon,
  Ticket,
  Notice,
} from '../../components'
import { hasErrorCode, membershipError, readIdentity, saveIdentity } from '../../lib/identity'
import {
  addMember,
  getMembers,
  getTrip,
  joinTrip,
  tripKey,
  updateMember,
  type Member,
  type Trip,
} from './api'
import { MemberForm } from './MemberForm'
import { useTripRealtime } from './useTripRealtime'
import { getExpenses } from '../expense/api'
import { ExpenseList } from '../expense/ExpenseList'
import { ExpenseForm } from '../expense/ExpenseForm'
import { ExpenseDetail } from '../expense/ExpenseDetail'
import { SettlePage } from '../settlement/SettlePage'
import { ReceiptScan } from '../receipt/ReceiptScan'
import { PhotoInput } from '../receipt/PhotoInput'
import { setPendingPhoto } from '../receipt/pending'
import type { Expense } from '../expense/model'

const HOME = { to: '/', label: '回到我的旅程' }

export function TripPage() {
  const { shareToken = '' } = useParams()
  const navigate = useNavigate()
  const joined = useQuery({
    queryKey: ['join-trip', shareToken],
    queryFn: () => joinTrip(shareToken),
    staleTime: Infinity,
    retry: false,
  })
  if (joined.isPending)
    return (
      <AppShell title="旅程" back={HOME}>
        <p role="status">載入中…</p>
      </AppShell>
    )
  if (!joined.data)
    return (
      <AppShell title="旅程" back={HOME}>
        <div className="trip-stack">
          <Notice tone="problem">{membershipError(joined.error)}</Notice>
          {!hasErrorCode(joined.error, 'TRIP_NOT_FOUND') && (
            <Button onClick={() => void joined.refetch()}>重新載入</Button>
          )}
          <Button onClick={() => navigate('/')}>回到我的旅程</Button>
        </div>
      </AppShell>
    )
  return <TripData key={joined.data} tripId={joined.data} />
}
function TripData({ tripId }: { tripId: string }) {
  useTripRealtime(tripId)
  const expenses = useQuery({
    queryKey: [...tripKey(tripId), 'expenses'],
    queryFn: () => getExpenses(tripId),
  })
  const trip = useQuery({
    queryKey: [...tripKey(tripId), 'details'],
    queryFn: () => getTrip(tripId),
  })
  const members = useQuery({
    queryKey: [...tripKey(tripId), 'members'],
    queryFn: () => getMembers(tripId),
  })
  if (trip.isPending || members.isPending || expenses.isPending)
    return (
      <AppShell title="旅程" back={HOME}>
        <p role="status">載入中…</p>
      </AppShell>
    )
  if (!trip.data || !members.data || !expenses.data)
    return (
      <AppShell title="旅程" back={HOME}>
        <Notice
          tone="problem"
          action={
            <Button
              onClick={() => {
                void trip.refetch()
                void members.refetch()
                void expenses.refetch()
              }}
            >
              重新載入
            </Button>
          }
        >
          無法讀取旅程，請再試一次。
        </Notice>
      </AppShell>
    )
  return <TripContent trip={trip.data} members={members.data} expenses={expenses.data} />
}
function TripContent({
  trip,
  members,
  expenses,
}: {
  trip: Trip
  members: Member[]
  expenses: Expense[]
}) {
  const navigate = useNavigate()
  const { expenseId } = useParams()
  const queryClient = useQueryClient()
  const location = useLocation()
  const [memberId, setMemberId] = useState(() => readIdentity(trip.id))
  const [panel, setPanel] = useState<'members' | 'add' | 'switch' | { edit: string } | null>(null)
  // Leaving a page closes the member panel, so it never hides the screen you navigate to.
  const [panelPath, setPanelPath] = useState(location.pathname)
  if (panelPath !== location.pathname) {
    setPanelPath(location.pathname)
    setPanel(null)
  }
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const me = members.find((m) => m.id === memberId)
  const path = `/t/${trip.share_token}`
  const isNew = location.pathname === `${path}/expenses/new`
  const isEdit = location.pathname.endsWith('/edit')
  const isCamera = isNew && new URLSearchParams(location.search).get('source') === 'camera'
  const selected = expenses.find((e) => e.id === expenseId)
  const isList = location.pathname === path
  const refresh = () => queryClient.invalidateQueries({ queryKey: tripKey(trip.id) })
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).href)
      setCopied(true)
      setError('')
    } catch {
      setError('無法複製連結，請再試一次。')
    }
  }
  function claim(id: string) {
    try {
      saveIdentity(trip.id, id)
      setMemberId(id)
      setPanel(null)
      setError('')
    } catch {
      setError('無法記住身份，請允許瀏覽器使用本機儲存空間後重試。')
    }
  }
  if (!me)
    return (
      <AppShell title={trip.name} back={HOME}>
        <div className="trip-stack">
          <h2>加入旅程</h2>
          {members.length >= 16 ? (
            <Notice>這趟旅程已經有 16 人，請從下面選擇你是誰。</Notice>
          ) : (
            <MemberForm
              members={members}
              label="加入旅程"
              onRefresh={refresh}
              onSave={async (name, avatar) => {
                const id = await addMember(trip.id, name, avatar)
                await refresh()
                claim(id)
              }}
            />
          )}
          <h2>我是……</h2>
          {error && <Notice tone="problem">{error}</Notice>}
          <ul className="trip-members">
            {members.map((m) => (
              <li key={m.id}>
                <Button
                  variant="secondary"
                  onClick={() => claim(m.id)}
                  icon={<Avatar avatarId={m.avatar_id} decorative />}
                >
                  {m.name}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </AppShell>
    )
  return (
    <AppShell
      title={trip.name}
      back={HOME}
      tripPath={path}
      thumbBar={
        isList && (
          <>
            <PhotoInput
              onPick={(file) => {
                setPendingPhoto(file)
                navigate(`${path}/expenses/new?source=camera`)
              }}
            >
              {(open) => (
                <Button big icon={<CameraIcon />} onClick={open}>
                  拍收據
                </Button>
              )}
            </PhotoInput>
            <Button
              variant="secondary"
              icon={<PencilIcon />}
              onClick={() => navigate(`${path}/expenses/new`)}
            >
              手動新增
            </Button>
          </>
        )
      }
      headerExtra={
        <button
          className="trip-header-members"
          type="button"
          aria-label="檢視成員列表"
          aria-expanded={panel === 'members'}
          onClick={() => setPanel(panel === 'members' ? null : 'members')}
        >
          <AvatarRow>
            {members.map((m) => (
              <Avatar
                key={m.id}
                avatarId={m.avatar_id}
                size="small"
                label={m.name}
                isMe={m.id === me.id}
              />
            ))}
          </AvatarRow>
        </button>
      }
    >
      <div className="trip-stack">
        {error && <Notice tone="problem">{error}</Notice>}
        {panel === 'members' ? (
          <section className="trip-stack" aria-labelledby="trip-members-title">
            <h2 id="trip-members-title">成員（{members.length} 人）</h2>
            <ul className="trip-members">
              {members.map((m) => (
                <li key={m.id} className="trip-member">
                  <Avatar avatarId={m.avatar_id} isMe={m.id === me.id} decorative />
                  <span className="trip-member__name">
                    {m.name}
                    {m.id === me.id ? '（你）' : ''}
                  </span>
                  <Button variant="quiet" onClick={() => setPanel({ edit: m.id })}>
                    編輯<span className="visually-hidden">{m.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
            <div className="trip-actions">
              <Button variant="secondary" onClick={() => void copyLink()}>
                {copied ? '已複製連結' : '複製旅程連結'}
              </Button>
              <Button variant="secondary" onClick={() => setPanel('add')}>
                新增朋友
              </Button>
            </div>
            <p className="trip-hint">
              朋友打開旅程連結就能自己加入；沒有手機的朋友可以由你代為新增。加入主畫面後，第一次打開請在「我的旅程」貼上這個連結。
            </p>
            <div className="trip-actions">
              <Button variant="quiet" onClick={() => setPanel('switch')}>
                切換身份
              </Button>
              <Button variant="quiet" onClick={() => setPanel(null)}>
                關閉
              </Button>
            </div>
          </section>
        ) : panel === 'switch' ? (
          <section className="trip-stack" aria-labelledby="trip-switch-title">
            <h2 id="trip-switch-title">切換身份</h2>
            <p className="trip-hint">選擇你在這趟旅程中是誰。</p>
            {error && <Notice tone="problem">{error}</Notice>}
            <ul className="trip-members">
              {members.map((m) => (
                <li key={m.id}>
                  <Button
                    variant="secondary"
                    disabled={m.id === me.id}
                    onClick={() => claim(m.id)}
                    icon={<Avatar avatarId={m.avatar_id} decorative />}
                  >
                    {m.name}
                    {m.id === me.id ? '（目前）' : ''}
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="quiet" onClick={() => setPanel('members')}>
              取消
            </Button>
          </section>
        ) : typeof panel === 'object' && panel !== null ? (
          <EditMember
            key={panel.edit}
            member={members.find((m) => m.id === panel.edit)}
            members={members}
            onRefresh={refresh}
            onDone={() => setPanel('members')}
          />
        ) : panel === 'add' ? (
          <section className="trip-stack" aria-labelledby="trip-add-title">
            <h2 id="trip-add-title">新增朋友</h2>
            {members.length >= 16 ? (
              <Notice>這趟旅程已經有 16 人，無法再新增朋友。</Notice>
            ) : (
              <MemberForm
                members={members}
                label="新增朋友"
                onRefresh={refresh}
                onSave={async (name, avatar) => {
                  await addMember(trip.id, name, avatar)
                  await refresh()
                  setPanel('members')
                }}
              />
            )}
            <Button variant="quiet" onClick={() => setPanel('members')}>
              取消
            </Button>
          </section>
        ) : isNew ? (
          isCamera ? (
            <ReceiptScan key={`scan:${me.id}`} trip={trip} members={members} me={me} />
          ) : (
            <ExpenseForm key={`new:${me.id}`} trip={trip} members={members} me={me} />
          )
        ) : expenseId ? (
          selected ? (
            isEdit ? (
              <ExpenseForm
                key={`${selected.id}:${me.id}`}
                trip={trip}
                members={members}
                me={me}
                expense={selected}
              />
            ) : (
              <ExpenseDetail
                key={selected.id}
                expense={selected}
                members={members}
                tripId={trip.id}
                path={path}
              />
            )
          ) : (
            <Notice action={<Button onClick={() => navigate(path)}>回到列表</Button>}>
              這筆支出已被刪除。
            </Notice>
          )
        ) : isList ? (
          <>
            {members.length === 1 && (
              <Ticket>
                <div className="trip-invite">
                  <p>把旅程連結傳給朋友，他們打開後選個頭像就能加入。</p>
                  <Button variant="secondary" onClick={() => void copyLink()}>
                    {copied ? '已複製連結' : '複製旅程連結'}
                  </Button>
                </div>
              </Ticket>
            )}
            <ExpenseList expenses={expenses} members={members} path={path} />
          </>
        ) : (
          <SettlePage trip={trip} members={members} expenses={expenses} me={me} />
        )}
      </div>
    </AppShell>
  )
}

function EditMember({
  member,
  members,
  onRefresh,
  onDone,
}: {
  member: Member | undefined
  members: Member[]
  onRefresh: () => Promise<unknown>
  onDone: () => void
}) {
  return (
    <section className="trip-stack" aria-labelledby="trip-edit-title">
      <h2 id="trip-edit-title">編輯成員</h2>
      {member ? (
        <MemberForm
          members={members}
          initial={member}
          label="儲存成員"
          onRefresh={onRefresh}
          onSave={async (name, avatar) => {
            await updateMember(member.id, name, avatar)
            await onRefresh()
            onDone()
          }}
        />
      ) : (
        <Notice>找不到這位成員，可能已被其他人修改。</Notice>
      )}
      <Button variant="quiet" onClick={onDone}>
        取消
      </Button>
    </section>
  )
}
