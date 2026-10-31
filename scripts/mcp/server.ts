import readline from 'node:readline'
import { aplicarEscritura } from './aplicar.ts'
import { cargarFoto } from './foto.ts'
import { responder } from './protocolo.ts'

const entrada = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

function enviar(mensaje: unknown) {
  process.stdout.write(`${JSON.stringify(mensaje)}\n`)
}

function mensajeSeguro(err: unknown): string {
  const texto = err instanceof Error ? err.message : 'Error'
  return texto.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://…').replace(/[\w.-]*supabase\.co/gi, '…')
}

entrada.on('line', (linea) => {
  const recorte = linea.trim()
  if (!recorte) return
  let mensaje: unknown
  try {
    mensaje = JSON.parse(recorte)
  } catch {
    enviar({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }
  void responder(mensaje, {
    foto: cargarFoto,
    escribir: async (nombre, args) => aplicarEscritura(nombre, args, { foto: await cargarFoto() }),
  })
    .then((respuesta) => {
      if (respuesta) enviar(respuesta)
    })
    .catch((err) => {
      console.error(mensajeSeguro(err))
      const id = mensaje && typeof mensaje === 'object' && 'id' in mensaje ? mensaje.id : null
      if (id !== undefined && id !== null) {
        enviar({ jsonrpc: '2.0', id, error: { code: -32603, message: mensajeSeguro(err) } })
      }
    })
})
