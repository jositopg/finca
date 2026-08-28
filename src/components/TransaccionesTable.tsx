import { Copy, FileText, Paperclip, Pencil, Receipt, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { calcularReparto, type Propiedad, type Transaccion } from '../types'

interface Grupo {
  mes: string
  items: Transaccion[]
}

interface Props {
  grupos: Grupo[]
  propiedades: Propiedad[]
  mostrarPropiedad?: boolean
  onDelete: (id: string) => void
  onDuplicate: (tx: Transaccion) => void
  onEdit: (tx: Transaccion) => void
  onOpenFile: (fileId: string) => void
  onFactura: (tx: Transaccion) => void
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Vista de tabla de movimientos — solo escritorio (≥lg). En móvil se usa la
 *  lista de tarjetas (`TransactionItem`). Misma lógica de reparto/facturable
 *  que `TransactionItem`. */
export function TransaccionesTable({
  grupos,
  propiedades,
  mostrarPropiedad = true,
  onDelete,
  onDuplicate,
  onEdit,
  onOpenFile,
  onFactura,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface-lowest shadow-soft">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-outline-variant border-b border-surface-high">
            <th className="px-4 py-3 font-medium">Fecha</th>
            {mostrarPropiedad && <th className="px-4 py-3 font-medium">Propiedad</th>}
            <th className="px-4 py-3 font-medium">Categoría</th>
            <th className="px-4 py-3 font-medium">Descripción</th>
            <th className="px-4 py-3 font-medium text-right">Importe</th>
            <th className="px-4 py-3 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        {grupos.map(({ mes, items }) => {
          const totalMes = items.reduce(
            (s, t) => s + (t.tipo === 'ingreso' ? t.importe : -t.importe),
            0,
          )
          const colSpan = mostrarPropiedad ? 4 : 3
          return (
            <tbody key={mes} className="border-b border-surface-high last:border-0">
              <tr className="bg-surface-low/60">
                <th
                  colSpan={colSpan}
                  className="px-4 py-2 text-left text-xs font-semibold text-outline-variant capitalize"
                >
                  {format(new Date(mes + '-01'), 'MMMM yyyy', { locale: es })}
                </th>
                <td
                  className={`px-4 py-2 text-right text-xs font-semibold tabular-nums ${
                    totalMes >= 0 ? 'text-success' : 'text-error'
                  }`}
                >
                  {totalMes >= 0 ? '+' : ''}
                  {fmt(totalMes)} €
                </td>
                <td className="bg-surface-low/60" />
              </tr>
              {items.map((tx) => {
                const prop = propiedades.find((p) => p.id === tx.propiedadId)
                const isIngreso = tx.tipo === 'ingreso'
                const reparto =
                  !isIngreso && prop
                    ? calcularReparto(tx.categoria, tx.importe, prop.reparto)
                    : null
                const esFacturable =
                  isIngreso && tx.categoria === 'Alquiler mensual' && prop?.tipo === 'local'
                return (
                  <tr
                    key={tx.id}
                    onClick={() => onEdit(tx)}
                    className="border-t border-surface-high/60 hover:bg-surface-low/40 cursor-pointer align-top"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-outline-variant">
                      {format(new Date(tx.fecha + 'T00:00:00'), 'd MMM yyyy', { locale: es })}
                      {tx.periodoInicio && tx.periodoFin && (
                        <span className="block text-xs text-outline-variant/70">
                          periodo{' '}
                          {format(new Date(tx.periodoInicio + 'T00:00:00'), 'd MMM', { locale: es })}
                          –
                          {format(new Date(tx.periodoFin + 'T00:00:00'), 'd MMM', { locale: es })}
                        </span>
                      )}
                    </td>
                    {mostrarPropiedad && (
                      <td className="px-4 py-3 text-outline-variant">{prop?.nombre ?? '—'}</td>
                    )}
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isIngreso ? 'bg-success-container' : 'bg-surface-low'
                          }`}
                        >
                          <FileText
                            size={12}
                            className={isIngreso ? 'text-success' : 'text-outline-variant'}
                          />
                        </span>
                        <span className="font-medium text-on-surface">{tx.categoria}</span>
                      </span>
                      {reparto && reparto.modo !== 'incluido' && (
                        <span className="block text-xs text-primary mt-1">
                          {reparto.modo === 'no_incluido'
                            ? `Repercutible al inquilino: ${fmt(reparto.inquilino)} €`
                            : `Inquilino ${fmt(reparto.inquilino)} € · Tuyo ${fmt(reparto.propietario)} €`}
                        </span>
                      )}
                      {tx.soloMio && (
                        <span className="block text-xs text-primary/70 mt-0.5">100% tuyo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-outline-variant max-w-xs">
                      <span className="line-clamp-2">{tx.descripcion || '—'}</span>
                      <span className="flex items-center gap-2 mt-0.5">
                        {tx.referencia && (
                          <span className="text-xs font-mono text-outline-variant/70">
                            {tx.referencia}
                          </span>
                        )}
                        {tx.archivos.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onOpenFile(tx.archivos[0])
                            }}
                            className="flex items-center gap-0.5 text-xs text-primary"
                          >
                            <Paperclip size={11} />
                            {tx.archivos.length > 1 ? tx.archivos.length : ''}
                          </button>
                        )}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${
                        isIngreso ? 'text-success' : 'text-on-surface'
                      }`}
                    >
                      {isIngreso ? '+' : '-'}
                      {fmt(tx.importe)} €
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center justify-end gap-1">
                        {esFacturable && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onFactura(tx)
                            }}
                            title={
                              tx.numeroFactura ? `Ver factura ${tx.numeroFactura}` : 'Generar factura'
                            }
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-outline-variant hover:text-primary hover:bg-primary-container transition-colors"
                          >
                            <Receipt size={13} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onEdit(tx)
                          }}
                          title="Editar movimiento"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-outline-variant hover:text-primary hover:bg-primary-container transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDuplicate(tx)
                          }}
                          title="Duplicar movimiento"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-outline-variant hover:text-primary hover:bg-primary-container transition-colors"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(tx.id)
                          }}
                          title="Eliminar movimiento"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-outline-variant hover:text-error hover:bg-error-container transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}
