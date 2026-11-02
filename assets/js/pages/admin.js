import { pb, post, errMsg } from '../pb.js'
import { fmt } from '../state.js'
import { digitChips } from '../components.js'
import { $, esc, fmtDateTime, fmtDay, badge, setBusy, toast, confirmBox, openModal, closeButton, emptyState, debounce } from '../ui.js'
import { bus } from '../state.js'
import { playSound } from '../audio.js'

export default {
  title: 'Admin Console',
  render: () => `<div class="space-y-8"><div class="bg-white rounded-3xl p-5 sm:p-8 border border-red-100 shadow-xl space-y-6">
    <div class="border-b border-gray-100 pb-6"><span class="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Super Admin Console</span>
      <h1 class="text-2xl sm:text-3xl font-black text-gray-900 mt-2">Approvals, Users & Draw Management</h1>
      <p class="text-xs text-gray-500 mt-1 max-w-2xl">Review vendor submissions, see every vendor and user on the site, and run the Lucky 5 draw automatically or with a manual outcome.</p></div>

    <div class="bg-slate-900 text-white p-5 sm:p-6 rounded-2xl space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3"><h2 class="text-xs font-bold text-amber-400 uppercase tracking-widest"><i class="fas fa-dice mr-1"></i> Admin Lucky 5 Winner Controller</h2>
        <span class="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono" id="a-cycle">DRAW CYCLE: …</span></div>
      <p class="text-xs text-slate-400" id="a-draw-info"></p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div><label class="block text-slate-400 font-bold mb-1" for="a-mode">Draw Mode</label><select id="a-mode" class="field field-dark"><option value="auto">Automated System Draw (Random)</option><option value="manual">Manual Winner Selection (Admin Override)</option></select></div>
        <div id="a-manual" class="opacity-50 pointer-events-none"><label class="block text-slate-400 font-bold mb-1" for="a-digits">Manual 5-Digit Outcome</label><input id="a-digits" inputmode="numeric" maxlength="5" placeholder="e.g. 74902" class="field field-dark font-mono font-bold tracking-widest text-amber-400"></div>
        <div class="flex items-end"><button id="a-run" class="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black p-3 rounded-xl transition flex items-center justify-center space-x-2 shadow-md"><i class="fas fa-play text-xs"></i><span>Trigger Draw & Select Winner</span></button></div></div></div>

    <section><h2 class="font-bold text-gray-900 text-lg mb-3">Events</h2>
      <div class="overflow-x-auto"><table class="w-full text-left text-xs table-stack"><thead class="bg-gray-50 text-gray-400 uppercase font-bold"><tr><th class="p-3">Event Details</th><th class="p-3">Category</th><th class="p-3">Pricing Tiers</th><th class="p-3">Status</th><th class="p-3 text-right">Actions</th></tr></thead>
        <tbody class="divide-y divide-gray-100" id="a-events"><tr><td colspan="5" class="p-6 text-center text-gray-400">Loading…</td></tr></tbody></table></div></section>

    <section><div class="flex flex-wrap items-center justify-between gap-3 mb-3"><h2 class="font-bold text-gray-900 text-lg">Users <span class="text-xs text-gray-400 font-semibold" id="a-ucount"></span></h2>
        <div class="flex flex-wrap items-center gap-2"><div class="flex bg-gray-100 rounded-xl p-1 text-[11px] font-bold" id="a-utabs" role="tablist">
          ${[['all', 'All'], ['vendor', 'Vendors'], ['user', 'Users'], ['admin', 'Admins']].map(([k, l]) => `<button type="button" role="tab" data-utab="${k}" class="px-3 py-1.5 rounded-lg transition">${l} <span class="opacity-60" data-ucnt="${k}"></span></button>`).join('')}</div>
          <label class="sr-only" for="a-usearch">Search users</label><input id="a-usearch" type="search" placeholder="Search name or email" class="field !py-2 !w-48"></div></div>
      <div class="overflow-x-auto"><table class="w-full text-left text-xs table-stack"><thead class="bg-gray-50 text-gray-400 uppercase font-bold"><tr><th class="p-3">Name</th><th class="p-3">Email</th><th class="p-3">Role</th><th class="p-3">Activity</th><th class="p-3">Wallet</th><th class="p-3">Joined</th></tr></thead>
        <tbody class="divide-y divide-gray-100" id="a-users"><tr><td colspan="6" class="p-6 text-center text-gray-400">Loading…</td></tr></tbody></table></div></section>

    <section><h2 class="font-bold text-gray-900 text-lg mb-3">Withdrawal requests</h2>
      <div class="overflow-x-auto"><table class="w-full text-left text-xs table-stack"><thead class="bg-gray-50 text-gray-400 uppercase font-bold"><tr><th class="p-3">User</th><th class="p-3">Bank / Account</th><th class="p-3">Amount</th><th class="p-3">Requested</th><th class="p-3 text-right">Action</th></tr></thead>
        <tbody class="divide-y divide-gray-100" id="a-wd"><tr><td colspan="5" class="p-6 text-center text-gray-400">Loading…</td></tr></tbody></table></div></section></div></div>`,

  async mount(ctx, root) {
    let events = [], wds = [], draw = null, users = [], utab = 'all', uq = ''
    const paintEvents = () => {
      $('#a-events', root).innerHTML = events.length ? events.map((e) => `<tr class="hover:bg-gray-50/50">
        <td data-label="Event" class="p-3"><span class="font-bold text-gray-900 block">${esc(e.title)}</span><span class="text-[11px] text-gray-400">${esc(e.vendor_name)} • ${esc(fmtDateTime(e.starts_at))}</span></td>
        <td data-label="Category" class="p-3 text-gray-600">${esc(e.category)}</td>
        <td data-label="Tiers" class="p-3 text-gray-600 whitespace-nowrap">${fmt(e.price_early)} / ${fmt(e.price_regular)} / ${fmt(e.price_vip)}</td>
        <td data-label="Status" class="p-3">${badge(e.status)}</td>
        <td data-label="Actions" class="p-3 text-right whitespace-nowrap">
          ${e.status !== 'approved' ? `<button data-ev="${esc(e.id)}" data-to="approved" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-[10px] font-bold transition">Approve</button>` : ''}
          ${e.status === 'pending' ? `<button data-ev="${esc(e.id)}" data-to="rejected" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-[10px] font-bold transition ml-1">Reject</button>` : ''}
          ${e.status === 'approved' ? `<a href="event.html?id=${esc(e.id)}" class="text-red-600 hover:underline text-[10px] font-bold">View live</a>` : ''}</td></tr>`).join('')
        : `<tr><td colspan="5">${emptyState('fa-calendar', 'No events submitted yet', 'Vendor submissions will appear here for review.')}</td></tr>`
    }
    const ROLE_STYLES = { admin: 'bg-indigo-100 text-indigo-700', vendor: 'bg-red-100 text-red-700', user: 'bg-gray-100 text-gray-600' }
    const paintUsers = () => {
      const count = (r) => (r === 'all' ? users.length : users.filter((u) => u.role === r).length)
      root.querySelectorAll('[data-ucnt]').forEach((el) => (el.textContent = count(el.dataset.ucnt)))
      root.querySelectorAll('[data-utab]').forEach((b) => { const on = b.dataset.utab === utab; b.classList.toggle('bg-white', on); b.classList.toggle('shadow-sm', on); b.classList.toggle('text-gray-900', on); b.classList.toggle('text-gray-500', !on); b.setAttribute('aria-selected', on) })
      const q = uq.trim().toLowerCase()
      const rows = users.filter((u) => (utab === 'all' || u.role === utab) && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q)))
      $('#a-ucount', root).textContent = `(${rows.length} shown)`
      const activity = (u) => u.role === 'vendor' ? `${events.filter((e) => e.vendor === u.id).length} event(s)` : '—'
      $('#a-users', root).innerHTML = rows.length ? rows.map((u) => `<tr class="hover:bg-gray-50/50">
        <td data-label="Name" class="p-3 font-bold text-gray-900">${esc(u.name || '—')}</td>
        <td data-label="Email" class="p-3 text-gray-600 break-all">${esc(u.email)}</td>
        <td data-label="Role" class="p-3"><span class="${ROLE_STYLES[u.role] || ROLE_STYLES.user} px-2 py-0.5 rounded-md text-[10px] font-bold uppercase">${esc(u.role)}</span></td>
        <td data-label="Activity" class="p-3 text-gray-600">${esc(activity(u))}</td>
        <td data-label="Wallet" class="p-3 font-semibold text-gray-700">${fmt(u.balance)}</td>
        <td data-label="Joined" class="p-3 text-gray-400 whitespace-nowrap">${esc(fmtDay(u.created))}</td></tr>`).join('')
        : `<tr><td colspan="6" class="p-6 text-center text-gray-400">${users.length ? 'No accounts match.' : 'No accounts yet.'}</td></tr>`
    }
    const paintWd = () => {
      $('#a-wd', root).innerHTML = wds.length ? wds.map((t) => `<tr><td data-label="User" class="p-3 font-bold text-gray-900">${esc(t.expand?.user?.name || '')}<span class="block text-[11px] text-gray-400 font-normal">${esc(t.expand?.user?.email || '')}</span></td>
        <td data-label="Bank" class="p-3 text-gray-600">${esc(t.method)}</td><td data-label="Amount" class="p-3 font-bold">${fmt(Math.abs(t.amount))}</td><td data-label="Requested" class="p-3 text-gray-400">${esc(fmtDay(t.created))}</td>
        <td data-label="Action" class="p-3 text-right"><button data-wd="${esc(t.id)}" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-[10px] font-bold">Mark paid</button></td></tr>`).join('')
        : `<tr><td colspan="5" class="p-6 text-center text-gray-400">No pending withdrawals.</td></tr>`
    }
    const loadDraw = async () => {
      try {
        draw = await pb.collection('draws').getFirstListItem('status = "open"')
        const n = (await pb.collection('lucky_entries').getList(1, 1, { filter: pb.filter('draw = {:d}', { d: draw.id }), fields: 'id' })).totalItems
        $('#a-cycle', root).textContent = `DRAW CYCLE: #${draw.number}`
        $('#a-draw-info', root).textContent = `${n} entr${n === 1 ? 'y' : 'ies'} • jackpot ${fmt(draw.jackpot)}`
      } catch { $('#a-cycle', root).textContent = 'NO OPEN DRAW' }
    }
    const load = async () => {
      try {
        ;[events, wds] = await Promise.all([
          pb.collection('events').getFullList({ sort: '-created' }),
          pb.collection('transactions').getFullList({ filter: 'type = "withdrawal" && status = "pending"', sort: 'created', expand: 'user' }),
        ])
        paintEvents(); paintWd()
      } catch (e) { toast(errMsg(e), 'error') }
      try { users = await pb.send('/api/bkf/admin/users'); paintUsers(); paintEvents() }
      catch (e) { $('#a-users', root).innerHTML = `<tr><td colspan="6" class="p-6 text-center text-red-600">${esc(errMsg(e))}</td></tr>` }
      loadDraw()
    }

    root.querySelectorAll('[data-utab]').forEach((b) => (b.onclick = () => { utab = b.dataset.utab; paintUsers() }))
    $('#a-usearch', root).oninput = debounce((e) => { uq = e.target.value; paintUsers() }, 150)

    $('#a-mode', root).onchange = (e) => {
      const manual = e.target.value === 'manual'
      $('#a-manual', root).classList.toggle('opacity-50', !manual)
      $('#a-manual', root).classList.toggle('pointer-events-none', !manual)
    }
    $('#a-digits', root).oninput = (e) => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5))
    $('#a-run', root).onclick = async (e) => {
      const mode = $('#a-mode', root).value, digits = $('#a-digits', root).value
      if (mode === 'manual' && digits.length !== 5) return toast('Enter a valid 5-digit sequence.', 'error')
      const ok = await confirmBox({ title: `Run draw #${draw?.number ?? ''}?`, body: `${mode === 'manual' ? `The winning digits will be <strong>${esc(digits)}</strong>.` : 'The winning digits will be picked at random.'} Winners are paid into their wallets immediately and this cannot be undone.`, confirmText: 'Run draw' })
      if (!ok) return
      const btn = e.currentTarget; setBusy(btn, true, 'Drawing…')
      try {
        const r = await post('admin/draw', { mode, digits })
        playSound('win')
        const m = openModal(`${closeButton}<div class="p-6 text-center space-y-4"><h3 class="text-xl font-black text-gray-900">Draw #${r.draw} complete</h3>
          <div class="flex justify-center">${digitChips(r.winning, 'text-2xl')}</div>
          <p class="text-sm text-gray-600">${r.winners ? `<strong>${r.winners}</strong> winning entr${r.winners === 1 ? 'y' : 'ies'}. ${fmt(r.payout)} paid out.` : `No exact matches. The ${fmt(r.nextJackpot)} jackpot rolls over to draw #${r.nextDraw}.`}</p>
          <button data-close class="w-full bg-gray-900 text-white font-bold py-3 rounded-xl text-xs">Done</button></div>`)
        $('#a-digits', root).value = ''; loadDraw()
      } catch (err) { toast(errMsg(err), 'error') }
      setBusy(btn, false)
    }
    const onClick = async (e) => {
      const ev = e.target.closest('[data-ev]'), wd = e.target.closest('[data-wd]')
      try {
        if (ev) {
          const to = ev.dataset.to; const rec = events.find((x) => x.id === ev.dataset.ev)
          await pb.collection('events').update(rec.id, { status: to })
          toast(to === 'approved' ? `"${rec.title}" is now live.` : `"${rec.title}" was rejected.`, to === 'approved' ? 'success' : 'info')
          rec.status = to; paintEvents(); bus.emit('pending')
        } else if (wd) {
          await pb.collection('transactions').update(wd.dataset.wd, { status: 'completed', note: 'Paid out by admin' })
          wds = wds.filter((t) => t.id !== wd.dataset.wd); paintWd(); toast('Marked as paid.')
        }
      } catch (err) { toast(errMsg(err), 'error') }
    }
    root.addEventListener('click', onClick)
    load()
    this._repaint = () => { paintEvents(); paintUsers(); paintWd(); loadDraw() }
    return () => root.removeEventListener('click', onClick)
  },
  onCurrency() { this._repaint?.() },
}
