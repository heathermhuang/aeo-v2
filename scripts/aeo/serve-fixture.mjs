import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const fixture = JSON.parse(await readFile('.local/browser-fixture.json', 'utf8'));
if (!fixture.synthetic || !/^[a-f0-9-]{36}$/.test(fixture.site))
  throw new Error('Synthetic candidate fixture required.');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic AEO acceptance website</title><script defer src="http://127.0.0.1:3102/script.js" data-website-id="${fixture.site}"></script><style>body{font:18px/1.6 system-ui;padding:48px;max-width:700px;background:#f4f7f1;color:#243527}button{font:inherit;padding:12px 20px;background:#27764f;color:white;border:0;border-radius:6px}</style></head><body><p>SYNTHETIC ACCEPTANCE ONLY</p><h1>A real browser event through the AEO tracker.</h1><p>This isolated fixture tests delivery, not customer traffic or business outcomes.</p><button id="conversion">Record synthetic conversion</button><p id="status" role="status">Ready</p><script>document.getElementById('conversion').onclick=async()=>{try{await window.umami.track('signup_completed');document.getElementById('status').textContent='Synthetic event sent';}catch{document.getElementById('status').textContent='Delivery failed';}}</script></body></html>`;
createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
  res.end(html);
}).listen(3103, '127.0.0.1', () => console.log('Synthetic fixture ready on loopback port 3103.'));
