import { apiDelete, apiGet, apiPatch, apiPost, fetchConTimeout, getAccessToken } from './auth'

const BASE = 'https://www.googleapis.com/drive/v3'
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  webViewLink?: string
  thumbnailLink?: string
  createdTime?: string
}

// Los nombres de propiedad/archivo van directos a una query de Drive
// (name='...'); un apóstrofo sin escapar (habitual en nombres de calle,
// "O'Donnell") rompe la sintaxis de la query y la API responde 400 — hay
// que escapar backslash y comilla simple tal como pide la Drive API.
function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// When duplicates exist (e.g. created by different devices before this
// file was found), always resolve to the same one — the oldest — so every
// device converges on a single canonical file instead of picking whichever
// the Drive API happens to return first.
function oldest(files: DriveFile[]): DriveFile | null {
  if (files.length === 0) return null
  return [...files].sort((a, b) => (a.createdTime ?? '').localeCompare(b.createdTime ?? ''))[0]
}

// ─── Folders ──────────────────────────────────────────────────────────────────

export async function createFolder(
  name: string,
  parentId?: string,
): Promise<DriveFile> {
  return apiPost<DriveFile>(`${BASE}/files`, {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentId ? { parents: [parentId] } : {}),
  })
}

export async function findFolder(
  name: string,
  parentId?: string,
): Promise<DriveFile | null> {
  const escapedName = escapeDriveQueryValue(name)
  const q = parentId
    ? `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`

  const res = await apiGet<{ files: DriveFile[] }>(
    `${BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,createdTime)`,
  )

  return oldest(res.files)
}

export async function getOrCreateFolder(
  name: string,
  parentId?: string,
): Promise<DriveFile> {
  const existing = await findFolder(name, parentId)
  if (existing) return existing
  return createFolder(name, parentId)
}

export async function findFileInFolder(
  folderId: string,
  name: string,
): Promise<DriveFile | null> {
  const q = `name='${escapeDriveQueryValue(name)}' and '${folderId}' in parents and trashed=false`
  const res = await apiGet<{ files: DriveFile[] }>(
    `${BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,createdTime)`,
  )
  return oldest(res.files)
}

// ─── Files ────────────────────────────────────────────────────────────────────

// Trozos de 1 MiB (múltiplo de 256 KiB, como exige la API de Drive salvo en
// el último trozo): en una conexión móvil inestable, si un trozo falla solo
// hay que reintentar ese MB, no el archivo entero desde el principio.
const CHUNK_SIZE = 4 * 262144
const MAX_INTENTOS_POR_TRAMO = 6
const TIMEOUT_TRAMO_MS = 30000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function xhrPut(
  url: string,
  body: Blob | null,
  headers: Record<string, string>,
  onUploadProgress?: (loaded: number) => void,
): Promise<{ status: number; responseText: string; range: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.timeout = TIMEOUT_TRAMO_MS
    if (onUploadProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onUploadProgress(e.loaded)
      }
    }
    xhr.onload = () =>
      resolve({ status: xhr.status, responseText: xhr.responseText, range: xhr.getResponseHeader('Range') })
    xhr.onerror = () => reject(new Error('Upload network error'))
    xhr.ontimeout = () => reject(new Error('Upload timeout'))
    xhr.send(body)
  })
}

// Google responde 308 con la cabecera Range ("bytes=0-1048575") indicando
// hasta qué byte recibió realmente — necesario tras un error de red/timeout,
// porque el cliente no sabe si el tramo llegó a completarse en el servidor
// antes de que se cortara la respuesta.
async function consultarBytesRecibidos(uploadUrl: string, total: number): Promise<number> {
  const res = await xhrPut(uploadUrl, null, { 'Content-Range': `bytes */${total}` })
  if (res.status === 308) {
    const match = res.range ? /bytes=0-(\d+)/.exec(res.range) : null
    return match ? parseInt(match[1], 10) + 1 : 0
  }
  if (res.status >= 200 && res.status < 300) return total
  throw new Error(`No se pudo comprobar el progreso de la subida: ${res.status}`)
}

export async function uploadFile(
  file: File,
  folderId: string,
  onProgress?: (pct: number) => void,
): Promise<DriveFile> {
  const token = getAccessToken()
  if (!token) throw new Error('Sin token de acceso')

  // Initiate resumable upload
  const initRes = await fetchConTimeout(`${UPLOAD_BASE}/files?uploadType=resumable`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': file.type,
      'X-Upload-Content-Length': file.size.toString(),
    },
    body: JSON.stringify({
      name: file.name,
      parents: [folderId],
    }),
  })

  if (!initRes.ok) throw new Error(`Upload init failed: ${initRes.status}`)
  const uploadUrl = initRes.headers.get('Location')
  if (!uploadUrl) throw new Error('No upload URL')

  const total = file.size
  let offset = 0
  let intentos = 0

  while (true) {
    const fin = Math.min(offset + CHUNK_SIZE, total)
    try {
      const res = await xhrPut(
        uploadUrl,
        file.slice(offset, fin),
        { 'Content-Range': `bytes ${offset}-${fin - 1}/${total}` },
        (loaded) => onProgress?.(Math.round(((offset + loaded) / total) * 100)),
      )

      if (res.status === 200 || res.status === 201) {
        onProgress?.(100)
        return JSON.parse(res.responseText) as DriveFile
      }
      if (res.status === 308) {
        offset = fin
        intentos = 0
        continue
      }
      throw new Error(`Upload failed: ${res.status}`)
    } catch (err) {
      intentos++
      if (intentos > MAX_INTENTOS_POR_TRAMO) throw err
      await sleep(1000 * 2 ** (intentos - 1))
      try {
        offset = await consultarBytesRecibidos(uploadUrl, total)
      } catch {
        // Si ni siquiera se puede consultar el estado, se reintenta desde
        // el mismo punto — es la mejor estimación disponible.
      }
    }
  }
}

export async function getFile(fileId: string): Promise<DriveFile> {
  return apiGet<DriveFile>(
    `${BASE}/files/${fileId}?fields=id,name,mimeType,size,webViewLink,thumbnailLink,createdTime`,
  )
}

export async function listFiles(folderId: string): Promise<DriveFile[]> {
  const res = await apiGet<{ files: DriveFile[] }>(
    `${BASE}/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name,mimeType,size,webViewLink,thumbnailLink,createdTime)&orderBy=createdTime desc`,
  )
  return res.files
}

export async function deleteFile(fileId: string): Promise<void> {
  return apiDelete(`${BASE}/files/${fileId}`)
}

// Drive no tiene "mover": es quitar el padre actual y añadir el nuevo
// (`files.update` con addParents/removeParents). Se lee el padre actual en
// vivo en vez de que el llamante lo calcule — más robusto (cubre el caso de
// un archivo con más de un padre) y evita que un cálculo desincronizado dé
// un removeParents equivocado.
export async function moveFileToFolder(fileId: string, newParentId: string): Promise<void> {
  const file = await apiGet<{ parents?: string[] }>(`${BASE}/files/${fileId}?fields=parents`)
  const oldParents = file.parents ?? []
  if (oldParents.length === 1 && oldParents[0] === newParentId) return
  const params = new URLSearchParams({ addParents: newParentId })
  if (oldParents.length > 0) params.set('removeParents', oldParents.join(','))
  await apiPatch(`${BASE}/files/${fileId}?${params.toString()}`, {})
}

export function getFileIconUrl(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'doc'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'sheet'
  return 'file'
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
