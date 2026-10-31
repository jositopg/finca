// Escrituras con nombre. Sin confirmar no se guarda nada. Con confirmar
// hace falta una clave estable: si se repite, se devuelve el mismo resultado
// y no se inserta otra fila.
import { randomUUID } from 'node:crypto'
import {
  CATEGORIAS_GASTO,
  CATEGORIAS_INGRESO,
  parseImporte,
  type Propiedad,
  type Tarea,
  type Transaccion,
} from '../../src/types/index.ts'
import { ConsultaError, normalizar, resolverFinca } from './consultar.ts'
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

const CLAVES = new Set(['registrar_cobro', 'registrar_gasto', 'cerrar_tarea'])

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
      'Registra un gasto en una finca. La categoría tiene que ser una de la app. El IGIC soportado solo vale en un local. Sin confirmar:true no escribe.',
    inputSchema: {
      type: 'object',
      properties: {
        finca: { type: 'string', description: 'Nombre o id.' },
        importe: { type: 'string', description: 'Euros. Admite 1.200,50.' },
        categoria: { type: 'string', description: CATEGORIAS_GASTO.join(', ') },
        fecha: { type: 'string', description: 'YYYY-MM-DD. Por defecto hoy.' },
        mes: { type: 'string', description: 'YYYY-MM del periodo facturado, si no es el mes de la fecha.' },
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

function fechaDe(args: Record<string, unknown>, hoy: Date): string {
  const fecha = texto(args, 'fecha') ?? fechaHoy(hoy)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ConsultaError('"fecha" tiene que ser YYYY-MM-DD.')
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const comprobada = new Date(Date.UTC(anio, mes - 1, dia))
  if (comprobada.getUTCFullYear() !== anio || comprobada.getUTCMonth() !== mes - 1 || comprobada.getUTCDate() !== dia) {
    throw new ConsultaError('"fecha" no existe.')
  }
  return fecha
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
    soloMio: t.soloMio ?? false,
    igicSoportado: t.igicSoportado ?? null,
  }
}

const INSERT_MOVIMIENTO = `insert into transacciones (
  id, propiedad_id, fecha, tipo, importe, categoria, descripcion, archivos, creado_en,
  periodo_inicio, periodo_fin, solo_mio, igic_soportado
) values ($1,$2,$3,$4,$5,$6,$7,'[]'::jsonb,$8,$9,$10,$11,$12)`

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
  const conPeriodo = texto(datos, 'mes') != null
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
    periodoInicio: conPeriodo ? `${mes}-01` : undefined,
    periodoFin: conPeriodo ? finDeMes(mes) : undefined,
    soloMio,
    igicSoportado: igic,
  }
  return ordenMovimiento(nombre, transaccion, finca, confirmar, clave)
}
