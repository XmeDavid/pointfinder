export interface PickMediaOptions {
  source: 'camera' | 'library'
  kind?: 'image' | 'video'
  multiple?: boolean
  signal?: AbortSignal
}

let picking = false

/** Call synchronously from a click. Wry/WKWebView use their native chooser. */
export function pickMedia(options: PickMediaOptions): Promise<File[]> {
  if (options.signal?.aborted) return Promise.resolve([])
  if (picking) return Promise.reject(Object.assign(new Error('A media picker is already open'), { code: 'busy' }))
  picking = true
  return new Promise((resolve, reject) => {
    let settled = false
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = options.kind === 'video' ? 'video/*' : 'image/*'
    input.multiple = options.source === 'library' && Boolean(options.multiple)
    if (options.source === 'camera') input.setAttribute('capture', 'environment')
    input.hidden = true
    const cleanup = () => {
      picking = false
      options.signal?.removeEventListener('abort', cancel)
      input.remove()
    }
    const finish = (files: File[]) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(files)
    }
    const cancel = () => finish([])
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])), { once: true })
    input.addEventListener('cancel', cancel, { once: true })
    options.signal?.addEventListener('abort', cancel, { once: true })
    document.body.append(input)
    try { input.click() } catch (error) { settled = true; cleanup(); reject(error) }
  })
}
