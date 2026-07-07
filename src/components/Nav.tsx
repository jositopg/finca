import { Building2, LayoutDashboard, Receipt } from 'lucide-react'

export type View = 'dashboard' | 'propiedades' | 'transacciones'

interface Props {
  current: View
  onChange: (v: View) => void
}

const items: { id: View; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Inicio', Icon: LayoutDashboard },
  { id: 'propiedades', label: 'Propiedades', Icon: Building2 },
  { id: 'transacciones', label: 'Movimientos', Icon: Receipt },
]

export function Nav({ current, onChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-surface-lowest border-t border-surface-high px-2 pb-safe z-40">
      <div className="flex">
        {items.map(({ id, label, Icon }) => {
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
