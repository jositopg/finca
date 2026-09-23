import { Copy, Droplet, Zap } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useToast } from '../context/ToastContext'
import {
  contratoRepercuteSuministros,
  desgloseRepercutible,
  desgloseSuministrosPorMes,
  filasRepercutibles,
  inclusionAguaLuz,
  rangoAnio,
  rangoMes,
  type MesSuministrosDesglose,
  type Propiedad,
  type Transaccion,
} from '../types'

interface Props {
  propiedades: Propiedad[]
  transacciones: Transaccion[]
  desde: string
  hasta: string
  titulo: string
  onSelectPropiedad?: (id: string) => void
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function RepercutirSuministros({
  propiedades,
  transacciones,
  desde,
  hasta,
  titulo,
  onSelectPropiedad,
}: Props) {
  const filas = filasRepercutibles(propiedades, transacciones, desde, hasta)
  if (filas.length === 0) return null
  const total = filas.reduce((s, f) => s + f.total, 0)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-outline-variant uppercase tracking-wide flex items-center gap-1.5">
        <Droplet size={14} />
        {titulo}
      </p>
      <div className="bg-surface-lowest rounded-2xl shadow-soft divide-y divide-surface-high">
        {filas.map(({ propiedad, agua, luz, total: tot }) => {
          const inner = (
            <>
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{propiedad.nombre}</p>
                <p className="text-xs text-outline-variant truncate mt-0.5">
                  {propiedad.inquilinoNombre ?? 'Sin inquilino'}
                  {agua > 0.005 || luz > 0.005 ? (
                    <>
                      {' · '}
                      {agua > 0.005 && (
                        <span>
                          agua {fmt(agua)} €
                          {luz > 0.005 ? ' · ' : ''}
                        </span>
                      )}
                      {luz > 0.005 && <span>luz {fmt(luz)} €</span>}
                    </>
                  ) : (
                    ' · sin facturas en el periodo'
                  )}
                </p>
              </div>
              <span className="text-sm font-bold text-primary tabular-nums flex-shrink-0">
                {fmt(tot)} €
              </span>
            </>
          )
          return onSelectPropiedad ? (
            <button
              key={propiedad.id}
              type="button"
              onClick={() => onSelectPropiedad(propiedad.id)}
              className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-surface-low transition-colors"
            >
              {inner}
            </button>
          ) : (
            <div key={propiedad.id} className="p-3 flex items-center justify-between gap-3">
              {inner}
            </div>
          )
        })}
        {filas.length > 1 && (
          <div className="p-3 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-outline-variant">Total</span>
            <span className="text-sm font-bold text-primary tabular-nums">{fmt(total)} €</span>
          </div>
        )}
      </div>
    </div>
  )
}

function etiquetaMes(mes: string) {
  return format(parseISO(`${mes}-01`), 'MMMM yyyy', { locale: es })
}

function periodoLinea(l: MesSuministrosDesglose['lineas'][number]) {
  if (l.periodoInicio && l.periodoFin) {
    return `${format(parseISO(l.periodoInicio), 'd MMM', { locale: es })}–${format(parseISO(l.periodoFin), 'd MMM', { locale: es })}`
  }
  return format(parseISO(l.fecha), 'd MMM', { locale: es })
}

function textoMes(mes: MesSuministrosDesglose, inquilinoNombre?: string) {
  const lineas = mes.lineas
    .map((l) => `${l.categoria === 'Agua' ? 'Agua' : 'Luz'}: ${fmt(l.facturadoMes)} € → ${fmt(l.inquilino)} €`)
    .join('\n')
  const quien = inquilinoNombre ? `${inquilinoNombre}\n` : ''
  return `${quien}Agua y luz ${etiquetaMes(mes.mes)}\n${lineas}\nA repercutir: ${fmt(mes.inquilino)} €`
}

function rangoUltimos12Meses(hoy: Date = new Date()): [string, string] {
  const hastaMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const desdeDate = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)
  const desdeMes = `${desdeDate.getFullYear()}-${String(desdeDate.getMonth() + 1).padStart(2, '0')}`
  return [rangoMes(desdeMes)[0], rangoMes(hastaMes)[1]]
}

export function RepercutirSuministrosFicha({
  propiedad,
  transacciones,
}: {
  propiedad: Propiedad
  transacciones: Transaccion[]
}) {
  const { showToast } = useToast()
  if (!contratoRepercuteSuministros(propiedad.reparto)) return null

  const [desde12, hasta12] = rangoUltimos12Meses()
  const anio = new Date().getFullYear().toString()
  const mesActual = `${anio}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const meses = desgloseSuministrosPorMes(propiedad, transacciones, desde12, hasta12)
  const esteMes = desgloseRepercutible(propiedad, transacciones, ...rangoMes(mesActual))
  const esteAnio = desgloseRepercutible(propiedad, transacciones, ...rangoAnio(anio))
  const inclusion = inclusionAguaLuz(propiedad.reparto)

  async function copiar(mes: MesSuministrosDesglose) {
    try {
      await navigator.clipboard.writeText(textoMes(mes, propiedad.inquilinoNombre))
      showToast('Copiado para repercutir', 'success')
    } catch {
      showToast('No se pudo copiar')
    }
  }

  return (
    <div className="px-5 mb-5">
      <div className="bg-surface-lowest rounded-2xl shadow-soft p-4 flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
            A repercutir agua y luz
          </p>
          <p className="text-xs text-outline-variant mt-0.5">
            {inclusion?.modo === 'parcial_conjunto'
              ? `${inclusion.importeMensual ?? 0} €/mes juntos incluidos en la renta`
              : 'No incluido en la renta'}
            {propiedad.inquilinoNombre ? ` · ${propiedad.inquilinoNombre}` : ''}
          </p>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-xs text-outline-variant mb-0.5">Este mes</p>
            <p className="text-sm font-bold text-primary tabular-nums">{fmt(esteMes.total)} €</p>
            {(esteMes.agua > 0.005 || esteMes.luz > 0.005) && (
              <p className="text-xs text-outline-variant mt-0.5">
                {esteMes.agua > 0.005 ? `agua ${fmt(esteMes.agua)} €` : ''}
                {esteMes.agua > 0.005 && esteMes.luz > 0.005 ? ' · ' : ''}
                {esteMes.luz > 0.005 ? `luz ${fmt(esteMes.luz)} €` : ''}
              </p>
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs text-outline-variant mb-0.5">Este año</p>
            <p className="text-sm font-bold text-on-surface tabular-nums">{fmt(esteAnio.total)} €</p>
            {(esteAnio.agua > 0.005 || esteAnio.luz > 0.005) && (
              <p className="text-xs text-outline-variant mt-0.5">
                {esteAnio.agua > 0.005 ? `agua ${fmt(esteAnio.agua)} €` : ''}
                {esteAnio.agua > 0.005 && esteAnio.luz > 0.005 ? ' · ' : ''}
                {esteAnio.luz > 0.005 ? `luz ${fmt(esteAnio.luz)} €` : ''}
              </p>
            )}
          </div>
        </div>

        {meses.length === 0 ? (
          <p className="text-xs text-outline-variant">
            Aún no hay facturas de agua o luz en los últimos 12 meses.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {meses.map((m) => (
              <div key={m.mes} className="bg-surface-low rounded-xl p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface capitalize">{etiquetaMes(m.mes)}</p>
                    <p className="text-xs text-outline-variant mt-0.5">
                      Facturado {fmt(m.facturado)} € · incluido {fmt(m.propietario)} €
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-sm font-bold text-primary tabular-nums">{fmt(m.inquilino)} €</span>
                    {m.inquilino > 0.005 && (
                      <button
                        type="button"
                        onClick={() => copiar(m)}
                        title="Copiar desglose para el inquilino"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-outline-variant hover:text-primary hover:bg-primary-container transition-colors"
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {m.lineas.map((l) => (
                    <div key={`${l.txId}-${m.mes}`} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-on-surface flex items-center gap-1.5 min-w-0">
                        {l.categoria === 'Agua' ? (
                          <Droplet size={12} className="text-outline-variant flex-shrink-0" />
                        ) : (
                          <Zap size={12} className="text-outline-variant flex-shrink-0" />
                        )}
                        <span className="truncate">
                          {l.categoria === 'Agua' ? 'Agua' : 'Luz'} {fmt(l.facturadoMes)} €
                          <span className="text-outline-variant"> · {periodoLinea(l)}</span>
                        </span>
                      </span>
                      <span className="tabular-nums text-primary flex-shrink-0">{fmt(l.inquilino)} €</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
