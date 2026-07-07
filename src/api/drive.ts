import { apiDelete, apiGet, apiPost, getAccessToken } from './auth'

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
  const q = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`

  const res = await apiGet<{ files: DriveFile[] }>(
    `${BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)`,
  )

  return res.files[0] ?? null
}

export async function getOrCreateFolder(
  name: string,
  parentId?: string,
): Promise<DriveFile> {
  const existing = await findFolder(name, parentId)
  if (existing) return existing
  return createFolder(name, parentId)
}

// ─── Files ────────────────────────────────────────────────────────────────────

export async function uploadFile(
  file: File,
  folderId: string,
  onProgress?: (pct: number) => void,
): Promise<DriveFile> {
  const token = getAccessToken()
  if (!token) throw new Error('Sin token de acceso')

  // Initiate resumable upload
  const initRes = await fetch(`${UPLOAD_BASE}/files?uploadType=resumable`, {
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

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type)

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const result = JSON.parse(xhr.responseText) as DriveFile
        resolve(result)
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error('Upload network error'))
    xhr.send(file)
  })
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
