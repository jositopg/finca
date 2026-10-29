import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Foto } from './foto.ts'
import { responder } from './protocolo.ts'

const fotoVacia: Foto = { propiedades: [], transacciones: [], tareas: [], ingresosExternos: [] }

describe('protocolo', () => {
  it('anuncia las herramientas y no responde a la notificación de inicio', async () => {
    const init = await responder(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
      },
      { foto: async () => fotoVacia },
    )
    expect(init).toMatchObject({
      id: 1,
      result: { protocolVersion: '2025-06-18', serverInfo: { name: 'finca' } },
    })

    const aviso = await responder({ jsonrpc: '2.0', method: 'notifications/initialized' }, { foto: async () => fotoVacia })
    expect(aviso).toBeNull()

    const lista = await responder({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { foto: async () => fotoVacia })
    const tools = (lista as { result: { tools: { name: string }[] } }).result.tools
    expect(tools.map((t) => t.name)).toContain('modelo_420')
    expect(tools.map((t) => t.name)).not.toContain('sql')
  })

  it('devuelve un error de herramienta si el nombre no existe', async () => {
    const respuesta = await responder(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'borrar', arguments: {} } },
      { foto: async () => fotoVacia },
    )
    expect(respuesta).toMatchObject({ result: { isError: true } })
  })
})

describe('servidor', () => {
  it('contesta a initialize por stdin', async () => {
    const child = spawn(process.execPath, ['scripts/mcp/server.ts'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let salida = ''
    child.stdout.setEncoding('utf8')
    const texto = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`sin respuesta: ${salida}`)), 5000)
      child.stdout.on('data', (chunk: string) => {
        salida += chunk
        if (!salida.includes('\n')) return
        clearTimeout(timer)
        resolve(salida)
      })
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
        })}\n`,
      )
    })
    child.kill()
    const mensaje = JSON.parse(texto.split('\n')[0]) as { result: { serverInfo: { name: string } } }
    expect(mensaje.result.serverInfo.name).toBe('finca')
  })
})
