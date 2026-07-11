import { useState } from 'react'
import { Droplet, Zap } from 'lucide-react'
import { format } from 'date-fns'
import { useApp } from '../context/AppContext'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Input } from './Input'
import { calcularReparto, type Propiedad, type Transaccion } from '../types'

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

function parseImporte(s: string): number {
  return parseFloat(s.replace(',', '.')) || 0
}

export function FacturasSuministros({ propiedades, trigger }: Props) {
  const { addTxs } = useApp()
  const [open, setOpen] = useState(false)
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [importes, setImportes] = useState<Record<string, Importes>>({})
  const [saving, setSaving] = useState(false)

  function abrir() {
    setFecha(format(new Date(), 'yyyy-MM-dd'))
    setImportes({})
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
    const aguaImporte = parseImporte(v.agua)
    const luzImporte = parseImporte(v.luz)
    const repartoAgua = aguaImporte > 0 ? calcularReparto('Agua', aguaImporte, p.reparto) : null
    const repartoLuz = luzImporte > 0 ? calcularReparto('Electricidad', luzImporte, p.reparto) : null
    return { propiedad: p, agua: v.agua, luz: v.luz, repartoAgua, repartoLuz }
  })

  const totalFacturas = filas.filter((f) => parseImporte(f.agua) > 0).length + filas.filter((f) => parseImporte(f.luz) > 0).length

  async function handleGuardar() {
    const nuevas: Transaccion[] = []
    for (const p of propiedades) {
      const v = importes[p.id]
      if (!v) continue
      const agua = parseImporte(v.agua)
      const luz = parseImporte(v.luz)
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
            label="Fecha (para todas las facturas)"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />

          <div className="flex flex-col gap-3">
            {filas.map(({ propiedad, agua, luz, repartoAgua, repartoLuz }) => (
              <div key={propiedad.id} className="bg-surface-low rounded-xl p-3">
                <p className="text-sm font-medium text-on-surface truncate mb-2">{propiedad.nombre}</p>
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
                {(repartoAgua?.modo === 'no_incluido' || repartoAgua?.modo === 'parcial') && (
                  <p className="text-xs text-primary mt-1.5">
                    Agua repercutible al inquilino: {fmt(repartoAgua.inquilino)} €
                  </p>
                )}
                {(repartoLuz?.modo === 'no_incluido' || repartoLuz?.modo === 'parcial') && (
                  <p className="text-xs text-primary mt-1.5">
                    Luz repercutible al inquilino: {fmt(repartoLuz.inquilino)} €
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button fullWidth onClick={handleGuardar} disabled={saving || totalFacturas === 0}>
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
