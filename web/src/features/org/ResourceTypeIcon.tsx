import { File, FileText, Film, Image as ImageIcon, Music } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Resource } from '@/types/resource'

/** A resource's kind at a glance, from the platform icon set; decorative next to its name. */
export function ResourceTypeIcon({ resource, className }: { resource: Pick<Resource, 'type' | 'contentType'>; className?: string }) {
  const classes = cn('h-4 w-4 shrink-0', className)
  if (resource.type === 'document') return <FileText className={cn(classes, 'text-info')} aria-hidden />
  const type = resource.contentType
  if (type.startsWith('image/')) return <ImageIcon className={cn(classes, 'text-muted-foreground')} aria-hidden />
  if (type.startsWith('audio/')) return <Music className={cn(classes, 'text-muted-foreground')} aria-hidden />
  if (type.startsWith('video/')) return <Film className={cn(classes, 'text-muted-foreground')} aria-hidden />
  if (type.includes('pdf')) return <FileText className={cn(classes, 'text-muted-foreground')} aria-hidden />
  return <File className={cn(classes, 'text-muted-foreground')} aria-hidden />
}
