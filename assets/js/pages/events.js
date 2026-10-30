import { pb, pbNow } from '../pb.js'
import { fmt } from '../state.js'
import { eventCard, eventSkeletons, CATEGORIES } from '../components.js'
import { $, $$, debounce, emptyState } from '../ui.js'

const ACTIVE = 'cat-filter-btn active bg-red-600 text-white px-3 py-2 rounded-xl text-xs font-semibold shadow-sm transition'
const IDLE = 'cat-filter-btn bg-white text-gray-600 border border-gray-200 px-3 py-2 rounded-xl text-xs font-medium hover:border-red-500 hover:text-red-600 transition'

export default {
  title: 'Events Marketplace',
  render: (ctx) => `<section class="space-y-6">
    <div class="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4">
      <div><h1 class="text-2xl sm:text-3xl font-black text-gray-900">Live Approved Events</h1><p class="text-gray-500 text-xs">Verified festival passes ready for instant purchase.</p></div>
      <div class="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
        <div class="relative sm:w-64"><i class="fas fa-search absolute left-3.5 top-3.5 text-gray-400 text-xs"></i>
          <label class="sr-only" for="ev-search">Search events</label>
          <input type="search" id="ev-search" value="${(ctx.query.get('q') || '').replace(/"/g, '&quot;')}" placeholder="Search events or venue..." class="field pl-9 py-2.5"></div>
        <div class="flex flex-wrap gap-1.5" id="ev-cats">${CATEGORIES.map((c) => `<button data-cat="${c.value}" class="${IDLE}">${c.label}</button>`).join('')}</div>
      </div></div>
    <p id="ev-count" class="text-[11px] font-bold text-gray-400 uppercase tracking-wider h-4"></p>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="ev-grid">${eventSkeletons(6)}</div></section>`,

  async mount(ctx) {
    let all = [], cat = ctx.query.get('cat') || 'All', failed = false
    const grid = $('#ev-grid'), input = $('#ev-search')

    const draw = () => {
      $$('#ev-cats button').forEach((b) => (b.className = b.dataset.cat === cat ? ACTIVE : IDLE))
      const q = input.value.trim().toLowerCase()
      const list = all.filter((e) => (cat === 'All' || e.category === cat) && (!q || `${e.title} ${e.location} ${e.vendor_name}`.toLowerCase().includes(q)))
      $('#ev-count').textContent = failed ? '' : `${list.length} event${list.length === 1 ? '' : 's'}`
      grid.innerHTML = failed ? emptyState('fa-plug', "Couldn't load events", 'Check your connection and refresh the page.')
        : list.length ? list.map(eventCard).join('')
        : emptyState('fa-search', 'No matching events', 'Try a different search or category.', '<button data-reset class="text-xs font-bold text-red-600 hover:underline">Clear filters</button>')
      const p = new URLSearchParams(); if (q) p.set('q', input.value.trim()); if (cat !== 'All') p.set('cat', cat)
      history.replaceState({}, '', location.pathname + (p.toString() ? '?' + p : ''))
    }
    const onClick = (e) => {
      const b = e.target.closest('[data-cat]'); if (b) { cat = b.dataset.cat; draw() }
      if (e.target.closest('[data-reset]')) { cat = 'All'; input.value = ''; draw() }
    }
    const onInput = debounce(draw, 150)
    $('#main').addEventListener('click', onClick); input.addEventListener('input', onInput)

    try { all = await pb.collection('events').getFullList({ filter: pb.filter('status = "approved" && starts_at >= {:now}', { now: pbNow() }), sort: 'starts_at' }) }
    catch { failed = true }
    draw()
    return () => $('#main').removeEventListener('click', onClick)
  },
  onCurrency() { document.querySelectorAll('[data-price]').forEach((e) => (e.textContent = fmt(e.dataset.price))) },
}
