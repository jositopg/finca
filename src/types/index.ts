export type PropiedadTipo = 'piso' | 'casa' | 'local' | 'garaje' | 'otro'
export type PropiedadEstado = 'alquilado' | 'vacio' | 'reforma' | 'venta'
export type TransaccionTipo = 'ingreso' | 'gasto'

export interface Propiedad {
  id: string
  nombre: string
  direccion: string
  tipo: PropiedadTipo
  estado: PropiedadEstado
  folderId: string
  creadoEn: string
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
}

export interface Archivo {
  id: string
  nombre: string
  mimeType: string
  tamano: number
  propiedadId: string
  transaccionId: string
  webViewLink: string
  thumbnailLink?: string
  creadoEn: string
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
}
