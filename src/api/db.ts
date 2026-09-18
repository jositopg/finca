import { supabase } from './supabase'
import type {
  ContratoHistorico,
  DatosFacturacion,
  GastoRecurrente,
  IngresoExterno,
  Propiedad,
  Reparto,
  Tarea,
  TareaEstado,
  TareaPrioridad,
  TramoContrato,
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
  tramos_contrato: TramoContrato[] | null
  porcentaje_propiedad: number | string | null
  gastos_recurrentes: GastoRecurrente[] | null
  referencia_catastral: string | null
  municipio: string | null
  valor_referencia: number | string | null
  valor_mercado: number | string | null
  propietario_nombre: string | null
  al_dia_desde: string | null
  contrato_luz_numero: string | null
  contrato_luz_empresa: string | null
  contrato_agua_numero: string | null
  contrato_agua_empresa: string | null
  deuda_desde: string | null
  renta_revisada_desde: string | null
  valor_construccion: number | string | null
  certificado_energetico_vencimiento: string | null
  fianza_importe: number | string | null
  fianza_depositada_desde: string | null
  dia_cobro: number | string | null
  fianza_deposito_numero: string | null
  fianza_deposito_archivo_id: string | null
  fianza_deposito_archivo_nombre: string | null
  seguro_vencimiento: string | null
  ibi_mes: number | string | null
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
  numero_factura: string | null
  periodo_inicio: string | null
  periodo_fin: string | null
  solo_mio: boolean | null
  igic_soportado: number | string | null
  gasto_recurrente_id: string | null
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
    tramosContrato: row.tramos_contrato ?? undefined,
    porcentajePropiedad: row.porcentaje_propiedad != null ? Number(row.porcentaje_propiedad) : undefined,
    gastosRecurrentes: row.gastos_recurrentes ?? undefined,
    referenciaCatastral: row.referencia_catastral ?? undefined,
    municipio: row.municipio ?? undefined,
    valorReferencia: row.valor_referencia != null ? Number(row.valor_referencia) : undefined,
    valorMercado: row.valor_mercado != null ? Number(row.valor_mercado) : undefined,
    propietarioNombre: row.propietario_nombre ?? undefined,
    alDiaDesde: row.al_dia_desde ?? undefined,
    contratoLuzNumero: row.contrato_luz_numero ?? undefined,
    contratoLuzEmpresa: row.contrato_luz_empresa ?? undefined,
    contratoAguaNumero: row.contrato_agua_numero ?? undefined,
    contratoAguaEmpresa: row.contrato_agua_empresa ?? undefined,
    deudaDesde: row.deuda_desde ?? undefined,
    rentaRevisadaDesde: row.renta_revisada_desde ?? undefined,
    valorConstruccion: row.valor_construccion != null ? Number(row.valor_construccion) : undefined,
    certificadoEnergeticoVencimiento: row.certificado_energetico_vencimiento ?? undefined,
    fianzaImporte: row.fianza_importe != null ? Number(row.fianza_importe) : undefined,
    fianzaDepositadaDesde: row.fianza_depositada_desde ?? undefined,
    diaCobro: row.dia_cobro != null ? Number(row.dia_cobro) : undefined,
    fianzaDepositoNumero: row.fianza_deposito_numero ?? undefined,
    fianzaDepositoArchivoId: row.fianza_deposito_archivo_id ?? undefined,
    fianzaDepositoArchivoNombre: row.fianza_deposito_archivo_nombre ?? undefined,
    seguroVencimiento: row.seguro_vencimiento ?? undefined,
    ibiMes: row.ibi_mes != null ? Number(row.ibi_mes) : undefined,
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
    tramos_contrato: p.tramosContrato ?? null,
    porcentaje_propiedad: p.porcentajePropiedad ?? null,
    gastos_recurrentes: p.gastosRecurrentes ?? null,
    referencia_catastral: p.referenciaCatastral ?? null,
    municipio: p.municipio ?? null,
    valor_referencia: p.valorReferencia ?? null,
    valor_mercado: p.valorMercado ?? null,
    propietario_nombre: p.propietarioNombre ?? null,
    al_dia_desde: p.alDiaDesde ?? null,
    contrato_luz_numero: p.contratoLuzNumero ?? null,
    contrato_luz_empresa: p.contratoLuzEmpresa ?? null,
    contrato_agua_numero: p.contratoAguaNumero ?? null,
    contrato_agua_empresa: p.contratoAguaEmpresa ?? null,
    deuda_desde: p.deudaDesde ?? null,
    renta_revisada_desde: p.rentaRevisadaDesde ?? null,
    valor_construccion: p.valorConstruccion ?? null,
    certificado_energetico_vencimiento: p.certificadoEnergeticoVencimiento ?? null,
    fianza_importe: p.fianzaImporte ?? null,
    fianza_depositada_desde: p.fianzaDepositadaDesde ?? null,
    dia_cobro: p.diaCobro ?? null,
    fianza_deposito_numero: p.fianzaDepositoNumero ?? null,
    fianza_deposito_archivo_id: p.fianzaDepositoArchivoId ?? null,
    fianza_deposito_archivo_nombre: p.fianzaDepositoArchivoNombre ?? null,
    seguro_vencimiento: p.seguroVencimiento ?? null,
    ibi_mes: p.ibiMes ?? null,
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
    numeroFactura: row.numero_factura ?? undefined,
    periodoInicio: row.periodo_inicio ?? undefined,
    periodoFin: row.periodo_fin ?? undefined,
    soloMio: row.solo_mio ?? undefined,
    igicSoportado: row.igic_soportado != null ? Number(row.igic_soportado) : undefined,
    gastoRecurrenteId: row.gasto_recurrente_id ?? undefined,
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
    numero_factura: t.numeroFactura ?? null,
    periodo_inicio: t.periodoInicio ?? null,
    periodo_fin: t.periodoFin ?? null,
    solo_mio: t.soloMio ?? null,
    igic_soportado: t.igicSoportado ?? null,
    gasto_recurrente_id: t.gastoRecurrenteId ?? null,
  }
}

const PAGE_SIZE = 1000

async function fetchAllRows<T>(table: string, orderCol: string, ascending: boolean): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderCol, { ascending })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

// ─── Propiedades ─────────────────────────────────────────────────────────────

export async function getPropiedades(): Promise<Propiedad[]> {
  const data = await fetchAllRows<PropiedadRow>('propiedades', 'creado_en', true)
  return data.map(rowToPropiedad)
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
  const data = await fetchAllRows<TransaccionRow>('transacciones', 'fecha', false)
  return data.map(rowToTransaccion)
}

export async function addTransaccion(transaccion: Transaccion): Promise<void> {
  const { error } = await supabase.from('transacciones').insert(transaccionToRow(transaccion))
  if (error && !isUniqueViolation(error)) throw error
}

export async function addTransacciones(transacciones: Transaccion[]): Promise<void> {
  if (transacciones.length === 0) return
  const { error } = await supabase.from('transacciones').insert(transacciones.map(transaccionToRow))
  if (!error) return
  if (!isUniqueViolation(error)) throw error
  for (const t of transacciones) {
    await addTransaccion(t)
  }
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
  const data = await fetchAllRows<IngresoExternoRow>('ingresos_externos', 'creado_en', true)
  return data.map(rowToIngresoExterno)
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

// ─── Tareas por propiedad ────────────────────────────────────────────────────

interface TareaRow {
  id: string
  propiedad_id: string
  titulo: string
  descripcion: string | null
  prioridad: string
  fecha_limite: string | null
  estado: string
  creado_en: string
}

function rowToTarea(row: TareaRow): Tarea {
  return {
    id: row.id,
    propiedadId: row.propiedad_id,
    titulo: row.titulo,
    descripcion: row.descripcion ?? undefined,
    prioridad: row.prioridad as TareaPrioridad,
    fechaLimite: row.fecha_limite ?? undefined,
    estado: row.estado as TareaEstado,
    creadoEn: row.creado_en,
  }
}

export async function getTareas(): Promise<Tarea[]> {
  const data = await fetchAllRows<TareaRow>('tareas', 'creado_en', true)
  return data.map(rowToTarea)
}

export async function addTarea(tarea: Tarea): Promise<void> {
  const { error } = await supabase.from('tareas').insert({
    id: tarea.id,
    propiedad_id: tarea.propiedadId,
    titulo: tarea.titulo,
    descripcion: tarea.descripcion ?? null,
    prioridad: tarea.prioridad,
    fecha_limite: tarea.fechaLimite ?? null,
    estado: tarea.estado,
    creado_en: tarea.creadoEn,
  })
  if (error) throw error
}

export async function updateTarea(tarea: Tarea): Promise<void> {
  const { error } = await supabase
    .from('tareas')
    .update({
      titulo: tarea.titulo,
      descripcion: tarea.descripcion ?? null,
      prioridad: tarea.prioridad,
      fecha_limite: tarea.fechaLimite ?? null,
      estado: tarea.estado,
    })
    .eq('id', tarea.id)
  if (error) throw error
}

export async function deleteTarea(id: string): Promise<void> {
  const { error } = await supabase.from('tareas').delete().eq('id', id)
  if (error) throw error
}

// ─── Datos de facturación (emisor de facturas/recibos) ─────────────────────
// Fila única — se lee/escribe sin id porque el llamante nunca lo necesita.

interface DatosFacturacionRow {
  id: string
  nombre: string
  nif: string
  direccion: string
}

export async function getDatosFacturacion(): Promise<DatosFacturacion | null> {
  const { data, error } = await supabase
    .from('datos_facturacion')
    .select('*')
    .order('actualizado_en', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as DatosFacturacionRow
  return { nombre: row.nombre, nif: row.nif, direccion: row.direccion }
}

export async function guardarDatosFacturacion(d: DatosFacturacion): Promise<void> {
  const { data: existing, error: selectError } = await supabase
    .from('datos_facturacion')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (selectError) throw selectError

  if (existing) {
    const { error } = await supabase
      .from('datos_facturacion')
      .update({ nombre: d.nombre, nif: d.nif, direccion: d.direccion, actualizado_en: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('datos_facturacion')
      .insert({ nombre: d.nombre, nif: d.nif, direccion: d.direccion })
    if (error) throw error
  }
}
