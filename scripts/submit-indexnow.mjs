// IndexNow submission for the public OpenAdminJS GitHub Pages project.
// Run after a successful Pages deployment; no private credentials required.
const base = "https://js-senpai.github.io/open-admin-js/";
const key = "20f2c94a6ec3391ae4b24539dc8b35bd";
const keyLocation = new URL(key + '.txt', base).href;
const urlList = [base, new URL('docs.html', base).href];
const get = async (url) => {
  const res = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(20000), headers: {'Cache-Control': 'no-cache'}});
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.text();
};
const keyBody = await get(keyLocation);
if (keyBody.trim() !== key) throw new Error('Public IndexNow key is missing or invalid');
const sitemap = await get(new URL('sitemap.xml', base).href);
for (const url of urlList) {
  if (!sitemap.includes('<loc>' + url + '</loc>')) throw new Error('URL missing in sitemap: ' + url);
  const page = await get(url);
  if (!page.includes('rel="canonical" href="' + url + '"')) throw new Error('Expected canonical missing: ' + url);
}
const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST', headers: {'Content-Type': 'application/json; charset=utf-8'},
  body: JSON.stringify({host: new URL(base).hostname, key, keyLocation, urlList}),
  signal: AbortSignal.timeout(20000), redirect: 'error'
});
console.log('IndexNow HTTP ' + response.status);
if (![200, 202].includes(response.status)) throw new Error('IndexNow rejected the submission: ' + (await response.text()).slice(0, 500));
console.log(response.status === 202 ? 'Received; key validation pending.' : 'URLs accepted. Indexing is not guaranteed.');
