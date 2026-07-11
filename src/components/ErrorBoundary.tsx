import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Red de seguridad ante cualquier excepción de render no prevista (dato
// malformado, campo inesperado) — sin esto, React desmonta toda la app y
// deja la pantalla en blanco sin ningún mensaje ni forma de recuperarse
// salvo recargar a ciegas.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no capturado en la app', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-error-container flex items-center justify-center">
          <AlertTriangle size={24} className="text-error" />
        </div>
        <div>
          <p className="text-sm font-medium text-on-surface">Ha ocurrido un error inesperado</p>
          <p className="text-xs text-outline-variant mt-1">
            Tus datos están a salvo en Supabase — recarga la app para seguir.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Recargar</Button>
      </div>
    )
  }
}
