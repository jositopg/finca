import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { format } from 'date-fns'
import { useApp } from '../context/AppContext'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Input } from './Input'
import type { ContratoHistorico, Propiedad } from '../types'

interface Props {
  propiedad: Propiedad
}

function uuid() {
  return crypto.randomUUID()
}

export function TerminarContrato({ propiedad }: Props) {
  const { updateProp } = useApp()
  const [open, setOpen] = useState(false)
  const [fechaFin, setFechaFin] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    try {
      const historico: ContratoHistorico = {
        id: uuid(),
        inquilinoNombre: propiedad.inquilinoNombre,
        inquilinoEmail: propiedad.inquilinoEmail,
        inquilinoTelefono: propiedad.inquilinoTelefono,
        inquilinoDni: propiedad.inquilinoDni,
        alquilerMensual: propiedad.alquilerMensual,
        fechaInicio: propiedad.contratoInicio,
        fechaFin,
        contratoArchivoId: propiedad.contratoArchivoId,
        contratoArchivoNombre: propiedad.contratoArchivoNombre,
      }
      await updateProp({
        ...propiedad,
        estado: 'vacio',
        inquilinoNombre: undefined,
        inquilinoEmail: undefined,
        inquilinoTelefono: undefined,
        inquilinoDni: undefined,
        alquilerMensual: undefined,
        contratoInicio: undefined,
        contratoFin: undefined,
        contratoArchivoId: undefined,
        contratoArchivoNombre: undefined,
        historialContratos: [...(propiedad.historialContratos ?? []), historico],
      })
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setFechaFin(format(new Date(), 'yyyy-MM-dd'))
          setOpen(true)
        }}
        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-error-container text-error text-sm font-medium hover:brightness-95 transition-all"
      >
        <LogOut size={16} />
        Terminar contrato
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Terminar contrato">
        <div className="flex flex-col gap-5 pb-4">
          <p className="text-sm text-outline-variant">
            La propiedad pasará a estado "Vacío". Los datos del inquilino y del
            contrato actual quedan guardados en el historial de alquileres, y
            podrás dar de alta un nuevo contrato cuando quieras.
          </p>

          <Input
            label="Fecha de fin del contrato"
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" fullWidth onClick={handleConfirm} disabled={saving}>
              {saving ? 'Guardando...' : 'Terminar contrato'}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
