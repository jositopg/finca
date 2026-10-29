// Cada herramienta devuelve lo mismo que la pantalla correspondiente.
// Los totales personales usan esDeJose + esDeAlquiler. La respuesta no
// incluye DNI, email, teléfono, NIF ni ids de Drive.
import {
  INCLUSION_AGUA_LUZ_LABEL,
  alquilerACobrar,
  alquilerVigente,
  avisosDePropiedad,
  baseDesdeRentaNeta,
  calcularRentaLocal,
  cobradoAlquilerEnMes,
  desgloseSuministrosPorMes,
  deudaInquilino,
  devengoIgicLocalTrimestre,
  esDeAlquiler,
  esDeJose,
  estimarAhorroRenta,
  filasRepercutibles,
  gastosPorCategoriaEnRango,
  huecosMensuales,
  inclusionAguaLuz,
  mesDelCobroAlquiler,
  miParte,
  ordenarTareas,
  rangoAnio,
  rangoMes,
  rentaDelMesIncompleta,
  rendimientoIrpfPropiedad,
  repartoEfectivo,
  resumenEnRango,
  resumenVariasEnRango,
  tareaVencida,
  type Propiedad,
} from '../../src/types/index.ts'
import type { Foto } from './foto.ts'

export class ConsultaError extends Error {}

export interface Herramienta {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  ejecutar: (args: Record<string, unknown>, foto: Foto, hoy: Date) => unknown
}

const AMBITO = 'Fincas de Jose en alquiler, igual que Inicio, Estadísticas y Fiscal.'

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

function argsDe(args: unknown): Record<string, unknown> {
  if (args == null) return {}
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new ConsultaError('Los argumentos tienen que ser un objeto.')
  }
  return args as Record<string, unknown>
}

function textoOpcional(args: Record<string, unknown>, clave: string): string | undefined {
  const valor = args[clave]
  if (valor == null || valor === '') return undefined
  if (typeof valor !== 'string') throw new ConsultaError(`"${clave}" tiene que ser texto.`)
  return valor.trim()
}

function anioDe(args: Record<string, unknown>, hoy: Date): string {
  const anio = textoOpcional(args, 'anio')
  if (!anio) return String(hoy.getFullYear())
  if (!/^\d{4}$/.test(anio)) throw new ConsultaError('"anio" tiene que ser YYYY.')
  return anio
}

function mesDe(args: Record<string, unknown>, hoy: Date): string {
  const mes = textoOpcional(args, 'mes')
  if (!mes) return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ConsultaError('"mes" tiene que ser YYYY-MM.')
  return mes
}

function trimestreDeNumero(args: Record<string, unknown>, hoy: Date): number {
  const valor = args.trimestre
  const n = valor == null || valor === '' ? Math.ceil((hoy.getMonth() + 1) / 3) : Number(valor)
  if (!Number.isInteger(n) || n < 1 || n > 4) throw new ConsultaError('"trimestre" tiene que ser 1, 2, 3 o 4.')
  return n
}

function entero(args: Record<string, unknown>, clave: string, defecto: number, maximo: number): number {
  const valor = args[clave]
  if (valor == null || valor === '') return defecto
  const n = Number(valor)
  if (!Number.isInteger(n) || n < 1 || n > maximo) {
    throw new ConsultaError(`"${clave}" tiene que ser un entero entre 1 y ${maximo}.`)
  }
  return n
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

export function fincasDeJose(propiedades: Propiedad[]): Propiedad[] {
  return propiedades.filter((p) => esDeJose(p) && esDeAlquiler(p))
}

function resolverFinca(propiedades: Propiedad[], consulta: string): Propiedad {
  const q = normalizar(consulta)
  const porId = propiedades.find((p) => p.id === consulta.trim())
  if (porId) return porId
  const exactas = propiedades.filter((p) => normalizar(p.nombre) === q)
  if (exactas.length === 1) return exactas[0]
  const parciales = propiedades.filter((p) => normalizar(p.nombre).includes(q))
  const elegidas = exactas.length > 1 ? exactas : parciales
  if (elegidas.length === 1) return elegidas[0]
  if (elegidas.length === 0) throw new ConsultaError(`No hay ninguna finca que coincida con "${consulta}".`)
  const lista = elegidas.map((p) => p.nombre).join(', ')
  throw new ConsultaError(`"${consulta}" coincide con varias fincas: ${lista}. Usa el nombre completo.`)
}

function fichaCorta(p: Propiedad, hoy: Date) {
  const inclusion = inclusionAguaLuz(repartoEfectivo(p))
  let aguaLuz = 'sin configurar'
  if (inclusion?.modo === 'parcial_conjunto') aguaLuz = `cupo ${inclusion.importeMensual ?? 30} €/mes`
  else if (inclusion) aguaLuz = INCLUSION_AGUA_LUZ_LABEL[inclusion.modo]
  return {
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    estado: p.estado,
    municipio: p.municipio ?? null,
    direccion: p.direccion,
    inquilino: p.inquilinoNombre ?? null,
    alquilerMensual: alquilerVigente(p, undefined, hoy) ?? null,
    aguaLuz,
    porcentaje: p.porcentajePropiedad ?? 100,
    deJose: esDeJose(p),
    propietario: p.propietarioNombre ?? null,
  }
}

function trimestreDeFecha(fecha: string): number {
  return Math.ceil(parseInt(fecha.slice(5, 7), 10) / 3)
}

function hoyDelMes(mes: string, hoy: Date): Date {
  const actual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  if (mes === actual) return hoy
  const [anio, numero] = mes.split('-').map(Number)
  return new Date(anio, numero, 0)
}

const sinParametros = { type: 'object', properties: {}, additionalProperties: false }

const listarFincas: Herramienta = {
  name: 'listar_fincas',
  description:
    'Lista todas las fincas, también las de terceros y las de uso propio. No incluye DNI, email ni teléfono. Los totales de las otras herramientas ignoran las que no son de Jose o no están en alquiler.',
  inputSchema: sinParametros,
  ejecutar: (_args, foto, hoy) => ({
    fincas: [...foto.propiedades]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((p) => fichaCorta(p, hoy)),
  }),
}

const cobrosPendientes: Herramienta = {
  name: 'cobros_pendientes',
  description:
    'Rentas del mes sin cobrar del todo, y deuda de meses ya cerrados. Mismo criterio que Inicio. En un local el importe es la neta, lo que entra en el banco.',
  inputSchema: {
    type: 'object',
    properties: {
      mes: { type: 'string', description: 'YYYY-MM. Por defecto el mes actual. La deuda de meses cerrados no depende de este valor.' },
    },
    additionalProperties: false,
  },
  ejecutar: (args, foto, hoy) => {
    const mes = mesDe(args, hoy)
    const dia = hoyDelMes(mes, hoy)
    const fincas = fincasDeJose(foto.propiedades)
    const pendientes = fincas
      .filter((p) => rentaDelMesIncompleta(p, foto.transacciones, dia))
      .map((p) => {
        const esperado = alquilerACobrar(p, `${mes}-01`, dia) ?? 0
        const cobrado = cobradoAlquilerEnMes(p.id, foto.transacciones, mes)
        return {
          id: p.id,
          nombre: p.nombre,
          inquilino: p.inquilinoNombre ?? null,
          esperado: r2(esperado),
          cobrado: r2(cobrado),
          falta: r2(Math.max(0, esperado - cobrado)),
        }
      })
    const deudas = fincas.flatMap((p) => {
      const deuda = deudaInquilino(p, foto.transacciones, hoy)
      if (!deuda || deuda.importe <= 0.005) return []
      return [{ id: p.id, nombre: p.nombre, importe: r2(deuda.importe), meses: deuda.meses }]
    })
    return { ambito: AMBITO, mes, pendientes, deudas }
  },
}

const huecos: Herramienta = {
  name: 'huecos',
  description:
    'Meses recientes sin renta, agua o luz registrada. Igual que el aviso de la ficha: últimos 6 meses de ocupación. Sin "finca", solo las de Jose en alquiler.',
  inputSchema: {
    type: 'object',
    properties: {
      finca: { type: 'string', description: 'Nombre o id. Si se omite, todas las de Jose en alquiler.' },
    },
    additionalProperties: false,
  },
  ejecutar: (args, foto, hoy) => {
    const nombre = textoOpcional(args, 'finca')
    const fincas = nombre ? [resolverFinca(foto.propiedades, nombre)] : fincasDeJose(foto.propiedades)
    const filas = fincas.flatMap((p) =>
      huecosMensuales(p, foto.transacciones, hoy).map((h) => ({ nombre: p.nombre, tipo: h.tipo, mes: h.mes })),
    )
    return { ambito: nombre ? fincas[0].nombre : AMBITO, huecos: filas }
  },
}

const avisos: Herramienta = {
  name: 'avisos',
  description:
    'Avisos de ficha: huecos de registro, renta, fianza ICAVI, contrato, revisión, certificado energético, seguro y mes del IBI. Solo fincas de Jose en alquiler.',
  inputSchema: sinParametros,
  ejecutar: (_args, foto, hoy) => ({
    ambito: AMBITO,
    avisos: fincasDeJose(foto.propiedades).flatMap((p) =>
      avisosDePropiedad(p, foto.transacciones, hoy).map((a) => ({
        finca: a.nombre,
        tipo: a.tipo,
        mensaje: a.mensaje,
      })),
    ),
  }),
}

const resumen: Herramienta = {
  name: 'resumen',
  description:
    'Ingresos, gastos y neto de un mes o de un año, ya a la parte de Jose. El gasto de agua y luz cuenta solo la parte incluida en el contrato. Pasa "mes" o "anio", no los dos.',
  inputSchema: {
    type: 'object',
    properties: {
      mes: { type: 'string', description: 'YYYY-MM. Por defecto el mes actual si no pasas anio.' },
      anio: { type: 'string', description: 'YYYY. El año entero.' },
    },
    additionalProperties: false,
  },
  ejecutar: (args, foto, hoy) => {
    const mes = textoOpcional(args, 'mes')
    const anio = textoOpcional(args, 'anio')
    if (mes && anio) throw new ConsultaError('Pasa "mes" o "anio", no los dos.')
    const [desde, hasta] = anio ? rangoAnio(anioDe({ anio }, hoy)) : rangoMes(mesDe({ mes }, hoy))
    const fincas = fincasDeJose(foto.propiedades)
    const total = resumenVariasEnRango(fincas, foto.transacciones, desde, hasta)
    const porFinca = fincas
      .map((p) => {
        const r = resumenEnRango(p, foto.transacciones, desde, hasta)
        return { nombre: p.nombre, ingresos: r2(r.ingresos), gastos: r2(r.gastos), neto: r2(r.ingresos - r.gastos) }
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    const categorias: Record<string, number> = {}
    for (const p of fincas) {
      for (const [cat, n] of Object.entries(gastosPorCategoriaEnRango(p, foto.transacciones, desde, hasta))) {
        categorias[cat] = (categorias[cat] ?? 0) + n
      }
    }
    const gastosPorCategoria = Object.entries(categorias)
      .map(([categoria, importe]) => ({ categoria, importe: r2(importe) }))
      .filter((f) => f.importe !== 0)
      .sort((a, b) => b.importe - a.importe)
    return {
      ambito: AMBITO,
      desde,
      hasta,
      ingresos: total.ingresos,
      gastos: total.gastos,
      neto: r2(total.ingresos - total.gastos),
      aRepercutir: total.inquilino,
      porFinca,
      gastosPorCategoria,
    }
  },
}

const modelo420: Herramienta = {
  name: 'modelo_420',
  description:
    'Modelo 420 y 115 de los locales de Jose. El IGIC se devenga con la renta pactada de cada mes ya empezado, se haya cobrado o no, y la cuota es la suma del IGIC de cada mes. El IRPF del 115 sigue la fecha de cobro. El IGIC soportado de los gastos se resta solo si el trimestre tiene renta devengada.',
  inputSchema: {
    type: 'object',
    properties: {
      anio: { type: 'string', description: 'YYYY. Por defecto el año actual.' },
      trimestre: { type: 'integer', description: '1 a 4. Por defecto el trimestre actual.' },
    },
    additionalProperties: false,
  },
  ejecutar: (args, foto, hoy) => {
    const anio = anioDe(args, hoy)
    const trimestre = trimestreDeNumero(args, hoy)
    const locales = fincasDeJose(foto.propiedades).filter((p) => p.tipo === 'local')
    const filas = locales.map((p) => {
      const devengo = devengoIgicLocalTrimestre(p, anio, trimestre, hoy)
      const netaCobrada = foto.transacciones
        .filter(
          (t) =>
            t.propiedadId === p.id &&
            t.tipo === 'ingreso' &&
            t.categoria === 'Alquiler mensual' &&
            t.fecha.startsWith(anio) &&
            trimestreDeFecha(t.fecha) === trimestre,
        )
        .reduce((s, t) => s + miParte(t.importe, p, t.soloMio), 0)
      const irpf = r2(calcularRentaLocal(baseDesdeRentaNeta(netaCobrada)).irpf)
      const mesesSinCobrar = devengo.meses
        .filter((m) => {
          const netaMes = foto.transacciones
            .filter(
              (t) =>
                t.propiedadId === p.id &&
                t.tipo === 'ingreso' &&
                t.categoria === 'Alquiler mensual' &&
                mesDelCobroAlquiler(t) === m.mes,
            )
            .reduce((s, t) => s + miParte(t.importe, p, t.soloMio), 0)
          return baseDesdeRentaNeta(netaMes) + 0.02 < m.base
        })
        .map((m) => m.mes)
      const igicSoportado =
        devengo.base > 0
          ? r2(
              foto.transacciones
                .filter(
                  (t) =>
                    t.propiedadId === p.id &&
                    t.tipo === 'gasto' &&
                    t.fecha.startsWith(anio) &&
                    trimestreDeFecha(t.fecha) === trimestre,
                )
                .reduce((s, t) => s + miParte(t.igicSoportado ?? 0, p, t.soloMio), 0),
            )
          : 0
      return {
        nombre: p.nombre,
        base: devengo.base,
        igic: devengo.igic,
        igicSoportado,
        igicAIngresar: r2(devengo.igic - igicSoportado),
        irpfRetenido: irpf,
        meses: devengo.meses,
        mesesSinCobrar,
      }
    })
    return {
      ambito: AMBITO,
      anio,
      trimestre,
      base: r2(filas.reduce((s, f) => s + f.base, 0)),
      igic: r2(filas.reduce((s, f) => s + f.igic, 0)),
      igicSoportado: r2(filas.reduce((s, f) => s + f.igicSoportado, 0)),
      igicAIngresar: r2(filas.reduce((s, f) => s + f.igicAIngresar, 0)),
      irpfRetenido: r2(filas.reduce((s, f) => s + f.irpfRetenido, 0)),
      locales: filas,
    }
  },
}

const rendimiento: Herramienta = {
  name: 'rendimiento',
  description:
    'Rendimiento de la pestaña Fiscal, sin la reducción por vivienda. El bloque "estimador" aplica esa reducción (por defecto 50) y es una aproximación, no la cuota oficial. Importes a la parte de Jose.',
  inputSchema: {
    type: 'object',
    properties: {
      anio: { type: 'string', description: 'YYYY. Por defecto el año actual.' },
      reduccion: { type: 'number', description: 'Porcentaje de reducción por vivienda en el estimador. Por defecto 50.' },
    },
    additionalProperties: false,
  },
  ejecutar: (args, foto, hoy) => {
    const anio = anioDe(args, hoy)
    const reduccionRaw = args.reduccion
    const reduccion = reduccionRaw == null || reduccionRaw === '' ? 50 : Number(reduccionRaw)
    if (!Number.isFinite(reduccion) || reduccion < 0 || reduccion > 100) {
      throw new ConsultaError('"reduccion" tiene que ser un porcentaje entre 0 y 100.')
    }
    const fincas = fincasDeJose(foto.propiedades)
    const porFinca = fincas
      .map((p) => {
        const r = rendimientoIrpfPropiedad(p, foto.transacciones, anio, 0)
        return {
          nombre: p.nombre,
          tipo: p.tipo,
          ingresos: r2(r.ingresos),
          gastos: r2(r.gastos),
          amortizacion: r2(r.amortizacion),
          neto: r2(r.ingresos - r.gastos),
        }
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    const estimacion = estimarAhorroRenta(fincas, foto.transacciones, foto.ingresosExternos, anio, reduccion)
    return {
      ambito: AMBITO,
      anio,
      porFinca,
      totales: {
        ingresos: r2(porFinca.reduce((s, f) => s + f.ingresos, 0)),
        gastos: r2(porFinca.reduce((s, f) => s + f.gastos, 0)),
        amortizacion: r2(porFinca.reduce((s, f) => s + f.amortizacion, 0)),
        neto: r2(porFinca.reduce((s, f) => s + f.neto, 0)),
      },
      estimador: {
        nota: 'Aproximación del estimador de la app, no la declaración.',
        reduccionViviendaPct: reduccion,
        rendimientoInmobiliario: r2(estimacion.rendimientoInmobiliarioTotal),
        otrosIngresos: r2(estimacion.otrosIngresosTotal),
        baseImponible: r2(estimacion.baseImponibleTotal),
        cuotaTotal: r2(estimacion.cuotaTotal),
        retenido: r2(estimacion.totalRetenido),
        aGuardar: r2(estimacion.aGuardar),
      },
    }
  },
}

const repercutir: Herramienta = {
  name: 'repercutir',
  description:
    'Lo que se puede repercutir al inquilino (agua, luz, basuras, IBI y el resto no incluido). Pasa "anio" o "mes". Con "finca" añade el total de cada mes, sin el detalle de cada factura.',
  inputSchema: {
    type: 'object',
    properties: {
      anio: { type: 'string', description: 'YYYY. Por defecto el año actual si no pasas mes.' },
      mes: { type: 'string', description: 'YYYY-MM.' },
      finca: { type: 'string', description: 'Nombre o id. Si se omite, todas las de Jose en alquiler.' },
    },
    additionalProperties: false,
  },
  ejecutar: (args, foto, hoy) => {
    const mes = textoOpcional(args, 'mes')
    const anio = textoOpcional(args, 'anio')
    if (mes && anio) throw new ConsultaError('Pasa "mes" o "anio", no los dos.')
    const [desde, hasta] = mes ? rangoMes(mesDe({ mes }, hoy)) : rangoAnio(anioDe({ anio }, hoy))
    const nombre = textoOpcional(args, 'finca')
    const fincas = nombre ? [resolverFinca(foto.propiedades, nombre)] : fincasDeJose(foto.propiedades)
    const filas = filasRepercutibles(fincas, foto.transacciones, desde, hasta).map((f) => ({
      nombre: f.propiedad.nombre,
      total: f.total,
      porCategoria: f.porCategoria,
    }))
    const meses = nombre
      ? desgloseSuministrosPorMes(fincas[0], foto.transacciones, desde, hasta).map((m) => ({
          mes: m.mes,
          facturado: m.facturado,
          propietario: m.propietario,
          inquilino: m.inquilino,
        }))
      : undefined
    return {
      ambito: nombre ? fincas[0].nombre : AMBITO,
      desde,
      hasta,
      total: r2(filas.reduce((s, f) => s + f.total, 0)),
      filas,
      meses,
    }
  },
}

const tareas: Herramienta = {
  name: 'tareas',
  description: 'Tareas pendientes de todas las fincas, incluidas las de terceros. No incluye las hechas.',
  inputSchema: sinParametros,
  ejecutar: (_args, foto, hoy) => {
    const nombres = new Map(foto.propiedades.map((p) => [p.id, p.nombre]))
    const pendientes = ordenarTareas(foto.tareas.filter((t) => t.estado === 'pendiente'))
    return {
      tareas: pendientes.map((t) => ({
        finca: nombres.get(t.propiedadId) ?? t.propiedadId,
        titulo: t.titulo,
        prioridad: t.prioridad,
        fechaLimite: t.fechaLimite ?? null,
        vencida: tareaVencida(t, hoy),
        descripcion: t.descripcion ? t.descripcion.slice(0, 200) : null,
      })),
    }
  },
}

const movimientos: Herramienta = {
  name: 'movimientos',
  description:
    'Movimientos de una finca entre dos fechas, los más recientes primero. Por defecto el año actual y como mucho 40. No incluye archivos de Drive.',
  inputSchema: {
    type: 'object',
    properties: {
      finca: { type: 'string', description: 'Nombre o id. Obligatorio.' },
      desde: { type: 'string', description: 'YYYY-MM-DD. Por defecto el 1 de enero del año actual.' },
      hasta: { type: 'string', description: 'YYYY-MM-DD. Por defecto el 31 de diciembre del año actual.' },
      limite: { type: 'integer', description: 'Entre 1 y 100. Por defecto 40.' },
    },
    required: ['finca'],
    additionalProperties: false,
  },
  ejecutar: (args, foto, hoy) => {
    const nombre = textoOpcional(args, 'finca')
    if (!nombre) throw new ConsultaError('Falta "finca".')
    const finca = resolverFinca(foto.propiedades, nombre)
    const anio = String(hoy.getFullYear())
    const desde = textoOpcional(args, 'desde') ?? `${anio}-01-01`
    const hasta = textoOpcional(args, 'hasta') ?? `${anio}-12-31`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      throw new ConsultaError('"desde" y "hasta" tienen que ser YYYY-MM-DD.')
    }
    const limite = entero(args, 'limite', 40, 100)
    const todas = foto.transacciones
      .filter((t) => t.propiedadId === finca.id && t.fecha >= desde && t.fecha <= hasta)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn))
    return {
      finca: finca.nombre,
      desde,
      hasta,
      total: todas.length,
      devueltos: Math.min(limite, todas.length),
      movimientos: todas.slice(0, limite).map((t) => ({
        id: t.id,
        fecha: t.fecha,
        tipo: t.tipo,
        categoria: t.categoria,
        importe: r2(t.importe),
        descripcion: t.descripcion,
        periodoInicio: t.periodoInicio ?? null,
        periodoFin: t.periodoFin ?? null,
        numeroFactura: t.numeroFactura ?? null,
        igicSoportado: t.igicSoportado ?? null,
      })),
    }
  },
}

export const herramientas: Herramienta[] = [
  listarFincas,
  cobrosPendientes,
  huecos,
  avisos,
  resumen,
  modelo420,
  rendimiento,
  repercutir,
  tareas,
  movimientos,
]

export function ejecutar(nombre: string, args: unknown, foto: Foto, hoy: Date = new Date()): unknown {
  const herramienta = herramientas.find((h) => h.name === nombre)
  if (!herramienta) throw new ConsultaError(`No existe la herramienta "${nombre}".`)
  return herramienta.ejecutar(argsDe(args), foto, hoy)
}
