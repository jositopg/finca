import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from './Button'
import { Input, Select, Textarea } from './Input'
import type {
  ConceptoReparto,
  GastoRecurrente,
  Propiedad,
  PropiedadEstado,
  PropiedadTipo,
  Reparto,
  RepartoConcepto,
  SuministroModo,
} from '../types'
import { CATEGORIAS_GASTO, CONCEPTO_LABELS, ESTADO_LABELS, parseImporte, TIPO_LABELS } from '../types'

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  initial?: Partial<Propiedad>
  onSave: (p: Propiedad) => void | Promise<void>
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
    const n = parseImporte(raw)
    onChange({ modo: 'parcial', importeIncluido: Number.isNaN(n) ? 0 : n })
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
            className="w-20 bg-surface-lowest border-0 rounded-lg px-2 py-1.5 text-base text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <span className="text-xs text-outline-variant">€/factura incluidos en la renta</span>
        </div>
      )}
    </div>
  )
}

function uuidGasto() {
  return crypto.randomUUID()
}

function GastosRecurrentesSection({
  gastos,
  onChange,
}: {
  gastos: GastoRecurrente[]
  onChange: (g: GastoRecurrente[]) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_GASTO[0])
  const [importeStr, setImporteStr] = useState('')
  const [descripcion, setDescripcion] = useState('')

  function handleAdd() {
    const importe = parseImporte(importeStr)
    if (Number.isNaN(importe) || importe <= 0) return
    onChange([
      ...gastos,
      {
        id: uuidGasto(),
        categoria,
        importe,
        descripcion: descripcion.trim() || undefined,
        creadoEn: new Date().toISOString().slice(0, 10),
      },
    ])
    setImporteStr('')
    setDescripcion('')
    setShowAdd(false)
  }

  function handleRemove(id: string) {
    onChange(gastos.filter((g) => g.id !== id))
  }

  return (
    <div className="flex flex-col gap-4 bg-surface-low rounded-xl p-4">
      <div className="-mb-1 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
            Gastos fijos mensuales
          </p>
          <p className="text-xs text-outline-variant mt-0.5">
            Se generan solos el día 1 de cada mes (comunidad, etc.), sin darlos de alta a mano
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 text-xs text-primary font-medium flex-shrink-0"
        >
          <Plus size={14} />
          Añadir
        </button>
      </div>

      {gastos.map((g) => (
        <div
          key={g.id}
          className="flex items-center justify-between bg-surface-lowest rounded-lg px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="text-sm text-on-surface truncate">{g.categoria}</p>
            <p className="text-xs text-outline-variant">
              {fmt(g.importe)} €/mes{g.descripcion ? ` · ${g.descripcion}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleRemove(g.id)}
            className="text-outline-variant hover:text-error flex-shrink-0"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {showAdd && (
        <div className="flex flex-col gap-3">
          <Select label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="Importe mensual (€)"
                type="text"
                inputMode="decimal"
                placeholder="50"
                value={importeStr}
                onChange={(e) => setImporteStr(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Input
                label="Descripción (opcional)"
                placeholder="Comunidad"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
          </div>
          <Button type="button" fullWidth onClick={handleAdd}>
            Añadir gasto fijo
          </Button>
        </div>
      )}
    </div>
  )
}

export function PropiedadForm({ initial, onSave, onCancel }: Props) {
  const [nombre, setNombre] = useState(initial?.nombre ?? '')
  const [direccion, setDireccion] = useState(initial?.direccion ?? '')
  const [municipio, setMunicipio] = useState(initial?.municipio ?? '')
  const [referenciaCatastral, setReferenciaCatastral] = useState(initial?.referenciaCatastral ?? '')
  const [valorReferencia, setValorReferencia] = useState(
    initial?.valorReferencia != null ? initial.valorReferencia.toString() : '',
  )
  const [valorMercado, setValorMercado] = useState(
    initial?.valorMercado != null ? initial.valorMercado.toString() : '',
  )
  const [propietarioNombre, setPropietarioNombre] = useState(initial?.propietarioNombre ?? '')
  const [tipo, setTipo] = useState<PropiedadTipo>(initial?.tipo ?? 'piso')
  const [estado, setEstado] = useState<PropiedadEstado>(initial?.estado ?? 'alquilado')
  const [inquilinoNombre, setInquilinoNombre] = useState(initial?.inquilinoNombre ?? '')
  const [inquilinoEmail, setInquilinoEmail] = useState(initial?.inquilinoEmail ?? '')
  const [inquilinoTelefono, setInquilinoTelefono] = useState(initial?.inquilinoTelefono ?? '')
  const [inquilinoDni, setInquilinoDni] = useState(initial?.inquilinoDni ?? '')
  const [alquilerMensual, setAlquilerMensual] = useState(
    initial?.alquilerMensual ? initial.alquilerMensual.toString() : '',
  )
  const [contratoInicio, setContratoInicio] = useState(initial?.contratoInicio ?? '')
  const [contratoFin, setContratoFin] = useState(initial?.contratoFin ?? '')
  const [porcentajePropiedad, setPorcentajePropiedad] = useState(
    initial?.porcentajePropiedad != null ? initial.porcentajePropiedad.toString() : '',
  )
  const [notas, setNotas] = useState(initial?.notas ?? '')
  const [reparto, setReparto] = useState<Reparto>(initial?.reparto ?? {})
  const [gastosRecurrentes, setGastosRecurrentes] = useState<GastoRecurrente[]>(
    initial?.gastosRecurrentes ?? [],
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!nombre.trim()) e.nombre = 'El nombre es obligatorio'

    const valorReferenciaNum = valorReferencia ? parseImporte(valorReferencia) : undefined
    if (valorReferencia && Number.isNaN(valorReferenciaNum)) e.valorReferencia = 'Valor inválido'

    const valorMercadoNum = valorMercado ? parseImporte(valorMercado) : undefined
    if (valorMercado && Number.isNaN(valorMercadoNum)) e.valorMercado = 'Valor inválido'

    const alquilerMensualNum = alquilerMensual ? parseImporte(alquilerMensual) : undefined
    if (alquilerMensual && Number.isNaN(alquilerMensualNum)) e.alquilerMensual = 'Importe inválido'

    const porcentajePropiedadNum = porcentajePropiedad ? parseImporte(porcentajePropiedad) : undefined
    if (porcentajePropiedad && Number.isNaN(porcentajePropiedadNum)) {
      e.porcentajePropiedad = 'Porcentaje inválido'
    } else if (
      porcentajePropiedadNum != null &&
      (porcentajePropiedadNum <= 0 || porcentajePropiedadNum > 100)
    ) {
      e.porcentajePropiedad = 'Debe estar entre 0 y 100'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (saving) return
    if (!validate()) return
    setSaving(true)

    const propiedad: Propiedad = {
      id: initial?.id ?? uuid(),
      nombre: nombre.trim(),
      direccion: direccion.trim(),
      municipio: municipio.trim() || undefined,
      referenciaCatastral: referenciaCatastral.trim() || undefined,
      valorReferencia: valorReferencia ? parseImporte(valorReferencia) : undefined,
      valorMercado: valorMercado ? parseImporte(valorMercado) : undefined,
      propietarioNombre: propietarioNombre.trim() || undefined,
      tipo,
      estado,
      folderId: initial?.folderId ?? '',
      creadoEn: initial?.creadoEn ?? new Date().toISOString(),
      inquilinoNombre: inquilinoNombre.trim() || undefined,
      inquilinoEmail: inquilinoEmail.trim() || undefined,
      inquilinoTelefono: inquilinoTelefono.trim() || undefined,
      inquilinoDni: inquilinoDni.trim() || undefined,
      alquilerMensual: alquilerMensual ? parseImporte(alquilerMensual) : undefined,
      contratoInicio: contratoInicio || undefined,
      contratoFin: contratoFin || undefined,
      porcentajePropiedad: porcentajePropiedad ? parseImporte(porcentajePropiedad) : undefined,
      notas: notas.trim() || undefined,
      reparto: Object.keys(reparto).length > 0 ? reparto : undefined,
      gastosRecurrentes: gastosRecurrentes.length > 0 ? gastosRecurrentes : undefined,
      historialContratos: initial?.historialContratos,
      contratoArchivoId: initial?.contratoArchivoId,
      contratoArchivoNombre: initial?.contratoArchivoNombre,
    }

    try {
      await onSave(propiedad)
    } catch (err) {
      // addProp/updateProp ya muestran un toast — aquí solo evitamos que
      // el botón se quede bloqueado si falla el guardado.
      console.error('Guardar propiedad error', err)
    } finally {
      setSaving(false)
    }
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

      <Input
        label="Municipio (opcional)"
        placeholder="Las Palmas de Gran Canaria"
        value={municipio}
        onChange={(e) => setMunicipio(e.target.value)}
      />

      <Input
        label="Propietario (opcional, déjalo vacío si es tuya)"
        placeholder="Martín"
        value={propietarioNombre}
        onChange={(e) => setPropietarioNombre(e.target.value)}
      />
      {propietarioNombre.trim() && (
        <p className="text-xs text-outline-variant -mt-3">
          Gestionas esta propiedad para {propietarioNombre.trim()} — no contará en tu Dashboard ni
          en tu Renta, pero puedes seguir llevando sus ingresos y gastos aquí
        </p>
      )}

      <div className="flex flex-col gap-4 bg-surface-low rounded-xl p-4">
        <div className="-mb-1">
          <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
            Catastro y valor
          </p>
          <p className="text-xs text-outline-variant mt-0.5">
            Opcional — para calcular la rentabilidad de la propiedad
          </p>
        </div>
        <Input
          label="Referencia catastral (opcional)"
          placeholder="1234567AB1234C0001DE"
          value={referenciaCatastral}
          onChange={(e) => setReferenciaCatastral(e.target.value)}
        />
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              label="Valor de referencia (€, opcional)"
              type="text"
              inputMode="decimal"
              placeholder="120000"
              value={valorReferencia}
              onChange={(e) => setValorReferencia(e.target.value)}
              error={errors.valorReferencia}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Valor de mercado estimado (€, opcional)"
              type="text"
              inputMode="decimal"
              placeholder="160000"
              value={valorMercado}
              onChange={(e) => setValorMercado(e.target.value)}
              error={errors.valorMercado}
            />
          </div>
        </div>
      </div>

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

      <Input
        label="% de la propiedad que es tuyo (opcional, 100% si no lo rellenas)"
        type="text"
        inputMode="decimal"
        placeholder="100"
        value={porcentajePropiedad}
        onChange={(e) => setPorcentajePropiedad(e.target.value)}
        error={errors.porcentajePropiedad}
      />

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
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="DNI/NIE (opcional)"
                placeholder="12345678A"
                value={inquilinoDni}
                onChange={(e) => setInquilinoDni(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Input
                label="Teléfono (opcional)"
                type="tel"
                placeholder="600 000 000"
                value={inquilinoTelefono}
                onChange={(e) => setInquilinoTelefono(e.target.value)}
              />
            </div>
          </div>
          <Input
            label="Correo electrónico (opcional)"
            type="email"
            placeholder="inquilino@email.com"
            value={inquilinoEmail}
            onChange={(e) => setInquilinoEmail(e.target.value)}
          />
          <Input
            label="Alquiler mensual € (opcional)"
            type="text"
            inputMode="decimal"
            placeholder="800 o 800,50"
            value={alquilerMensual}
            onChange={(e) => setAlquilerMensual(e.target.value)}
            error={errors.alquilerMensual}
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

      <GastosRecurrentesSection gastos={gastosRecurrentes} onChange={setGastosRecurrentes} />

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
        <Button fullWidth onClick={handleSubmit} disabled={saving}>
          {saving ? 'Guardando...' : initial?.id ? 'Guardar cambios' : 'Añadir propiedad'}
        </Button>
      </div>
    </div>
  )
}
