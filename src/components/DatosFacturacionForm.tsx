import { useState } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import type { DatosFacturacion } from '../types'

interface Props {
  initial: DatosFacturacion | null
  onSave: (d: DatosFacturacion) => void | Promise<void>
  onCancel: () => void
}

export function DatosFacturacionForm({ initial, onSave, onCancel }: Props) {
  const [nombre, setNombre] = useState(initial?.nombre ?? '')
  const [nif, setNif] = useState(initial?.nif ?? '')
  const [direccion, setDireccion] = useState(initial?.direccion ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!nombre.trim()) e.nombre = 'Obligatorio'
    if (!nif.trim()) e.nif = 'Obligatorio'
    if (!direccion.trim()) e.direccion = 'Obligatorio'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (saving) return
    if (!validate()) return
    setSaving(true)
    try {
      await onSave({ nombre: nombre.trim(), nif: nif.trim(), direccion: direccion.trim() })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <p className="text-xs text-outline-variant -mt-1">
        Aparecen como emisor en las facturas y recibos de alquiler que generes. Se guardan una vez
        y se reutilizan siempre.
      </p>
      <Input
        label="Nombre completo"
        placeholder="Jose de la Paz..."
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        error={errors.nombre}
      />
      <Input
        label="NIF / DNI"
        placeholder="12345678A"
        value={nif}
        onChange={(e) => setNif(e.target.value)}
        error={errors.nif}
      />
      <Input
        label="Dirección completa"
        placeholder="Calle Mayor 5, 35001 Las Palmas de Gran Canaria, Las Palmas"
        value={direccion}
        onChange={(e) => setDireccion(e.target.value)}
        error={errors.direccion}
      />
      <p className="text-xs text-outline-variant -mt-3">
        Incluye código postal, municipio y provincia — es el domicilio que aparecerá en tus
        facturas.
      </p>
      <div className="flex gap-3 pt-2">
        <Button variant="secondary" fullWidth onClick={onCancel}>
          Cancelar
        </Button>
        <Button fullWidth onClick={handleSubmit} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
