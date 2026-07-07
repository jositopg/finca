import { Button } from './Button'

interface Props {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Eliminar',
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-on-surface/20 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-[480px] bg-surface-lowest rounded-t-2xl shadow-card px-5 pt-5 pb-10">
        <p className="font-display font-bold text-on-surface text-base mb-1">{title}</p>
        {message && <p className="text-sm text-outline-variant mb-5">{message}</p>}
        {!message && <div className="mb-5" />}
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} fullWidth onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
