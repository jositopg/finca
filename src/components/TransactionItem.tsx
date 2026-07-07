import { FileText, Paperclip, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { calcularReparto, type Propiedad, type Transaccion } from '../types'

interface Props {
  tx: Transaccion
  propiedad?: Propiedad
  propiedadNombre?: string
  onDelete?: (id: string) => void
  onOpenFile?: (fileId: string) => void
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function TransactionItem({ tx, propiedad, propiedadNombre, onDelete, onOpenFile }: Props) {
  const isIngreso = tx.tipo === 'ingreso'
  const reparto =
    !isIngreso && propiedad ? calcularReparto(tx.categoria, tx.importe, propiedad.reparto) : null

  return (
    <div className="flex items-start gap-3 py-3.5 border-b border-surface-high last:border-0">
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
          isIngreso ? 'bg-success-container' : 'bg-surface-low'
        }`}
      >
        <FileText size={14} className={isIngreso ? 'text-success' : 'text-outline-variant'} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-on-surface truncate">{tx.categoria}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              {tx.descripcion && (
                <span className="text-xs text-outline-variant truncate">{tx.descripcion}</span>
              )}
              {tx.referencia && (
                <span className="text-xs text-outline-variant/70 font-mono">{tx.referencia}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-outline-variant">
                {format(new Date(tx.fecha + 'T00:00:00'), 'd MMM yyyy', { locale: es })}
              </span>
              {propiedadNombre && (
                <>
                  <span className="text-outline-variant/40">·</span>
                  <span className="text-xs text-outline-variant truncate max-w-[120px]">
                    {propiedadNombre}
                  </span>
                </>
              )}
              {tx.archivos.length > 0 && (
                <button
                  onClick={() => onOpenFile?.(tx.archivos[0])}
                  className="flex items-center gap-0.5 text-xs text-primary ml-auto"
                >
                  <Paperclip size={11} />
                  {tx.archivos.length > 1 ? tx.archivos.length : ''}
                </button>
              )}
            </div>
            {reparto && reparto.modo !== 'incluido' && (
              <p className="text-xs text-primary mt-0.5">
                {reparto.modo === 'no_incluido'
                  ? `Repercutible al inquilino: ${fmt(reparto.inquilino)} €`
                  : `Inquilino ${fmt(reparto.inquilino)} € · Tuyo ${fmt(reparto.propietario)} €`}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className={`text-sm font-semibold tabular-nums ${
                isIngreso ? 'text-success' : 'text-on-surface'
              }`}
            >
              {isIngreso ? '+' : '-'}
              {tx.importe.toLocaleString('es-ES', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              €
            </span>
            {onDelete && (
              <button
                onClick={() => onDelete(tx.id)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-outline-variant hover:text-error hover:bg-error-container transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
