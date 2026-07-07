import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getAccessToken,
  getCurrentEmail,
  initTokenClient,
  onAuthStateChange,
  requestToken,
  signInWithGoogleSupabase,
  signOutSupabase,
} from '../api/auth'
import {
  addPropiedad,
  addTransaccion,
  deletePropiedad,
  deleteTransaccion,
  getPropiedades,
  getTransacciones,
  updatePropiedad,
  updateTransaccion,
} from '../api/db'
import { getOrCreateFolder } from '../api/drive'
import type { Propiedad, Transaccion } from '../types'

type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

const ROOT_FOLDER_NAME = 'Finca — Gestión de Propiedades'

interface AppContextValue {
  authState: AuthState
  driveReady: boolean
  propiedades: Propiedad[]
  transacciones: Transaccion[]
  isLoadingData: boolean
  login: () => void
  logout: () => void
  refreshData: () => Promise<void>
  addProp: (p: Propiedad) => Promise<void>
  updateProp: (p: Propiedad) => Promise<void>
  deleteProp: (id: string) => Promise<void>
  addTx: (t: Transaccion) => Promise<void>
  updateTx: (t: Transaccion) => Promise<void>
  deleteTx: (id: string) => Promise<void>
  ensureDriveAccess: () => Promise<void>
  ensurePropFolder: (propiedadId: string, nombre: string) => Promise<string>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [transacciones, setTransacciones] = useState<Transaccion[]>([])
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [driveReady, setDriveReady] = useState(false)
  const gisReady = useRef(false)
  const rootFolderId = useRef<string | null>(null)
  const driveWaiters = useRef<{ resolve: () => void; reject: (e: unknown) => void }[]>([])

  const initGIS = useCallback(() => {
    initTokenClient(
      () => {
        setDriveReady(true)
        driveWaiters.current.forEach((w) => w.resolve())
        driveWaiters.current = []
      },
      (err) => {
        driveWaiters.current.forEach((w) => w.reject(err))
        driveWaiters.current = []
      },
    )
    gisReady.current = true
  }, [])

  useEffect(() => {
    const checkGIS = () => {
      if (window.google?.accounts?.oauth2) {
        initGIS()
      } else {
        setTimeout(checkGIS, 100)
      }
    }
    checkGIS()
  }, [initGIS])

  async function loadData() {
    setIsLoadingData(true)
    try {
      const [props, txs] = await Promise.all([getPropiedades(), getTransacciones()])
      setPropiedades(props)
      setTransacciones(txs)
    } catch (err) {
      console.error('Load data error', err)
    } finally {
      setIsLoadingData(false)
    }
  }

  useEffect(() => {
    let mounted = true

    getCurrentEmail().then((email) => {
      if (!mounted) return
      if (email) {
        setAuthState('authenticated')
        loadData()
      } else {
        setAuthState('unauthenticated')
      }
    })

    const unsubscribe = onAuthStateChange((email) => {
      if (!mounted) return
      if (email) {
        setAuthState('authenticated')
        loadData()
      } else {
        setAuthState('unauthenticated')
        setPropiedades([])
        setTransacciones([])
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const refreshData = useCallback(async () => {
    await loadData()
  }, [])

  // Re-fetch al volver a primer plano, para que los cambios hechos en otro
  // dispositivo (o pestaña) aparezcan sin refresco manual.
  useEffect(() => {
    if (authState !== 'authenticated') return
    function handleVisibility() {
      if (document.visibilityState === 'visible') loadData()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [authState])

  const login = useCallback(() => {
    signInWithGoogleSupabase().catch((err) => console.error('Login error', err))
  }, [])

  const logout = useCallback(() => {
    signOutSupabase().catch((err) => console.error('Logout error', err))
  }, [])

  // Pide el token de Drive/Sheets solo la primera vez que hace falta
  // (adjuntar un archivo o exportar a Sheets), no en el login.
  const ensureDriveAccess = useCallback((): Promise<void> => {
    if (getAccessToken()) {
      setDriveReady(true)
      return Promise.resolve()
    }
    if (!gisReady.current) {
      return Promise.reject(new Error('Google Identity Services no está listo todavía'))
    }
    return new Promise((resolve, reject) => {
      driveWaiters.current.push({ resolve, reject })
      requestToken()
    })
  }, [])

  const addProp = useCallback(async (p: Propiedad) => {
    await addPropiedad(p)
    setPropiedades((prev) => [...prev, p])
  }, [])

  const updateProp = useCallback(async (p: Propiedad) => {
    await updatePropiedad(p)
    setPropiedades((prev) => prev.map((x) => (x.id === p.id ? p : x)))
  }, [])

  const deleteProp = useCallback(async (id: string) => {
    await deletePropiedad(id)
    setPropiedades((prev) => prev.filter((x) => x.id !== id))
    setTransacciones((prev) => prev.filter((t) => t.propiedadId !== id))
  }, [])

  const addTx = useCallback(async (t: Transaccion) => {
    await addTransaccion(t)
    setTransacciones((prev) => [t, ...prev])
  }, [])

  const updateTx = useCallback(async (t: Transaccion) => {
    await updateTransaccion(t)
    setTransacciones((prev) => prev.map((x) => (x.id === t.id ? t : x)))
  }, [])

  const deleteTx = useCallback(async (id: string) => {
    await deleteTransaccion(id)
    setTransacciones((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const ensurePropFolder = useCallback(
    async (propiedadId: string, nombre: string): Promise<string> => {
      const propiedad = propiedades.find((p) => p.id === propiedadId)
      if (propiedad?.folderId) return propiedad.folderId

      await ensureDriveAccess()
      if (!rootFolderId.current) {
        const root = await getOrCreateFolder(ROOT_FOLDER_NAME)
        rootFolderId.current = root.id
      }
      const folder = await getOrCreateFolder(nombre, rootFolderId.current)
      const updated = { ...propiedad!, folderId: folder.id }
      await updatePropiedad(updated)
      setPropiedades((prev) => prev.map((p) => (p.id === propiedadId ? updated : p)))
      return folder.id
    },
    [propiedades, ensureDriveAccess],
  )

  return (
    <AppContext.Provider
      value={{
        authState,
        driveReady,
        propiedades,
        transacciones,
        isLoadingData,
        login,
        logout,
        refreshData,
        addProp,
        updateProp,
        deleteProp,
        addTx,
        updateTx,
        deleteTx,
        ensureDriveAccess,
        ensurePropFolder,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
