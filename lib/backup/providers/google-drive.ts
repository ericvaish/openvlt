import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "@/lib/constants"
import type { CloudStorageProvider } from "@/types"

const SCOPES = "https://www.googleapis.com/auth/drive.file"
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const API_BASE = "https://www.googleapis.com/drive/v3"
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3"

export class GoogleDriveProvider implements CloudStorageProvider {
  getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
    })
    return `${AUTH_URL}?${params.toString()}`
  }

  async exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<{
    accessToken: string
    refreshToken: string
    expiresAt: string
  }> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Google token exchange failed: ${body}`)
    }

    const data = (await res.json()) as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(
        Date.now() + data.expires_in * 1000
      ).toISOString(),
    }
  }

  async refreshToken(
    refreshTokenValue: string
  ): Promise<{ accessToken: string; expiresAt: string }> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshTokenValue,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Google token refresh failed: ${body}`)
    }

    const data = (await res.json()) as {
      access_token: string
      expires_in: number
    }

    return {
      accessToken: data.access_token,
      expiresAt: new Date(
        Date.now() + data.expires_in * 1000
      ).toISOString(),
    }
  }

  async uploadFile(
    accessToken: string,
    folderId: string,
    name: string,
    data: Buffer,
    mimeType: string = "application/octet-stream"
  ): Promise<{ fileId: string }> {
    // Use multipart upload for files under 5MB, resumable for larger
    const metadata = JSON.stringify({
      name,
      parents: [folderId],
    })

    const boundary = "openvlt_boundary_" + Date.now()
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
      ),
      data,
      Buffer.from(`\r\n--${boundary}--`),
    ])

    const res = await fetch(
      `${UPLOAD_BASE}/files?uploadType=multipart`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: new Uint8Array(body),
      }
    )

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Google Drive upload failed: ${errBody}`)
    }

    const result = (await res.json()) as { id: string }
    return { fileId: result.id }
  }

  async updateFile(
    accessToken: string,
    fileId: string,
    data: Buffer
  ): Promise<void> {
    const res = await fetch(
      `${UPLOAD_BASE}/files/${fileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(data),
      }
    )

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Google Drive update failed: ${errBody}`)
    }
  }

  async downloadFile(accessToken: string, fileId: string): Promise<Buffer> {
    const res = await fetch(
      `${API_BASE}/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Google Drive download failed: ${errBody}`)
    }

    return Buffer.from(await res.arrayBuffer())
  }

  async deleteFile(accessToken: string, fileId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok && res.status !== 404) {
      const errBody = await res.text()
      throw new Error(`Google Drive delete failed: ${errBody}`)
    }
  }

  async createFolder(
    accessToken: string,
    parentId: string,
    name: string
  ): Promise<{ folderId: string }> {
    const res = await fetch(`${API_BASE}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Google Drive create folder failed: ${errBody}`)
    }

    const result = (await res.json()) as { id: string }
    return { folderId: result.id }
  }

  async listFolder(
    accessToken: string,
    folderId: string
  ): Promise<{ id: string; name: string; mimeType: string }[]> {
    const items: { id: string; name: string; mimeType: string }[] = []
    let pageToken: string | undefined

    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType)",
        pageSize: "1000",
      })
      if (pageToken) params.set("pageToken", pageToken)

      const res = await fetch(`${API_BASE}/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`Google Drive list failed: ${errBody}`)
      }

      const data = (await res.json()) as {
        files: { id: string; name: string; mimeType: string }[]
        nextPageToken?: string
      }

      items.push(...data.files)
      pageToken = data.nextPageToken
    } while (pageToken)

    return items
  }

  async getStorageQuota(
    accessToken: string
  ): Promise<{ used: number; total: number }> {
    const res = await fetch(
      `${API_BASE}/about?fields=storageQuota`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Google Drive quota check failed: ${errBody}`)
    }

    const data = (await res.json()) as {
      storageQuota: { usage: string; limit: string }
    }

    return {
      used: parseInt(data.storageQuota.usage, 10),
      total: parseInt(data.storageQuota.limit, 10),
    }
  }
}
