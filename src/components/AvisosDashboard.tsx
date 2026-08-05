import { AlertTriangle, CalendarClock } from 'lucide-react'
import { avisosPropiedades, type Propiedad } from '../types'

interface Props {
  propiedades: Propiedad[]
  onSelectPropiedad: (propiedadId: string) => void
}

// Avisos operativos de todas las propiedades (contrato por vencer, revisión
// anual de renta pendiente) en un único bloque del Dashboard — para no tener
// que entrar en cada ficha para enterarse.
export function AvisosDashboard({ propiedades, onSelectPropiedad }: Props) {
  const avisos = avisosPropiedades(propiedades)
  if (avisos.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-outline-variant uppercase tracking-wide flex items-center gap-1.5">
        <CalendarClock size={14} />
        Avisos ({avisos.length})
      </p>
      <div className="bg-warning-container/60 rounded-2xl shadow-soft divide-y divide-warning/10">
        {avisos.map((a, i) => (
          <button
            key={`${a.propiedad.id}-${a.tipo}-${i}`}
            onClick={() => onSelectPropiedad(a.propiedad.id)}
            className="w-full text-left p-3 flex items-start gap-2.5 hover:bg-warning-container transition-colors"
          >
            <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm text-warning font-medium truncate">{a.propiedad.nombre}</p>
              <p className="text-xs text-warning/80 truncate mt-0.5">{a.mensaje}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
