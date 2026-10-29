// Traduce filas de Postgres al mismo tipo que `src/api/db.ts`. Si añades una
// columna al mapeo de la app, añádela aquí en el mismo commit: si no, el MCP
// calcula con un dato de menos.
import type {
  ContratoHistorico,
  GastoRecurrente,
  HuecoMensual,
  IngresoExterno,
  Propiedad,
  Reparto,
  Tarea,
  TareaEstado,
  TareaPrioridad,
  TramoContrato,
  Transaccion,
} from '../../src/types/index.ts'

type Fila = Record<string, unknown>

function texto(fila: Fila, clave: string): string | undefined {
  const valor = fila[clave]
  if (valor == null) return undefined
  if (valor instanceof Date) return valor.toISOString()
  return String(valor)
}

function dia(fila: Fila, clave: string): string | undefined {
  const valor = texto(fila, clave)
  return valor ? valor.slice(0, 10) : undefined
}

function numero(fila: Fila, clave: string): number | undefined {
  const valor = fila[clave]
  if (valor == null || valor === '') return undefined
  const n = Number(valor)
  return Number.isFinite(n) ? n : undefined
}

function json<T>(fila: Fila, clave: string): T | undefined {
  const valor = fila[clave]
  if (valor == null) return undefined
  return valor as T
}

export function filaAPropiedad(fila: Fila): Propiedad {
  return {
    id: texto(fila, 'id') ?? '',
    nombre: texto(fila, 'nombre') ?? '',
    direccion: texto(fila, 'direccion') ?? '',
    tipo: (texto(fila, 'tipo') ?? 'otro') as Propiedad['tipo'],
    estado: (texto(fila, 'estado') ?? 'vacio') as Propiedad['estado'],
    folderId: texto(fila, 'folder_id') ?? '',
    creadoEn: texto(fila, 'creado_en') ?? '',
    inquilinoNombre: texto(fila, 'inquilino_nombre'),
    inquilinoEmail: texto(fila, 'inquilino_email'),
    inquilinoTelefono: texto(fila, 'inquilino_telefono'),
    inquilinoDni: texto(fila, 'inquilino_dni'),
    alquilerMensual: numero(fila, 'alquiler_mensual'),
    contratoInicio: dia(fila, 'contrato_inicio'),
    contratoFin: dia(fila, 'contrato_fin'),
    notas: texto(fila, 'notas'),
    contratoArchivoId: texto(fila, 'contrato_archivo_id'),
    contratoArchivoNombre: texto(fila, 'contrato_archivo_nombre'),
    reparto: json<Reparto>(fila, 'reparto'),
    historialContratos: json<ContratoHistorico[]>(fila, 'historial_contratos'),
    tramosContrato: json<TramoContrato[]>(fila, 'tramos_contrato'),
    porcentajePropiedad: numero(fila, 'porcentaje_propiedad'),
    gastosRecurrentes: json<GastoRecurrente[]>(fila, 'gastos_recurrentes'),
    referenciaCatastral: texto(fila, 'referencia_catastral'),
    municipio: texto(fila, 'municipio'),
    valorReferencia: numero(fila, 'valor_referencia'),
    valorMercado: numero(fila, 'valor_mercado'),
    propietarioNombre: texto(fila, 'propietario_nombre'),
    alDiaDesde: texto(fila, 'al_dia_desde'),
    contratoLuzNumero: texto(fila, 'contrato_luz_numero'),
    contratoLuzEmpresa: texto(fila, 'contrato_luz_empresa'),
    contratoAguaNumero: texto(fila, 'contrato_agua_numero'),
    contratoAguaEmpresa: texto(fila, 'contrato_agua_empresa'),
    deudaDesde: texto(fila, 'deuda_desde'),
    rentaRevisadaDesde: texto(fila, 'renta_revisada_desde'),
    valorConstruccion: numero(fila, 'valor_construccion'),
    certificadoEnergeticoVencimiento: dia(fila, 'certificado_energetico_vencimiento'),
    fianzaImporte: numero(fila, 'fianza_importe'),
    fianzaDepositadaDesde: texto(fila, 'fianza_depositada_desde'),
    diaCobro: numero(fila, 'dia_cobro'),
    fianzaDepositoNumero: texto(fila, 'fianza_deposito_numero'),
    fianzaDepositoArchivoId: texto(fila, 'fianza_deposito_archivo_id'),
    fianzaDepositoArchivoNombre: texto(fila, 'fianza_deposito_archivo_nombre'),
    seguroVencimiento: dia(fila, 'seguro_vencimiento'),
    ibiMes: numero(fila, 'ibi_mes'),
    huecosMensualesOmitidos: json<HuecoMensual[]>(fila, 'huecos_mensuales_omitidos'),
  }
}

export function filaATransaccion(fila: Fila): Transaccion {
  return {
    id: texto(fila, 'id') ?? '',
    propiedadId: texto(fila, 'propiedad_id') ?? '',
    fecha: dia(fila, 'fecha') ?? '',
    tipo: (texto(fila, 'tipo') ?? 'gasto') as Transaccion['tipo'],
    importe: numero(fila, 'importe') ?? 0,
    categoria: texto(fila, 'categoria') ?? '',
    descripcion: texto(fila, 'descripcion') ?? '',
    archivos: json<string[]>(fila, 'archivos') ?? [],
    creadoEn: texto(fila, 'creado_en') ?? '',
    referencia: texto(fila, 'referencia'),
    numeroFactura: texto(fila, 'numero_factura'),
    periodoInicio: dia(fila, 'periodo_inicio'),
    periodoFin: dia(fila, 'periodo_fin'),
    soloMio: fila.solo_mio == null ? undefined : Boolean(fila.solo_mio),
    igicSoportado: numero(fila, 'igic_soportado'),
    gastoRecurrenteId: texto(fila, 'gasto_recurrente_id'),
  }
}

export function filaATarea(fila: Fila): Tarea {
  return {
    id: texto(fila, 'id') ?? '',
    propiedadId: texto(fila, 'propiedad_id') ?? '',
    titulo: texto(fila, 'titulo') ?? '',
    descripcion: texto(fila, 'descripcion'),
    prioridad: (texto(fila, 'prioridad') ?? 'media') as TareaPrioridad,
    fechaLimite: dia(fila, 'fecha_limite'),
    estado: (texto(fila, 'estado') ?? 'pendiente') as TareaEstado,
    creadoEn: texto(fila, 'creado_en') ?? '',
  }
}

export function filaAIngresoExterno(fila: Fila): IngresoExterno {
  return {
    id: texto(fila, 'id') ?? '',
    nombre: texto(fila, 'nombre') ?? '',
    importeAnual: numero(fila, 'importe_anual') ?? 0,
    porcentajeRetencion: numero(fila, 'porcentaje_retencion') ?? 0,
    creadoEn: texto(fila, 'creado_en') ?? '',
  }
}
