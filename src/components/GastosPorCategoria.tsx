import { gastosPorCategoriaEnRango, type Propiedad, type Transaccion } from '../types'

function fmt(n: number) {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}

interface Props {
  propiedades: Propiedad[]
  transacciones: Transaccion[]
  desde: string
  hasta: string
  anioLabel: string
}

// Gastos por categoría (comunidad, mantenimiento, seguros...) del año en
// curso, ya a tu parte — para ver de un vistazo en qué se va el dinero, no
// solo el neto agregado. Ranking horizontal con un solo color (magnitud, no
// identidad — el nombre de cada categoría ya la distingue).
export function GastosPorCategoria({ propiedades, transacciones, desde, hasta, anioLabel }: Props) {
  const porCategoria = new Map<string, number>()
  for (const p of propiedades) {
    const porProp = gastosPorCategoriaEnRango(p, transacciones, desde, hasta)
    for (const [cat, importe] of Object.entries(porProp)) {
      porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + importe)
    }
  }

  const filas = [...porCategoria.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  if (filas.length === 0) return null

  const max = filas[0][1]

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
        Gastos por categoría {anioLabel} (tu parte)
      </p>
      <div className="bg-surface-lowest rounded-2xl shadow-soft p-4 flex flex-col gap-3">
        {filas.map(([categoria, importe]) => (
          <div key={categoria} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-on-surface truncate">{categoria}</span>
              <span className="text-outline-variant tabular-nums flex-shrink-0">{fmt(importe)} €</span>
            </div>
            <div className="h-2 rounded-full bg-surface-low overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max((importe / max) * 100, 3)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
