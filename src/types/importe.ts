// Parsea un importe tecleado en formato español: admite "1.200,50" (miles +
// decimal), "1200,50", "1200.50" y "1200". Sin coma, un único punto seguido
// de exactamente 3 dígitos se interpreta como separador de miles ("1.200" ->
// 1200), no como decimal — es como se teclea normalmente en España sin
// decimales. Devuelve NaN si el texto no es un número válido (usar
// Number.isNaN en el llamante), en vez de deducir un 0 en silencio.
export function parseImporte(raw: string): number {
  // Valores de catastro/tasación suelen copiarse tal cual del documento
  // oficial, con el símbolo del euro pegado (p.ej. "128.061,67 €") — sin
  // esto, ese símbolo hacía que Number(...) devolviera NaN y bloqueara el
  // guardado sin ningún indicio de por qué.
  const s = raw.trim().replace(/€/g, '').trim()
  if (!s) return NaN
  if (s.includes(',')) {
    return Number(s.replace(/\./g, '').replace(',', '.'))
  }
  const puntos = s.split('.').length - 1
  if (puntos === 1) {
    const dec = s.split('.')[1]
    if (dec.length === 3) return Number(s.replace('.', ''))
    return Number(s)
  }
  if (puntos > 1) {
    return Number(s.replace(/\./g, ''))
  }
  return Number(s)
}
