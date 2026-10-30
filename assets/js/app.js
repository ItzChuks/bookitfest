// Entry point for every page. Each HTML file sets <body data-page="name">,
// and this loads assets/js/pages/<name>.js, renders it into #main and mounts it.
import { pb } from './pb.js'
import { state, bus, me, refreshMe } from './state.js'
import { initLayout } from './layout.js'
import { esc } from './ui.js'

const GATES = {
  wallet: { auth: true, gate: { icon: 'fa-wallet', title: 'Sign in to see your wallet', text: 'Your balance, tickets and transaction history live here.' } },
  vendor: { roles: ['vendor', 'admin'], gate: { icon: 'fa-store', title: 'Vendor accounts only', text: 'Create a vendor account to post events and sell tickets. Admins review every event before it goes live.', vendor: true } },
  admin: { roles: ['admin'], gate: { icon: 'fa-user-shield', title: 'Admin access only', text: 'This console is for Bookitfest admins.' } },
}

function gateView(g, user) {
  const buttons = user
    ? `<a href="events.html" class="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-5 py-3 rounded-xl">Browse events</a>`
    : `<button data-auth="login" class="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-5 py-3 rounded-xl shadow-md shadow-red-200">Sign in</button>
       <button data-auth="${g.vendor ? 'register-vendor' : 'register'}" class="bg-white border border-gray-200 hover:border-red-300 text-gray-700 text-xs font-bold px-5 py-3 rounded-xl">${g.vendor ? 'Create vendor account' : 'Create account'}</button>`
  return `<div class="max-w-md mx-auto text-center bg-white rounded-3xl border border-red-100 shadow-xl p-8 space-y-4 my-8">
    <div class="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto"><i class="fas ${g.icon} text-xl"></i></div>
    <h1 class="text-xl font-black text-gray-900">${esc(g.title)}</h1>
    <p class="text-xs text-gray-500">${esc(g.text)}</p>
    <div class="flex flex-wrap gap-2 justify-center pt-2">${buttons}</div></div>`
}

const name = document.body.dataset.page
const outlet = document.getElementById('main')
const rule = GATES[name]
const allowed = () => !rule || (!(rule.auth && !me()) && !(rule.roles && !rule.roles.includes(me()?.role)))

let page, cleanup, token = 0
const ctx = { params: { id: new URLSearchParams(location.search).get('id') }, query: new URLSearchParams(location.search) }

async function render(keepScroll = false) {
  const my = ++token
  cleanup?.(); cleanup = null
  if (!page) {
    try { page = (await import(`./pages/${name}.js`)).default }
    catch (e) {
      console.error(e)
      page = { title: 'Error', gated: true, render: () => gateView({ icon: 'fa-triangle-exclamation', title: "This page didn't load", text: 'Check your connection and refresh.' }, me()) }
    }
  }
  if (my !== token) return
  const view = allowed() ? page : { title: rule.gate.title, gated: true, render: () => gateView(rule.gate, me()) }
  document.title = (view.title ? view.title + ' | ' : '') + 'Bookitfest'
  outlet.innerHTML = view.render(ctx)
  if (!keepScroll) window.scrollTo(0, 0)
  const c = await view.mount?.(ctx, outlet)
  if (my !== token) { c?.(); return }
  cleanup = c
  active = view
  if (!state.serverOk) {
    outlet.insertAdjacentHTML('afterbegin',
      `<div class="mb-6 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-2xl px-4 py-3" role="alert"><i class="fas fa-plug mr-2"></i>Can't reach the Bookitfest server. Start PocketBase (see README) and refresh.</div>`)
  }
}
let active = null

async function boot() {
  // Server config (also makes sure a Lucky 5 draw is open). Falls back to defaults if offline.
  try { Object.assign(state.config, await pb.send('/api/bkf/config', {})) }
  catch { state.serverOk = false }
  await refreshMe()
  initLayout()

  // Sign in/out on a gated page swaps the gate for the page (or back); other pages leave the page alone.
  bus.on('auth', () => {
    if (!rule) return
    if (active?.gated && allowed()) render(true)
    else if (!active?.gated && !allowed()) render(true)
  })
  // Currency switch: let the page update itself, or re-render it.
  bus.on('currency', () => { if (active?.onCurrency) active.onCurrency(); else if (active && !active.gated) render(true) })

  await render()
}
boot()
