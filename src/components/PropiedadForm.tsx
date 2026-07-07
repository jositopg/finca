import { useState } from 'react'
import { Button } from './Button'
import { Input, Select } from './Input'
import type { Propiedad, PropiedadEstado, PropiedadTipo } from '../types'
import { ESTADO_LABELS, TIPO_LABELS } from '../types'

interface Props {
  initial?: Partial<Propiedad>
  onSave: (p: Propiedad) => void
  onCancel: () => void
}

function uuid() {
  return crypto.randomUUID()
}

export function PropiedadForm({ initial, onSave, onCancel }: Props) {
  const [nombre, setNombre] = useState(initial?.nombre ?? '')
  const [direccion, setDireccion] = useState(initial?.direccion ?? '')
  const [tipo, setTipo] = useState<PropiedadTipo>(initial?.tipo ?? 'piso')
  const [estado, setEstado] = useState<PropiedadEstado>(initial?.estado ?? 'alquilado')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!nombre.trim()) e.nombre = 'El nombre es obligatorio'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit() {
    if (!validate()) return

    const propiedad: Propiedad = {
      id: initial?.id ?? uuid(),
      nombre: nombre.trim(),
      direccion: direccion.trim(),
      tipo,
      estado,
      folderId: initial?.folderId ?? '',
      creadoEn: initial?.creadoEn ?? new Date().toISOString(),
    }

    onSave(propiedad)
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <Input
        label="Nombre"
        placeholder="Piso Calle Mayor 5, 3ºA"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        error={errors.nombre}
      />

      <Input
        label="Dirección"
        placeholder="Calle Mayor 5, Madrid"
        value={direccion}
        onChange={(e) => setDireccion(e.target.value)}
      />

      <div className="flex gap-3">
        <div className="flex-1">
          <Select
            label="Tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as PropiedadTipo)}
          >
            {(Object.keys(TIPO_LABELS) as PropiedadTipo[]).map((t) => (
              <option key={t} value={t}>
                {TIPO_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1">
          <Select
            label="Estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as PropiedadEstado)}
          >
            {(Object.keys(ESTADO_LABELS) as PropiedadEstado[]).map((e) => (
              <option key={e} value={e}>
                {ESTADO_LABELS[e]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" fullWidth onClick={onCancel}>
          Cancelar
        </Button>
        <Button fullWidth onClick={handleSubmit}>
          {initial?.id ? 'Guardar cambios' : 'Añadir propiedad'}
        </Button>
      </div>
    </div>
  )
}
