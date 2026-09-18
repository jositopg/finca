import { Wallet } from 'lucide-react'
import { CobroRenta } from './CobroRenta'
import { alquilerACobrar, rentaDelMesIncompleta, type Propiedad, type Transaccion } from '../types'

interface Props {
  propiedades: Propiedad[]
  transacciones: Transaccion[]
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function CobrosPendientes({ propiedades, transacciones }: Props) {
  const pendientes = propiedades.filter((p) => rentaDelMesIncompleta(p, transacciones))
  if (pendientes.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-outline-variant uppercase tracking-wide flex items-center gap-1.5">
        <Wallet size={14} />
        A cobrar este mes ({pendientes.length})
      </p>
      <div className="bg-surface-lowest rounded-2xl shadow-soft divide-y divide-surface-high">
        {pendientes.map((p) => {
          const esperado = alquilerACobrar(p) ?? 0
          return (
            <div key={p.id} className="p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">{p.nombre}</p>
                  <p className="text-xs text-outline-variant truncate">
                    {p.inquilinoNombre ?? 'Sin nombre'} · {fmt(esperado)} €
                  </p>
                </div>
              </div>
              <CobroRenta
                propiedad={p}
                transacciones={transacciones.filter((t) => t.propiedadId === p.id)}
                triggerLabel="Cobrar"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
