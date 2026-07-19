import { useState, type MouseEvent } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { estaAlDia, type Propiedad } from '../types'

interface Props {
  propiedad: Propiedad
  stopPropagation?: boolean
}

export function AlDiaToggle({ propiedad, stopPropagation }: Props) {
  const { updateProp } = useApp()
  const [saving, setSaving] = useState(false)
  const alDia = estaAlDia(propiedad)

  async function handleClick(e: MouseEvent) {
    if (stopPropagation) e.stopPropagation()
    if (saving) return
    setSaving(true)
    try {
      await updateProp({
        ...propiedad,
        alDiaDesde: alDia ? undefined : new Date().toISOString(),
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
        alDia
          ? 'Al día — facturas, gastos e ingresos completos este periodo. Toca para desmarcar.'
          : 'Marcar como al día — facturas, gastos e ingresos completos hasta hoy'
      }
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors disabled:opacity-60 ${
        alDia
          ? 'bg-success-container text-success'
          : 'border border-outline-variant text-outline-variant hover:text-on-surface'
      }`}
    >
      {alDia ? <CheckCircle2 size={12} /> : <Circle size={12} />}
      {alDia ? 'Al día' : 'Pendiente'}
    </button>
  )
}
