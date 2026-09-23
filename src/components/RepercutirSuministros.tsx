import { useState, type MouseEvent } from 'react'
import { ChevronDown, Copy, Droplet, Zap } from 'lucide-react'
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

function textoResumenTotal(
  inquilinoNombre: string | undefined,
  agua: number,
  luz: number,
  total: number,
) {
  const quien = inquilinoNombre ? `${inquilinoNombre}\n` : ''
  const partes = [
    agua > 0.005 ? `Agua: ${fmt(agua)} €` : '',
    luz > 0.005 ? `Luz: ${fmt(luz)} €` : '',
  ].filter(Boolean)
  return `${quien}Agua y luz a repercutir\n${partes.join('\n')}${partes.length ? '\n' : ''}Total: ${fmt(total)} €`
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
  const [abierto, setAbierto] = useState(false)
  if (!contratoRepercuteSuministros(propiedad.reparto)) return null

  const [desde12, hasta12] = rangoUltimos12Meses()
  const anio = new Date().getFullYear().toString()
  const mesActual = `${anio}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const meses = desgloseSuministrosPorMes(propiedad, transacciones, desde12, hasta12)
  const esteMes = desgloseRepercutible(propiedad, transacciones, ...rangoMes(mesActual))
  const esteAnio = desgloseRepercutible(propiedad, transacciones, ...rangoAnio(anio))
  const inclusion = inclusionAguaLuz(propiedad.reparto)
  const hayTotal = esteAnio.total > 0.005

  async function copiarResumen(e: MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(
        textoResumenTotal(propiedad.inquilinoNombre, esteAnio.agua, esteAnio.luz, esteAnio.total),
      )
      showToast('Copiado el resumen para repercutir', 'success')
    } catch {
      showToast('No se pudo copiar')
    }
  }

  return (
    <div className="px-5 mb-5">
      <div className="bg-surface-lowest rounded-2xl shadow-soft">
        <div className="flex items-center gap-1 pr-1">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="flex-1 min-w-0 text-left px-4 py-3 flex items-center gap-3"
            aria-expanded={abierto}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
                A repercutir agua y luz
              </p>
              <p className="text-sm font-bold text-primary tabular-nums mt-0.5">
                {fmt(esteAnio.total)} € este año
                <span className="text-xs font-medium text-outline-variant">
                  {' '}
                  · {fmt(esteMes.total)} € este mes
                </span>
              </p>
            </div>
            <ChevronDown
              size={18}
              className={`text-outline-variant flex-shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}
            />
          </button>
          {hayTotal && (
            <button
              type="button"
              onClick={copiarResumen}
              title="Copiar resumen total"
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg text-outline-variant hover:text-primary hover:bg-primary-container transition-colors"
            >
              <Copy size={15} />
            </button>
          )}
        </div>

        {abierto && (
          <div className="px-4 pb-4 flex flex-col gap-3 border-t border-surface-high pt-3">
            <p className="text-xs text-outline-variant">
              {inclusion?.modo === 'parcial_conjunto'
                ? `${inclusion.importeMensual ?? 0} €/mes juntos incluidos en la renta`
                : 'No incluido en la renta'}
              {propiedad.inquilinoNombre ? ` · ${propiedad.inquilinoNombre}` : ''}
            </p>
            {meses.length === 0 ? (
              <p className="text-xs text-outline-variant">
                Aún no hay facturas de agua o luz en los últimos 12 meses.
              </p>
            ) : (
              meses.map((m) => (
                <div key={m.mes} className="bg-surface-low rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface capitalize">{etiquetaMes(m.mes)}</p>
                      <p className="text-xs text-outline-variant mt-0.5">
                        Facturado {fmt(m.facturado)} € · incluido {fmt(m.propietario)} €
                      </p>
                    </div>
                    <span className="text-sm font-bold text-primary tabular-nums flex-shrink-0">
                      {fmt(m.inquilino)} €
                    </span>
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
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
