import { ApiError } from './errors'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  /** JSON body. Ignored when `form` is set. */
  body?: unknown
  /** Multipart body. Sent as-is; the browser sets the boundary. */
  form?: FormData
  /** Raw body with an explicit content type, e.g. an upload chunk. */
  raw?: { data: BodyInit; contentType: string }
  query?: Record<string, string | number | boolean | undefined | null>
  headers?: Record<string, string>
  signal?: AbortSignal
  timeoutMs?: number
  /** Skip the Authorization header even if a token is available. */
  anonymous?: boolean
}

export interface HttpClientOptions {
  /** Origin plus optional prefix, e.g. "https://pointfinder.pt". Paths are appended verbatim. */
  baseUrl: string
  fetch?: typeof fetch
  /** Returns the bearer token to attach, or null for no header. */
  getToken?: () => Promise<string | null>
  /**
   * Called once when a request comes back 401. Return true to retry the
   * request once with a fresh token (the session presumably refreshed).
   */
  onUnauthorized?: (error: ApiError) => Promise<boolean>
  defaultTimeoutMs?: number
}

/**
 * Small fetch wrapper: base URL, bearer auth, JSON in and out, timeouts,
 * and one consistent error type. No retries beyond the single 401 retry;
 * retry policy belongs to the caller, which knows whether the call is safe.
 */
export class HttpClient {
  private readonly fetchImpl: typeof fetch
  readonly baseUrl: string

  constructor(private readonly options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  get<T>(path: string, o?: RequestOptions) {
    return this.request<T>('GET', path, o)
  }
  post<T>(path: string, body?: unknown, o?: RequestOptions) {
    return this.request<T>('POST', path, { ...o, body })
  }
  put<T>(path: string, body?: unknown, o?: RequestOptions) {
    return this.request<T>('PUT', path, { ...o, body })
  }
  patch<T>(path: string, body?: unknown, o?: RequestOptions) {
    return this.request<T>('PATCH', path, { ...o, body })
  }
  delete<T = void>(path: string, o?: RequestOptions) {
    return this.request<T>('DELETE', path, o)
  }

  async request<T>(method: HttpMethod, path: string, o: RequestOptions = {}, retried = false): Promise<T> {
    const url = this.buildUrl(path, o.query)
    const headers: Record<string, string> = { Accept: 'application/json', ...(o.headers ?? {}) }
    let body: BodyInit | undefined
    if (o.form) {
      body = o.form
    } else if (o.raw) {
      body = o.raw.data
      headers['Content-Type'] = o.raw.contentType
    } else if (o.body !== undefined) {
      body = JSON.stringify(o.body)
      headers['Content-Type'] = 'application/json'
    }
    if (!o.anonymous && this.options.getToken) {
      const token = await this.options.getToken()
      if (token) headers.Authorization = `Bearer ${token}`
    }

    const controller = new AbortController()
    const timeoutMs = o.timeoutMs ?? this.options.defaultTimeoutMs ?? 20_000
    const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs)
    const onOuterAbort = () => controller.abort(o.signal?.reason)
    o.signal?.addEventListener('abort', onOuterAbort, { once: true })

    let response: Response
    try {
      response = await this.fetchImpl(url, { method, headers, body, signal: controller.signal })
    } catch (cause) {
      clearTimeout(timer)
      if (controller.signal.aborted) {
        const reason = controller.signal.reason
        if (reason instanceof DOMException && reason.name === 'TimeoutError') throw ApiError.timeout()
        throw ApiError.aborted()
      }
      throw ApiError.network(cause)
    } finally {
      clearTimeout(timer)
      o.signal?.removeEventListener('abort', onOuterAbort)
    }

    if (response.status === 401 && !retried && !o.anonymous && this.options.onUnauthorized) {
      const err = ApiError.fromResponse(401, await safeJson(response))
      const retry = await this.options.onUnauthorized(err)
      if (retry) return this.request<T>(method, path, o, true)
      throw err
    }

    if (!response.ok) {
      throw ApiError.fromResponse(response.status, await safeJson(response))
    }
    if (response.status === 204) return undefined as T
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) {
      const text = await response.text()
      return (text === '' ? undefined : text) as T
    }
    try {
      return (await response.json()) as T
    } catch (cause) {
      throw new ApiError({ status: response.status, message: 'Invalid JSON in response', code: 'INVALID_RESPONSE', cause })
    }
  }

  buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(path.startsWith('/') ? this.baseUrl + path : `${this.baseUrl}/${path}`)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue
        url.searchParams.set(k, String(v))
      }
    }
    return url.toString()
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text()
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}
