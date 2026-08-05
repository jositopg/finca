import { BarChart2 } from 'lucide-react'
import { valorarPropiedad, type Propiedad, type Transaccion, type ValoracionPropiedad } from '../types'

function fmt(n: number) {
  return n.toFixed(2)
}

interface Props {
  propiedades: Propiedad[]
  transacciones: Transaccion[]
  onSelectPropiedad: (propiedadId: string) => void
}

const VEREDICTO_CLASSES: Record<ValoracionPropiedad['veredicto'], string> = {
  buena: 'text-success',
  insuficiente: 'text-warning',
  gastos_altos: 'text-error',
  sin_datos: 'text-outline-variant',
}

// Compara la rentabilidad neta de todas las propiedades (mismo cálculo y
// mismo umbral que la tarjeta "Valoración" de cada ficha) para ver de un
// vistazo dónde conviene invertir o qué propiedad valorar vender — solo
// entran las que tienen un valor de mercado o de referencia configurado.
export function RankingRentabilidad({ propiedades, transacciones, onSelectPropiedad }: Props) {
  const umbralNetaStr = localStorage.getItem('finca_umbral_rentabilidad') ?? '4'
  const umbralNeta = Number(umbralNetaStr.replace(',', '.'))

  const filas = propiedades
    .map((p) => ({ propiedad: p, valoracion: valorarPropiedad(p, transacciones, umbralNeta) }))
    .filter(
      (f): f is { propiedad: Propiedad; valoracion: ValoracionPropiedad } =>
        !!f.valoracion && f.valoracion.veredicto !== 'sin_datos',
    )
    .sort((a, b) => b.valoracion.rentabilidadNeta - a.valoracion.rentabilidadNeta)

  if (filas.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-outline-variant uppercase tracking-wide flex items-center gap-1.5">
        <BarChart2 size={14} />
        Ranking de rentabilidad
      </p>
      <div className="bg-surface-lowest rounded-2xl shadow-soft divide-y divide-surface-high">
        {filas.map(({ propiedad, valoracion }) => (
          <button
            key={propiedad.id}
            onClick={() => onSelectPropiedad(propiedad.id)}
            className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-surface-low transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm text-on-surface truncate">{propiedad.nombre}</p>
              <p className="text-xs text-outline-variant mt-0.5">
                {valoracion.esEstimacion ? 'Estimado · ' : ''}
                {valoracion.mesesConDatos} {valoracion.mesesConDatos === 1 ? 'mes' : 'meses'} de datos
              </p>
            </div>
            <span
              className={`text-sm font-bold tabular-nums flex-shrink-0 ${VEREDICTO_CLASSES[valoracion.veredicto]}`}
            >
              {fmt(valoracion.rentabilidadNeta)} %
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
