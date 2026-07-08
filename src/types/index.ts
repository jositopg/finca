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
  alquilerMensual?: number
  contratoInicio?: string // YYYY-MM-DD
  contratoFin?: string // YYYY-MM-DD
  notas?: string
  contratoArchivoId?: string // Drive file ID del contrato de alquiler
  contratoArchivoNombre?: string
  reparto?: Reparto // quién paga agua/luz/basuras/IBI
  historialContratos?: ContratoHistorico[] // alquileres anteriores ya terminados
  porcentajePropiedad?: number // 0-100, % de la propiedad que es de Jose (sin definir = 100%)
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
