import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from './Button'
import { Input, Select, Textarea } from './Input'
import type {
  ConceptoReparto,
  Financiacion,
  GastoRecurrente,
  InclusionAguaLuz,
  InclusionAguaLuzModo,
  Propiedad,
  PropiedadEstado,
  PropiedadTipo,
  Reparto,
  RepartoConcepto,
  SuministroModo,
  TipoAdquisicion,
} from '../types'
import {
  CATEGORIAS_GASTO,
  CONCEPTO_LABELS,
  corregirTramoVigente,
  ESTADO_LABELS,
  fechaDeHoy,
  FichaError,
  inclusionAguaLuz,
  normalizarReferenciaCatastral,
  parseImporte,
  TIPO_LABELS,
  textoCuota,
  validarCopropietarios,
  validarCuota,
  validarFecha,
  validarFechaNoFutura,
  validarImporte,
  validarReferenciaCatastral,
} from '../types'

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function mensajeFicha(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (err) {
    if (err instanceof FichaError) return err.message
    throw err
  }
}

interface CopropietarioBorrador {
  nombre: string
  porcentaje: string
}

interface Props {
  initial?: Partial<Propiedad>
  onSave: (p: Propiedad) => void | Promise<void>
  onCancel: () => void
  onDelete?: () => void
}

function uuid() {
  return crypto.randomUUID()
}

const MODO_LABELS: Record<Exclude<SuministroModo, 'parcial_conjunto'>, string> = {
  incluido: 'Incluido',
  no_incluido: 'No incluido',
  parcial: 'Parcial',
}

const AGUA_LUZ_MODOS: InclusionAguaLuzModo[] = ['incluido', 'no_incluido', 'parcial_conjunto']

const AGUA_LUZ_MODO_LABEL: Record<InclusionAguaLuzModo, string> = {
  incluido: 'Incluido',
  no_incluido: 'No incluido',
  parcial_conjunto: '30 € juntos',
}

function AguaLuzRow({
  value,
  onChange,
}: {
  value?: InclusionAguaLuz
  onChange: (v?: InclusionAguaLuz) => void
}) {
  const modo = value?.modo
  const [importeStr, setImporteStr] = useState(
    value?.importeMensual != null ? String(value.importeMensual) : '30',
  )

  function handleModoClick(m: InclusionAguaLuzModo) {
    if (modo === m) {
      onChange(undefined)
      return
    }
    if (m === 'parcial_conjunto') {
      const n = parseImporte(importeStr)
      onChange({ modo: m, importeMensual: Number.isNaN(n) || n <= 0 ? 30 : n })
    } else {
      onChange({ modo: m })
    }
  }

  function handleImporteChange(raw: string) {
    setImporteStr(raw)
    const n = parseImporte(raw)
    onChange({ modo: 'parcial_conjunto', importeMensual: Number.isNaN(n) ? 0 : n })
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-on-surface">Agua y luz</p>
      <div className="flex gap-1.5">
        {AGUA_LUZ_MODOS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => handleModoClick(m)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              modo === m ? 'bg-on-surface text-surface' : 'bg-surface-lowest text-outline-variant'
            }`}
          >
            {AGUA_LUZ_MODO_LABEL[m]}
          </button>
        ))}
      </div>
      {modo === 'parcial_conjunto' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="30"
              value={importeStr}
              onChange={(e) => handleImporteChange(e.target.value)}
              className="w-20 bg-surface-lowest border-0 rounded-lg px-2 py-1.5 text-base text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="text-xs text-outline-variant">€/mes de agua y luz juntos</span>
          </div>
          <p className="text-xs text-outline-variant">
            Un solo cupo para los dos: no se reparte entre agua y luz. Solo cuenta como gasto esa
            cantidad al mes; el resto se repercute al inquilino.
          </p>
        </div>
      )}
      {modo === 'no_incluido' && (
        <p className="text-xs text-outline-variant">
          Las facturas se quedan a efectos informativos: no cuentan como gasto. El importe se
          repercute al inquilino.
        </p>
      )}
      {modo === 'incluido' && (
        <p className="text-xs text-outline-variant">Las facturas de agua y luz cuentan enteras como gasto.</p>
      )}
    </div>
  )
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
        {(['incluido', 'no_incluido', 'parcial'] as const).map((m) => (
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

export function PropiedadForm({ initial, onSave, onCancel, onDelete }: Props) {
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
  const [valorConstruccion, setValorConstruccion] = useState(
    initial?.valorConstruccion != null ? initial.valorConstruccion.toString() : '',
  )
  const [valorAdquisicion, setValorAdquisicion] = useState(
    initial?.valorAdquisicion != null ? initial.valorAdquisicion.toString() : '',
  )
  const [fechaAdquisicion, setFechaAdquisicion] = useState(initial?.fechaAdquisicion ?? '')
  const [tipoAdquisicion, setTipoAdquisicion] = useState<TipoAdquisicion | ''>(initial?.tipoAdquisicion ?? '')
  const [metrosCuadrados, setMetrosCuadrados] = useState(
    initial?.metrosCuadrados != null ? initial.metrosCuadrados.toString() : '',
  )
  const [fechaValorMercado, setFechaValorMercado] = useState(initial?.fechaValorMercado ?? '')
  const [cuotaTexto, setCuotaTexto] = useState(initial?.cuotaPropiedad ? textoCuota(initial.cuotaPropiedad) : '')
  const [sinRenta, setSinRenta] = useState(initial?.sinRenta ?? false)
  const [capitalPendiente, setCapitalPendiente] = useState(
    initial?.financiacion?.capitalPendiente != null ? initial.financiacion.capitalPendiente.toString() : '',
  )
  const [cuotaFinanciacion, setCuotaFinanciacion] = useState(
    initial?.financiacion?.cuotaMensual != null ? initial.financiacion.cuotaMensual.toString() : '',
  )
  const [tipoInteres, setTipoInteres] = useState(
    initial?.financiacion?.tipoInteres != null ? initial.financiacion.tipoInteres.toString() : '',
  )
  const [fechaFinFinanciacion, setFechaFinFinanciacion] = useState(initial?.financiacion?.fechaFin ?? '')
  const [copropietarios, setCopropietarios] = useState<CopropietarioBorrador[]>(
    (initial?.copropietarios ?? []).map((c) => ({ nombre: c.nombre, porcentaje: String(c.porcentaje) })),
  )
  const [certificadoEnergeticoVencimiento, setCertificadoEnergeticoVencimiento] = useState(
    initial?.certificadoEnergeticoVencimiento ?? '',
  )
  const [fianzaImporte, setFianzaImporte] = useState(
    initial?.fianzaImporte != null ? initial.fianzaImporte.toString() : '',
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
  const [contratoLuzNumero, setContratoLuzNumero] = useState(initial?.contratoLuzNumero ?? '')
  const [contratoLuzEmpresa, setContratoLuzEmpresa] = useState(initial?.contratoLuzEmpresa ?? '')
  const [contratoAguaNumero, setContratoAguaNumero] = useState(initial?.contratoAguaNumero ?? '')
  const [contratoAguaEmpresa, setContratoAguaEmpresa] = useState(initial?.contratoAguaEmpresa ?? '')
  const [aguaLuz, setAguaLuz] = useState<InclusionAguaLuz | undefined>(inclusionAguaLuz(initial?.reparto))
  const [reparto, setReparto] = useState<Reparto>({
    basuras: initial?.reparto?.basuras,
    ibi: initial?.reparto?.ibi,
  })
  const [gastosRecurrentes, setGastosRecurrentes] = useState<GastoRecurrente[]>(
    initial?.gastosRecurrentes ?? [],
  )
  const [diaCobro, setDiaCobro] = useState(initial?.diaCobro != null ? String(initial.diaCobro) : '')
  const [fianzaDepositoNumero, setFianzaDepositoNumero] = useState(initial?.fianzaDepositoNumero ?? '')
  const [seguroVencimiento, setSeguroVencimiento] = useState(initial?.seguroVencimiento ?? '')
  const [ibiMes, setIbiMes] = useState(initial?.ibiMes != null ? String(initial.ibiMes) : '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!nombre.trim()) e.nombre = 'El nombre es obligatorio'

    const hoy = fechaDeHoy()
    const importeCampo = (raw: string, campo: string, permitirCero = false) => {
      if (!raw.trim()) return
      const error = mensajeFicha(() => validarImporte(raw, campo, permitirCero))
      if (error) e[campo] = error
    }
    importeCampo(valorReferencia, 'valorReferencia')
    importeCampo(valorMercado, 'valorMercado')
    importeCampo(valorConstruccion, 'valorConstruccion', true)
    importeCampo(valorAdquisicion, 'valorAdquisicion')
    importeCampo(metrosCuadrados, 'metrosCuadrados')
    importeCampo(capitalPendiente, 'capitalPendiente', true)
    importeCampo(cuotaFinanciacion, 'cuotaMensual', true)
    if (tipoInteres.trim()) {
      const n = Number(tipoInteres.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0 || n > 100) e.tipoInteres = 'El tipo de interés tiene que estar entre 0 y 100.'
    }
    if (fechaAdquisicion) {
      const error = mensajeFicha(() => validarFechaNoFutura(fechaAdquisicion, 'fechaAdquisicion', hoy))
      if (error) e.fechaAdquisicion = error
    }
    if (fechaValorMercado) {
      const error = mensajeFicha(() => validarFechaNoFutura(fechaValorMercado, 'fechaValorMercado', hoy))
      if (error) e.fechaValorMercado = error
    }
    if (fechaFinFinanciacion) {
      const error = mensajeFicha(() => validarFecha(fechaFinFinanciacion, 'fechaFin'))
      if (error) e.fechaFin = error
    }
    if (referenciaCatastral.trim()) {
      const normalizada = normalizarReferenciaCatastral(referenciaCatastral)
      const inicial = normalizarReferenciaCatastral(initial?.referenciaCatastral ?? '')
      if (normalizada !== inicial) {
        const error = mensajeFicha(() => validarReferenciaCatastral(referenciaCatastral))
        if (error) e.referenciaCatastral = error
      }
    }
    if (cuotaTexto.trim()) {
      const error = mensajeFicha(() => validarCuota(cuotaTexto))
      if (error) e.cuotaPropiedad = error
    }
    const filasCopropietarios = copropietarios.filter((c) => c.nombre.trim() || c.porcentaje.trim())
    if (filasCopropietarios.length > 0) {
      const error = mensajeFicha(() =>
        validarCopropietarios(
          filasCopropietarios.map((c) => ({ nombre: c.nombre, porcentaje: c.porcentaje })),
        ),
      )
      if (error) e.copropietarios = error
    }

    const fianzaImporteNum = fianzaImporte ? parseImporte(fianzaImporte) : undefined
    if (fianzaImporte && Number.isNaN(fianzaImporteNum)) e.fianzaImporte = 'Importe inválido'

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
      referenciaCatastral: (() => {
        const raw = referenciaCatastral.trim()
        if (!raw) return undefined
        const normalizada = normalizarReferenciaCatastral(raw)
        const inicial = normalizarReferenciaCatastral(initial?.referenciaCatastral ?? '')
        if (initial?.referenciaCatastral && normalizada === inicial) return initial.referenciaCatastral
        return validarReferenciaCatastral(raw)
      })(),
      valorReferencia: valorReferencia.trim() ? validarImporte(valorReferencia, 'valorReferencia') : undefined,
      valorMercado: valorMercado.trim() ? validarImporte(valorMercado, 'valorMercado') : undefined,
      valorConstruccion: valorConstruccion.trim() ? validarImporte(valorConstruccion, 'valorConstruccion', true) : undefined,
      valorCatastral: initial?.valorCatastral,
      anioRevisionCatastral: initial?.anioRevisionCatastral,
      grupo: initial?.grupo,
      valorAdquisicion: valorAdquisicion.trim() ? validarImporte(valorAdquisicion, 'valorAdquisicion') : undefined,
      fechaAdquisicion: fechaAdquisicion || undefined,
      tipoAdquisicion: tipoAdquisicion || undefined,
      metrosCuadrados: metrosCuadrados.trim() ? validarImporte(metrosCuadrados, 'metrosCuadrados') : undefined,
      fechaValorMercado: fechaValorMercado || undefined,
      cuotaPropiedad: cuotaTexto.trim() ? validarCuota(cuotaTexto) : undefined,
      sinRenta: sinRenta || undefined,
      financiacion: (() => {
        const capital = capitalPendiente.trim() ? validarImporte(capitalPendiente, 'capitalPendiente', true) : undefined
        const cuota = cuotaFinanciacion.trim() ? validarImporte(cuotaFinanciacion, 'cuotaMensual', true) : undefined
        const interes = tipoInteres.trim() ? Number(tipoInteres.replace(',', '.')) : undefined
        const fin = fechaFinFinanciacion || undefined
        if (capital == null && cuota == null && interes == null && !fin) return undefined
        const datos: Financiacion = {
          capitalPendiente: capital,
          cuotaMensual: cuota,
          tipoInteres: interes,
          fechaFin: fin,
        }
        return datos
      })(),
      copropietarios: (() => {
        const filas = copropietarios.filter((c) => c.nombre.trim() || c.porcentaje.trim())
        if (filas.length === 0) return undefined
        return validarCopropietarios(filas.map((c) => ({ nombre: c.nombre, porcentaje: c.porcentaje })))
      })(),
      certificadoEnergeticoVencimiento: certificadoEnergeticoVencimiento || undefined,
      fianzaImporte: fianzaImporte ? parseImporte(fianzaImporte) : undefined,
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
      contratoLuzNumero: contratoLuzNumero.trim() || undefined,
      contratoLuzEmpresa: contratoLuzEmpresa.trim() || undefined,
      contratoAguaNumero: contratoAguaNumero.trim() || undefined,
      contratoAguaEmpresa: contratoAguaEmpresa.trim() || undefined,
      reparto: (() => {
        const r: Reparto = {}
        if (aguaLuz) r.aguaLuz = aguaLuz
        if (reparto.basuras) r.basuras = reparto.basuras
        if (reparto.ibi) r.ibi = reparto.ibi
        return Object.keys(r).length > 0 ? r : undefined
      })(),
      gastosRecurrentes: gastosRecurrentes.length > 0 ? gastosRecurrentes : undefined,
      historialContratos: initial?.historialContratos,
      tramosContrato: initial?.tramosContrato,
      conceptosFijos: initial?.conceptosFijos,
      contratoArchivoId: initial?.contratoArchivoId,
      contratoArchivoNombre: initial?.contratoArchivoNombre,
      alDiaDesde: initial?.alDiaDesde,
      deudaDesde: initial?.deudaDesde,
      rentaRevisadaDesde: initial?.rentaRevisadaDesde,
      fianzaDepositadaDesde: initial?.fianzaDepositadaDesde,
      diaCobro: diaCobro.trim() ? Number(diaCobro) : undefined,
      fianzaDepositoNumero: fianzaDepositoNumero.trim() || undefined,
      fianzaDepositoArchivoId: initial?.fianzaDepositoArchivoId,
      fianzaDepositoArchivoNombre: initial?.fianzaDepositoArchivoNombre,
      seguroVencimiento: seguroVencimiento || undefined,
      ibiMes: ibiMes.trim() ? Number(ibiMes) : undefined,
      huecosMensualesOmitidos: initial?.huecosMensualesOmitidos,
    }

    const aGuardar = propiedad.tramosContrato?.length
      ? corregirTramoVigente(propiedad, {
          alquilerMensual: propiedad.alquilerMensual,
          contratoFin: propiedad.contratoFin,
          fianzaImporte: propiedad.fianzaImporte,
        })
      : propiedad

    try {
      await onSave(aGuardar)
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
          error={errors.referenciaCatastral}
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
        <Input
          label="Valor catastral de la construcción (€, opcional)"
          type="text"
          inputMode="decimal"
          placeholder="45000"
          value={valorConstruccion}
          onChange={(e) => setValorConstruccion(e.target.value)}
          error={errors.valorConstruccion}
        />
        <p className="text-xs text-outline-variant -mt-3">
          Del recibo del IBI (valor de la construcción, sin el suelo) — para estimar la amortización
          deducible en el Estimador de Renta. Si la ficha es una cuota (1/12), la amortización usa esa parte.
        </p>
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              label="Valor de adquisición (€, opcional)"
              type="text"
              inputMode="decimal"
              placeholder="90000"
              value={valorAdquisicion}
              onChange={(e) => setValorAdquisicion(e.target.value)}
              error={errors.valorAdquisicion}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Fecha de adquisición"
              type="date"
              value={fechaAdquisicion}
              onChange={(e) => setFechaAdquisicion(e.target.value)}
              error={errors.fechaAdquisicion}
            />
          </div>
        </div>
        <Select
          label="Cómo se adquirió (opcional)"
          value={tipoAdquisicion}
          onChange={(e) => setTipoAdquisicion(e.target.value as TipoAdquisicion | '')}
        >
          <option value="">Sin indicar</option>
          <option value="herencia">Herencia</option>
          <option value="donacion">Donación</option>
          <option value="compra">Compra</option>
        </Select>
        <p className="text-xs text-outline-variant -mt-3">
          El valor de la escritura (herencia, donación o compra) es el valor de adquisición. No hace falta otro importe.
        </p>
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              label="Metros cuadrados (opcional)"
              type="text"
              inputMode="decimal"
              placeholder="72"
              value={metrosCuadrados}
              onChange={(e) => setMetrosCuadrados(e.target.value)}
              error={errors.metrosCuadrados}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Fecha del valor de mercado"
              type="date"
              value={fechaValorMercado}
              onChange={(e) => setFechaValorMercado(e.target.value)}
              error={errors.fechaValorMercado}
            />
          </div>
        </div>
        <Input
          label="Cuota de la finca (opcional, 1 si la dejas vacía)"
          type="text"
          placeholder="1/12"
          value={cuotaTexto}
          onChange={(e) => setCuotaTexto(e.target.value)}
          error={errors.cuotaPropiedad}
        />
        <p className="text-xs text-outline-variant -mt-3">
          Fracción de este inmueble. Una plaza de garaje de 1/12 guarda el valor del garaje entero y la parte se calcula sola.
        </p>
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">Financiación (opcional)</p>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="Capital pendiente (€)"
                type="text"
                inputMode="decimal"
                placeholder="40000"
                value={capitalPendiente}
                onChange={(e) => setCapitalPendiente(e.target.value)}
                error={errors.capitalPendiente}
              />
            </div>
            <div className="flex-1">
              <Input
                label="Cuota mensual (€)"
                type="text"
                inputMode="decimal"
                placeholder="350"
                value={cuotaFinanciacion}
                onChange={(e) => setCuotaFinanciacion(e.target.value)}
                error={errors.cuotaMensual}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="Tipo de interés (%)"
                type="text"
                inputMode="decimal"
                placeholder="3,5"
                value={tipoInteres}
                onChange={(e) => setTipoInteres(e.target.value)}
                error={errors.tipoInteres}
              />
            </div>
            <div className="flex-1">
              <Input
                label="Fin de la financiación"
                type="date"
                value={fechaFinFinanciacion}
                onChange={(e) => setFechaFinFinanciacion(e.target.value)}
                error={errors.fechaFin}
              />
            </div>
          </div>
        </div>
        <Input
          label="Vencimiento del certificado energético (opcional)"
          type="date"
          value={certificadoEnergeticoVencimiento}
          onChange={(e) => setCertificadoEnergeticoVencimiento(e.target.value)}
        />
        <p className="text-xs text-outline-variant -mt-3">
          Caduca a los 10 años — te avisamos cuando esté por caducar
        </p>
      </div>

      <div className="flex flex-col gap-4 bg-surface-low rounded-xl p-4">
        <div className="-mb-1">
          <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
            Contratos de luz y agua
          </p>
          <p className="text-xs text-outline-variant mt-0.5">
            Opcional — a mano cuando llame la compañía o haya que dar de alta un suministro
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              label="Nº contrato luz (opcional)"
              placeholder="ES0123456789012345AB"
              value={contratoLuzNumero}
              onChange={(e) => setContratoLuzNumero(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Compañía de luz (opcional)"
              placeholder="Endesa"
              value={contratoLuzEmpresa}
              onChange={(e) => setContratoLuzEmpresa(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              label="Nº contrato agua (opcional)"
              placeholder="123456"
              value={contratoAguaNumero}
              onChange={(e) => setContratoAguaNumero(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Compañía de agua (opcional)"
              placeholder="Emalsa"
              value={contratoAguaEmpresa}
              onChange={(e) => setContratoAguaEmpresa(e.target.value)}
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

      <label className="flex items-start gap-2 bg-surface-low rounded-xl px-4 py-3 cursor-pointer">
        <input
          type="checkbox"
          checked={sinRenta}
          onChange={(e) => setSinRenta(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-xs text-on-surface">
          Este inmueble no se alquila
          <span className="block text-outline-variant mt-0.5">
            Rústica, garaje sin alquilar u otro bien sin renta. No genera avisos de cobro, huecos ni rentabilidad, y sí cuenta en el patrimonio.
          </span>
        </span>
      </label>

      <Input
        label="% de la propiedad que es tuyo (opcional, 100% si no lo rellenas)"
        type="text"
        inputMode="decimal"
        placeholder="100"
        value={porcentajePropiedad}
        onChange={(e) => setPorcentajePropiedad(e.target.value)}
        error={errors.porcentajePropiedad}
      />

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">Copropietarios (opcional)</p>
          <p className="text-xs text-outline-variant mt-0.5">Solo nombre y porcentaje. Tienen que sumar 100.</p>
        </div>
        {copropietarios.map((c, i) => (
          <div key={i} className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                label="Nombre"
                value={c.nombre}
                onChange={(e) =>
                  setCopropietarios((lista) => lista.map((fila, j) => (j === i ? { ...fila, nombre: e.target.value } : fila)))
                }
              />
            </div>
            <div className="w-24">
              <Input
                label="%"
                type="text"
                inputMode="decimal"
                value={c.porcentaje}
                onChange={(e) =>
                  setCopropietarios((lista) =>
                    lista.map((fila, j) => (j === i ? { ...fila, porcentaje: e.target.value } : fila)),
                  )
                }
              />
            </div>
            <button
              type="button"
              onClick={() => setCopropietarios((lista) => lista.filter((_, j) => j !== i))}
              className="mb-2 text-outline-variant"
              aria-label="Quitar copropietario"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {errors.copropietarios && <p className="text-xs text-error">{errors.copropietarios}</p>}
        <Button
          type="button"
          size="sm"
          onClick={() => setCopropietarios((lista) => [...lista, { nombre: '', porcentaje: '' }])}
        >
          <Plus size={14} />
          Añadir copropietario
        </Button>
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
          {initial?.tramosContrato && initial.tramosContrato.length > 0 && (
            <p className="-mt-3 text-xs text-outline-variant">
              Esto corrige la renta vigente hoy. Para cambiarla a partir de
              una fecha sin terminar el contrato, usa «Cambiar condiciones»
              en la ficha.
            </p>
          )}
          <Input
            label="Importe de la fianza € (opcional)"
            type="text"
            inputMode="decimal"
            placeholder="800"
            value={fianzaImporte}
            onChange={(e) => setFianzaImporte(e.target.value)}
            error={errors.fianzaImporte}
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
              Agua y luz son un solo dato del contrato (incluidos, no, o 30 €/mes
              juntos). Basuras e IBI se indican aparte.
            </p>
          </div>
          <AguaLuzRow value={aguaLuz} onChange={setAguaLuz} />
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

      <Input
        label="Día de cobro de la renta (opcional)"
        type="number"
        min={1}
        max={28}
        placeholder="5"
        value={diaCobro}
        onChange={(e) => setDiaCobro(e.target.value)}
      />
      <Input
        label="Nº resguardo fianza ICAVI (opcional)"
        value={fianzaDepositoNumero}
        onChange={(e) => setFianzaDepositoNumero(e.target.value)}
      />
      <Input
        label="Vencimiento del seguro (opcional)"
        type="date"
        value={seguroVencimiento}
        onChange={(e) => setSeguroVencimiento(e.target.value)}
      />
      <Input
        label="Mes del IBI 1-12 (opcional)"
        type="number"
        min={1}
        max={12}
        placeholder="5"
        value={ibiMes}
        onChange={(e) => setIbiMes(e.target.value)}
      />

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
      {onDelete && initial?.id && (
        <button
          type="button"
          onClick={onDelete}
          className="mt-2 w-full py-2.5 text-sm font-medium text-error"
        >
          Eliminar propiedad
        </button>
      )}
    </div>
  )
}
