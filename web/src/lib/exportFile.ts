import { shareFile } from '@/platform/share'
import { useToastStore } from '@/hooks/useToast'
import i18n from '@/i18n'

/** All product exports use a native share sheet or a browser download. */
export async function exportFile(blob: Blob, filename: string): Promise<void> {
  try { await shareFile(new File([blob], filename, { type: blob.type || 'application/octet-stream' })) }
  catch { useToastStore.getState().addToast(i18n.t('common.error'), 'error') }
}
