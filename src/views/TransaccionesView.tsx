import { useState, useMemo } from 'react'
import { Plus, Search } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import { TransactionItem } from '../components/TransactionItem'
import { BottomSheet } from '../components/BottomSheet'
import { TransactionForm } from '../components/TransactionForm'
import { Button } from '../components/Button'
import type { TransaccionTipo } from '../types'

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function TransaccionesView() {
  const { propiedades, transacciones, addTx, deleteTx } = useApp()
  const [showAdd, setShowAdd] = useState(false)
  const [filterTipo, setFilterTipo] = useState<TransaccionTipo | 'todos'>('todos')
  const [filterProp, setFilterProp] = useState<string>('todas')
  const [filterMes, setFilterMes] = useState(format(new Date(), 'yyyy-MM'))
  const [search, setSearch] = useState('')

  const meses = useMemo(() => {
    const set = new Set(transacciones.map((t) => t.fecha.slice(0, 7)))
    const currentMonth = format(new Date(), 'yyyy-MM')
    set.add(currentMonth)
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
            prop?.nombre.toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [transacciones, filterTipo, filterProp, filterMes, search, propiedades])

  const ingresos = filtered
    .filter((t) => t.tipo === 'ingreso')
    .reduce((s, t) => s + t.importe, 0)
  const gastos = filtered
    .filter((t) => t.tipo === 'gasto')
    .reduce((s, t) => s + t.importe, 0)

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
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant"
          />
          <input
            type="search"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-low rounded-xl pl-9 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Month pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 mb-3">
          {meses.slice(0, 18).map((m) => (
            <button
              key={m}
              onClick={() => setFilterMes(filterMes === m ? '' : m)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                filterMes === m
                  ? 'bg-on-surface text-surface'
                  : 'bg-surface-low text-outline-variant'
              }`}
            >
              {format(new Date(m + '-01'), 'MMM yy', { locale: es })}
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div className="flex gap-2">
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value as TransaccionTipo | 'todos')}
            className="flex-1 bg-surface-low border-0 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none"
          >
            <option value="todos">Todos</option>
            <option value="ingreso">Ingresos</option>
            <option value="gasto">Gastos</option>
          </select>

          {propiedades.length > 1 && (
            <select
              value={filterProp}
              onChange={(e) => setFilterProp(e.target.value)}
              className="flex-1 bg-surface-low border-0 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none"
            >
              <option value="todas">Todas</option>
              {propiedades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Summary */}
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
            <p
              className={`text-sm font-bold tabular-nums ${
                ingresos - gastos >= 0 ? 'text-success' : 'text-error'
              }`}
            >
              {ingresos - gastos >= 0 ? '+' : ''}
              {fmt(ingresos - gastos)} €
            </p>
          </div>
        </div>
      </div>

      {/* List */}
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
          <div className="bg-surface-lowest rounded-2xl shadow-soft px-4">
            {filtered.map((tx) => {
              const prop = propiedades.find((p) => p.id === tx.propiedadId)
              return (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  propiedadNombre={propiedades.length > 1 ? prop?.nombre : undefined}
                  onDelete={async (id) => {
                    if (confirm('¿Eliminar esta transacción?')) await deleteTx(id)
                  }}
                  onOpenFile={(id) => {
                    window.open(`https://drive.google.com/file/d/${id}/view`, '_blank')
                  }}
                />
              )
            })}
          </div>
        )}
      </div>

      <BottomSheet open={showAdd} onClose={() => setShowAdd(false)} title="Nueva transacción">
        <TransactionForm
          propiedades={propiedades}
          onSave={async (t) => {
            await addTx(t)
            setShowAdd(false)
          }}
          onCancel={() => setShowAdd(false)}
        />
      </BottomSheet>
    </div>
  )
}
