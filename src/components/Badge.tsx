interface Props {
  label: string
  variant?: 'default' | 'success' | 'warning' | 'error' | 'outline'
}

const variants = {
  default: 'bg-surface-high text-on-surface',
  success: 'bg-success-container text-success',
  warning: 'bg-warning-container text-warning',
  error: 'bg-error-container text-error',
  outline: 'border border-outline-variant text-outline-variant bg-transparent',
}

export function Badge({ label, variant = 'default' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}
    >
      {label}
    </span>
  )
}
