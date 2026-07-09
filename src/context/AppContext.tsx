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
  addIngresoExterno,
  addPropiedad,
  addTransaccion,
  deleteIngresoExterno,
  deletePropiedad,
  deleteTransaccion,
  getIngresosExternos,
  getPropiedades,
  getTransacciones,
  updateIngresoExterno,
  updatePropiedad,
  updateTransaccion,
} from '../api/db'
import { getOrCreateFolder } from '../api/drive'
import { useToast } from './ToastContext'
import { generarGastosPendientes, type IngresoExterno, type Propiedad, type Transaccion } from '../types'

type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

const ROOT_FOLDER_NAME = 'Finca — Gestión de Propiedades'
const CACHE_KEY = 'finca_cache_v1'

interface Cache {
  propiedades: Propiedad[]
  transacciones: Transaccion[]
  ingresosExternos: IngresoExterno[]
  cachedAt: string
}

function saveCache(cache: Omit<Cache, 'cachedAt'>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, cachedAt: new Date().toISOString() }))
  } catch {
    // localStorage lleno o no disponible — no es crítico
  }
}

function loadCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Cache) : null
  } catch {
    return null
  }
}

interface AppContextValue {
  authState: AuthState
  driveReady: boolean
  propiedades: Propiedad[]
  transacciones: Transaccion[]
  ingresosExternos: IngresoExterno[]
  isLoadingData: boolean
  usingCache: boolean
  cacheDate: string | null
  login: () => void
  logout: () => void
  refreshData: () => Promise<void>
  addProp: (p: Propiedad) => Promise<void>
  updateProp: (p: Propiedad) => Promise<void>
  deleteProp: (id: string) => Promise<void>
  addTx: (t: Transaccion) => Promise<void>
  updateTx: (t: Transaccion) => Promise<void>
  deleteTx: (id: string) => Promise<void>
  addIngreso: (i: IngresoExterno) => Promise<void>
  updateIngreso: (i: IngresoExterno) => Promise<void>
  deleteIngreso: (id: string) => Promise<void>
  ensureDriveAccess: () => Promise<void>
  ensurePropFolder: (propiedadId: string, nombre: string) => Promise<string>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast()
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [transacciones, setTransacciones] = useState<Transaccion[]>([])
  const [ingresosExternos, setIngresosExternos] = useState<IngresoExterno[]>([])
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [usingCache, setUsingCache] = useState(false)
  const [cacheDate, setCacheDate] = useState<string | null>(null)
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

  const loadData = useCallback(async () => {
    setIsLoadingData(true)
    try {
      const [props, txs, ingresos] = await Promise.all([
        getPropiedades(),
        getTransacciones(),
        getIngresosExternos(),
      ])

      let txsFinal = txs
      try {
        const pendientes = generarGastosPendientes(props, txs)
        if (pendientes.length > 0) {
          await Promise.all(pendientes.map((t) => addTransaccion(t)))
          txsFinal = [...txs, ...pendientes]
          showToast(
            pendientes.length === 1
              ? 'Se ha añadido 1 gasto fijo automáticamente'
              : `Se han añadido ${pendientes.length} gastos fijos automáticamente`,
            'success',
          )
        }
      } catch (genErr) {
        console.error('Generar gastos recurrentes error', genErr)
      }

      setPropiedades(props)
      setTransacciones(txsFinal)
      setIngresosExternos(ingresos)
      setUsingCache(false)
      setCacheDate(null)
      saveCache({ propiedades: props, transacciones: txsFinal, ingresosExternos: ingresos })
    } catch (err) {
      console.error('Load data error', err)
      const cached = loadCache()
      if (cached) {
        setPropiedades(cached.propiedades)
        setTransacciones(cached.transacciones)
        setIngresosExternos(cached.ingresosExternos)
        setUsingCache(true)
        setCacheDate(cached.cachedAt)
        showToast('Sin conexión — mostrando los últimos datos guardados')
      } else {
        showToast('No se pudo conectar y no hay datos guardados en este dispositivo')
      }
    } finally {
      setIsLoadingData(false)
    }
  }, [showToast])

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
        setIngresosExternos([])
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [loadData])

  const refreshData = useCallback(async () => {
    await loadData()
  }, [loadData])

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
  }, [authState, loadData])

  const login = useCallback(() => {
    signInWithGoogleSupabase().catch((err) => {
      console.error('Login error', err)
      showToast('No se pudo iniciar sesión. Inténtalo de nuevo.')
    })
  }, [showToast])

  const logout = useCallback(() => {
    signOutSupabase().catch((err) => {
      console.error('Logout error', err)
      showToast('No se pudo cerrar sesión.')
    })
  }, [showToast])

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

  const addProp = useCallback(
    async (p: Propiedad) => {
      try {
        await addPropiedad(p)
        setPropiedades((prev) => [...prev, p])
      } catch (err) {
        showToast('No se pudo guardar la propiedad')
        throw err
      }
    },
    [showToast],
  )

  const updateProp = useCallback(
    async (p: Propiedad) => {
      try {
        await updatePropiedad(p)
        setPropiedades((prev) => prev.map((x) => (x.id === p.id ? p : x)))
      } catch (err) {
        showToast('No se pudieron guardar los cambios')
        throw err
      }
    },
    [showToast],
  )

  const deleteProp = useCallback(
    async (id: string) => {
      try {
        await deletePropiedad(id)
        setPropiedades((prev) => prev.filter((x) => x.id !== id))
        setTransacciones((prev) => prev.filter((t) => t.propiedadId !== id))
      } catch (err) {
        showToast('No se pudo eliminar la propiedad')
        throw err
      }
    },
    [showToast],
  )

  const addTx = useCallback(
    async (t: Transaccion) => {
      try {
        await addTransaccion(t)
        setTransacciones((prev) => [t, ...prev])
      } catch (err) {
        showToast('No se pudo guardar el movimiento')
        throw err
      }
    },
    [showToast],
  )

  const updateTx = useCallback(
    async (t: Transaccion) => {
      try {
        await updateTransaccion(t)
        setTransacciones((prev) => prev.map((x) => (x.id === t.id ? t : x)))
      } catch (err) {
        showToast('No se pudieron guardar los cambios')
        throw err
      }
    },
    [showToast],
  )

  const deleteTx = useCallback(
    async (id: string) => {
      try {
        await deleteTransaccion(id)
        setTransacciones((prev) => prev.filter((x) => x.id !== id))
      } catch (err) {
        showToast('No se pudo eliminar el movimiento')
        throw err
      }
    },
    [showToast],
  )

  const addIngreso = useCallback(
    async (i: IngresoExterno) => {
      try {
        await addIngresoExterno(i)
        setIngresosExternos((prev) => [...prev, i])
      } catch (err) {
        showToast('No se pudo guardar el ingreso')
        throw err
      }
    },
    [showToast],
  )

  const updateIngreso = useCallback(
    async (i: IngresoExterno) => {
      try {
        await updateIngresoExterno(i)
        setIngresosExternos((prev) => prev.map((x) => (x.id === i.id ? i : x)))
      } catch (err) {
        showToast('No se pudieron guardar los cambios')
        throw err
      }
    },
    [showToast],
  )

  const deleteIngreso = useCallback(
    async (id: string) => {
      try {
        await deleteIngresoExterno(id)
        setIngresosExternos((prev) => prev.filter((x) => x.id !== id))
      } catch (err) {
        showToast('No se pudo eliminar el ingreso')
        throw err
      }
    },
    [showToast],
  )

  const ensurePropFolder = useCallback(
    async (propiedadId: string, nombre: string): Promise<string> => {
      const propiedad = propiedades.find((p) => p.id === propiedadId)
      if (propiedad?.folderId) return propiedad.folderId

      try {
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
      } catch (err) {
        showToast('No se pudo acceder a Google Drive')
        throw err
      }
    },
    [propiedades, ensureDriveAccess, showToast],
  )

  return (
    <AppContext.Provider
      value={{
        authState,
        driveReady,
        propiedades,
        transacciones,
        ingresosExternos,
        isLoadingData,
        usingCache,
        cacheDate,
        login,
        logout,
        refreshData,
        addProp,
        updateProp,
        deleteProp,
        addTx,
        updateTx,
        deleteTx,
        addIngreso,
        updateIngreso,
        deleteIngreso,
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
