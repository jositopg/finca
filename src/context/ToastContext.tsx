import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface ToastMsg {
  id: string
  message: string
  type: 'error' | 'success'
}

interface ToastContextValue {
  showToast: (message: string, type?: 'error' | 'success') => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([])

  const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-[440px] px-4 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-xl shadow-card text-sm font-medium text-center ${
              t.type === 'error' ? 'bg-error-container text-error' : 'bg-success-container text-success'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
