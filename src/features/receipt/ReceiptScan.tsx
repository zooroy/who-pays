import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Button, CameraIcon, Notice, Ticket } from '../../components'
import type { Member, Trip } from '../trip/api'
import { ExpenseForm, type ReceiptAttachment } from '../expense/ExpenseForm'
import { compressPhoto, parseReceipt, removeReceipt, uploadReceipt } from './api'
import { scanFailureMessage, scanWaitText } from './model'
import { clearPendingPhoto, peekPendingPhoto } from './pending'
import { PhotoInput } from './PhotoInput'
import './receipt.css'

type Stage =
  | { step: 'pick' }
  | {
      step: 'working'
      phase: 'upload' | 'parse'
      photoUrl: string
      /** When reading started, for the 15s 「比平常久一點」 hint. */
      parseStartedAt: number | null
      /** 改成手動新增 was pressed during upload; waiting for the upload to finish. */
      manualPending: boolean
    }
  | { step: 'upload-failed'; photo: Blob; photoUrl: string }
  | { step: 'confirm'; receipt: ReceiptAttachment }

/**
 * One upload-and-read attempt. `manual`: the user chose 改成手動新增; `left`: the
 * scan screen went away mid-scan. Either way a late result is ignored, and after
 * `left` the uploaded photo is deleted (receipt-scan-focus design §5).
 */
interface ScanSession {
  state: 'scanning' | 'manual' | 'left'
  path: string | null
}

/**
 * 拍收據: compress → upload → parse → confirm (design.md §7). Any scan failure
 * falls back to the manual form with the photo already attached. While uploading
 * and reading, a full-screen wait screen covers the app (receipt-scan-focus).
 */
export function ReceiptScan({ trip, members, me }: { trip: Trip; members: Member[]; me: Member }) {
  const navigate = useNavigate()
  const path = `/t/${trip.share_token}`
  const [initial] = useState(peekPendingPhoto)
  const [stage, setStage] = useState<Stage>({ step: 'pick' })
  const [pickError, setPickError] = useState('')
  const started = useRef<File | null>(null)
  const urls = useRef<string[]>([])
  const session = useRef<ScanSession | null>(null)
  const stageRef = useRef(stage)
  stageRef.current = stage
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])
  // Leaving mid-scan (e.g. the iOS back swipe): drop the photo and ignore the result.
  // Checked a tick later so StrictMode's dev-only unmount/remount does not count.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      window.setTimeout(() => {
        const current = session.current
        if (mounted.current || stageRef.current.step !== 'working' || !current) return
        current.state = 'left'
        if (current.path) void removeReceipt(current.path)
      })
    }
  }, [])

  async function scan(file: File) {
    if (started.current === file) return
    started.current = file
    clearPendingPhoto()
    let photo: Blob
    try {
      photo = await compressPhoto(file)
    } catch {
      setStage({ step: 'pick' })
      setPickError('無法讀取這張照片，請換一張再試。')
      return
    }
    const photoUrl = URL.createObjectURL(photo)
    urls.current.push(photoUrl)
    await upload(photo, photoUrl)
  }

  function attachManually(path: string, photoUrl: string) {
    setStage({ step: 'confirm', receipt: { path, photoUrl, result: null, problem: null } })
  }

  async function upload(photo: Blob, photoUrl: string) {
    const current: ScanSession = { state: 'scanning', path: null }
    session.current = current
    setStage({
      step: 'working',
      phase: 'upload',
      photoUrl,
      parseStartedAt: null,
      manualPending: false,
    })
    let receiptPath: string
    try {
      receiptPath = await uploadReceipt(trip.id, photo)
    } catch {
      if (current.state !== 'left') setStage({ step: 'upload-failed', photo, photoUrl })
      return
    }
    current.path = receiptPath
    if (current.state === 'left') {
      void removeReceipt(receiptPath)
      return
    }
    if (current.state === 'manual') {
      attachManually(receiptPath, photoUrl)
      return
    }
    setStage({
      step: 'working',
      phase: 'parse',
      photoUrl,
      parseStartedAt: Date.now(),
      manualPending: false,
    })
    const outcome = await parseReceipt(trip.id, receiptPath)
    if (current.state !== 'scanning') return
    setStage({
      step: 'confirm',
      receipt: {
        path: receiptPath,
        photoUrl,
        result: outcome.ok ? outcome.result : null,
        problem: outcome.ok ? null : scanFailureMessage(outcome.code),
      },
    })
  }

  /** 改成手動新增 on the wait screen; a scan result arriving later is ignored. */
  function switchToManual() {
    const current = session.current
    if (stage.step !== 'working' || !current || current.state !== 'scanning') return
    current.state = 'manual'
    if (current.path) attachManually(current.path, stage.photoUrl)
    else setStage({ ...stage, manualPending: true })
  }

  useEffect(() => {
    if (initial) void scan(initial)
    // Runs once for the photo picked on the trip screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  if (stage.step === 'confirm')
    return (
      <ExpenseForm
        trip={trip}
        members={members}
        me={me}
        receipt={stage.receipt}
        onCancel={() => void removeReceipt(stage.receipt.path)}
      />
    )
  if (stage.step === 'working')
    return <WaitScreen tripName={trip.name} stage={stage} onManual={switchToManual} />
  if (stage.step === 'upload-failed')
    return (
      <div className="trip-stack">
        <h2>拍收據</h2>
        <Notice tone="problem">照片上傳失敗，請確認網路連線後再試一次。</Notice>
        <Button onClick={() => void upload(stage.photo, stage.photoUrl)}>重新上傳</Button>
        <Button variant="secondary" onClick={() => navigate(`${path}/expenses/new`)}>
          改成手動新增
        </Button>
        <Button variant="quiet" onClick={() => navigate(path)}>
          取消
        </Button>
      </div>
    )
  return (
    <div className="trip-stack">
      <h2>拍收據</h2>
      {pickError && <Notice tone="problem">{pickError}</Notice>}
      <PhotoInput
        onPick={(file) => {
          setPickError('')
          void scan(file)
        }}
      >
        {(open) => (
          <Button big icon={<CameraIcon />} onClick={open}>
            拍照或選擇收據
          </Button>
        )}
      </PhotoInput>
      <Button variant="quiet" onClick={() => navigate(path)}>
        取消
      </Button>
    </div>
  )
}

/**
 * Full-screen wait while uploading and reading (receipt-scan-focus design §1–3).
 * Rendered outside #root, which is made inert so nothing behind it can be used.
 */
function WaitScreen({
  tripName,
  stage,
  onManual,
}: {
  tripName: string
  stage: Extract<Stage, { step: 'working' }>
  onManual: () => void
}) {
  const titleId = useId()
  const screen = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    // Focus the only action: 改成手動新增.
    screen.current?.querySelector('button')?.focus()
    return () => root?.removeAttribute('inert')
  }, [])
  useEffect(() => {
    if (stage.parseStartedAt === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [stage.parseStartedAt])
  const text = scanWaitText(
    stage.phase,
    stage.parseStartedAt === null ? 0 : now - stage.parseStartedAt,
  )
  return createPortal(
    <div
      ref={screen}
      className="receipt-wait"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="receipt-wait__inner">
        <h2 id={titleId} className="receipt-wait__title">
          {tripName}
        </h2>
        <div className="receipt-wait__ticket">
          <Ticket>
            <div className="receipt-wait__body">
              <div className="receipt-wait__scan">
                <img className="receipt-wait__photo" src={stage.photoUrl} alt="收據照片" />
              </div>
              <div className="receipt-wait__status" role="status" aria-live="polite">
                <p className="receipt-wait__label">{text.label}</p>
                {text.hint && <p className="receipt-wait__hint">{text.hint}</p>}
              </div>
            </div>
          </Ticket>
        </div>
        <div className="receipt-wait__actions">
          <Button variant="secondary" busy={stage.manualPending} onClick={onManual}>
            改成手動新增
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
