import { useEffect, useState } from 'react'

/**
 * Devuelve `true` mientras la media query CSS dada haga match con el viewport.
 * Se re-renderiza al cruzar el breakpoint (listener sobre `matchMedia`).
 *
 * A prueba de entornos sin `window` (tests en node, SSR): en ese caso devuelve
 * `false` y nunca registra listeners.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * `true` en pantallas de escritorio (≥1024px, el breakpoint `lg` de Tailwind).
 * Solo debe usarse para decisiones de layout que no se pueden resolver con
 * clases responsive de Tailwind (p.ej. renderizar dos paneles a la vez en el
 * master-detail de Propiedades). Para todo lo demás, usar `lg:` en el JSX.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
