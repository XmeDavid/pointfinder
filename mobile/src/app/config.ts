/** Build-time configuration. Override with a `.env.local` (VITE_API_URL=http://192.168.0.10:8080) for a local backend. */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'https://pointfinder.pt'
