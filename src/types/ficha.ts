// Ficha de escritura (herencia, donación o compra) y cuota del inmueble.
// La misma validación la usa el formulario y la herramienta fijar_ficha.
// El valor declarado en la herencia es valorAdquisicion: no hay otro campo.
import { parseImporte } from './importe.ts'

export class FichaError extends Error {}

export type TipoAdquisicion = 'herencia' | 'donacion' | 'compra'

export interface CuotaPropiedad {
  numerador: number
  denominador: number
  valor: number // decimal entre 0 y 1, a 6 decimales
}

export interface Financiacion {
  capitalPendiente?: number
  cuotaMensual?: number
  tipoInteres?: number
  fechaFin?: string // YYYY-MM-DD, puede ser futura
}

// Solo nombre y porcentaje. Ni DNI, ni email, ni teléfono, ni NIF.
export interface Copropietario {
  nombre: string
  porcentaje: number
}

export interface CamposFicha {
  referenciaCatastral?: string
  valorAdquisicion?: number
  fechaAdquisicion?: string
  tipoAdquisicion?: TipoAdquisicion
  metrosCuadrados?: number
  valorMercado?: number
  fechaValorMercado?: string
  valorReferencia?: number
  valorConstruccion?: number
  cuotaPropiedad?: CuotaPropiedad
  sinRenta?: boolean
  financiacion?: Financiacion
  copropietarios?: Copropietario[]
}

export const CAMPOS_FICHA = [
  'referenciaCatastral',
  'valorAdquisicion',
  'fechaAdquisicion',
  'tipoAdquisicion',
  'metrosCuadrados',
  'valorMercado',
  'fechaValorMercado',
  'valorReferencia',
  'valorConstruccion',
  'cuotaPropiedad',
  'sinRenta',
  'financiacion',
  'copropietarios',
] as const

export type ClaveFicha = (typeof CAMPOS_FICHA)[number]

export type ParcheFicha = Partial<{ [K in ClaveFicha]: CamposFicha[K] | null }>

const LISTA = new Set<string>(CAMPOS_FICHA)
const TIPOS_ADQUISICION = new Set<string>(['herencia', 'donacion', 'compra'])
const ALFABETO = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789'
const PESOS_DC = [13, 15, 12, 5, 4, 17, 9, 21, 3, 7, 1]
const LETRAS_DC = 'MQWERTYUIOPASDFGHJKLBZX'

export const CUOTA_ENTERA: CuotaPropiedad = { numerador: 1, denominador: 1, valor: 1 }

export function fechaDeHoy(hoy: Date = new Date()): string {
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `${hoy.getFullYear()}-${mes}-${dia}`
}

export function normalizarReferenciaCatastral(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase()
}

function digitoControl(trozo: string): string {
  let suma = 0
  for (let i = 0; i < trozo.length; i++) {
    const c = trozo[i]
    const valor = c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : ALFABETO.indexOf(c) + 1
    suma += PESOS_DC[i] * valor
  }
  return LETRAS_DC[suma % 23]
}

export function validarReferenciaCatastral(raw: string): string {
  const ref = normalizarReferenciaCatastral(raw)
  if (ref.length !== 20) {
    throw new FichaError('La referencia catastral tiene que tener 20 caracteres.')
  }
  if (![...ref].every((c) => ALFABETO.includes(c))) {
    throw new FichaError('La referencia catastral solo admite letras y números.')
  }
  const dc =
    digitoControl(ref.slice(0, 7) + ref.slice(14, 18)) +
    digitoControl(ref.slice(7, 14) + ref.slice(14, 18))
  if (dc !== ref.slice(18)) {
    throw new FichaError('La referencia catastral no cuadra: los dígitos de control no son válidos.')
  }
  return ref
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const t = y
    y = x % y
    x = t
  }
  return x || 1
}

function reducir(numerador: number, denominador: number): CuotaPropiedad {
  if (!Number.isInteger(numerador) || !Number.isInteger(denominador)) {
    throw new FichaError('La cuota tiene que ser una fracción de enteros, como 1/12.')
  }
  if (denominador === 0) throw new FichaError('La cuota no puede tener denominador 0.')
  if (denominador < 0) {
    numerador = -numerador
    denominador = -denominador
  }
  if (numerador <= 0 || numerador > denominador) {
    throw new FichaError('La cuota tiene que ser mayor que 0 y como máximo 1.')
  }
  const g = gcd(numerador, denominador)
  numerador /= g
  denominador /= g
  return { numerador, denominador, valor: Number((numerador / denominador).toFixed(6)) }
}

function fraccionDeDecimal(valor: number): CuotaPropiedad {
  let x = valor
  let h0 = 0
  let h1 = 1
  let k0 = 1
  let k1 = 0
  for (let i = 0; i < 30; i++) {
    const a = Math.floor(x + 1e-12)
    const h2 = a * h1 + h0
    const k2 = a * k1 + k0
    if (k2 > 100000) break
    h0 = h1
    h1 = h2
    k0 = k1
    k1 = k2
    const resto = x - a
    if (resto < 1e-10) break
    x = 1 / resto
  }
  return reducir(h1, k1)
}

export function validarCuota(raw: unknown): CuotaPropiedad {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0 || raw > 1) {
      throw new FichaError('La cuota tiene que ser mayor que 0 y como máximo 1.')
    }
    return fraccionDeDecimal(raw)
  }
  if (typeof raw !== 'string') {
    throw new FichaError('La cuota tiene que ser un número o una fracción como 1/12.')
  }
  const texto = raw.trim().replace(',', '.')
  const fraccion = /^(\d+)\s*\/\s*(\d+)$/.exec(texto)
  if (fraccion) return reducir(Number(fraccion[1]), Number(fraccion[2]))
  const n = Number(texto)
  if (!Number.isFinite(n) || n <= 0 || n > 1) {
    throw new FichaError('La cuota tiene que ser mayor que 0 y como máximo 1.')
  }
  return fraccionDeDecimal(n)
}

export function cuotaEfectiva(cuota: CuotaPropiedad | undefined): CuotaPropiedad {
  return cuota ?? CUOTA_ENTERA
}

export function textoCuota(cuota: CuotaPropiedad | undefined): string {
  const c = cuotaEfectiva(cuota)
  if (c.numerador === c.denominador) return '1'
  return `${c.numerador}/${c.denominador}`
}

// Parte del valor total que corresponde a esta ficha: total × cuota.
// El redondeo es a céntimos. El % de Jose (porcentajePropiedad) no entra aquí.
export function parteDeCuota(total: number, cuota: CuotaPropiedad): number {
  return Math.round((total * cuota.numerador * 100) / cuota.denominador) / 100
}

export interface ValorProporcional {
  total: number | null
  parteJose: number | null
}

export interface ValoresProporcionales {
  cuota: CuotaPropiedad
  mercado: ValorProporcional
  referencia: ValorProporcional
  construccion: ValorProporcional
  adquisicion: ValorProporcional
}

function valorDe(total: number | undefined, cuota: CuotaPropiedad): ValorProporcional {
  if (total == null || !Number.isFinite(total)) return { total: null, parteJose: null }
  const redondo = Math.round(total * 100) / 100
  return { total: redondo, parteJose: parteDeCuota(redondo, cuota) }
}

export function valoresProporcionales(p: {
  valorMercado?: number
  valorReferencia?: number
  valorConstruccion?: number
  valorAdquisicion?: number
  cuotaPropiedad?: CuotaPropiedad
}): ValoresProporcionales {
  const cuota = cuotaEfectiva(p.cuotaPropiedad)
  return {
    cuota,
    mercado: valorDe(p.valorMercado, cuota),
    referencia: valorDe(p.valorReferencia, cuota),
    construccion: valorDe(p.valorConstruccion, cuota),
    adquisicion: valorDe(p.valorAdquisicion, cuota),
  }
}

// Valor de patrimonio de Jose: parte de la cuota × % de propiedad.
// Mercado, o el valor de referencia si no hay mercado. Un tercero no cuenta.
// Un inmueble sin renta sí cuenta.
export function valorPatrimonioJose(p: {
  propietarioNombre?: string
  porcentajePropiedad?: number
  valorMercado?: number
  valorReferencia?: number
  cuotaPropiedad?: CuotaPropiedad
}): number | null {
  if (p.propietarioNombre) return null
  const v = valoresProporcionales(p)
  const base = v.mercado.parteJose ?? v.referencia.parteJose
  if (base == null) return null
  const pct = p.porcentajePropiedad ?? 100
  return Math.round(base * (pct / 100) * 100) / 100
}

export function validarFecha(raw: unknown, campo: string): string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new FichaError(`"${campo}" tiene que ser YYYY-MM-DD.`)
  }
  const [anio, mes, dia] = raw.split('-').map(Number)
  const comprobada = new Date(Date.UTC(anio, mes - 1, dia))
  if (comprobada.getUTCFullYear() !== anio || comprobada.getUTCMonth() !== mes - 1 || comprobada.getUTCDate() !== dia) {
    throw new FichaError(`"${campo}" no existe.`)
  }
  return raw
}

export function validarFechaNoFutura(raw: unknown, campo: string, hoy: string): string {
  const fecha = validarFecha(raw, campo)
  if (fecha > hoy) throw new FichaError(`"${campo}" no puede ser futura.`)
  return fecha
}

export function validarImporte(raw: unknown, campo: string, permitirCero = false): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseImporte(raw) : NaN
  if (!Number.isFinite(n)) throw new FichaError(`"${campo}" tiene que ser un importe.`)
  const redondo = Math.round(n * 100) / 100
  if (redondo < 0) throw new FichaError(`"${campo}" no puede ser negativo.`)
  if (!permitirCero && redondo === 0) throw new FichaError(`"${campo}" tiene que ser mayor que cero.`)
  return redondo
}

export function validarTipoAdquisicion(raw: unknown): TipoAdquisicion {
  if (typeof raw !== 'string' || !TIPOS_ADQUISICION.has(raw)) {
    throw new FichaError('"tipoAdquisicion" tiene que ser herencia, donacion o compra.')
  }
  return raw as TipoAdquisicion
}

function validarBandera(raw: unknown, campo: string): boolean {
  if (raw === true || raw === 'true') return true
  if (raw === false || raw === 'false') return false
  throw new FichaError(`"${campo}" tiene que ser true o false.`)
}

function validarFinanciacion(raw: unknown): Financiacion {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new FichaError('"financiacion" tiene que ser un objeto.')
  }
  const datos = raw as Record<string, unknown>
  const permitidas = new Set(['capitalPendiente', 'cuotaMensual', 'tipoInteres', 'fechaFin'])
  for (const clave of Object.keys(datos)) {
    if (!permitidas.has(clave)) throw new FichaError(`"${clave}" no es un dato de la financiación.`)
  }
  const out: Financiacion = {}
  if (datos.capitalPendiente != null && datos.capitalPendiente !== '') {
    out.capitalPendiente = validarImporte(datos.capitalPendiente, 'capitalPendiente', true)
  }
  if (datos.cuotaMensual != null && datos.cuotaMensual !== '') {
    out.cuotaMensual = validarImporte(datos.cuotaMensual, 'cuotaMensual', true)
  }
  if (datos.tipoInteres != null && datos.tipoInteres !== '') {
    const n = typeof datos.tipoInteres === 'number' ? datos.tipoInteres : Number(datos.tipoInteres)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new FichaError('"tipoInteres" tiene que estar entre 0 y 100.')
    }
    out.tipoInteres = Math.round(n * 10000) / 10000
  }
  if (datos.fechaFin != null && datos.fechaFin !== '') {
    out.fechaFin = validarFecha(datos.fechaFin, 'fechaFin')
  }
  if (Object.keys(out).length === 0) throw new FichaError('"financiacion" no trae ningún dato.')
  return out
}

export function validarCopropietarios(raw: unknown): Copropietario[] {
  if (!Array.isArray(raw)) throw new FichaError('"copropietarios" tiene que ser una lista.')
  if (raw.length === 0) return []
  const lista: Copropietario[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new FichaError('Cada copropietario tiene que tener nombre y porcentaje.')
    }
    const fila = item as Record<string, unknown>
    for (const clave of Object.keys(fila)) {
      if (clave !== 'nombre' && clave !== 'porcentaje') {
        throw new FichaError('"copropietarios" solo admite nombre y porcentaje.')
      }
    }
    if (typeof fila.nombre !== 'string' || !fila.nombre.trim()) {
      throw new FichaError('Cada copropietario tiene que tener nombre.')
    }
    const porcentaje = validarImporte(fila.porcentaje, 'porcentaje', false)
    if (porcentaje > 100) throw new FichaError('El porcentaje de un copropietario no puede pasar de 100.')
    lista.push({ nombre: fila.nombre.trim(), porcentaje })
  }
  const suma = Math.round(lista.reduce((s, c) => s + c.porcentaje, 0) * 100) / 100
  if (Math.abs(suma - 100) > 0.01) {
    throw new FichaError('Los porcentajes de los copropietarios tienen que sumar 100.')
  }
  return lista
}

function asignar(parche: ParcheFicha, clave: ClaveFicha, valor: CamposFicha[ClaveFicha] | null) {
  ;(parche as Record<string, unknown>)[clave] = valor
}

// null borra el campo. Una clave que no está en la lista blanca falla.
export function interpretarCamposFicha(entrada: unknown, hoy: string): ParcheFicha {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw new FichaError('"campos" tiene que ser un objeto.')
  }
  const datos = entrada as Record<string, unknown>
  const claves = Object.keys(datos)
  if (claves.length === 0) throw new FichaError('No hay ningún campo que guardar.')
  for (const clave of claves) {
    if (clave === 'valorDeclaradoHerencia') {
      throw new FichaError('"valorDeclaradoHerencia" no es un campo. Usa valorAdquisicion.')
    }
    if (!LISTA.has(clave)) throw new FichaError(`"${clave}" no es un campo de la ficha.`)
  }
  const parche: ParcheFicha = {}
  const leer = (clave: ClaveFicha, convertir: (valor: unknown) => CamposFicha[ClaveFicha]) => {
    if (!(clave in datos)) return
    const valor = datos[clave]
    asignar(parche, clave, valor == null ? null : convertir(valor))
  }
  leer('referenciaCatastral', (valor) => {
    if (typeof valor !== 'string') throw new FichaError('"referenciaCatastral" tiene que ser texto.')
    return validarReferenciaCatastral(valor)
  })
  leer('valorAdquisicion', (valor) => validarImporte(valor, 'valorAdquisicion'))
  leer('fechaAdquisicion', (valor) => validarFechaNoFutura(valor, 'fechaAdquisicion', hoy))
  leer('tipoAdquisicion', (valor) => validarTipoAdquisicion(valor))
  leer('metrosCuadrados', (valor) => validarImporte(valor, 'metrosCuadrados'))
  leer('valorMercado', (valor) => validarImporte(valor, 'valorMercado'))
  leer('fechaValorMercado', (valor) => validarFechaNoFutura(valor, 'fechaValorMercado', hoy))
  leer('valorReferencia', (valor) => validarImporte(valor, 'valorReferencia'))
  leer('valorConstruccion', (valor) => validarImporte(valor, 'valorConstruccion'))
  leer('cuotaPropiedad', (valor) => validarCuota(valor))
  leer('sinRenta', (valor) => validarBandera(valor, 'sinRenta'))
  leer('financiacion', (valor) => validarFinanciacion(valor))
  leer('copropietarios', (valor) => validarCopropietarios(valor))
  return parche
}

export function fusionarFicha<T extends CamposFicha>(actual: T, parche: ParcheFicha): T {
  const siguiente = { ...actual }
  for (const clave of Object.keys(parche) as ClaveFicha[]) {
    const valor = parche[clave]
    if (valor == null) delete siguiente[clave]
    else (siguiente as CamposFicha)[clave] = valor as never
  }
  return siguiente
}

export interface CambioFicha {
  campo: ClaveFicha
  antes: unknown
  despues: unknown
}

export function cambiosDeFicha(actual: CamposFicha, parche: ParcheFicha): CambioFicha[] {
  return (Object.keys(parche) as ClaveFicha[]).map((campo) => ({
    campo,
    antes: actual[campo] ?? null,
    despues: parche[campo] ?? null,
  }))
}
