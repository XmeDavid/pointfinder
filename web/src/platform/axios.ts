import axios from 'axios'
import { isNative } from './runtime'
import { platformFetch } from './http'

// Keep Axios response/error semantics for the existing operator API wrappers.
// Only the transport changes; native HTTP is never invoked by a browser build.
if (isNative()) {
  axios.defaults.adapter = 'fetch'
  axios.defaults.env = { ...axios.defaults.env, fetch: platformFetch }
}
export default axios
