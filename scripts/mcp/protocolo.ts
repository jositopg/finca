import { ConsultaError, herramientas, ejecutar, type Herramienta } from './consultar.ts'
import type { Foto } from './foto.ts'

const VERSION_POR_DEFECTO = '2024-11-05'

export interface ContextoMcp {
  foto: () => Promise<Foto>
  hoy?: () => Date
}

interface Mensaje {
  jsonrpc?: string
  id?: unknown
  method?: string
  params?: unknown
}

function esPeticion(mensaje: Mensaje): boolean {
  return mensaje.id !== undefined && mensaje.id !== null
}

function versionDe(params: unknown): string {
  if (params && typeof params === 'object' && 'protocolVersion' in params) {
    const pedida = (params as { protocolVersion?: unknown }).protocolVersion
    if (typeof pedida === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pedida)) return pedida
  }
  return VERSION_POR_DEFECTO
}

function resultado(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function errorRpc(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function texto(datos: unknown, esError = false) {
  return {
    content: [{ type: 'text', text: typeof datos === 'string' ? datos : JSON.stringify(datos, null, 2) }],
    ...(esError ? { isError: true } : {}),
  }
}

export function fichasDe(lista: Herramienta[]) {
  return lista.map((h) => ({ name: h.name, description: h.description, inputSchema: h.inputSchema }))
}

export async function responder(mensaje: unknown, ctx: ContextoMcp): Promise<Record<string, unknown> | null> {
  if (!mensaje || typeof mensaje !== 'object') {
    return errorRpc(null, -32600, 'Invalid Request')
  }
  const msg = mensaje as Mensaje
  const method = msg.method
  if (!method) return esPeticion(msg) ? errorRpc(msg.id, -32600, 'Invalid Request') : null

  if (method === 'initialize') {
    if (!esPeticion(msg)) return null
    return resultado(msg.id, {
      protocolVersion: versionDe(msg.params),
      capabilities: { tools: {} },
      serverInfo: { name: 'finca', version: '0.1.0' },
      instructions:
        'Solo lectura de Las Fincas. Las cifras salen de las mismas funciones que la app. No escribe y no devuelve DNI, email, teléfono ni NIF. Los totales y la fiscalidad cuentan solo las fincas de Jose en alquiler.',
    })
  }

  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return null

  if (method === 'ping') return esPeticion(msg) ? resultado(msg.id, {}) : null

  if (method === 'tools/list') {
    if (!esPeticion(msg)) return null
    return resultado(msg.id, { tools: fichasDe(herramientas) })
  }

  if (method === 'tools/call') {
    if (!esPeticion(msg)) return null
    const params = (msg.params ?? {}) as { name?: unknown; arguments?: unknown }
    if (typeof params.name !== 'string') return errorRpc(msg.id, -32602, 'Falta el nombre de la herramienta.')
    try {
      const foto = await ctx.foto()
      const datos = ejecutar(params.name, params.arguments, foto, ctx.hoy?.() ?? new Date())
      return resultado(msg.id, texto(datos))
    } catch (err) {
      if (err instanceof ConsultaError) return resultado(msg.id, texto(err.message, true))
      throw err
    }
  }

  if (!esPeticion(msg)) return null
  return errorRpc(msg.id, -32601, `Method not found: ${method}`)
}
