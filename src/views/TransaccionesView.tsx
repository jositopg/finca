import { useState, useMemo } from 'react'
import { Plus, Search } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import { TransactionItem } from '../components/TransactionItem'
import { BottomSheet } from '../components/BottomSheet'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TransactionForm } from '../components/TransactionForm'
import { Button } from '../components/Button'
import type { Transaccion, TransaccionTipo } from '../types'

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function groupByMonth(txs: Transaccion[]): { mes: string; items: Transaccion[] }[] {
  const map = new Map<string, Transaccion[]>()
  for (const tx of txs) {
    const mes = tx.fecha.slice(0, 7)
    if (!map.has(mes)) map.set(mes, [])
    map.get(mes)!.push(tx)
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([mes, items]) => ({ mes, items }))
}

export function TransaccionesView() {
  const { propiedades, transacciones, addTx, deleteTx } = useApp()
  const [showAdd, setShowAdd] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [filterTipo, setFilterTipo] = useState<TransaccionTipo | 'todos'>('todos')
  const [filterProp, setFilterProp] = useState<string>('todas')
  const [filterMes, setFilterMes] = useState(format(new Date(), 'yyyy-MM'))
  const [search, setSearch] = useState('')

  const meses = useMemo(() => {
    const set = new Set(transacciones.map((t) => t.fecha.slice(0, 7)))
    set.add(format(new Date(), 'yyyy-MM'))
    return [...set].sort().reverse()
  }, [transacciones])

  const filtered = useMemo(() => {
    return transacciones
      .filter((t) => {
        if (filterTipo !== 'todos' && t.tipo !== filterTipo) return false
        if (filterProp !== 'todas' && t.propiedadId !== filterProp) return false
        if (filterMes && !t.fecha.startsWith(filterMes)) return false
        if (search) {
          const q = search.toLowerCase()
          const prop = propiedades.find((p) => p.id === t.propiedadId)
          return (
            t.categoria.toLowerCase().includes(q) ||
            t.descripcion.toLowerCase().includes(q) ||
            (t.referencia?.toLowerCase().includes(q) ?? false) ||
            prop?.nombre.toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [transacciones, filterTipo, filterProp, filterMes, search, propiedades])

  const ingresos = filtered.filter((t) => t.tipo === 'ingreso').reduce((s, t) => s + t.importe, 0)
  const gastos = filtered.filter((t) => t.tipo === 'gasto').reduce((s, t) => s + t.importe, 0)
  const grupos = groupByMonth(filtered)

  return (
    <div className="flex flex-col pb-24">
      <div className="px-5 pt-12 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-2xl font-bold text-on-surface">Movimientos</h1>
          <Button onClick={() => setShowAdd(true)} size="sm" disabled={propiedades.length === 0}>
            <Plus size={14} />
            Nuevo
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant" />
          <input
            type="search"
            placeholder="Buscar categoría, descripción, referencia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-low rounded-xl pl-9 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Month pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 mb-3">
          <button
            onClick={() => setFilterMes('')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterMes === '' ? 'bg-on-surface text-surface' : 'bg-surface-low text-outline-variant'
            }`}
          >
            Todo
          </button>
          {meses.slice(0, 24).map((m) => (
            <button
              key={m}
              onClick={() => setFilterMes(filterMes === m ? '' : m)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                filterMes === m ? 'bg-on-surface text-surface' : 'bg-surface-low text-outline-variant'
              }`}
            >
              {format(new Date(m + '-01'), 'MMM yy', { locale: es })}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value as TransaccionTipo | 'todos')}
            className="flex-1 bg-surface-low border-0 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none"
          >
            <option value="todos">Todos</option>
            <option value="ingreso">Solo ingresos</option>
            <option value="gasto">Solo gastos</option>
          </select>

          {propiedades.length > 1 && (
            <select
              value={filterProp}
              onChange={(e) => setFilterProp(e.target.value)}
              className="flex-1 bg-surface-low border-0 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none"
            >
              <option value="todas">Todas</option>
              {propiedades.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-5 mb-4">
        <div className="flex gap-3">
          <div className="flex-1 bg-success-container/50 rounded-xl px-3 py-2.5">
            <p className="text-xs text-success mb-0.5">Ingresos</p>
            <p className="text-sm font-bold text-success tabular-nums">+{fmt(ingresos)} €</p>
          </div>
          <div className="flex-1 bg-surface-low rounded-xl px-3 py-2.5">
            <p className="text-xs text-outline-variant mb-0.5">Gastos</p>
            <p className="text-sm font-bold text-on-surface tabular-nums">-{fmt(gastos)} €</p>
          </div>
          <div
            className={`flex-1 rounded-xl px-3 py-2.5 ${
              ingresos - gastos >= 0 ? 'bg-success-container/30' : 'bg-error-container/30'
            }`}
          >
            <p className="text-xs text-outline-variant mb-0.5">Balance</p>
            <p className={`text-sm font-bold tabular-nums ${ingresos - gastos >= 0 ? 'text-success' : 'text-error'}`}>
              {ingresos - gastos >= 0 ? '+' : ''}{fmt(ingresos - gastos)} €
            </p>
          </div>
        </div>
      </div>

      {/* Grouped list */}
      <div className="px-5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-outline-variant">
              {transacciones.length === 0
                ? 'Aún no hay movimientos registrados.'
                : 'Sin resultados para los filtros aplicados.'}
            </p>
            {propiedades.length > 0 && (
              <Button onClick={() => setShowAdd(true)} size="sm">
                <Plus size={14} />
                Añadir transacción
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {grupos.map(({ mes, items }) => {
              const totalMes = items.reduce(
                (s, t) => s + (t.tipo === 'ingreso' ? t.importe : -t.importe),
                0,
              )
              return (
                <div key={mes}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-outline-variant capitalize">
                      {format(new Date(mes + '-01'), 'MMMM yyyy', { locale: es })}
                    </span>
                    <span className={`text-xs font-medium tabular-nums ${totalMes >= 0 ? 'text-success' : 'text-error'}`}>
                      {totalMes >= 0 ? '+' : ''}{fmt(totalMes)} €
                    </span>
                  </div>
                  <div className="bg-surface-lowest rounded-2xl shadow-soft px-4">
                    {items.map((tx) => {
                      const prop = propiedades.find((p) => p.id === tx.propiedadId)
                      return (
                        <TransactionItem
                          key={tx.id}
                          tx={tx}
                          propiedad={prop}
                          propiedadNombre={propiedades.length > 1 ? prop?.nombre : undefined}
                          onDelete={(id) => setConfirmId(id)}
                          onOpenFile={(id) =>
                            window.open(`https://drive.google.com/file/d/${id}/view`, '_blank')
                          }
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <BottomSheet open={showAdd} onClose={() => setShowAdd(false)} title="Nueva transacción">
        <TransactionForm
          propiedades={propiedades}
          onSave={async (t) => { await addTx(t); setShowAdd(false) }}
          onCancel={() => setShowAdd(false)}
        />
      </BottomSheet>

      <ConfirmDialog
        open={!!confirmId}
        title="Eliminar transacción"
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (confirmId) await deleteTx(confirmId)
          setConfirmId(null)
        }}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  )
}
