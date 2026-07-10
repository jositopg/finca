export type PropiedadTipo = 'piso' | 'casa' | 'local' | 'garaje' | 'otro'
export type PropiedadEstado =
  | 'alquilado'
  | 'vacio'
  | 'reforma'
  | 'venta'
  | 'uso_propio'
  | 'vivienda_habitual'
export type TransaccionTipo = 'ingreso' | 'gasto'

export interface Propiedad {
  id: string
  nombre: string
  direccion: string
  tipo: PropiedadTipo
  estado: PropiedadEstado
  folderId: string
  creadoEn: string
  // Optional extended fields (added in v2 schema)
  inquilinoNombre?: string
  inquilinoEmail?: string
  inquilinoTelefono?: string
  inquilinoDni?: string
  alquilerMensual?: number
  contratoInicio?: string // YYYY-MM-DD
  contratoFin?: string // YYYY-MM-DD
  notas?: string
  contratoArchivoId?: string // Drive file ID del contrato de alquiler
  contratoArchivoNombre?: string
  reparto?: Reparto // quién paga agua/luz/basuras/IBI
  historialContratos?: ContratoHistorico[] // alquileres anteriores ya terminados
  porcentajePropiedad?: number // 0-100, % de la propiedad que es de Jose (sin definir = 100%)
  gastosRecurrentes?: GastoRecurrente[] // gastos fijos que se repiten cada mes (comunidad, etc.)
  referenciaCatastral?: string
  municipio?: string
  valorReferencia?: number // valor de referencia del Catastro (uso fiscal)
  valorMercado?: number // estimación de valor de mercado, para calcular rentabilidad
  propietarioNombre?: string // si Jose solo la gestiona pero es de otra persona (p.ej. "Martín")
}

// Propiedades que son de Jose (sin propietarioNombre) — para excluir las que
// gestiona por cuenta de otros de sus totales y cálculos fiscales personales.
export function esDeJose(propiedad: Pick<Propiedad, 'propietarioNombre'>): boolean {
  return !propiedad.propietarioNombre
}

export interface Rentabilidad {
  bruta: number // % anual sobre el valor, solo ingresos
  neta: number // % anual sobre el valor, ingresos - gastos
}

// Rentabilidad anual (%) de una propiedad sobre un valor de referencia
// (mercado o catastral) — null si no hay valor con el que calcularla.
export function calcularRentabilidad(
  ingresosAnuales: number,
  gastosAnuales: number,
  valor: number | undefined,
): Rentabilidad | null {
  if (!valor || valor <= 0) return null
  return {
    bruta: (ingresosAnuales / valor) * 100,
    neta: ((ingresosAnuales - gastosAnuales) / valor) * 100,
  }
}

// Gasto fijo mensual (comunidad, etc.) — el día 1 de cada mes, desde
// creadoEn en adelante, se genera solo como transacción si aún no existe
// una de esa categoría ese mes para la propiedad.
export interface GastoRecurrente {
  id: string
  categoria: string
  importe: number
  descripcion?: string
  creadoEn: string // YYYY-MM-DD — mes desde el que empieza a generarse
}

function mesesEntre(desdeYYYYMM: string, hastaYYYYMM: string): string[] {
  const meses: string[] = []
  let [y, m] = desdeYYYYMM.split('-').map(Number)
  const [yHasta, mHasta] = hastaYYYYMM.split('-').map(Number)
  while (y < yHasta || (y === yHasta && m <= mHasta)) {
    meses.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return meses
}

// Calcula qué gastos recurrentes faltan por generar (desde el mes en que se
// configuró cada uno hasta el mes actual) y que aún no existen como
// transacción — para crearlos automáticamente sin que haya que darlos de
// alta a mano cada mes.
export function generarGastosPendientes(
  propiedades: Propiedad[],
  transacciones: Transaccion[],
  hoy: Date = new Date(),
): Transaccion[] {
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const nuevas: Transaccion[] = []

  for (const p of propiedades) {
    for (const g of p.gastosRecurrentes ?? []) {
      const mesInicio = g.creadoEn.slice(0, 7)
      if (mesInicio > mesActual) continue
      for (const mes of mesesEntre(mesInicio, mesActual)) {
        const yaExiste =
          transacciones.some(
            (t) => t.propiedadId === p.id && t.categoria === g.categoria && t.fecha.startsWith(mes),
          ) ||
          nuevas.some(
            (t) => t.propiedadId === p.id && t.categoria === g.categoria && t.fecha.startsWith(mes),
          )
        if (!yaExiste) {
          nuevas.push({
            id: crypto.randomUUID(),
            propiedadId: p.id,
            fecha: `${mes}-01`,
            tipo: 'gasto',
            importe: g.importe,
            categoria: g.categoria,
            descripcion: g.descripcion || 'Gasto fijo mensual',
            archivos: [],
            creadoEn: new Date().toISOString(),
          })
        }
      }
    }
  }

  return nuevas
}

// Aplica el % de propiedad de Jose a un importe — para propiedades a medias,
// todos los resúmenes de la app muestran ya solo su parte.
export function miParte(importe: number, propiedad: Pick<Propiedad, 'porcentajePropiedad'>): number {
  const pct = propiedad.porcentajePropiedad ?? 100
  return importe * (pct / 100)
}

// Snapshot de un alquiler ya terminado, guardado al pulsar "Terminar
// contrato" — permite que una propiedad tenga varios inquilinos/contratos
// a lo largo del tiempo sin perder el histórico de cada uno.
export interface ContratoHistorico {
  id: string
  inquilinoNombre?: string
  inquilinoEmail?: string
  inquilinoTelefono?: string
  inquilinoDni?: string
  alquilerMensual?: number
  fechaInicio?: string // YYYY-MM-DD
  fechaFin: string // YYYY-MM-DD — fecha real en que terminó
  contratoArchivoId?: string
  contratoArchivoNombre?: string
}

export interface Transaccion {
  id: string
  propiedadId: string
  fecha: string // YYYY-MM-DD
  tipo: TransaccionTipo
  importe: number
  categoria: string
  descripcion: string
  archivos: string[] // Drive file IDs
  creadoEn: string
  referencia?: string // nº factura / referencia
}

// A partir del día 5 del mes, si una propiedad alquilada (con alquiler
// mensual pactado) no tiene registrado el ingreso de "Alquiler mensual" de
// ese mes, se considera renta pendiente de cobro.
export function rentaPendiente(
  propiedad: Pick<Propiedad, 'estado' | 'alquilerMensual' | 'id'>,
  transacciones: Transaccion[],
  hoy: Date = new Date(),
): boolean {
  if (propiedad.estado !== 'alquilado') return false
  if (!propiedad.alquilerMensual) return false
  if (hoy.getDate() < 5) return false
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const pagado = transacciones.some(
    (t) =>
      t.propiedadId === propiedad.id &&
      t.tipo === 'ingreso' &&
      t.categoria === 'Alquiler mensual' &&
      t.fecha.startsWith(mesActual),
  )
  return !pagado
}

// ─── Reparto de suministros y tasas ────────────────────────────────────────────
// Para propiedades en alquiler: quién corre con el gasto de agua, luz,
// basuras e IBI — íntegro en el precio del alquiler, a cargo del inquilino,
// o una cantidad fija incluida en la renta (el resto de cada factura se
// repercute al inquilino).
export type SuministroModo = 'incluido' | 'no_incluido' | 'parcial'

export interface RepartoConcepto {
  modo: SuministroModo
  importeIncluido?: number // €/factura que cubre el propietario, solo si modo === 'parcial'
}

export type ConceptoReparto = 'agua' | 'luz' | 'basuras' | 'ibi'

export interface Reparto {
  agua?: RepartoConcepto
  luz?: RepartoConcepto
  basuras?: RepartoConcepto
  ibi?: RepartoConcepto
}

export const CONCEPTO_LABELS: Record<ConceptoReparto, string> = {
  agua: 'Agua',
  luz: 'Luz',
  basuras: 'Tasa de basuras',
  ibi: 'IBI',
}

// Categoría de gasto que corresponde a cada concepto repartible.
export const CONCEPTO_CATEGORIA: Record<ConceptoReparto, string> = {
  agua: 'Agua',
  luz: 'Electricidad',
  basuras: 'Tasa de basuras',
  ibi: 'IBI',
}

export interface RepartoCalculado {
  concepto: ConceptoReparto
  modo: SuministroModo
  propietario: number
  inquilino: number
}

// Dado un gasto (categoría + importe), calcula cuánto corresponde al
// propietario y cuánto es repercutible al inquilino, según la
// configuración de reparto de la propiedad. Devuelve null si la
// categoría no es una de las repartibles o no hay configuración.
export function calcularReparto(
  categoria: string,
  importe: number,
  reparto: Reparto | undefined,
): RepartoCalculado | null {
  if (!reparto) return null
  const concepto = (Object.keys(CONCEPTO_CATEGORIA) as ConceptoReparto[]).find(
    (c) => CONCEPTO_CATEGORIA[c] === categoria,
  )
  if (!concepto) return null
  const config = reparto[concepto]
  if (!config) return null

  if (config.modo === 'incluido') {
    return { concepto, modo: 'incluido', propietario: importe, inquilino: 0 }
  }
  if (config.modo === 'no_incluido') {
    return { concepto, modo: 'no_incluido', propietario: 0, inquilino: importe }
  }
  const propietario = Math.min(config.importeIncluido ?? 0, importe)
  return {
    concepto,
    modo: 'parcial',
    propietario,
    inquilino: importe - propietario,
  }
}

// ─── Renta de locales: IGIC + retención IRPF ───────────────────────────────────
// Para locales de negocio en Canarias: la renta bruta pactada (base
// imponible) lleva IGIC repercutido al inquilino (se suma) y retención de
// IRPF que el inquilino ingresa directamente en Hacienda (se resta) — lo que
// Jose recibe de verdad en el banco es la renta neta resultante.
export const IGIC_LOCAL_PCT = 7
export const IRPF_LOCAL_PCT = 19

export interface DesgloseRentaLocal {
  base: number
  igic: number
  irpf: number
  neta: number
}

export function calcularRentaLocal(rentaBruta: number): DesgloseRentaLocal {
  const igic = rentaBruta * (IGIC_LOCAL_PCT / 100)
  const irpf = rentaBruta * (IRPF_LOCAL_PCT / 100)
  return { base: rentaBruta, igic, irpf, neta: rentaBruta + igic - irpf }
}

// Inversa: reconstruye la base imponible a partir del importe neto ya
// guardado en una transacción (lo que se registra en la app) — para el
// Modelo 420, que necesita la base, no la neta.
export function baseDesdeRentaNeta(rentaNeta: number): number {
  return rentaNeta / (1 + IGIC_LOCAL_PCT / 100 - IRPF_LOCAL_PCT / 100)
}

export interface ResumenPropiedad {
  propiedad: Propiedad
  ingresosMes: number
  gastosMes: number
  ingresosAnio: number
  gastosAnio: number
  totalTransacciones: number
}

export const CATEGORIAS_GASTO = [
  'Electricidad',
  'Agua',
  'Gas',
  'Telefonía / Internet',
  'IBI',
  'Tasa de basuras',
  'IRPF / Retención',
  'Otros impuestos',
  'Comunidad de propietarios',
  'Seguro hogar',
  'Seguro impago',
  'Mantenimiento',
  'Reparaciones',
  'Hipoteca / Financiación',
  'Honorarios / Gestión',
  'Mobiliario / Equipamiento',
  'Obras / Reforma',
  'Otros gastos',
] as const

export const CATEGORIAS_INGRESO = [
  'Alquiler mensual',
  'Electricidad (repercutida)',
  'Agua (repercutida)',
  'Fianza recibida',
  'Devolución de fianza',
  'Otros ingresos',
] as const

export const TIPO_LABELS: Record<PropiedadTipo, string> = {
  piso: 'Piso',
  casa: 'Casa',
  local: 'Local',
  garaje: 'Garaje',
  otro: 'Otro',
}

export const ESTADO_LABELS: Record<PropiedadEstado, string> = {
  alquilado: 'Alquilado',
  vacio: 'Vacío',
  reforma: 'En reforma',
  venta: 'En venta',
  uso_propio: 'Uso propio',
  vivienda_habitual: 'Vivienda habitual',
}

// ─── Estimador de la Renta: cuánto guardar de los alquileres ───────────────────
// Aproximación, no un cálculo oficial: usa una reducción fija por vivienda
// habitual del inquilino y aplica los tramos progresivos del IRPF sobre la
// suma de todos los ingresos (rendimiento inmobiliario + otros ingresos).
// Los tramos son una escala combinada aproximada (estatal + autonómica
// genérica) — pueden no coincidir exactamente con los de tu comunidad
// autónoma o el año fiscal en curso.

export interface TramoIRPF {
  hasta: number // límite superior del tramo — Infinity en el último
  tipo: number // % marginal aplicable a la parte de base dentro de este tramo
}

export const TRAMOS_IRPF_APROX: TramoIRPF[] = [
  { hasta: 12450, tipo: 19 },
  { hasta: 20200, tipo: 24 },
  { hasta: 35200, tipo: 30 },
  { hasta: 60000, tipo: 37 },
  { hasta: 300000, tipo: 45 },
  { hasta: Infinity, tipo: 47 },
]

// Cuota íntegra progresiva: cada tramo de la base tributa a su propio tipo,
// no toda la base al tipo del tramo más alto.
export function cuotaIRPF(baseImponible: number, tramos: TramoIRPF[] = TRAMOS_IRPF_APROX): number {
  let cuota = 0
  let limiteAnterior = 0
  for (const tramo of tramos) {
    if (baseImponible <= limiteAnterior) break
    const baseTramo = Math.min(baseImponible, tramo.hasta) - limiteAnterior
    cuota += baseTramo * (tramo.tipo / 100)
    limiteAnterior = tramo.hasta
  }
  return cuota
}

// Tipo marginal (el tramo más alto que se alcanza) para una base dada.
export function tipoMarginalIRPF(baseImponible: number, tramos: TramoIRPF[] = TRAMOS_IRPF_APROX): number {
  for (const tramo of tramos) {
    if (baseImponible <= tramo.hasta) return tramo.tipo
  }
  return tramos[tramos.length - 1]?.tipo ?? 0
}

export interface IngresoExterno {
  id: string
  nombre: string
  importeAnual: number
  porcentajeRetencion: number // % de IRPF que ya te retienen en origen (informativo)
  creadoEn: string
}

// Categorías de ingreso que cuentan como rendimiento a efectos de IRPF —
// una fianza no es un ingreso, es un depósito, así que se excluye.
const CATEGORIAS_RENDIMIENTO: readonly string[] = [
  'Alquiler mensual',
  'Electricidad (repercutida)',
  'Agua (repercutida)',
  'Otros ingresos',
]

export interface EstimacionPropiedad {
  propiedad: Propiedad
  ingresos: number
  gastos: number
  rendimientoNeto: number
  reducible: boolean
  rendimientoComputable: number
}

export interface EstimacionRenta {
  porPropiedad: EstimacionPropiedad[]
  rendimientoInmobiliarioTotal: number
  irpfYaRetenidoLocales: number
  otrosIngresosTotal: number
  baseImponibleTotal: number
  cuotaSoloOtrosIngresos: number
  cuotaConAlquileres: number
  tipoMarginalPct: number
  irpfEstimadoAlquileres: number
  aGuardar: number
}

export function estimarAhorroRenta(
  propiedades: Propiedad[],
  transacciones: Transaccion[],
  ingresosExternos: IngresoExterno[],
  anio: string,
  reduccionViviendaPct: number,
): EstimacionRenta {
  const txsAnio = transacciones.filter((t) => t.fecha.startsWith(anio))

  const porPropiedad: EstimacionPropiedad[] = propiedades.map((p) => {
    const txs = txsAnio.filter((t) => t.propiedadId === p.id)
    const esLocal = p.tipo === 'local'

    const ingresos = txs
      .filter((t) => t.tipo === 'ingreso' && CATEGORIAS_RENDIMIENTO.includes(t.categoria))
      .reduce((s, t) => {
        const importe = miParte(t.importe, p)
        // El importe de alquiler de un local es la renta neta ya cobrada —
        // a efectos de IRPF cuenta la base imponible, no la neta.
        return s + (esLocal && t.categoria === 'Alquiler mensual' ? baseDesdeRentaNeta(importe) : importe)
      }, 0)

    const gastos = txs
      .filter((t) => t.tipo === 'gasto')
      .reduce((s, t) => s + miParte(t.importe, p), 0)

    const rendimientoNeto = ingresos - gastos
    const reducible = p.tipo === 'piso' || p.tipo === 'casa'
    const rendimientoComputable =
      reducible && rendimientoNeto > 0
        ? rendimientoNeto * (1 - reduccionViviendaPct / 100)
        : rendimientoNeto

    return { propiedad: p, ingresos, gastos, rendimientoNeto, reducible, rendimientoComputable }
  })

  const rendimientoInmobiliarioTotal = porPropiedad.reduce((s, f) => s + f.rendimientoComputable, 0)

  const irpfYaRetenidoLocales = propiedades
    .filter((p) => p.tipo === 'local')
    .reduce((sTotal, p) => {
      const netaTotal = txsAnio
        .filter((t) => t.propiedadId === p.id && t.tipo === 'ingreso' && t.categoria === 'Alquiler mensual')
        .reduce((s, t) => s + miParte(t.importe, p), 0)
      return sTotal + calcularRentaLocal(baseDesdeRentaNeta(netaTotal)).irpf
    }, 0)

  const otrosIngresosTotal = ingresosExternos.reduce((s, i) => s + i.importeAnual, 0)

  // El alquiler se suma "encima" de los demás ingresos: la base general es
  // progresiva y única, así que el impuesto que genera el alquiler es la
  // diferencia entre la cuota con todo sumado y la cuota que ya generarían
  // solo los otros ingresos por su cuenta.
  const rendimientoPositivo = Math.max(0, rendimientoInmobiliarioTotal)
  const baseImponibleTotal = otrosIngresosTotal + rendimientoPositivo
  const cuotaSoloOtrosIngresos = cuotaIRPF(otrosIngresosTotal)
  const cuotaConAlquileres = cuotaIRPF(baseImponibleTotal)
  const tipoMarginalPct = tipoMarginalIRPF(baseImponibleTotal)

  const irpfEstimadoAlquileres = Math.max(0, cuotaConAlquileres - cuotaSoloOtrosIngresos)
  const aGuardar = Math.max(0, irpfEstimadoAlquileres - irpfYaRetenidoLocales)

  return {
    porPropiedad,
    rendimientoInmobiliarioTotal,
    irpfYaRetenidoLocales,
    otrosIngresosTotal,
    baseImponibleTotal,
    cuotaSoloOtrosIngresos,
    cuotaConAlquileres,
    tipoMarginalPct,
    irpfEstimadoAlquileres,
    aGuardar,
  }
}

export const ESTADO_BADGE_VARIANT: Record<
  PropiedadEstado,
  'success' | 'warning' | 'error' | 'outline' | 'default'
> = {
  alquilado: 'success',
  vacio: 'warning',
  reforma: 'outline',
  venta: 'error',
  uso_propio: 'default',
  vivienda_habitual: 'default',
}
