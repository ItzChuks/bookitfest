// Frontend settings. Edit this file only.
// Money is stored in USD on the server and converted for display.

// Where your PocketBase server lives.
//  - Local (Live Server): PocketBase running on this machine.
//  - Production (Vercel): your hosted PocketBase URL (Vercel can't run PocketBase itself).
const LOCAL_PB_URL = 'http://127.0.0.1:8090'
const PROD_PB_URL = 'https://bookitfest-production.up.railway.app' // <- change before deploying

const isLocal = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname) || location.hostname.endsWith('.local')

export const CONFIG = {
  PB_URL: isLocal ? LOCAL_PB_URL : PROD_PB_URL,
  NGN_RATE: 1500, // 1 USD = 1,500 NGN (display only)
}
