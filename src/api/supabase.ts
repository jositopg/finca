import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Sin esto, un fetch() colgado en red móvil inestable no falla nunca: la
// promesa de guardar/cargar cualquier dato se queda esperando para siempre,
// y el botón que la disparó (p.ej. "Guardar cambios") se queda deshabilitado
// sin ningún error que capturar ni aviso que mostrar. Mismo problema y
// mismo arreglo que ya se aplicó a las llamadas a Drive (ver drive.ts).
function fetchConTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export const supabase = createClient(url, anonKey, {
  global: { fetch: fetchConTimeout },
})
