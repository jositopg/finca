import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  alquilerVigente,
  calcularRentaLocal,
  cobradoAlquilerEnMes,
  deudaInquilino,
  mesAlquilerMasAntiguoPendiente,
  rangoMesCivil,
  tramosEfectivos,
  type Propiedad,
  type Transaccion,
} from './index'

export interface CobroRentaInput {
  propiedad: Pick<Propiedad, 'id' | 'tipo'>
  mesPagado: string // 'YYYY-MM'
  fecha: string // 'YYYY-MM-DD' (fecha de cobro)
  rentaBruta: number // vivienda/garaje: renta del mes; local: base imponible
  id?: string
  creadoEn?: string
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Única forma de construir la transacción de un cobro de renta. La usan
// CobroRenta y el lote de CobrarVarios para que el dato sea el mismo.
export function construirCobroRenta(input: CobroRentaInput): Transaccion {
  const { propiedad, mesPagado, fecha, rentaBruta } = input
  const esLocal = propiedad.tipo === 'local'
  const desglose = esLocal ? calcularRentaLocal(rentaBruta) : null
  const importe = desglose ? desglose.neta : rentaBruta
  const periodo = rangoMesCivil(mesPagado)
  const mesTexto = format(new Date(`${periodo.inicio}T00:00:00`), 'MMMM yyyy', { locale: es })
  const descripcion = desglose
    ? `${mesTexto} · Base ${fmt(desglose.base)} € · IGIC +${fmt(desglose.igic)} € · IRPF -${fmt(desglose.irpf)} €`
    : mesTexto
  return {
    id: input.id ?? crypto.randomUUID(),
    propiedadId: propiedad.id,
    fecha,
    tipo: 'ingreso',
    importe,
    categoria: 'Alquiler mensual',
    descripcion,
    archivos: [],
    creadoEn: input.creadoEn ?? new Date().toISOString(),
    periodoInicio: periodo.inicio,
    periodoFin: periodo.fin,
  }
}

export type MotivoRevisar = 'deuda' | 'parcial' | 'cambio' | 'atrasado'

export interface FilaCobroLote {
  propiedad: Propiedad
  mesPagado: string
  rentaBruta: number
  importe: number
  cobradoAlAbrir: number
  motivos: MotivoRevisar[]
}

export function cambioCondicionesEnMes(propiedad: Propiedad, mes: string, hoy?: Date): boolean {
  const { inicio, fin } = rangoMesCivil(mes)
  const tramoNuevo = tramosEfectivos(propiedad).some(
    (t, i) => i > 0 && t.vigenteDesde >= inicio && t.vigenteDesde <= fin,
  )
  if (tramoNuevo) return true
  return alquilerVigente(propiedad, inicio, hoy) !== alquilerVigente(propiedad, fin, hoy)
}

export function filaCobroLote(
  propiedad: Propiedad,
  transacciones: Transaccion[],
  hoy: Date = new Date(),
): FilaCobroLote {
  const mesPagado = mesAlquilerMasAntiguoPendiente(propiedad, transacciones, hoy)
  const rentaBruta =
    alquilerVigente(propiedad, `${mesPagado}-01`, hoy) ?? alquilerVigente(propiedad, undefined, hoy) ?? 0
  const cobradoAlAbrir = cobradoAlquilerEnMes(propiedad.id, transacciones, mesPagado)
  const importe = construirCobroRenta({
    propiedad,
    mesPagado,
    fecha: '2000-01-01',
    rentaBruta,
    id: 'importe',
    creadoEn: '2000-01-01T00:00:00.000Z',
  }).importe
  const motivos: MotivoRevisar[] = []
  if (deudaInquilino(propiedad, transacciones, hoy) != null) motivos.push('deuda')
  if (cobradoAlAbrir > 0.005) motivos.push('parcial')
  if (cambioCondicionesEnMes(propiedad, mesPagado, hoy)) motivos.push('cambio')
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  if (mesPagado !== mesActual) motivos.push('atrasado')
  return { propiedad, mesPagado, rentaBruta, importe, cobradoAlAbrir, motivos }
}

export function propiedadesYaCobradas(filas: FilaCobroLote[], frescas: Transaccion[]): Set<string> {
  const ids = new Set<string>()
  for (const f of filas) {
    if (cobradoAlquilerEnMes(f.propiedad.id, frescas, f.mesPagado) > f.cobradoAlAbrir + 0.005) {
      ids.add(f.propiedad.id)
    }
  }
  return ids
}
