import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Button } from './Button'
import { Input } from './Input'
import { estimarAhorroRenta, parseImporte, type IngresoExterno, type Propiedad, type Transaccion } from '../types'

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function uuid() {
  return crypto.randomUUID()
}

interface Props {
  propiedades: Propiedad[]
  transacciones: Transaccion[]
  anio: string
}

export function EstimadorRenta({ propiedades, transacciones, anio }: Props) {
  const { ingresosExternos, addIngreso, deleteIngreso } = useApp()
  const [reduccionStr, setReduccionStr] = useState('50')
  const [showAdd, setShowAdd] = useState(false)
  const [nombre, setNombre] = useState('')
  const [importeStr, setImporteStr] = useState('')
  const [retencionStr, setRetencionStr] = useState('')
  const [saving, setSaving] = useState(false)

  const reduccionPctParseado = parseImporte(reduccionStr)
  const reduccionPct = Number.isNaN(reduccionPctParseado) ? 0 : reduccionPctParseado
  const estimacion = estimarAhorroRenta(propiedades, transacciones, ingresosExternos, anio, reduccionPct)

  async function handleAddIngreso() {
    if (saving) return
    const importeAnual = parseImporte(importeStr)
    if (!nombre.trim() || !importeStr || Number.isNaN(importeAnual)) return
    const retencionParseada = parseImporte(retencionStr)
    setSaving(true)
    try {
      const i: IngresoExterno = {
        id: uuid(),
        nombre: nombre.trim(),
        importeAnual,
        porcentajeRetencion: Number.isNaN(retencionParseada) ? 0 : retencionParseada,
        creadoEn: new Date().toISOString(),
      }
      await addIngreso(i)
      setNombre('')
      setImporteStr('')
      setRetencionStr('')
      setShowAdd(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium text-outline-variant uppercase tracking-wide mb-1">
          Cuánto deberías tener guardado
        </p>
        <p className="text-xs text-outline-variant">
          Aproximación de la cuota total de IRPF {anio} (nómina/otros ingresos + alquileres, todo
          junto) menos todo lo que ya te han retenido — incluida la retención de tu nómina, no solo
          la de los alquileres. Se calcula con los movimientos y datos que hay en la app en este
          momento, así que se va afinando según registras más — no proyecta el resto del año.
          Aplica los tramos progresivos del IRPF (escala combinada aproximada, puede no coincidir
          exactamente con tu comunidad autónoma) — no sustituye el cálculo real de tu gestoría.
        </p>
      </div>

      {/* Otros ingresos */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-outline-variant uppercase tracking-wide">
            Otros ingresos, aparte de los alquileres
          </span>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1 text-xs text-primary font-medium"
          >
            <Plus size={14} />
            Añadir
          </button>
        </div>

        {ingresosExternos.length === 0 && !showAdd && (
          <p className="text-xs text-outline-variant">
            Añade tu nómina u otros ingresos — se suman a lo que rinden los alquileres para calcular
            en qué tramo de IRPF cae cada euro adicional.
          </p>
        )}

        {ingresosExternos.map((i) => (
          <div
            key={i.id}
            className="flex items-center justify-between bg-surface-low rounded-xl px-4 py-2.5"
          >
            <div>
              <p className="text-sm text-on-surface">{i.nombre}</p>
              <p className="text-xs text-outline-variant">
                {fmt(i.importeAnual)} €/año · {i.porcentajeRetencion}% retenido
              </p>
            </div>
            <button
              onClick={() => deleteIngreso(i.id)}
              className="text-outline-variant hover:text-error flex-shrink-0"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {showAdd && (
          <div className="flex flex-col gap-3 bg-surface-low rounded-xl p-4">
            <Input
              label="Nombre"
              placeholder="Nómina, otro trabajo..."
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  label="Importe anual (€)"
                  type="text"
                  inputMode="decimal"
                  placeholder="24000"
                  value={importeStr}
                  onChange={(e) => setImporteStr(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Input
                  label="% IRPF que te retienen"
                  type="text"
                  inputMode="decimal"
                  placeholder="22"
                  value={retencionStr}
                  onChange={(e) => setRetencionStr(e.target.value)}
                />
              </div>
            </div>
            <Button fullWidth onClick={handleAddIngreso} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar ingreso'}
            </Button>
          </div>
        )}
      </div>

      {/* Reducción vivienda habitual */}
      <Input
        label="% reducción por vivienda habitual del inquilino (50% es lo habitual)"
        type="text"
        inputMode="decimal"
        value={reduccionStr}
        onChange={(e) => setReduccionStr(e.target.value)}
      />

      {/* Resultado */}
      <div className="bg-surface-lowest rounded-2xl shadow-soft p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-outline-variant">Rendimiento neto inmobiliario (ya reducido)</span>
          <span className="tabular-nums text-on-surface">
            {fmt(estimacion.rendimientoInmobiliarioTotal)} €
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-outline-variant">Otros ingresos</span>
          <span className="tabular-nums text-on-surface">{fmt(estimacion.otrosIngresosTotal)} €</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-outline-variant">Base imponible total (suma de todo)</span>
          <span className="tabular-nums text-on-surface">{fmt(estimacion.baseImponibleTotal)} €</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-outline-variant">Tramo marginal alcanzado</span>
          <span className="tabular-nums text-on-surface">{estimacion.tipoMarginalPct}%</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-outline-variant">Cuota total estimada</span>
          <span className="tabular-nums text-on-surface">{fmt(estimacion.cuotaTotal)} €</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-outline-variant">— de la cual, generan los alquileres</span>
          <span className="tabular-nums text-outline-variant">{fmt(estimacion.irpfEstimadoAlquileres)} €</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-outline-variant">Retenido en tu nómina / otros ingresos</span>
          <span className="tabular-nums text-success">-{fmt(estimacion.retencionOtrosIngresos)} €</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-outline-variant">Retenido en origen (locales)</span>
          <span className="tabular-nums text-success">-{fmt(estimacion.retencionLocales)} €</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-outline-variant font-medium">Total ya retenido</span>
          <span className="tabular-nums text-success font-medium">-{fmt(estimacion.totalRetenido)} €</span>
        </div>
        <div className="flex items-center justify-between border-t border-surface-high pt-2 mt-1">
          <span className="text-sm font-medium text-on-surface">Deberías tener guardado</span>
          <span className="text-lg font-bold tabular-nums text-primary">
            {fmt(estimacion.aGuardar)} €
          </span>
        </div>
      </div>
    </div>
  )
}
