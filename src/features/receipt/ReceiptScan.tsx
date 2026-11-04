import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, CameraIcon, Notice, Ticket } from '../../components'
import type { Member, Trip } from '../trip/api'
import { ExpenseForm, type ReceiptAttachment } from '../expense/ExpenseForm'
import { compressPhoto, parseReceipt, removeReceipt, uploadReceipt } from './api'
import { scanFailureMessage } from './model'
import { clearPendingPhoto, peekPendingPhoto } from './pending'
import { PhotoInput } from './PhotoInput'
import './receipt.css'

type Stage =
  | { step: 'pick' }
  | { step: 'working'; label: string; photoUrl: string }
  | { step: 'upload-failed'; photo: Blob; photoUrl: string }
  | { step: 'confirm'; receipt: ReceiptAttachment }

/**
 * 拍收據: compress → upload → parse → confirm (design.md §7). Any scan failure
 * falls back to the manual form with the photo already attached.
 */
export function ReceiptScan({ trip, members, me }: { trip: Trip; members: Member[]; me: Member }) {
  const navigate = useNavigate()
  const path = `/t/${trip.share_token}`
  const [initial] = useState(peekPendingPhoto)
  const [stage, setStage] = useState<Stage>({ step: 'pick' })
  const [pickError, setPickError] = useState('')
  const started = useRef<File | null>(null)
  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

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

  async function upload(photo: Blob, photoUrl: string) {
    setStage({ step: 'working', label: '正在上傳照片…', photoUrl })
    let receiptPath: string
    try {
      receiptPath = await uploadReceipt(trip.id, photo)
    } catch {
      setStage({ step: 'upload-failed', photo, photoUrl })
      return
    }
    setStage({ step: 'working', label: '辨識中…', photoUrl })
    const outcome = await parseReceipt(trip.id, receiptPath)
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
    return (
      <div className="trip-stack receipt-working">
        <h2>拍收據</h2>
        <Ticket>
          <div className="receipt-working__body">
            <img className="receipt-working__photo" src={stage.photoUrl} alt="" />
            <p role="status" aria-live="polite">
              {stage.label}
            </p>
          </div>
        </Ticket>
      </div>
    )
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
