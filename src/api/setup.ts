import { format, parseISO } from 'date-fns'
import { apiPost, getAccessToken } from './auth'
import { deleteFile, findFileInFolder, getOrCreateFolder } from './drive'
import { writeFormattedSheets, type SheetSpec } from './sheets'
import {
  esDeAlquiler,
  esDeJose,
  ESTADO_LABELS,
  miParte,
  parseImporte,
  TIPO_LABELS,
  type IngresoExterno,
  type Propiedad,
  type SuministroModo,
  type Transaccion,
} from '../types'

// Esta exportación escribe, siempre que puede, FÓRMULAS reales de Google
// Sheets (SUMIFS/VLOOKUP/SUMPRODUCT) que referencian las hojas de datos
// crudos (Propiedades, Movimientos, Reparto de suministros, Ingresos
// externos, Tramos IRPF) en vez de números ya calculados en JS — así el
// documento se recalcula solo si Jose edita un importe o añade un
// movimiento directamente en Sheets. Solo las hojas puramente informativas/
// de configuración (Propiedades, Reparto de suministros, Gastos fijos
// mensuales, Historial, Ingresos externos, Tramos IRPF, y las columnas base
// de Movimientos) son valores fijos, porque son la fuente, no algo derivado.
//
// El locale del spreadsheet es es_ES, así que TODAS las fórmulas usan ";"
// como separador de argumentos y "," como separador decimal en literales
// numéricos — no "," / "." como en inglés.

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

// Convierte un número JS a un literal válido dentro de una fórmula es_ES
// (coma decimal, p.ej. 0.88 -> "0,88").
function esNum(n: number): string {
  return String(n).replace('.', ',')
}

// 1-based: 1 -> 'A', 2 -> 'B', ..., 27 -> 'AA'.
function numToColLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

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

// ─── Propiedades: ficha completa (datos crudos) ────────────────────────────
// Columnas: A Nombre, B Dirección, C Municipio, D Tipo, E Estado, F Gestión,
// G % Propiedad, H Inquilino, I DNI, J Teléfono, K Email, L Alquiler
// mensual, M Contrato desde, N Contrato hasta, O Ref. catastral,
// P Valor de referencia, Q Valor de mercado, R Notas.
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

// ─── Reparto de suministros (datos crudos, machine-readable) ──────────────
// Columnas: A Propiedad, B/C Agua Modo+Importe, D/E Luz, F/G Basuras,
// H/I IBI. "Movimientos" hace VLOOKUP contra estas columnas por índice.
function buildRepartoSuministros(propiedades: Propiedad[]) {
  const headers = [
    'Propiedad',
    'Agua - Modo',
    'Agua - Importe incluido',
    'Luz - Modo',
    'Luz - Importe incluido',
    'Basuras - Modo',
    'Basuras - Importe incluido',
    'IBI - Modo',
    'IBI - Importe incluido',
  ]
  const modoLabel: Record<SuministroModo, string> = {
    incluido: 'Incluido',
    no_incluido: 'No incluido',
    parcial: 'Parcial',
  }
  const rows = propiedades
    .filter((p) => p.reparto && Object.keys(p.reparto).length > 0)
    .map((p) => [
      p.nombre,
      p.reparto?.agua ? modoLabel[p.reparto.agua.modo] : '',
      p.reparto?.agua?.modo === 'parcial' ? round2(p.reparto.agua.importeIncluido ?? 0) : '',
      p.reparto?.luz ? modoLabel[p.reparto.luz.modo] : '',
      p.reparto?.luz?.modo === 'parcial' ? round2(p.reparto.luz.importeIncluido ?? 0) : '',
      p.reparto?.basuras ? modoLabel[p.reparto.basuras.modo] : '',
      p.reparto?.basuras?.modo === 'parcial' ? round2(p.reparto.basuras.importeIncluido ?? 0) : '',
      p.reparto?.ibi ? modoLabel[p.reparto.ibi.modo] : '',
      p.reparto?.ibi?.modo === 'parcial' ? round2(p.reparto.ibi.importeIncluido ?? 0) : '',
    ])
  return { headers, rows, moneyCols: [2, 4, 6, 8] }
}

// ─── Gastos fijos mensuales configurados (datos crudos) ────────────────────
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

// ─── Movimientos: datos crudos + reparto calculado por fórmula ─────────────
// Categoría (E) -> columnas Modo/Importe en "Reparto de suministros".
const CONCEPTO_COLS: { categoria: string; modoIdx: number; importeIdx: number }[] = [
  { categoria: 'Agua', modoIdx: 2, importeIdx: 3 },
  { categoria: 'Electricidad', modoIdx: 4, importeIdx: 5 },
  { categoria: 'Tasa de basuras', modoIdx: 6, importeIdx: 7 },
  { categoria: 'IBI', modoIdx: 8, importeIdx: 9 },
]

function repartoPropietarioFormula(r: number): string {
  const branches = CONCEPTO_COLS.map(({ categoria, modoIdx, importeIdx }) => {
    const modo = `VLOOKUP($B${r};'Reparto de suministros'!$A:$I;${modoIdx};FALSE)`
    const importe = `VLOOKUP($B${r};'Reparto de suministros'!$A:$I;${importeIdx};FALSE)`
    return `E${r}="${categoria}";IFERROR(IFS(${modo}="Incluido";F${r};${modo}="No incluido";0;TRUE;MIN(${importe};F${r}));"")`
  })
  return `=IFS(${branches.join(';')};TRUE;"")`
}

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
  const ordenadas = [...transacciones].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const rows = ordenadas.map((t, i) => {
    const r = i + 2
    const p = propiedadPorId.get(t.propiedadId)
    return [
      fecha(t.fecha),
      p?.nombre ?? '(propiedad eliminada)',
      p ? gestion(p) : '',
      t.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
      t.categoria,
      round2(t.importe),
      repartoPropietarioFormula(r),
      `=IF(G${r}="";"";F${r}-G${r})`,
      t.descripcion,
      t.referencia ?? '',
    ]
  })
  return { headers, rows, moneyCols: [5, 6, 7] }
}

// ─── Historial de alquileres ya terminados (datos crudos) ──────────────────
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

// ─── Ingresos externos configurados (datos crudos) ─────────────────────────
function buildIngresosExternos(ingresosExternos: IngresoExterno[]) {
  const headers = ['Nombre', 'Importe anual', '% Retención', 'Retención estimada']
  const rows = ingresosExternos.map((i, idx) => {
    const r = idx + 2
    return [i.nombre, round2(i.importeAnual), i.porcentajeRetencion, `=B${r}*C${r}/100`]
  })
  return { headers, rows, moneyCols: [1, 3] }
}

// ─── Tramos IRPF: tabla de referencia editable para las fórmulas ───────────
// Misma escala aproximada que TRAMOS_IRPF_APROX en types/index.ts.
function buildTramosIRPF() {
  const headers = ['Desde (€)', 'Hasta (€)', 'Tipo %']
  const rows: (string | number)[][] = [
    [0, 12450, 19],
    [12450, 20200, 24],
    [20200, 35200, 30],
    [35200, 60000, 37],
    [60000, 300000, 45],
    [300000, 999999999, 47],
  ]
  return { headers, rows, moneyCols: [0, 1] }
}

// ─── Resumen: vista rápida del año en curso, por fórmula ───────────────────
function buildResumen(propiedades: Propiedad[], anio: string) {
  const headers = ['Propiedad', 'Gestión', 'Estado', `Ingresos ${anio}`, `Gastos ${anio}`, 'Neto', 'Renta pendiente']
  const rows = propiedades.map((p, i) => {
    const r = i + 2
    const esJose = esDeJose(p)
    const escala = esJose ? `VLOOKUP($A${r};'Propiedades'!$A:$G;7;FALSE)/100` : '1'
    const rango = `'Movimientos'!$A:$A;">="&DATE(${anio};1;1);'Movimientos'!$A:$A;"<="&DATE(${anio};12;31)`
    const ingresosF = `=SUMIFS('Movimientos'!$F:$F;'Movimientos'!$B:$B;$A${r};'Movimientos'!$D:$D;"Ingreso";${rango})*${escala}`
    const gastosF = `=SUMIFS('Movimientos'!$F:$F;'Movimientos'!$B:$B;$A${r};'Movimientos'!$D:$D;"Gasto";${rango})*${escala}`
    const netoF = `=D${r}-E${r}`
    const rentaPendienteF = `=IF(AND(VLOOKUP($A${r};'Propiedades'!$A:$E;5;FALSE)="Alquilado";VLOOKUP($A${r};'Propiedades'!$A:$L;12;FALSE)<>"";DAY(TODAY())>=5;COUNTIFS('Movimientos'!$B:$B;$A${r};'Movimientos'!$D:$D;"Ingreso";'Movimientos'!$E:$E;"Alquiler mensual";'Movimientos'!$A:$A;">="&DATE(YEAR(TODAY());MONTH(TODAY());1);'Movimientos'!$A:$A;"<="&EOMONTH(TODAY();0))=0);"Sí";"")`
    return [p.nombre, gestion(p), ESTADO_LABELS[p.estado], ingresosF, gastosF, netoF, rentaPendienteF]
  })
  const n = propiedades.length
  // El total excluye, además de lo gestionado para otros, las propiedades
  // de uso propio/vivienda habitual — no son rendimiento de alquiler.
  const excluirEstado = `$C$2:$C$${n + 1};"<>Uso propio";$C$2:$C$${n + 1};"<>Vivienda habitual"`
  rows.push([
    'TOTAL (tus propiedades en alquiler)',
    '',
    '',
    `=SUMIFS(D$2:D$${n + 1};$B$2:$B$${n + 1};"Tuya";${excluirEstado})`,
    `=SUMIFS(E$2:E$${n + 1};$B$2:$B$${n + 1};"Tuya";${excluirEstado})`,
    `=D${n + 2}-E${n + 2}`,
    '',
  ])
  return { headers, rows, moneyCols: [3, 4, 5] }
}

// ─── Rentabilidad y valoración: mismo cálculo que la ficha de propiedad ────
// (por fórmula: last-12-meses vía EDATE/TODAY, veredicto y mensaje en vivo)
function buildRentabilidad(propiedades: Propiedad[], umbral: number) {
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
  const umbralStr = esNum(umbral)
  const candidatas = propiedades.filter((p) => (p.valorMercado ?? p.valorReferencia ?? 0) > 0)
  const rows = candidatas.map((p, i) => {
    const r = i + 2
    const valorF = `=IF(VLOOKUP($A${r};'Propiedades'!$A:$Q;17;FALSE)<>"";VLOOKUP($A${r};'Propiedades'!$A:$Q;17;FALSE);VLOOKUP($A${r};'Propiedades'!$A:$Q;16;FALSE))`
    const origenF = `=IF(VLOOKUP($A${r};'Propiedades'!$A:$Q;17;FALSE)<>"";"Mercado";"Catastro")`
    const mesesF = `=IFERROR(COUNTA(UNIQUE(FILTER(TEXT('Movimientos'!$A:$A;"YYYY-MM");'Movimientos'!$B:$B=$A${r};'Movimientos'!$A:$A>=EDATE(TODAY();-12);'Movimientos'!$A:$A<=TODAY())));0)`
    const estimF = `=IF(AND(E${r}>0;E${r}<12);"Sí";"No")`
    const ventana = `'Movimientos'!$A:$A;">="&EDATE(TODAY();-12);'Movimientos'!$A:$A;"<="&TODAY()`
    const factor = `IF(E${r}<12;12/E${r};1)`
    const ingresosF = `=IF(E${r}=0;0;SUMIFS('Movimientos'!$F:$F;'Movimientos'!$B:$B;$A${r};'Movimientos'!$D:$D;"Ingreso";${ventana})*VLOOKUP($A${r};'Propiedades'!$A:$G;7;FALSE)/100*${factor})`
    const gastosF = `=IF(E${r}=0;0;SUMIFS('Movimientos'!$F:$F;'Movimientos'!$B:$B;$A${r};'Movimientos'!$D:$D;"Gasto";${ventana})*VLOOKUP($A${r};'Propiedades'!$A:$G;7;FALSE)/100*${factor})`
    const brutaF = `=IF(C${r}=0;0;G${r}/C${r}*100)`
    const netaF = `=IF(C${r}=0;0;(G${r}-H${r})/C${r}*100)`
    const ratioF = `=IF(G${r}=0;0;H${r}/G${r}*100)`
    const veredictoF = `=IF(E${r}=0;"Sin datos";IF(K${r}>40;"Gastos altos";IF(J${r}<${umbralStr};"Insuficiente";"Buena")))`
    const mensajeF = `=IF(E${r}=0;"Aún no hay movimientos en el último año para valorar esta propiedad.";IF(K${r}>40;"Los gastos son el "&TEXT(K${r};"0")&"% de los ingresos — valora si conviene invertir en la vivienda (para reducirlos o poder subir el alquiler) antes de decidir sobre venderla.";IF(J${r}<${umbralStr};"Rentabilidad neta "&TEXT(J${r};"0,00")&"%, por debajo de tu umbral (${umbralStr}%) — revisa gastos, el alquiler pactado, o valora vender.";"Rentabilidad neta "&TEXT(J${r};"0,00")&"%, por encima de tu umbral (${umbralStr}%).")))`
    return [p.nombre, gestion(p), valorF, origenF, mesesF, estimF, ingresosF, gastosF, brutaF, netaF, ratioF, veredictoF, mensajeF]
  })
  return { headers, rows, moneyCols: [2, 6, 7] }
}

// ─── Evolución anual por propiedad: matriz año × propiedad, por fórmula ────
function buildEvolucionAnual(propiedadesJose: Propiedad[], transacciones: Transaccion[]) {
  if (propiedadesJose.length === 0) return { headers: ['Año', 'Total'], rows: [], moneyCols: [] }

  const anios = [...new Set(transacciones.map((t) => t.fecha.slice(0, 4)))].sort()
  const headers = ['Año', ...propiedadesJose.map((p) => p.nombre), 'Total']
  const ultimaColLetra = numToColLetter(propiedadesJose.length + 1)
  const rows = anios.map((anio, i) => {
    const r = i + 2
    const cols = propiedadesJose.map((_p, colIdx) => {
      const col = numToColLetter(colIdx + 2)
      const rango = `'Movimientos'!$A:$A;">="&DATE($A${r};1;1);'Movimientos'!$A:$A;"<="&DATE($A${r};12;31)`
      return `=(SUMIFS('Movimientos'!$F:$F;'Movimientos'!$B:$B;${col}$1;'Movimientos'!$D:$D;"Ingreso";${rango})-SUMIFS('Movimientos'!$F:$F;'Movimientos'!$B:$B;${col}$1;'Movimientos'!$D:$D;"Gasto";${rango}))*VLOOKUP(${col}$1;'Propiedades'!$A:$G;7;FALSE)/100`
    })
    return [anio, ...cols, `=SUM(B${r}:${ultimaColLetra}${r})`]
  })
  const moneyCols = propiedadesJose.map((_, i) => i + 1).concat([propiedadesJose.length + 1])
  return { headers, rows, moneyCols }
}

// ─── Modelo 420: base/IGIC/IRPF de cada trimestre con renta cobrada ────────
// Las filas (qué año/trimestre/local existen) se deciden en JS con los
// datos actuales; los importes de cada celda son fórmulas.
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
        rows.push([anio, `T${trimestre}`, p.nombre, '', '', '', ''])
      }
    }
  }
  rows.forEach((row, i) => {
    const r = i + 2
    const inicioTrimestre = `DATE($A${r};(VALUE(MID($B${r};2;1))-1)*3+1;1)`
    const netaF = `=SUMIFS('Movimientos'!$F:$F;'Movimientos'!$B:$B;$C${r};'Movimientos'!$D:$D;"Ingreso";'Movimientos'!$E:$E;"Alquiler mensual";'Movimientos'!$A:$A;">="&${inicioTrimestre};'Movimientos'!$A:$A;"<="&EOMONTH(${inicioTrimestre};2))*VLOOKUP($C${r};'Propiedades'!$A:$G;7;FALSE)/100`
    row[6] = netaF
    row[3] = `=G${r}/${esNum(0.88)}`
    row[4] = `=D${r}*${esNum(0.07)}`
    row[5] = `=D${r}*${esNum(0.19)}`
  })
  return { headers, rows, moneyCols: [3, 4, 5, 6] }
}

// ─── Estimador de la Renta: detalle por propiedad y año, por fórmula ───────
function buildEstimadorRentaPorPropiedad(propiedadesJose: Propiedad[], anios: string[]) {
  const headers = ['Año', 'Propiedad', 'Ingresos', 'Gastos', 'Rendimiento neto', 'Reducible', 'Rendimiento computable', 'IRPF ya retenido (locales)']
  const rows: (string | number)[][] = []
  for (const anio of anios) {
    for (const p of propiedadesJose) {
      rows.push([anio, p.nombre, '', '', '', '', '', ''])
    }
  }
  rows.forEach((row, i) => {
    const r = i + 2
    const rango = `'Movimientos'!$A:$A;">="&DATE($A${r};1;1);'Movimientos'!$A:$A;"<="&DATE($A${r};12;31)`
    const alquiler = `SUMIFS('Movimientos'!$F:$F;'Movimientos'!$B:$B;$B${r};'Movimientos'!$D:$D;"Ingreso";'Movimientos'!$E:$E;"Alquiler mensual";${rango})`
    const otros = `(SUMIFS('Movimientos'!$F:$F;'Movimientos'!$B:$B;$B${r};'Movimientos'!$D:$D;"Ingreso";'Movimientos'!$E:$E;"Electricidad (repercutida)";${rango})+SUMIFS('Movimientos'!$F:$F;'Movimientos'!$B:$B;$B${r};'Movimientos'!$D:$D;"Ingreso";'Movimientos'!$E:$E;"Agua (repercutida)";${rango})+SUMIFS('Movimientos'!$F:$F;'Movimientos'!$B:$B;$B${r};'Movimientos'!$D:$D;"Ingreso";'Movimientos'!$E:$E;"Otros ingresos";${rango}))`
    const esLocal = `VLOOKUP($B${r};'Propiedades'!$A:$D;4;FALSE)="Local"`
    const pct = `VLOOKUP($B${r};'Propiedades'!$A:$G;7;FALSE)/100`
    row[2] = `=(IF(${esLocal};${alquiler}/${esNum(0.88)};${alquiler})+${otros})*${pct}`
    row[3] = `=SUMIFS('Movimientos'!$F:$F;'Movimientos'!$B:$B;$B${r};'Movimientos'!$D:$D;"Gasto";${rango})*${pct}`
    row[4] = `=C${r}-D${r}`
    row[5] = `=IF(OR(VLOOKUP($B${r};'Propiedades'!$A:$D;4;FALSE)="Piso";VLOOKUP($B${r};'Propiedades'!$A:$D;4;FALSE)="Casa");"Sí";"No")`
    row[6] = `=IF(AND(F${r}="Sí";E${r}>0);E${r}*(1-${esNum(REDUCCION_VIVIENDA_PCT)}/100);E${r})`
    row[7] = `=IF(${esLocal};${alquiler}*${pct}/${esNum(0.88)}*${esNum(0.19)};0)`
  })
  return { headers, rows, moneyCols: [2, 3, 4, 6, 7] }
}

// ─── Estimador de la Renta: resumen agregado por año, por fórmula ──────────
// La cuota progresiva usa el patrón estándar SUMPRODUCT sobre "Tramos IRPF":
// para cada tramo, MAX(0, MIN(base,Hasta)-Desde) * Tipo — expresado con
// IF() en vez de MIN/MAX porque MIN/MAX no vectorizan por fila dentro de
// SUMPRODUCT (colapsarían el rango a un solo valor), mientras que IF() con
// argumentos-rango sí se evalúa elemento a elemento.
function cuotaIrpfFormula(baseCell: string): string {
  return `SUMPRODUCT(IF(${baseCell}<='Tramos IRPF'!$A$2:$A$7;0;IF(${baseCell}>='Tramos IRPF'!$B$2:$B$7;'Tramos IRPF'!$B$2:$B$7-'Tramos IRPF'!$A$2:$A$7;${baseCell}-'Tramos IRPF'!$A$2:$A$7))*'Tramos IRPF'!$C$2:$C$7/100)`
}

// "A guardar" es la cuota total (nómina/otros ingresos + alquileres, todo
// junto) menos TODA la retención ya practicada (nómina/otros ingresos +
// locales) — no solo la parte marginal que generan los alquileres, para
// detectar también si la retención de la nómina se queda corta.
function buildEstimadorRentaResumen(anios: string[]) {
  const headers = [
    'Año',
    'Rendimiento inmobiliario (reducido)',
    'Otros ingresos',
    'Base imponible total',
    'Tramo marginal %',
    'Cuota total estimada',
    'IRPF que generan los alquileres (informativo)',
    'Retenido en nómina/otros ingresos',
    'Retenido en origen (locales)',
    'Total ya retenido',
    'A guardar',
  ]
  const rows = anios.map((anio, i) => {
    const r = i + 2
    return [
      anio,
      `=SUMIF('Estimador Renta (por propiedad)'!$A:$A;$A${r};'Estimador Renta (por propiedad)'!$G:$G)`,
      `=SUM('Ingresos externos'!$B:$B)`,
      `=C${r}+MAX(0;B${r})`,
      `=IF(D${r}=0;19;SUMPRODUCT((D${r}>'Tramos IRPF'!$A$2:$A$7)*(D${r}<='Tramos IRPF'!$B$2:$B$7)*'Tramos IRPF'!$C$2:$C$7))`,
      `=${cuotaIrpfFormula(`D${r}`)}`,
      `=MAX(0;F${r}-${cuotaIrpfFormula(`C${r}`)})`,
      `=SUM('Ingresos externos'!$D$2:$D$1000)`,
      `=SUMIF('Estimador Renta (por propiedad)'!$A:$A;$A${r};'Estimador Renta (por propiedad)'!$H:$H)`,
      `=H${r}+I${r}`,
      `=MAX(0;F${r}-J${r})`,
    ]
  })
  return { headers, rows, moneyCols: [1, 2, 3, 5, 6, 7, 8, 9, 10] }
}

// Crea (sustituyendo cualquier exportación anterior) un informe completo con
// prácticamente todos los datos de la app, funcional por sí mismo: las hojas
// de configuración/histórico son datos fijos, pero Resumen, Movimientos
// (reparto), Rentabilidad, Evolución anual, Modelo 420 y Estimador de la
// Renta son fórmulas en vivo que se recalculan si se edita un importe o se
// añade un movimiento directamente en Sheets. Todas las hojas se crean
// siempre (aunque estén vacías), porque las fórmulas de unas referencian a
// otras y ocultar una rompería las que dependen de ella con #REF!. Requiere
// que ya se haya concedido el token de Drive (ensureDriveAccess en
// AppContext).
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

  const propiedadesJose = propiedades.filter((p) => esDeJose(p) && esDeAlquiler(p))
  const locales = propiedadesJose.filter((p) => p.tipo === 'local')
  const anios = anosConDatos(transacciones)
  const anioActual = new Date().getFullYear().toString()

  const umbralRaw = localStorage.getItem('finca_umbral_rentabilidad')
  const umbralParsed = umbralRaw ? parseImporte(umbralRaw) : NaN
  const umbral = Number.isNaN(umbralParsed) ? 4 : umbralParsed

  const sheetsAIncluir: { title: string; spec: Omit<SheetSpec, 'title' | 'gid'> }[] = [
    { title: 'Resumen', spec: buildResumen(propiedades, anioActual) },
    { title: 'Propiedades', spec: buildPropiedades(propiedades) },
    { title: 'Reparto de suministros', spec: buildRepartoSuministros(propiedades) },
    { title: 'Gastos fijos mensuales', spec: buildGastosRecurrentes(propiedades) },
    { title: 'Movimientos', spec: buildMovimientos(propiedades, transacciones) },
    { title: 'Historial de alquileres', spec: buildHistorial(propiedades) },
    { title: 'Rentabilidad y valoración', spec: buildRentabilidad(propiedades, umbral) },
    { title: 'Evolución anual', spec: buildEvolucionAnual(propiedadesJose, transacciones) },
    { title: 'Modelo 420', spec: buildModelo420(locales, transacciones) },
    { title: 'Tramos IRPF', spec: buildTramosIRPF() },
    { title: 'Estimador Renta (resumen)', spec: buildEstimadorRentaResumen(anios) },
    { title: 'Estimador Renta (por propiedad)', spec: buildEstimadorRentaPorPropiedad(propiedadesJose, anios) },
    { title: 'Ingresos externos', spec: buildIngresosExternos(ingresosExternos) },
  ]

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
