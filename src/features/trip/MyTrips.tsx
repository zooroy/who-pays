import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { AppShell, Avatar, Button, Notice, PlusIcon, Ticket, TicketRow } from '../../components'
import { CURRENCIES } from '../../lib/money'
import { signOut, useAccount } from '../account/account'
import { hasErrorCode, membershipError } from '../../lib/identity'
import { CreateTripForm } from './CreateTrip'
import { deleteTrip, getMyTrips, tripKey, type MyTrip } from './api'

/**
 * 我的旅程 (owner-account design §9): the owner sees every trip, can create one and,
 * in 編輯 mode, delete one; friends see the trips they joined and 擁有者登入.
 */
export function MyTrips() {
  const navigate = useNavigate()
  const account = useAccount()
  const trips = useQuery({ queryKey: ['my-trips'], queryFn: getMyTrips })
  const [editing, setEditing] = useState(false)
  /** The one trip whose ticket shows the delete confirmation. */
  const [confirmId, setConfirmId] = useState<string | null>(null)
  if (account.isPending || trips.isPending)
    return (
      <AppShell title="我的旅程">
        <p role="status">載入中…</p>
      </AppShell>
    )
  if (account.isError || trips.isError)
    return (
      <AppShell title="我的旅程">
        <Notice
          tone="problem"
          action={
            <Button
              onClick={() => {
                void account.refetch()
                void trips.refetch()
              }}
            >
              重新載入
            </Button>
          }
        >
          無法載入旅程，請確認網路後再試一次。
        </Notice>
      </AppShell>
    )
  const { isOwner, signedIn } = account.data
  if (isOwner && trips.data.length === 0)
    return (
      <AppShell title="建立旅程">
        <div className="trip-stack">
          <CreateTripForm />
          <AccountAction signedIn />
        </div>
      </AppShell>
    )
  if (!isOwner && trips.data.length === 0)
    return (
      <AppShell title="誰付錢">
        <div className="trip-stack">
          <Notice>還沒有旅程。請向朋友索取旅程連結，點開就能加入。</Notice>
          <AccountAction signedIn={signedIn} />
        </div>
      </AppShell>
    )
  const editMode = isOwner && editing
  return (
    <AppShell
      title="我的旅程"
      headerExtra={
        isOwner && (
          <Button
            variant="quiet"
            onClick={() => {
              setEditing(!editing)
              setConfirmId(null)
            }}
          >
            {editing ? '完成' : '編輯'}
          </Button>
        )
      }
    >
      <div className="trip-stack">
        <ul className="my-trips">
          {trips.data.map((trip) => (
            <li key={trip.id}>
              {editMode ? (
                <EditableTrip
                  trip={trip}
                  confirming={confirmId === trip.id}
                  onAsk={() => setConfirmId(trip.id)}
                  onCancel={() => setConfirmId(null)}
                />
              ) : (
                <TripTicket trip={trip} onOpen={() => navigate(`/t/${trip.share_token}`)} />
              )}
            </li>
          ))}
        </ul>
        {isOwner && (
          <Button variant="secondary" icon={<PlusIcon />} onClick={() => navigate('/new')}>
            建立新旅程
          </Button>
        )}
        <AccountAction signedIn={signedIn} />
      </div>
    </AppShell>
  )
}

/** 擁有者登入 for friends, 登出 once signed in. Quiet: most people never need it. */
function AccountAction({ signedIn }: { signedIn: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!signedIn)
    return (
      <div className="my-trips__account">
        <Button variant="quiet" onClick={() => navigate('/login')}>
          擁有者登入
        </Button>
      </div>
    )
  async function logOut() {
    setBusy(true)
    setError('')
    try {
      await signOut()
      await queryClient.resetQueries()
    } catch {
      setError('無法登出，請確認網路後再試一次。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="my-trips__account">
      {error && <Notice tone="problem">{error}</Notice>}
      <Button variant="quiet" busy={busy} onClick={() => void logOut()}>
        登出
      </Button>
    </div>
  )
}

function TripRow({ trip }: { trip: MyTrip }) {
  const me = trip.members.find((m) => m.id === trip.my_member_id)
  return (
    <TicketRow
      leading={me ? <Avatar avatarId={me.avatar_id} decorative /> : undefined}
      title={trip.name}
      meta={`${trip.members.length} 位成員`}
      amount={CURRENCIES[trip.default_currency].label}
    />
  )
}

function TripTicket({ trip, onOpen }: { trip: MyTrip; onOpen: () => void }) {
  return (
    <Ticket onClick={onOpen} label={`開啟${trip.name}`}>
      <TripRow trip={trip} />
    </Ticket>
  )
}

/**
 * A trip in 編輯 mode (ios-back-and-trip-delete design §4): not a link, with 刪除 on
 * the stub; deleting takes a second tap on a button that names the trip.
 */
function EditableTrip({
  trip,
  confirming,
  onAsk,
  onCancel,
}: {
  trip: MyTrip
  confirming: boolean
  onAsk: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function remove() {
    setBusy(true)
    setError('')
    try {
      await deleteTrip(trip.id)
      queryClient.removeQueries({ queryKey: tripKey(trip.id) })
      await queryClient.invalidateQueries({ queryKey: ['my-trips'] })
    } catch (err) {
      setError(
        hasErrorCode(err, 'OWNER_REQUIRED')
          ? membershipError(err)
          : '無法刪除旅程，請確認網路連線後再試一次。',
      )
      setBusy(false)
    }
  }
  return (
    <Ticket
      stub={
        confirming ? (
          <section className="trip-stack my-trips__confirm" aria-label={`確認刪除${trip.name}`}>
            {error && <Notice tone="problem">{error}</Notice>}
            <p>會一起刪除{trip.name}的所有支出、還款、成員與收據照片，無法復原。</p>
            <div className="trip-actions">
              <Button busy={busy} onClick={() => void remove()}>
                刪除{trip.name}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={onCancel}>
                取消
              </Button>
            </div>
          </section>
        ) : (
          <div className="my-trips__edit">
            <Button variant="quiet" onClick={onAsk}>
              刪除<span className="visually-hidden">{trip.name}</span>
            </Button>
          </div>
        )
      }
    >
      <TripRow trip={trip} />
    </Ticket>
  )
}
