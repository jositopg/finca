import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Edit2,
  ExternalLink,
  Plus,
  BarChart2,
  Trash2,
  User,
  UserPlus,
} from 'lucide-react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import { BottomSheet } from '../components/BottomSheet'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CobroRenta } from '../components/CobroRenta'
import { ContratoAlquiler } from '../components/ContratoAlquiler'
import { FacturaAlquiler } from '../components/FacturaAlquiler'
import { GastoSuministro } from '../components/GastoSuministro'
import { HistorialAlquileres } from '../components/HistorialAlquileres'
import { TareasPropiedad } from '../components/TareasPropiedad'
import { TerminarContrato } from '../components/TerminarContrato'
import { PropiedadForm } from '../components/PropiedadForm'
import { TransactionForm } from '../components/TransactionForm'
import { TransactionItem } from '../components/TransactionItem'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import {
  calcularRentabilidad,
  calcularReparto,
  esDeAlquiler,
  esDeJose,
  ESTADO_BADGE_VARIANT,
  ESTADO_LABELS,
  miParte,
  parseImporte,
  rentaPendiente,
  tareaVencida,
  TIPO_LABELS,
  valorarPropiedad,
  type Propiedad,
  type Tarea,
  type Transaccion,
} from '../types'

interface Props {
  selectedId?: string
  onSelectId: (id?: string) => void
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Días desde/hasta el fin de contrato. Si ya pasó la fecha, el contrato
// sigue vigente por tácita reconducción (no vence solo, hay que rescindirlo).
function contratoEstado(contratoFin?: string): { dias: number; vencido: boolean; alerta: boolean } | null {
  if (!contratoFin) return null
  const dias = differenceInDays(parseISO(contratoFin), new Date())
  return { dias, vencido: dias < 0, alerta: dias <= 60 }
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

// ── Property card (lista) ──────────────────────────────────────────────────────
function PropiedadCard({
  propiedad: p,
  transacciones,
  tareas,
  currentAnio,
  onSelect,
}: {
  propiedad: Propiedad
  transacciones: Transaccion[]
  tareas: Tarea[]
  currentAnio: string
  onSelect: () => void
}) {
  const txsAnio = transacciones.filter((t) => t.propiedadId === p.id && t.fecha.startsWith(currentAnio))
  const ingresos = txsAnio
    .filter((t) => t.tipo === 'ingreso')
    .reduce((s, t) => s + miParte(t.importe, p), 0)
  const gastos = txsAnio
    .filter((t) => t.tipo === 'gasto')
    .reduce((s, t) => s + miParte(t.importe, p), 0)
  const estadoContratoP = contratoEstado(p.contratoFin)
  const alertaContrato = estadoContratoP?.alerta ?? false
  const rentaSinCobrar = rentaPendiente(p, transacciones)
  const tareasVencidasP = tareas.filter((t) => t.propiedadId === p.id && tareaVencida(t)).length

  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-surface-lowest rounded-2xl shadow-soft p-4 hover:shadow-card transition-shadow"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-medium text-on-surface text-sm truncate">{p.nombre}</p>
          {p.direccion && (
            <p className="text-xs text-outline-variant truncate mt-0.5">{p.direccion}</p>
          )}
          {p.inquilinoNombre && (
            <p className="text-xs text-outline-variant/70 truncate mt-0.5">
              {p.inquilinoNombre}
              {p.alquilerMensual ? ` · ${fmt(p.alquilerMensual)} €/mes` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <Badge
            label={ESTADO_LABELS[p.estado]}
            variant={ESTADO_BADGE_VARIANT[p.estado]}
          />
          {p.propietarioNombre ? (
            <span className="text-xs text-warning font-medium">De {p.propietarioNombre}</span>
          ) : (
            p.porcentajePropiedad != null &&
            p.porcentajePropiedad < 100 && (
              <span className="text-xs text-outline-variant">{p.porcentajePropiedad}% tuyo</span>
            )
          )}
          {alertaContrato && estadoContratoP && (
            <span className="text-xs text-warning font-medium flex items-center gap-1 text-right">
              <AlertTriangle size={11} className="flex-shrink-0" />
              {estadoContratoP.vencido ? 'Tácita reconducción' : `${estadoContratoP.dias}d`}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-outline-variant">{currentAnio}</span>
        <span className="text-success tabular-nums">+{fmt(ingresos)} €</span>
        <span className="text-outline-variant/40">·</span>
        <span className="text-on-surface tabular-nums">-{fmt(gastos)} €</span>
        <span className={`ml-auto font-medium tabular-nums ${ingresos - gastos >= 0 ? 'text-success' : 'text-error'}`}>
          {ingresos - gastos >= 0 ? '+' : ''}{fmt(ingresos - gastos)} €
        </span>
      </div>
      {rentaSinCobrar && (
        <div className="flex items-center gap-1 mt-2 text-xs text-warning font-medium">
          <AlertTriangle size={11} />
          Renta sin cobrar este mes
        </div>
      )}
      {tareasVencidasP > 0 && (
        <div className="flex items-center gap-1 mt-2 text-xs text-error font-medium">
          <AlertTriangle size={11} />
          {tareasVencidasP} tarea{tareasVencidasP === 1 ? '' : 's'} vencida{tareasVencidasP === 1 ? '' : 's'}
        </div>
      )}
    </button>
  )
}

// ── Fiscal summary component ───────────────────────────────────────────────────
function FiscalSummary({ txs, propiedad }: { txs: Transaccion[]; propiedad: Propiedad }) {
  const years = useMemo(() => {
    const set = new Set(txs.map((t) => t.fecha.slice(0, 4)))
    const cur = new Date().getFullYear().toString()
    set.add(cur)
    return [...set].sort().reverse()
  }, [txs])

  const [anio, setAnio] = useState(years[0])

  const txsAnio = txs.filter((t) => t.fecha.startsWith(anio))
  const ingresos = txsAnio
    .filter((t) => t.tipo === 'ingreso')
    .reduce((s, t) => s + miParte(t.importe, propiedad), 0)
  const gastos = txsAnio
    .filter((t) => t.tipo === 'gasto')
    .reduce((s, t) => s + miParte(t.importe, propiedad), 0)

  // Group gastos by category (ya en tu parte)
  const porCategoria = txsAnio
    .filter((t) => t.tipo === 'gasto')
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.categoria] = (acc[t.categoria] ?? 0) + miParte(t.importe, propiedad)
      return acc
    }, {})

  const categorias = Object.entries(porCategoria).sort(([, a], [, b]) => b - a)

  const repercutible = txsAnio
    .filter((t) => t.tipo === 'gasto')
    .reduce((s, t) => {
      const r = calcularReparto(t.categoria, t.importe, propiedad.reparto)
      return s + miParte(r?.inquilino ?? 0, propiedad)
    }, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Year selector */}
      <div className="flex gap-2">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setAnio(y)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              anio === y
                ? 'bg-on-surface text-surface'
                : 'bg-surface-low text-outline-variant'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {propiedad.porcentajePropiedad != null && propiedad.porcentajePropiedad < 100 && (
        <p className="text-xs text-outline-variant -mb-2">
          Cifras ya calculadas a tu {propiedad.porcentajePropiedad}% de la propiedad
        </p>
      )}

      {/* Totals */}
      <div className="flex gap-3">
        <div className="flex-1 bg-success-container/50 rounded-xl p-3">
          <p className="text-xs text-success mb-0.5">Ingresos</p>
          <p className="text-base font-bold text-success tabular-nums">+{fmt(ingresos)} €</p>
        </div>
        <div className="flex-1 bg-surface-low rounded-xl p-3">
          <p className="text-xs text-outline-variant mb-0.5">Gastos</p>
          <p className="text-base font-bold text-on-surface tabular-nums">-{fmt(gastos)} €</p>
        </div>
        <div
          className={`flex-1 rounded-xl p-3 ${
            ingresos - gastos >= 0 ? 'bg-success-container/30' : 'bg-error-container/30'
          }`}
        >
          <p className="text-xs text-outline-variant mb-0.5">Rendimiento</p>
          <p
            className={`text-base font-bold tabular-nums ${
              ingresos - gastos >= 0 ? 'text-success' : 'text-error'
            }`}
          >
            {ingresos - gastos >= 0 ? '+' : ''}
            {fmt(ingresos - gastos)} €
          </p>
        </div>
      </div>

      {repercutible > 0 && (
        <div className="flex items-center justify-between bg-surface-low rounded-xl p-3">
          <span className="text-xs text-outline-variant">A repercutir al inquilino</span>
          <span className="text-sm font-bold text-primary tabular-nums">{fmt(repercutible)} €</span>
        </div>
      )}

      {/* Category breakdown */}
      {categorias.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-outline-variant uppercase tracking-wide mb-1">
            Desglose de gastos
          </p>
          {categorias.map(([cat, importe]) => (
            <div key={cat} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-on-surface truncate">{cat}</span>
                  <span className="text-xs font-medium text-on-surface tabular-nums ml-2">
                    {fmt(importe)} €
                  </span>
                </div>
                <div className="h-1 bg-surface-high rounded-full overflow-hidden">
                  <div
                    className="h-full bg-on-surface/30 rounded-full"
                    style={{ width: `${Math.round((importe / gastos) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {txsAnio.length === 0 && (
        <p className="text-sm text-outline-variant text-center py-4">
          Sin movimientos en {anio}
        </p>
      )}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────
export function PropiedadesView({ selectedId, onSelectId }: Props) {
  const { propiedades, transacciones, tareas, addProp, updateProp, deleteProp, addTx, deleteTx } =
    useApp()
  const [showAddProp, setShowAddProp] = useState(false)
  const [editProp, setEditProp] = useState<Propiedad | null>(null)
  const [showAddTx, setShowAddTx] = useState(false)
  const [duplicateTx, setDuplicateTx] = useState<Transaccion | null>(null)
  const [showFiscal, setShowFiscal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'prop' | 'tx'; id: string } | null>(null)
  const [facturaTxId, setFacturaTxId] = useState<string | null>(null)
  const [filterMes, setFilterMes] = useState(format(new Date(), 'yyyy-MM'))
  const [umbralNetaStr, setUmbralNetaStr] = useState(
    () => localStorage.getItem('finca_umbral_rentabilidad') ?? '4',
  )

  function handleUmbralChange(v: string) {
    setUmbralNetaStr(v)
    localStorage.setItem('finca_umbral_rentabilidad', v)
  }

  const propiedad = propiedades.find((p) => p.id === selectedId)

  // ── Property detail view ───────────────────────────────────────────────────
  if (propiedad) {
    const txs = transacciones
      .filter((t) => t.propiedadId === propiedad.id)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))

    const txsFiltradas = filterMes ? txs.filter((t) => t.fecha.startsWith(filterMes)) : txs

    const ingresos = txsFiltradas
      .filter((t) => t.tipo === 'ingreso')
      .reduce((s, t) => s + miParte(t.importe, propiedad), 0)
    const gastos = txsFiltradas
      .filter((t) => t.tipo === 'gasto')
      .reduce((s, t) => s + miParte(t.importe, propiedad), 0)

    const meses = [...new Set(txs.map((t) => t.fecha.slice(0, 7)))].sort().reverse()
    const currentMonth = format(new Date(), 'yyyy-MM')
    const currentYearStr = format(new Date(), 'yyyy')
    if (!meses.includes(currentMonth)) meses.unshift(currentMonth)

    const grupos = groupByMonth(txsFiltradas)
    const rentaSinCobrarDetalle = rentaPendiente(propiedad, transacciones)
    const tareasVencidas = tareas.filter((t) => t.propiedadId === propiedad.id && tareaVencida(t)).length

    // Rentabilidad anual (sobre el año en curso, independiente del filtro de mes)
    const txsAnioActual = txs.filter((t) => t.fecha.startsWith(currentYearStr))
    const ingresosAnioActual = txsAnioActual
      .filter((t) => t.tipo === 'ingreso')
      .reduce((s, t) => s + miParte(t.importe, propiedad), 0)
    const gastosAnioActual = txsAnioActual
      .filter((t) => t.tipo === 'gasto')
      .reduce((s, t) => s + miParte(t.importe, propiedad), 0)
    const rentabilidadMercado = calcularRentabilidad(
      ingresosAnioActual,
      gastosAnioActual,
      propiedad.valorMercado,
    )
    const rentabilidadReferencia = calcularRentabilidad(
      ingresosAnioActual,
      gastosAnioActual,
      propiedad.valorReferencia,
    )
    const umbralNetaParseado = parseImporte(umbralNetaStr)
    const umbralNeta = Number.isNaN(umbralNetaParseado) ? 4 : umbralNetaParseado
    const valoracion = valorarPropiedad(propiedad, transacciones, umbralNeta)

    // Contract expiry warning (tácita reconducción si ya venció)
    const estadoContrato = contratoEstado(propiedad.contratoFin)
    const contratoAlerta = estadoContrato?.alerta ?? false

    return (
      <div className="flex flex-col pb-24">
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
                onClick={() => setShowFiscal(true)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-surface-low text-outline-variant hover:text-on-surface transition-colors"
                title="Resumen fiscal"
              >
                <BarChart2 size={15} />
              </button>
              <button
                onClick={() => setEditProp(propiedad)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-surface-low text-outline-variant hover:text-on-surface transition-colors"
              >
                <Edit2 size={15} />
              </button>
              <button
                onClick={() => setConfirmDelete({ type: 'prop', id: propiedad.id })}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-error-container text-error transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <Badge
              label={ESTADO_LABELS[propiedad.estado]}
              variant={ESTADO_BADGE_VARIANT[propiedad.estado]}
            />
            <Badge label={TIPO_LABELS[propiedad.tipo]} />
            {propiedad.propietarioNombre ? (
              <Badge label={`De ${propiedad.propietarioNombre}`} variant="warning" />
            ) : (
              propiedad.porcentajePropiedad != null &&
              propiedad.porcentajePropiedad < 100 && (
                <Badge label={`${propiedad.porcentajePropiedad}% tuyo`} />
              )
            )}
            {rentaSinCobrarDetalle && (
              <Badge label="Renta sin cobrar este mes" variant="warning" />
            )}
            {tareasVencidas > 0 && (
              <Badge
                label={`${tareasVencidas} tarea${tareasVencidas === 1 ? '' : 's'} vencida${tareasVencidas === 1 ? '' : 's'}`}
                variant="error"
              />
            )}
          </div>
        </div>

        {/* Inquilino info */}
        {propiedad.estado === 'alquilado' && propiedad.inquilinoNombre && (
          <div className="px-5 mb-4">
            <div
              className={`rounded-xl p-4 flex flex-col gap-1 ${
                contratoAlerta ? 'bg-warning-container' : 'bg-surface-low'
              }`}
            >
              <div className="flex items-center gap-2">
                <User size={14} className="text-outline-variant" />
                <span className="text-sm font-medium text-on-surface">
                  {propiedad.inquilinoNombre}
                </span>
                {propiedad.alquilerMensual && (
                  <span className="text-xs text-success font-medium ml-auto">
                    {fmt(propiedad.alquilerMensual)} €/mes
                  </span>
                )}
              </div>
              {propiedad.contratoFin && estadoContrato && (
                <div className="flex items-center gap-1.5">
                  {contratoAlerta && <AlertTriangle size={12} className="text-warning" />}
                  <span
                    className={`text-xs ${
                      contratoAlerta ? 'text-warning font-medium' : 'text-outline-variant'
                    }`}
                  >
                    Contrato hasta{' '}
                    {format(parseISO(propiedad.contratoFin), 'd MMM yyyy', { locale: es })}
                    {estadoContrato.vencido
                      ? ' — en tácita reconducción'
                      : contratoAlerta
                        ? ` — vence en ${estadoContrato.dias} días`
                        : ''}
                  </span>
                </div>
              )}
              {(propiedad.inquilinoDni || propiedad.inquilinoTelefono || propiedad.inquilinoEmail) && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-outline-variant">
                  {propiedad.inquilinoDni && <span>{propiedad.inquilinoDni}</span>}
                  {propiedad.inquilinoTelefono && <span>{propiedad.inquilinoTelefono}</span>}
                  {propiedad.inquilinoEmail && <span>{propiedad.inquilinoEmail}</span>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cobro de renta y fin de contrato — acceso rápido */}
        {propiedad.estado === 'alquilado' && (
          <div className="px-5 mb-4 flex gap-2">
            {propiedad.alquilerMensual && (
              <div className="flex-1">
                <CobroRenta propiedad={propiedad} />
              </div>
            )}
            <div className="flex-1">
              <TerminarContrato propiedad={propiedad} />
            </div>
          </div>
        )}

        {/* Iniciar nuevo alquiler — propiedades vacías que ya tuvieron
            inquilino este año */}
        {propiedad.estado === 'vacio' &&
          propiedad.historialContratos?.some((c) => c.fechaFin.startsWith(currentYearStr)) && (
            <div className="px-5 mb-4">
              <button
                onClick={() =>
                  setEditProp({
                    ...propiedad,
                    estado: 'alquilado',
                    inquilinoNombre: undefined,
                    inquilinoEmail: undefined,
                    inquilinoTelefono: undefined,
                    inquilinoDni: undefined,
                    alquilerMensual: undefined,
                    contratoInicio: undefined,
                    contratoFin: undefined,
                  })
                }
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary-container text-primary text-sm font-semibold hover:brightness-95 transition-all"
              >
                <UserPlus size={16} />
                Iniciar nuevo alquiler
              </button>
            </div>
          )}

        {/* Gastos de suministros — acceso rápido, para cualquier propiedad */}
        <div className="px-5 mb-4">
          <GastoSuministro propiedad={propiedad} />
        </div>

        {/* Contrato de alquiler */}
        {propiedad.estado === 'alquilado' && (
          <div className="px-5 mb-4">
            <ContratoAlquiler propiedad={propiedad} />
          </div>
        )}

        {/* Historial de alquileres anteriores */}
        {propiedad.historialContratos && propiedad.historialContratos.length > 0 && (
          <div className="px-5 mb-4">
            <HistorialAlquileres propiedad={propiedad} />
          </div>
        )}

        {/* Notas */}
        {propiedad.notas && (
          <div className="px-5 mb-4">
            <p className="text-xs text-outline-variant bg-surface-low rounded-xl px-4 py-3">
              {propiedad.notas}
            </p>
          </div>
        )}

        {/* Tareas */}
        <div className="px-5 mb-5">
          <TareasPropiedad propiedad={propiedad} />
        </div>

        {/* Month selector */}
        <div className="px-5 overflow-x-auto scrollbar-none mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilterMes('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterMes === '' ? 'bg-on-surface text-surface' : 'bg-surface-low text-outline-variant'
              }`}
            >
              Todo
            </button>
            {meses.slice(0, 18).map((m) => (
              <button
                key={m}
                onClick={() => setFilterMes(m)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${
                  filterMes === m ? 'bg-on-surface text-surface' : 'bg-surface-low text-outline-variant'
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
                <p className="text-lg font-bold text-success tabular-nums">+{fmt(ingresos)} €</p>
              </div>
              <div className="w-px bg-surface-high" />
              <div className="flex-1 text-center">
                <p className="text-xs text-outline-variant mb-0.5">Gastos</p>
                <p className="text-lg font-bold text-on-surface tabular-nums">-{fmt(gastos)} €</p>
              </div>
              <div className="w-px bg-surface-high" />
              <div className="flex-1 text-center">
                <p className="text-xs text-outline-variant mb-0.5">Balance</p>
                <p className={`text-lg font-bold tabular-nums ${ingresos - gastos >= 0 ? 'text-success' : 'text-error'}`}>
                  {ingresos - gastos >= 0 ? '+' : ''}{fmt(ingresos - gastos)} €
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Rentabilidad */}
        {(rentabilidadMercado || rentabilidadReferencia) && (
          <div className="px-5 mb-5">
            <div className="bg-surface-lowest rounded-2xl shadow-soft p-4">
              <p className="text-xs font-medium text-outline-variant uppercase tracking-wide mb-3">
                Rentabilidad {currentYearStr}
              </p>
              <div className="flex flex-col gap-2">
                {rentabilidadMercado && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-outline-variant">Sobre valor de mercado</span>
                    <span className="tabular-nums text-on-surface">
                      {rentabilidadMercado.bruta.toFixed(2)}% bruta ·{' '}
                      <span className={rentabilidadMercado.neta >= 0 ? 'text-success' : 'text-error'}>
                        {rentabilidadMercado.neta.toFixed(2)}% neta
                      </span>
                    </span>
                  </div>
                )}
                {rentabilidadReferencia && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-outline-variant">Sobre valor de referencia</span>
                    <span className="tabular-nums text-on-surface">
                      {rentabilidadReferencia.bruta.toFixed(2)}% bruta ·{' '}
                      <span className={rentabilidadReferencia.neta >= 0 ? 'text-success' : 'text-error'}>
                        {rentabilidadReferencia.neta.toFixed(2)}% neta
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Valoración: ¿es suficiente la rentabilidad? */}
        {valoracion && valoracion.veredicto !== 'sin_datos' && (
          <div className="px-5 mb-5">
            <div
              className={`rounded-2xl shadow-soft p-4 ${
                valoracion.veredicto === 'buena' ? 'bg-success-container/40' : 'bg-warning-container/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
                  Valoración
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-outline-variant">Umbral neta</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={umbralNetaStr}
                    onChange={(e) => handleUmbralChange(e.target.value)}
                    className="w-10 bg-surface-lowest border-0 rounded-md px-1 py-0.5 text-xs text-on-surface text-center focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="text-xs text-outline-variant">%</span>
                </div>
              </div>
              <p
                className={`text-sm font-medium ${
                  valoracion.veredicto === 'buena' ? 'text-success' : 'text-warning'
                }`}
              >
                {valoracion.mensaje}
              </p>
              {valoracion.esEstimacion && (
                <p className="text-xs text-outline-variant mt-2">
                  Estimación: solo tienes {valoracion.mesesConDatos}{' '}
                  {valoracion.mesesConDatos === 1 ? 'mes' : 'meses'} de datos, así que se ha
                  extrapolado la media mensual a un año completo — no es un dato real todavía.
                </p>
              )}
              <p className="text-xs text-outline-variant mt-2">
                Orientativo, no es asesoramiento financiero.
              </p>
            </div>
          </div>
        )}

        {/* Transactions grouped by month */}
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
                      {items.map((tx) => (
                        <TransactionItem
                          key={tx.id}
                          tx={tx}
                          propiedad={propiedad}
                          onDelete={(id) => setConfirmDelete({ type: 'tx', id })}
                          onDuplicate={(t) => {
                            setDuplicateTx(t)
                            setShowAddTx(true)
                          }}
                          onOpenFile={(id) =>
                            window.open(`https://drive.google.com/file/d/${id}/view`, '_blank')
                          }
                          onFactura={(t) => setFacturaTxId(t.id)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
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

        {/* Bottom sheets */}
        <BottomSheet
          open={showAddTx}
          onClose={() => {
            setShowAddTx(false)
            setDuplicateTx(null)
          }}
          title={duplicateTx ? 'Duplicar movimiento' : 'Nueva transacción'}
        >
          <TransactionForm
            propiedades={propiedades}
            defaultPropiedadId={propiedad.id}
            initial={duplicateTx ?? undefined}
            onSave={async (t) => {
              await addTx(t)
              setShowAddTx(false)
              setDuplicateTx(null)
            }}
            onCancel={() => {
              setShowAddTx(false)
              setDuplicateTx(null)
            }}
          />
        </BottomSheet>

        <BottomSheet open={!!editProp} onClose={() => setEditProp(null)} title="Editar propiedad">
          <PropiedadForm
            initial={editProp ?? undefined}
            onSave={async (p) => { await updateProp(p); setEditProp(null) }}
            onCancel={() => setEditProp(null)}
          />
        </BottomSheet>

        <BottomSheet open={showFiscal} onClose={() => setShowFiscal(false)} title="Resumen fiscal">
          <FiscalSummary txs={txs} propiedad={propiedad} />
        </BottomSheet>

        <ConfirmDialog
          open={confirmDelete?.type === 'prop'}
          title={`Eliminar "${propiedad.nombre}"`}
          message="Se borrarán también todas sus transacciones. Esta acción no se puede deshacer."
          confirmLabel="Eliminar propiedad"
          onConfirm={async () => {
            await deleteProp(propiedad.id)
            setConfirmDelete(null)
            onSelectId(undefined)
          }}
          onCancel={() => setConfirmDelete(null)}
        />

        <ConfirmDialog
          open={confirmDelete?.type === 'tx'}
          title="Eliminar transacción"
          message="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          onConfirm={async () => {
            if (confirmDelete) await deleteTx(confirmDelete.id)
            setConfirmDelete(null)
          }}
          onCancel={() => setConfirmDelete(null)}
        />

        {facturaTxId &&
          (() => {
            const facturaTx = transacciones.find((t) => t.id === facturaTxId)
            return facturaTx ? (
              <FacturaAlquiler tx={facturaTx} propiedad={propiedad} onClose={() => setFacturaTxId(null)} />
            ) : null
          })()}
      </div>
    )
  }

  // ── Properties list ────────────────────────────────────────────────────────
  const currentAnio = new Date().getFullYear().toString()

  const propiedadesAlquiler = propiedades.filter(esDeAlquiler)
  const propiedadesPropias = propiedades.filter((p) => !esDeAlquiler(p))
  const gastosAnioPropias = propiedadesPropias.filter(esDeJose).reduce((total, p) => {
    const gastos = transacciones
      .filter((t) => t.propiedadId === p.id && t.fecha.startsWith(currentAnio) && t.tipo === 'gasto')
      .reduce((s, t) => s + miParte(t.importe, p), 0)
    return total + gastos
  }, 0)

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
            <p className="text-sm text-outline-variant">Aún no tienes propiedades registradas.</p>
            <Button onClick={() => setShowAddProp(true)}>
              <Plus size={14} />
              Añadir primera propiedad
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <div>
              {propiedadesPropias.length > 0 && (
                <p className="text-xs font-medium text-outline-variant uppercase tracking-wide mb-3">
                  En alquiler / gestión
                </p>
              )}
              {propiedadesAlquiler.length === 0 ? (
                <p className="text-sm text-outline-variant py-2">Ninguna todavía.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {propiedadesAlquiler.map((p) => (
                    <PropiedadCard
                      key={p.id}
                      propiedad={p}
                      transacciones={transacciones}
                      tareas={tareas}
                      currentAnio={currentAnio}
                      onSelect={() => onSelectId(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {propiedadesPropias.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
                    A tu disposición / vivienda habitual
                  </p>
                  {gastosAnioPropias > 0 && (
                    <span className="text-xs text-outline-variant">
                      Gastos {currentAnio}:{' '}
                      <span className="font-medium text-on-surface">{fmt(gastosAnioPropias)} €</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-outline-variant mb-3">
                  No cuentan en tus totales de rendimiento de alquiler (Dashboard/Fiscal) — es tu contabilidad
                  aparte, solo de gasto.
                </p>
                <div className="flex flex-col gap-3">
                  {propiedadesPropias.map((p) => (
                    <PropiedadCard
                      key={p.id}
                      propiedad={p}
                      transacciones={transacciones}
                      tareas={tareas}
                      currentAnio={currentAnio}
                      onSelect={() => onSelectId(p.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <BottomSheet open={showAddProp} onClose={() => setShowAddProp(false)} title="Nueva propiedad">
        <PropiedadForm
          onSave={async (p) => { await addProp(p); setShowAddProp(false) }}
          onCancel={() => setShowAddProp(false)}
        />
      </BottomSheet>
    </div>
  )
}
