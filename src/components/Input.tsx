import { type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  children: React.ReactNode
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
}

// text-base (16px) evita que iOS Safari haga zoom automático al enfocar un
// campo — con menos de 16px, el navegador amplía la página y luego no
// siempre vuelve a encuadrar bien los elementos fijos (la barra inferior).
const base =
  'w-full bg-surface-low border-0 rounded-xl px-4 py-3 text-base text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow'

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-outline-variant uppercase tracking-wide">
        {label}
      </label>
      <input className={`${base} ${className}`} {...props} />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}

export function Select({ label, error, children, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-outline-variant uppercase tracking-wide">
        {label}
      </label>
      <select className={`${base} ${className}`} {...props}>
        {children}
      </select>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}

export function Textarea({ label, error, className = '', ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-outline-variant uppercase tracking-wide">
        {label}
      </label>
      <textarea
        className={`${base} resize-none ${className}`}
        rows={3}
        {...props}
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
