import { describe, expect, it } from 'vitest'
import {
  baseDesdeRentaNeta,
  calcularReparto,
  calcularRentaLocal,
  cuotaIRPF,
  generarGastosPendientes,
  miParte,
  parseImporte,
  rentaPendiente,
  tipoMarginalIRPF,
  type Propiedad,
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
})

describe('miParte', () => {
  it('aplica el porcentaje de propiedad', () => {
    expect(miParte(1000, { porcentajePropiedad: 50 })).toBe(500)
  })

  it('sin porcentaje definido, asume el 100%', () => {
    expect(miParte(1000, {})).toBe(1000)
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
    const tx = transaccion({ categoria: 'Alquiler mensual', tipo: 'ingreso', fecha: '2026-01-05' })
    expect(rentaPendiente(p, [tx], new Date('2026-01-20'))).toBe(false)
  })

  it('no aplica a propiedades no alquiladas ni sin alquiler pactado', () => {
    expect(rentaPendiente(propiedad({ estado: 'vacio', alquilerMensual: 500 }), [], new Date('2026-01-10'))).toBe(
      false,
    )
    expect(rentaPendiente(propiedad({ alquilerMensual: undefined }), [], new Date('2026-01-10'))).toBe(false)
  })
})
