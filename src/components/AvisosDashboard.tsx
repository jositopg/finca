import { AlertTriangle } from 'lucide-react'
import { avisosDePropiedad, type Propiedad, type Transaccion } from '../types'

interface Props {
  propiedades: Propiedad[]
  transacciones: Transaccion[]
  onSelectPropiedad: (id: string) => void
}

export function AvisosDashboard({ propiedades, transacciones, onSelectPropiedad }: Props) {
  const avisos = propiedades.flatMap((p) => avisosDePropiedad(p, transacciones))
  if (avisos.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-outline-variant uppercase tracking-wide flex items-center gap-1.5">
        <AlertTriangle size={14} />
        Avisos ({avisos.length})
      </p>
      <div className="bg-warning-container/50 rounded-2xl divide-y divide-warning/10">
        {avisos.slice(0, 8).map((a, i) => (
          <button
            key={`${a.propiedadId}-${a.tipo}-${i}`}
            type="button"
            onClick={() => onSelectPropiedad(a.propiedadId)}
            className="w-full text-left px-4 py-2.5 hover:brightness-95"
          >
            <p className="text-sm font-medium text-warning truncate">{a.nombre}</p>
            <p className="text-xs text-warning/80">{a.mensaje}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
