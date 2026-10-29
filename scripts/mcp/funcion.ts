import type { IncomingMessage, ServerResponse } from 'node:http'
import { atender, CABECERAS_CORS } from './atender.ts'
import { cargarFoto } from './foto.ts'

type Peticion = IncomingMessage & { body?: unknown }

async function leerCuerpo(req: Peticion): Promise<unknown> {
  const ya = req.body
  if (ya != null && ya !== '') {
    if (typeof ya === 'string') return ya.trim() ? JSON.parse(ya) : undefined
    if (Buffer.isBuffer(ya)) {
      const raw = ya.toString('utf8').trim()
      return raw ? JSON.parse(raw) : undefined
    }
    return ya
  }
  const trozos: Buffer[] = []
  for await (const trozo of req) {
    trozos.push(typeof trozo === 'string' ? Buffer.from(trozo) : trozo)
  }
  const raw = Buffer.concat(trozos).toString('utf8').trim()
  if (!raw) return undefined
  return JSON.parse(raw)
}

export default async function handler(req: Peticion, res: ServerResponse) {
  try {
    const body = req.method === 'POST' ? await leerCuerpo(req) : undefined
    const autorizacion = req.headers.authorization
    const respuesta = await atender(
      {
        method: req.method ?? 'GET',
        authorization: Array.isArray(autorizacion) ? autorizacion[0] : autorizacion,
        body,
      },
      { token: process.env.FINCA_MCP_TOKEN ?? '', foto: cargarFoto },
    )
    res.writeHead(respuesta.status, { ...CABECERAS_CORS, 'Content-Type': respuesta.contentType })
    res.end(respuesta.body)
  } catch {
    res.writeHead(400, { ...CABECERAS_CORS, 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'La petición no es JSON válido.' }))
  }
}
