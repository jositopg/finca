import { BarChart2, Building2, LayoutDashboard, Landmark, Receipt } from 'lucide-react'

export type View = 'dashboard' | 'propiedades' | 'transacciones' | 'estadisticas' | 'fiscal'

interface Props {
  current: View
  onChange: (v: View) => void
}

export const NAV_ITEMS: { id: View; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Inicio', Icon: LayoutDashboard },
  { id: 'propiedades', label: 'Propiedades', Icon: Building2 },
  { id: 'transacciones', label: 'Movimientos', Icon: Receipt },
  { id: 'estadisticas', label: 'Estadísticas', Icon: BarChart2 },
  { id: 'fiscal', label: 'Fiscal', Icon: Landmark },
]

/** Barra de navegación inferior — solo móvil/tablet. En escritorio (≥lg) la
 *  navegación vive en `TopBar` y esta barra se oculta. */
export function Nav({ current, onChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-surface-lowest border-t border-surface-high px-2 pb-safe z-40 lg:hidden">
      <div className="flex">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = current === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                active ? 'text-primary' : 'text-outline-variant'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
              <span className={`text-[10px] font-medium ${active ? 'text-primary' : ''}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
