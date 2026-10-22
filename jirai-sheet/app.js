import { DEFAULT_CATS, PRESETS } from './items.js';

const KEY = 'jirai-sheet-v1';
const W = 1240;
const H = 1754;
const FONT = '"Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", sans-serif';
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.5"/></svg>';

/* ---------- 保存(このブラウザの中) ---------- */
let store = { list: [], cur: null };
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.list)) store = s; } catch (e) { /* なしで動く */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* 保存できなくても動く */ } };
const curItem = () => store.list.find((x) => x.id === store.cur) || null;
const latest = () => [...store.list].sort((a, b) => (b.updated || 0) - (a.updated || 0))[0]?.data || null;

function blank(keep) {
  return {
    title: '',
    color: (keep && keep.color) || PRESETS[0][0],
    heading: (keep && keep.heading) || 'TRPG 地雷・注意事項チェックシート',
    footer: keep && keep.footer != null ? keep.footer : 'チェックがついている要素が含まれます',
    cats: DEFAULT_CATS.map((c) => ({ name: c.name, col: c.col, items: c.items.map((t) => ({ t, on: false })) })),
  };
}

store.cur = null; // 開いたときは、いつも新しいシートから
let S = blank(latest());
let mode = 'check'; // 'check' | 'edit'
let panelOpen = false;
let confirmId = null;

/* ---------- 道具 ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (id) => document.getElementById(id);
const fmtDate = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
let toastT;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2400);
}
const hasContent = () => !!(S.title.trim() || S.cats.some((c) => c.items.some((i) => i.on)));
function commit({ form = false } = {}) {
  let it = curItem();
  if (!it && hasContent()) { it = { id: 'j' + Date.now().toString(36) }; store.list.push(it); store.cur = it.id; }
  if (it) { it.data = JSON.parse(JSON.stringify(S)); it.updated = Date.now(); save(); }
  renderBar();
  if (form) renderForm();
  draw();
}

/** 色を白に混ぜる(紙の色・薄い線に使う) */
function mix(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  const m = (c) => Math.round(c * amt + 255 * (1 - amt));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

/* ---------- 画像を描く ---------- */
const canvas = $('sheet');
const ctx = canvas.getContext('2d');

function wrapLine(text, maxW) {
  if (ctx.measureText(text).width <= maxW) return [text];
  const out = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
  }
  if (line) out.push(line);
  return out;
}

function layout(fs, colW) {
  const box = Math.round(fs * 0.9);
  const textW = colW - box - fs * 0.5;
  const cols = [[], []];
  for (const c of S.cats) {
    const items = c.items.filter((i) => i.t.trim());
    if (!items.length && !c.name.trim()) continue;
    ctx.font = `700 ${fs}px ${FONT}`;
    const lines = items.map((i) => ({ ...i, lines: wrapLine(i.t.trim(), textW) }));
    cols[c.col ? 1 : 0].push({ name: c.name.trim(), items: lines });
  }
  const lh = fs * 1.32;
  const headH = fs * 1.25 * 1.45;
  const gap = fs * 1.05;
  const heights = cols.map((col) => col.reduce((h, c, i) => h + (i ? gap : 0) + headH + c.items.reduce((s, it) => s + it.lines.length * lh, 0), 0));
  return { cols, heights, lh, headH, gap, box };
}

function draw() {
  const color = S.color || PRESETS[0][0];
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  // 外枠と紙
  const M = 34;
  ctx.fillStyle = mix(color, 0.045);
  ctx.fillRect(M, M, W - M * 2, H - M * 2);
  ctx.strokeStyle = '#2b2d31';
  ctx.lineWidth = 3;
  ctx.strokeRect(M, M, W - M * 2, H - M * 2);

  const P = 84; // 内側の余白
  ctx.textBaseline = 'alphabetic';
  // 見出し
  let y = M + 112;
  ctx.fillStyle = '#23262c';
  ctx.textAlign = 'center';
  let hs = 54;
  ctx.font = `900 ${hs}px ${FONT}`;
  while (ctx.measureText(S.heading).width > W - P * 2 && hs > 30) { hs -= 2; ctx.font = `900 ${hs}px ${FONT}`; }
  ctx.fillText(S.heading, W / 2, y);
  // シナリオ名
  y += 74;
  ctx.textAlign = 'left';
  ctx.font = `900 30px ${FONT}`;
  ctx.fillText('シナリオ名:', P, y);
  const lw = ctx.measureText('シナリオ名:').width;
  let ts = 34;
  ctx.font = `700 ${ts}px ${FONT}`;
  while (ctx.measureText(S.title).width > W - P * 2 - lw - 12 && ts > 18) { ts -= 1; ctx.font = `700 ${ts}px ${FONT}`; }
  ctx.fillStyle = color;
  ctx.fillText(S.title, P + lw + 12, y);
  ctx.strokeStyle = mix(color, 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(P + lw + 8, y + 10); ctx.lineTo(W - P, y + 10); ctx.stroke();

  // 2列の項目(いちばん長い列が入る大きさに文字をそろえる)
  const top = y + 52;
  const bottom = H - M - (S.footer.trim() ? 92 : 48);
  const colGap = 40;
  const colW = (W - P * 2 - colGap) / 2;
  let fs = 30;
  let L = layout(fs, colW);
  while (Math.max(...L.heights) > bottom - top && fs > 12) { fs -= 0.5; L = layout(fs, colW); }

  L.cols.forEach((col, ci) => {
    const x0 = P + ci * (colW + colGap);
    let cy = top;
    col.forEach((c, k) => {
      if (k) cy += L.gap;
      ctx.font = `900 ${fs * 1.2}px ${FONT}`;
      ctx.fillStyle = color;
      ctx.fillText(`【${c.name}】`, x0 - fs * 0.15, cy + fs * 1.2);
      cy += L.headH;
      for (const it of c.items) {
        const bx = x0 + fs * 0.1;
        const by = cy + (L.lh - L.box) / 2 - fs * 0.04;
        if (it.on) {
          ctx.fillStyle = color;
          ctx.fillRect(bx, by, L.box, L.box);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(2, fs * 0.13);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(bx + L.box * 0.2, by + L.box * 0.52);
          ctx.lineTo(bx + L.box * 0.42, by + L.box * 0.74);
          ctx.lineTo(bx + L.box * 0.82, by + L.box * 0.28);
          ctx.stroke();
        } else {
          ctx.strokeStyle = '#3a3d42';
          ctx.lineWidth = Math.max(1.5, fs * 0.08);
          ctx.strokeRect(bx, by, L.box, L.box);
        }
        ctx.font = `${it.on ? 900 : 700} ${fs}px ${FONT}`;
        ctx.fillStyle = it.on ? '#1d1f23' : '#55585e';
        it.lines.forEach((ln, li) => ctx.fillText(ln, bx + L.box + fs * 0.4, cy + fs * 1.0 + li * L.lh));
        cy += it.lines.length * L.lh;
      }
    });
  });

  // 下の一文
  if (S.footer.trim()) {
    ctx.textAlign = 'center';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = '#3a3d42';
    const fy = H - M - 46;
    const t = S.footer.trim();
    const tw = ctx.measureText(t).width;
    const bs = 24;
    ctx.fillText(t, W / 2 + (bs + 10) / 2, fy);
    const bx = W / 2 - tw / 2 - (bs + 10) / 2;
    ctx.fillStyle = color;
    ctx.fillRect(bx, fy - bs + 3, bs, bs);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx + bs * 0.2, fy - bs + 3 + bs * 0.52); ctx.lineTo(bx + bs * 0.42, fy - bs + 3 + bs * 0.74); ctx.lineTo(bx + bs * 0.82, fy - bs + 3 + bs * 0.28); ctx.stroke();
    ctx.textAlign = 'left';
  }
  const on = S.cats.reduce((n, c) => n + c.items.filter((i) => i.on && i.t.trim()).length, 0);
  $('meta').textContent = `チェック ${on}項目・文字の大きさ ${Math.round(fs)}`;
}

/* ---------- 入力欄 ---------- */
function renderBar() {
  const cur = curItem();
  $('toolbar').innerHTML = `<span class="now">${cur ? `編集中:<b>${esc(cur.data.title || '(無題)')}</b>` : '新しいシート'}</span>
    <button type="button" class="tbtn" data-new>新しく作る</button>
    <button type="button" class="tbtn" data-list aria-expanded="${panelOpen}">保存したシート(${store.list.length})</button>`;
  const p = $('saved-panel');
  p.hidden = !panelOpen;
  if (!panelOpen) return;
  const list = [...store.list].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  p.innerHTML = `<h2>保存したシート<button type="button" class="mini" data-list>とじる</button></h2>
    ${list.length ? list.map((x) => `<div class="saved-row"><span class="t">${esc(x.data.title || '(無題)')}<span class="d">${fmtDate(x.updated)}</span>${x.id === store.cur ? '<span class="cur">編集中</span>' : ''}</span>
      <button type="button" class="mini" data-open="${x.id}">開く</button>
      <button type="button" class="mini ${confirmId === x.id ? 'sure' : ''}" data-remove="${x.id}">${confirmId === x.id ? '本当に消す' : '消す'}</button></div>`).join('')
    : '<p class="note">まだありません。チェックやシナリオ名を入れると自動で保存されます。</p>'}`;
}

function boothTitles() {
  try { const s = JSON.parse(localStorage.getItem('booth-maker-v1')); return (s && s.list ? s.list : []).map((x) => x.data && x.data.title).filter(Boolean); } catch (e) { return []; }
}

function renderForm() {
  document.documentElement.style.setProperty('--sheet', S.color);
  const titles = boothTitles();
  const on = S.cats.reduce((n, c) => n + c.items.filter((i) => i.on).length, 0);
  const cats = S.cats.map((c, ci) => {
    const n = c.items.filter((i) => i.on).length;
    if (mode === 'check') {
      return `<section class="cat"><div class="cat-h"><span class="name" style="color:${esc(S.color)}">【${esc(c.name)}】</span><span class="n">${n ? `${n}つチェック` : ''}</span></div>
        ${c.items.map((it, ii) => `<button type="button" class="it ${it.on ? 'on' : ''}" data-tog="${ci}.${ii}" role="checkbox" aria-checked="${it.on}"><span class="box">${CHECK}</span><span class="txt">${esc(it.t)}</span></button>`).join('')}
      </section>`;
    }
    return `<section class="cat"><div class="cat-h">
        <input type="text" id="cn${ci}" data-cn="${ci}" value="${esc(c.name)}" aria-label="分類の名前">
        <span class="colsel" role="radiogroup" aria-label="置く列"><button type="button" class="${c.col ? '' : 'on'}" data-col="${ci}" data-v="0" role="radio" aria-checked="${!c.col}">左</button><button type="button" class="${c.col ? 'on' : ''}" data-col="${ci}" data-v="1" role="radio" aria-checked="${!!c.col}">右</button></span>
        <button type="button" class="icon" data-up="${ci}" aria-label="上へ" ${ci ? '' : 'disabled'}>↑</button>
        <button type="button" class="icon" data-down="${ci}" aria-label="下へ" ${ci < S.cats.length - 1 ? '' : 'disabled'}>↓</button>
        <button type="button" class="x" data-delcat="${ci}" aria-label="この分類を消す">×</button></div>
      ${c.items.map((it, ii) => `<div class="ed"><input type="text" id="it${ci}-${ii}" data-it="${ci}.${ii}" value="${esc(it.t)}" aria-label="項目"><button type="button" class="x" data-delit="${ci}.${ii}" aria-label="この項目を消す">×</button></div>`).join('')}
      <button type="button" class="add" data-addit="${ci}">＋ 項目を追加</button>
    </section>`;
  }).join('');
  $('form').innerHTML = `
    <div class="card">
      <label class="f" for="f-title">シナリオ名</label>
      <input type="text" id="f-title" data-k="title" value="${esc(S.title)}" placeholder="魔術師は泣けない">
      ${titles.length ? `<div class="row" style="margin-top:6px"><span class="count">BOOTH説明文メーカーから:</span>${titles.map((t) => `<button type="button" class="chip" data-title="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
      <label class="f" style="margin-top:12px">色</label>
      <div class="swatches">${PRESETS.map(([hex, name]) => `<button type="button" class="sw ${S.color.toLowerCase() === hex ? 'on' : ''}" style="background:${hex}" data-color="${hex}" aria-label="${name}" title="${name}"></button>`).join('')}
        <label class="sw-custom">ほかの色<input type="color" id="f-color" value="${esc(S.color)}"></label></div>
    </div>
    <div class="modebar">
      <span class="seg" role="radiogroup" aria-label="モード"><button type="button" class="${mode === 'check' ? 'on' : ''}" data-mode="check" role="radio" aria-checked="${mode === 'check'}">チェックする</button><button type="button" class="${mode === 'edit' ? 'on' : ''}" data-mode="edit" role="radio" aria-checked="${mode === 'edit'}">項目を編集</button></span>
      <span class="count">チェック <b>${on}</b>項目 ${on ? '<button type="button" class="mini" data-clear>全部はずす</button>' : ''}</span>
    </div>
    ${cats}
    ${mode === 'edit' ? `<button type="button" class="add" data-addcat style="margin:0">＋ 分類を追加</button>
      <div class="card">
        <label class="f" for="f-heading">いちばん上の題名</label><input type="text" id="f-heading" data-k="heading" value="${esc(S.heading)}">
        <label class="f" for="f-footer" style="margin-top:10px">いちばん下の一文(空にすると出しません)</label><input type="text" id="f-footer" data-k="footer" value="${esc(S.footer)}">
        <div class="row" style="margin-top:10px"><button type="button" class="mini" data-reset-items>項目を最初の状態にもどす</button></div>
      </div>` : ''}`;
}

/* ---------- 操作 ---------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (b.id === 'dl' || b.id === 'dl2') { download(); return; }
  if (d.view && b.closest('.tabs')) {
    $('cols').dataset.view = d.view;
    document.querySelectorAll('.tabs button').forEach((x) => { const on = x.dataset.view === d.view; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
    return;
  }
  if (d.tog) {
    const [ci, ii] = d.tog.split('.').map(Number);
    const it = S.cats[ci].items[ii];
    it.on = !it.on;
    b.classList.toggle('on', it.on); b.setAttribute('aria-checked', it.on);
    const n = S.cats[ci].items.filter((i) => i.on).length;
    b.closest('.cat').querySelector('.n').textContent = n ? `${n}つチェック` : '';
    const total = S.cats.reduce((s, c) => s + c.items.filter((i) => i.on).length, 0);
    document.querySelector('.modebar .count').innerHTML = `チェック <b>${total}</b>項目 ${total ? '<button type="button" class="mini" data-clear>全部はずす</button>' : ''}`;
    commit();
    return;
  }
  if (d.mode) { mode = d.mode; renderForm(); return; }
  if (d.color) { S.color = d.color; commit({ form: true }); return; }
  if (d.title) { S.title = d.title; commit({ form: true }); return; }
  if (b.hasAttribute('data-clear')) { S.cats.forEach((c) => c.items.forEach((i) => { i.on = false; })); commit({ form: true }); return; }
  if (d.col) { S.cats[Number(d.col)].col = Number(d.v); commit({ form: true }); return; }
  if (d.up) { const i = Number(d.up); [S.cats[i - 1], S.cats[i]] = [S.cats[i], S.cats[i - 1]]; commit({ form: true }); return; }
  if (d.down) { const i = Number(d.down); [S.cats[i + 1], S.cats[i]] = [S.cats[i], S.cats[i + 1]]; commit({ form: true }); return; }
  if (d.delcat) { S.cats.splice(Number(d.delcat), 1); commit({ form: true }); return; }
  if (d.delit) { const [ci, ii] = d.delit.split('.').map(Number); S.cats[ci].items.splice(ii, 1); commit({ form: true }); return; }
  if (d.addit) { const ci = Number(d.addit); S.cats[ci].items.push({ t: '', on: false }); commit({ form: true }); const el = $(`it${ci}-${S.cats[ci].items.length - 1}`); if (el) el.focus(); return; }
  if (b.hasAttribute('data-addcat')) {
    const l = S.cats.filter((c) => !c.col).reduce((n, c) => n + c.items.length + 2, 0);
    const r = S.cats.filter((c) => c.col).reduce((n, c) => n + c.items.length + 2, 0);
    S.cats.push({ name: '新しい分類', col: l <= r ? 0 : 1, items: [{ t: '', on: false }] });
    commit({ form: true });
    const el = $(`cn${S.cats.length - 1}`); if (el) { el.focus(); el.select(); }
    return;
  }
  if (b.hasAttribute('data-reset-items')) {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'もう一度押すと、項目とチェックが最初の状態にもどります'; return; }
    S.cats = blank(S).cats; commit({ form: true }); toast('項目を最初の状態にもどしました'); return;
  }
  if (b.hasAttribute('data-list')) { panelOpen = !panelOpen; confirmId = null; renderBar(); return; }
  if (d.open) { store.cur = d.open; S = JSON.parse(JSON.stringify(curItem().data)); panelOpen = false; renderBar(); renderForm(); draw(); window.scrollTo(0, 0); return; }
  if (b.hasAttribute('data-new')) { S = blank(S); store.cur = null; panelOpen = false; mode = 'check'; renderBar(); renderForm(); draw(); $('f-title').focus(); return; }
  if (d.remove) {
    const id = d.remove;
    if (confirmId !== id) { confirmId = id; renderBar(); return; }
    store.list = store.list.filter((x) => x.id !== id);
    confirmId = null;
    if (store.cur === id) { store.cur = null; S = blank(S); renderForm(); draw(); }
    save(); renderBar(); toast('消しました');
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.k) { S[t.dataset.k] = t.value; commit(); return; }
  if (t.dataset.cn) { S.cats[Number(t.dataset.cn)].name = t.value; commit(); return; }
  if (t.dataset.it) { const [ci, ii] = t.dataset.it.split('.').map(Number); S.cats[ci].items[ii].t = t.value; commit(); return; }
  if (t.id === 'f-color') { S.color = t.value; document.documentElement.style.setProperty('--sheet', S.color); commit(); document.querySelectorAll('.sw').forEach((x) => x.classList.remove('on')); }
});

function download() {
  draw();
  canvas.toBlob((blob) => {
    if (!blob) { toast('画像を作れませんでした'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `地雷・注意事項チェックシート${S.title.trim() ? `_${S.title.trim()}` : ''}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('画像を保存しました');
  }, 'image/png');
}

/* ---------- はじめ ---------- */
renderBar();
renderForm();
draw();
// 文字の形が届いたら描きなおす
Promise.all([
  document.fonts.load(`700 30px "Zen Kaku Gothic New"`),
  document.fonts.load(`900 30px "Zen Kaku Gothic New"`),
]).then(draw).catch(() => {});
document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', draw);
