import { useState } from 'react'
import { Droplet, Zap } from 'lucide-react'
import { format } from 'date-fns'
import { useApp } from '../context/AppContext'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Input } from './Input'
import { cuotaSuministro, inclusionAguaLuz, parseImporte, type Propiedad, type Transaccion } from '../types'

interface Props {
  propiedades: Propiedad[]
  trigger?: (open: () => void) => React.ReactNode
}

interface Importes {
  agua: string
  luz: string
}

function uuid() {
  return crypto.randomUUID()
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function importeOCero(s: string): number {
  const n = parseImporte(s)
  return Number.isNaN(n) ? 0 : n
}

export function FacturasSuministros({ propiedades, trigger }: Props) {
  const { addTxs, transacciones } = useApp()
  const [open, setOpen] = useState(false)
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [importes, setImportes] = useState<Record<string, Importes>>({})
  const [mostrarPeriodo, setMostrarPeriodo] = useState(false)
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFin, setPeriodoFin] = useState('')
  const [saving, setSaving] = useState(false)

  const periodoValido = !mostrarPeriodo || (!!periodoInicio && !!periodoFin && periodoInicio <= periodoFin)

  function abrir() {
    setFecha(format(new Date(), 'yyyy-MM-dd'))
    setImportes({})
    setMostrarPeriodo(false)
    setPeriodoInicio('')
    setPeriodoFin('')
    setOpen(true)
  }

  function setImporte(propiedadId: string, campo: keyof Importes, value: string) {
    setImportes((prev) => {
      const actual = prev[propiedadId] ?? { agua: '', luz: '' }
      return { ...prev, [propiedadId]: { ...actual, [campo]: value } }
    })
  }

  const filas = propiedades.map((p) => {
    const v = importes[p.id] ?? { agua: '', luz: '' }
    const aguaImporte = importeOCero(v.agua)
    const luzImporte = importeOCero(v.luz)
    const periodo =
      mostrarPeriodo && periodoInicio && periodoFin
        ? { periodoInicio, periodoFin }
        : { periodoInicio: undefined, periodoFin: undefined }
    const borradores: Transaccion[] = []
    if (aguaImporte > 0) {
      borradores.push({
        id: '__draft-agua',
        propiedadId: p.id,
        fecha,
        tipo: 'gasto',
        importe: aguaImporte,
        categoria: 'Agua',
        descripcion: '',
        archivos: [],
        creadoEn: '',
        ...periodo,
      })
    }
    if (luzImporte > 0) {
      borradores.push({
        id: '__draft-luz',
        propiedadId: p.id,
        fecha,
        tipo: 'gasto',
        importe: luzImporte,
        categoria: 'Electricidad',
        descripcion: '',
        archivos: [],
        creadoEn: '',
        ...periodo,
      })
    }
    const txs = [...transacciones.filter((t) => t.propiedadId === p.id), ...borradores]
    const repartoAgua = aguaImporte > 0 ? cuotaSuministro(borradores.find((b) => b.categoria === 'Agua')!, p, txs) : null
    const repartoLuz =
      luzImporte > 0 ? cuotaSuministro(borradores.find((b) => b.categoria === 'Electricidad')!, p, txs) : null
    return { propiedad: p, agua: v.agua, luz: v.luz, repartoAgua, repartoLuz }
  })

  const totalFacturas = filas.filter((f) => importeOCero(f.agua) > 0).length + filas.filter((f) => importeOCero(f.luz) > 0).length

  async function handleGuardar() {
    if (saving || !periodoValido) return
    const periodo =
      mostrarPeriodo && periodoInicio && periodoFin
        ? { periodoInicio, periodoFin }
        : { periodoInicio: undefined, periodoFin: undefined }
    const nuevas: Transaccion[] = []
    for (const p of propiedades) {
      const v = importes[p.id]
      if (!v) continue
      const agua = importeOCero(v.agua)
      const luz = importeOCero(v.luz)
      if (agua > 0) {
        nuevas.push({
          id: uuid(),
          propiedadId: p.id,
          fecha,
          tipo: 'gasto',
          importe: agua,
          categoria: 'Agua',
          descripcion: '',
          archivos: [],
          creadoEn: new Date().toISOString(),
          ...periodo,
        })
      }
      if (luz > 0) {
        nuevas.push({
          id: uuid(),
          propiedadId: p.id,
          fecha,
          tipo: 'gasto',
          importe: luz,
          categoria: 'Electricidad',
          descripcion: '',
          archivos: [],
          creadoEn: new Date().toISOString(),
          ...periodo,
        })
      }
    }
    if (nuevas.length === 0) return
    setSaving(true)
    try {
      await addTxs(nuevas)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {trigger ? (
        trigger(abrir)
      ) : (
        <Button variant="secondary" size="sm" onClick={abrir}>
          <Droplet size={14} />
          Facturas
        </Button>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Facturas de agua y luz">
        <div className="flex flex-col gap-5 pb-4">
          <Input
            label="Fecha de pago (para todas las facturas)"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />

          {mostrarPeriodo ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-outline-variant uppercase tracking-wide">
                  Periodo facturado (para todas)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarPeriodo(false)
                    setPeriodoInicio('')
                    setPeriodoFin('')
                  }}
                  className="text-xs text-outline-variant underline"
                >
                  Quitar
                </button>
              </div>
              <div className="flex gap-2">
                <Input
                  label="Desde"
                  type="date"
                  value={periodoInicio}
                  onChange={(e) => setPeriodoInicio(e.target.value)}
                />
                <Input
                  label="Hasta"
                  type="date"
                  value={periodoFin}
                  onChange={(e) => setPeriodoFin(e.target.value)}
                />
              </div>
              {periodoInicio && periodoFin && periodoInicio > periodoFin && (
                <p className="text-xs text-error">El fin del periodo no puede ser anterior al inicio.</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMostrarPeriodo(true)}
              className="text-xs text-primary font-medium text-left"
            >
              + Periodo facturado (si es distinto de la fecha de pago)
            </button>
          )}

          <div className="flex flex-col gap-3">
            {filas.map(({ propiedad, agua, luz, repartoAgua, repartoLuz }) => {
              const inclusion = inclusionAguaLuz(propiedad.reparto)
              return (
              <div key={propiedad.id} className="bg-surface-low rounded-xl p-3">
                <p className="text-sm font-medium text-on-surface truncate mb-1">{propiedad.nombre}</p>
                {inclusion?.modo === 'parcial_conjunto' && (
                  <p className="text-xs text-outline-variant mb-2">
                    Cupo {inclusion.importeMensual ?? 0} €/mes agua+luz juntos — mete cada factura
                    tal cual
                  </p>
                )}
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-surface-lowest rounded-lg px-3 py-2">
                    <Droplet size={14} className="text-outline-variant flex-shrink-0" />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={agua}
                      onChange={(e) => setImporte(propiedad.id, 'agua', e.target.value)}
                      className="w-full bg-transparent text-base text-on-surface placeholder:text-outline-variant focus:outline-none"
                    />
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-surface-lowest rounded-lg px-3 py-2">
                    <Zap size={14} className="text-outline-variant flex-shrink-0" />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={luz}
                      onChange={(e) => setImporte(propiedad.id, 'luz', e.target.value)}
                      className="w-full bg-transparent text-base text-on-surface placeholder:text-outline-variant focus:outline-none"
                    />
                  </div>
                </div>
                {(repartoAgua?.inquilino ?? 0) + (repartoLuz?.inquilino ?? 0) > 0.005 && (
                  <p className="text-xs text-primary mt-1.5">
                    A repercutir al inquilino:{' '}
                    {fmt((repartoAgua?.inquilino ?? 0) + (repartoLuz?.inquilino ?? 0))} €
                    {(repartoAgua?.propietario ?? 0) + (repartoLuz?.propietario ?? 0) > 0.005
                      ? ` · gasto tuyo ${fmt((repartoAgua?.propietario ?? 0) + (repartoLuz?.propietario ?? 0))} €`
                      : ' · no cuenta como gasto'}
                  </p>
                )}
              </div>
              )
            })}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button fullWidth onClick={handleGuardar} disabled={saving || totalFacturas === 0 || !periodoValido}>
              {saving
                ? 'Guardando...'
                : totalFacturas === 0
                  ? 'Guardar'
                  : `Guardar ${totalFacturas} ${totalFacturas === 1 ? 'factura' : 'facturas'}`}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
