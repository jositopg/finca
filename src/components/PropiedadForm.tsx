import { useState } from 'react'
import { Button } from './Button'
import { Input, Select, Textarea } from './Input'
import type {
  ConceptoReparto,
  Propiedad,
  PropiedadEstado,
  PropiedadTipo,
  Reparto,
  RepartoConcepto,
  SuministroModo,
} from '../types'
import { CONCEPTO_LABELS, ESTADO_LABELS, TIPO_LABELS } from '../types'

interface Props {
  initial?: Partial<Propiedad>
  onSave: (p: Propiedad) => void
  onCancel: () => void
}

function uuid() {
  return crypto.randomUUID()
}

const MODO_LABELS: Record<SuministroModo, string> = {
  incluido: 'Incluido',
  no_incluido: 'No incluido',
  parcial: 'Parcial',
}

function RepartoRow({
  concepto,
  value,
  onChange,
}: {
  concepto: ConceptoReparto
  value?: RepartoConcepto
  onChange: (v: RepartoConcepto) => void
}) {
  const modo = value?.modo ?? 'incluido'
  const [importeStr, setImporteStr] = useState(
    value?.importeIncluido != null ? value.importeIncluido.toString() : '',
  )

  function handleModoClick(m: SuministroModo) {
    if (m === 'parcial') {
      const inicial = value?.importeIncluido ?? 0
      setImporteStr(inicial ? inicial.toString() : '')
      onChange({ modo: m, importeIncluido: inicial })
    } else {
      onChange({ modo: m, importeIncluido: undefined })
    }
  }

  function handleImporteChange(raw: string) {
    setImporteStr(raw)
    onChange({ modo: 'parcial', importeIncluido: parseFloat(raw.replace(',', '.')) || 0 })
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-on-surface">{CONCEPTO_LABELS[concepto]}</p>
      <div className="flex gap-1.5">
        {(['incluido', 'no_incluido', 'parcial'] as SuministroModo[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => handleModoClick(m)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              modo === m ? 'bg-on-surface text-surface' : 'bg-surface-lowest text-outline-variant'
            }`}
          >
            {MODO_LABELS[m]}
          </button>
        ))}
      </div>
      {modo === 'parcial' && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="30"
            value={importeStr}
            onChange={(e) => handleImporteChange(e.target.value)}
            className="w-20 bg-surface-lowest border-0 rounded-lg px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <span className="text-xs text-outline-variant">€/factura incluidos en la renta</span>
        </div>
      )}
    </div>
  )
}

export function PropiedadForm({ initial, onSave, onCancel }: Props) {
  const [nombre, setNombre] = useState(initial?.nombre ?? '')
  const [direccion, setDireccion] = useState(initial?.direccion ?? '')
  const [tipo, setTipo] = useState<PropiedadTipo>(initial?.tipo ?? 'piso')
  const [estado, setEstado] = useState<PropiedadEstado>(initial?.estado ?? 'alquilado')
  const [inquilinoNombre, setInquilinoNombre] = useState(initial?.inquilinoNombre ?? '')
  const [alquilerMensual, setAlquilerMensual] = useState(
    initial?.alquilerMensual ? initial.alquilerMensual.toString() : '',
  )
  const [contratoInicio, setContratoInicio] = useState(initial?.contratoInicio ?? '')
  const [contratoFin, setContratoFin] = useState(initial?.contratoFin ?? '')
  const [notas, setNotas] = useState(initial?.notas ?? '')
  const [reparto, setReparto] = useState<Reparto>(initial?.reparto ?? {})
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
      inquilinoNombre: inquilinoNombre.trim() || undefined,
      alquilerMensual: alquilerMensual ? parseFloat(alquilerMensual.replace(',', '.')) : undefined,
      contratoInicio: contratoInicio || undefined,
      contratoFin: contratoFin || undefined,
      notas: notas.trim() || undefined,
      reparto: Object.keys(reparto).length > 0 ? reparto : undefined,
      historialContratos: initial?.historialContratos,
      contratoArchivoId: initial?.contratoArchivoId,
      contratoArchivoNombre: initial?.contratoArchivoNombre,
    }

    onSave(propiedad)
  }

  const esAlquiler = estado === 'alquilado'

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

      {/* Inquilino — solo si está alquilado */}
      {esAlquiler && (
        <div className="flex flex-col gap-4 bg-surface-low rounded-xl p-4">
          <div className="-mb-1">
            <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
              Datos del inquilino
            </p>
            <p className="text-xs text-outline-variant mt-0.5">
              Opcional — puedes rellenarlos ahora o más adelante
            </p>
          </div>
          <Input
            label="Nombre del inquilino (opcional)"
            placeholder="Juan García López"
            value={inquilinoNombre}
            onChange={(e) => setInquilinoNombre(e.target.value)}
          />
          <Input
            label="Alquiler mensual € (opcional)"
            type="text"
            inputMode="decimal"
            placeholder="800 o 800,50"
            value={alquilerMensual}
            onChange={(e) => setAlquilerMensual(e.target.value)}
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="Inicio del contrato (opcional)"
                type="date"
                value={contratoInicio}
                onChange={(e) => setContratoInicio(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Input
                label="Fin del contrato (opcional)"
                type="date"
                value={contratoFin}
                onChange={(e) => setContratoFin(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Reparto de suministros y tasas — solo si está alquilado */}
      {esAlquiler && (
        <div className="flex flex-col gap-4 bg-surface-low rounded-xl p-4">
          <div className="-mb-1">
            <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
              Agua, luz, basuras e IBI
            </p>
            <p className="text-xs text-outline-variant mt-0.5">
              Indica quién los paga para calcular después, al registrar cada
              factura, qué parte te corresponde a ti y qué parte es repercutible
              al inquilino
            </p>
          </div>
          <RepartoRow
            concepto="agua"
            value={reparto.agua}
            onChange={(v) => setReparto((r) => ({ ...r, agua: v }))}
          />
          <RepartoRow
            concepto="luz"
            value={reparto.luz}
            onChange={(v) => setReparto((r) => ({ ...r, luz: v }))}
          />
          <RepartoRow
            concepto="basuras"
            value={reparto.basuras}
            onChange={(v) => setReparto((r) => ({ ...r, basuras: v }))}
          />
          <RepartoRow
            concepto="ibi"
            value={reparto.ibi}
            onChange={(v) => setReparto((r) => ({ ...r, ibi: v }))}
          />
        </div>
      )}

      <Textarea
        label="Notas (opcional)"
        placeholder="Valor catastral, información relevante..."
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
      />

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
