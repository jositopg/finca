import { type ButtonHTMLAttributes, type ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  children: ReactNode
}

const variants = {
  primary: 'bg-primary text-on-primary hover:bg-primary-dim active:bg-primary-dim',
  secondary: 'bg-primary-container text-primary hover:bg-primary-container/80',
  ghost: 'bg-transparent text-on-surface hover:bg-surface-low',
  danger: 'bg-error-container text-error hover:bg-error-container/80',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-5 py-3 text-base rounded-xl',
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}: Props) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 font-medium font-sans
        transition-colors duration-150 select-none
        disabled:opacity-50 disabled:pointer-events-none
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
