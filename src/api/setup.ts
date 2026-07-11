import { format, parseISO } from 'date-fns'
import { apiPost, getAccessToken } from './auth'
import { deleteFile, findFileInFolder, getOrCreateFolder } from './drive'
import { writeFormattedSheets, type SheetSpec } from './sheets'
import {
  baseDesdeRentaNeta,
  calcularReparto,
  calcularRentabilidad,
  calcularRentaLocal,
  esDeJose,
  estimarAhorroRenta,
  ESTADO_LABELS,
  miParte,
  parseImporte,
  rentaPendiente,
  TIPO_LABELS,
  valorarPropiedad,
  type IngresoExterno,
  type Propiedad,
  type RepartoConcepto,
  type Transaccion,
} from '../types'

const ROOT_FOLDER_NAME = 'Finca — Gestión de Propiedades'
const EXPORT_SHEET_NAME = 'Finca — Exportado'

// Mismo valor por defecto que EstimadorRenta.tsx (la reducción por vivienda
// habitual es un campo editable en la app, no se persiste en ningún sitio —
// aquí se asume el valor habitual del 50%).
const REDUCCION_VIVIENDA_PCT = 50

export interface ExportResult {
  spreadsheetId: string
  url: string
}

const round2 = (n: number) => Math.round(n * 100) / 100
const fecha = (d: string) => format(parseISO(d), 'dd/MM/yyyy')

function gestion(p: Pick<Propiedad, 'propietarioNombre'>): string {
  return esDeJose(p) ? 'Tuya' : `De ${p.propietarioNombre}`
}

function trimestreDe(fechaISO: string): number {
  const mes = parseInt(fechaISO.slice(5, 7), 10)
  return Math.ceil(mes / 3)
}

function anosConDatos(transacciones: Transaccion[]): string[] {
  const set = new Set(transacciones.map((t) => t.fecha.slice(0, 4)))
  set.add(new Date().getFullYear().toString())
  return [...set].sort()
}

// ─── Resumen: vista rápida del año en curso ────────────────────────────────
function buildResumen(propiedades: Propiedad[], transacciones: Transaccion[]) {
  const anio = new Date().getFullYear().toString()
  const headers = ['Propiedad', 'Gestión', 'Estado', `Ingresos ${anio}`, `Gastos ${anio}`, 'Neto', 'Renta pendiente']
  let totalIngresos = 0
  let totalGastos = 0
  const rows = propiedades.map((p) => {
    const txs = transacciones.filter((t) => t.propiedadId === p.id && t.fecha.startsWith(anio))
    const esJose = esDeJose(p)
    // "Tu parte" solo tiene sentido para lo que es tuyo — lo gestionado
    // para otros se muestra en su importe real, sin escalar por %propiedad.
    const ingresos = txs
      .filter((t) => t.tipo === 'ingreso')
      .reduce((s, t) => s + (esJose ? miParte(t.importe, p) : t.importe), 0)
    const gastos = txs
      .filter((t) => t.tipo === 'gasto')
      .reduce((s, t) => s + (esJose ? miParte(t.importe, p) : t.importe), 0)
    if (esJose) {
      totalIngresos += ingresos
      totalGastos += gastos
    }
    return [
      p.nombre,
      gestion(p),
      ESTADO_LABELS[p.estado],
      round2(ingresos),
      round2(gastos),
      round2(ingresos - gastos),
      rentaPendiente(p, transacciones) ? 'Sí' : '',
    ]
  })
  rows.push([
    'TOTAL (tus propiedades)',
    '',
    '',
    round2(totalIngresos),
    round2(totalGastos),
    round2(totalIngresos - totalGastos),
    '',
  ])
  return { headers, rows, moneyCols: [3, 4, 5] }
}

// ─── Propiedades: ficha completa ────────────────────────────────────────────
function buildPropiedades(propiedades: Propiedad[]) {
  const headers = [
    'Nombre',
    'Dirección',
    'Municipio',
    'Tipo',
    'Estado',
    'Gestión',
    '% Propiedad',
    'Inquilino',
    'DNI inquilino',
    'Teléfono inquilino',
    'Email inquilino',
    'Alquiler mensual',
    'Contrato desde',
    'Contrato hasta',
    'Referencia catastral',
    'Valor de referencia',
    'Valor de mercado',
    'Notas',
  ]
  const rows = propiedades.map((p) => [
    p.nombre,
    p.direccion,
    p.municipio ?? '',
    TIPO_LABELS[p.tipo],
    ESTADO_LABELS[p.estado],
    gestion(p),
    p.porcentajePropiedad ?? 100,
    p.inquilinoNombre ?? '',
    p.inquilinoDni ?? '',
    p.inquilinoTelefono ?? '',
    p.inquilinoEmail ?? '',
    p.alquilerMensual != null ? round2(p.alquilerMensual) : '',
    p.contratoInicio ? fecha(p.contratoInicio) : '',
    p.contratoFin ? fecha(p.contratoFin) : '',
    p.referenciaCatastral ?? '',
    p.valorReferencia != null ? round2(p.valorReferencia) : '',
    p.valorMercado != null ? round2(p.valorMercado) : '',
    p.notas ?? '',
  ])
  return { headers, rows, moneyCols: [11, 15, 16] }
}

// ─── Reparto de suministros y tasas configurado por propiedad ──────────────
function fmtRepartoConcepto(c?: RepartoConcepto): string {
  if (!c) return ''
  if (c.modo === 'incluido') return 'Incluido'
  if (c.modo === 'no_incluido') return 'No incluido'
  return `Parcial (${round2(c.importeIncluido ?? 0)} €/factura)`
}

function buildRepartoSuministros(propiedades: Propiedad[]) {
  const headers = ['Propiedad', 'Agua', 'Luz', 'Basuras', 'IBI']
  const rows = propiedades
    .filter((p) => p.reparto && Object.keys(p.reparto).length > 0)
    .map((p) => [
      p.nombre,
      fmtRepartoConcepto(p.reparto?.agua),
      fmtRepartoConcepto(p.reparto?.luz),
      fmtRepartoConcepto(p.reparto?.basuras),
      fmtRepartoConcepto(p.reparto?.ibi),
    ])
  return { headers, rows, moneyCols: [] }
}

// ─── Gastos fijos mensuales configurados ───────────────────────────────────
function buildGastosRecurrentes(propiedades: Propiedad[]) {
  const headers = ['Propiedad', 'Categoría', 'Importe mensual', 'Descripción', 'Desde']
  const rows: (string | number)[][] = []
  for (const p of propiedades) {
    for (const g of p.gastosRecurrentes ?? []) {
      rows.push([p.nombre, g.categoria, round2(g.importe), g.descripcion ?? '', fecha(g.creadoEn)])
    }
  }
  return { headers, rows, moneyCols: [2] }
}

// ─── Movimientos: todas las transacciones, con el reparto ya calculado ─────
function buildMovimientos(propiedades: Propiedad[], transacciones: Transaccion[]) {
  const headers = [
    'Fecha',
    'Propiedad',
    'Gestión',
    'Tipo',
    'Categoría',
    'Importe',
    'A cargo del propietario',
    'Repercutible al inquilino',
    'Descripción',
    'Referencia',
  ]
  const propiedadPorId = new Map(propiedades.map((p) => [p.id, p]))
  const rows = [...transacciones]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((t) => {
      const p = propiedadPorId.get(t.propiedadId)
      const reparto = p ? calcularReparto(t.categoria, t.importe, p.reparto) : null
      return [
        fecha(t.fecha),
        p?.nombre ?? '(propiedad eliminada)',
        p ? gestion(p) : '',
        t.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
        t.categoria,
        round2(t.importe),
        reparto ? round2(reparto.propietario) : '',
        reparto ? round2(reparto.inquilino) : '',
        t.descripcion,
        t.referencia ?? '',
      ]
    })
  return { headers, rows, moneyCols: [5, 6, 7] }
}

// ─── Historial de alquileres ya terminados ─────────────────────────────────
function buildHistorial(propiedades: Propiedad[]) {
  const headers = ['Propiedad', 'Inquilino', 'DNI', 'Teléfono', 'Email', 'Alquiler mensual', 'Desde', 'Hasta', 'Contrato adjunto']
  const rows: (string | number)[][] = []
  for (const p of propiedades) {
    for (const c of p.historialContratos ?? []) {
      rows.push([
        p.nombre,
        c.inquilinoNombre ?? '',
        c.inquilinoDni ?? '',
        c.inquilinoTelefono ?? '',
        c.inquilinoEmail ?? '',
        c.alquilerMensual != null ? round2(c.alquilerMensual) : '',
        c.fechaInicio ? fecha(c.fechaInicio) : '',
        fecha(c.fechaFin),
        c.contratoArchivoId ? `https://drive.google.com/file/d/${c.contratoArchivoId}/view` : '',
      ])
    }
  }
  return { headers, rows, moneyCols: [5] }
}

// ─── Rentabilidad y valoración: mismo cálculo que la ficha de propiedad ────
const VEREDICTO_LABEL: Record<string, string> = {
  buena: 'Buena',
  insuficiente: 'Insuficiente',
  gastos_altos: 'Gastos altos',
  sin_datos: 'Sin datos',
}

function buildRentabilidad(propiedades: Propiedad[], transacciones: Transaccion[]) {
  const umbralRaw = localStorage.getItem('finca_umbral_rentabilidad')
  const umbralParsed = umbralRaw ? parseImporte(umbralRaw) : NaN
  const umbral = Number.isNaN(umbralParsed) ? 4 : umbralParsed

  const headers = [
    'Propiedad',
    'Gestión',
    'Valor usado',
    'Origen del valor',
    'Meses con datos (últimos 12)',
    '¿Estimación?',
    'Ingresos anualizados',
    'Gastos anualizados',
    'Rentabilidad bruta %',
    'Rentabilidad neta %',
    '% Gastos / Ingresos',
    'Veredicto',
    'Mensaje',
  ]
  const rows: (string | number)[][] = []
  for (const p of propiedades) {
    const valor = p.valorMercado ?? p.valorReferencia
    if (!valor || valor <= 0) continue
    const v = valorarPropiedad(p, transacciones, umbral)
    if (!v) continue
    const bruta = calcularRentabilidad(v.ingresosAnualizados, v.gastosAnualizados, valor)?.bruta ?? 0
    rows.push([
      p.nombre,
      gestion(p),
      round2(valor),
      p.valorMercado ? 'Mercado' : 'Catastro',
      v.mesesConDatos,
      v.esEstimacion ? 'Sí' : 'No',
      round2(v.ingresosAnualizados),
      round2(v.gastosAnualizados),
      round2(bruta),
      round2(v.rentabilidadNeta),
      round2(v.ratioGastosPct),
      VEREDICTO_LABEL[v.veredicto] ?? v.veredicto,
      v.mensaje,
    ])
  }
  return { headers, rows, moneyCols: [2, 6, 7] }
}

// ─── Evolución anual por propiedad: extiende el gráfico del Dashboard ──────
function buildEvolucionAnual(propiedadesJose: Propiedad[], transacciones: Transaccion[]) {
  const anios = [...new Set(transacciones.map((t) => t.fecha.slice(0, 4)))].sort()
  const headers = ['Año', ...propiedadesJose.map((p) => p.nombre), 'Total']
  const rows = anios.map((anio) => {
    let total = 0
    const cols = propiedadesJose.map((p) => {
      const neto = transacciones
        .filter((t) => t.propiedadId === p.id && t.fecha.startsWith(anio))
        .reduce((s, t) => s + (t.tipo === 'ingreso' ? miParte(t.importe, p) : -miParte(t.importe, p)), 0)
      total += neto
      return round2(neto)
    })
    return [anio, ...cols, round2(total)]
  })
  const moneyCols = propiedadesJose.map((_, i) => i + 1).concat([propiedadesJose.length + 1])
  return { headers, rows, moneyCols }
}

// ─── Modelo 420: base/IGIC/IRPF de cada trimestre con renta cobrada ────────
function buildModelo420(locales: Propiedad[], transacciones: Transaccion[]) {
  const headers = ['Año', 'Trimestre', 'Propiedad', 'Base imponible', 'IGIC (7%)', 'IRPF retenido (19%)', 'Renta neta cobrada']
  const rows: (string | number)[][] = []
  for (const p of locales) {
    const txsAlquiler = transacciones.filter(
      (t) => t.propiedadId === p.id && t.tipo === 'ingreso' && t.categoria === 'Alquiler mensual',
    )
    const anios = [...new Set(txsAlquiler.map((t) => t.fecha.slice(0, 4)))].sort()
    for (const anio of anios) {
      for (let trimestre = 1; trimestre <= 4; trimestre++) {
        const netaTotal = txsAlquiler
          .filter((t) => t.fecha.startsWith(anio) && trimestreDe(t.fecha) === trimestre)
          .reduce((s, t) => s + miParte(t.importe, p), 0)
        if (netaTotal <= 0) continue
        const base = baseDesdeRentaNeta(netaTotal)
        const { igic, irpf } = calcularRentaLocal(base)
        rows.push([anio, `T${trimestre}`, p.nombre, round2(base), round2(igic), round2(irpf), round2(netaTotal)])
      }
    }
  }
  return { headers, rows, moneyCols: [3, 4, 5, 6] }
}

// ─── Estimador de la Renta: resumen agregado por año ───────────────────────
function buildEstimadorRentaResumen(
  propiedadesJose: Propiedad[],
  transacciones: Transaccion[],
  ingresosExternos: IngresoExterno[],
  anios: string[],
) {
  const headers = [
    'Año',
    'Rendimiento inmobiliario (reducido)',
    'Otros ingresos',
    'Base imponible total',
    'Tramo marginal %',
    'Cuota solo otros ingresos',
    'Cuota con alquileres',
    'IRPF estimado alquileres',
    'Ya retenido en origen (locales)',
    'A guardar',
  ]
  const rows = anios.map((anio) => {
    const e = estimarAhorroRenta(propiedadesJose, transacciones, ingresosExternos, anio, REDUCCION_VIVIENDA_PCT)
    return [
      anio,
      round2(e.rendimientoInmobiliarioTotal),
      round2(e.otrosIngresosTotal),
      round2(e.baseImponibleTotal),
      e.tipoMarginalPct,
      round2(e.cuotaSoloOtrosIngresos),
      round2(e.cuotaConAlquileres),
      round2(e.irpfEstimadoAlquileres),
      round2(e.irpfYaRetenidoLocales),
      round2(e.aGuardar),
    ]
  })
  return { headers, rows, moneyCols: [1, 2, 3, 5, 6, 7, 8, 9] }
}

// ─── Estimador de la Renta: detalle por propiedad y año ────────────────────
function buildEstimadorRentaPorPropiedad(
  propiedadesJose: Propiedad[],
  transacciones: Transaccion[],
  ingresosExternos: IngresoExterno[],
  anios: string[],
) {
  const headers = ['Año', 'Propiedad', 'Ingresos', 'Gastos', 'Rendimiento neto', 'Reducible', 'Rendimiento computable']
  const rows: (string | number)[][] = []
  for (const anio of anios) {
    const e = estimarAhorroRenta(propiedadesJose, transacciones, ingresosExternos, anio, REDUCCION_VIVIENDA_PCT)
    for (const f of e.porPropiedad) {
      rows.push([
        anio,
        f.propiedad.nombre,
        round2(f.ingresos),
        round2(f.gastos),
        round2(f.rendimientoNeto),
        f.reducible ? 'Sí' : 'No',
        round2(f.rendimientoComputable),
      ])
    }
  }
  return { headers, rows, moneyCols: [2, 3, 4, 6] }
}

// ─── Ingresos externos configurados (nómina, etc.) ─────────────────────────
function buildIngresosExternos(ingresosExternos: IngresoExterno[]) {
  const headers = ['Nombre', 'Importe anual', '% Retención (informativo)']
  const rows = ingresosExternos.map((i) => [i.nombre, round2(i.importeAnual), i.porcentajeRetencion])
  return { headers, rows, moneyCols: [1] }
}

// Crea (sustituyendo cualquier exportación anterior) un informe legible con
// prácticamente todos los datos de la app — nada de IDs internos ni JSON en
// crudo — pensado para ser el documento de trabajo de referencia fuera de
// la app: resumen, ficha de propiedades, configuración de reparto y gastos
// fijos, movimientos, historial de alquileres, rentabilidad, evolución
// anual, Modelo 420 y estimador de la Renta. Cada hoja reutiliza las mismas
// funciones de cálculo que la app, para que los números coincidan siempre
// con lo que se ve en pantalla. Requiere que ya se haya concedido el token
// de Drive (ensureDriveAccess en AppContext).
export async function exportarASheets(
  propiedades: Propiedad[],
  transacciones: Transaccion[],
  ingresosExternos: IngresoExterno[],
): Promise<ExportResult> {
  const rootFolder = await getOrCreateFolder(ROOT_FOLDER_NAME)

  const existing = await findFileInFolder(rootFolder.id, EXPORT_SHEET_NAME)
  if (existing) {
    await deleteFile(existing.id)
  }

  const propiedadesJose = propiedades.filter(esDeJose)
  const locales = propiedadesJose.filter((p) => p.tipo === 'local')
  const anios = anosConDatos(transacciones)

  const candidatos: { title: string; spec: Omit<SheetSpec, 'title' | 'gid'> }[] = [
    { title: 'Resumen', spec: buildResumen(propiedades, transacciones) },
    { title: 'Propiedades', spec: buildPropiedades(propiedades) },
    { title: 'Reparto de suministros', spec: buildRepartoSuministros(propiedades) },
    { title: 'Gastos fijos mensuales', spec: buildGastosRecurrentes(propiedades) },
    { title: 'Movimientos', spec: buildMovimientos(propiedades, transacciones) },
    { title: 'Historial de alquileres', spec: buildHistorial(propiedades) },
    { title: 'Rentabilidad y valoración', spec: buildRentabilidad(propiedades, transacciones) },
    { title: 'Evolución anual', spec: buildEvolucionAnual(propiedadesJose, transacciones) },
    { title: 'Modelo 420', spec: buildModelo420(locales, transacciones) },
    {
      title: 'Estimador Renta (resumen)',
      spec: buildEstimadorRentaResumen(propiedadesJose, transacciones, ingresosExternos, anios),
    },
    {
      title: 'Estimador Renta (por propiedad)',
      spec: buildEstimadorRentaPorPropiedad(propiedadesJose, transacciones, ingresosExternos, anios),
    },
    { title: 'Ingresos externos', spec: buildIngresosExternos(ingresosExternos) },
  ]

  // Las hojas base siempre aparecen aunque estén vacías (documento de
  // referencia); el resto solo si hay algo que mostrar, para no llenar el
  // Sheet de pestañas vacías.
  const SIEMPRE = new Set(['Resumen', 'Propiedades', 'Movimientos'])
  const sheetsAIncluir = candidatos.filter((c) => SIEMPRE.has(c.title) || c.spec.rows.length > 0)

  const sheetTitles = sheetsAIncluir.map((c) => c.title)
  const sheet = await apiPost<{
    spreadsheetId: string
    sheets: { properties: { sheetId: number; title: string } }[]
  }>('https://sheets.googleapis.com/v4/spreadsheets', {
    properties: { title: EXPORT_SHEET_NAME, locale: 'es_ES' },
    sheets: sheetTitles.map((title, index) => ({ properties: { title, index } })),
  })

  const spreadsheetId = sheet.spreadsheetId

  await fetch(
    `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${rootFolder.id}&removeParents=root&fields=id,parents`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
      },
    },
  )

  const gidByTitle = new Map(sheet.sheets.map((s) => [s.properties.title, s.properties.sheetId]))

  const specs: SheetSpec[] = sheetsAIncluir.map((c) => ({
    title: c.title,
    gid: gidByTitle.get(c.title)!,
    ...c.spec,
  }))

  await writeFormattedSheets(spreadsheetId, specs)

  return {
    spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  }
}
