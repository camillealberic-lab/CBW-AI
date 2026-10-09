// Génère site/aide.html à partir de docs/aide/AIDE.md (source unique de l'aide).
// Usage : node site/_build/build-aide.mjs
// Convertisseur Markdown minimal : titres, paragraphes, listes, tableaux, code, gras, liens, code en ligne.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..');
const md = readFileSync(join(site, '../docs/aide/AIDE.md'), 'utf8');
const tpl = readFileSync(join(here, 'aide.template.html'), 'utf8');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Même règle que GitHub : minuscules, ponctuation retirée, espaces → tirets (accents conservés).
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => {
    const ext = /^https?:/.test(u);
    return `<a href="${u}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
  return s;
}

const lines = md.split('\n');
const out = [];
const toc = [];
let title = '';
let intro = [];
let i = 0;
const isBlockStart = (l) => /^(#{1,3} |[-*] |\d+\. |\||```|---$|>)/.test(l.trim()) || l.trim() === '';

while (i < lines.length) {
  const l = lines[i];
  const t = l.trim();
  if (t === '') { i++; continue; }
  let m;
  if ((m = /^(#{1,3}) (.*)$/.exec(t))) {
    const lvl = m[1].length, txt = m[2];
    if (lvl === 1) { title = txt; i++; continue; }
    const id = slug(txt);
    toc.push({ lvl, id, txt });
    out.push(`<h${lvl} id="${id}">${inline(txt)}</h${lvl}>`);
    i++; continue;
  }
  if (t === '---') { i++; continue; }
  if (t.startsWith('```')) {
    const buf = []; i++;
    while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i].trim()), i++;
    i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
  }
  if (t.startsWith('|')) {
    const rows = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i].trim()), i++;
    const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    out.push('<div class="tbl"><table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>' +
      body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
    continue;
  }
  if (/^([-*]|\d+\.) /.test(t)) {
    const ordered = /^\d+\./.test(t);
    const items = [];
    while (i < lines.length) {
      const cur = lines[i];
      if (/^([-*]|\d+\.) /.test(cur.trim()) && !/^\s{2,}/.test(cur)) { items.push({ text: cur.trim().replace(/^([-*]|\d+\.) /, ''), extra: [] }); i++; continue; }
      if (/^\s{2,}\S/.test(cur) && items.length) { // contenu indenté (paragraphe ou code)
        if (cur.trim().startsWith('```')) {
          const buf = []; i++;
          while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i].trim()), i++;
          i++; items[items.length - 1].extra.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
        }
        items[items.length - 1].extra.push(`<p>${inline(cur.trim())}</p>`); i++; continue;
      }
      if (cur.trim() === '' && i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && items.length) { i++; continue; }
      break;
    }
    const tag = ordered ? 'ol' : 'ul';
    out.push(`<${tag}>` + items.map((it) => `<li>${inline(it.text)}${it.extra.join('')}</li>`).join('') + `</${tag}>`);
    continue;
  }
  // paragraphe
  const buf = [];
  while (i < lines.length && !isBlockStart(lines[i])) buf.push(lines[i].trim()), i++;
  if (!buf.length) { buf.push(t); i++; }
  const p = `<p>${inline(buf.join(' '))}</p>`;
  if (!toc.length) intro.push(p); else out.push(p);
}

const tocHtml = toc.map((h) => `<li${h.lvl === 3 ? ' class="sub"' : ''}><a href="#${h.id}">${inline(h.txt)}</a></li>`).join('');
const tocMobile = toc.filter((h) => h.lvl === 2).map((h) => `<li><a href="#${h.id}">${inline(h.txt)}</a></li>`).join('');

const html = tpl
  .replace('{{TITLE}}', esc(title))
  .replace('{{INTRO}}', intro.join('\n'))
  .replace('{{TOC}}', tocHtml)
  .replace('{{TOC_MOBILE}}', tocMobile)
  .replace('{{CONTENT}}', out.join('\n'));
writeFileSync(join(site, 'aide.html'), html);
console.log('aide.html généré :', toc.length, 'titres');
console.log(toc.map((h) => '  ' + '#'.repeat(h.lvl) + ' ' + h.id).join('\n'));
