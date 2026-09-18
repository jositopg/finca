import { useState } from 'react'
import {
  AlertTriangle,
  Download,
  Droplet,
  FileSpreadsheet,
  Plus,
  Receipt,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import { useAccionesGlobales } from '../hooks/useAccionesGlobales'
import { BottomSheet } from '../components/BottomSheet'
import { DatosFacturacionForm } from '../components/DatosFacturacionForm'
import { FacturasSuministros } from '../components/FacturasSuministros'
import { PropiedadForm } from '../components/PropiedadForm'
import { AvisosDashboard } from '../components/AvisosDashboard'
import { CobrosPendientes } from '../components/CobrosPendientes'
import { TareasDashboard } from '../components/TareasDashboard'
import { TransactionForm } from '../components/TransactionForm'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import {
  esDeAlquiler,
  esDeJose,
  ESTADO_BADGE_VARIANT,
  ESTADO_LABELS,
  importeEnRango,
  miParte,
  rangoAnio,
  rangoMes,
  rentaPendiente,
  TIPO_LABELS,
  type Propiedad,
  type Transaccion,
} from '../types'
import type { View } from '../components/Nav'

interface Props {
  onNavigate: (v: View, propiedadId?: string) => void
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function DashboardView({ onNavigate }: Props) {
  const {
    propiedades,
    transacciones,
    tareas,
    datosFacturacion,
    guardarDatosFacturacion,
    isLoadingData,
    refreshData,
    addProp,
    addTx,
  } = useApp()
  const { exportarSheets, exportarJSON, exporting } = useAccionesGlobales()
  const [showAddProp, setShowAddProp] = useState(false)
  const [showAddTx, setShowAddTx] = useState(false)
  const [showDatosFacturacion, setShowDatosFacturacion] = useState(false)

  const now = new Date()
  const currentMonth = format(now, 'yyyy-MM')
  const currentYear = format(now, 'yyyy')
  const [desdeMes, hastaMes] = rangoMes(currentMonth)
  const [desdeAnio, hastaAnio] = rangoAnio(currentYear)

  // Totales personales de rendimiento de alquiler: solo propiedades que son
  // de Jose (no las que gestiona por cuenta de otros) y que no sean de uso
  // propio/vivienda habitual (esas se llevan aparte, no son alquiler).
  const propiedadesJose = propiedades.filter((p) => esDeJose(p) && esDeAlquiler(p))
  const propiedadPorId = new Map(propiedadesJose.map((p) => [p.id, p]))

  function miImporteEnRango(t: Transaccion, desde: string, hasta: string): number | null {
    const p = propiedadPorId.get(t.propiedadId)
    return p ? miParte(importeEnRango(t, desde, hasta), p, t.soloMio) : null
  }

  const ingresosMes = transacciones
    .filter((t) => t.tipo === 'ingreso')
    .reduce((s, t) => s + (miImporteEnRango(t, desdeMes, hastaMes) ?? 0), 0)

  const gastosMes = transacciones
    .filter((t) => t.tipo === 'gasto')
    .reduce((s, t) => s + (miImporteEnRango(t, desdeMes, hastaMes) ?? 0), 0)

  const ingresosAnio = transacciones
    .filter((t) => t.tipo === 'ingreso')
    .reduce((s, t) => s + (miImporteEnRango(t, desdeAnio, hastaAnio) ?? 0), 0)

  const gastosAnio = transacciones
    .filter((t) => t.tipo === 'gasto')
    .reduce((s, t) => s + (miImporteEnRango(t, desdeAnio, hastaAnio) ?? 0), 0)

  // Quick stats
  const alquiladas = propiedades.filter((p) => p.estado === 'alquilado').length
  const vacias = propiedades.filter((p) => p.estado === 'vacio').length
  const propias = propiedades.filter(
    (p) => p.estado === 'uso_propio' || p.estado === 'vivienda_habitual',
  ).length

  return (
    <div className="flex flex-col pb-24 lg:pb-10">
      {/* Header */}
      <div className="px-5 pt-12 pb-5 lg:px-0 lg:pt-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display text-2xl font-bold text-on-surface lg:text-3xl">Finca</h1>
          <div className="flex items-center gap-1 lg:hidden">
            <button
              onClick={exportarSheets}
              disabled={exporting || propiedades.length === 0}
              title="Exportar a Google Sheets"
              className="w-9 h-9 flex items-center justify-center rounded-xl text-outline-variant hover:bg-surface-low transition-colors disabled:opacity-40"
            >
              <FileSpreadsheet size={18} className={exporting ? 'animate-pulse' : ''} />
            </button>
            <button
              onClick={exportarJSON}
              title="Exportar copia de seguridad (JSON)"
              className="w-9 h-9 flex items-center justify-center rounded-xl text-outline-variant hover:bg-surface-low transition-colors"
            >
              <Download size={18} />
            </button>
            <button
              onClick={() => setShowDatosFacturacion(true)}
              title="Mis datos de facturación"
              className="w-9 h-9 flex items-center justify-center rounded-xl text-outline-variant hover:bg-surface-low transition-colors"
            >
              <Receipt size={18} />
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

      {/* Layout: móvil = una columna en el orden actual (via `order` sobre los
          hijos promovidos por `contents`); escritorio = 2 columnas que apilan
          de forma independiente (sin compartir alto de fila como haría grid). */}
      <div className="flex flex-col lg:grid lg:grid-cols-[7fr_4fr] lg:gap-6 lg:items-start">

      {/* Columna principal */}
      <div className="contents lg:flex lg:flex-col lg:gap-5">

      {/* Monthly summary */}
      <div className="px-5 mb-5 order-2 lg:order-none lg:px-0 lg:mb-0">
        <div className="bg-surface-lowest rounded-2xl shadow-soft p-5 lg:p-6">
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
        <div className="px-5 mb-5 order-5 lg:order-none lg:px-0 lg:mb-0">
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
      <div className="px-5 order-6 lg:order-none lg:px-0">
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
          <div className="flex flex-col gap-3 xl:grid xl:grid-cols-2">
            {propiedades.map((p) => (
              <PropiedadCard
                key={p.id}
                propiedad={p}
                ingresosMes={transacciones
                  .filter((t) => t.propiedadId === p.id && t.tipo === 'ingreso')
                  .reduce((s, t) => s + miParte(importeEnRango(t, desdeMes, hastaMes), p, t.soloMio), 0)}
                gastosMes={transacciones
                  .filter((t) => t.propiedadId === p.id && t.tipo === 'gasto')
                  .reduce((s, t) => s + miParte(importeEnRango(t, desdeMes, hastaMes), p, t.soloMio), 0)}
                rentaPendiente={rentaPendiente(p, transacciones)}
                onClick={() => onNavigate('propiedades', p.id)}
              />
            ))}
          </div>
        )}
      </div>

      </div>

      {/* Columna lateral */}
      <div className="contents lg:flex lg:flex-col lg:gap-5">

      {/* Quick stats */}
      {propiedades.length > 0 && (
        <div className="px-5 mb-5 order-1 lg:order-none lg:px-0 lg:mb-0">
          <div className="flex gap-2 lg:grid lg:grid-cols-2">
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

      <div className="px-5 mb-5 order-3 lg:order-none lg:px-0 lg:mb-0">
        <AvisosDashboard
          propiedades={propiedades}
          transacciones={transacciones}
          onSelectPropiedad={(id) => onNavigate('propiedades', id)}
        />
      </div>

      <div className="px-5 mb-5 order-3 lg:order-none lg:px-0 lg:mb-0">
        <CobrosPendientes propiedades={propiedades} transacciones={transacciones} />
      </div>

      {/* Tareas pendientes de todas las propiedades */}
      <div className="px-5 mb-5 order-3 lg:order-none lg:px-0 lg:mb-0">
        <TareasDashboard
          propiedades={propiedades}
          tareas={tareas}
          onSelectPropiedad={(id) => onNavigate('propiedades', id)}
        />
      </div>

      {/* Facturas de agua y luz — carga rápida para todas las propiedades */}
      {propiedades.length > 0 && (
        <div className="px-5 mb-5 order-4 lg:order-none lg:px-0 lg:mb-0">
          <FacturasSuministros
            propiedades={propiedades}
            trigger={(open) => (
              <button
                onClick={open}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary-container text-primary text-sm font-semibold hover:brightness-95 transition-all"
              >
                <Droplet size={16} />
                Registrar facturas de agua y luz
              </button>
            )}
          />
        </div>
      )}

      </div>

      </div>

      {/* FAB */}
      {propiedades.length > 0 && (
        <button
          onClick={() => setShowAddTx(true)}
          className="fixed bottom-20 right-4 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-card flex items-center justify-center hover:bg-primary-dim transition-colors z-30 lg:bottom-8 lg:right-8"
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

      <BottomSheet
        open={showDatosFacturacion}
        onClose={() => setShowDatosFacturacion(false)}
        title="Mis datos de facturación"
      >
        <DatosFacturacionForm
          initial={datosFacturacion}
          onSave={async (d) => {
            await guardarDatosFacturacion(d)
            setShowDatosFacturacion(false)
          }}
          onCancel={() => setShowDatosFacturacion(false)}
        />
      </BottomSheet>
    </div>
  )
}

function PropiedadCard({
  propiedad,
  ingresosMes,
  gastosMes,
  rentaPendiente,
  onClick,
}: {
  propiedad: Propiedad
  ingresosMes: number
  gastosMes: number
  rentaPendiente: boolean
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
          {propiedad.propietarioNombre ? (
            <Badge label={`De ${propiedad.propietarioNombre}`} variant="warning" />
          ) : (
            propiedad.porcentajePropiedad != null &&
            propiedad.porcentajePropiedad < 100 && (
              <Badge label={`${propiedad.porcentajePropiedad}% tuyo`} />
            )
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
      {rentaPendiente && (
        <div className="flex items-center gap-1 mt-2 text-xs text-warning font-medium">
          <AlertTriangle size={12} />
          Renta sin cobrar este mes
        </div>
      )}
    </button>
  )
}
