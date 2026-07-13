import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { EstimadorRenta } from '../components/EstimadorRenta'
import { baseDesdeRentaNeta, calcularRentaLocal, esDeAlquiler, esDeJose, miParte } from '../types'

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function trimestreDe(fecha: string): number {
  const mes = parseInt(fecha.slice(5, 7), 10)
  return Math.ceil(mes / 3)
}

export function FiscalView() {
  const { propiedades: todasLasPropiedades, transacciones } = useApp()
  // La Renta, el estimador y el Modelo 420 son fiscalmente de Jose — se
  // excluyen las propiedades que solo gestiona por cuenta de otros, y las
  // de uso propio/vivienda habitual (no generan rendimiento de alquiler).
  const propiedades = todasLasPropiedades.filter((p) => esDeJose(p) && esDeAlquiler(p))

  const years = useMemo(() => {
    const set = new Set(transacciones.map((t) => t.fecha.slice(0, 4)))
    set.add(new Date().getFullYear().toString())
    return [...set].sort().reverse()
  }, [transacciones])

  const [anio, setAnio] = useState(years[0])
  const [trimestre, setTrimestre] = useState(Math.ceil((new Date().getMonth() + 1) / 3))

  const txsAnio = transacciones.filter((t) => t.fecha.startsWith(anio))

  // ── Para la Renta: por propiedad, ya en tu parte ──────────────────────────
  const filasRenta = propiedades.map((p) => {
    const txs = txsAnio.filter((t) => t.propiedadId === p.id)
    const ingresos = txs
      .filter((t) => t.tipo === 'ingreso')
      .reduce((s, t) => s + miParte(t.importe, p), 0)
    const gastos = txs
      .filter((t) => t.tipo === 'gasto')
      .reduce((s, t) => s + miParte(t.importe, p), 0)
    return { propiedad: p, ingresos, gastos, neto: ingresos - gastos }
  })
  const totalIngresos = filasRenta.reduce((s, f) => s + f.ingresos, 0)
  const totalGastos = filasRenta.reduce((s, f) => s + f.gastos, 0)

  // ── Modelo 420 (IGIC trimestral): solo locales, solo renta de alquiler ────
  // El importe guardado en cada transacción es la renta NETA (lo que
  // realmente entra en el banco, ver CobroRenta) — aquí se reconstruye la
  // base imponible a partir de esa neta para poder declarar el trimestre.
  const locales = propiedades.filter((p) => p.tipo === 'local')
  const filasLocales = locales.map((p) => {
    const netaTotal = txsAnio
      .filter(
        (t) =>
          t.propiedadId === p.id &&
          t.tipo === 'ingreso' &&
          t.categoria === 'Alquiler mensual' &&
          trimestreDe(t.fecha) === trimestre,
      )
      .reduce((s, t) => s + miParte(t.importe, p), 0)
    const base = baseDesdeRentaNeta(netaTotal)
    const { igic, irpf } = calcularRentaLocal(base)
    return { propiedad: p, base, igic, irpf, neta: netaTotal }
  })
  const totalBaseTrimestre = filasLocales.reduce((s, f) => s + f.base, 0)
  const totalIgicTrimestre = filasLocales.reduce((s, f) => s + f.igic, 0)
  const totalIrpfTrimestre = filasLocales.reduce((s, f) => s + f.irpf, 0)

  return (
    <div className="flex flex-col pb-24">
      <div className="px-5 pt-12 pb-4">
        <h1 className="font-display text-2xl font-bold text-on-surface mb-1">Fiscal</h1>
        <p className="text-sm text-outline-variant">
          Datos consolidados para ayudarte a rellenar la Renta y el Modelo 420 — no calcula el
          impuesto final, eso lo aplicas tú o tu gestoría.
        </p>
      </div>

      {/* Year selector */}
      <div className="px-5 mb-5">
        <div className="flex gap-2">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setAnio(y)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                anio === y ? 'bg-on-surface text-surface' : 'bg-surface-low text-outline-variant'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Renta */}
      <div className="px-5 mb-7">
        <p className="text-xs font-medium text-outline-variant uppercase tracking-wide mb-3">
          Para la Renta {anio} (tu parte)
        </p>

        {filasRenta.length === 0 ? (
          <p className="text-sm text-outline-variant text-center py-8">Aún no tienes propiedades.</p>
        ) : (
          <div className="bg-surface-lowest rounded-2xl shadow-soft divide-y divide-surface-high">
            {filasRenta.map(({ propiedad, ingresos, gastos, neto }) => (
              <div key={propiedad.id} className="p-4">
                <p className="text-sm font-medium text-on-surface mb-2">{propiedad.nombre}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-success tabular-nums">+{fmt(ingresos)} €</span>
                  <span className="text-outline-variant/40">·</span>
                  <span className="text-on-surface tabular-nums">-{fmt(gastos)} €</span>
                  <span
                    className={`ml-auto font-medium tabular-nums ${
                      neto >= 0 ? 'text-success' : 'text-error'
                    }`}
                  >
                    {neto >= 0 ? '+' : ''}
                    {fmt(neto)} €
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {filasRenta.length > 0 && (
          <div className="flex items-center justify-between bg-surface-low rounded-xl px-4 py-3 mt-2">
            <span className="text-xs text-outline-variant">
              Total ingresos / gastos {anio}
            </span>
            <span className="text-sm font-bold tabular-nums text-on-surface">
              +{fmt(totalIngresos)} € · -{fmt(totalGastos)} €
            </span>
          </div>
        )}
      </div>

      {/* Estimador: cuánto guardar de los alquileres */}
      <div className="px-5 mb-7">
        <EstimadorRenta propiedades={propiedades} transacciones={transacciones} anio={anio} />
      </div>

      {/* Modelo 420 */}
      <div className="px-5">
        <p className="text-xs font-medium text-outline-variant uppercase tracking-wide mb-1">
          Modelo 420 — IGIC trimestral (locales)
        </p>
        <p className="text-xs text-outline-variant mb-3">
          Base imponible, IGIC (7%) e IRPF (19%) de la renta de alquiler de locales del trimestre,
          ya a tu parte — reconstruidos a partir de la renta neta registrada en cada cobro.
        </p>

        <div className="flex gap-2 mb-3">
          {[1, 2, 3, 4].map((q) => (
            <button
              key={q}
              onClick={() => setTrimestre(q)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                trimestre === q ? 'bg-on-surface text-surface' : 'bg-surface-low text-outline-variant'
              }`}
            >
              T{q}
            </button>
          ))}
        </div>

        {locales.length === 0 ? (
          <p className="text-sm text-outline-variant text-center py-8">
            No tienes propiedades de tipo "Local".
          </p>
        ) : (
          <div className="bg-surface-lowest rounded-2xl shadow-soft divide-y divide-surface-high">
            {filasLocales.map(({ propiedad, base, igic, irpf }) => (
              <div key={propiedad.id} className="p-4">
                <p className="text-sm font-medium text-on-surface mb-2">{propiedad.nombre}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-outline-variant">
                    Base <span className="text-on-surface font-medium">{fmt(base)} €</span>
                  </span>
                  <span className="text-outline-variant/40">·</span>
                  <span className="text-success">IGIC +{fmt(igic)} €</span>
                  <span className="text-outline-variant/40">·</span>
                  <span className="text-error">IRPF -{fmt(irpf)} €</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {locales.length > 0 && (
          <div className="flex flex-col gap-1 bg-surface-low rounded-xl px-4 py-3 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-outline-variant">Base imponible T{trimestre} {anio}</span>
              <span className="text-sm font-bold tabular-nums text-primary">
                {fmt(totalBaseTrimestre)} €
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-outline-variant">IGIC repercutido</span>
              <span className="tabular-nums text-success">+{fmt(totalIgicTrimestre)} €</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-outline-variant">IRPF retenido</span>
              <span className="tabular-nums text-error">-{fmt(totalIrpfTrimestre)} €</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
