// Parsea un importe tecleado en formato español: admite "1.200,50" (miles +
// decimal), "1200,50", "1200.50" y "1200". Sin coma, un único punto seguido
// de exactamente 3 dígitos se interpreta como separador de miles ("1.200" ->
// 1200), no como decimal — es como se teclea normalmente en España sin
// decimales. Devuelve NaN si el texto no es un número válido (usar
// Number.isNaN en el llamante), en vez de deducir un 0 en silencio.
export function parseImporte(raw: string): number {
  // Valores de catastro/tasación suelen copiarse tal cual del documento
  // oficial, con el símbolo del euro pegado (p.ej. "128.061,67 €") — sin
  // esto, ese símbolo hacía que Number(...) devolviera NaN y bloqueara el
  // guardado sin ningún indicio de por qué.
  const s = raw.trim().replace(/€/g, '').trim()
  if (!s) return NaN
  if (s.includes(',')) {
    return Number(s.replace(/\./g, '').replace(',', '.'))
  }
  const puntos = s.split('.').length - 1
  if (puntos === 1) {
    const dec = s.split('.')[1]
    if (dec.length === 3) return Number(s.replace('.', ''))
    return Number(s)
  }
  if (puntos > 1) {
    return Number(s.replace(/\./g, ''))
  }
  return Number(s)
}

export type PropiedadTipo = 'piso' | 'casa' | 'local' | 'garaje' | 'otro'
export type PropiedadEstado =
  | 'alquilado'
  | 'vacio'
  | 'reforma'
  | 'venta'
  | 'uso_propio'
  | 'vivienda_habitual'
export type TransaccionTipo = 'ingreso' | 'gasto'

// Condiciones de un tramo del contrato actual (mismo inquilino). El contrato
// no se termina: inquilino y contratoInicio se mantienen. Cada tramo cubre
// desde vigenteDesde hasta el día anterior al siguiente tramo (el último
// sigue abierto). Si tramosContrato está vacío, los campos sueltos de la
// propiedad (alquilerMensual, contratoFin, fianzaImporte) son el único tramo,
// implícito desde contratoInicio.
export interface TramoContrato {
  id: string
  vigenteDesde: string // YYYY-MM-DD
  alquilerMensual?: number
  contratoFin?: string // YYYY-MM-DD
  fianzaImporte?: number
  notas?: string
}

export interface Propiedad {
  id: string
  nombre: string
  direccion: string
  tipo: PropiedadTipo
  estado: PropiedadEstado
  folderId: string
  creadoEn: string
  // Optional extended fields (added in v2 schema)
  inquilinoNombre?: string
  inquilinoEmail?: string
  inquilinoTelefono?: string
  inquilinoDni?: string
  alquilerMensual?: number
  contratoInicio?: string // YYYY-MM-DD
  contratoFin?: string // YYYY-MM-DD
  notas?: string
  contratoArchivoId?: string // Drive file ID del contrato de alquiler
  contratoArchivoNombre?: string
  reparto?: Reparto // quién paga agua/luz/basuras/IBI
  historialContratos?: ContratoHistorico[] // alquileres anteriores ya terminados
  tramosContrato?: TramoContrato[] // cambios de condiciones del contrato en vigor, con fecha desde la que aplican
  porcentajePropiedad?: number // 0-100, % de la propiedad que es de Jose (sin definir = 100%)
  gastosRecurrentes?: GastoRecurrente[] // gastos fijos que se repiten cada mes (comunidad, etc.)
  referenciaCatastral?: string
  municipio?: string
  valorReferencia?: number // valor de referencia del Catastro (uso fiscal)
  valorMercado?: number // estimación de valor de mercado, para calcular rentabilidad
  propietarioNombre?: string // si Jose solo la gestiona pero es de otra persona (p.ej. "Martín")
  alDiaDesde?: string // ISO datetime: última vez que se marcó "al día" con todos los datos del periodo (ver estaAlDia)
  contratoLuzNumero?: string
  contratoLuzEmpresa?: string
  contratoAguaNumero?: string
  contratoAguaEmpresa?: string
  deudaDesde?: string // YYYY-MM: mes desde el que se cuenta la deuda de renta (ver deudaInquilino) — "dar la deuda por saldada" lo adelanta al mes actual sin tocar el contrato
  rentaRevisadaDesde?: string // ISO datetime: última vez que se marcó la renta como revisada (cláusula de actualización anual, ver tocaRevisarRenta)
  valorConstruccion?: number // valor catastral de la construcción (sin suelo), del recibo del IBI — base de la amortización deducible en IRPF
  certificadoEnergeticoVencimiento?: string // YYYY-MM-DD — el certificado de eficiencia energética caduca a los 10 años
  fianzaImporte?: number // fianza legal a depositar en el organismo correspondiente (normalmente 1 mes de renta, 2 en locales)
  fianzaDepositadaDesde?: string // ISO datetime: cuándo se marcó como depositada — undefined = pendiente de depositar
  diaCobro?: number // 1-28, día del mes a partir del cual se avisa de renta pendiente (sin definir = 5)
  fianzaDepositoNumero?: string // nº de resguardo ICAVI / organismo
  fianzaDepositoArchivoId?: string
  fianzaDepositoArchivoNombre?: string
  seguroVencimiento?: string // YYYY-MM-DD
  ibiMes?: number // 1-12, mes en que suele llegar el IBI
}

// Propiedades que son de Jose (sin propietarioNombre) — para excluir las que
// gestiona por cuenta de otros de sus totales y cálculos fiscales personales.
export function esDeJose(propiedad: Pick<Propiedad, 'propietarioNombre'>): boolean {
  return !propiedad.propietarioNombre
}

// Propiedades en uso propio o como vivienda habitual: no generan
// rendimiento de alquiler, así que se llevan en un apartado aparte (ver
// PropiedadesView) y se excluyen de los totales de rendimiento de alquiler
// del Dashboard y de la pestaña Fiscal (Renta, Modelo 420, estimador) — solo
// son gasto personal, no actividad económica de alquiler.
export function esDeAlquiler(propiedad: Pick<Propiedad, 'estado'>): boolean {
  return propiedad.estado !== 'uso_propio' && propiedad.estado !== 'vivienda_habitual'
}

export interface Rentabilidad {
  bruta: number // % anual sobre el valor, solo ingresos
  neta: number // % anual sobre el valor, ingresos - gastos
}

// Rentabilidad anual (%) de una propiedad sobre un valor de referencia
// (mercado o catastral) — null si no hay valor con el que calcularla.
export function calcularRentabilidad(
  ingresosAnuales: number,
  gastosAnuales: number,
  valor: number | undefined,
): Rentabilidad | null {
  if (!valor || valor <= 0) return null
  return {
    bruta: (ingresosAnuales / valor) * 100,
    neta: ((ingresosAnuales - gastosAnuales) / valor) * 100,
  }
}

// ─── Amortización del inmueble ──────────────────────────────────────────────
// Deducción de IRPF por depreciación del inmueble: el 3% anual del valor de
// construcción (sin el suelo, que no se deprecia) es gasto deducible aunque
// no suponga un desembolso real ese año — la deducción más grande que suele
// pasarse por alto en una declaración de alquiler llevada a mano. Aplica a
// cualquier tipo de inmueble alquilado, no solo a los que llevan la
// reducción del 60%/50% de vivienda habitual.
export const AMORTIZACION_PCT = 3

export function amortizacionAnual(
  propiedad: Pick<
    Propiedad,
    'valorConstruccion' | 'porcentajePropiedad' | 'estado' | 'contratoInicio' | 'contratoFin' | 'historialContratos'
  >,
  anio?: string,
): number {
  if (!propiedad.valorConstruccion) return 0
  const anual = miParte(propiedad.valorConstruccion, propiedad) * (AMORTIZACION_PCT / 100)
  if (!anio) return anual
  const meses = mesesAlquiladosEnAnio(propiedad, anio)
  return Math.round(anual * (meses / 12) * 100) / 100
}

// Meses del año civil con ocupación de alquiler (contrato en vigor o
// historial). Sin fechas, un inmueble que sigue `alquilado` cuenta 12;
// vacío/reforma/venta sin historial ese año, 0.
export function mesesAlquiladosEnAnio(
  propiedad: Pick<Propiedad, 'estado' | 'contratoInicio' | 'contratoFin' | 'historialContratos'>,
  anio: string,
): number {
  const desde = `${anio}-01-01`
  const hasta = `${anio}-12-31`
  const periodos: { ini: string; fin: string }[] = []
  for (const h of propiedad.historialContratos ?? []) {
    periodos.push({ ini: h.fechaInicio ?? h.fechaFin, fin: h.fechaFin })
  }
  if (propiedad.contratoInicio) {
    let fin = propiedad.contratoFin ?? hasta
    if (propiedad.estado === 'alquilado' && (!propiedad.contratoFin || propiedad.contratoFin < hasta)) {
      fin = hasta
    }
    periodos.push({ ini: propiedad.contratoInicio, fin })
  }
  const meses = new Set<string>()
  for (const per of periodos) {
    const a = per.ini > desde ? per.ini : desde
    const b = per.fin < hasta ? per.fin : hasta
    if (a > b) continue
    for (const m of mesesEntre(a.slice(0, 7), b.slice(0, 7))) meses.add(m)
  }
  if (meses.size > 0) return meses.size
  if (propiedad.estado === 'alquilado') return 12
  return 0
}

// ─── Valoración: ¿es suficiente la rentabilidad? ───────────────────────────────
// Heurística orientativa, no asesoramiento financiero: compara la
// rentabilidad neta (anualizada sobre los últimos 12 meses) contra un
// umbral que el usuario define, y avisa si los gastos pesan demasiado sobre
// los ingresos. Si la propiedad tiene menos de 12 meses de datos, extrapola
// la media mensual observada a un año completo — y lo marca como estimación.

function ultimosNMeses(hoy: Date, n: number): string[] {
  const meses: string[] = []
  let y = hoy.getFullYear()
  let m = hoy.getMonth() + 1
  for (let i = 0; i < n; i++) {
    meses.unshift(`${y}-${String(m).padStart(2, '0')}`)
    m--
    if (m < 1) {
      m = 12
      y--
    }
  }
  return meses
}

export interface ValoracionPropiedad {
  veredicto: 'sin_datos' | 'buena' | 'insuficiente' | 'gastos_altos'
  mensaje: string
  ingresosAnualizados: number
  gastosAnualizados: number
  rentabilidadNeta: number
  ratioGastosPct: number
  esEstimacion: boolean // true si se anualizó con menos de 12 meses de datos reales
  mesesConDatos: number
}

export function valorarPropiedad(
  propiedad: Pick<Propiedad, 'id' | 'porcentajePropiedad' | 'valorMercado' | 'valorReferencia'>,
  transacciones: Transaccion[],
  umbralNetaPct: number,
  hoy: Date = new Date(),
): ValoracionPropiedad | null {
  const valor = propiedad.valorMercado ?? propiedad.valorReferencia
  if (!valor || valor <= 0) return null

  const ventana = ultimosNMeses(hoy, 12)
  const [desdeVentana] = rangoMes(ventana[0])
  const [, hastaVentana] = rangoMes(ventana[ventana.length - 1])
  const txsPropiedad = transacciones.filter((t) => t.propiedadId === propiedad.id)
  const mesesConDatos = ventana.filter((mes) => {
    const [desdeMes, hastaMes] = rangoMes(mes)
    return txsPropiedad.some((t) => importeEnRango(t, desdeMes, hastaMes) !== 0)
  }).length

  if (mesesConDatos === 0) {
    return {
      veredicto: 'sin_datos',
      mensaje: 'Aún no hay movimientos en el último año para valorar esta propiedad.',
      ingresosAnualizados: 0,
      gastosAnualizados: 0,
      rentabilidadNeta: 0,
      ratioGastosPct: 0,
      esEstimacion: false,
      mesesConDatos: 0,
    }
  }

  const ingresos = txsPropiedad
    .filter((t) => t.tipo === 'ingreso')
    .reduce((s, t) => s + miParte(importeEnRango(t, desdeVentana, hastaVentana), propiedad, t.soloMio), 0)
  const gastos = txsPropiedad
    .filter((t) => t.tipo === 'gasto')
    .reduce((s, t) => s + miParte(importeEnRango(t, desdeVentana, hastaVentana), propiedad, t.soloMio), 0)

  const esEstimacion = mesesConDatos < 12
  const factor = esEstimacion ? 12 / mesesConDatos : 1
  const ingresosAnualizados = ingresos * factor
  const gastosAnualizados = gastos * factor

  const rentabilidadNeta = ((ingresosAnualizados - gastosAnualizados) / valor) * 100
  const ratioGastosPct = ingresosAnualizados > 0 ? (gastosAnualizados / ingresosAnualizados) * 100 : 0

  let veredicto: ValoracionPropiedad['veredicto']
  let mensaje: string
  if (ratioGastosPct > 40) {
    veredicto = 'gastos_altos'
    mensaje = `Los gastos son el ${ratioGastosPct.toFixed(0)}% de los ingresos — valora si conviene invertir en la vivienda (para reducirlos o poder subir el alquiler) antes de decidir sobre venderla.`
  } else if (rentabilidadNeta < umbralNetaPct) {
    veredicto = 'insuficiente'
    mensaje = `Rentabilidad neta ${rentabilidadNeta.toFixed(2)}%, por debajo de tu umbral (${umbralNetaPct}%) — revisa gastos, el alquiler pactado, o valora vender.`
  } else {
    veredicto = 'buena'
    mensaje = `Rentabilidad neta ${rentabilidadNeta.toFixed(2)}%, por encima de tu umbral (${umbralNetaPct}%).`
  }

  return {
    veredicto,
    mensaje,
    ingresosAnualizados,
    gastosAnualizados,
    rentabilidadNeta,
    ratioGastosPct,
    esEstimacion,
    mesesConDatos,
  }
}

// Gasto fijo mensual (comunidad, etc.) — el día 1 de cada mes, desde
// creadoEn en adelante, se genera solo como transacción si aún no existe
// una de esa categoría ese mes para la propiedad.
export interface GastoRecurrente {
  id: string
  categoria: string
  importe: number
  descripcion?: string
  creadoEn: string // YYYY-MM-DD — mes desde el que empieza a generarse
}

function mesesEntre(desdeYYYYMM: string, hastaYYYYMM: string): string[] {
  const meses: string[] = []
  let [y, m] = desdeYYYYMM.split('-').map(Number)
  const [yHasta, mHasta] = hastaYYYYMM.split('-').map(Number)
  while (y < yHasta || (y === yHasta && m <= mHasta)) {
    meses.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return meses
}

// Calcula qué gastos recurrentes faltan por generar (desde el mes en que se
// configuró cada uno hasta el mes actual) y que aún no existen como
// transacción — para crearlos automáticamente sin que haya que darlos de
// alta a mano cada mes.
export function generarGastosPendientes(
  propiedades: Propiedad[],
  transacciones: Transaccion[],
  hoy: Date = new Date(),
): Transaccion[] {
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const nuevas: Transaccion[] = []

  for (const p of propiedades) {
    for (const g of p.gastosRecurrentes ?? []) {
      const mesInicio = g.creadoEn.slice(0, 7)
      if (mesInicio > mesActual) continue
      for (const mes of mesesEntre(mesInicio, mesActual)) {
        const misma = (t: Transaccion) =>
          t.propiedadId === p.id &&
          t.fecha.startsWith(mes) &&
          (t.gastoRecurrenteId === g.id || t.categoria === g.categoria)
        const yaExiste = transacciones.some(misma) || nuevas.some(misma)
        if (!yaExiste) {
          nuevas.push({
            id: crypto.randomUUID(),
            propiedadId: p.id,
            fecha: `${mes}-01`,
            tipo: 'gasto',
            importe: g.importe,
            categoria: g.categoria,
            descripcion: g.descripcion || 'Gasto fijo mensual',
            archivos: [],
            creadoEn: new Date().toISOString(),
            gastoRecurrenteId: g.id,
          })
        }
      }
    }
  }

  return nuevas
}

// Aplica el % de propiedad de Jose a un importe — para propiedades a medias,
// todos los resúmenes de la app muestran ya solo su parte. `soloMio` (por
// transacción, no por propiedad) salta ese reparto: facturas a su nombre
// personal que no son a medias con el otro propietario cuentan al 100%.
export function miParte(
  importe: number,
  propiedad: Pick<Propiedad, 'porcentajePropiedad'>,
  soloMio?: boolean,
): number {
  if (soloMio) return importe
  const pct = propiedad.porcentajePropiedad ?? 100
  return importe * (pct / 100)
}

// Snapshot de un alquiler ya terminado, guardado al pulsar "Terminar
// contrato" — permite que una propiedad tenga varios inquilinos/contratos
// a lo largo del tiempo sin perder el histórico de cada uno.
export interface ContratoHistorico {
  id: string
  inquilinoNombre?: string
  inquilinoEmail?: string
  inquilinoTelefono?: string
  inquilinoDni?: string
  alquilerMensual?: number
  fechaInicio?: string // YYYY-MM-DD
  fechaFin: string // YYYY-MM-DD — fecha real en que terminó
  contratoArchivoId?: string
  contratoArchivoNombre?: string
  fianzaImporte?: number
  tramos?: TramoContrato[] // si el contrato tuvo cambios de condiciones antes de terminar
}

// Fecha local YYYY-MM-DD — mismo criterio que contratoEstado/deudaInquilino
// (getFullYear/getMonth/getDate, no UTC).
export function fechaISO(hoy: Date = new Date()): string {
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
}

const TRAMO_INICIAL_ID = 'tramo-inicial'

export type CambioCondicionesContrato = {
  vigenteDesde: string
  alquilerMensual?: number
  contratoFin?: string
  fianzaImporte?: number
  notas?: string
}

export type ResultadoCambioCondiciones =
  | { ok: true; propiedad: Propiedad }
  | { ok: false; error: string }

// Tramos persistidos, o uno implícito con los campos sueltos de la ficha
// si todavía no se ha registrado ningún cambio de condiciones.
export function tramosEfectivos(
  propiedad: Pick<
    Propiedad,
    'tramosContrato' | 'contratoInicio' | 'alquilerMensual' | 'contratoFin' | 'fianzaImporte'
  >,
): TramoContrato[] {
  if (propiedad.tramosContrato && propiedad.tramosContrato.length > 0) {
    return [...propiedad.tramosContrato].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
  }
  if (!propiedad.contratoInicio) return []
  return [
    {
      id: TRAMO_INICIAL_ID,
      vigenteDesde: propiedad.contratoInicio,
      alquilerMensual: propiedad.alquilerMensual,
      contratoFin: propiedad.contratoFin,
      fianzaImporte: propiedad.fianzaImporte,
    },
  ]
}

export function tramoEnFecha(
  propiedad: Pick<
    Propiedad,
    'tramosContrato' | 'contratoInicio' | 'alquilerMensual' | 'contratoFin' | 'fianzaImporte'
  >,
  fecha: string,
): TramoContrato | undefined {
  const tramos = tramosEfectivos(propiedad)
  let vigente: TramoContrato | undefined
  for (const t of tramos) {
    if (t.vigenteDesde <= fecha) vigente = t
    else break
  }
  return vigente
}

export function alquilerVigente(
  propiedad: Pick<
    Propiedad,
    | 'tramosContrato'
    | 'contratoInicio'
    | 'alquilerMensual'
    | 'contratoFin'
    | 'fianzaImporte'
    | 'historialContratos'
    | 'inquilinoNombre'
    | 'inquilinoDni'
  >,
  fecha?: string,
  hoy: Date = new Date(),
): number | undefined {
  const dia = fecha ?? fechaISO(hoy)
  if (propiedad.contratoInicio && dia >= propiedad.contratoInicio) {
    const tramo = tramoEnFecha(propiedad, dia)
    if (tramo?.alquilerMensual != null) return tramo.alquilerMensual
    return propiedad.alquilerMensual
  }
  // Fecha anterior al contrato en ficha: si es el mismo inquilino y el
  // contrato anterior está en el historial (sustitución sin cambiar de
  // persona), usa la renta de ese periodo.
  const historico = (propiedad.historialContratos ?? [])
    .filter((c) => mismoInquilino(c, propiedad) && historicoCubre(c, dia))
    .sort((a, b) => b.fechaFin.localeCompare(a.fechaFin))[0]
  if (historico) return alquilerDeHistorico(historico, dia)
  // Sin fecha de inicio, los campos sueltos de la ficha siguen siendo la
  // renta pactada (el caso anterior a esta feature).
  if (!propiedad.contratoInicio && !propiedad.tramosContrato?.length) return propiedad.alquilerMensual
  return undefined
}

export function periodoTramo(
  tramos: TramoContrato[],
  index: number,
): { desde: string; hasta?: string } {
  const t = tramos[index]
  const siguiente = tramos[index + 1]
  if (!t) return { desde: '' }
  if (!siguiente) return { desde: t.vigenteDesde, hasta: t.contratoFin }
  const d = new Date(`${siguiente.vigenteDesde}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return { desde: t.vigenteDesde, hasta: fechaISO(d) }
}

function snapshotTramo(anterior: TramoContrato | undefined, cambio: CambioCondicionesContrato): TramoContrato {
  return {
    id: crypto.randomUUID(),
    vigenteDesde: cambio.vigenteDesde,
    alquilerMensual: cambio.alquilerMensual ?? anterior?.alquilerMensual,
    contratoFin: cambio.contratoFin ?? anterior?.contratoFin,
    fianzaImporte: cambio.fianzaImporte ?? anterior?.fianzaImporte,
    notas: cambio.notas?.trim() ? cambio.notas.trim() : undefined,
  }
}

function hayCambioRespecto(anterior: TramoContrato | undefined, nuevo: TramoContrato): boolean {
  if (!anterior) return true
  return (
    anterior.alquilerMensual !== nuevo.alquilerMensual ||
    anterior.contratoFin !== nuevo.contratoFin ||
    anterior.fianzaImporte !== nuevo.fianzaImporte ||
    (nuevo.notas ?? '') !== (anterior.notas ?? '')
  )
}

// Recalcula los campos sueltos de la ficha (alquilerMensual, contratoFin,
// fianzaImporte) a partir de los tramos: la renta y la fianza son las del
// tramo vigente hoy; el vencimiento es el del último pacto, para que una
// renovación futura quite ya el aviso de contrato por vencer.
export function sincronizarCamposVigentes(propiedad: Propiedad, hoy: Date = new Date()): Propiedad {
  const tramos = tramosEfectivos(propiedad)
  if (tramos.length === 0) return propiedad
  const vigente = tramoEnFecha(propiedad, fechaISO(hoy)) ?? tramos[0]
  const ultimo = tramos[tramos.length - 1]
  return {
    ...propiedad,
    alquilerMensual: vigente.alquilerMensual,
    contratoFin: ultimo.contratoFin,
    fianzaImporte: vigente.fianzaImporte,
  }
}

export function aplicarCambioCondiciones(
  propiedad: Propiedad,
  cambio: CambioCondicionesContrato,
  hoy: Date = new Date(),
): ResultadoCambioCondiciones {
  if (propiedad.estado !== 'alquilado') {
    return { ok: false, error: 'Solo se pueden cambiar las condiciones de un contrato en vigor' }
  }
  if (!propiedad.contratoInicio) {
    return { ok: false, error: 'Falta la fecha de inicio del contrato' }
  }
  if (!cambio.vigenteDesde) {
    return { ok: false, error: 'Indica desde qué fecha aplican las nuevas condiciones' }
  }
  if (cambio.vigenteDesde < propiedad.contratoInicio) {
    return { ok: false, error: 'La fecha no puede ser anterior al inicio del contrato' }
  }

  const existentes = tramosEfectivos(propiedad).map((t) =>
    t.id === TRAMO_INICIAL_ID ? { ...t, id: crypto.randomUUID() } : t,
  )
  const anterior = [...existentes].reverse().find((t) => t.vigenteDesde < cambio.vigenteDesde)
  const existenteMismoDia = existentes.find((t) => t.vigenteDesde === cambio.vigenteDesde)
  const nuevo = snapshotTramo(anterior ?? existenteMismoDia, cambio)
  const compararCon = existenteMismoDia ?? anterior
  if (!hayCambioRespecto(compararCon, nuevo)) {
    return { ok: false, error: 'No hay ningún cambio respecto a las condiciones anteriores' }
  }

  const tramos = [...existentes.filter((t) => t.vigenteDesde !== cambio.vigenteDesde), nuevo].sort((a, b) =>
    a.vigenteDesde.localeCompare(b.vigenteDesde),
  )
  const alquilerCambio = (anterior ?? existenteMismoDia)?.alquilerMensual !== nuevo.alquilerMensual

  return {
    ok: true,
    propiedad: sincronizarCamposVigentes(
      {
        ...propiedad,
        tramosContrato: tramos,
        rentaRevisadaDesde: alquilerCambio ? hoy.toISOString() : propiedad.rentaRevisadaDesde,
      },
      hoy,
    ),
  }
}

export function quitarTramoContrato(propiedad: Propiedad, tramoId: string, hoy: Date = new Date()): Propiedad {
  const tramos = (propiedad.tramosContrato ?? []).filter((t) => t.id !== tramoId)
  if (tramos.length <= 1) {
    const unico = tramos[0]
    return {
      ...propiedad,
      tramosContrato: undefined,
      alquilerMensual: unico?.alquilerMensual ?? propiedad.alquilerMensual,
      contratoFin: unico?.contratoFin ?? propiedad.contratoFin,
      fianzaImporte: unico?.fianzaImporte ?? propiedad.fianzaImporte,
    }
  }
  return sincronizarCamposVigentes({ ...propiedad, tramosContrato: tramos }, hoy)
}

// Corrige el tramo vigente hoy (editar la ficha no crea un tramo nuevo:
// para un cambio a partir de una fecha hay que usar aplicarCambioCondiciones).
export function corregirTramoVigente(
  propiedad: Propiedad,
  campos: Pick<TramoContrato, 'alquilerMensual' | 'contratoFin' | 'fianzaImporte'>,
  hoy: Date = new Date(),
): Propiedad {
  if (!propiedad.tramosContrato?.length) {
    return { ...propiedad, ...campos }
  }
  const hoyStr = fechaISO(hoy)
  const tramos = tramosEfectivos(propiedad)
  let idx = -1
  for (let i = 0; i < tramos.length; i++) {
    if (tramos[i].vigenteDesde <= hoyStr) idx = i
  }
  if (idx < 0) idx = 0
  tramos[idx] = {
    ...tramos[idx],
    alquilerMensual: campos.alquilerMensual,
    fianzaImporte: campos.fianzaImporte,
  }
  // El vencimiento de la ficha es el del contrato entero (último pacto),
  // no el del tramo de hoy — si hay una renovación futura, editar "fin"
  // en el formulario la corrige a ella.
  const last = tramos.length - 1
  tramos[last] = { ...tramos[last], contratoFin: campos.contratoFin }
  return sincronizarCamposVigentes({ ...propiedad, tramosContrato: tramos }, hoy)
}

export function diaAnteriorISO(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return fechaISO(d)
}

export function diaSiguienteISO(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return fechaISO(d)
}

function mismoInquilino(
  a: { inquilinoNombre?: string; inquilinoDni?: string },
  b: { inquilinoNombre?: string; inquilinoDni?: string },
): boolean {
  const dniA = a.inquilinoDni?.trim().toUpperCase()
  const dniB = b.inquilinoDni?.trim().toUpperCase()
  if (dniA && dniB) return dniA === dniB
  const nA = a.inquilinoNombre?.trim().toLowerCase()
  const nB = b.inquilinoNombre?.trim().toLowerCase()
  return !!nA && !!nB && nA === nB
}

function historicoCubre(c: ContratoHistorico, fecha: string): boolean {
  if (fecha > c.fechaFin) return false
  if (c.fechaInicio && fecha < c.fechaInicio) return false
  return true
}

function alquilerDeHistorico(c: ContratoHistorico, fecha: string): number | undefined {
  if (c.tramos && c.tramos.length > 0) {
    const sorted = [...c.tramos].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
    let vigente: TramoContrato | undefined
    for (const t of sorted) {
      if (t.vigenteDesde <= fecha) vigente = t
    }
    if (vigente?.alquilerMensual != null) return vigente.alquilerMensual
  }
  return c.alquilerMensual
}

// Inicio del alquiler continuo al mismo inquilino: si se sustituyó el
// contrato sin cambiar de persona y las fechas son consecutivas, se
// remonta al primer contrato de esa ocupación (para la deuda).
export function inicioOcupacionActual(
  propiedad: Pick<Propiedad, 'contratoInicio' | 'historialContratos' | 'inquilinoNombre' | 'inquilinoDni'>,
): string | undefined {
  let inicio = propiedad.contratoInicio
  const hist = [...(propiedad.historialContratos ?? [])]
    .filter((c) => mismoInquilino(c, propiedad))
    .sort((a, b) => b.fechaFin.localeCompare(a.fechaFin))
  for (const c of hist) {
    if (!inicio) {
      inicio = c.fechaInicio
      continue
    }
    if (diaSiguienteISO(c.fechaFin) === inicio) {
      inicio = c.fechaInicio ?? inicio
    } else {
      break
    }
  }
  return inicio
}

export function snapshotContratoActual(propiedad: Propiedad, fechaFin: string): ContratoHistorico {
  return {
    id: crypto.randomUUID(),
    inquilinoNombre: propiedad.inquilinoNombre,
    inquilinoEmail: propiedad.inquilinoEmail,
    inquilinoTelefono: propiedad.inquilinoTelefono,
    inquilinoDni: propiedad.inquilinoDni,
    alquilerMensual: alquilerVigente(propiedad, fechaFin) ?? propiedad.alquilerMensual,
    fechaInicio: propiedad.contratoInicio,
    fechaFin,
    contratoArchivoId: propiedad.contratoArchivoId,
    contratoArchivoNombre: propiedad.contratoArchivoNombre,
    fianzaImporte: propiedad.fianzaImporte,
    tramos: propiedad.tramosContrato,
  }
}

export type ContratoNuevoInput = {
  fechaFinAnterior: string
  contratoInicio: string
  contratoFin?: string
  alquilerMensual?: number
  fianzaImporte?: number
}

// Archiva el contrato en vigor (mismo inquilino, la vivienda no queda
// vacía) y deja en la ficha un contrato nuevo, con su propia fecha de
// inicio y aniversario. Distinto de aplicarCambioCondiciones, que es un
// anexo: no cambia contratoInicio.
export function sustituirPorContratoNuevo(
  propiedad: Propiedad,
  nuevo: ContratoNuevoInput,
): ResultadoCambioCondiciones {
  if (propiedad.estado !== 'alquilado') {
    return { ok: false, error: 'Solo se puede sustituir un contrato en vigor' }
  }
  if (!nuevo.contratoInicio) {
    return { ok: false, error: 'Indica la fecha de inicio del contrato nuevo' }
  }
  if (!nuevo.fechaFinAnterior) {
    return { ok: false, error: 'Indica cuándo termina el contrato actual' }
  }
  if (nuevo.fechaFinAnterior >= nuevo.contratoInicio) {
    return { ok: false, error: 'El contrato nuevo tiene que empezar después de que termine el actual' }
  }
  if (propiedad.contratoInicio && nuevo.fechaFinAnterior < propiedad.contratoInicio) {
    return { ok: false, error: 'El fin del contrato actual no puede ser anterior a su inicio' }
  }
  if (nuevo.contratoFin && nuevo.contratoFin < nuevo.contratoInicio) {
    return { ok: false, error: 'El fin del contrato nuevo no puede ser anterior a su inicio' }
  }

  return {
    ok: true,
    propiedad: {
      ...propiedad,
      contratoInicio: nuevo.contratoInicio,
      contratoFin: nuevo.contratoFin,
      alquilerMensual: nuevo.alquilerMensual ?? propiedad.alquilerMensual,
      fianzaImporte: nuevo.fianzaImporte ?? propiedad.fianzaImporte,
      contratoArchivoId: undefined,
      contratoArchivoNombre: undefined,
      tramosContrato: undefined,
      rentaRevisadaDesde: undefined,
      historialContratos: [...(propiedad.historialContratos ?? []), snapshotContratoActual(propiedad, nuevo.fechaFinAnterior)],
    },
  }
}

export interface Transaccion {
  id: string
  propiedadId: string
  fecha: string // YYYY-MM-DD
  tipo: TransaccionTipo
  importe: number
  categoria: string
  descripcion: string
  archivos: string[] // Drive file IDs
  creadoEn: string
  referencia?: string // nº factura / referencia
  numeroFactura?: string // número correlativo asignado al generar la factura/recibo de alquiler — se pone una vez y no cambia
  periodoInicio?: string // YYYY-MM-DD — periodo facturado (agua/luz: el cobro suele ir por detrás del periodo real)
  periodoFin?: string // YYYY-MM-DD
  soloMio?: boolean // true = ignora el % de copropiedad de la propiedad, cuenta 100% para Jose (facturas a su nombre personal en propiedades a medias)
  igicSoportado?: number // IGIC incluido en un gasto de un local (deducible del IGIC repercutido en el Modelo 420) — solo aplica a locales, únicas propiedades sujetas a IGIC
  gastoRecurrenteId?: string // id del GastoRecurrente que lo generó — para no duplicar el mes si hay carrera entre dispositivos
}

// ─── Alta masiva de transacciones (pegar varias líneas) ────────────────────────
export type FilaImportada =
  | {
      linea: number
      ok: true
      fecha: string
      tipo: TransaccionTipo
      categoria: string
      importe: number
      descripcion: string
    }
  | { linea: number; ok: false; error: string; raw: string }

function normalizarFechaImportada(raw: string | undefined): string | undefined {
  const s = (raw ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (!m) return undefined
  const [, d, mes, y] = m
  return `${y}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Parsea texto pegado (una transacción por línea) para el alta masiva de
// movimientos — pensado para meter de golpe varios meses atrasados de una
// propiedad, pegando desde Excel/Sheets (columnas separadas por tabulador)
// o desde un CSV (separadas por punto y coma; deliberadamente no se admite
// la coma como separador de columnas porque parseImporte ya la usa como
// separador decimal). Columnas por línea: fecha, tipo, categoría, importe,
// descripción (opcional). Cada línea se valida por separado y una línea con
// error no bloquea el resto — así se puede corregir solo lo que falla antes
// de importar, sin perder el resto del pegado.
export function parseFilasImportadas(texto: string): FilaImportada[] {
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((raw, i) => {
      const linea = i + 1
      const delim = raw.includes('\t') ? '\t' : ';'
      const [fechaRaw, tipoRaw, categoriaRaw, importeRaw, descripcionRaw] = raw.split(delim)

      const fecha = normalizarFechaImportada(fechaRaw)
      if (!fecha) {
        return { linea, ok: false, error: 'Fecha inválida (usa AAAA-MM-DD o DD/MM/AAAA)', raw } as const
      }

      const tipoNorm = (tipoRaw ?? '').trim().toLowerCase()
      if (tipoNorm !== 'ingreso' && tipoNorm !== 'gasto') {
        return { linea, ok: false, error: 'El tipo debe ser "ingreso" o "gasto"', raw } as const
      }

      const categoria = (categoriaRaw ?? '').trim()
      if (!categoria) return { linea, ok: false, error: 'Falta la categoría', raw } as const

      const importe = parseImporte(importeRaw ?? '')
      if (Number.isNaN(importe) || importe <= 0) {
        return { linea, ok: false, error: 'Importe inválido', raw } as const
      }

      return {
        linea,
        ok: true,
        fecha,
        tipo: tipoNorm as TransaccionTipo,
        categoria,
        importe,
        descripcion: (descripcionRaw ?? '').trim(),
      } as const
    })
}

function diasEntreFechas(desde: string, hasta: string): number {
  const d1 = new Date(`${desde}T00:00:00`)
  const d2 = new Date(`${hasta}T00:00:00`)
  return Math.round((d2.getTime() - d1.getTime()) / 86400000)
}

// Importe de una transacción que corresponde al rango [desde, hasta] (YYYY-MM-DD,
// ambos inclusive) — usado por todos los totales mensuales/anuales de la app. Sin
// periodo facturado (periodoInicio/periodoFin), cuenta el importe entero si la
// fecha de pago cae dentro del rango, igual que siempre. Con periodo facturado
// (agua/luz, ver GastoSuministro/FacturasSuministros), reparte el importe
// proporcionalmente por días de solape entre el periodo y el rango — así una
// factura que cruza meses o años cuenta fiscalmente donde corresponde, no en el
// mes en que se pagó.
export function importeEnRango(
  tx: Pick<Transaccion, 'fecha' | 'importe' | 'periodoInicio' | 'periodoFin'>,
  desde: string,
  hasta: string,
): number {
  if (!tx.periodoInicio || !tx.periodoFin) {
    return tx.fecha >= desde && tx.fecha <= hasta ? tx.importe : 0
  }
  const inicioSolape = tx.periodoInicio > desde ? tx.periodoInicio : desde
  const finSolape = tx.periodoFin < hasta ? tx.periodoFin : hasta
  if (inicioSolape > finSolape) return 0
  const diasSolape = diasEntreFechas(inicioSolape, finSolape) + 1
  const diasTotales = diasEntreFechas(tx.periodoInicio, tx.periodoFin) + 1
  return Math.round(tx.importe * (diasSolape / diasTotales) * 100) / 100
}

export function rangoAnio(anio: string): [string, string] {
  return [`${anio}-01-01`, `${anio}-12-31`]
}

export function rangoMes(mesYYYYMM: string): [string, string] {
  const [y, m] = mesYYYYMM.split('-').map(Number)
  const ultimoDia = new Date(y, m, 0).getDate()
  return [`${mesYYYYMM}-01`, `${mesYYYYMM}-${String(ultimoDia).padStart(2, '0')}`]
}

// Lo que debería entrar en el banco ese mes: en vivienda, la renta pactada;
// en local, la neta (base + IGIC − IRPF), que es lo que se registra al cobrar.
export function alquilerACobrar(
  propiedad: Pick<
    Propiedad,
    | 'tipo'
    | 'alquilerMensual'
    | 'tramosContrato'
    | 'contratoInicio'
    | 'contratoFin'
    | 'fianzaImporte'
    | 'historialContratos'
    | 'inquilinoNombre'
    | 'inquilinoDni'
  >,
  fecha?: string,
  hoy: Date = new Date(),
): number | undefined {
  const bruta = alquilerVigente(propiedad, fecha, hoy)
  if (bruta == null || bruta <= 0) return undefined
  if (propiedad.tipo === 'local') return Math.round(calcularRentaLocal(bruta).neta * 100) / 100
  return bruta
}

// A partir del día de cobro (por defecto el 5), si una propiedad alquilada
// no tiene registrado al menos el importe pactado de "Alquiler mensual" de
// ese mes, se considera renta pendiente. Un cobro parcial no cierra el mes.
export function rentaPendiente(
  propiedad: Pick<
    Propiedad,
    | 'estado'
    | 'alquilerMensual'
    | 'id'
    | 'tipo'
    | 'diaCobro'
    | 'tramosContrato'
    | 'contratoInicio'
    | 'contratoFin'
    | 'fianzaImporte'
    | 'historialContratos'
    | 'inquilinoNombre'
    | 'inquilinoDni'
  >,
  transacciones: Transaccion[],
  hoy: Date = new Date(),
): boolean {
  if (propiedad.estado !== 'alquilado') return false
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const esperado = alquilerACobrar(propiedad, `${mesActual}-01`, hoy)
  if (!esperado) return false
  const diaAviso = propiedad.diaCobro && propiedad.diaCobro >= 1 && propiedad.diaCobro <= 28 ? propiedad.diaCobro : 5
  if (hoy.getDate() < diaAviso) return false
  const pagado = cobradoAlquilerEnMes(propiedad.id, transacciones, mesActual)
  return pagado + 0.005 < esperado
}

export function rentaDelMesIncompleta(
  propiedad: Parameters<typeof rentaPendiente>[0],
  transacciones: Transaccion[],
  hoy: Date = new Date(),
): boolean {
  if (propiedad.estado !== 'alquilado') return false
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const esperado = alquilerACobrar(propiedad, `${mesActual}-01`, hoy)
  if (!esperado) return false
  const pagado = cobradoAlquilerEnMes(propiedad.id, transacciones, mesActual)
  return pagado + 0.005 < esperado
}

// Mes de renta que cubre un cobro: el periodo facturado si se indicó
// (atrasos), si no el mes de la fecha de cobro. Así un pago de enero
// registrado en marzo no tapa marzo.
export function mesDelCobroAlquiler(
  t: Pick<Transaccion, 'fecha' | 'periodoInicio' | 'tipo' | 'categoria'>,
): string {
  if (t.tipo === 'ingreso' && t.categoria === 'Alquiler mensual' && t.periodoInicio) {
    return t.periodoInicio.slice(0, 7)
  }
  return t.fecha.slice(0, 7)
}

export function cobradoAlquilerEnMes(
  propiedadId: string,
  transacciones: Transaccion[],
  mes: string,
): number {
  return transacciones
    .filter(
      (t) =>
        t.propiedadId === propiedadId &&
        t.tipo === 'ingreso' &&
        t.categoria === 'Alquiler mensual' &&
        mesDelCobroAlquiler(t) === mes,
    )
    .reduce((s, t) => s + t.importe, 0)
}

export function rangoMesCivil(mes: string): { inicio: string; fin: string } {
  const y = Number(mes.slice(0, 4))
  const m = Number(mes.slice(5, 7))
  return { inicio: `${mes}-01`, fin: fechaISO(new Date(y, m, 0)) }
}

// Primer mes (desde la ocupación o deudaDesde hasta hoy) que aún no está
// cubierto. Si está todo pagado, el mes en curso — para prellenar el cobro.
export function mesAlquilerMasAntiguoPendiente(
  propiedad: Parameters<typeof rentaPendiente>[0] & Pick<Propiedad, 'deudaDesde'>,
  transacciones: Transaccion[],
  hoy: Date = new Date(),
): string {
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const inicio = inicioOcupacionActual(propiedad)?.slice(0, 7) ?? mesActual
  const desde =
    propiedad.deudaDesde && propiedad.deudaDesde > inicio ? propiedad.deudaDesde : inicio
  if (desde > mesActual) return mesActual
  for (const mes of mesesEntre(desde, mesActual)) {
    const esperado = alquilerACobrar(propiedad, `${mes}-01`, hoy)
    if (!esperado) continue
    if (cobradoAlquilerEnMes(propiedad.id, transacciones, mes) + 0.005 < esperado) return mes
  }
  return mesActual
}

// Deuda de renta acumulada. Cada mes cerrado tiene un esperado
// (`alquilerACobrar`). Un cobro con `periodoInicio` se casa a ese mes; un
// cobro antiguo sin periodo sigue restando del total (pagos que cubrían
// varios meses de golpe). `deudaDesde` adelanta el origen. El mes en curso
// no cuenta.
export function deudaInquilino(
  propiedad: Pick<
    Propiedad,
    | 'id'
    | 'estado'
    | 'tipo'
    | 'alquilerMensual'
    | 'contratoInicio'
    | 'deudaDesde'
    | 'tramosContrato'
    | 'contratoFin'
    | 'fianzaImporte'
    | 'historialContratos'
    | 'inquilinoNombre'
    | 'inquilinoDni'
  >,
  transacciones: Transaccion[],
  hoy: Date = new Date(),
): { importe: number; meses: number } | null {
  if (propiedad.estado !== 'alquilado') return null
  const inicioOcupacion = inicioOcupacionActual(propiedad)
  if (!inicioOcupacion) return null

  const mesAnteriorDate = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const mesLimite = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, '0')}`
  const mesInicioContrato = inicioOcupacion.slice(0, 7)
  const mesInicio =
    propiedad.deudaDesde && propiedad.deudaDesde > mesInicioContrato
      ? propiedad.deudaDesde
      : mesInicioContrato

  if (mesInicio > mesLimite) return null

  const meses = mesesEntre(mesInicio, mesLimite)
  const cobros = transacciones.filter(
    (t) => t.propiedadId === propiedad.id && t.tipo === 'ingreso' && t.categoria === 'Alquiler mensual',
  )
  let esperado = 0
  let hueco = 0
  for (const mes of meses) {
    const due = alquilerACobrar(propiedad, `${mes}-01`, hoy) ?? 0
    if (due <= 0) continue
    esperado += due
    const asignado = cobros
      .filter((t) => t.periodoInicio && mesDelCobroAlquiler(t) === mes)
      .reduce((s, t) => s + t.importe, 0)
    hueco += Math.max(0, due - asignado)
  }
  if (esperado <= 0) return null

  const libre = cobros
    .filter((t) => !t.periodoInicio && t.fecha.slice(0, 7) >= mesInicio)
    .reduce((s, t) => s + t.importe, 0)
  const importe = Math.round((hueco - libre) * 100) / 100
  if (importe <= 0) return null

  const alquilerActual = alquilerACobrar(propiedad, fechaISO(hoy), hoy)
  const divisor = alquilerActual && alquilerActual > 0 ? alquilerActual : importe
  return { importe, meses: importe / divisor }
}

// Días hasta el fin de contrato (negativo si ya pasó). Si ya pasó la fecha,
// el contrato sigue vigente por tácita reconducción (no vence solo, hay que
// rescindirlo) — "vencido" no significa que haya terminado, solo que ya
// tocaba renovarlo o rescindirlo formalmente. "alerta" a partir de 60 días
// antes, o si ya está en tácita reconducción.
export function contratoEstado(
  contratoFin: string | undefined,
  hoy: Date = new Date(),
): { dias: number; vencido: boolean; alerta: boolean } | null {
  if (!contratoFin) return null
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const dias = diasEntreFechas(hoyStr, contratoFin)
  return { dias, vencido: dias < 0, alerta: dias <= 60 }
}

// ─── Revisión anual de renta (cláusula de actualización, p.ej. IPC) ────────────
// La mayoría de contratos de alquiler llevan una cláusula de actualización
// anual de la renta en el aniversario de la firma — esto no calcula el
// importe actualizado (requeriría el IPC/IGC publicado ese mes, que la app
// no consulta), solo avisa de cuándo toca mirarlo. La fecha de referencia es
// siempre el aniversario del día/mes de `contratoInicio`, nunca la fecha en
// que se marcó como revisada — así que revisar tarde un año no adelanta ni
// atrasa el aniversario del año siguiente.
export function tocaRevisarRenta(
  propiedad: Pick<Propiedad, 'estado' | 'contratoInicio' | 'rentaRevisadaDesde'>,
  hoy: Date = new Date(),
): boolean {
  if (propiedad.estado !== 'alquilado' || !propiedad.contratoInicio) return false
  const inicio = new Date(`${propiedad.contratoInicio}T00:00:00`)
  const desde = propiedad.rentaRevisadaDesde ? new Date(propiedad.rentaRevisadaDesde) : inicio
  let aniversario = new Date(desde.getFullYear(), inicio.getMonth(), inicio.getDate())
  if (aniversario <= desde) aniversario = new Date(desde.getFullYear() + 1, inicio.getMonth(), inicio.getDate())
  return hoy >= aniversario
}

export type AvisoTipo = 'renta' | 'fianza' | 'contrato' | 'revision' | 'cee' | 'seguro' | 'ibi'

export interface AvisoPropiedad {
  tipo: AvisoTipo
  propiedadId: string
  nombre: string
  mensaje: string
}

export function avisosDePropiedad(
  propiedad: Propiedad,
  transacciones: Transaccion[],
  hoy: Date = new Date(),
): AvisoPropiedad[] {
  const avisos: AvisoPropiedad[] = []
  const base = { propiedadId: propiedad.id, nombre: propiedad.nombre }
  if (rentaPendiente(propiedad, transacciones, hoy)) {
    avisos.push({ ...base, tipo: 'renta', mensaje: 'Renta sin cobrar este mes' })
  }
  if (propiedad.estado === 'alquilado' && propiedad.fianzaImporte && !propiedad.fianzaDepositadaDesde) {
    avisos.push({ ...base, tipo: 'fianza', mensaje: 'Fianza pendiente de depositar (ICAVI)' })
  }
  const estadoC = contratoEstado(propiedad.contratoFin, hoy)
  if (propiedad.estado === 'alquilado' && estadoC?.alerta) {
    avisos.push({
      ...base,
      tipo: 'contrato',
      mensaje: estadoC.vencido
        ? 'Contrato en tácita reconducción'
        : `Contrato vence en ${estadoC.dias} días`,
    })
  }
  if (tocaRevisarRenta(propiedad, hoy)) {
    avisos.push({ ...base, tipo: 'revision', mensaje: 'Toca revisar la renta (IPC/IGC)' })
  }
  const cee = contratoEstado(propiedad.certificadoEnergeticoVencimiento, hoy)
  if (cee?.alerta) {
    avisos.push({
      ...base,
      tipo: 'cee',
      mensaje: cee.vencido ? 'Certificado energético caducado' : `CEE vence en ${cee.dias} días`,
    })
  }
  const seguro = contratoEstado(propiedad.seguroVencimiento, hoy)
  if (seguro?.alerta) {
    avisos.push({
      ...base,
      tipo: 'seguro',
      mensaje: seguro.vencido ? 'Seguro caducado' : `Seguro vence en ${seguro.dias} días`,
    })
  }
  if (propiedad.ibiMes && hoy.getMonth() + 1 === propiedad.ibiMes && hoy.getDate() <= 20) {
    avisos.push({ ...base, tipo: 'ibi', mensaje: 'Mes del IBI' })
  }
  return avisos
}

// ─── Reparto de suministros y tasas ────────────────────────────────────────────
// Para propiedades en alquiler: quién corre con el gasto de agua, luz,
// basuras e IBI — íntegro en el precio del alquiler, a cargo del inquilino,
// o una cantidad fija incluida en la renta (el resto de cada factura se
// repercute al inquilino).
export type SuministroModo = 'incluido' | 'no_incluido' | 'parcial'

export interface RepartoConcepto {
  modo: SuministroModo
  importeIncluido?: number // €/factura que cubre el propietario, solo si modo === 'parcial'
}

export type ConceptoReparto = 'agua' | 'luz' | 'basuras' | 'ibi'

export interface Reparto {
  agua?: RepartoConcepto
  luz?: RepartoConcepto
  basuras?: RepartoConcepto
  ibi?: RepartoConcepto
}

export const CONCEPTO_LABELS: Record<ConceptoReparto, string> = {
  agua: 'Agua',
  luz: 'Luz',
  basuras: 'Tasa de basuras',
  ibi: 'IBI',
}

// Categoría de gasto que corresponde a cada concepto repartible.
export const CONCEPTO_CATEGORIA: Record<ConceptoReparto, string> = {
  agua: 'Agua',
  luz: 'Electricidad',
  basuras: 'Tasa de basuras',
  ibi: 'IBI',
}

export interface RepartoCalculado {
  concepto: ConceptoReparto
  modo: SuministroModo
  propietario: number
  inquilino: number
}

// Dado un gasto (categoría + importe), calcula cuánto corresponde al
// propietario y cuánto es repercutible al inquilino, según la
// configuración de reparto de la propiedad. Devuelve null si la
// categoría no es una de las repartibles o no hay configuración.
export function calcularReparto(
  categoria: string,
  importe: number,
  reparto: Reparto | undefined,
): RepartoCalculado | null {
  if (!reparto) return null
  const concepto = (Object.keys(CONCEPTO_CATEGORIA) as ConceptoReparto[]).find(
    (c) => CONCEPTO_CATEGORIA[c] === categoria,
  )
  if (!concepto) return null
  const config = reparto[concepto]
  if (!config) return null

  if (config.modo === 'incluido') {
    return { concepto, modo: 'incluido', propietario: importe, inquilino: 0 }
  }
  if (config.modo === 'no_incluido') {
    return { concepto, modo: 'no_incluido', propietario: 0, inquilino: importe }
  }
  const propietario = Math.min(config.importeIncluido ?? 0, importe)
  return {
    concepto,
    modo: 'parcial',
    propietario,
    inquilino: importe - propietario,
  }
}

// ─── Renta de locales: IGIC + retención IRPF ───────────────────────────────────
// Para locales de negocio en Canarias: la renta bruta pactada (base
// imponible) lleva IGIC repercutido al inquilino (se suma) y retención de
// IRPF que el inquilino ingresa directamente en Hacienda (se resta) — lo que
// Jose recibe de verdad en el banco es la renta neta resultante.
export const IGIC_LOCAL_PCT = 7
export const IRPF_LOCAL_PCT = 19

export interface DesgloseRentaLocal {
  base: number
  igic: number
  irpf: number
  neta: number
}

export function calcularRentaLocal(rentaBruta: number): DesgloseRentaLocal {
  const igic = rentaBruta * (IGIC_LOCAL_PCT / 100)
  const irpf = rentaBruta * (IRPF_LOCAL_PCT / 100)
  return { base: rentaBruta, igic, irpf, neta: rentaBruta + igic - irpf }
}

// Inversa: reconstruye la base imponible a partir del importe neto ya
// guardado en una transacción (lo que se registra en la app) — para el
// Modelo 420, que necesita la base, no la neta.
export function baseDesdeRentaNeta(rentaNeta: number): number {
  return rentaNeta / (1 + IGIC_LOCAL_PCT / 100 - IRPF_LOCAL_PCT / 100)
}

export interface ResumenPropiedad {
  propiedad: Propiedad
  ingresosMes: number
  gastosMes: number
  ingresosAnio: number
  gastosAnio: number
  totalTransacciones: number
}

export const CATEGORIAS_GASTO = [
  'Electricidad',
  'Agua',
  'Gas',
  'Telefonía / Internet',
  'IBI',
  'Tasa de basuras',
  'IRPF / Retención',
  'Otros impuestos',
  'Comunidad de propietarios',
  'Seguro hogar',
  'Seguro impago',
  'Mantenimiento',
  'Reparaciones',
  'Hipoteca / Financiación',
  'Intereses hipoteca',
  'Honorarios / Gestión',
  'Mobiliario / Equipamiento',
  'Obras / Reforma',
  'Otros gastos',
] as const

// La cuota de hipoteca (capital + intereses) no es gasto deducible en IRPF
// de alquiler: solo los intereses. Sigue contando en el cashflow del Dashboard.
export const CATEGORIAS_GASTO_NO_DEDUCIBLE_IRPF: readonly string[] = ['Hipoteca / Financiación']

export const CATEGORIAS_INGRESO = [
  'Alquiler mensual',
  'Electricidad (repercutida)',
  'Agua (repercutida)',
  'Fianza recibida',
  'Devolución de fianza',
  'Otros ingresos',
] as const

export const TIPO_LABELS: Record<PropiedadTipo, string> = {
  piso: 'Piso',
  casa: 'Casa',
  local: 'Local',
  garaje: 'Garaje',
  otro: 'Otro',
}

export const ESTADO_LABELS: Record<PropiedadEstado, string> = {
  alquilado: 'Alquilado',
  vacio: 'Vacío',
  reforma: 'En reforma',
  venta: 'En venta',
  uso_propio: 'Uso propio',
  vivienda_habitual: 'Vivienda habitual',
}

// ─── Estimador de la Renta: cuánto guardar de los alquileres ───────────────────
// Aproximación, no un cálculo oficial: usa una reducción fija por vivienda
// habitual del inquilino y aplica los tramos progresivos del IRPF sobre la
// suma de todos los ingresos (rendimiento inmobiliario + otros ingresos).
// Los tramos son una escala combinada aproximada (estatal + autonómica
// genérica) — pueden no coincidir exactamente con los de tu comunidad
// autónoma o el año fiscal en curso.

export interface TramoIRPF {
  hasta: number // límite superior del tramo — Infinity en el último
  tipo: number // % marginal aplicable a la parte de base dentro de este tramo
}

export const TRAMOS_IRPF_APROX: TramoIRPF[] = [
  { hasta: 12450, tipo: 19 },
  { hasta: 20200, tipo: 24 },
  { hasta: 35200, tipo: 30 },
  { hasta: 60000, tipo: 37 },
  { hasta: 300000, tipo: 45 },
  { hasta: Infinity, tipo: 47 },
]

// Cuota íntegra progresiva: cada tramo de la base tributa a su propio tipo,
// no toda la base al tipo del tramo más alto.
export function cuotaIRPF(baseImponible: number, tramos: TramoIRPF[] = TRAMOS_IRPF_APROX): number {
  let cuota = 0
  let limiteAnterior = 0
  for (const tramo of tramos) {
    if (baseImponible <= limiteAnterior) break
    const baseTramo = Math.min(baseImponible, tramo.hasta) - limiteAnterior
    cuota += baseTramo * (tramo.tipo / 100)
    limiteAnterior = tramo.hasta
  }
  return cuota
}

// Tipo marginal (el tramo más alto que se alcanza) para una base dada.
export function tipoMarginalIRPF(baseImponible: number, tramos: TramoIRPF[] = TRAMOS_IRPF_APROX): number {
  for (const tramo of tramos) {
    if (baseImponible <= tramo.hasta) return tramo.tipo
  }
  return tramos[tramos.length - 1]?.tipo ?? 0
}

export interface IngresoExterno {
  id: string
  nombre: string
  importeAnual: number
  porcentajeRetencion: number // % de IRPF que ya te retienen en origen (nómina, etc.) — se usa en estimarAhorroRenta() para saber cuánto de la cuota total ya está cubierto
  creadoEn: string
}

// Categorías de ingreso que cuentan como rendimiento a efectos de IRPF —
// una fianza no es un ingreso, es un depósito, así que se excluye.
export const CATEGORIAS_RENDIMIENTO: readonly string[] = [
  'Alquiler mensual',
  'Electricidad (repercutida)',
  'Agua (repercutida)',
  'Otros ingresos',
]

export function esGastoDeducibleIRPF(categoria: string): boolean {
  return !CATEGORIAS_GASTO_NO_DEDUCIBLE_IRPF.includes(categoria)
}

export function ingresoIrpfDeTx(
  t: Pick<Transaccion, 'tipo' | 'categoria' | 'importe' | 'periodoInicio' | 'periodoFin' | 'fecha' | 'soloMio'>,
  propiedad: Pick<Propiedad, 'tipo' | 'porcentajePropiedad'>,
  desde: string,
  hasta: string,
): number {
  if (t.tipo !== 'ingreso' || !CATEGORIAS_RENDIMIENTO.includes(t.categoria)) return 0
  const bruto = miParte(importeEnRango(t, desde, hasta), propiedad, t.soloMio)
  if (propiedad.tipo === 'local' && t.categoria === 'Alquiler mensual') return baseDesdeRentaNeta(bruto)
  return bruto
}

export function gastoIrpfDeTx(
  t: Pick<Transaccion, 'tipo' | 'categoria' | 'importe' | 'periodoInicio' | 'periodoFin' | 'fecha' | 'soloMio'>,
  propiedad: Pick<Propiedad, 'porcentajePropiedad'>,
  desde: string,
  hasta: string,
): number {
  if (t.tipo !== 'gasto' || !esGastoDeducibleIRPF(t.categoria)) return 0
  return miParte(importeEnRango(t, desde, hasta), propiedad, t.soloMio)
}

export function rendimientoIrpfPropiedad(
  propiedad: Propiedad,
  transacciones: Transaccion[],
  anio: string,
  reduccionViviendaPct: number,
): EstimacionPropiedad {
  const [desde, hasta] = rangoAnio(anio)
  const txs = transacciones.filter((t) => t.propiedadId === propiedad.id)
  const ingresos = txs.reduce((s, t) => s + ingresoIrpfDeTx(t, propiedad, desde, hasta), 0)
  const gastos = txs.reduce((s, t) => s + gastoIrpfDeTx(t, propiedad, desde, hasta), 0)
  const amortizacion = amortizacionAnual(propiedad, anio)
  const rendimientoNeto = ingresos - gastos - amortizacion
  const reducible = propiedad.tipo === 'piso' || propiedad.tipo === 'casa'
  const rendimientoComputable =
    reducible && rendimientoNeto > 0
      ? rendimientoNeto * (1 - reduccionViviendaPct / 100)
      : rendimientoNeto
  return { propiedad, ingresos, gastos, amortizacion, rendimientoNeto, reducible, rendimientoComputable }
}

export interface EstimacionPropiedad {
  propiedad: Propiedad
  ingresos: number
  gastos: number
  amortizacion: number
  rendimientoNeto: number
  reducible: boolean
  rendimientoComputable: number
}

export interface EstimacionRenta {
  porPropiedad: EstimacionPropiedad[]
  amortizacionTotal: number
  rendimientoInmobiliarioTotal: number
  otrosIngresosTotal: number
  baseImponibleTotal: number
  tipoMarginalPct: number
  cuotaTotal: number
  irpfEstimadoAlquileres: number // informativo: cuánto de la cuota total generan solo los alquileres
  retencionOtrosIngresos: number
  retencionLocales: number
  totalRetenido: number
  aGuardar: number
}

// Estima el IRPF de TODA la declaración (nómina/otros ingresos + alquileres
// juntos), no solo la parte que generan los alquileres — porque una
// retención de nómina insuficiente para tu tramo real también hace falta
// cubrirla, y antes esta función la ignoraba por completo. "A guardar" es
// la cuota total sobre todos los ingresos menos TODO lo que ya te han
// retenido (nómina/otros ingresos + locales), con los datos que haya en la
// app en el momento de calcularlo — no proyecta ni extrapola el resto del
// año, así que se va afinando según se registran más movimientos.
export function estimarAhorroRenta(
  propiedades: Propiedad[],
  transacciones: Transaccion[],
  ingresosExternos: IngresoExterno[],
  anio: string,
  reduccionViviendaPct: number,
): EstimacionRenta {
  const [desdeAnio, hastaAnio] = rangoAnio(anio)
  const porPropiedad: EstimacionPropiedad[] = propiedades.map((p) =>
    rendimientoIrpfPropiedad(p, transacciones, anio, reduccionViviendaPct),
  )

  const amortizacionTotal = porPropiedad.reduce((s, f) => s + f.amortizacion, 0)
  const rendimientoInmobiliarioTotal = porPropiedad.reduce((s, f) => s + f.rendimientoComputable, 0)

  const retencionLocales = propiedades
    .filter((p) => p.tipo === 'local')
    .reduce((sTotal, p) => {
      const netaTotal = transacciones
        .filter((t) => t.propiedadId === p.id && t.tipo === 'ingreso' && t.categoria === 'Alquiler mensual')
        .reduce((s, t) => s + miParte(importeEnRango(t, desdeAnio, hastaAnio), p, t.soloMio), 0)
      return sTotal + calcularRentaLocal(baseDesdeRentaNeta(netaTotal)).irpf
    }, 0)

  const otrosIngresosTotal = ingresosExternos.reduce((s, i) => s + i.importeAnual, 0)
  const retencionOtrosIngresos = ingresosExternos.reduce(
    (s, i) => s + i.importeAnual * (i.porcentajeRetencion / 100),
    0,
  )

  // El alquiler se suma "encima" de los demás ingresos: la base general es
  // progresiva y única. "irpfEstimadoAlquileres" es solo informativo (qué
  // parte de la cuota total generan los alquileres); "A guardar" ya no se
  // calcula a partir de esa parte marginal, sino de la cuota total.
  const rendimientoPositivo = Math.max(0, rendimientoInmobiliarioTotal)
  const baseImponibleTotal = otrosIngresosTotal + rendimientoPositivo
  const cuotaSoloOtrosIngresos = cuotaIRPF(otrosIngresosTotal)
  const cuotaTotal = cuotaIRPF(baseImponibleTotal)
  const tipoMarginalPct = tipoMarginalIRPF(baseImponibleTotal)

  const irpfEstimadoAlquileres = Math.max(0, cuotaTotal - cuotaSoloOtrosIngresos)
  const totalRetenido = retencionOtrosIngresos + retencionLocales
  const aGuardar = Math.max(0, cuotaTotal - totalRetenido)

  return {
    porPropiedad,
    amortizacionTotal,
    rendimientoInmobiliarioTotal,
    otrosIngresosTotal,
    baseImponibleTotal,
    tipoMarginalPct,
    cuotaTotal,
    irpfEstimadoAlquileres,
    retencionOtrosIngresos,
    retencionLocales,
    totalRetenido,
    aGuardar,
  }
}

export const ESTADO_BADGE_VARIANT: Record<
  PropiedadEstado,
  'success' | 'warning' | 'error' | 'outline' | 'default'
> = {
  alquilado: 'success',
  vacio: 'warning',
  reforma: 'outline',
  venta: 'error',
  uso_propio: 'default',
  vivienda_habitual: 'default',
}

// ─── Tareas por propiedad ───────────────────────────────────────────────────
export type TareaPrioridad = 'baja' | 'media' | 'alta'
export type TareaEstado = 'pendiente' | 'hecha'

export interface Tarea {
  id: string
  propiedadId: string
  titulo: string
  descripcion?: string
  prioridad: TareaPrioridad
  fechaLimite?: string // YYYY-MM-DD
  estado: TareaEstado
  creadoEn: string
}

export const PRIORIDAD_LABELS: Record<TareaPrioridad, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

export const PRIORIDAD_BADGE_VARIANT: Record<TareaPrioridad, 'default' | 'warning' | 'error'> = {
  baja: 'default',
  media: 'warning',
  alta: 'error',
}

const PRIORIDAD_ORDEN: Record<TareaPrioridad, number> = { alta: 0, media: 1, baja: 2 }

// Una tarea está vencida si sigue pendiente, tiene fecha límite, y esa
// fecha ya pasó.
export function tareaVencida(tarea: Pick<Tarea, 'fechaLimite' | 'estado'>, hoy: Date = new Date()): boolean {
  if (tarea.estado === 'hecha' || !tarea.fechaLimite) return false
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  return tarea.fechaLimite < hoyStr
}

// Pendientes primero (por prioridad y luego por la fecha límite más
// próxima; sin fecha va al final de su prioridad), hechas al final.
export function ordenarTareas(tareas: Tarea[]): Tarea[] {
  return [...tareas].sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'pendiente' ? -1 : 1
    if (a.prioridad !== b.prioridad) return PRIORIDAD_ORDEN[a.prioridad] - PRIORIDAD_ORDEN[b.prioridad]
    if (a.fechaLimite && b.fechaLimite) return a.fechaLimite.localeCompare(b.fechaLimite)
    if (a.fechaLimite) return -1
    if (b.fechaLimite) return 1
    return a.creadoEn.localeCompare(b.creadoEn)
  })
}

// ─── Facturas/recibos de alquiler ───────────────────────────────────────────
// Identidad del arrendador (Jose) para el encabezado "Emisor" de cada
// factura/recibo — se guarda una vez y se reutiliza en todas.
export interface DatosFacturacion {
  nombre: string
  nif: string
  direccion: string
}

export function datosFacturacionCompletos(d: DatosFacturacion | null): d is DatosFacturacion {
  return !!d && !!d.nombre.trim() && !!d.nif.trim() && !!d.direccion.trim()
}

// Prefijo distinto para diferenciar dos series de numeración: "F" para
// facturas de verdad (locales, sujetos a IGIC — Jose actúa como negocio) y
// "R" para recibos de alquiler de vivienda (exenta de IVA, no requiere
// factura formal). Cada serie lleva su propia numeración correlativa, para
// no dejar huecos artificiales en ninguna de las dos.
export type TipoDocumentoAlquiler = 'F' | 'R'

// Siguiente número correlativo de una serie para un año: mira el máximo ya
// asignado (persistido en Transaccion.numeroFactura, inmutable una vez
// puesto) y le suma 1 — nunca reutiliza ni renumera huecos de documentos
// borrados, como corresponde a una numeración correlativa real.
export function siguienteNumeroFactura(
  transacciones: Pick<Transaccion, 'numeroFactura'>[],
  prefijo: TipoDocumentoAlquiler,
  anio: string,
): string {
  const patron = new RegExp(`^${prefijo}-${anio}-(\\d+)$`)
  const usados = transacciones
    .map((t) => t.numeroFactura)
    .map((n) => (n ? patron.exec(n)?.[1] : undefined))
    .filter((n): n is string => !!n)
    .map(Number)
  const siguiente = (usados.length > 0 ? Math.max(...usados) : 0) + 1
  return `${prefijo}-${anio}-${String(siguiente).padStart(3, '0')}`
}

// Local -> factura de verdad (sujeta a IGIC); resto -> recibo de alquiler
// de vivienda (exento de IVA).
export function tipoDocumentoAlquiler(propiedad: Pick<Propiedad, 'tipo'>): TipoDocumentoAlquiler {
  return propiedad.tipo === 'local' ? 'F' : 'R'
}

export function esDocumentoAlquiler(
  tx: Pick<Transaccion, 'tipo' | 'categoria'>,
  _propiedad?: Pick<Propiedad, 'tipo'> | null,
): boolean {
  return tx.tipo === 'ingreso' && tx.categoria === 'Alquiler mensual'
}

// Inicio del periodo "al día" vigente: el día 15 más reciente (del mes
// actual si ya se ha pasado de ese día, si no del mes anterior). Marcar
// "al día" solo cuenta para el periodo en curso — al llegar el siguiente
// día 15 el periodo cambia y hay que volver a marcarla, sin necesidad de
// ningún proceso en segundo plano que "reinicie" nada.
export function inicioPeriodoAlDia(ahora: Date = new Date()): Date {
  const anio = ahora.getFullYear()
  const mes = ahora.getMonth()
  return ahora.getDate() >= 15 ? new Date(anio, mes, 15) : new Date(anio, mes - 1, 15)
}

export function estaAlDia(propiedad: Pick<Propiedad, 'alDiaDesde'>, ahora: Date = new Date()): boolean {
  if (!propiedad.alDiaDesde) return false
  return new Date(propiedad.alDiaDesde) >= inicioPeriodoAlDia(ahora)
}
