import { describe, expect, it } from 'vitest'
import type { Propiedad, Tarea } from '../../src/types/index.ts'
import { aplicarEscritura, type ConsultaSql } from './aplicar.ts'
import { ConsultaError } from './consultar.ts'
import { planificar } from './escribir.ts'
import type { Foto } from './foto.ts'

const hoy = new Date(2026, 9, 31)

function finca(parcial: Partial<Propiedad> & Pick<Propiedad, 'id' | 'nombre' | 'tipo'>): Propiedad {
  return {
    direccion: 'Calle',
    estado: 'alquilado',
    folderId: 'carpeta',
    creadoEn: '2026-01-01T00:00:00.000Z',
    ...parcial,
  }
}

function fotoDe(propiedades: Propiedad[], tareas: Tarea[] = []): Foto {
  return { propiedades, transacciones: [], tareas, ingresosExternos: [] }
}

describe('planificar', () => {
  const foto = fotoDe([finca({ id: 'p1', nombre: 'Local Quimel', tipo: 'local' })])

  it('un cobro sin confirmar no trae sentencias que haya que ejecutar', () => {
    const orden = planificar('registrar_cobro', { finca: 'Quimel', importe: '900,00' }, foto, hoy)
    expect(orden.confirmar).toBe(false)
    expect(orden.vista).toMatchObject({
      escrito: false,
      vistaPrevia: true,
      movimiento: {
        finca: 'Local Quimel',
        tipo: 'ingreso',
        categoria: 'Alquiler mensual',
        importe: 900,
        fecha: '2026-10-31',
        periodoInicio: '2026-10-01',
        periodoFin: '2026-10-31',
      },
    })
  })

  it('exige clave para escribir y rechaza una categoría que la app no tiene', () => {
    expect(() => planificar('registrar_cobro', { finca: 'Quimel', importe: 10, confirmar: true }, foto, hoy)).toThrow(
      ConsultaError,
    )
    expect(() =>
      planificar('registrar_gasto', { finca: 'Quimel', importe: 10, categoria: 'Inventada', confirmar: false }, foto, hoy),
    ).toThrow(/no es un gasto/)
  })

  it('el IGIC soportado no cabe en una vivienda', () => {
    const vivienda = fotoDe([finca({ id: 'p2', nombre: 'Piso Rambla', tipo: 'piso' })])
    expect(() =>
      planificar(
        'registrar_gasto',
        { finca: 'Rambla', importe: '40', categoria: 'Reparaciones', igicSoportado: 2.8 },
        vivienda,
        hoy,
      ),
    ).toThrow(/local/)
  })

  it('marca la tarea pendiente que coincide', () => {
    const conTarea = fotoDe(foto.propiedades, [
      {
        id: 't1',
        propiedadId: 'p1',
        titulo: 'Revisar extintor',
        prioridad: 'media',
        estado: 'pendiente',
        creadoEn: '2026-01-01T00:00:00.000Z',
      },
    ])
    const orden = planificar('cerrar_tarea', { finca: 'Quimel', titulo: 'revisar extintor' }, conTarea, hoy)
    expect(orden.vista).toMatchObject({ tarea: { id: 't1', estado: 'hecha' } })
  })
})

describe('aplicarEscritura', () => {
  const foto = fotoDe([finca({ id: 'p1', nombre: 'Local Quimel', tipo: 'local' })])

  function memoria(): ConsultaSql & { guardado?: unknown } {
    const estado: { guardado?: unknown; comenzada: boolean } = { comenzada: false }
    const db: ConsultaSql & { guardado?: unknown } = {
      async query(sql: string, params?: unknown[]) {
        if (sql === 'begin') {
          estado.comenzada = true
          return { rows: [], rowCount: null }
        }
        if (sql === 'commit' || sql === 'rollback') {
          estado.comenzada = false
          return { rows: [], rowCount: null }
        }
        if (sql.startsWith('select resultado')) {
          return { rows: estado.guardado ? [{ resultado: estado.guardado }] : [], rowCount: estado.guardado ? 1 : 0 }
        }
        if (sql.startsWith('insert into agente_escrituras')) {
          estado.guardado = JSON.parse(String(params?.[2]))
          db.guardado = estado.guardado
          return { rows: [], rowCount: 1 }
        }
        if (sql.startsWith('insert into transacciones') || sql.startsWith('update tareas') || sql.startsWith('create table')) {
          return { rows: [], rowCount: 1 }
        }
        throw new Error(`sql inesperada: ${sql}`)
      },
    }
    return db
  }

  it('la vista previa no abre la base', async () => {
    const respuesta = await aplicarEscritura('registrar_cobro', { finca: 'Quimel', importe: 900 }, { foto, hoy })
    expect(respuesta).toMatchObject({ escrito: false, vistaPrevia: true })
  })

  it('la misma clave no inserta dos veces', async () => {
    const db = memoria()
    const args = { finca: 'Quimel', importe: 900, confirmar: true, clave: 'cobro-quimel-2026-10' }
    const primera = await aplicarEscritura('registrar_cobro', args, { foto, hoy, db })
    const segunda = await aplicarEscritura('registrar_cobro', args, { foto, hoy, db })
    expect(primera).toMatchObject({ escrito: true, repetida: false })
    expect(segunda).toMatchObject({ escrito: true, repetida: true, movimiento: (primera as { movimiento: unknown }).movimiento })
  })
})
