import { esc, fmtDateTime, imgOnError, PLACEHOLDER_IMG } from './ui.js'
import { fmt } from './state.js'

export const TIER_NAMES = { early: 'Early Bird Pass', regular: 'Regular Gate Pass', vip: 'VIP Ultra Experience' }
export const CATEGORIES = [
  { value: 'All', label: 'All' }, { value: 'Music Festival', label: 'Concerts' }, { value: 'Tech Conference', label: 'Tech Expos' },
  { value: 'Cultural Fair', label: 'Cultural' }, { value: 'Sports & Gaming', label: 'Sports & Gaming' },
]
export const evtImage = (e) => e.image_url || PLACEHOLDER_IMG

export function eventCard(e) {
  return `<article class="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition group flex flex-col">
    <a href="event.html?id=${esc(e.id)}" class="relative h-48 overflow-hidden block">
      <img src="${esc(evtImage(e))}" onerror="${imgOnError}" alt="${esc(e.title)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
      <span class="absolute top-3 left-3 bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">${esc(e.category)}</span>
    </a>
    <div class="p-5 space-y-3 flex-1 flex flex-col">
      <div class="flex items-center text-xs text-red-600 font-semibold space-x-2"><i class="far fa-calendar-alt"></i><span>${esc(fmtDateTime(e.starts_at))}</span></div>
      <h3 class="font-bold text-gray-900 text-lg group-hover:text-red-600 transition"><a href="event.html?id=${esc(e.id)}">${esc(e.title)}</a></h3>
      <p class="text-xs text-gray-500 flex items-center"><i class="fas fa-map-marker-alt mr-1.5 text-gray-400"></i> ${esc(e.location)}</p>
      <p class="text-[11px] text-gray-400 font-semibold">Hosted by: ${esc(e.vendor_name || 'Verified vendor')}</p>
      <div class="pt-3 mt-auto border-t border-gray-100 flex items-center justify-between">
        <div><span class="text-[10px] text-gray-400 uppercase font-bold block">Starts From</span>
          <span class="text-lg font-extrabold text-gray-900" data-price="${e.price_early}">${fmt(e.price_early)}</span></div>
        <a href="event.html?id=${esc(e.id)}" class="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md shadow-red-200 transition">Buy Ticket</a>
      </div>
    </div></article>`
}

export const eventSkeletons = (n = 3) => Array.from({ length: n }, () =>
  `<div class="bg-white rounded-3xl overflow-hidden border border-gray-100"><div class="skeleton h-48"></div><div class="p-5 space-y-3"><div class="skeleton h-3 w-1/3 rounded"></div><div class="skeleton h-5 w-3/4 rounded"></div><div class="skeleton h-3 w-1/2 rounded"></div><div class="skeleton h-10 rounded-xl mt-4"></div></div></div>`).join('')

export const digitChips = (digits, cls = '') =>
  `<div class="flex gap-1.5 font-black text-red-600 text-base tracking-widest ${cls}">${String(digits).split('').map((d) => `<span class="bg-red-50 border border-red-200 rounded-md px-2 py-0.5">${esc(d)}</span>`).join('')}</div>`
