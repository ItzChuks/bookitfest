import { pb, post, errMsg } from '../pb.js'
import { state, me, fmt, toUSD, currencyLabel, bus } from '../state.js'
import { CATEGORIES, TIER_NAMES } from '../components.js'
import { $, esc, fmtDateTime, badge, setBusy, toast, confirmBox, emptyState } from '../ui.js'

export default {
  title: 'Vendor Dashboard',
  render: () => `<div class="space-y-8">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-gradient-to-tr from-gray-900 to-gray-800 text-white p-6 rounded-3xl shadow-xl space-y-2"><span class="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total Revenue Generated</span>
        <h2 class="text-3xl font-black text-amber-400" id="v-revenue">…</h2><p class="text-[11px] text-gray-400 font-semibold">Gross ticket sales across your events</p></div>
      <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2"><span class="text-xs text-gray-400 font-bold uppercase">Total Tickets Sold</span>
        <h2 class="text-2xl font-black text-gray-900" id="v-sold">…</h2><p class="text-xs text-red-600 font-semibold" id="v-across"><i class="fas fa-ticket-alt mr-1"></i></p></div>
      <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2"><span class="text-xs text-gray-400 font-bold uppercase">Available Earnings</span>
        <h2 class="text-2xl font-black text-emerald-600" id="v-balance">${fmt(me()?.balance)}</h2><a href="wallet.html" class="text-xs text-gray-500 font-semibold hover:text-red-600">Withdraw from your wallet <i class="fas fa-arrow-right ml-1"></i></a></div></div>

    <section class="bg-white rounded-3xl p-5 sm:p-8 border border-red-100 shadow-xl space-y-6">
      <div class="border-b border-gray-100 pb-6"><span class="bg-red-100 text-red-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Vendor Console</span>
        <h1 class="text-2xl sm:text-3xl font-black text-gray-900 mt-2">Create & Post Your Event</h1>
        <p class="text-xs text-gray-500 mt-1 max-w-2xl">Submit your event details and pricing tiers. An admin reviews it before it goes live on the marketplace.</p></div>
      <form id="v-form" class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div><label class="block text-xs font-bold text-gray-700 mb-1" for="v-title">Event Title *</label><input class="field" id="v-title" required maxlength="140" placeholder="e.g. Lagos Afrobeats Carnival 2026"></div>
          <div><label class="block text-xs font-bold text-gray-700 mb-1" for="v-cat">Category *</label><select class="field" id="v-cat" required>
            <option value="Music Festival">Music Festival / Concert</option><option value="Tech Conference">Tech Conference / Expo</option><option value="Cultural Fair">Cultural Fair / Food Fest</option><option value="Sports & Gaming">Sports & Gaming Tournament</option></select></div>
          <div><label class="block text-xs font-bold text-gray-700 mb-1" for="v-date">Date & Time *</label><input class="field" type="datetime-local" id="v-date" required></div>
          <div><label class="block text-xs font-bold text-gray-700 mb-1" for="v-loc">Location / Venue *</label><input class="field" id="v-loc" required maxlength="200" placeholder="e.g. Landmark Beach Front, Victoria Island"></div></div>
        <div><span class="block text-xs font-bold text-gray-700 mb-1">Cover Banner Image</span>
          <input type="file" id="v-img" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only">
          <label for="v-img" id="v-drop" class="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-300 hover:border-red-400 hover:bg-red-50/40 rounded-2xl px-4 py-8 text-center cursor-pointer transition">
            <i class="fas fa-cloud-upload-alt text-2xl text-red-500"></i><span class="text-xs font-bold text-gray-800">Tap to upload from your device</span><span class="text-[11px] text-gray-400">JPG, PNG, WebP or GIF, up to 5 MB</span></label>
          <div id="v-prev" class="hidden mt-3 relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50"><img id="v-prev-img" alt="Cover preview" class="w-full h-48 object-cover">
            <button type="button" id="v-prev-x" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white text-xs font-bold px-3 py-1.5 rounded-lg"><i class="fas fa-times mr-1"></i>Remove</button></div></div>
        <div><label class="block text-xs font-bold text-gray-700 mb-1" for="v-desc">Description</label><textarea class="field" id="v-desc" rows="3" maxlength="4000" placeholder="What should people know before they buy?"></textarea></div>
        <div class="bg-gray-50 p-4 sm:p-5 rounded-2xl border border-gray-200 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-1"><h3 class="text-xs font-extrabold text-gray-900 uppercase tracking-wider">3-Tier Ticket Pricing (<span class="text-red-600" id="v-cur">${currencyLabel()}</span>)</h3><span class="text-[10px] text-gray-400 font-bold">Enter amounts in the selected currency</span></div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">${[['early', 'Early Bird Pass', 30], ['regular', 'Regular Gate Pass', 60], ['vip', 'VIP Ultra Pass', 180]].map(([k, l, p]) => `<div class="bg-white p-4 rounded-xl border border-gray-200 space-y-1"><label for="v-p-${k}" class="text-[10px] text-gray-400 font-bold block uppercase">${l}</label>
            <input type="number" min="0" step="any" inputmode="decimal" id="v-p-${k}" required data-ph="${p}" class="w-full p-2 border border-gray-200 rounded-lg text-base sm:text-sm font-black text-gray-900 focus:border-red-500 outline-none"></div>`).join('')}</div></div>
        <p id="v-err" class="hidden text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2" role="alert"></p>
        <button type="submit" class="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold py-4 rounded-2xl shadow-lg shadow-red-200 transition text-xs flex items-center justify-center space-x-2"><i class="fas fa-paper-plane"></i><span>Submit Event for Admin Approval</span></button></form></section>

    <section class="grid lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4"><h2 class="font-bold text-gray-900 text-lg">My Events</h2>
        <div id="v-events" class="space-y-3"><div class="skeleton h-20 rounded-2xl"></div></div></div>
      <div class="bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 self-start"><h2 class="font-bold text-gray-900 text-lg">Gate Check-in</h2>
        <p class="text-xs text-gray-500">Type the code printed under a guest's QR to validate and check them in.</p>
        <form id="v-check" class="space-y-3"><label class="sr-only" for="v-code">Ticket code</label><input class="field font-mono uppercase" id="v-code" placeholder="BKF-XXXXXXXX" autocomplete="off" required>
          <button class="w-full bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2"><i class="fas fa-check-double"></i><span>Check in ticket</span></button></form>
        <div id="v-check-res"></div></div></section></div>`,

  async mount(ctx, root) {
    let events = [], tickets = []
    const setPlaceholders = () => root.querySelectorAll('[data-ph]').forEach((i) => (i.placeholder = state.currency === 'NGN' ? Math.round(i.dataset.ph * 1500) : i.dataset.ph))
    const paintStats = () => {
      const gross = tickets.reduce((n, t) => n + (t.price || 0), 0)
      $('#v-revenue', root).textContent = fmt(gross)
      $('#v-sold', root).textContent = `${tickets.length} Pass${tickets.length === 1 ? '' : 'es'}`
      $('#v-across', root).innerHTML = `<i class="fas fa-ticket-alt mr-1"></i> Across ${new Set(tickets.map((t) => t.event)).size} event(s)`
      $('#v-balance', root).textContent = fmt(me()?.balance)
    }
    const paintEvents = () => {
      const sold = (id) => tickets.filter((t) => t.event === id).length
      $('#v-events', root).innerHTML = events.length ? events.map((e) => `<div class="border border-gray-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="min-w-0"><p class="font-bold text-sm text-gray-900 truncate">${esc(e.title)}</p><p class="text-[11px] text-gray-500">${esc(fmtDateTime(e.starts_at))} • ${esc(e.location)}</p>
          <p class="mt-1.5 flex flex-wrap items-center gap-2">${badge(e.status)}<span class="text-[11px] text-gray-400 font-semibold">${sold(e.id)} sold • from ${fmt(e.price_early)}</span></p></div>
        <div class="flex gap-2 shrink-0">${e.status === 'approved' ? `<a href="event.html?id=${esc(e.id)}" class="text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-xl">View</a>` : ''}
          ${e.status === 'pending' ? `<button data-del="${esc(e.id)}" class="text-xs font-bold text-gray-500 border border-gray-200 hover:border-red-300 hover:text-red-600 px-3 py-2 rounded-xl">Delete</button>` : ''}</div></div>`).join('')
        : emptyState('fa-calendar-plus', 'No events yet', 'Your submissions will appear here with their approval status.')
    }
    const load = async () => {
      try {
        ;[events, tickets] = await Promise.all([
          pb.collection('events').getFullList({ filter: pb.filter('vendor = {:u}', { u: me().id }), sort: '-created' }),
          pb.collection('tickets').getFullList({ filter: pb.filter('event.vendor = {:u}', { u: me().id }), fields: 'id,event,price' }),
        ])
      } catch (e) { toast(errMsg(e), 'error') }
      paintStats(); paintEvents()
    }

    const form = $('#v-form', root)
    const imgIn = $('#v-img', root), prev = $('#v-prev', root), prevImg = $('#v-prev-img', root), drop = $('#v-drop', root)
    const clearImg = () => { imgIn.value = ''; if (prevImg.src.startsWith('blob:')) URL.revokeObjectURL(prevImg.src); prevImg.removeAttribute('src'); prev.classList.add('hidden'); drop.classList.remove('hidden') }
    imgIn.onchange = () => {
      const f = imgIn.files[0]; const err = $('#v-err', root); err.classList.add('hidden')
      if (!f) return clearImg()
      if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) { clearImg(); err.textContent = 'Please choose a JPG, PNG, WebP or GIF image.'; return err.classList.remove('hidden') }
      if (f.size > 5 * 1024 * 1024) { clearImg(); err.textContent = 'That image is over 5 MB. Choose a smaller one.'; return err.classList.remove('hidden') }
      prevImg.src = URL.createObjectURL(f); prev.classList.remove('hidden'); drop.classList.add('hidden')
    }
    $('#v-prev-x', root).onclick = clearImg
    form.addEventListener('reset', () => setTimeout(clearImg))
    form.onsubmit = async (ev) => {
      ev.preventDefault()
      const err = $('#v-err', root); err.classList.add('hidden')
      const prices = ['early', 'regular', 'vip'].map((k) => toUSD($(`#v-p-${k}`, root).value))
      if (prices.some((p) => !(p >= 0))) { err.textContent = 'Enter a price for every tier (use 0 for free).'; return err.classList.remove('hidden') }
      const when = new Date($('#v-date', root).value)
      if (!(when > new Date())) { err.textContent = 'Pick a date and time in the future.'; return err.classList.remove('hidden') }
      const btn = $('button[type=submit]', form); setBusy(btn, true, 'Submitting…')
      try {
        const fd = new FormData()
        const price = (v) => String(+v.toFixed(2))
        Object.entries({
          title: $('#v-title', root).value.trim(), category: $('#v-cat', root).value, starts_at: when.toISOString().replace('T', ' '),
          location: $('#v-loc', root).value.trim(), description: $('#v-desc', root).value.trim(),
          vendor: me().id, status: 'pending', price_early: price(prices[0]), price_regular: price(prices[1]), price_vip: price(prices[2]),
        }).forEach(([k, v]) => fd.append(k, v))
        if (imgIn.files[0]) fd.append('image', imgIn.files[0])
        await pb.collection('events').create(fd)
        form.reset(); toast('Event submitted. It is now pending admin approval.'); bus.emit('pending'); load()
      } catch (e) { err.textContent = errMsg(e); err.classList.remove('hidden') }
      setBusy(btn, false)
    }

    $('#v-check', root).onsubmit = async (ev) => {
      ev.preventDefault()
      const out = $('#v-check-res', root), btn = $('button', ev.target); setBusy(btn, true, 'Checking…')
      try {
        const r = await post('ticket/check', { code: $('#v-code', root).value })
        out.innerHTML = `<div class="${r.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'} border rounded-xl p-3 text-xs space-y-0.5"><p class="font-bold"><i class="fas ${r.ok ? 'fa-check-circle' : 'fa-exclamation-triangle'} mr-1"></i>${esc(r.message)}</p><p>${esc(r.holder)} • ${esc(TIER_NAMES[r.tier])}</p><p class="opacity-70">${esc(r.event)}</p></div>`
        if (r.ok) $('#v-code', root).value = ''
      } catch (e) { out.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs font-bold">${esc(e.status === 404 ? 'No ticket with that code.' : errMsg(e))}</div>` }
      setBusy(btn, false)
    }

    const onClick = async (e) => {
      const d = e.target.closest('[data-del]'); if (!d) return
      if (!(await confirmBox({ title: 'Delete this event?', body: 'It has not been approved yet, so no tickets have been sold. This cannot be undone.', confirmText: 'Delete event', danger: true }))) return
      try { await pb.collection('events').delete(d.dataset.del); toast('Event deleted.'); bus.emit('pending'); load() } catch (er) { toast(errMsg(er), 'error') }
    }
    root.addEventListener('click', onClick)
    setPlaceholders(); load()
    this._repaint = () => { $('#v-cur', root).textContent = currencyLabel(); setPlaceholders(); paintStats(); paintEvents() }
    return () => root.removeEventListener('click', onClick)
  },
  onCurrency() { this._repaint?.() },
}
