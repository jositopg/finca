import { useState } from 'react'
import {
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import { exportarASheets } from '../api/setup'
import { BottomSheet } from '../components/BottomSheet'
import { PropiedadForm } from '../components/PropiedadForm'
import { TransactionForm } from '../components/TransactionForm'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ESTADO_BADGE_VARIANT, ESTADO_LABELS, miParte, TIPO_LABELS, type Propiedad } from '../types'
import type { View } from '../components/Nav'

interface Props {
  onNavigate: (v: View, propiedadId?: string) => void
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function DashboardView({ onNavigate }: Props) {
  const { propiedades, transacciones, isLoadingData, refreshData, addProp, addTx, ensureDriveAccess } =
    useApp()
  const [showAddProp, setShowAddProp] = useState(false)
  const [showAddTx, setShowAddTx] = useState(false)
  const [exporting, setExporting] = useState(false)

  const now = new Date()
  const currentMonth = format(now, 'yyyy-MM')
  const currentYear = format(now, 'yyyy')

  const propiedadPorId = new Map(propiedades.map((p) => [p.id, p]))
  function miImporte(t: { propiedadId: string; importe: number }): number {
    const p = propiedadPorId.get(t.propiedadId)
    return p ? miParte(t.importe, p) : t.importe
  }

  const ingresosMes = transacciones
    .filter((t) => t.tipo === 'ingreso' && t.fecha.startsWith(currentMonth))
    .reduce((s, t) => s + miImporte(t), 0)

  const gastosMes = transacciones
    .filter((t) => t.tipo === 'gasto' && t.fecha.startsWith(currentMonth))
    .reduce((s, t) => s + miImporte(t), 0)

  const ingresosAnio = transacciones
    .filter((t) => t.tipo === 'ingreso' && t.fecha.startsWith(currentYear))
    .reduce((s, t) => s + miImporte(t), 0)

  const gastosAnio = transacciones
    .filter((t) => t.tipo === 'gasto' && t.fecha.startsWith(currentYear))
    .reduce((s, t) => s + miImporte(t), 0)

  // Quick stats
  const alquiladas = propiedades.filter((p) => p.estado === 'alquilado').length
  const vacias = propiedades.filter((p) => p.estado === 'vacio').length
  const propias = propiedades.filter(
    (p) => p.estado === 'uso_propio' || p.estado === 'vivienda_habitual',
  ).length

  function handleExportJSON() {
    const data = {
      exportadoEn: new Date().toISOString(),
      propiedades,
      transacciones,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finca-backup-${format(now, 'yyyy-MM-dd')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleExportSheets() {
    setExporting(true)
    try {
      await ensureDriveAccess()
      const { url } = await exportarASheets(propiedades, transacciones)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Export to Sheets error', err)
      alert('No se pudo exportar a Google Sheets. Inténtalo de nuevo.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col pb-24">
      {/* Header */}
      <div className="px-5 pt-12 pb-5">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display text-2xl font-bold text-on-surface">Finca</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={handleExportSheets}
              disabled={exporting || propiedades.length === 0}
              title="Exportar a Google Sheets"
              className="w-9 h-9 flex items-center justify-center rounded-xl text-outline-variant hover:bg-surface-low transition-colors disabled:opacity-40"
            >
              <FileSpreadsheet size={18} className={exporting ? 'animate-pulse' : ''} />
            </button>
            <button
              onClick={handleExportJSON}
              title="Exportar copia de seguridad (JSON)"
              className="w-9 h-9 flex items-center justify-center rounded-xl text-outline-variant hover:bg-surface-low transition-colors"
            >
              <Download size={18} />
            </button>
            <button
              onClick={refreshData}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-outline-variant hover:bg-surface-low transition-colors"
            >
              <RefreshCw size={18} className={isLoadingData ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <p className="text-sm text-outline-variant capitalize">
          {format(now, "MMMM 'de' yyyy", { locale: es })}
        </p>
      </div>

      {/* Quick stats */}
      {propiedades.length > 0 && (
        <div className="px-5 mb-5">
          <div className="flex gap-2">
            <div className="flex-1 bg-surface-lowest rounded-xl shadow-soft px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-on-surface">{propiedades.length}</p>
              <p className="text-xs text-outline-variant">Total</p>
            </div>
            {alquiladas > 0 && (
              <div className="flex-1 bg-success-container/60 rounded-xl px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-success">{alquiladas}</p>
                <p className="text-xs text-success/70">Alquiladas</p>
              </div>
            )}
            {vacias > 0 && (
              <div className="flex-1 bg-warning-container/60 rounded-xl px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-warning">{vacias}</p>
                <p className="text-xs text-warning/70">Vacías</p>
              </div>
            )}
            {propias > 0 && (
              <div className="flex-1 bg-surface-low rounded-xl px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-on-surface">{propias}</p>
                <p className="text-xs text-outline-variant">Propias</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Monthly summary */}
      <div className="px-5 mb-5">
        <div className="bg-surface-lowest rounded-2xl shadow-soft p-5">
          <p className="text-xs font-medium text-outline-variant uppercase tracking-wide mb-3">
            Este mes
          </p>
          <p
            className={`font-display text-3xl font-bold tracking-tight mb-4 ${
              ingresosMes - gastosMes >= 0 ? 'text-success' : 'text-error'
            }`}
          >
            {ingresosMes - gastosMes >= 0 ? '+' : ''}
            {fmt(ingresosMes - gastosMes)} €
          </p>
          <div className="flex gap-3">
            <div className="flex-1 bg-success-container/50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp size={14} className="text-success" />
                <span className="text-xs text-success font-medium">Ingresos</span>
              </div>
              <p className="text-sm font-bold text-success tabular-nums">{fmt(ingresosMes)} €</p>
            </div>
            <div className="flex-1 bg-surface-low rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown size={14} className="text-outline-variant" />
                <span className="text-xs text-outline-variant font-medium">Gastos</span>
              </div>
              <p className="text-sm font-bold text-on-surface tabular-nums">{fmt(gastosMes)} €</p>
            </div>
          </div>
        </div>
      </div>

      {/* Year summary */}
      {(ingresosAnio > 0 || gastosAnio > 0) && (
        <div className="px-5 mb-5">
          <div className="flex items-center gap-3 bg-surface-low rounded-xl px-4 py-3">
            <span className="text-xs text-outline-variant">Año {currentYear}</span>
            <span className="text-xs text-success font-medium tabular-nums">
              +{fmt(ingresosAnio)} €
            </span>
            <span className="text-outline-variant/40">·</span>
            <span className="text-xs text-on-surface font-medium tabular-nums">
              -{fmt(gastosAnio)} €
            </span>
            <span
              className={`ml-auto text-xs font-bold tabular-nums ${
                ingresosAnio - gastosAnio >= 0 ? 'text-success' : 'text-error'
              }`}
            >
              {ingresosAnio - gastosAnio >= 0 ? '+' : ''}
              {fmt(ingresosAnio - gastosAnio)} €
            </span>
          </div>
        </div>
      )}

      {/* Properties */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
            Propiedades ({propiedades.length})
          </p>
          <button
            onClick={() => setShowAddProp(true)}
            className="flex items-center gap-1 text-xs text-primary font-medium"
          >
            <Plus size={14} />
            Añadir
          </button>
        </div>

        {propiedades.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-outline-variant">
              Aún no tienes propiedades.
              <br />
              Añade la primera para empezar.
            </p>
            <Button onClick={() => setShowAddProp(true)} size="sm">
              <Plus size={14} />
              Nueva propiedad
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {propiedades.map((p) => (
              <PropiedadCard
                key={p.id}
                propiedad={p}
                ingresosMes={transacciones
                  .filter(
                    (t) =>
                      t.propiedadId === p.id &&
                      t.tipo === 'ingreso' &&
                      t.fecha.startsWith(currentMonth),
                  )
                  .reduce((s, t) => s + miParte(t.importe, p), 0)}
                gastosMes={transacciones
                  .filter(
                    (t) =>
                      t.propiedadId === p.id &&
                      t.tipo === 'gasto' &&
                      t.fecha.startsWith(currentMonth),
                  )
                  .reduce((s, t) => s + miParte(t.importe, p), 0)}
                onClick={() => onNavigate('propiedades', p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      {propiedades.length > 0 && (
        <button
          onClick={() => setShowAddTx(true)}
          className="fixed bottom-20 right-4 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-card flex items-center justify-center hover:bg-primary-dim transition-colors z-30"
        >
          <Plus size={24} />
        </button>
      )}

      <BottomSheet open={showAddProp} onClose={() => setShowAddProp(false)} title="Nueva propiedad">
        <PropiedadForm
          onSave={async (p) => { await addProp(p); setShowAddProp(false) }}
          onCancel={() => setShowAddProp(false)}
        />
      </BottomSheet>

      <BottomSheet open={showAddTx} onClose={() => setShowAddTx(false)} title="Nueva transacción">
        <TransactionForm
          propiedades={propiedades}
          onSave={async (t) => { await addTx(t); setShowAddTx(false) }}
          onCancel={() => setShowAddTx(false)}
        />
      </BottomSheet>
    </div>
  )
}

function PropiedadCard({
  propiedad,
  ingresosMes,
  gastosMes,
  onClick,
}: {
  propiedad: Propiedad
  ingresosMes: number
  gastosMes: number
  onClick: () => void
}) {
  const balance = ingresosMes - gastosMes

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface-lowest rounded-2xl shadow-soft p-4 hover:shadow-card transition-shadow"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-medium text-on-surface text-sm truncate">{propiedad.nombre}</p>
          {propiedad.direccion && (
            <p className="text-xs text-outline-variant truncate mt-0.5">{propiedad.direccion}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge label={TIPO_LABELS[propiedad.tipo]} />
          <Badge
            label={ESTADO_LABELS[propiedad.estado]}
            variant={ESTADO_BADGE_VARIANT[propiedad.estado]}
          />
          {propiedad.porcentajePropiedad != null && propiedad.porcentajePropiedad < 100 && (
            <Badge label={`${propiedad.porcentajePropiedad}% tuyo`} />
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-success tabular-nums">+{fmt(ingresosMes)} €</span>
        <span className="text-outline-variant/40">·</span>
        <span className="text-on-surface tabular-nums">-{fmt(gastosMes)} €</span>
        <span
          className={`ml-auto font-medium tabular-nums ${balance >= 0 ? 'text-success' : 'text-error'}`}
        >
          {balance >= 0 ? '+' : ''}{fmt(balance)} €
        </span>
      </div>
    </button>
  )
}
