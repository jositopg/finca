// Una subida larga en móvil se puede cortar sin ningún error si la pantalla
// se apaga o el usuario cambia de app: el sistema puede descartar la
// pestaña/PWA entera para liberar memoria, y al volver la app arranca de
// cero sin ningún aviso — parece que "la carga se quita sola". Pedir la
// pantalla encendida mientras dura la subida evita ese caso concreto.
// No soportado en todos los navegadores (y puede denegarse) — si falla, la
// subida sigue igual, solo queda expuesta a que la pantalla se apague.
let sentinel: WakeLockSentinel | null = null

export async function keepScreenAwake(): Promise<void> {
  try {
    sentinel = (await navigator.wakeLock?.request('screen')) ?? null
  } catch {
    sentinel = null
  }
}

export function releaseScreenWakeLock(): void {
  sentinel?.release().catch(() => {})
  sentinel = null
}
