// Cada herramienta devuelve lo mismo que la pantalla correspondiente.
// Los totales personales usan esDeJose + esRendimientoAlquiler. La respuesta no
// incluye DNI, email, teléfono ni NIF. Un archivo sale como enlace de Drive,
// nunca como id suelto ni como carpeta.
import {
  INCLUSION_AGUA_LUZ_LABEL,
  alquilerACobrar,
  alquilerVigente,
  avisosDePropiedad,
  baseDesdeRentaNeta,
  calcularRentaLocal,
  cobradoAlquilerEnMes,
  contratoEstado,
  desgloseSuministrosPorMes,
  deudaInquilino,
  devengoIgicLocalTrimestre,
  esDeJose,
  esRendimientoAlquiler,
  estimarAhorroRenta,
  fechaISO,
  filasRepercutibles,
  gastosPorCategoriaEnRango,
  huecosMensuales,
  inclusionAguaLuz,
  mesDelCobroAlquiler,
  miParte,
  ordenarTareas,
  rangoAnio,
  rangoMes,
  rangoUltimosMeses,
  rentaDelMesIncompleta,
  rendimientoIrpfPropiedad,
  rentabilidadCartera,
  resumenIrpf,
  valorSuelo,
  valoresProporcionales,
  repartoEfectivo,
  resumenEnRango,
  resumenVariasEnRango,
  tareaVencida,
  type Propiedad,
  type TramoContrato,
  type Transaccion,
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

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

export function fincasDeJose(propiedades: Propiedad[]): Propiedad[] {
  return propiedades.filter((p) => esDeJose(p) && esRendimientoAlquiler(p))
}

export function resolverFinca(propiedades: Propiedad[], consulta: string): Propiedad {
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

// Id de archivo de Drive, no una carpeta ni un texto libre. El enlace lo lleva
// dentro; la respuesta no repite el id en otro campo.
function idDeArchivo(id: string | undefined): string | undefined {
  if (!id) return undefined
  const limpio = id.trim()
  if (!/^[A-Za-z0-9_-]+$/.test(limpio)) return undefined
  return limpio
}

function enlaceDrive(id: string): string {
  return `https://drive.google.com/file/d/${id}/view`
}

// No hay un tipo de revisión guardado. El aniversario es el de contratoInicio,
// la misma cuenta que tocaRevisarRenta: un año desde el inicio o desde la
// última vez que se marcó revisada.
function revisionAnual(p: Propiedad): { fecha: string; tipo: 'anual' } | undefined {
  if (p.sinRenta || p.estado !== 'alquilado' || !p.contratoInicio) return undefined
  const inicio = new Date(`${p.contratoInicio}T00:00:00`)
  if (Number.isNaN(inicio.getTime())) return undefined
  const desde = p.rentaRevisadaDesde ? new Date(p.rentaRevisadaDesde) : inicio
  if (Number.isNaN(desde.getTime())) return undefined
  let aniversario = new Date(desde.getFullYear(), inicio.getMonth(), inicio.getDate())
  if (aniversario <= desde) aniversario = new Date(desde.getFullYear() + 1, inicio.getMonth(), inicio.getDate())
  return { fecha: fechaISO(aniversario), tipo: 'anual' }
}

function tramoPublico(tramo: TramoContrato): Record<string, unknown> {
  const publico: Record<string, unknown> = { id: tramo.id, vigenteDesde: tramo.vigenteDesde }
  if (tramo.alquilerMensual != null) publico.alquilerMensual = tramo.alquilerMensual
  if (tramo.contratoFin) publico.contratoFin = tramo.contratoFin
  if (tramo.fianzaImporte != null) publico.fianzaImporte = tramo.fianzaImporte
  return publico
}

function enlacesDe(p: Propiedad, transacciones: Transaccion[]): Record<string, unknown> | undefined {
  const contrato = idDeArchivo(p.contratoArchivoId)
  const fianza = idDeArchivo(p.fianzaDepositoArchivoId)
  const vistos = new Set<string>()
  const facturas: string[] = []
  const propias = transacciones
    .filter((t) => t.propiedadId === p.id && t.archivos.length > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creadoEn.localeCompare(b.creadoEn) || a.id.localeCompare(b.id))
  for (const t of propias) {
    for (const archivo of t.archivos) {
      const id = idDeArchivo(archivo)
      if (!id || vistos.has(id)) continue
      vistos.add(id)
      facturas.push(enlaceDrive(id))
    }
  }
  const enlaces: Record<string, unknown> = {}
  if (contrato) enlaces.contrato = enlaceDrive(contrato)
  if (fianza) enlaces.fianza = enlaceDrive(fianza)
  if (facturas.length > 0) enlaces.facturas = facturas
  return Object.keys(enlaces).length > 0 ? enlaces : undefined
}

function avisosVencimiento(
  p: Propiedad,
  hoy: Date,
  fechaRevision: string | undefined,
): { tipo: string; fecha: string; dias: number; mensaje: string }[] {
  const avisos: { tipo: string; fecha: string; dias: number; mensaje: string }[] = []
  const sumar = (tipo: string, fecha: string | undefined, texto: (dias: number, vencido: boolean) => string) => {
    const estado = contratoEstado(fecha, hoy)
    if (!fecha || !estado?.alerta) return
    avisos.push({ tipo, fecha, dias: estado.dias, mensaje: texto(estado.dias, estado.vencido) })
  }
  if (!p.sinRenta && p.estado === 'alquilado') {
    sumar('contrato', p.contratoFin, (dias, vencido) =>
      vencido ? 'Contrato en tácita reconducción' : `Contrato vence en ${dias} días`,
    )
    sumar('revision', fechaRevision, (dias) =>
      dias <= 0 ? 'Toca revisar la renta (IPC/IGC)' : `Revisión de renta en ${dias} días`,
    )
  }
  sumar('cee', p.certificadoEnergeticoVencimiento, (dias, vencido) =>
    vencido ? 'Certificado energético caducado' : `CEE vence en ${dias} días`,
  )
  sumar('seguro', p.seguroVencimiento, (dias, vencido) =>
    vencido ? 'Seguro caducado' : `Seguro vence en ${dias} días`,
  )
  return avisos
}

function datosDeContrato(p: Propiedad, hoy: Date, transacciones: Transaccion[]): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  if (p.contratoInicio) salida.contratoInicio = p.contratoInicio
  if (p.contratoFin) salida.contratoFin = p.contratoFin
  if (p.tramosContrato && p.tramosContrato.length > 0) salida.tramosContrato = p.tramosContrato.map(tramoPublico)
  if (p.fianzaImporte != null) salida.fianzaImporte = p.fianzaImporte
  if (p.fianzaDepositadaDesde) salida.fianzaDepositadaDesde = p.fianzaDepositadaDesde
  if (p.fianzaDepositoNumero) salida.fianzaDepositoNumero = p.fianzaDepositoNumero
  if (p.seguroVencimiento) salida.seguroVencimiento = p.seguroVencimiento
  const revision = revisionAnual(p)
  if (revision) salida.revisionRenta = revision
  if (p.certificadoEnergeticoVencimiento) salida.certificadoEnergeticoVencimiento = p.certificadoEnergeticoVencimiento
  if (p.ibiMes != null) salida.ibiMes = p.ibiMes
  const enlaces = enlacesDe(p, transacciones)
  if (enlaces) salida.enlaces = enlaces
  const avisos = avisosVencimiento(p, hoy, revision?.fecha)
  if (avisos.length > 0) salida.avisosVencimiento = avisos
  return salida
}

export function fichaPublica(p: Propiedad, hoy: Date, transacciones: Transaccion[] = []) {
  const inclusion = inclusionAguaLuz(repartoEfectivo(p))
  let aguaLuz = 'sin configurar'
  if (inclusion?.modo === 'parcial_conjunto') aguaLuz = `cupo ${inclusion.importeMensual ?? 30} €/mes`
  else if (inclusion) aguaLuz = INCLUSION_AGUA_LUZ_LABEL[inclusion.modo]
  const valores = valoresProporcionales(p)
  return {
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    estado: p.estado,
    municipio: p.municipio ?? null,
    direccion: p.direccion,
    inquilino: p.inquilinoNombre ?? null,
    alquilerMensual: alquilerVigente(p, undefined, hoy) ?? null,
    ...(p.conceptosFijos && p.conceptosFijos.length > 0 ? { conceptosFijos: p.conceptosFijos } : {}),
    aguaLuz,
    porcentaje: p.porcentajePropiedad ?? 100,
    deJose: esDeJose(p),
    propietario: p.propietarioNombre ?? null,
    sinRenta: p.sinRenta ?? false,
    referenciaCatastral: p.referenciaCatastral ?? null,
    valorAdquisicion: p.valorAdquisicion ?? null,
    fechaAdquisicion: p.fechaAdquisicion ?? null,
    tipoAdquisicion: p.tipoAdquisicion ?? null,
    metrosCuadrados: p.metrosCuadrados ?? null,
    valorMercado: p.valorMercado ?? null,
    fechaValorMercado: p.fechaValorMercado ?? null,
    valorReferencia: p.valorReferencia ?? null,
    valorConstruccion: p.valorConstruccion ?? null,
    valorCatastral: p.valorCatastral ?? null,
    anioRevisionCatastral: p.anioRevisionCatastral ?? null,
    valorSuelo: valorSuelo(p),
    grupo: p.grupo ?? null,
    cuota: valores.cuota,
    valores,
    financiacion: p.financiacion ?? null,
    copropietarios: (p.copropietarios ?? []).map((c) => ({ nombre: c.nombre, porcentaje: c.porcentaje })),
    ...datosDeContrato(p, hoy, transacciones),
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
    'Lista todas las fincas, también las de terceros, las de uso propio y las que no tienen renta. Devuelve la ficha de escritura (una referencia catastral por inmueble), valorCatastral, anioRevisionCatastral, valorSuelo (valorCatastral − valorConstruccion, calculado) y grupo. Si están guardados, también el contrato, la fianza, el seguro, la revisión anual de la renta, el certificado energético, el mes del IBI y los avisos de vencimiento a 60 días. alquilerMensual es la renta vigente. Si hay conceptos fijos que paga el inquilino (p.ej. basura), los devuelve en conceptosFijos. El contrato, el resguardo y las facturas salen como enlace de Drive, no como id. No incluye DNI, email, teléfono ni NIF. Los totales de las otras herramientas ignoran las que no son de Jose o no están en alquiler.',
  inputSchema: sinParametros,
  ejecutar: (_args, foto, hoy) => ({
    fincas: [...foto.propiedades]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((p) => fichaPublica(p, hoy, foto.transacciones)),
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

function propiedadesDelGrupo(propiedades: Propiedad[], grupo: string | undefined): Propiedad[] {
  if (!grupo) return propiedades
  const lista = propiedades.filter((p) => (p.grupo ?? '').trim() === grupo)
  if (lista.length === 0) throw new ConsultaError(`No hay ninguna finca en el grupo "${grupo}".`)
  return lista
}

function subtotalesPorGrupo(
  propiedades: Propiedad[],
  transacciones: Parameters<typeof rentabilidadCartera>[1],
  desde: string,
  hasta: string,
  hoy: Date,
): Record<string, ReturnType<typeof rentabilidadCartera>> {
  const porGrupo = new Map<string, Propiedad[]>()
  for (const p of propiedades) {
    const grupo = p.grupo?.trim()
    if (!grupo) continue
    const lista = porGrupo.get(grupo)
    if (lista) lista.push(p)
    else porGrupo.set(grupo, [p])
  }
  const salida: Record<string, ReturnType<typeof rentabilidadCartera>> = {}
  for (const [grupo, lista] of [...porGrupo.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
    salida[grupo] = rentabilidadCartera(lista, transacciones, desde, hasta, hoy)
  }
  return salida
}

const rentabilidad: Herramienta = {
  name: 'rentabilidad',
  description:
    'Rentabilidad bruta y neta sobre el valor de mercado, por finca y en total, de los últimos 12 meses y de un año natural. Bruta = rentas / valor. Neta = (rentas − gastos) / valor. Sin valor de mercado, bruta y neta son null y viene el motivo. Los meses vacíos son meses ya empezados sin contrato vigente. grupo filtra por el texto exacto. subtotales y subtotalesPorGrupo agrupan con la misma cuenta de rentabilidadCartera. Sin grupos, subtotalesPorGrupo es {}. No es el ranking de la app.',
  inputSchema: {
    type: 'object',
    properties: {
      anio: {
        type: 'string',
        description: 'Año natural YYYY. Por defecto el año actual. Los últimos 12 meses no dependen de este año.',
      },
      grupo: {
        type: 'string',
        description: 'Opcional. Solo las fincas cuyo grupo coincide exactamente. Si no hay ninguna, falla.',
      },
    },
    additionalProperties: false,
  },
  ejecutar: (args, foto, hoy) => {
    const anio = anioDe(args, hoy)
    const grupo = textoOpcional(args, 'grupo')
    const propiedades = propiedadesDelGrupo(foto.propiedades, grupo)
    const [desdeAnio, hastaAnio] = rangoAnio(anio)
    const ventana = rangoUltimosMeses(hoy, 12)
    const periodo = (desde: string, hasta: string) => {
      const subtotalesPorGrupoMapa = subtotalesPorGrupo(propiedades, foto.transacciones, desde, hasta, hoy)
      return {
        ...rentabilidadCartera(propiedades, foto.transacciones, desde, hasta, hoy),
        subtotales: Object.entries(subtotalesPorGrupoMapa).map(([grupo, datos]) => ({ grupo, ...datos })),
        subtotalesPorGrupo: subtotalesPorGrupoMapa,
      }
    }
    return {
      ambito: AMBITO,
      hoy: fechaISO(hoy),
      ...(grupo ? { grupo } : {}),
      ultimos12Meses: periodo(ventana.desde, ventana.hasta),
      anio: { anio, ...periodo(desdeAnio, hastaAnio) },
    }
  },
}

const resumenIrpfHerramienta: Herramienta = {
  name: 'resumen_irpf',
  description:
    'Resumen anual de IRPF por finca: ingresos íntegros, gastos deducibles (intereses y reparación limitados a los ingresos, con arrastre de 4 años), amortización del 3 % por días alquilados y reducción por alquiler de vivienda. La proporción de amortización es valorConstruccion / valorCatastral cuando los dos están; la base es el mayor entre valorAdquisicion por esa proporción y valorConstruccion. Si falta valorAdquisicion, la base es valorConstruccion. imputaciones es la renta inmobiliaria de lo que no es vivienda habitual y no está alquilado (sinRenta o días vacíos): 1,1 % del valorCatastral si la revisión cae en el ejercicio o en los 10 años anteriores, 2 % si no. Sin año de revisión el 2 % lleva provisional: true. Un solar o valorConstruccion 0 imputa 0. Sin valorCatastral el estado es pendiente de dato. totales.imputacion y totales.amortizacion suman las fincas calculadas y no son null. totales.pendientes lista {finca, motivo}. Si falta un dato para elegir la reducción, lo dice y no inventa el porcentaje. Es orientativo y hay que revisarlo con la declaración. No incluye DNI, email, teléfono ni NIF.',
  inputSchema: {
    type: 'object',
    properties: {
      anio: { type: 'string', description: 'YYYY. Por defecto el año actual.' },
    },
    additionalProperties: false,
  },
  ejecutar: (args, foto, hoy) => {
    const anio = anioDe(args, hoy)
    return { ambito: AMBITO, ...resumenIrpf(foto.propiedades, foto.transacciones, anio) }
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
        id: t.id,
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
  rentabilidad,
  resumenIrpfHerramienta,
  repercutir,
  tareas,
  movimientos,
]

export function ejecutar(nombre: string, args: unknown, foto: Foto, hoy: Date = new Date()): unknown {
  const herramienta = herramientas.find((h) => h.name === nombre)
  if (!herramienta) throw new ConsultaError(`No existe la herramienta "${nombre}".`)
  return herramienta.ejecutar(argsDe(args), foto, hoy)
}
