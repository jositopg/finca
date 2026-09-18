import { describe, expect, it } from 'vitest'
import {
  alquilerACobrar,
  alquilerVigente,
  mesAlquilerMasAntiguoPendiente,
  rentaDelMesIncompleta,
  amortizacionAnual,
  aplicarCambioCondiciones,
  baseDesdeRentaNeta,
  sustituirPorContratoNuevo,
  calcularReparto,
  calcularRentaLocal,
  contratoEstado,
  corregirTramoVigente,
  cuotaIRPF,
  datosFacturacionCompletos,
  deudaInquilino,
  esDeAlquiler,
  estaAlDia,
  estimarAhorroRenta,
  generarGastosPendientes,
  importeEnRango,
  inicioPeriodoAlDia,
  miParte,
  ordenarTareas,
  parseFilasImportadas,
  parseImporte,
  periodoTramo,
  quitarTramoContrato,
  rangoAnio,
  rangoMes,
  rentaPendiente,
  siguienteNumeroFactura,
  tareaVencida,
  tipoDocumentoAlquiler,
  tipoMarginalIRPF,
  tocaRevisarRenta,
  tramoEnFecha,
  tramosEfectivos,
  type IngresoExterno,
  type Propiedad,
  type Tarea,
  type Transaccion,
} from './index'

function propiedad(overrides: Partial<Propiedad> = {}): Propiedad {
  return {
    id: 'p1',
    nombre: 'Piso test',
    direccion: '',
    tipo: 'piso',
    estado: 'alquilado',
    folderId: '',
    creadoEn: '2026-01-01',
    ...overrides,
  }
}

function transaccion(overrides: Partial<Transaccion> = {}): Transaccion {
  return {
    id: crypto.randomUUID(),
    propiedadId: 'p1',
    fecha: '2026-01-15',
    tipo: 'ingreso',
    importe: 100,
    categoria: 'Alquiler mensual',
    descripcion: '',
    archivos: [],
    creadoEn: '2026-01-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('parseImporte', () => {
  it('interpreta el punto como separador de miles cuando no hay coma y hay 3 dígitos', () => {
    expect(parseImporte('1.200')).toBe(1200)
    expect(parseImporte('1.200.000')).toBe(1200000)
  })

  it('interpreta el punto como decimal cuando no son 3 dígitos exactos', () => {
    expect(parseImporte('12.5')).toBe(12.5)
    expect(parseImporte('1200.50')).toBe(1200.5)
  })

  it('con coma, el punto es siempre separador de miles y la coma el decimal', () => {
    expect(parseImporte('1.200,50')).toBe(1200.5)
    expect(parseImporte('1200,50')).toBe(1200.5)
    expect(parseImporte('1200,5')).toBe(1200.5)
  })

  it('sin separadores, devuelve el número tal cual', () => {
    expect(parseImporte('800')).toBe(800)
  })

  it('devuelve NaN para texto no numérico o vacío, en vez de deducir 0', () => {
    expect(Number.isNaN(parseImporte('abc'))).toBe(true)
    expect(Number.isNaN(parseImporte(''))).toBe(true)
    expect(Number.isNaN(parseImporte('  '))).toBe(true)
  })

  it('ignora el símbolo del euro copiado de un documento (catastro, tasación...)', () => {
    expect(parseImporte('128.061,67 €')).toBe(128061.67)
    expect(parseImporte('128.061,67€')).toBe(128061.67)
    expect(parseImporte('800 €')).toBe(800)
  })
})

describe('miParte', () => {
  it('aplica el porcentaje de propiedad', () => {
    expect(miParte(1000, { porcentajePropiedad: 50 })).toBe(500)
  })

  it('sin porcentaje definido, asume el 100%', () => {
    expect(miParte(1000, {})).toBe(1000)
  })

  it('con soloMio, ignora el porcentaje de la propiedad y cuenta el 100%', () => {
    expect(miParte(1000, { porcentajePropiedad: 50 }, true)).toBe(1000)
  })

  it('soloMio en false o sin definir no cambia el comportamiento normal', () => {
    expect(miParte(1000, { porcentajePropiedad: 50 }, false)).toBe(500)
    expect(miParte(1000, { porcentajePropiedad: 50 }, undefined)).toBe(500)
  })
})

describe('importeEnRango', () => {
  it('sin periodo facturado, cuenta el importe entero si la fecha de pago cae en el rango', () => {
    const tx = transaccion({ fecha: '2026-03-15', importe: 100 })
    expect(importeEnRango(tx, ...rangoMes('2026-03'))).toBe(100)
    expect(importeEnRango(tx, ...rangoMes('2026-04'))).toBe(0)
  })

  it('con periodo facturado dentro de un único mes, cuenta el importe entero en ese mes', () => {
    const tx = transaccion({
      fecha: '2026-04-10', // pagado el mes siguiente
      importe: 90,
      periodoInicio: '2026-03-01',
      periodoFin: '2026-03-31',
    })
    expect(importeEnRango(tx, ...rangoMes('2026-03'))).toBe(90)
    expect(importeEnRango(tx, ...rangoMes('2026-04'))).toBe(0)
  })

  it('con periodo que cruza dos meses, reparte el importe proporcionalmente por días', () => {
    // Periodo de 30 días: 20 en enero, 10 en febrero
    const tx = transaccion({
      fecha: '2026-02-20',
      importe: 300,
      periodoInicio: '2026-01-12',
      periodoFin: '2026-02-10',
    })
    const enEnero = importeEnRango(tx, ...rangoMes('2026-01'))
    const enFebrero = importeEnRango(tx, ...rangoMes('2026-02'))
    expect(enEnero).toBeCloseTo(200, 2) // 20/30 * 300
    expect(enFebrero).toBeCloseTo(100, 2) // 10/30 * 300
    expect(enEnero + enFebrero).toBeCloseTo(300, 2)
  })

  it('con periodo que cruza el año, reparte fiscalmente entre los dos años', () => {
    // Periodo de 62 días: 17 en 2025 (15-31 dic), 45 en 2026 (1 ene - 14 feb)
    const tx = transaccion({
      fecha: '2026-03-01',
      importe: 620,
      periodoInicio: '2025-12-15',
      periodoFin: '2026-02-14',
    })
    const en2025 = importeEnRango(tx, ...rangoAnio('2025'))
    const en2026 = importeEnRango(tx, ...rangoAnio('2026'))
    expect(en2025).toBeCloseTo(170, 0) // 17/62 * 620
    expect(en2026).toBeCloseTo(450, 0) // 45/62 * 620
    expect(en2025 + en2026).toBeCloseTo(620, 2)
  })

  it('periodo de un solo día cuenta el importe entero ese día', () => {
    const tx = transaccion({
      fecha: '2026-05-01',
      importe: 50,
      periodoInicio: '2026-01-31',
      periodoFin: '2026-01-31',
    })
    expect(importeEnRango(tx, ...rangoMes('2026-01'))).toBe(50)
  })
})

describe('esDeAlquiler', () => {
  it('es true para estados de ciclo de alquiler', () => {
    expect(esDeAlquiler({ estado: 'alquilado' })).toBe(true)
    expect(esDeAlquiler({ estado: 'vacio' })).toBe(true)
    expect(esDeAlquiler({ estado: 'reforma' })).toBe(true)
    expect(esDeAlquiler({ estado: 'venta' })).toBe(true)
  })

  it('es false para uso propio y vivienda habitual', () => {
    expect(esDeAlquiler({ estado: 'uso_propio' })).toBe(false)
    expect(esDeAlquiler({ estado: 'vivienda_habitual' })).toBe(false)
  })
})

describe('calcularReparto', () => {
  it('devuelve null si no hay configuración de reparto', () => {
    expect(calcularReparto('Agua', 50, undefined)).toBeNull()
  })

  it('modo incluido: todo el gasto es del propietario', () => {
    const r = calcularReparto('Agua', 50, { agua: { modo: 'incluido' } })
    expect(r).toEqual({ concepto: 'agua', modo: 'incluido', propietario: 50, inquilino: 0 })
  })

  it('modo no_incluido: todo el gasto es del inquilino', () => {
    const r = calcularReparto('Electricidad', 80, { luz: { modo: 'no_incluido' } })
    expect(r).toEqual({ concepto: 'luz', modo: 'no_incluido', propietario: 0, inquilino: 80 })
  })

  it('modo parcial: reparte según el importe fijo incluido, sin superar el total', () => {
    const r = calcularReparto('Agua', 50, { agua: { modo: 'parcial', importeIncluido: 30 } })
    expect(r).toEqual({ concepto: 'agua', modo: 'parcial', propietario: 30, inquilino: 20 })
  })

  it('modo parcial con importe incluido mayor que la factura no da inquilino negativo', () => {
    const r = calcularReparto('Agua', 20, { agua: { modo: 'parcial', importeIncluido: 30 } })
    expect(r).toEqual({ concepto: 'agua', modo: 'parcial', propietario: 20, inquilino: 0 })
  })
})

describe('calcularRentaLocal / baseDesdeRentaNeta', () => {
  it('calcula el desglose IGIC/IRPF de una renta bruta', () => {
    const d = calcularRentaLocal(1000)
    expect(d.base).toBe(1000)
    expect(d.igic).toBe(70)
    expect(d.irpf).toBe(190)
    expect(d.neta).toBe(880)
  })

  it('baseDesdeRentaNeta es la inversa de calcularRentaLocal', () => {
    const base = 1000
    const neta = calcularRentaLocal(base).neta
    expect(baseDesdeRentaNeta(neta)).toBeCloseTo(base, 6)
  })
})

describe('cuotaIRPF / tipoMarginalIRPF', () => {
  it('no tributa por debajo del primer tramo', () => {
    expect(cuotaIRPF(0)).toBe(0)
  })

  it('aplica cada tramo de forma progresiva, no todo al tipo marginal', () => {
    // 12450 al 19% + 2000 al 24%
    const cuota = cuotaIRPF(14450)
    expect(cuota).toBeCloseTo(12450 * 0.19 + 2000 * 0.24, 6)
  })

  it('tipoMarginalIRPF devuelve el tramo alcanzado, no un promedio', () => {
    expect(tipoMarginalIRPF(5000)).toBe(19)
    expect(tipoMarginalIRPF(14450)).toBe(24)
  })
})

describe('estimarAhorroRenta', () => {
  function ingresoExterno(overrides: Partial<IngresoExterno> = {}): IngresoExterno {
    return {
      id: 'i1',
      nombre: 'Nómina',
      importeAnual: 40000,
      porcentajeRetencion: 22,
      creadoEn: '2026-01-01',
      ...overrides,
    }
  }

  it('"a guardar" es la cuota TOTAL menos TODA la retención, no solo la parte de los alquileres', () => {
    const p = propiedad({
      id: 'p1',
      tipo: 'piso',
      porcentajePropiedad: 100,
      gastosRecurrentes: undefined,
    })
    // 10.000€ de rendimiento inmobiliario computable (sin reducción, para
    // simplificar el ejemplo): un ingreso de "Otros ingresos" en enero.
    const txs: Transaccion[] = [
      {
        id: 't1',
        propiedadId: 'p1',
        fecha: '2026-01-15',
        tipo: 'ingreso',
        importe: 10000,
        categoria: 'Otros ingresos',
        descripcion: '',
        archivos: [],
        creadoEn: '2026-01-15T00:00:00.000Z',
      },
    ]
    // Nómina de 40.000€/año con un 22% de retención — pero su tipo real
    // (tramos progresivos) es más alto, así que esa retención se queda
    // corta incluso sin contar los alquileres.
    const ingresosExternos = [ingresoExterno({ importeAnual: 40000, porcentajeRetencion: 22 })]

    const e = estimarAhorroRenta([p], txs, ingresosExternos, '2026', 0)

    const cuotaTotalEsperada = cuotaIRPF(50000) // 40.000 nómina + 10.000 alquiler
    const cuotaSoloNominaEsperada = cuotaIRPF(40000)
    const retencionNominaEsperada = 40000 * 0.22 // 8.800€

    expect(e.rendimientoInmobiliarioTotal).toBe(10000)
    expect(e.cuotaTotal).toBeCloseTo(cuotaTotalEsperada, 6)
    expect(e.retencionOtrosIngresos).toBeCloseTo(retencionNominaEsperada, 6)
    expect(e.retencionLocales).toBe(0)
    expect(e.totalRetenido).toBeCloseTo(retencionNominaEsperada, 6)
    // El shortfall de la nómina (su cuota real supera a la retención del
    // 22%) tiene que reflejarse en "a guardar", no solo lo que generan los
    // alquileres por su cuenta.
    expect(e.aGuardar).toBeCloseTo(cuotaTotalEsperada - retencionNominaEsperada, 6)
    expect(e.aGuardar).toBeGreaterThan(cuotaTotalEsperada - cuotaSoloNominaEsperada)
  })

  it('con retención suficiente en todos los ingresos, "a guardar" es 0', () => {
    const ingresosExternos = [ingresoExterno({ importeAnual: 10000, porcentajeRetencion: 99 })]
    const e = estimarAhorroRenta([], [], ingresosExternos, '2026', 0)
    expect(e.aGuardar).toBe(0)
  })

  it('la amortización deducible (3% del valor de construcción) reduce el rendimiento inmobiliario', () => {
    const p = propiedad({ id: 'p1', tipo: 'piso', valorConstruccion: 50000, porcentajePropiedad: 100 })
    const txs: Transaccion[] = [
      transaccion({ propiedadId: 'p1', tipo: 'ingreso', categoria: 'Alquiler mensual', importe: 10000 }),
    ]
    const sinAmortizar = estimarAhorroRenta(
      [propiedad({ id: 'p1', tipo: 'piso', porcentajePropiedad: 100 })],
      txs,
      [],
      '2026',
      0,
    )
    const conAmortizacion = estimarAhorroRenta([p], txs, [], '2026', 0)
    expect(conAmortizacion.amortizacionTotal).toBeCloseTo(1500, 6) // 3% de 50.000
    expect(conAmortizacion.rendimientoInmobiliarioTotal).toBeCloseTo(
      sinAmortizar.rendimientoInmobiliarioTotal - 1500,
      6,
    )
  })
})

describe('amortizacionAnual', () => {
  it('es el 3% del valor de construcción, escalado por el % de propiedad', () => {
    expect(amortizacionAnual(propiedad({ valorConstruccion: 50000, porcentajePropiedad: 100 }))).toBeCloseTo(
      1500,
      6,
    )
    expect(amortizacionAnual(propiedad({ valorConstruccion: 50000, porcentajePropiedad: 50 }))).toBeCloseTo(
      750,
      6,
    )
  })

  it('sin valor de construcción, devuelve 0', () => {
    expect(amortizacionAnual(propiedad({}))).toBe(0)
  })
})

describe('contratoEstado', () => {
  it('sin fecha de fin, devuelve null', () => {
    expect(contratoEstado(undefined)).toBeNull()
  })

  it('alerta a partir de 60 días antes del fin', () => {
    const hoy = new Date('2026-01-01T00:00:00')
    expect(contratoEstado('2026-03-02', hoy)?.dias).toBe(60)
    expect(contratoEstado('2026-03-02', hoy)?.alerta).toBe(true) // exactamente 60 días
    expect(contratoEstado('2026-03-03', hoy)?.alerta).toBe(false) // 61 días
    expect(contratoEstado('2026-06-01', hoy)?.alerta).toBe(false)
  })

  it('vencido pero no null cuando ya pasó la fecha (tácita reconducción)', () => {
    const hoy = new Date('2026-06-01T00:00:00')
    const r = contratoEstado('2026-01-01', hoy)
    expect(r?.vencido).toBe(true)
    expect(r?.alerta).toBe(true)
    expect(r?.dias).toBeLessThan(0)
  })
})

describe('tocaRevisarRenta', () => {
  it('no toca si no está alquilado o no tiene fecha de inicio', () => {
    expect(tocaRevisarRenta(propiedad({ estado: 'vacio', contratoInicio: '2020-01-01' }))).toBe(false)
    expect(tocaRevisarRenta(propiedad({ estado: 'alquilado' }))).toBe(false)
  })

  it('no toca antes de cumplirse el primer aniversario del contrato', () => {
    const p = propiedad({ estado: 'alquilado', contratoInicio: '2026-01-01' })
    expect(tocaRevisarRenta(p, new Date('2026-06-01T00:00:00'))).toBe(false)
    expect(tocaRevisarRenta(p, new Date('2026-12-31T00:00:00'))).toBe(false)
  })

  it('toca en cuanto se cumple el aniversario, nunca antes marcada', () => {
    const p = propiedad({ estado: 'alquilado', contratoInicio: '2026-01-01' })
    expect(tocaRevisarRenta(p, new Date('2027-01-01T00:00:00'))).toBe(true)
    expect(tocaRevisarRenta(p, new Date('2027-06-01T00:00:00'))).toBe(true)
  })

  it('tras marcarla revisada, no vuelve a tocar hasta el siguiente aniversario del contrato', () => {
    const p = propiedad({
      estado: 'alquilado',
      contratoInicio: '2026-01-01',
      rentaRevisadaDesde: '2027-03-15T00:00:00',
    })
    expect(tocaRevisarRenta(p, new Date('2027-12-01T00:00:00'))).toBe(false)
    expect(tocaRevisarRenta(p, new Date('2028-01-01T00:00:00'))).toBe(true)
  })
})

describe('parseFilasImportadas', () => {
  it('parsea líneas separadas por tabulador (pegado desde Excel/Sheets)', () => {
    const filas = parseFilasImportadas('2026-01-05\tingreso\tAlquiler mensual\t800\tEnero')
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      ok: true,
      fecha: '2026-01-05',
      tipo: 'ingreso',
      categoria: 'Alquiler mensual',
      importe: 800,
      descripcion: 'Enero',
    })
  })

  it('parsea líneas separadas por punto y coma (CSV), sin descripción', () => {
    const filas = parseFilasImportadas('2026-01-10;gasto;Comunidad de propietarios;45,50')
    expect(filas[0]).toMatchObject({
      ok: true,
      fecha: '2026-01-10',
      tipo: 'gasto',
      categoria: 'Comunidad de propietarios',
      importe: 45.5,
      descripcion: '',
    })
  })

  it('convierte fechas DD/MM/AAAA a AAAA-MM-DD', () => {
    const filas = parseFilasImportadas('05/01/2026;ingreso;Alquiler mensual;800')
    expect(filas[0]).toMatchObject({ ok: true, fecha: '2026-01-05' })
  })

  it('marca cada línea con error por separado, sin bloquear las demás', () => {
    const texto = [
      '2026-01-05;ingreso;Alquiler mensual;800',
      'fecha-mala;ingreso;Alquiler mensual;800',
      '2026-01-05;otro;Alquiler mensual;800',
      '2026-01-05;ingreso;;800',
      '2026-01-05;ingreso;Alquiler mensual;abc',
    ].join('\n')
    const filas = parseFilasImportadas(texto)
    expect(filas).toHaveLength(5)
    expect(filas[0].ok).toBe(true)
    expect(filas[1]).toMatchObject({ ok: false, linea: 2 })
    expect(filas[2]).toMatchObject({ ok: false, linea: 3 })
    expect(filas[3]).toMatchObject({ ok: false, linea: 4 })
    expect(filas[4]).toMatchObject({ ok: false, linea: 5 })
  })

  it('ignora líneas en blanco', () => {
    const filas = parseFilasImportadas('\n2026-01-05;ingreso;Alquiler mensual;800\n\n')
    expect(filas).toHaveLength(1)
  })
})

describe('generarGastosPendientes', () => {
  it('genera el mes actual si el gasto recurrente aún no tiene transacción', () => {
    const p = propiedad({
      gastosRecurrentes: [{ id: 'g1', categoria: 'Comunidad', importe: 50, creadoEn: '2026-01-01' }],
    })
    const nuevas = generarGastosPendientes([p], [], new Date('2026-01-15'))
    expect(nuevas).toHaveLength(1)
    expect(nuevas[0].fecha).toBe('2026-01-01')
    expect(nuevas[0].importe).toBe(50)
  })

  it('no duplica un mes que ya tiene la transacción del gasto recurrente', () => {
    const p = propiedad({
      gastosRecurrentes: [{ id: 'g1', categoria: 'Comunidad', importe: 50, creadoEn: '2026-01-01' }],
    })
    const yaExiste = transaccion({ tipo: 'gasto', categoria: 'Comunidad', fecha: '2026-01-01', importe: 50 })
    const nuevas = generarGastosPendientes([p], [yaExiste], new Date('2026-01-15'))
    expect(nuevas).toHaveLength(0)
  })

  it('rellena todos los meses que faltan entre el alta y el mes actual', () => {
    const p = propiedad({
      gastosRecurrentes: [{ id: 'g1', categoria: 'Comunidad', importe: 50, creadoEn: '2026-01-01' }],
    })
    const nuevas = generarGastosPendientes([p], [], new Date('2026-03-10'))
    expect(nuevas.map((t) => t.fecha).sort()).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })

  it('no genera nada si el gasto se configuró en un mes futuro', () => {
    const p = propiedad({
      gastosRecurrentes: [{ id: 'g1', categoria: 'Comunidad', importe: 50, creadoEn: '2026-06-01' }],
    })
    const nuevas = generarGastosPendientes([p], [], new Date('2026-01-15'))
    expect(nuevas).toHaveLength(0)
  })
})

describe('rentaPendiente', () => {
  it('no marca pendiente antes del día 5', () => {
    const p = propiedad({ alquilerMensual: 500 })
    expect(rentaPendiente(p, [], new Date('2026-01-03'))).toBe(false)
  })

  it('marca pendiente desde el día 5 si no hay cobro registrado ese mes', () => {
    const p = propiedad({ alquilerMensual: 500 })
    expect(rentaPendiente(p, [], new Date('2026-01-05'))).toBe(true)
  })

  it('no marca pendiente si ya hay un ingreso de Alquiler mensual ese mes', () => {
    const p = propiedad({ alquilerMensual: 500 })
    const tx = transaccion({ categoria: 'Alquiler mensual', tipo: 'ingreso', fecha: '2026-01-05', importe: 500 })
    expect(rentaPendiente(p, [tx], new Date('2026-01-20'))).toBe(false)
  })

  it('no aplica a propiedades no alquiladas ni sin alquiler pactado', () => {
    expect(rentaPendiente(propiedad({ estado: 'vacio', alquilerMensual: 500 }), [], new Date('2026-01-10'))).toBe(
      false,
    )
    expect(rentaPendiente(propiedad({ alquilerMensual: undefined }), [], new Date('2026-01-10'))).toBe(false)
  })
})

describe('deudaInquilino', () => {
  it('no calcula deuda sin fecha de inicio de contrato', () => {
    const p = propiedad({ alquilerMensual: 500, contratoInicio: undefined })
    expect(deudaInquilino(p, [], new Date('2026-06-01'))).toBeNull()
  })

  it('acumula lo esperado desde el inicio del contrato menos lo ya cobrado, sin contar el mes en curso', () => {
    const p = propiedad({ alquilerMensual: 500, contratoInicio: '2026-01-01' })
    // Enero y febrero esperados (500 x 2 = 1000); marzo es el mes en curso y
    // no cuenta todavía. Solo se cobró enero.
    const txs = [transaccion({ importe: 500, fecha: '2026-01-05' })]
    const deuda = deudaInquilino(p, txs, new Date('2026-03-15'))
    expect(deuda).toEqual({ importe: 500, meses: 1 })
  })

  it('el mes en curso nunca cuenta como deuda, aunque aún no se haya cobrado', () => {
    const p = propiedad({ alquilerMensual: 500, contratoInicio: '2026-03-01' })
    expect(deudaInquilino(p, [], new Date('2026-03-15'))).toBeNull()
  })

  it('un pago que cubre varios meses de golpe reduce la deuda sin "casarlo" a ningún mes', () => {
    const p = propiedad({ alquilerMensual: 500, contratoInicio: '2026-01-01' })
    const txs = [transaccion({ importe: 1500, fecha: '2026-03-10' })]
    expect(deudaInquilino(p, txs, new Date('2026-03-15'))).toBeNull()
  })

  it('no hay deuda si está todo pagado', () => {
    const p = propiedad({ alquilerMensual: 500, contratoInicio: '2026-01-01' })
    const txs = [transaccion({ importe: 500, fecha: '2026-01-05' })]
    expect(deudaInquilino(p, txs, new Date('2026-01-20'))).toBeNull()
  })

  it('deudaDesde adelanta el punto de partida sin tocar el contrato', () => {
    const p = propiedad({ alquilerMensual: 500, contratoInicio: '2026-01-01', deudaDesde: '2026-03' })
    // Marzo ya es un mes cerrado visto desde abril — cuenta como deuda.
    const deuda = deudaInquilino(p, [], new Date('2026-04-15'))
    expect(deuda).toEqual({ importe: 500, meses: 1 })
  })

  it('no aplica a propiedades no alquiladas ni sin alquiler pactado', () => {
    expect(
      deudaInquilino(
        propiedad({ estado: 'vacio', alquilerMensual: 500, contratoInicio: '2026-01-01' }),
        [],
        new Date('2026-03-01'),
      ),
    ).toBeNull()
    expect(
      deudaInquilino(
        propiedad({ alquilerMensual: undefined, contratoInicio: '2026-01-01' }),
        [],
        new Date('2026-03-01'),
      ),
    ).toBeNull()
  })

  it('un cobro casado a enero no salda febrero', () => {
    const p = propiedad({ alquilerMensual: 500, contratoInicio: '2026-01-01' })
    const txs = [
      transaccion({
        importe: 500,
        fecha: '2026-03-10',
        periodoInicio: '2026-01-01',
        periodoFin: '2026-01-31',
      }),
    ]
    const deuda = deudaInquilino(p, txs, new Date('2026-03-15'))
    expect(deuda).toEqual({ importe: 500, meses: 1 })
  })

  it('en un local compara neta cobrada contra neta esperada, no la bruta', () => {
    const p = propiedad({
      tipo: 'local',
      alquilerMensual: 1000,
      contratoInicio: '2026-01-01',
    })
    const neta = alquilerACobrar(p, '2026-01-01', new Date('2026-03-15'))!
    expect(neta).toBeCloseTo(880, 6)
    const txs = [
      transaccion({ importe: neta, fecha: '2026-01-05' }),
      transaccion({ importe: neta, fecha: '2026-02-05' }),
    ]
    expect(deudaInquilino(p, txs, new Date('2026-03-15'))).toBeNull()
  })
})

describe('rentaPendiente importe', () => {
  it('un cobro de un mes atrasado no tapa el mes en curso', () => {
    const p = propiedad({ alquilerMensual: 500, contratoInicio: '2026-01-01' })
    const tx = transaccion({
      importe: 500,
      fecha: '2026-03-10',
      periodoInicio: '2026-01-01',
      periodoFin: '2026-01-31',
    })
    expect(rentaPendiente(p, [tx], new Date('2026-03-10'))).toBe(true)
    expect(rentaDelMesIncompleta(p, [tx], new Date('2026-03-10'))).toBe(true)
    expect(mesAlquilerMasAntiguoPendiente(p, [tx], new Date('2026-03-10'))).toBe('2026-02')
  })

  it('un cobro parcial no cierra el mes', () => {
    const p = propiedad({ alquilerMensual: 800, contratoInicio: '2026-01-01' })
    const tx = transaccion({ importe: 400, fecha: '2026-01-05' })
    expect(rentaPendiente(p, [tx], new Date('2026-01-10'))).toBe(true)
  })

  it('respeta el día de cobro configurado', () => {
    const p = propiedad({ alquilerMensual: 800, contratoInicio: '2026-01-01', diaCobro: 10 })
    expect(rentaPendiente(p, [], new Date('2026-01-09'))).toBe(false)
    expect(rentaPendiente(p, [], new Date('2026-01-10'))).toBe(true)
  })
})

describe('amortizacion prorrateada', () => {
  it('un piso vacío todo el año, sin historial, no amortiza ese año', () => {
    const p = propiedad({
      estado: 'vacio',
      valorConstruccion: 100000,
      contratoInicio: undefined,
    })
    expect(amortizacionAnual(p, '2026')).toBe(0)
  })

  it('un contrato de medio año amortiza la mitad', () => {
    const p = propiedad({
      estado: 'vacio',
      valorConstruccion: 100000,
      historialContratos: [
        { id: 'h1', fechaInicio: '2026-01-01', fechaFin: '2026-06-30', alquilerMensual: 700 },
      ],
    })
    expect(amortizacionAnual(p, '2026')).toBeCloseTo(100000 * 0.03 * (6 / 12), 6)
  })
})

describe('rendimiento IRPF unificado', () => {
  it('una fianza no cuenta como rendimiento', () => {
    const p = propiedad({ tipo: 'piso' })
    const txs = [
      transaccion({ categoria: 'Fianza recibida', tipo: 'ingreso', importe: 800, fecha: '2026-01-05' }),
      transaccion({ categoria: 'Alquiler mensual', tipo: 'ingreso', importe: 800, fecha: '2026-01-05' }),
    ]
    const e = estimarAhorroRenta([p], txs, [], '2026', 0)
    expect(e.porPropiedad[0].ingresos).toBe(800)
  })

  it('la cuota de hipoteca no se deduce; los intereses sí', () => {
    const p = propiedad({ tipo: 'piso' })
    const txs = [
      transaccion({ categoria: 'Alquiler mensual', tipo: 'ingreso', importe: 1000, fecha: '2026-01-05' }),
      transaccion({
        categoria: 'Hipoteca / Financiación',
        tipo: 'gasto',
        importe: 400,
        fecha: '2026-01-05',
      }),
      transaccion({ categoria: 'Intereses hipoteca', tipo: 'gasto', importe: 120, fecha: '2026-01-05' }),
    ]
    const e = estimarAhorroRenta([p], txs, [], '2026', 0)
    expect(e.porPropiedad[0].gastos).toBe(120)
  })
})

describe('deuda tramos leftover', () => {
  it('usa la renta de cada tramo, no la actual, para los meses anteriores a un cambio', () => {
    const base = propiedad({
      alquilerMensual: 500,
      contratoInicio: '2026-01-01',
      contratoFin: '2026-12-31',
    })
    const r = aplicarCambioCondiciones(
      base,
      { vigenteDesde: '2026-03-01', alquilerMensual: 600, contratoFin: '2027-12-31' },
      new Date('2026-04-15'),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Enero y febrero a 500, marzo a 600; abril es el mes en curso y no cuenta.
    const deuda = deudaInquilino(r.propiedad, [], new Date('2026-04-15'))
    expect(deuda?.importe).toBe(1600)
  })
})

describe('tramos de contrato', () => {
  const alquilada = () =>
    propiedad({
      estado: 'alquilado',
      alquilerMensual: 700,
      contratoInicio: '2024-01-01',
      contratoFin: '2026-09-30',
      fianzaImporte: 700,
    })

  it('sin tramos persistidos, el tramo implícito sale de los campos sueltos', () => {
    const p = alquilada()
    const tramos = tramosEfectivos(p)
    expect(tramos).toHaveLength(1)
    expect(tramos[0]).toMatchObject({
      vigenteDesde: '2024-01-01',
      alquilerMensual: 700,
      contratoFin: '2026-09-30',
      fianzaImporte: 700,
    })
    expect(alquilerVigente(p, '2026-06-01')).toBe(700)
  })

  it('aplica un cambio futuro sin adelantar la renta de hoy', () => {
    const r = aplicarCambioCondiciones(
      alquilada(),
      { vigenteDesde: '2026-10-01', alquilerMensual: 750, contratoFin: '2027-09-30' },
      new Date('2026-09-18'),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.propiedad.alquilerMensual).toBe(700)
    expect(r.propiedad.contratoFin).toBe('2027-09-30')
    expect(alquilerVigente(r.propiedad, '2026-09-18', new Date('2026-09-18'))).toBe(700)
    expect(alquilerVigente(r.propiedad, '2026-10-01', new Date('2026-09-18'))).toBe(750)
    expect(tramoEnFecha(r.propiedad, '2026-10-01')?.contratoFin).toBe('2027-09-30')
    expect(r.propiedad.tramosContrato).toHaveLength(2)
  })

  it('un cambio ya vigente actualiza la renta de la ficha y marca la revisión', () => {
    const r = aplicarCambioCondiciones(
      alquilada(),
      { vigenteDesde: '2026-09-01', alquilerMensual: 750 },
      new Date('2026-09-18'),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.propiedad.alquilerMensual).toBe(750)
    expect(r.propiedad.rentaRevisadaDesde).toBe(new Date('2026-09-18').toISOString())
  })

  it('rechaza un cambio anterior al inicio, sin cambios, o sin contrato', () => {
    expect(aplicarCambioCondiciones(alquilada(), { vigenteDesde: '2023-12-01', alquilerMensual: 800 }).ok).toBe(
      false,
    )
    expect(
      aplicarCambioCondiciones(alquilada(), {
        vigenteDesde: '2026-10-01',
        alquilerMensual: 700,
        contratoFin: '2026-09-30',
        fianzaImporte: 700,
      }).ok,
    ).toBe(false)
    expect(
      aplicarCambioCondiciones(
        propiedad({ estado: 'alquilado', alquilerMensual: 700 }),
        { vigenteDesde: '2026-10-01', alquilerMensual: 800 },
      ).ok,
    ).toBe(false)
    expect(
      aplicarCambioCondiciones(propiedad({ estado: 'vacio', contratoInicio: '2024-01-01' }), {
        vigenteDesde: '2026-10-01',
        alquilerMensual: 800,
      }).ok,
    ).toBe(false)
  })

  it('reemplaza un tramo del mismo día en vez de duplicarlo', () => {
    const primero = aplicarCambioCondiciones(
      alquilada(),
      { vigenteDesde: '2026-10-01', alquilerMensual: 750, contratoFin: '2027-09-30' },
      new Date('2026-09-18'),
    )
    expect(primero.ok).toBe(true)
    if (!primero.ok) return
    const segundo = aplicarCambioCondiciones(
      primero.propiedad,
      { vigenteDesde: '2026-10-01', alquilerMensual: 780, contratoFin: '2027-09-30' },
      new Date('2026-09-18'),
    )
    expect(segundo.ok).toBe(true)
    if (!segundo.ok) return
    expect(segundo.propiedad.tramosContrato).toHaveLength(2)
    expect(alquilerVigente(segundo.propiedad, '2026-10-01')).toBe(780)
  })

  it('quitar el tramo extra vuelve a los campos sueltos del tramo que queda', () => {
    const r = aplicarCambioCondiciones(
      alquilada(),
      { vigenteDesde: '2026-10-01', alquilerMensual: 750, contratoFin: '2027-09-30' },
      new Date('2026-09-18'),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const extra = r.propiedad.tramosContrato?.find((t) => t.vigenteDesde === '2026-10-01')
    expect(extra).toBeTruthy()
    const limpio = quitarTramoContrato(r.propiedad, extra!.id, new Date('2026-09-18'))
    expect(limpio.tramosContrato).toBeUndefined()
    expect(limpio.alquilerMensual).toBe(700)
    expect(limpio.contratoFin).toBe('2026-09-30')
  })

  it('editar la ficha corrige el tramo vigente, no crea uno nuevo', () => {
    const r = aplicarCambioCondiciones(
      alquilada(),
      { vigenteDesde: '2026-10-01', alquilerMensual: 750, contratoFin: '2027-09-30' },
      new Date('2026-09-18'),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const corregida = corregirTramoVigente(
      r.propiedad,
      { alquilerMensual: 710, contratoFin: r.propiedad.contratoFin, fianzaImporte: 700 },
      new Date('2026-09-18'),
    )
    expect(corregida.tramosContrato).toHaveLength(2)
    expect(alquilerVigente(corregida, '2026-09-18', new Date('2026-09-18'))).toBe(710)
    expect(alquilerVigente(corregida, '2026-10-01', new Date('2026-09-18'))).toBe(750)
    expect(corregida.alquilerMensual).toBe(710)
  })

  it('el periodo de un tramo cierra el día anterior al siguiente', () => {
    const r = aplicarCambioCondiciones(
      alquilada(),
      { vigenteDesde: '2026-10-01', alquilerMensual: 750, contratoFin: '2027-09-30' },
      new Date('2026-09-18'),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const tramos = r.propiedad.tramosContrato ?? []
    expect(periodoTramo(tramos, 0)).toEqual({ desde: '2024-01-01', hasta: '2026-09-30' })
    expect(periodoTramo(tramos, 1)).toEqual({ desde: '2026-10-01', hasta: '2027-09-30' })
  })

  it('rentaPendiente usa la renta del mes, no un tramo futuro', () => {
    const r = aplicarCambioCondiciones(
      alquilada(),
      { vigenteDesde: '2026-10-01', alquilerMensual: 750 },
      new Date('2026-09-18'),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(rentaPendiente(r.propiedad, [], new Date('2026-09-18'))).toBe(true)
    const sinRentaEsteMes = propiedad({ estado: 'alquilado', contratoInicio: '2026-01-01' })
    const futuro = aplicarCambioCondiciones(
      { ...sinRentaEsteMes, alquilerMensual: undefined },
      { vigenteDesde: '2026-10-01', alquilerMensual: 750 },
      new Date('2026-09-18'),
    )
    // Sin renta pactada en el tramo de septiembre, no hay pendiente este mes.
    expect(futuro.ok).toBe(true)
    if (!futuro.ok) return
    expect(rentaPendiente(futuro.propiedad, [], new Date('2026-09-18'))).toBe(false)
  })
})

describe('sustituirPorContratoNuevo', () => {
  const alquilada = () =>
    propiedad({
      estado: 'alquilado',
      inquilinoNombre: 'Ana Pérez',
      inquilinoDni: '12345678A',
      inquilinoEmail: 'ana@test.com',
      alquilerMensual: 700,
      contratoInicio: '2024-01-01',
      contratoFin: '2026-09-30',
      fianzaImporte: 700,
      fianzaDepositadaDesde: '2024-01-10T00:00:00.000Z',
      contratoArchivoId: 'file-old',
      contratoArchivoNombre: 'contrato.pdf',
      rentaRevisadaDesde: '2026-01-01T00:00:00.000Z',
    })

  it('archiva el contrato actual y deja al inquilino con uno nuevo', () => {
    const r = sustituirPorContratoNuevo(alquilada(), {
      fechaFinAnterior: '2026-09-30',
      contratoInicio: '2026-10-01',
      contratoFin: '2027-09-30',
      alquilerMensual: 750,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.propiedad.estado).toBe('alquilado')
    expect(r.propiedad.inquilinoNombre).toBe('Ana Pérez')
    expect(r.propiedad.inquilinoDni).toBe('12345678A')
    expect(r.propiedad.contratoInicio).toBe('2026-10-01')
    expect(r.propiedad.contratoFin).toBe('2027-09-30')
    expect(r.propiedad.alquilerMensual).toBe(750)
    expect(r.propiedad.tramosContrato).toBeUndefined()
    expect(r.propiedad.contratoArchivoId).toBeUndefined()
    expect(r.propiedad.rentaRevisadaDesde).toBeUndefined()
    expect(r.propiedad.fianzaDepositadaDesde).toBe('2024-01-10T00:00:00.000Z')
    expect(r.propiedad.historialContratos).toHaveLength(1)
    expect(r.propiedad.historialContratos![0]).toMatchObject({
      inquilinoNombre: 'Ana Pérez',
      fechaInicio: '2024-01-01',
      fechaFin: '2026-09-30',
      alquilerMensual: 700,
      contratoArchivoId: 'file-old',
    })
  })

  it('antes del inicio del contrato nuevo, la renta y la deuda siguen las del anterior', () => {
    const r = sustituirPorContratoNuevo(
      { ...alquilada(), contratoInicio: '2026-01-01' },
      {
        fechaFinAnterior: '2026-09-30',
        contratoInicio: '2026-10-01',
        contratoFin: '2027-09-30',
        alquilerMensual: 750,
      },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(alquilerVigente(r.propiedad, '2026-09-18', new Date('2026-09-18'))).toBe(700)
    expect(alquilerVigente(r.propiedad, '2026-10-01', new Date('2026-09-18'))).toBe(750)
    expect(rentaPendiente(r.propiedad, [], new Date('2026-09-18'))).toBe(true)
    // Agosto cerrado, a 700 del contrato archivado; septiembre aún no cuenta.
    const deuda = deudaInquilino(r.propiedad, [], new Date('2026-09-18'))
    expect(deuda?.importe).toBe(700 * 8)
  })

  it('un inquilino distinto en el historial no cuenta para la deuda del actual', () => {
    const p = propiedad({
      estado: 'alquilado',
      inquilinoNombre: 'Ana Pérez',
      alquilerMensual: 800,
      contratoInicio: '2026-06-01',
      historialContratos: [
        {
          id: 'h1',
          inquilinoNombre: 'Otro',
          alquilerMensual: 500,
          fechaInicio: '2026-01-01',
          fechaFin: '2026-05-31',
        },
      ],
    })
    const deuda = deudaInquilino(p, [], new Date('2026-08-15'))
    // Junio y julio a 800; el contrato de Otro no entra.
    expect(deuda?.importe).toBe(1600)
  })

  it('rechaza fechas incoherentes o una propiedad que no está alquilada', () => {
    expect(
      sustituirPorContratoNuevo(alquilada(), {
        fechaFinAnterior: '2026-10-01',
        contratoInicio: '2026-10-01',
        alquilerMensual: 750,
      }).ok,
    ).toBe(false)
    expect(
      sustituirPorContratoNuevo(alquilada(), {
        fechaFinAnterior: '2023-12-01',
        contratoInicio: '2026-10-01',
        alquilerMensual: 750,
      }).ok,
    ).toBe(false)
    expect(
      sustituirPorContratoNuevo(propiedad({ estado: 'vacio', contratoInicio: '2024-01-01' }), {
        fechaFinAnterior: '2026-09-30',
        contratoInicio: '2026-10-01',
      }).ok,
    ).toBe(false)
  })

  it('conserva los tramos del contrato archivado', () => {
    const conTramos = aplicarCambioCondiciones(
      alquilada(),
      { vigenteDesde: '2026-01-01', alquilerMensual: 720, contratoFin: '2026-09-30' },
      new Date('2026-09-18'),
    )
    expect(conTramos.ok).toBe(true)
    if (!conTramos.ok) return
    const r = sustituirPorContratoNuevo(conTramos.propiedad, {
      fechaFinAnterior: '2026-09-30',
      contratoInicio: '2026-10-01',
      contratoFin: '2027-09-30',
      alquilerMensual: 750,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.propiedad.tramosContrato).toBeUndefined()
    expect(r.propiedad.historialContratos![0].tramos).toHaveLength(2)
    expect(alquilerVigente(r.propiedad, '2026-02-01')).toBe(720)
  })
})

function tarea(overrides: Partial<Tarea> = {}): Tarea {
  return {
    id: crypto.randomUUID(),
    propiedadId: 'p1',
    titulo: 'Tarea test',
    prioridad: 'media',
    estado: 'pendiente',
    creadoEn: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('tareaVencida', () => {
  it('no está vencida si no tiene fecha límite', () => {
    expect(tareaVencida(tarea(), new Date('2026-06-01'))).toBe(false)
  })

  it('está vencida si la fecha límite ya pasó y sigue pendiente', () => {
    expect(tareaVencida(tarea({ fechaLimite: '2026-01-01' }), new Date('2026-06-01'))).toBe(true)
  })

  it('no está vencida si aún no ha llegado la fecha límite', () => {
    expect(tareaVencida(tarea({ fechaLimite: '2026-12-31' }), new Date('2026-06-01'))).toBe(false)
  })

  it('una tarea ya hecha nunca está vencida', () => {
    expect(tareaVencida(tarea({ fechaLimite: '2026-01-01', estado: 'hecha' }), new Date('2026-06-01'))).toBe(false)
  })
})

describe('ordenarTareas', () => {
  it('las pendientes van antes que las hechas', () => {
    const hecha = tarea({ id: 'a', estado: 'hecha', prioridad: 'alta' })
    const pendiente = tarea({ id: 'b', estado: 'pendiente', prioridad: 'baja' })
    expect(ordenarTareas([hecha, pendiente]).map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('entre pendientes, ordena por prioridad (alta > media > baja)', () => {
    const baja = tarea({ id: 'baja', prioridad: 'baja' })
    const alta = tarea({ id: 'alta', prioridad: 'alta' })
    const media = tarea({ id: 'media', prioridad: 'media' })
    expect(ordenarTareas([baja, alta, media]).map((t) => t.id)).toEqual(['alta', 'media', 'baja'])
  })

  it('dentro de la misma prioridad, ordena por la fecha límite más próxima primero', () => {
    const lejos = tarea({ id: 'lejos', fechaLimite: '2026-12-01' })
    const cerca = tarea({ id: 'cerca', fechaLimite: '2026-06-01' })
    expect(ordenarTareas([lejos, cerca]).map((t) => t.id)).toEqual(['cerca', 'lejos'])
  })

  it('sin fecha límite va después de las que sí tienen, dentro de la misma prioridad', () => {
    const conFecha = tarea({ id: 'con-fecha', fechaLimite: '2026-06-01' })
    const sinFecha = tarea({ id: 'sin-fecha' })
    expect(ordenarTareas([sinFecha, conFecha]).map((t) => t.id)).toEqual(['con-fecha', 'sin-fecha'])
  })
})

describe('datosFacturacionCompletos', () => {
  it('false si es null o falta algún campo', () => {
    expect(datosFacturacionCompletos(null)).toBe(false)
    expect(datosFacturacionCompletos({ nombre: '', nif: '12345678A', direccion: 'Calle X' })).toBe(false)
    expect(datosFacturacionCompletos({ nombre: 'Jose', nif: '  ', direccion: 'Calle X' })).toBe(false)
  })

  it('true si los tres campos tienen contenido', () => {
    expect(datosFacturacionCompletos({ nombre: 'Jose', nif: '12345678A', direccion: 'Calle X' })).toBe(true)
  })
})

describe('tipoDocumentoAlquiler', () => {
  it('local -> factura (F), el resto -> recibo (R)', () => {
    expect(tipoDocumentoAlquiler({ tipo: 'local' })).toBe('F')
    expect(tipoDocumentoAlquiler({ tipo: 'piso' })).toBe('R')
    expect(tipoDocumentoAlquiler({ tipo: 'casa' })).toBe('R')
  })
})

describe('inicioPeriodoAlDia', () => {
  it('a partir del día 15 (inclusive), el periodo empieza ese mismo mes', () => {
    expect(inicioPeriodoAlDia(new Date(2026, 6, 15))).toEqual(new Date(2026, 6, 15))
    expect(inicioPeriodoAlDia(new Date(2026, 6, 20))).toEqual(new Date(2026, 6, 15))
  })

  it('antes del día 15, el periodo viene del mes anterior', () => {
    expect(inicioPeriodoAlDia(new Date(2026, 6, 14))).toEqual(new Date(2026, 5, 15))
    expect(inicioPeriodoAlDia(new Date(2026, 6, 1))).toEqual(new Date(2026, 5, 15))
  })

  it('enero antes del 15 retrocede al 15 de diciembre del año anterior', () => {
    expect(inicioPeriodoAlDia(new Date(2026, 0, 10))).toEqual(new Date(2025, 11, 15))
  })
})

describe('estaAlDia', () => {
  it('sin alDiaDesde, nunca está al día', () => {
    expect(estaAlDia({ alDiaDesde: undefined }, new Date(2026, 6, 20))).toBe(false)
  })

  it('marcada dentro del periodo en curso, está al día', () => {
    expect(estaAlDia({ alDiaDesde: new Date(2026, 6, 16).toISOString() }, new Date(2026, 6, 20))).toBe(
      true,
    )
  })

  it('marcada en un periodo anterior, ya no cuenta tras el reinicio del día 15', () => {
    expect(estaAlDia({ alDiaDesde: new Date(2026, 5, 20).toISOString() }, new Date(2026, 6, 20))).toBe(
      false,
    )
  })
})

describe('siguienteNumeroFactura', () => {
  it('empieza en 001 si no hay ninguna asignada ese año/serie', () => {
    expect(siguienteNumeroFactura([], 'R', '2026')).toBe('R-2026-001')
  })

  it('continúa la numeración a partir de la más alta ya asignada', () => {
    const txs = [{ numeroFactura: 'R-2026-001' }, { numeroFactura: 'R-2026-003' }, { numeroFactura: 'R-2026-002' }]
    expect(siguienteNumeroFactura(txs, 'R', '2026')).toBe('R-2026-004')
  })

  it('lleva series independientes por prefijo (F y R no se mezclan)', () => {
    const txs = [{ numeroFactura: 'F-2026-005' }]
    expect(siguienteNumeroFactura(txs, 'R', '2026')).toBe('R-2026-001')
  })

  it('lleva series independientes por año', () => {
    const txs = [{ numeroFactura: 'R-2025-009' }]
    expect(siguienteNumeroFactura(txs, 'R', '2026')).toBe('R-2026-001')
  })

  it('ignora transacciones sin numeroFactura', () => {
    const txs = [{ numeroFactura: undefined }, { numeroFactura: 'R-2026-002' }]
    expect(siguienteNumeroFactura(txs, 'R', '2026')).toBe('R-2026-003')
  })
})
