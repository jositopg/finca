import { supabase } from './supabase'
import type {
  ContratoHistorico,
  GastoRecurrente,
  IngresoExterno,
  Propiedad,
  Reparto,
  Transaccion,
} from '../types'

// ─── Row <-> tipo mapping ───────────────────────────────────────────────────

interface PropiedadRow {
  id: string
  nombre: string
  direccion: string
  tipo: string
  estado: string
  folder_id: string
  creado_en: string
  inquilino_nombre: string | null
  inquilino_email: string | null
  inquilino_telefono: string | null
  inquilino_dni: string | null
  alquiler_mensual: number | string | null
  contrato_inicio: string | null
  contrato_fin: string | null
  notas: string | null
  contrato_archivo_id: string | null
  contrato_archivo_nombre: string | null
  reparto: Reparto | null
  historial_contratos: ContratoHistorico[] | null
  porcentaje_propiedad: number | string | null
  gastos_recurrentes: GastoRecurrente[] | null
  referencia_catastral: string | null
  municipio: string | null
  valor_referencia: number | string | null
  valor_mercado: number | string | null
  propietario_nombre: string | null
}

interface TransaccionRow {
  id: string
  propiedad_id: string
  fecha: string
  tipo: string
  importe: number | string
  categoria: string
  descripcion: string
  archivos: string[] | null
  creado_en: string
  referencia: string | null
}

function rowToPropiedad(row: PropiedadRow): Propiedad {
  return {
    id: row.id,
    nombre: row.nombre,
    direccion: row.direccion,
    tipo: row.tipo as Propiedad['tipo'],
    estado: row.estado as Propiedad['estado'],
    folderId: row.folder_id,
    creadoEn: row.creado_en,
    inquilinoNombre: row.inquilino_nombre ?? undefined,
    inquilinoEmail: row.inquilino_email ?? undefined,
    inquilinoTelefono: row.inquilino_telefono ?? undefined,
    inquilinoDni: row.inquilino_dni ?? undefined,
    alquilerMensual: row.alquiler_mensual != null ? Number(row.alquiler_mensual) : undefined,
    contratoInicio: row.contrato_inicio ?? undefined,
    contratoFin: row.contrato_fin ?? undefined,
    notas: row.notas ?? undefined,
    contratoArchivoId: row.contrato_archivo_id ?? undefined,
    contratoArchivoNombre: row.contrato_archivo_nombre ?? undefined,
    reparto: row.reparto ?? undefined,
    historialContratos: row.historial_contratos ?? undefined,
    porcentajePropiedad: row.porcentaje_propiedad != null ? Number(row.porcentaje_propiedad) : undefined,
    gastosRecurrentes: row.gastos_recurrentes ?? undefined,
    referenciaCatastral: row.referencia_catastral ?? undefined,
    municipio: row.municipio ?? undefined,
    valorReferencia: row.valor_referencia != null ? Number(row.valor_referencia) : undefined,
    valorMercado: row.valor_mercado != null ? Number(row.valor_mercado) : undefined,
    propietarioNombre: row.propietario_nombre ?? undefined,
  }
}

function propiedadToRow(p: Propiedad): Omit<PropiedadRow, 'creado_en'> & { creado_en?: string } {
  return {
    id: p.id,
    nombre: p.nombre,
    direccion: p.direccion,
    tipo: p.tipo,
    estado: p.estado,
    folder_id: p.folderId,
    creado_en: p.creadoEn,
    inquilino_nombre: p.inquilinoNombre ?? null,
    inquilino_email: p.inquilinoEmail ?? null,
    inquilino_telefono: p.inquilinoTelefono ?? null,
    inquilino_dni: p.inquilinoDni ?? null,
    alquiler_mensual: p.alquilerMensual ?? null,
    contrato_inicio: p.contratoInicio ?? null,
    contrato_fin: p.contratoFin ?? null,
    notas: p.notas ?? null,
    contrato_archivo_id: p.contratoArchivoId ?? null,
    contrato_archivo_nombre: p.contratoArchivoNombre ?? null,
    reparto: p.reparto ?? null,
    historial_contratos: p.historialContratos ?? null,
    porcentaje_propiedad: p.porcentajePropiedad ?? null,
    gastos_recurrentes: p.gastosRecurrentes ?? null,
    referencia_catastral: p.referenciaCatastral ?? null,
    municipio: p.municipio ?? null,
    valor_referencia: p.valorReferencia ?? null,
    valor_mercado: p.valorMercado ?? null,
    propietario_nombre: p.propietarioNombre ?? null,
  }
}

function rowToTransaccion(row: TransaccionRow): Transaccion {
  return {
    id: row.id,
    propiedadId: row.propiedad_id,
    fecha: row.fecha,
    tipo: row.tipo as Transaccion['tipo'],
    importe: Number(row.importe),
    categoria: row.categoria,
    descripcion: row.descripcion,
    archivos: row.archivos ?? [],
    creadoEn: row.creado_en,
    referencia: row.referencia ?? undefined,
  }
}

function transaccionToRow(t: Transaccion): TransaccionRow {
  return {
    id: t.id,
    propiedad_id: t.propiedadId,
    fecha: t.fecha,
    tipo: t.tipo,
    importe: t.importe,
    categoria: t.categoria,
    descripcion: t.descripcion,
    archivos: t.archivos,
    creado_en: t.creadoEn,
    referencia: t.referencia ?? null,
  }
}

// ─── Propiedades ─────────────────────────────────────────────────────────────

export async function getPropiedades(): Promise<Propiedad[]> {
  const { data, error } = await supabase
    .from('propiedades')
    .select('*')
    .order('creado_en', { ascending: true })
  if (error) throw error
  return (data as PropiedadRow[]).map(rowToPropiedad)
}

export async function addPropiedad(propiedad: Propiedad): Promise<void> {
  const { error } = await supabase.from('propiedades').insert(propiedadToRow(propiedad))
  if (error) throw error
}

export async function updatePropiedad(propiedad: Propiedad): Promise<void> {
  const { error } = await supabase
    .from('propiedades')
    .update(propiedadToRow(propiedad))
    .eq('id', propiedad.id)
  if (error) throw error
}

export async function deletePropiedad(propiedadId: string): Promise<void> {
  const { error } = await supabase.from('propiedades').delete().eq('id', propiedadId)
  if (error) throw error
}

// ─── Transacciones ───────────────────────────────────────────────────────────

export async function getTransacciones(): Promise<Transaccion[]> {
  const { data, error } = await supabase
    .from('transacciones')
    .select('*')
    .order('fecha', { ascending: false })
  if (error) throw error
  return (data as TransaccionRow[]).map(rowToTransaccion)
}

export async function addTransaccion(transaccion: Transaccion): Promise<void> {
  const { error } = await supabase.from('transacciones').insert(transaccionToRow(transaccion))
  if (error) throw error
}

export async function updateTransaccion(transaccion: Transaccion): Promise<void> {
  const { error } = await supabase
    .from('transacciones')
    .update(transaccionToRow(transaccion))
    .eq('id', transaccion.id)
  if (error) throw error
}

export async function deleteTransaccion(transaccionId: string): Promise<void> {
  const { error } = await supabase.from('transacciones').delete().eq('id', transaccionId)
  if (error) throw error
}

// ─── Ingresos externos (para el estimador de la Renta) ────────────────────────

interface IngresoExternoRow {
  id: string
  nombre: string
  importe_anual: number | string
  porcentaje_retencion: number | string
  creado_en: string
}

function rowToIngresoExterno(row: IngresoExternoRow): IngresoExterno {
  return {
    id: row.id,
    nombre: row.nombre,
    importeAnual: Number(row.importe_anual),
    porcentajeRetencion: Number(row.porcentaje_retencion),
    creadoEn: row.creado_en,
  }
}

export async function getIngresosExternos(): Promise<IngresoExterno[]> {
  const { data, error } = await supabase
    .from('ingresos_externos')
    .select('*')
    .order('creado_en', { ascending: true })
  if (error) throw error
  return (data as IngresoExternoRow[]).map(rowToIngresoExterno)
}

export async function addIngresoExterno(ingreso: IngresoExterno): Promise<void> {
  const { error } = await supabase.from('ingresos_externos').insert({
    id: ingreso.id,
    nombre: ingreso.nombre,
    importe_anual: ingreso.importeAnual,
    porcentaje_retencion: ingreso.porcentajeRetencion,
    creado_en: ingreso.creadoEn,
  })
  if (error) throw error
}

export async function updateIngresoExterno(ingreso: IngresoExterno): Promise<void> {
  const { error } = await supabase
    .from('ingresos_externos')
    .update({
      nombre: ingreso.nombre,
      importe_anual: ingreso.importeAnual,
      porcentaje_retencion: ingreso.porcentajeRetencion,
    })
    .eq('id', ingreso.id)
  if (error) throw error
}

export async function deleteIngresoExterno(id: string): Promise<void> {
  const { error } = await supabase.from('ingresos_externos').delete().eq('id', id)
  if (error) throw error
}
