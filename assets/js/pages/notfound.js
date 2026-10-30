export default {
  title: 'Page not found',
  render: () => `<div class="max-w-md mx-auto text-center py-16 space-y-4">
    <div class="w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto"><i class="fas fa-ticket-alt text-2xl -rotate-12"></i></div>
    <h1 class="text-3xl font-black text-gray-900">Page not found</h1>
    <p class="text-xs text-gray-500">That link doesn't lead anywhere. It may have moved, or the event may have been removed.</p>
    <a href="events.html" class="inline-block bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-6 py-3 rounded-2xl shadow-md shadow-red-200">Browse events</a></div>`,
}
