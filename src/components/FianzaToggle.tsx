import { useState, type MouseEvent } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { Propiedad } from '../types'

interface Props {
  propiedad: Propiedad
  stopPropagation?: boolean
}

// Solo se muestra si hay un importe de fianza registrado — deja constancia
// de si ya se depositó en el organismo correspondiente (obligatorio por
// ley), no cambia el importe ni ningún dato de la propiedad.
export function FianzaToggle({ propiedad, stopPropagation }: Props) {
  const { updateProp } = useApp()
  const [saving, setSaving] = useState(false)
  if (!propiedad.fianzaImporte) return null
  const depositada = !!propiedad.fianzaDepositadaDesde

  async function handleClick(e: MouseEvent) {
    if (stopPropagation) e.stopPropagation()
    if (saving) return
    setSaving(true)
    try {
      await updateProp({
        ...propiedad,
        fianzaDepositadaDesde: depositada ? undefined : new Date().toISOString(),
      })
    } catch {
      // updateProp ya muestra un toast con el error
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={saving}
      title={
        depositada
          ? 'Fianza depositada en el organismo correspondiente — toca para desmarcar'
          : 'Marcar la fianza como depositada'
      }
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors disabled:opacity-60 ${
        depositada
          ? 'bg-success-container text-success'
          : 'border border-warning text-warning hover:bg-warning-container'
      }`}
    >
      {depositada ? <CheckCircle2 size={12} /> : <Circle size={12} />}
      {depositada ? 'Fianza depositada' : 'Fianza sin depositar'}
    </button>
  )
}
