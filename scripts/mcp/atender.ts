import { timingSafeEqual } from 'node:crypto'
import { aplicarEscritura } from './aplicar.ts'
import { ConsultaError, ejecutar, herramientas } from './consultar.ts'
import { esEscritura } from './escribir.ts'
import type { Foto } from './foto.ts'
import { fichasDe, responder } from './protocolo.ts'

export interface PeticionHttp {
  method: string
  authorization?: string
  body?: unknown
}

export interface RespuestaHttp {
  status: number
  contentType: string
  body: string
}

export interface DependenciasHttp {
  token: string
  foto: () => Promise<Foto>
  hoy?: () => Date
}

export const CABECERAS_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(status: number, datos: unknown): RespuestaHttp {
  return { status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(datos) }
}

function mensajeSeguro(err: unknown): string {
  const texto = err instanceof Error ? err.message : 'Error'
  return texto.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://…').replace(/[\w.-]*supabase\.co/gi, '…')
}

export function tokenValido(autorizacion: string | undefined, esperado: string): boolean {
  if (!esperado) return false
  const recibido = autorizacion?.startsWith('Bearer ') ? autorizacion.slice('Bearer '.length).trim() : ''
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

function esRpc(body: unknown): boolean {
  return !!body && typeof body === 'object' && ('jsonrpc' in body || 'method' in body)
}

// Una sola puerta HTTP. Un cliente MCP manda JSON-RPC. Una IA que solo
// sabe hacer POST manda { herramienta, argumentos }. Las dos pasan por
// las mismas funciones que la app. Sin token válido no hay datos.
export async function atender(peticion: PeticionHttp, deps: DependenciasHttp): Promise<RespuestaHttp> {
  if (!deps.token) return json(503, { error: 'El servidor no tiene token.' })
  if (peticion.method === 'OPTIONS') return { status: 204, contentType: 'text/plain; charset=utf-8', body: '' }
  if (!tokenValido(peticion.authorization, deps.token)) return json(401, { error: 'Token inválido.' })

  if (peticion.method === 'GET') {
    return json(200, {
      lectura: true,
      escritura: true,
      herramientas: fichasDe(herramientas).map((h) => ({
        nombre: h.name,
        descripcion: h.description,
        argumentos: h.inputSchema,
      })),
    })
  }

  if (peticion.method !== 'POST') return json(405, { error: 'Usa GET o POST.' })

  const body = peticion.body
  if (body && typeof body === 'object' && 'herramienta' in body && !esRpc(body)) {
    const nombre = (body as { herramienta?: unknown }).herramienta
    const argumentos = (body as { argumentos?: unknown }).argumentos
    if (typeof nombre !== 'string') return json(400, { error: '"herramienta" tiene que ser texto.' })
    try {
      const hoy = deps.hoy?.() ?? new Date()
      const foto = await deps.foto()
      if (esEscritura(nombre)) return json(200, await aplicarEscritura(nombre, argumentos, { foto, hoy }))
      return json(200, ejecutar(nombre, argumentos, foto, hoy))
    } catch (err) {
      if (err instanceof ConsultaError) return json(400, { error: err.message })
      return json(500, { error: mensajeSeguro(err) })
    }
  }

  try {
    const rpc = await responder(body, {
      foto: deps.foto,
      hoy: deps.hoy,
      escribir: async (nombre, argumentos) => {
        const foto = await deps.foto()
        return aplicarEscritura(nombre, argumentos, { foto, hoy: deps.hoy?.() ?? new Date() })
      },
    })
    if (rpc == null) return { status: 202, contentType: 'application/json; charset=utf-8', body: '' }
    return json(200, rpc)
  } catch (err) {
    const id = body && typeof body === 'object' && 'id' in body ? (body as { id?: unknown }).id ?? null : null
    return json(200, { jsonrpc: '2.0', id, error: { code: -32603, message: mensajeSeguro(err) } })
  }
}
