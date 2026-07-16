// One-off: convert a Blink-saved .mhtml into a single self-contained .html by
// inlining every related part (css/images/fonts) as data: URIs and rewriting the
// main HTML part's references. Handles entity-encoded URLs (&amp;) which is the
// common reason inlining silently misses stylesheet links.
//
// Usage: node convert-mhtml.cjs <input.mhtml> <output.html>
const fs = require('fs');

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) { console.error('Usage: node convert-mhtml.cjs <in> <out>'); process.exit(1); }

const raw = fs.readFileSync(inPath, 'latin1');
const headerEnd = raw.search(/\r?\n\r?\n/);
const topHeaders = raw.slice(0, headerEnd);
const body = raw.slice(headerEnd).replace(/^\r?\n\r?\n/, '');

const boundary = (topHeaders.replace(/\r?\n[ \t]+/g, ' ').match(/boundary="([^"]+)"/i) || [])[1];
if (!boundary) { console.error('No boundary'); process.exit(1); }
const snapshotLocation = (topHeaders.match(/Snapshot-Content-Location:\s*(.+)/i) || [])[1]?.trim() || null;

const decodeQP = (s) => s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const parts = [];
for (let chunk of body.split('--' + boundary)) {
  chunk = chunk.replace(/^\r?\n/, '');
  if (!chunk.trim() || chunk.trim() === '--') continue;
  const hEnd = chunk.search(/\r?\n\r?\n/);
  if (hEnd === -1) continue;
  const flat = chunk.slice(0, hEnd).replace(/\r?\n[ \t]+/g, ' ');
  const content = chunk.slice(hEnd).replace(/^\r?\n\r?\n/, '');
  const ct = (flat.match(/Content-Type:\s*([^;\r\n]+)/i) || [])[1]?.trim() || 'application/octet-stream';
  const cte = (flat.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i) || [])[1]?.trim().toLowerCase() || '';
  const loc = (flat.match(/Content-Location:\s*([^\r\n]+)/i) || [])[1]?.trim();
  let cid = (flat.match(/Content-ID:\s*([^\r\n]+)/i) || [])[1]?.trim();
  if (cid) cid = cid.replace(/^<|>$/g, '');
  parts.push({ ct, cte, loc, cid, content });
}

let main = parts.find(p => p.ct.toLowerCase() === 'text/html' && snapshotLocation && p.loc === snapshotLocation)
  || parts.find(p => p.ct.toLowerCase() === 'text/html');
if (!main) { console.error('No text/html part'); process.exit(1); }

let html = main.cte === 'base64'
  ? Buffer.from(main.content.replace(/\s+/g, ''), 'base64').toString('utf8')
  : main.cte === 'quoted-printable' ? decodeQP(main.content) : main.content;

const htmlEntityEncode = (u) => u.replace(/&/g, '&amp;');
let inlined = 0;
for (const p of parts) {
  if (p === main) continue;
  const b64 = p.cte === 'base64'
    ? p.content.replace(/\s+/g, '')
    : Buffer.from(p.cte === 'quoted-printable' ? decodeQP(p.content) : p.content, 'latin1').toString('base64');
  const dataUri = `data:${p.ct};base64,${b64}`;
  let hit = false;
  for (const needle of new Set([p.loc, p.loc && htmlEntityEncode(p.loc), p.cid && 'cid:' + p.cid].filter(Boolean))) {
    if (html.includes(needle)) { html = html.split(needle).join(dataUri); hit = true; }
  }
  if (hit) inlined++;
}

fs.writeFileSync(outPath, html, 'utf8');
console.log(`parts=${parts.length} inlined=${inlined} out=${(html.length / 1024 | 0)}KB -> ${outPath}`);
