import { useState } from 'react'
import { ArrowLeft, Edit2, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import { BottomSheet } from '../components/BottomSheet'
import { PropiedadForm } from '../components/PropiedadForm'
import { TransactionForm } from '../components/TransactionForm'
import { TransactionItem } from '../components/TransactionItem'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ESTADO_LABELS, TIPO_LABELS, type Propiedad } from '../types'

const ESTADO_BADGE_VARIANT: Record<
  string,
  'success' | 'warning' | 'error' | 'outline' | 'default'
> = {
  alquilado: 'success',
  vacio: 'warning',
  reforma: 'outline',
  venta: 'error',
}

interface Props {
  selectedId?: string
  onSelectId: (id?: string) => void
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function PropiedadesView({ selectedId, onSelectId }: Props) {
  const { propiedades, transacciones, addProp, updateProp, deleteProp, addTx, deleteTx } =
    useApp()
  const [showAddProp, setShowAddProp] = useState(false)
  const [editProp, setEditProp] = useState<Propiedad | null>(null)
  const [showAddTx, setShowAddTx] = useState(false)
  const [filterMes, setFilterMes] = useState(format(new Date(), 'yyyy-MM'))

  const propiedad = propiedades.find((p) => p.id === selectedId)

  // ── Propiedad detail view ──────────────────────────────────────────────────
  if (propiedad) {
    const txs = transacciones
      .filter((t) => t.propiedadId === propiedad.id)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))

    const txsFiltradas = filterMes
      ? txs.filter((t) => t.fecha.startsWith(filterMes))
      : txs

    const ingresos = txsFiltradas
      .filter((t) => t.tipo === 'ingreso')
      .reduce((s, t) => s + t.importe, 0)

    const gastos = txsFiltradas
      .filter((t) => t.tipo === 'gasto')
      .reduce((s, t) => s + t.importe, 0)

    // Build list of months with activity
    const meses = [...new Set(txs.map((t) => t.fecha.slice(0, 7)))].sort().reverse()
    const currentMonth = format(new Date(), 'yyyy-MM')
    if (!meses.includes(currentMonth)) meses.unshift(currentMonth)

    return (
      <div className="flex flex-col pb-24">
        {/* Header */}
        <div className="px-5 pt-12 pb-4">
          <button
            onClick={() => onSelectId(undefined)}
            className="flex items-center gap-1.5 text-sm text-outline-variant mb-4 -ml-1"
          >
            <ArrowLeft size={16} />
            Propiedades
          </button>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold text-on-surface leading-tight">
                {propiedad.nombre}
              </h1>
              {propiedad.direccion && (
                <p className="text-sm text-outline-variant mt-0.5">{propiedad.direccion}</p>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setEditProp(propiedad)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-surface-low text-outline-variant hover:text-on-surface transition-colors"
              >
                <Edit2 size={15} />
              </button>
              <button
                onClick={async () => {
                  if (
                    confirm(
                      `¿Eliminar "${propiedad.nombre}"?\nSe borrarán también todas sus transacciones.`,
                    )
                  ) {
                    await deleteProp(propiedad.id)
                    onSelectId(undefined)
                  }
                }}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-error-container text-error hover:bg-error hover:text-on-primary transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Badge
              label={ESTADO_LABELS[propiedad.estado]}
              variant={ESTADO_BADGE_VARIANT[propiedad.estado]}
            />
            <Badge label={TIPO_LABELS[propiedad.tipo]} />
          </div>
        </div>

        {/* Month selector */}
        <div className="px-5 overflow-x-auto scrollbar-none mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilterMes('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterMes === ''
                  ? 'bg-on-surface text-surface'
                  : 'bg-surface-low text-outline-variant'
              }`}
            >
              Todo
            </button>
            {meses.slice(0, 12).map((m) => (
              <button
                key={m}
                onClick={() => setFilterMes(m)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${
                  filterMes === m
                    ? 'bg-on-surface text-surface'
                    : 'bg-surface-low text-outline-variant'
                }`}
              >
                {format(new Date(m + '-01'), 'MMM yy', { locale: es })}
              </button>
            ))}
          </div>
        </div>

        {/* Balance summary */}
        <div className="px-5 mb-5">
          <div className="bg-surface-lowest rounded-2xl shadow-soft p-4">
            <div className="flex gap-3">
              <div className="flex-1 text-center">
                <p className="text-xs text-outline-variant mb-0.5">Ingresos</p>
                <p className="text-lg font-bold text-success tabular-nums">
                  +{fmt(ingresos)} €
                </p>
              </div>
              <div className="w-px bg-surface-high" />
              <div className="flex-1 text-center">
                <p className="text-xs text-outline-variant mb-0.5">Gastos</p>
                <p className="text-lg font-bold text-on-surface tabular-nums">
                  -{fmt(gastos)} €
                </p>
              </div>
              <div className="w-px bg-surface-high" />
              <div className="flex-1 text-center">
                <p className="text-xs text-outline-variant mb-0.5">Balance</p>
                <p
                  className={`text-lg font-bold tabular-nums ${
                    ingresos - gastos >= 0 ? 'text-success' : 'text-error'
                  }`}
                >
                  {ingresos - gastos >= 0 ? '+' : ''}
                  {fmt(ingresos - gastos)} €
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Transactions */}
        <div className="px-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
              Movimientos
            </p>
            <button
              onClick={() => setShowAddTx(true)}
              className="flex items-center gap-1 text-xs text-primary font-medium"
            >
              <Plus size={14} />
              Añadir
            </button>
          </div>

          {txsFiltradas.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-outline-variant">
                Sin movimientos{filterMes ? ' este mes' : ''}.
              </p>
              <Button onClick={() => setShowAddTx(true)} size="sm">
                <Plus size={14} />
                Añadir transacción
              </Button>
            </div>
          ) : (
            <div className="bg-surface-lowest rounded-2xl shadow-soft px-4">
              {txsFiltradas.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  onDelete={async (id) => {
                    if (confirm('¿Eliminar esta transacción?')) await deleteTx(id)
                  }}
                  onOpenFile={(id) => {
                    window.open(`https://drive.google.com/file/d/${id}/view`, '_blank')
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Drive link */}
        {propiedad.folderId && (
          <div className="px-5 mt-4">
            <a
              href={`https://drive.google.com/drive/folders/${propiedad.folderId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-xs text-primary py-2"
            >
              <ExternalLink size={13} />
              Ver carpeta en Google Drive
            </a>
          </div>
        )}

        {/* Sheets */}
        <BottomSheet
          open={showAddTx}
          onClose={() => setShowAddTx(false)}
          title="Nueva transacción"
        >
          <TransactionForm
            propiedades={propiedades}
            defaultPropiedadId={propiedad.id}
            onSave={async (t) => {
              await addTx(t)
              setShowAddTx(false)
            }}
            onCancel={() => setShowAddTx(false)}
          />
        </BottomSheet>

        <BottomSheet
          open={!!editProp}
          onClose={() => setEditProp(null)}
          title="Editar propiedad"
        >
          <PropiedadForm
            initial={editProp ?? undefined}
            onSave={async (p) => {
              await updateProp(p)
              setEditProp(null)
            }}
            onCancel={() => setEditProp(null)}
          />
        </BottomSheet>
      </div>
    )
  }

  // ── Properties list ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col pb-24">
      <div className="px-5 pt-12 pb-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-on-surface">Propiedades</h1>
          <Button onClick={() => setShowAddProp(true)} size="sm">
            <Plus size={14} />
            Nueva
          </Button>
        </div>
      </div>

      <div className="px-5">
        {propiedades.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-outline-variant">
              Aún no tienes propiedades registradas.
            </p>
            <Button onClick={() => setShowAddProp(true)}>
              <Plus size={14} />
              Añadir primera propiedad
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {propiedades.map((p) => {
              const txs = transacciones.filter((t) => t.propiedadId === p.id)
              const ingresos = txs
                .filter((t) => t.tipo === 'ingreso')
                .reduce((s, t) => s + t.importe, 0)
              const gastos = txs
                .filter((t) => t.tipo === 'gasto')
                .reduce((s, t) => s + t.importe, 0)

              return (
                <button
                  key={p.id}
                  onClick={() => onSelectId(p.id)}
                  className="w-full text-left bg-surface-lowest rounded-2xl shadow-soft p-4 hover:shadow-card transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-medium text-on-surface text-sm truncate">
                        {p.nombre}
                      </p>
                      {p.direccion && (
                        <p className="text-xs text-outline-variant truncate mt-0.5">
                          {p.direccion}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge
                        label={ESTADO_LABELS[p.estado]}
                        variant={ESTADO_BADGE_VARIANT[p.estado]}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-outline-variant">
                    <span>{txs.length} movimientos</span>
                    <span className="text-outline-variant/40">·</span>
                    <span className="text-success">+{fmt(ingresos)} €</span>
                    <span className="text-outline-variant/40">·</span>
                    <span className="text-on-surface">-{fmt(gastos)} €</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <BottomSheet
        open={showAddProp}
        onClose={() => setShowAddProp(false)}
        title="Nueva propiedad"
      >
        <PropiedadForm
          onSave={async (p) => {
            await addProp(p)
            setShowAddProp(false)
          }}
          onCancel={() => setShowAddProp(false)}
        />
      </BottomSheet>
    </div>
  )
}
