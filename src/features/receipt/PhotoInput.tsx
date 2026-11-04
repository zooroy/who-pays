import { useState, type ReactNode } from 'react'

/**
 * A hidden file input opened from any button. No `capture` attribute, so phones
 * offer both the camera and the photo library.
 */
export function PhotoInput({
  onPick,
  children,
}: {
  onPick: (file: File) => void
  children: (open: () => void) => ReactNode
}) {
  const [input, setInput] = useState<HTMLInputElement | null>(null)
  function open() {
    input?.click()
  }
  return (
    <>
      <input
        ref={setInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPick(file)
        }}
      />
      {children(open)}
    </>
  )
}
