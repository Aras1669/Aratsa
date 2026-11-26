// Her saat başı çalışır (Cron: 0 * * * *) ve siteye "silme emrinden 24 saat geçenleri temizle" der.
// Gerekli: secret CRON_KEY (Pages'teki CRON_KEY ile aynı). SITE_URL isteğe bağlı.
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(fetch((env.SITE_URL || 'https://aratsa.pages.dev') + '/api/temizle', { method: 'POST', headers: { 'X-Cron-Key': env.CRON_KEY } }));
  },
  async fetch() { return new Response('Not found', { status: 404 }); },
};
