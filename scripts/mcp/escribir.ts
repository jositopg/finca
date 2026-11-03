// Escrituras con nombre. Sin confirmar no se guarda nada. Con confirmar
// hace falta una clave estable: si se repite, se devuelve el mismo resultado
// y no se inserta otra fila.
import { randomUUID } from 'node:crypto'
import {
  CATEGORIAS_GASTO,
  CATEGORIAS_INGRESO,
  FichaError,
  aplicarCambioCondiciones,
  alquilerVigente,
  cambiosDeFicha,
  diaAnteriorISO,
  fechaDeHoy,
  fusionarFicha,
  interpretarCamposFicha,
  facturaYaRegistrada,
  interpretarNumeroFactura,
  parseImporte,
  type CamposFicha,
  type ConceptoFijo,
  type InclusionAguaLuz,
  type ParcheFicha,
  type Propiedad,
  type Reparto,
  type Tarea,
  type TramoContrato,
  type Transaccion,
} from '../../src/types/index.ts'
import { ConsultaError, fichaPublica, normalizar, resolverFinca } from './consultar.ts'
import type { Foto } from './foto.ts'

export interface FichaEscritura {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface Orden {
  herramienta: string
  confirmar: boolean
  clave?: string
  vista: Record<string, unknown>
  sentencias: { sql: string; params: unknown[] }[]
  resultado: Record<string, unknown>
}

const CLAVES = new Set(['registrar_cobro', 'registrar_gasto', 'cerrar_tarea', 'fijar_ficha'])

export function esEscritura(nombre: string): boolean {
  return CLAVES.has(nombre)
}

const esquemaComun = {
  clave: {
    type: 'string',
    description: 'Obligatoria si confirmar es true. De 8 a 80 caracteres estables. La misma clave no escribe dos veces.',
  },
  confirmar: {
    type: 'boolean',
    description: 'Por defecto false: solo enseña lo que se guardaría. true lo escribe.',
  },
}

export const fichasEscritura: FichaEscritura[] = [
  {
    name: 'registrar_cobro',
    description:
      'Registra un ingreso en una finca. Por defecto es el alquiler del mes, con el periodo de ese mes. En un local el importe es la neta que entra en el banco. Sin confirmar:true no escribe. No genera factura ni toca archivos.',
    inputSchema: {
      type: 'object',
      properties: {
        finca: { type: 'string', description: 'Nombre o id.' },
        importe: { type: 'string', description: 'Euros. Admite 1.200,50.' },
        fecha: { type: 'string', description: 'YYYY-MM-DD. Por defecto hoy. Es el día en que entra el dinero.' },
        mes: { type: 'string', description: 'YYYY-MM del alquiler que se paga. Por defecto el mes de la fecha.' },
        categoria: { type: 'string', description: `Por defecto Alquiler mensual. Una de: ${CATEGORIAS_INGRESO.join(', ')}.` },
        descripcion: { type: 'string' },
        soloMio: { type: 'boolean', description: 'true cuenta el 100% para Jose en una finca a medias.' },
        ...esquemaComun,
      },
      required: ['finca', 'importe'],
      additionalProperties: false,
    },
  },
  {
    name: 'registrar_gasto',
    description:
      'Registra un gasto en una finca. La categoría tiene que ser una de la app. El IGIC soportado solo vale en un local. numeroFactura (1 a 60, se guarda sin espacios y en mayúsculas) no puede repetirse en la misma finca: la vista previa ya lo rechaza. periodoInicio y periodoFin son YYYY-MM-DD y el inicio no puede ser posterior al fin. Sin esos campos el gasto se guarda como hasta ahora. Sin confirmar:true no escribe.',
    inputSchema: {
      type: 'object',
      properties: {
        finca: { type: 'string', description: 'Nombre o id.' },
        importe: { type: 'string', description: 'Euros. Admite 1.200,50.' },
        categoria: { type: 'string', description: CATEGORIAS_GASTO.join(', ') },
        fecha: { type: 'string', description: 'YYYY-MM-DD. Por defecto hoy.' },
        mes: { type: 'string', description: 'YYYY-MM del periodo facturado, si no pasas periodoInicio y periodoFin.' },
        periodoInicio: { type: 'string', description: 'YYYY-MM-DD. Junto con periodoFin.' },
        periodoFin: { type: 'string', description: 'YYYY-MM-DD. No puede ser anterior a periodoInicio.' },
        numeroFactura: {
          type: 'string',
          description: 'Número de la factura del proveedor. De 1 a 60 caracteres. Único en la finca.',
        },
        descripcion: { type: 'string' },
        igicSoportado: { type: 'number', description: 'IGIC incluido en el gasto. Solo en locales.' },
        soloMio: { type: 'boolean' },
        ...esquemaComun,
      },
      required: ['finca', 'importe', 'categoria'],
      additionalProperties: false,
    },
  },
  {
    name: 'fijar_ficha',
    description:
      'Actualiza la ficha de un inmueble que ya existe. Escritura: referencia catastral, valor y fecha de adquisición (herencia, donación o compra; el valor declarado va en valorAdquisicion), m², valores de mercado, referencia y construcción, cuota (número o fracción 1/12), sinRenta, financiación y copropietarios (solo nombre y %). Contrato: alquilerMensual abre un tramo desde fechaEfecto (no pisa la renta anterior), aguaLuz (incluido, no_incluido o parcial_conjunto) y conceptosFijos (importes que el inquilino paga cada mes además de la renta, p.ej. basura). Sin confirmar:true no escribe y devuelve el antes y el después. Si cambia la renta, la vista previa trae el importe anterior, el nuevo y la fecha. Al confirmar hace falta clave. No crea inmuebles: uno nuevo se da de alta en la app. No toca DNI, email, teléfono ni NIF.',
    inputSchema: {
      type: 'object',
      properties: {
        finca: { type: 'string', description: 'Nombre o id de un inmueble que ya existe.' },
        campos: {
          type: 'object',
          description:
            'Solo los campos a cambiar. referenciaCatastral, valorAdquisicion, fechaAdquisicion, tipoAdquisicion (herencia|donacion|compra), metrosCuadrados, valorMercado, fechaValorMercado, valorReferencia, valorConstruccion, cuotaPropiedad (número o texto a/b), sinRenta, financiacion {capitalPendiente, cuotaMensual, tipoInteres, fechaFin}, copropietarios [{nombre, porcentaje}] que sumen 100, alquilerMensual (>0, obliga a fechaEfecto YYYY-MM-DD y abre un tramo), aguaLuz {modo: incluido|no_incluido|parcial_conjunto, importeMensual si es parcial_conjunto}, conceptosFijos [{concepto, importeMensual}]. null borra el campo.',
          properties: {
            referenciaCatastral: { type: 'string' },
            valorAdquisicion: { type: 'number' },
            fechaAdquisicion: { type: 'string' },
            tipoAdquisicion: { type: 'string' },
            metrosCuadrados: { type: 'number' },
            valorMercado: { type: 'number' },
            fechaValorMercado: { type: 'string' },
            valorReferencia: { type: 'number' },
            valorConstruccion: { type: 'number' },
            cuotaPropiedad: {},
            sinRenta: { type: 'boolean' },
            financiacion: { type: 'object' },
            copropietarios: { type: 'array' },
            alquilerMensual: { type: 'number', description: 'Nueva renta, mayor que 0. Crea un tramo; no sustituye el historial.' },
            fechaEfecto: { type: 'string', description: 'YYYY-MM-DD. Obligatoria si va alquilerMensual. vigenteDesde del tramo.' },
            aguaLuz: {
              type: 'object',
              properties: {
                modo: { type: 'string', description: 'incluido, no_incluido o parcial_conjunto.' },
                importeMensual: { type: 'number', description: 'Obligatorio si modo es parcial_conjunto. Mayor que 0.' },
              },
            },
            conceptosFijos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  concepto: { type: 'string', description: 'De 1 a 40 caracteres.' },
                  importeMensual: { type: 'number', description: 'Mayor que 0.' },
                },
              },
            },
          },
          additionalProperties: false,
        },
        ...esquemaComun,
      },
      required: ['finca', 'campos'],
      additionalProperties: false,
    },
  },
  {
    name: 'cerrar_tarea',
    description: 'Marca una tarea pendiente como hecha. Pasa id o finca más titulo. Sin confirmar:true no escribe.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Id que devuelve tareas.' },
        finca: { type: 'string', description: 'Nombre o id, si no pasas id.' },
        titulo: { type: 'string' },
        ...esquemaComun,
      },
      additionalProperties: false,
    },
  },
]

function argsDe(args: unknown): Record<string, unknown> {
  if (args == null) return {}
  if (typeof args !== 'object' || Array.isArray(args)) throw new ConsultaError('Los argumentos tienen que ser un objeto.')
  return args as Record<string, unknown>
}

function texto(args: Record<string, unknown>, clave: string): string | undefined {
  const valor = args[clave]
  if (valor == null || valor === '') return undefined
  if (typeof valor !== 'string') throw new ConsultaError(`"${clave}" tiene que ser texto.`)
  const recorte = valor.trim()
  return recorte || undefined
}

function fechaHoy(hoy: Date): string {
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `${hoy.getFullYear()}-${mes}-${dia}`
}

function fechaTexto(valor: string, etiqueta: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new ConsultaError(`"${etiqueta}" tiene que ser YYYY-MM-DD.`)
  const [anio, mes, dia] = valor.split('-').map(Number)
  const comprobada = new Date(Date.UTC(anio, mes - 1, dia))
  if (comprobada.getUTCFullYear() !== anio || comprobada.getUTCMonth() !== mes - 1 || comprobada.getUTCDate() !== dia) {
    throw new ConsultaError(`"${etiqueta}" no existe.`)
  }
  return valor
}

function fechaDe(args: Record<string, unknown>, hoy: Date): string {
  return fechaTexto(texto(args, 'fecha') ?? fechaHoy(hoy), 'fecha')
}

function periodoExplicito(args: Record<string, unknown>): { inicio: string; fin: string } | undefined {
  const inicio = texto(args, 'periodoInicio')
  const fin = texto(args, 'periodoFin')
  if (!inicio && !fin) return undefined
  if (!inicio || !fin) throw new ConsultaError('El periodo necesita "periodoInicio" y "periodoFin".')
  const desde = fechaTexto(inicio, 'periodoInicio')
  const hasta = fechaTexto(fin, 'periodoFin')
  if (desde > hasta) throw new ConsultaError('El periodo no puede terminar antes de empezar.')
  return { inicio: desde, fin: hasta }
}

function numeroFacturaDe(args: Record<string, unknown>): string | undefined {
  const crudo = texto(args, 'numeroFactura')
  if (!crudo) return undefined
  const leido = interpretarNumeroFactura(crudo)
  if (leido.error || !leido.numero) throw new ConsultaError(leido.error ?? '"numeroFactura" no es válido.')
  return leido.numero
}

export function intencionDe(args: unknown): { confirmar: boolean; clave?: string } {
  const datos = argsDe(args)
  const confirmar = confirmarDe(datos)
  return { confirmar, clave: claveDe(datos, confirmar) }
}

function mesDe(args: Record<string, unknown>, fecha: string): string {
  const mes = texto(args, 'mes') ?? fecha.slice(0, 7)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ConsultaError('"mes" tiene que ser YYYY-MM.')
  return mes
}

function finDeMes(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(anio, numero, 0)).getUTCDate()
  return `${mes}-${String(ultimo).padStart(2, '0')}`
}

function euros(args: Record<string, unknown>, clave: string): number {
  const valor = args[clave]
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' ? parseImporte(valor) : NaN
  if (!Number.isFinite(n) || n <= 0) throw new ConsultaError(`"${clave}" tiene que ser un importe mayor que cero.`)
  return Math.round(n * 100) / 100
}

function eurosOpcional(args: Record<string, unknown>, clave: string): number | undefined {
  if (args[clave] == null || args[clave] === '') return undefined
  const n = euros(args, clave)
  return n
}

function bandera(args: Record<string, unknown>, clave: string): boolean | undefined {
  const valor = args[clave]
  if (valor == null || valor === '') return undefined
  if (valor === true || valor === 'true') return true
  if (valor === false || valor === 'false') return false
  throw new ConsultaError(`"${clave}" tiene que ser true o false.`)
}

function claveDe(args: Record<string, unknown>, confirmar: boolean): string | undefined {
  const clave = texto(args, 'clave')
  if (!clave) {
    if (confirmar) throw new ConsultaError('Para escribir hace falta "clave", un texto estable para no duplicar.')
    return undefined
  }
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(clave)) {
    throw new ConsultaError('"clave" tiene que tener entre 8 y 80 letras, números, puntos, guiones o dos puntos.')
  }
  return clave
}

function confirmarDe(args: Record<string, unknown>): boolean {
  return bandera(args, 'confirmar') ?? false
}

function movimientoDe(t: Transaccion, finca: Propiedad) {
  return {
    id: t.id,
    finca: finca.nombre,
    fecha: t.fecha,
    tipo: t.tipo,
    categoria: t.categoria,
    importe: t.importe,
    descripcion: t.descripcion,
    periodoInicio: t.periodoInicio ?? null,
    periodoFin: t.periodoFin ?? null,
    numeroFactura: t.numeroFactura ?? null,
    soloMio: t.soloMio ?? false,
    igicSoportado: t.igicSoportado ?? null,
  }
}

const INSERT_MOVIMIENTO = `insert into transacciones (
  id, propiedad_id, fecha, tipo, importe, categoria, descripcion, archivos, creado_en,
  periodo_inicio, periodo_fin, solo_mio, igic_soportado, numero_factura
) values ($1,$2,$3,$4,$5,$6,$7,'[]'::jsonb,$8,$9,$10,$11,$12,$13)`

const COLUMNAS_FICHA: Partial<Record<keyof CamposFicha, string>> = {
  referenciaCatastral: 'referencia_catastral',
  valorAdquisicion: 'valor_adquisicion',
  fechaAdquisicion: 'fecha_adquisicion',
  tipoAdquisicion: 'tipo_adquisicion',
  metrosCuadrados: 'metros_cuadrados',
  valorMercado: 'valor_mercado',
  fechaValorMercado: 'fecha_valor_mercado',
  valorReferencia: 'valor_referencia',
  valorConstruccion: 'valor_construccion',
  sinRenta: 'sin_renta',
}

type ExtraSql = {
  tramosContrato?: TramoContrato[]
  alquilerMensual?: number | null
  contratoFin?: string | null
  fianzaImporte?: number | null
  rentaRevisadaDesde?: string | null
  reparto?: Reparto | null
  conceptosFijos?: ConceptoFijo[] | null
}

function sqlFicha(id: string, parche: ParcheFicha, extra: ExtraSql = {}): { sql: string; params: unknown[] } {
  const sets: string[] = []
  const params: unknown[] = []
  const add = (columna: string, valor: unknown, cast = '') => {
    params.push(valor)
    sets.push(`${columna} = $${params.length}${cast}`)
  }
  for (const campo of Object.keys(COLUMNAS_FICHA) as (keyof CamposFicha)[]) {
    if (!(campo in parche)) continue
    add(COLUMNAS_FICHA[campo] as string, parche[campo] ?? null)
  }
  if ('cuotaPropiedad' in parche) {
    const cuota = parche.cuotaPropiedad
    add('cuota_numerador', cuota?.numerador ?? null)
    add('cuota_denominador', cuota?.denominador ?? null)
    add('cuota_valor', cuota?.valor ?? null)
  }
  if ('financiacion' in parche) {
    add('financiacion', parche.financiacion ? JSON.stringify(parche.financiacion) : null, '::jsonb')
  }
  if ('copropietarios' in parche) {
    const lista = parche.copropietarios
    add('copropietarios', lista && lista.length > 0 ? JSON.stringify(lista) : null, '::jsonb')
  }
  if ('tramosContrato' in extra) add('tramos_contrato', JSON.stringify(extra.tramosContrato ?? []), '::jsonb')
  if ('alquilerMensual' in extra) add('alquiler_mensual', extra.alquilerMensual ?? null)
  if ('contratoFin' in extra) add('contrato_fin', extra.contratoFin ?? null)
  if ('fianzaImporte' in extra) add('fianza_importe', extra.fianzaImporte ?? null)
  if ('rentaRevisadaDesde' in extra) add('renta_revisada_desde', extra.rentaRevisadaDesde ?? null)
  if ('reparto' in extra) add('reparto', extra.reparto ? JSON.stringify(extra.reparto) : null, '::jsonb')
  if ('conceptosFijos' in extra) {
    const lista = extra.conceptosFijos
    add('conceptos_fijos', lista && lista.length > 0 ? JSON.stringify(lista) : null, '::jsonb')
  }
  if (sets.length === 0) throw new ConsultaError('No hay ningún campo que guardar.')
  params.push(id)
  return { sql: `update propiedades set ${sets.join(', ')} where id = $${params.length}`, params }
}

const CAMPOS_EXTRA = new Set(['alquilerMensual', 'fechaEfecto', 'aguaLuz', 'conceptosFijos'])
const MODOS_AGUA_LUZ = new Set(['incluido', 'no_incluido', 'parcial_conjunto'])

function partirCampos(entrada: unknown): { ficha: Record<string, unknown>; extra: Record<string, unknown> } {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw new ConsultaError('"campos" tiene que ser un objeto.')
  }
  const ficha: Record<string, unknown> = {}
  const extra: Record<string, unknown> = {}
  for (const [clave, valor] of Object.entries(entrada as Record<string, unknown>)) {
    if (CAMPOS_EXTRA.has(clave)) extra[clave] = valor
    else ficha[clave] = valor
  }
  return { ficha, extra }
}

function importePositivo(valor: unknown, etiqueta: string): number {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' ? parseImporte(valor) : NaN
  if (!Number.isFinite(n) || n <= 0) throw new ConsultaError(`"${etiqueta}" tiene que ser un importe mayor que cero.`)
  return Math.round(n * 100) / 100
}

function leerAguaLuz(valor: unknown): InclusionAguaLuz | null {
  if (valor == null) return null
  if (typeof valor !== 'object' || Array.isArray(valor)) throw new ConsultaError('"aguaLuz" tiene que ser un objeto.')
  const datos = valor as Record<string, unknown>
  const modo = datos.modo
  if (typeof modo !== 'string' || !MODOS_AGUA_LUZ.has(modo)) {
    throw new ConsultaError('"aguaLuz.modo" tiene que ser incluido, no_incluido o parcial_conjunto.')
  }
  if (modo === 'parcial_conjunto') {
    return { modo, importeMensual: importePositivo(datos.importeMensual, 'aguaLuz.importeMensual') }
  }
  return { modo: modo as InclusionAguaLuz['modo'] }
}

function leerConceptosFijos(valor: unknown): ConceptoFijo[] | null {
  if (valor == null) return null
  if (!Array.isArray(valor) || valor.length === 0) {
    throw new ConsultaError('"conceptosFijos" tiene que ser una lista con al menos un concepto.')
  }
  return valor.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ConsultaError(`"conceptosFijos[${i}]" tiene que ser un objeto.`)
    }
    const datos = item as Record<string, unknown>
    if (typeof datos.concepto !== 'string') {
      throw new ConsultaError(`"conceptosFijos[${i}].concepto" tiene que ser texto.`)
    }
    const concepto = datos.concepto.trim()
    if (concepto.length < 1 || concepto.length > 40) {
      throw new ConsultaError(`"conceptosFijos[${i}].concepto" tiene que tener entre 1 y 40 caracteres.`)
    }
    return { concepto, importeMensual: importePositivo(datos.importeMensual, `conceptosFijos[${i}].importeMensual`) }
  })
}

function ordenFicha(
  finca: Propiedad,
  entrada: unknown,
  confirmar: boolean,
  clave: string | undefined,
  hoy: Date,
  transacciones: Foto['transacciones'],
): Orden {
  const { ficha: entradaFicha, extra } = partirCampos(entrada)
  if (Object.keys(entradaFicha).length === 0 && Object.keys(extra).length === 0) {
    throw new ConsultaError('No hay ningún campo que guardar.')
  }
  let parche: ParcheFicha = {}
  if (Object.keys(entradaFicha).length > 0) {
    try {
      parche = interpretarCamposFicha(entradaFicha, fechaDeHoy(hoy))
    } catch (err) {
      if (err instanceof FichaError) throw new ConsultaError(err.message)
      throw err
    }
  }
  const cambios: { campo: string; antes: unknown; despues: unknown }[] = cambiosDeFicha(finca, parche)
  let siguiente = fusionarFicha(finca, parche)
  const extraSql: ExtraSql = {}

  if ('aguaLuz' in extra) {
    const agua = leerAguaLuz(extra.aguaLuz)
    const reparto: Reparto = { ...(siguiente.reparto ?? {}) }
    if (agua == null) delete reparto.aguaLuz
    else reparto.aguaLuz = agua
    const antes = finca.reparto?.aguaLuz ?? null
    siguiente = { ...siguiente, reparto: Object.keys(reparto).length > 0 ? reparto : undefined }
    cambios.push({ campo: 'aguaLuz', antes, despues: siguiente.reparto?.aguaLuz ?? null })
    extraSql.reparto = siguiente.reparto ?? null
  }

  if ('conceptosFijos' in extra) {
    const lista = leerConceptosFijos(extra.conceptosFijos)
    cambios.push({ campo: 'conceptosFijos', antes: finca.conceptosFijos ?? null, despues: lista })
    siguiente = { ...siguiente, conceptosFijos: lista ?? undefined }
    extraSql.conceptosFijos = lista
  }

  let renta: { antes: number | null; despues: number; fechaEfecto: string } | undefined
  if ('alquilerMensual' in extra || 'fechaEfecto' in extra) {
    if (!('alquilerMensual' in extra)) throw new ConsultaError('"fechaEfecto" solo vale junto con alquilerMensual.')
    if (extra.fechaEfecto == null || extra.fechaEfecto === '') {
      throw new ConsultaError('Para cambiar el alquiler hace falta "fechaEfecto" (YYYY-MM-DD).')
    }
    if (typeof extra.fechaEfecto !== 'string') throw new ConsultaError('"fechaEfecto" tiene que ser YYYY-MM-DD.')
    const fechaEfecto = fechaTexto(extra.fechaEfecto.trim(), 'fechaEfecto')
    const despues = importePositivo(extra.alquilerMensual, 'alquilerMensual')
    const antes = alquilerVigente(siguiente, diaAnteriorISO(fechaEfecto), hoy) ?? null
    const resultado = aplicarCambioCondiciones(
      siguiente,
      { vigenteDesde: fechaEfecto, alquilerMensual: despues },
      hoy,
    )
    if (!resultado.ok) throw new ConsultaError(resultado.error)
    siguiente = resultado.propiedad
    renta = { antes, despues, fechaEfecto }
    extraSql.tramosContrato = siguiente.tramosContrato ?? []
    if ((siguiente.alquilerMensual ?? null) !== (finca.alquilerMensual ?? null)) {
      extraSql.alquilerMensual = siguiente.alquilerMensual ?? null
    }
    if ((siguiente.contratoFin ?? null) !== (finca.contratoFin ?? null)) extraSql.contratoFin = siguiente.contratoFin ?? null
    if ((siguiente.fianzaImporte ?? null) !== (finca.fianzaImporte ?? null)) {
      extraSql.fianzaImporte = siguiente.fianzaImporte ?? null
    }
    if ((siguiente.rentaRevisadaDesde ?? null) !== (finca.rentaRevisadaDesde ?? null)) {
      extraSql.rentaRevisadaDesde = siguiente.rentaRevisadaDesde ?? null
    }
  }

  const ficha = fichaPublica(siguiente, hoy, transacciones)
  const sentencia = sqlFicha(finca.id, parche, extraSql)
  const comun = { finca: finca.nombre, cambios, ficha, ...(renta ? { renta } : {}) }
  return {
    herramienta: 'fijar_ficha',
    confirmar,
    clave,
    vista: { escrito: false, vistaPrevia: true, ...comun },
    sentencias: [sentencia],
    resultado: { escrito: true, repetida: false, ...comun },
  }
}

function ordenMovimiento(herramienta: string, t: Transaccion, finca: Propiedad, confirmar: boolean, clave?: string): Orden {
  const movimiento = movimientoDe(t, finca)
  const resultado = { escrito: true, repetida: false, movimiento }
  return {
    herramienta,
    confirmar,
    clave,
    vista: { escrito: false, vistaPrevia: true, movimiento },
    sentencias: [
      {
        sql: INSERT_MOVIMIENTO,
        params: [
          t.id,
          t.propiedadId,
          t.fecha,
          t.tipo,
          t.importe,
          t.categoria,
          t.descripcion,
          t.creadoEn,
          t.periodoInicio ?? null,
          t.periodoFin ?? null,
          t.soloMio ?? null,
          t.igicSoportado ?? null,
          t.numeroFactura ?? null,
        ],
      },
    ],
    resultado,
  }
}

function resolverTarea(foto: Foto, args: Record<string, unknown>): { tarea: Tarea; finca: Propiedad } {
  const id = texto(args, 'id')
  if (id) {
    const tarea = foto.tareas.find((t) => t.id === id)
    if (!tarea) throw new ConsultaError(`No hay ninguna tarea con id "${id}".`)
    const finca = foto.propiedades.find((p) => p.id === tarea.propiedadId)
    if (!finca) throw new ConsultaError('La tarea no tiene finca.')
    return { tarea, finca }
  }
  const nombre = texto(args, 'finca')
  const titulo = texto(args, 'titulo')
  if (!nombre || !titulo) throw new ConsultaError('Pasa "id", o "finca" y "titulo".')
  const finca = resolverFinca(foto.propiedades, nombre)
  const tituloNormal = normalizar(titulo)
  const candidatas = foto.tareas.filter(
    (t) => t.propiedadId === finca.id && t.estado === 'pendiente' && normalizar(t.titulo) === tituloNormal,
  )
  if (candidatas.length === 1) return { tarea: candidatas[0], finca }
  if (candidatas.length === 0) throw new ConsultaError(`No hay una tarea pendiente "${titulo}" en ${finca.nombre}.`)
  throw new ConsultaError(`Hay varias tareas pendientes "${titulo}" en ${finca.nombre}. Pasa el id.`)
}

export function planificar(nombre: string, args: unknown, foto: Foto, hoy: Date = new Date()): Orden {
  if (!esEscritura(nombre)) throw new ConsultaError(`"${nombre}" no escribe.`)
  const datos = argsDe(args)
  const confirmar = confirmarDe(datos)
  const clave = claveDe(datos, confirmar)
  const creadoEn = hoy.toISOString()

  if (nombre === 'cerrar_tarea') {
    const { tarea, finca } = resolverTarea(foto, datos)
    if (tarea.estado !== 'pendiente') throw new ConsultaError('Esa tarea ya no está pendiente.')
    const vistaTarea = { id: tarea.id, finca: finca.nombre, titulo: tarea.titulo, estado: 'hecha' }
    return {
      herramienta: nombre,
      confirmar,
      clave,
      vista: { escrito: false, vistaPrevia: true, tarea: vistaTarea },
      sentencias: [{ sql: `update tareas set estado = 'hecha' where id = $1 and estado = 'pendiente'`, params: [tarea.id] }],
      resultado: { escrito: true, repetida: false, tarea: vistaTarea },
    }
  }

  const nombreFinca = texto(datos, 'finca')
  if (!nombreFinca) throw new ConsultaError('Falta "finca".')
  const finca = resolverFinca(foto.propiedades, nombreFinca)

  if (nombre === 'fijar_ficha') {
    return ordenFicha(finca, datos.campos, confirmar, clave, hoy, foto.transacciones)
  }
  const fecha = fechaDe(datos, hoy)
  const mes = mesDe(datos, fecha)
  const importe = euros(datos, 'importe')
  const soloMio = bandera(datos, 'soloMio')
  const descripcionDada = texto(datos, 'descripcion')

  if (nombre === 'registrar_cobro') {
    const categoria = texto(datos, 'categoria') ?? 'Alquiler mensual'
    if (!(CATEGORIAS_INGRESO as readonly string[]).includes(categoria)) {
      throw new ConsultaError(`"${categoria}" no es un ingreso de la app. Usa una de: ${CATEGORIAS_INGRESO.join(', ')}.`)
    }
    const transaccion: Transaccion = {
      id: randomUUID(),
      propiedadId: finca.id,
      fecha,
      tipo: 'ingreso',
      importe,
      categoria,
      descripcion: descripcionDada ?? (categoria === 'Alquiler mensual' ? `Alquiler ${mes}` : categoria),
      archivos: [],
      creadoEn,
      periodoInicio: categoria === 'Alquiler mensual' ? `${mes}-01` : undefined,
      periodoFin: categoria === 'Alquiler mensual' ? finDeMes(mes) : undefined,
      soloMio,
    }
    return ordenMovimiento(nombre, transaccion, finca, confirmar, clave)
  }

  const categoria = texto(datos, 'categoria')
  if (!categoria) throw new ConsultaError('Falta "categoria".')
  if (!(CATEGORIAS_GASTO as readonly string[]).includes(categoria)) {
    throw new ConsultaError(`"${categoria}" no es un gasto de la app. Usa una de: ${CATEGORIAS_GASTO.join(', ')}.`)
  }
  const igic = eurosOpcional(datos, 'igicSoportado')
  if (igic != null && finca.tipo !== 'local') throw new ConsultaError('El IGIC soportado solo se guarda en un local.')
  const explicito = periodoExplicito(datos)
  const conMes = texto(datos, 'mes') != null
  const numeroFactura = numeroFacturaDe(datos)
  if (numeroFactura && facturaYaRegistrada(foto.transacciones, finca.id, numeroFactura)) {
    throw new ConsultaError(`Ya hay una factura ${numeroFactura} en ${finca.nombre}.`)
  }
  const transaccion: Transaccion = {
    id: randomUUID(),
    propiedadId: finca.id,
    fecha,
    tipo: 'gasto',
    importe,
    categoria,
    descripcion: descripcionDada ?? categoria,
    archivos: [],
    creadoEn,
    periodoInicio: explicito?.inicio ?? (conMes ? `${mes}-01` : undefined),
    periodoFin: explicito?.fin ?? (conMes ? finDeMes(mes) : undefined),
    numeroFactura,
    soloMio,
    igicSoportado: igic,
  }
  return ordenMovimiento(nombre, transaccion, finca, confirmar, clave)
}
