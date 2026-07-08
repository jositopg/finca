import { miParte, type Propiedad, type Transaccion } from '../types'

const CHART_HEIGHT = 140

function fmt(n: number) {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}

interface Props {
  propiedades: Propiedad[]
  transacciones: Transaccion[]
}

export function EvolucionAnual({ propiedades, transacciones }: Props) {
  const porAnio = new Map<string, number>()
  for (const t of transacciones) {
    const anio = t.fecha.slice(0, 4)
    const p = propiedades.find((pr) => pr.id === t.propiedadId)
    const importe = p ? miParte(t.importe, p) : t.importe
    const delta = t.tipo === 'ingreso' ? importe : -importe
    porAnio.set(anio, (porAnio.get(anio) ?? 0) + delta)
  }

  const anios = [...porAnio.keys()].sort()
  if (anios.length < 2) return null

  const valores = anios.map((a) => porAnio.get(a)!)
  const maxPos = Math.max(0, ...valores)
  const maxNeg = Math.max(0, ...valores.map((v) => -v))
  const totalRange = maxPos + maxNeg || 1
  const topH = (maxPos / totalRange) * CHART_HEIGHT
  const bottomH = CHART_HEIGHT - topH

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
        Evolución del rendimiento neto por año (tu parte)
      </p>
      <div className="bg-surface-lowest rounded-2xl shadow-soft p-4">
        <div className="flex items-stretch gap-4" style={{ height: CHART_HEIGHT }}>
          {anios.map((anio) => {
            const valor = porAnio.get(anio)!
            const positivo = valor >= 0
            const barH = positivo
              ? maxPos > 0
                ? (valor / maxPos) * topH
                : 0
              : maxNeg > 0
                ? (-valor / maxNeg) * bottomH
                : 0

            return (
              <div key={anio} className="flex-1 flex flex-col items-center min-w-0">
                <div className="w-full flex flex-col justify-end" style={{ height: topH }}>
                  {positivo && barH > 0 && (
                    <div
                      className="w-full rounded-t-md bg-success"
                      style={{ height: Math.max(barH, 3) }}
                      title={`${fmt(valor)} €`}
                    />
                  )}
                </div>
                <div className="w-full border-t border-surface-high" />
                <div className="w-full" style={{ height: bottomH }}>
                  {!positivo && barH > 0 && (
                    <div
                      className="w-full rounded-b-md bg-error"
                      style={{ height: Math.max(barH, 3) }}
                      title={`${fmt(valor)} €`}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 mt-2">
          {anios.map((anio) => {
            const valor = porAnio.get(anio)!
            return (
              <div key={anio} className="flex-1 flex flex-col items-center min-w-0">
                <span className="text-xs text-outline-variant">{anio}</span>
                <span
                  className={`text-xs font-medium tabular-nums ${
                    valor >= 0 ? 'text-success' : 'text-error'
                  }`}
                >
                  {valor >= 0 ? '+' : ''}
                  {fmt(valor)} €
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
