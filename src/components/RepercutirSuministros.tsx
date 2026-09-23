import { Droplet, Zap } from 'lucide-react'
import { filasRepercutibles, type Propiedad, type Transaccion } from '../types'

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

export function RepercutirSuministrosFicha({
  propiedad,
  transacciones,
  desde,
  hasta,
  etiqueta,
}: {
  propiedad: Propiedad
  transacciones: Transaccion[]
  desde: string
  hasta: string
  etiqueta: string
}) {
  const filas = filasRepercutibles([propiedad], transacciones, desde, hasta)
  const f = filas[0]
  if (!f) return null

  return (
    <div className="px-5 mb-5">
    <div className="bg-surface-lowest rounded-2xl shadow-soft p-4">
      <p className="text-xs font-medium text-outline-variant uppercase tracking-wide mb-3">
        A repercutir agua y luz {etiqueta}
      </p>
      <div className="flex gap-3">
        <div className="flex-1">
          <p className="text-xs text-outline-variant mb-0.5 flex items-center gap-1">
            <Droplet size={11} />
            Agua
          </p>
          <p className="text-sm font-bold text-on-surface tabular-nums">{fmt(f.agua)} €</p>
        </div>
        <div className="flex-1">
          <p className="text-xs text-outline-variant mb-0.5 flex items-center gap-1">
            <Zap size={11} />
            Luz
          </p>
          <p className="text-sm font-bold text-on-surface tabular-nums">{fmt(f.luz)} €</p>
        </div>
        <div className="flex-1">
          <p className="text-xs text-outline-variant mb-0.5">Total</p>
          <p className="text-sm font-bold text-primary tabular-nums">{fmt(f.total)} €</p>
        </div>
      </div>
    </div>
    </div>
  )
}
