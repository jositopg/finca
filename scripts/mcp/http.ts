import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { atender, CABECERAS_CORS } from './atender.ts'
import { cargarEnv } from './env.ts'
import { cargarFoto } from './foto.ts'

function leerCuerpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const trozos: Buffer[] = []
    req.on('data', (trozo: Buffer) => trozos.push(trozo))
    req.on('end', () => {
      const raw = Buffer.concat(trozos).toString('utf8').trim()
      if (!raw) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('JSON'))
      }
    })
    req.on('error', reject)
  })
}

export function crearServidorHttp(token: string) {
  return createServer(async (req, res) => {
    try {
      const body = req.method === 'POST' ? await leerCuerpo(req) : undefined
      const respuesta = await atender(
        {
          method: req.method ?? 'GET',
          authorization: req.headers.authorization,
          body,
        },
        { token, foto: cargarFoto },
      )
      enviar(res, respuesta.status, respuesta.contentType, respuesta.body)
    } catch {
      enviar(res, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'La petición no es JSON válido.' }))
    }
  })
}

function enviar(res: ServerResponse, status: number, contentType: string, body: string) {
  res.writeHead(status, { ...CABECERAS_CORS, 'Content-Type': contentType })
  res.end(body)
}

const enMarcha = process.argv[1]?.endsWith('http.ts')
if (enMarcha) {
  cargarEnv()
  const token = process.env.FINCA_MCP_TOKEN ?? ''
  if (!token) {
    console.error('Falta FINCA_MCP_TOKEN en ~/.finca-db.env')
    process.exit(1)
  }
  const puerto = Number(process.env.FINCA_MCP_PORT ?? 8787)
  crearServidorHttp(token).listen(puerto, '127.0.0.1', () => {
    console.error(`Finca MCP en http://127.0.0.1:${puerto}`)
  })
}
