import { pb, pbNow } from '../pb.js'
import { fmt, state } from '../state.js'
import { eventCard, eventSkeletons } from '../components.js'
import { emptyState } from '../ui.js'

export default {
  title: 'Multivendor Event Ticketing & Lucky 5',
  render: () => `<div class="space-y-10">
    <section class="relative rounded-3xl overflow-hidden red-gradient text-white p-6 sm:p-12 shadow-xl red-glow">
      <div class="absolute -right-12 -bottom-12 w-64 h-64 bg-white/10 rounded-full blur-2xl"></div>
      <div class="relative z-10 max-w-2xl space-y-4">
        <span class="bg-white/20 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full backdrop-blur-sm">Verified Multivendor Events</span>
        <h1 class="text-3xl sm:text-5xl font-black leading-tight">Create Events, Buy Tickets & Win Lucky 5 Draw</h1>
        <p class="text-red-100 text-xs sm:text-sm">Host your own events as a vendor, purchase tickets seamlessly in NGN or USD, and enter our 5-digit jackpot game.</p>
        <div class="pt-2 flex flex-wrap gap-3">
          <a href="events.html" class="bg-white text-red-600 hover:bg-red-50 text-xs font-bold px-6 py-3 rounded-2xl shadow-lg transition">Explore Events</a>
          <a href="vendor.html" class="bg-black/30 hover:bg-black/40 text-white text-xs font-bold px-6 py-3 rounded-2xl border border-white/20 backdrop-blur-md transition"><i class="fas fa-plus-circle mr-1.5"></i> Post Your Event</a>
          <a href="lucky.html" class="bg-amber-500 hover:bg-amber-600 text-gray-900 text-xs font-black px-6 py-3 rounded-2xl shadow-lg transition"><i class="fas fa-dice-five mr-1.5"></i> Play Lucky 5</a>
        </div></div></section>

    <section class="space-y-6" aria-labelledby="upcoming-h">
      <div class="flex items-end justify-between gap-4">
        <div><h2 id="upcoming-h" class="text-2xl font-black text-gray-900">Coming Up</h2><p class="text-gray-500 text-xs">Verified festival passes ready for instant purchase.</p></div>
        <a href="events.html" class="text-xs font-bold text-red-600 hover:underline whitespace-nowrap">View all events <i class="fas fa-arrow-right ml-1"></i></a></div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="home-events">${eventSkeletons(3)}</div>
    </section>

    <section class="grid grid-cols-1 lg:grid-cols-5 gap-6" aria-label="How Bookitfest works">
      <div class="lg:col-span-3 bg-white rounded-3xl border border-gray-100 shadow-sm p-6 sm:p-8 space-y-5">
        <h2 class="text-xl font-black text-gray-900">How events go live</h2>
        <ol class="space-y-4">
          ${[['Vendors post an event', 'Set the date, venue and three ticket tiers.'], ['Admins verify it', 'Every submission is reviewed before it appears here.'], ['You buy and get in', 'Pay in NGN or USD and receive a QR pass for the gate.']].map(([t, d], i) =>
            `<li class="flex gap-4"><span class="w-8 h-8 shrink-0 rounded-xl bg-red-600 text-white text-xs font-black flex items-center justify-center">${i + 1}</span><div><h3 class="text-sm font-bold text-gray-900">${t}</h3><p class="text-xs text-gray-500">${d}</p></div></li>`).join('')}
        </ol></div>
      <a href="lucky.html" class="lg:col-span-2 bg-gray-900 text-white rounded-3xl p-6 sm:p-8 flex flex-col justify-between gap-6 hover:bg-gray-800 transition">
        <div class="space-y-2"><span class="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Lucky 5 Current Jackpot</span>
          <p class="text-4xl font-black text-amber-400" id="home-jackpot">…</p>
          <p class="text-xs text-gray-400">Pick 5 digits from 0 to 9. Match all five to win.</p></div>
        <span class="bg-amber-500 text-gray-900 text-xs font-black px-5 py-3 rounded-2xl self-start"><i class="fas fa-dice-five mr-1.5"></i> Pick your numbers</span></a>
    </section></div>`,

  async mount() {
    const grid = document.getElementById('home-events')
    const jp = document.getElementById('home-jackpot')
    try {
      const list = await pb.collection('events').getList(1, 3, { filter: pb.filter('status = "approved" && starts_at >= {:now}', { now: pbNow() }), sort: 'starts_at' })
      grid.innerHTML = list.items.length ? list.items.map(eventCard).join('')
        : emptyState('fa-calendar-plus', 'No events yet', 'Vendors are setting things up. Check back soon, or post the first one yourself.', '<a href="vendor.html" class="inline-block bg-red-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl">Post an event</a>')
    } catch { grid.innerHTML = emptyState('fa-plug', "Couldn't load events", 'Check your connection and refresh the page.') }
    try {
      const d = await pb.collection('draws').getFirstListItem('status = "open"')
      jp.textContent = fmt(d.jackpot); jp.dataset.usd = d.jackpot
    } catch { jp.textContent = fmt(0) }
  },
  onCurrency() {
    document.querySelectorAll('[data-price]').forEach((e) => (e.textContent = fmt(e.dataset.price)))
    const jp = document.getElementById('home-jackpot'); if (jp?.dataset.usd) jp.textContent = fmt(jp.dataset.usd)
  },
}
