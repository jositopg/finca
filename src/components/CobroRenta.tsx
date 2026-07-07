import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { format } from 'date-fns'
import { useApp } from '../context/AppContext'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Input } from './Input'
import type { Propiedad, Transaccion } from '../types'

interface Props {
  propiedad: Propiedad
}

function uuid() {
  return crypto.randomUUID()
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function CobroRenta({ propiedad }: Props) {
  const { addTx } = useApp()
  const [open, setOpen] = useState(false)
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)

  if (!propiedad.alquilerMensual) return null
  const importe = propiedad.alquilerMensual

  async function handleConfirm() {
    setSaving(true)
    try {
      const tx: Transaccion = {
        id: uuid(),
        propiedadId: propiedad.id,
        fecha,
        tipo: 'ingreso',
        importe,
        categoria: 'Alquiler mensual',
        descripcion: '',
        archivos: [],
        creadoEn: new Date().toISOString(),
      }
      await addTx(tx)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setFecha(format(new Date(), 'yyyy-MM-dd'))
          setOpen(true)
        }}
        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-success-container text-success text-sm font-semibold hover:brightness-95 transition-all"
      >
        <Wallet size={16} />
        Cobro de renta
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Cobro de renta">
        <div className="flex flex-col gap-5 pb-4">
          <div className="bg-surface-low rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-outline-variant">Importe</span>
            <span className="text-base font-bold text-success tabular-nums">{fmt(importe)} €</span>
          </div>

          <Input
            label="Fecha de cobro"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button fullWidth onClick={handleConfirm} disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar cobro'}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
