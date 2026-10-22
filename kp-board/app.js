import { parseScenario, toScenes, fromScenes, htmlToText, pdfToText } from './parse.js';

const KEY = 'kp-board-v1';
const $app = document.getElementById('app');

/* ---------- 保存(このブラウザの中) ---------- */
let DB = { scenarios: [], tables: [] };
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.scenarios) DB = s; } catch (e) { /* なしで動く */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { toast('保存できませんでした。ブラウザの保存領域がいっぱいかもしれません'); } };

let V = { view: 'home' }; // 画面の状態(保存しない)
let seq = 0;
const uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

/* ---------- 道具 ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad2 = (n) => String(n).padStart(2, '0');
const hm = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const dur = (ms) => { if (ms == null || ms < 0) return '—'; const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}時間${pad2(m % 60)}分`; };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const scn = (id) => DB.scenarios.find((s) => s.id === id);
const tbl = (id) => DB.tables.find((t) => t.id === id);
const allItems = (s) => s.scenes.flatMap((sc) => sc.items.map((it) => ({ ...it, sceneId: sc.id, sceneTitle: sc.title })));
const RESULTS = ['生還', 'ロスト', 'その他'];

let toastT;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2400);
}

function go(view, extra = {}) { V = { view, ...extra }; render(); window.scrollTo(0, 0); }

/* ---------- 描画 ---------- */
function render() {
  const keep = document.activeElement && document.activeElement.id;
  const caret = keep && document.activeElement.selectionStart;
  let html = '';
  if (V.view === 'import') html = importView();
  else if (V.view === 'board') html = boardView();
  else if (V.view === 'compare') html = compareView();
  else html = homeView();
  $app.innerHTML = `<div class="wrap">${html}</div>`;
  if (keep) { const el = document.getElementById(keep); if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* なし */ } } }
}

/* ホーム */
function homeView() {
  const list = DB.scenarios.map((s) => {
    const ts = DB.tables.filter((t) => t.scenarioId === s.id).sort((a, b) => (a.date < b.date ? 1 : -1));
    return `<div class="card scn">
      <div class="scn-head"><b>${esc(s.title)}</b><span class="muted small">HO${s.hoCount}人・シーン${s.scenes.length}・情報${allItems(s).length}</span></div>
      <div class="tables">${ts.map((t) => `<button class="tbl-link" data-act="open-table" data-id="${t.id}"><span>${esc(t.name || '名前なしの卓')}</span><span>${esc(t.date)}${t.endName ? `・${esc(t.endName)}` : t.end ? '・終了' : t.start ? '・進行中' : ''}</span></button>`).join('') || '<span class="muted small">まだ卓がありません</span>'}</div>
      <div class="row">
        <button class="btn primary" data-act="new-table" data-id="${s.id}">＋ 新しい卓</button>
        ${ts.length >= 1 ? `<button class="btn" data-act="compare" data-id="${s.id}">卓をくらべる</button>` : ''}
        <button class="btn ghost" data-act="edit-scn" data-id="${s.id}">シナリオを編集</button>
      </div>
    </div>`;
  }).join('');
  return `<div class="bar"><h1>KP進行ボード</h1><a class="btn ghost small" href="../">道具の一覧</a></div>
    ${DB.scenarios.length ? `<div class="list">${list}</div>` : `<div class="card"><p>シナリオ本文を貼りつけると、シーン・情報・秘匿の一覧を作ります。セッション中は、渡したものにチェックをつけていきます。</p></div>`}
    <div class="row" style="margin-top:14px">
      <button class="btn primary" data-act="new-scn">＋ シナリオを取りこむ</button>
      ${DB.scenarios.length ? '' : '<button class="btn" data-act="sample">見本で試す</button>'}
    </div>
    <h2>バックアップ</h2>
    <p class="muted small">記録はこのブラウザの中にだけ保存されます。ブラウザのデータを消すと消えるので、ときどきファイルに保存しておくと安心です。</p>
    <div class="row">
      <button class="btn" data-act="export">ファイルに保存</button>
      <label class="btn" for="import-file" style="display:inline-block">ファイルから読みこむ</label>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>`;
}

/* 取りこみ・編集 */
function boothScenarios() {
  try {
    const s = JSON.parse(localStorage.getItem('booth-maker-v1'));
    return (s && s.list ? s.list : []).map((x) => x.data).filter((d) => d && d.title);
  } catch (e) { return []; }
}
function importView() {
  const d = V.draft;
  const booth = boothScenarios();
  const cands = d.items.map((it, i) => `<div class="cand c-${it.type}">
      <span class="types" role="radiogroup" aria-label="種類">
        ${[['scene', 'シーン'], ['info', '情報'], ['secret', '秘匿']].map(([k, l]) => `<button type="button" class="t-${k} ${it.type === k ? 'on' : ''}" data-act="ctype" data-i="${i}" data-v="${k}" role="radio" aria-checked="${it.type === k}">${l}</button>`).join('')}
      </span>
      <div><input type="text" id="ct${i}" class="ct" data-ci="${i}" value="${esc(it.text)}" aria-label="内容">
        ${it.type === 'secret' ? `<div class="hos">${Array.from({ length: d.hoCount }, (_, k) => k + 1).map((n) => `<button type="button" class="ho ${it.hos.includes(n) ? 'on' : ''}" data-act="cho" data-i="${i}" data-n="${n}" aria-pressed="${it.hos.includes(n)}">HO${n}</button>`).join('')}</div>` : ''}
      </div>
      <button type="button" class="x" data-act="cdel" data-i="${i}" aria-label="この行を消す">×</button>
    </div>`).join('');
  const counts = ['scene', 'info', 'secret'].map((t) => d.items.filter((x) => x.type === t).length);
  return `<div class="bar"><button class="back" data-act="home" aria-label="もどる">←</button><h1>${d.id ? 'シナリオを編集' : 'シナリオを取りこむ'}</h1></div>
    ${booth.length && !d.id ? `<p class="small muted">BOOTH説明文メーカーのシナリオから、タイトルとHOを入れる:
      ${booth.map((b, i) => `<button class="chip" data-act="from-booth" data-i="${i}">${esc(b.title)}</button>`).join(' ')}</p>` : ''}
    <label class="f" for="d-title">タイトル</label><input type="text" id="d-title" data-d="title" value="${esc(d.title)}">
    <div class="row" style="align-items:flex-end">
      <div style="width:7em"><label class="f" for="d-ho">HOの数</label><input type="text" id="d-ho" data-d="hoCount" inputmode="numeric" value="${d.hoCount}"></div>
      <div style="flex:1;min-width:12em"><label class="f" for="d-ends">END(1行に1つ)</label><textarea id="d-ends" data-d="ends" style="min-height:64px">${esc(d.ends)}</textarea></div>
    </div>
    <label class="f" for="d-text">シナリオ本文</label>
    <div class="card small" style="margin-bottom:8px">
      <b>いちばん正確なのは、Googleドキュメントのファイルを読みこむ方法です。</b><br>
      Googleドキュメントで[ファイル]→[ダウンロード]→[Markdown(.md)]を選んで保存し、下のボタンで読みこんでください。
      PDFや、本文のコピー&貼りつけでも読めます(PDFは見出しがわからないので、少し精度が下がります)。本文はこのブラウザの外には送りません。
      <div class="row" style="margin-top:8px"><label class="btn primary" for="src-file">ファイルを読みこむ(.md / .pdf / .txt)</label>
      <input type="file" id="src-file" accept=".md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf" hidden>
      ${V.loading ? `<span class="small muted">${esc(V.loading)}</span>` : ''}</div>
    </div>
    <textarea id="d-text" data-d="text" placeholder="ここにシナリオ本文を貼りつけ">${esc(d.text)}</textarea>
    <div class="row" style="margin-top:8px"><button class="btn primary" data-act="parse" ${d.text.trim() ? '' : 'disabled'}>本文から拾う</button>
      ${d.items.length ? '<span class="small muted">拾いなおすと、下の一覧は作りなおしになります</span>' : ''}</div>
    ${d.items.length ? `<h2>拾った内容を確認</h2>
      <p class="small muted">シーン${counts[0]}・情報${counts[1]}・秘匿${counts[2]}。種類がちがうものは切りかえ、いらないものは×で消してください。秘匿は渡す相手のHOを選びます。</p>
      <div>${cands}</div>` : ''}
    <div class="row" style="margin-top:10px"><button class="btn" data-act="cadd" data-v="scene">＋ シーン</button><button class="btn" data-act="cadd" data-v="info">＋ 情報</button><button class="btn" data-act="cadd" data-v="secret">＋ 秘匿</button></div>
    <div class="row" style="margin-top:18px">
      <button class="btn primary" data-act="save-scn" ${d.title.trim() && d.items.length ? '' : 'disabled'}>保存する</button>
      <button class="btn ghost" data-act="home">やめる</button>
      ${d.id ? `<span style="flex:1"></span>${V.confirmDel ? `<span class="confirm"><span class="small">卓の記録も消えます</span><button class="btn danger" data-act="del-scn">消す</button><button class="btn ghost" data-act="del-cancel">やめる</button></span>` : '<button class="btn danger ghost" data-act="del-ask">このシナリオを消す</button>'}` : ''}
    </div>`;
}

/* 卓 */
function sceneDone(s, t) {
  return s.items.filter((it) => t.checked[it.id]).length;
}
function boardView() {
  const t = tbl(V.id); const s = scn(t.scenarioId);
  const filter = V.filter || 'all';
  const now = Date.now();
  const elapsed = t.start ? (t.end ? new Date(t.end) : now) - new Date(t.start) : null;
  const openSet = new Set(t.open || []);
  const scenes = s.scenes.map((sc) => {
    let items = sc.items;
    if (filter === 'todo') items = items.filter((it) => !t.checked[it.id]);
    if (filter === 'secret') items = items.filter((it) => it.type === 'secret' && !t.checked[it.id]);
    if (filter !== 'all' && !items.length) return '';
    const done = sceneDone(sc, t);
    const open = filter !== 'all' || openSet.has(sc.id);
    return `<section class="scene ${open ? 'open' : ''}">
      <button class="scene-h" data-act="toggle-scene" data-id="${sc.id}" aria-expanded="${open}">
        <span class="arrow">▶</span><span class="t">${esc(sc.title)}</span>
        ${t.curScene === sc.id ? '<span class="cur">いまここ</span>' : ''}
        ${sc.items.length ? `<span class="n ${done === sc.items.length ? 'all' : ''}">${done}/${sc.items.length}</span>` : ''}
      </button>
      ${open ? `<div class="items">${items.length ? items.map((it) => {
        const at = t.checked[it.id];
        return `<button class="item ${it.type} ${at ? 'done' : ''}" data-act="check" data-id="${it.id}" data-scene="${sc.id}" aria-pressed="${!!at}">
          <span class="box">${at ? '✓' : ''}</span><span class="it">${esc(it.text)}</span>
          <span>${it.type === 'secret' ? `<span class="tag secret">${it.hos.length ? it.hos.map((n) => `HO${n}`).join('・') : '秘匿'}</span>` : ''}${at ? ` <span class="when">${hm(at)}</span>` : ''}</span>
        </button>`;
      }).join('') : '<p class="empty">このシーンには、チェックする項目がありません。</p>'}</div>` : ''}
    </section>`;
  }).join('');
  const total = allItems(s).length;
  const doneAll = allItems(s).filter((it) => t.checked[it.id]).length;
  const secretLeft = allItems(s).filter((it) => it.type === 'secret' && !t.checked[it.id]).length;
  const pls = Array.from({ length: s.hoCount }, (_, i) => t.pls[i] || { pl: '', pc: '' });
  const curTitle = (s.scenes.find((x) => x.id === t.curScene) || {}).title;
  return `<div class="bar"><button class="back" data-act="home" aria-label="もどる">←</button><h1>${esc(t.name || '名前なしの卓')}<small>${esc(s.title)}</small></h1></div>
    <div class="board">
      <div class="main list">
        <div class="card status">
          <span class="clock">${t.start ? `開始 ${hm(t.start)}${t.end ? `・終了 ${hm(t.end)}` : ''}・${dur(elapsed)}` : 'まだ始まっていません'}</span>
          ${!t.start ? '<button class="btn primary" data-act="start">セッション開始</button>' : !t.end ? '<button class="btn" data-act="finish">セッション終了</button>' : '<button class="btn ghost small" data-act="reopen">終了を取り消す</button>'}
        </div>
        <div class="chips" role="radiogroup" aria-label="表示">
          ${[['all', `すべて(${doneAll}/${total})`], ['todo', 'まだのもの'], ['secret', `渡していない秘匿(${secretLeft})`]].map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-act="filter" data-v="${k}" role="radio" aria-checked="${filter === k}">${l}</button>`).join('')}
        </div>
        ${scenes || '<p class="muted">表示するものはありません。</p>'}
      </div>
      <div class="side list">
        <div class="card">
          <h2 style="margin-top:0">卓の情報</h2>
          <div class="row"><div style="flex:1;min-width:9em"><label class="f" for="t-name">卓の名前</label><input type="text" id="t-name" data-t="name" value="${esc(t.name)}" placeholder="テストプレイ1卓目"></div>
          <div style="width:10.5em"><label class="f" for="t-date">日付</label><input type="date" id="t-date" data-t="date" value="${esc(t.date)}"></div></div>
          <label class="f">PLとPC</label>
          <div class="pls"><span></span><span class="h">PL</span><span class="h">PC</span>
            ${pls.map((p, i) => `<b class="small">HO${i + 1}</b><input type="text" id="pl${i}" data-pl="${i}" data-f="pl" value="${esc(p.pl)}" aria-label="HO${i + 1}のPL"><input type="text" id="pc${i}" data-pl="${i}" data-f="pc" value="${esc(p.pc)}" aria-label="HO${i + 1}のPC">`).join('')}</div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">メモ・気づき <span class="muted small">${t.notes.length}件</span></h2>
          <div class="notes">${t.notes.length ? [...t.notes].reverse().map((n, ri) => { const i = t.notes.length - 1 - ri; const st = (s.scenes.find((x) => x.id === n.sceneId) || {}).title; return `<div class="note"><div><div class="meta">${hm(n.t)}${st ? `・${esc(st)}` : ''}</div>${esc(n.text)}</div><button class="x" data-act="note-del" data-i="${i}" aria-label="このメモを消す">×</button></div>`; }).join('') : '<p class="muted small" style="margin:0">下の欄から、いつでも書けます。詰まったところ、時間がかかったところ、直したいところなど。</p>'}</div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">END</h2>
          ${s.ends.length ? `<div class="seg" role="radiogroup" aria-label="到達したEND">${s.ends.map((e) => `<button class="${t.endName === e ? 'on' : ''}" data-act="end" data-v="${esc(e)}" role="radio" aria-checked="${t.endName === e}">${esc(e)}</button>`).join('')}</div>` : '<p class="muted small" style="margin:0">ENDは「シナリオを編集」で登録できます。</p>'}
          <label class="f">PCごとの結果</label>
          <div class="res">${pls.map((p, i) => `<b class="small">HO${i + 1}</b><span class="small">${esc(p.pc || p.pl || '')}</span><span class="seg">${RESULTS.map((r) => `<button class="${(t.results[i] || '') === r ? 'on' : ''} ${r === 'ロスト' ? 'lost' : ''}" data-act="result" data-i="${i}" data-v="${r}" aria-pressed="${(t.results[i] || '') === r}">${r}</button>`).join('')}</span>`).join('')}</div>
        </div>
        <div class="row">${V.confirmDel ? `<span class="confirm"><span class="small">この卓の記録を消しますか?</span><button class="btn danger" data-act="del-table">消す</button><button class="btn ghost" data-act="del-cancel">やめる</button></span>` : '<button class="btn ghost danger" data-act="del-ask">この卓を消す</button>'}</div>
      </div>
    </div>
    <div class="memo-bar">
      <div class="scene-name">${curTitle ? `「${esc(curTitle)}」のメモとして残ります` : 'メモ'}</div>
      <form data-form="memo"><input type="text" id="memo" placeholder="気づいたことをメモ(Enterで追加)" autocomplete="off"><button class="btn primary" type="submit">追加</button></form>
    </div>`;
}

/* くらべる */
function compareView() {
  const s = scn(V.id);
  const ts = DB.tables.filter((t) => t.scenarioId === s.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const items = allItems(s);
  const sceneReach = (t, sc) => {
    const times = sc.items.map((it) => t.checked[it.id]).filter(Boolean).sort();
    if (!times.length || !t.start) return '—';
    return dur(new Date(times[0]) - new Date(t.start)).replace('時間', ':').replace('分', '');
  };
  const rows = ts.map((t) => {
    const done = items.filter((it) => t.checked[it.id]).length;
    const ms = t.start && t.end ? new Date(t.end) - new Date(t.start) : null;
    return `<tr><td><button class="btn ghost small" data-act="open-table" data-id="${t.id}">${esc(t.name || '名前なし')}</button></td><td>${esc(t.date)}</td><td>${dur(ms)}</td><td>${esc(t.endName || '—')}</td>
      <td>${Array.from({ length: s.hoCount }, (_, i) => `HO${i + 1}:${esc(t.results[i] || '—')}`).join('<br>')}</td>
      <td>${items.length ? Math.round((done / items.length) * 100) : 0}%</td><td>${t.notes.length}</td></tr>`;
  }).join('');
  const missed = items.filter((it) => it.type === 'info' || it.type === 'secret').map((it) => ({ it, n: ts.filter((t) => t.checked[it.id]).length }))
    .sort((a, b) => a.n - b.n);
  const missRows = missed.slice(0, 30).map(({ it, n }) => {
    const r = ts.length ? n / ts.length : 0;
    return `<tr><td><span class="meter ${r < 0.5 ? 'low' : ''}"><i style="width:${Math.round(r * 100)}%"></i></span>${n}/${ts.length}卓</td><td class="wrap">${esc(it.text)}${it.type === 'secret' ? ` <span class="tag secret">${it.hos.length ? it.hos.map((x) => `HO${x}`).join('・') : '秘匿'}</span>` : ''}</td><td class="wrap muted">${esc(it.sceneTitle)}</td></tr>`;
  }).join('');
  const reach = s.scenes.filter((sc) => sc.items.length).map((sc) => `<tr><td class="wrap">${esc(sc.title)}</td>${ts.map((t) => `<td>${sceneReach(t, sc)}</td>`).join('')}</tr>`).join('');
  const notesByScene = s.scenes.map((sc) => {
    const ns = ts.flatMap((t) => t.notes.filter((n) => n.sceneId === sc.id).map((n) => ({ ...n, tname: t.name || '名前なし' })));
    return ns.length ? `<h3 class="small" style="margin:12px 0 4px">${esc(sc.title)}</h3>${ns.map((n) => `<div class="note"><div><div class="meta">${esc(n.tname)}・${hm(n.t)}</div>${esc(n.text)}</div></div>`).join('')}` : '';
  }).join('');
  const other = ts.flatMap((t) => t.notes.filter((n) => !n.sceneId || !s.scenes.some((sc) => sc.id === n.sceneId)).map((n) => ({ ...n, tname: t.name || '名前なし' })));
  return `<div class="bar"><button class="back" data-act="home" aria-label="もどる">←</button><h1>卓をくらべる<small>${esc(s.title)}</small></h1></div>
    <div class="card tbl-wrap"><table><thead><tr><th>卓</th><th>日付</th><th>所要時間</th><th>END</th><th>PCの結果</th><th>チェック済み</th><th>メモ</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h2>見落とされやすい情報</h2>
    <p class="small muted">チェックがついた卓の数が少ない順です。出し方や置き場所を見直す手がかりにしてください。</p>
    <div class="card tbl-wrap"><table><thead><tr><th>出せた卓</th><th>情報</th><th>シーン</th></tr></thead><tbody>${missRows || '<tr><td colspan="3" class="muted">情報がありません</td></tr>'}</tbody></table></div>
    ${ts.length && reach ? `<h2>シーンにたどりついた時間</h2>
      <p class="small muted">開始から、そのシーンで最初にチェックをつけたまでの時間です(時:分)。</p>
      <div class="card tbl-wrap"><table><thead><tr><th>シーン</th>${ts.map((t) => `<th>${esc(t.name || '名前なし')}</th>`).join('')}</tr></thead><tbody>${reach}</tbody></table></div>` : ''}
    <h2>メモ・気づき(全卓)</h2>
    <div class="row" style="margin-bottom:8px"><button class="btn" data-act="copy-notes">文字でコピー</button></div>
    <div class="card list">${notesByScene || ''}${other.length ? `<h3 class="small" style="margin:12px 0 4px">シーンなし</h3>${other.map((n) => `<div class="note"><div><div class="meta">${esc(n.tname)}・${hm(n.t)}</div>${esc(n.text)}</div></div>`).join('')}` : ''}${notesByScene || other.length ? '' : '<p class="muted small" style="margin:0">まだメモがありません。</p>'}</div>`;
}

/* ---------- 操作 ---------- */
function newDraft(s) {
  if (s) return { id: s.id, title: s.title, hoCount: s.hoCount, ends: s.ends.join('\n'), text: '', items: fromScenes(s.scenes) };
  return { id: null, title: '', hoCount: 4, ends: '', text: '', items: [] };
}

const SAMPLE_TEXT = `# 見本シナリオ

## ▼ 概要 ▼
人　　数:2人

## 秘匿HO
| HO1:貴方は探偵だ。 |
| HO2:貴方は記者だ。 |

## 【導入】
雪国の町に到着する。
| 強制【アイデア】 最近、この町で人が消えているという。 |
| :---- |

## 【図書館】
| 【図書館】 成功時 古い新聞に、50年前の失踪事件の記事がある。 |
| :---- |
| 【HO1秘匿情報】 記事の写真に、あなたの祖父が写っている。 |
| :---- |

### 【閲覧室】

### 【書庫】
| 【目星】 成功時 床に、引きずったような跡がある。 |
| :---- |

## 【雪原の小屋】
| 〈古い日記〉 3日目。風の音が、名前を呼ぶ。 |
| :---- |
| 【HO2秘匿情報】 小屋の主は、あなたの取材相手だった。 |
| :---- |

## 【エンディング】
### END-A:雪どけ
### END-B:凍てつく町

## 【あとがき】
ありがとうございました。`;

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const t = V.view === 'board' ? tbl(V.id) : null;
  switch (act) {
    case 'home': go('home'); break;
    case 'new-scn': go('import', { draft: newDraft() }); break;
    case 'sample': go('import', { draft: { ...newDraft(), hoCount: 2, text: SAMPLE_TEXT } }); runParse(); break;
    case 'edit-scn': go('import', { draft: newDraft(scn(b.dataset.id)) }); break;
    case 'from-booth': {
      const d = boothScenarios()[Number(b.dataset.i)];
      V.draft.title = d.title;
      const n = (d.hos || []).filter((h) => h[0]).length;
      if (n) V.draft.hoCount = n;
      render();
      break;
    }
    case 'parse': runParse(); break;
    case 'ctype': { const it = V.draft.items[Number(b.dataset.i)]; it.type = b.dataset.v; if (it.type !== 'secret') it.hos = []; render(); break; }
    case 'cho': { const it = V.draft.items[Number(b.dataset.i)]; const n = Number(b.dataset.n); it.hos = it.hos.includes(n) ? it.hos.filter((x) => x !== n) : [...it.hos, n].sort(); render(); break; }
    case 'cdel': V.draft.items.splice(Number(b.dataset.i), 1); render(); break;
    case 'cadd': V.draft.items.push({ id: uid(b.dataset.v[0]), type: b.dataset.v, text: '', hos: [] }); render(); { const els = document.querySelectorAll('.ct'); const el = els[els.length - 1]; if (el) el.focus(); } break;
    case 'save-scn': {
      const d = V.draft;
      const items = d.items.filter((x) => x.text.trim());
      const rec = { id: d.id || uid('S'), title: d.title.trim(), hoCount: Math.max(1, Math.min(9, Number(d.hoCount) || 1)), ends: d.ends.split('\n').map((x) => x.trim()).filter(Boolean), scenes: toScenes(items) };
      if (d.id) DB.scenarios = DB.scenarios.map((x) => (x.id === d.id ? rec : x)); else DB.scenarios.push(rec);
      save(); toast('保存しました'); go('home');
      break;
    }
    case 'del-ask': V.confirmDel = true; render(); break;
    case 'del-cancel': V.confirmDel = false; render(); break;
    case 'del-scn': { const id = V.draft.id; DB.scenarios = DB.scenarios.filter((x) => x.id !== id); DB.tables = DB.tables.filter((x) => x.scenarioId !== id); save(); toast('消しました'); go('home'); break; }
    case 'new-table': {
      const s = scn(b.dataset.id);
      const n = DB.tables.filter((x) => x.scenarioId === s.id).length + 1;
      const rec = { id: uid('T'), scenarioId: s.id, name: `${n}卓目`, date: todayStr(), pls: [], start: null, end: null, checked: {}, notes: [], endName: '', results: [], open: s.scenes.length ? [s.scenes[0].id] : [], curScene: s.scenes.length ? s.scenes[0].id : null };
      DB.tables.push(rec); save(); go('board', { id: rec.id });
      break;
    }
    case 'open-table': go('board', { id: b.dataset.id }); break;
    case 'compare': go('compare', { id: b.dataset.id }); break;
    case 'toggle-scene': {
      const id = b.dataset.id; const set = new Set(t.open || []);
      if (set.has(id)) set.delete(id); else { set.add(id); t.curScene = id; }
      t.open = [...set]; save(); render();
      break;
    }
    case 'check': {
      const id = b.dataset.id;
      if (t.checked[id]) delete t.checked[id]; else { t.checked[id] = new Date().toISOString(); t.curScene = b.dataset.scene; if (!t.start) t.start = t.checked[id]; }
      save(); render();
      break;
    }
    case 'filter': V.filter = b.dataset.v; render(); break;
    case 'start': t.start = new Date().toISOString(); save(); render(); break;
    case 'finish': t.end = new Date().toISOString(); save(); render(); toast('終了の時刻を記録しました'); break;
    case 'reopen': t.end = null; save(); render(); break;
    case 'end': t.endName = t.endName === b.dataset.v ? '' : b.dataset.v; save(); render(); break;
    case 'result': { const i = Number(b.dataset.i); t.results[i] = t.results[i] === b.dataset.v ? '' : b.dataset.v; save(); render(); break; }
    case 'note-del': t.notes.splice(Number(b.dataset.i), 1); save(); render(); break;
    case 'del-table': { const sid = t.scenarioId; DB.tables = DB.tables.filter((x) => x.id !== t.id); save(); toast('消しました'); go('home'); break; }
    case 'copy-notes': {
      const s = scn(V.id);
      const ts = DB.tables.filter((x) => x.scenarioId === s.id);
      const lines = [`【${s.title}】メモ・気づき`];
      for (const sc of s.scenes) {
        const ns = ts.flatMap((x) => x.notes.filter((n) => n.sceneId === sc.id).map((n) => `・${n.text}(${x.name || '名前なし'})`));
        if (ns.length) lines.push('', `■${sc.title}`, ...ns);
      }
      const txt = lines.join('\n');
      navigator.clipboard.writeText(txt).then(() => toast('コピーしました'), () => toast('コピーできませんでした'));
      break;
    }
    case 'export': {
      const blob = new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kp-board-${todayStr()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      break;
    }
    default: break;
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.d && V.draft) {
    V.draft[el.dataset.d] = el.value;
    if (el.dataset.d === 'text' || el.dataset.d === 'title') {
      const p = document.querySelector('[data-act="parse"]'); if (p) p.disabled = !V.draft.text.trim();
      const s = document.querySelector('[data-act="save-scn"]'); if (s) s.disabled = !(V.draft.title.trim() && V.draft.items.length);
    }
    return;
  }
  if (el.dataset.ci && V.draft) { V.draft.items[Number(el.dataset.ci)].text = el.value; return; }
  const t = V.view === 'board' ? tbl(V.id) : null;
  if (!t) return;
  if (el.dataset.t) { t[el.dataset.t] = el.value; save(); }
  if (el.dataset.pl) { const i = Number(el.dataset.pl); t.pls[i] = { ...(t.pls[i] || { pl: '', pc: '' }), [el.dataset.f]: el.value }; save(); }
});
function runParse() {
  const d = V.draft;
  const { items, ends } = parseScenario(d.text);
  d.items = items;
  if (!d.ends.trim() && ends.length) d.ends = ends.join('\n');
  if (!d.title.trim()) {
    const m = d.text.match(/^#\s+(.+)$/m);
    if (m && !/^タブ/.test(m[1].trim())) d.title = m[1].trim();
  }
  render();
  if (!items.length) toast('拾えるものがありませんでした。下のボタンから手で追加できます');
  else toast(`${items.filter((x) => x.type !== 'scene').length}件の情報・秘匿を拾いました。確認してください`);
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'src-file' && e.target.files[0] && V.draft) {
    const f = e.target.files[0];
    e.target.value = '';
    const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    V.loading = isPdf ? 'PDFを読んでいます…' : '読みこんでいます…';
    render();
    const job = isPdf ? pdfToText(f, (p, n) => { V.loading = `PDFを読んでいます(${p}/${n}ページ)`; const el = document.querySelector('.card .small.muted'); if (el) el.textContent = V.loading; }) : f.text();
    job.then((text) => {
      V.loading = '';
      V.draft.text = text;
      runParse();
      if (!V.draft.title.trim()) { V.draft.title = f.name.replace(/\.(md|markdown|txt|pdf)$/i, ''); render(); }
    }).catch((err) => { V.loading = ''; render(); toast(err && err.message ? err.message : 'ファイルを読めませんでした'); });
    return;
  }
  if (e.target.dataset.d === 'hoCount' && V.draft) render();
  if (e.target.id === 'import-file' && e.target.files[0]) {
    const f = e.target.files[0];
    f.text().then((txt) => {
      const d = JSON.parse(txt);
      if (!d || !Array.isArray(d.scenarios) || !Array.isArray(d.tables)) throw new Error('bad');
      const ids = new Set(DB.scenarios.map((x) => x.id));
      const tids = new Set(DB.tables.map((x) => x.id));
      DB.scenarios.push(...d.scenarios.filter((x) => !ids.has(x.id)));
      DB.tables.push(...d.tables.filter((x) => !tids.has(x.id)));
      save(); render(); toast('読みこみました(同じものは重ねて入れません)');
    }).catch(() => toast('このファイルは読みこめませんでした'));
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.dataset.form !== 'memo') return;
  e.preventDefault();
  const input = document.getElementById('memo');
  const text = input.value.trim();
  if (!text) return;
  const t = tbl(V.id);
  t.notes.push({ t: new Date().toISOString(), sceneId: t.curScene || null, text });
  save(); render();
  document.getElementById('memo').focus();
});
document.addEventListener('paste', (e) => {
  if (e.target.id !== 'd-text') return;
  const html = e.clipboardData && e.clipboardData.getData('text/html');
  if (!html) return;
  const txt = htmlToText(html);
  if (!txt.trim()) return;
  e.preventDefault();
  const el = e.target;
  const v = el.value;
  el.value = v.slice(0, el.selectionStart) + txt + v.slice(el.selectionEnd);
  V.draft.text = el.value;
  const p = document.querySelector('[data-act="parse"]'); if (p) p.disabled = false;
});

// 経過時間の表示を1分ごとに更新(入力中はさわらない)
setInterval(() => {
  if (V.view !== 'board') return;
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
  const t = tbl(V.id);
  if (t && t.start && !t.end) render();
}, 60000);

render();
