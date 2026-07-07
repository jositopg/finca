import { FileText, Paperclip, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Transaccion } from '../types'

interface Props {
  tx: Transaccion
  propiedadNombre?: string
  onDelete?: (id: string) => void
  onOpenFile?: (fileId: string) => void
}

export function TransactionItem({ tx, propiedadNombre, onDelete, onOpenFile }: Props) {
  const isIngreso = tx.tipo === 'ingreso'

  return (
    <div className="flex items-start gap-3 py-4 border-b border-surface-high last:border-0">
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isIngreso ? 'bg-success-container' : 'bg-surface-low'
        }`}
      >
        <FileText
          size={16}
          className={isIngreso ? 'text-success' : 'text-outline-variant'}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-on-surface truncate">
              {tx.categoria}
            </p>
            {tx.descripcion && (
              <p className="text-xs text-outline-variant truncate mt-0.5">
                {tx.descripcion}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-outline-variant">
                {format(new Date(tx.fecha + 'T00:00:00'), 'd MMM yyyy', { locale: es })}
              </span>
              {propiedadNombre && (
                <>
                  <span className="text-outline-variant/50">·</span>
                  <span className="text-xs text-outline-variant truncate">
                    {propiedadNombre}
                  </span>
                </>
              )}
              {tx.archivos.length > 0 && (
                <>
                  <span className="text-outline-variant/50">·</span>
                  <button
                    onClick={() => onOpenFile?.(tx.archivos[0])}
                    className="flex items-center gap-0.5 text-xs text-primary"
                  >
                    <Paperclip size={11} />
                    {tx.archivos.length}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
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
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
