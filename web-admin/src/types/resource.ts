export interface Resource {
  id: string
  orgId: string | null
  gameId: string | null
  folderId: string | null
  type: 'file' | 'document'
  name: string
  contentType: string
  content: string | null
  sizeBytes: number
  sharedWithPlayers: boolean
  downloadUrl: string | null
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

export interface ResourceFolder {
  id: string
  orgId: string | null
  gameId: string | null
  parentId: string | null
  name: string
  createdAt: string
}
