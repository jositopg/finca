import { useState } from 'react'
import { Droplet, Zap } from 'lucide-react'
import { format } from 'date-fns'
import { useApp } from '../context/AppContext'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Input } from './Input'
import { calcularReparto, parseImporte, type Propiedad, type Transaccion } from '../types'

interface Props {
  propiedad: Propiedad
}

type CategoriaSuministro = 'Agua' | 'Electricidad'

function uuid() {
  return crypto.randomUUID()
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function GastoSuministro({ propiedad }: Props) {
  const { addTx } = useApp()
  const [categoria, setCategoria] = useState<CategoriaSuministro | null>(null)
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [importeStr, setImporteStr] = useState('')
  const [saving, setSaving] = useState(false)

  const importeParseado = parseImporte(importeStr)
  const importe = Number.isNaN(importeParseado) ? 0 : importeParseado
  const reparto = categoria ? calcularReparto(categoria, importe, propiedad.reparto) : null

  function abrir(cat: CategoriaSuministro) {
    setCategoria(cat)
    setFecha(format(new Date(), 'yyyy-MM-dd'))
    setImporteStr('')
  }

  async function handleConfirm() {
    if (saving || !categoria || importe <= 0) return
    setSaving(true)
    try {
      const tx: Transaccion = {
        id: uuid(),
        propiedadId: propiedad.id,
        fecha,
        tipo: 'gasto',
        importe,
        categoria,
        descripcion: '',
        archivos: [],
        creadoEn: new Date().toISOString(),
      }
      await addTx(tx)
      setCategoria(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <button
          onClick={() => abrir('Agua')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-surface-low text-on-surface text-sm font-medium hover:brightness-95 transition-all"
        >
          <Droplet size={16} />
          Agua
        </button>
        <button
          onClick={() => abrir('Electricidad')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-surface-low text-on-surface text-sm font-medium hover:brightness-95 transition-all"
        >
          <Zap size={16} />
          Luz
        </button>
      </div>

      <BottomSheet
        open={categoria !== null}
        onClose={() => setCategoria(null)}
        title={categoria === 'Electricidad' ? 'Gasto de luz' : 'Gasto de agua'}
      >
        <div className="flex flex-col gap-5 pb-4">
          <Input
            label="Importe (€)"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={importeStr}
            onChange={(e) => setImporteStr(e.target.value)}
            autoFocus
          />
          <Input
            label="Fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />

          {reparto && reparto.modo !== 'incluido' && (
            <div className="flex items-center justify-between bg-surface-low rounded-xl px-4 py-3 text-xs">
              <span className="text-outline-variant">
                Tuyo: <span className="font-medium text-on-surface">{fmt(reparto.propietario)} €</span>
              </span>
              <span className="text-primary font-medium">Inquilino: {fmt(reparto.inquilino)} €</span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setCategoria(null)}>
              Cancelar
            </Button>
            <Button fullWidth onClick={handleConfirm} disabled={saving || importe <= 0}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
