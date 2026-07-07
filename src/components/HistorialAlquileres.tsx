import { FileText } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Propiedad } from '../types'

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function HistorialAlquileres({ propiedad }: { propiedad: Propiedad }) {
  const historial = propiedad.historialContratos
  if (!historial || historial.length === 0) return null

  const ordenado = [...historial].sort((a, b) => b.fechaFin.localeCompare(a.fechaFin))

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-outline-variant uppercase tracking-wide">
        Historial de alquileres
      </span>
      <div className="flex flex-col gap-2">
        {ordenado.map((c) => (
          <div key={c.id} className="bg-surface-low rounded-xl px-4 py-3 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-on-surface truncate">
                {c.inquilinoNombre || 'Inquilino sin nombre'}
              </span>
              {c.alquilerMensual != null && (
                <span className="text-xs text-outline-variant flex-shrink-0">
                  {fmt(c.alquilerMensual)} €/mes
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-outline-variant">
                {c.fechaInicio ? format(parseISO(c.fechaInicio), 'd MMM yyyy', { locale: es }) : '?'}
                {' – '}
                {format(parseISO(c.fechaFin), 'd MMM yyyy', { locale: es })}
              </span>
              {c.contratoArchivoId && (
                <a
                  href={`https://drive.google.com/file/d/${c.contratoArchivoId}/view`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary ml-auto"
                >
                  <FileText size={12} />
                  Contrato
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
