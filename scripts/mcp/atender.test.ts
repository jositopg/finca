import { describe, expect, it } from 'vitest'
import { atender } from './atender.ts'
import type { Foto } from './foto.ts'

const TOKEN = 'token-de-prueba'
const fotoVacia: Foto = { propiedades: [], transacciones: [], tareas: [], ingresosExternos: [] }
const deps = { token: TOKEN, foto: async () => fotoVacia }

describe('atender', () => {
  it('rechaza una petición sin token', async () => {
    const respuesta = await atender({ method: 'GET' }, deps)
    expect(respuesta.status).toBe(401)
  })

  it('lista las herramientas si el token coincide', async () => {
    const respuesta = await atender({ method: 'GET', authorization: `Bearer ${TOKEN}` }, deps)
    expect(respuesta.status).toBe(200)
    expect(respuesta.body).toContain('modelo_420')
    expect(respuesta.body).not.toContain('sql')
  })

  it('responde al initialize de MCP', async () => {
    const respuesta = await atender(
      {
        method: 'POST',
        authorization: `Bearer ${TOKEN}`,
        body: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
        },
      },
      deps,
    )
    expect(respuesta.status).toBe(200)
    const mensaje = JSON.parse(respuesta.body) as { result: { serverInfo: { name: string } } }
    expect(mensaje.result.serverInfo.name).toBe('finca')
  })

  it('ejecuta una herramienta por el sobre simple', async () => {
    const respuesta = await atender(
      {
        method: 'POST',
        authorization: `Bearer ${TOKEN}`,
        body: { herramienta: 'listar_fincas', argumentos: {} },
      },
      deps,
    )
    expect(respuesta.status).toBe(200)
    expect(JSON.parse(respuesta.body)).toEqual({ fincas: [] })
  })
})
