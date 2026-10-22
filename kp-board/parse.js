// シナリオ本文から、シーン・情報・秘匿・ENDを拾う
//
// いちばん正確なのは、Googleドキュメントの「ダウンロード → Markdown」のファイル。
//   ・## / ### の見出し      → シーン(目次・概要・解説・あとがきなどは除く)
//   ・| 【目星】… | の囲み     → 情報
//   ・【HO2秘匿情報】を含む囲み → 秘匿(HO2あて)
//   ・END-A:〜 の見出し      → END
//   ・「秘匿HO」の章の HO1: … → 秘匿HOを渡したか
// 見出しのない文字(PDFなど)は、【 】や「強制【アイデア】」などを手がかりに拾う。

let seq = 0;
const uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
const toHalf = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** Markdown の印をはずして、ふつうの文字にする */
export function plain(s) {
  return String(s || '')
    .replace(/\{#[^}]*\}/g, '')
    .replace(/\\([\[\]&~\-+*_<>#|.!()`])/g, '$1')
    .replace(/\*\*|__|\*(?=\S)|(?<=\S)\*/g, '')
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[​ ]/g, ' ')
    .replace(/[\s　]+/g, ' ')
    .trim();
}

// 技能・ダイスの名前(【 】の中にあれば、シーンではなくダイス)
const SKILLS = ['目星', '聞き耳', '図書館', 'アイデア', '知識', '幸運', '歴史', 'オカルト', '心理学', '医学', '薬学', '化学', '生物学',
  '博物学', '地質学', '天文学', '物理学', '人類学', '考古学', '法律', '経理', '応急手当', '精神分析', '説得', '言いくるめ', '信用', '値切り',
  '鍵開け', '機械修理', '電気修理', 'コンピューター', 'コンピュータ', '写真術', '追跡', '隠れる', '忍び歩き', '回避', '跳躍', '登攀', '水泳',
  '運転', '操縦', '乗馬', '変装', 'ナビゲート', '芸術', '製作', '母国語', '英語', 'クトゥルフ神話', '投擲', 'こぶし', 'キック', '組み付き',
  '頭突き', '拳銃', 'ライフル', 'ショットガン', 'マシンガン', 'サブマシンガン', '交渉', '魅惑', '威圧', '鑑定', 'サバイバル', '自然'];
const DICE = new RegExp(`${SKILLS.join('|')}|STR|CON|POW|DEX|APP|SIZ|INT|EDU|SAN|×\\s*[0-9]|[xX]\\s*[0-9]|対抗|ロール|技能|判定|ダイス|[0-9]+\\s*[dD]\\s*[0-9]+`);
/**
 * 【 】の行が、ダイス・秘匿か(=シーンではない)。
 * exact:true のときは【目星】【HO2秘匿情報】のように中身がそれだけのときに限る(見出しに使う)
 */
export function isDiceOrSecret(t, exact = false) {
  const m = t.match(/^(強制\s*)?【([^】]{1,24})】/);
  if (!m) return false;
  const inner = m[2].trim();
  if (/HO[^】]*秘匿|^秘匿情報/.test(inner)) return true;
  if (inner === '戦闘' || /^SAN/.test(inner)) return true;
  const parts = inner.split(/[\/／・、]/).map((x) => x.replace(/[+＋\-－]?\s*[0-9]+%?$/, '').trim());
  if (parts.every((x) => SKILLS.includes(x) || /^(STR|CON|POW|DEX|APP|SIZ|INT|EDU)\s*(×|x|X)?\s*[0-9]*$/.test(x) || /対抗$/.test(x))) return true;
  return !exact && !!m[1] && DICE.test(inner); // 「強制【…】」はダイス
}

const FRONT = /目次|概要|あらすじ|世界観|共通HO|公開HO|KP用情報|KP・PL共通|シナリオ情報|システムについて|表色|^タブ/;
const BACK = /生還報酬|クリア報酬|解説|あとがき|注意事項/;
const ENDING = /エンディング|END分岐/;
const END_NAME = /^[〇○◯・]?\s*(END|ＥＮＤ)\s*[-‐ー－]?\s*[A-Za-z0-9α-ωΑ-Ω]/i;

/** 囲みの中身から、情報・秘匿かどうかを判定(strict:行の頭が【 か 強制【 か 〈 のときだけ) */
function boxItem(text, strict = false) {
  const t = plain(text);
  if (strict && !/^(強制\s*)?[【〈]/.test(t)) return null;
  if (!t) return null;
  if (/探索可能|←\s*現在|現在地/.test(t)) return null; // 行き先の案内は情報ではない
  const sec = t.match(/【\s*((?:HO\s*[0-9０-９]\s*[&＆・、,と]?\s*)+)\s*秘匿/i) || t.match(/【([^】]*HO[^】]*)秘匿[^】]*】/i);
  if (sec) {
    const hos = [...new Set([...toHalf(sec[1]).matchAll(/([0-9])/g)].map((m) => Number(m[1])))].sort();
    return { type: 'secret', text: shorten(t), hos };
  }
  if (/^.{0,10}?【[^】]{1,24}】/.test(t) && !/^【[^】]*(表|一覧)】/.test(t)) return { type: 'info', text: shorten(t), hos: [] };
  if (/^〈[^〉]{1,24}〉/.test(t)) return { type: 'info', text: shorten(t), hos: [] };
  return null;
}

function shorten(t) {
  return t.replace(/\s*成功時\s*/, ' ').replace(/】\s+/, '】').slice(0, 64) + (t.length > 64 ? '…' : '');
}

/** Markdown(Googleドキュメントの書き出し・貼りつけ)を読む */
function parseMarkdown(text) {
  const items = [];
  const ends = [];
  let section = 'front';
  let sawPlay = false;
  let hoScene = null;
  const hoDone = new Set();
  const seen = new Set();
  const push = (it) => {
    const key = `${it.type}:${it.text}`;
    if (it.type !== 'scene' && seen.has(key)) return;
    seen.add(key);
    items.push({ id: uid(it.type[0]), hos: [], ...it });
  };
  let lastLevel = 2;

  for (const raw of String(text).split(/\r?\n/)) {
    const h = raw.match(/^(#{1,6})\s*(.*)$/);
    if (h) {
      const level = h[1].length;
      const title = plain(h[2]).replace(/^[〇○◯]\s*/, (m) => (END_NAME.test(plain(h[2])) ? m : ''));
      if (!title) continue;
      if (level === 1) continue;
      if (/目次/.test(title) && sawPlay) break; // 同じ本文がタブで二重に入っているとき
      if (END_NAME.test(title)) {
        const name = title.replace(/^[〇○◯・]\s*/, '');
        if (!ends.includes(name)) ends.push(name);
        section = 'ending';
        continue;
      }
      if (ENDING.test(title) && level <= 3) { section = 'ending'; continue; }
      if (BACK.test(title) && level <= 3) { section = 'back'; continue; }
      if (level <= 2 && /秘匿\s*HO/.test(title) && !sawPlay) { section = 'hoSecret'; continue; }
      if (level <= 2 && FRONT.test(title)) { section = 'skip'; continue; }
      if ((section === 'ending' || section === 'back') && level >= 3) continue;
      if (level >= 4) continue; // 小さい見出し(分岐・条件)は、今のシーンの中にふくめる
      if (isDiceOrSecret(title, true)) { const it = boxItem(title); if (it) push(it); continue; }
      section = 'play';
      sawPlay = true;
      lastLevel = level;
      push({ type: 'scene', text: title, level });
      continue;
    }
    if (section === 'hoSecret') {
      const m = toHalf(plain(raw)).match(/^\|?\s*HO\s*([0-9])\s*[:：]/i);
      if (m && !hoDone.has(m[1])) {
        hoDone.add(m[1]);
        if (!hoScene) { hoScene = true; push({ type: 'scene', text: '秘匿HOを渡す', level: 2 }); }
        push({ type: 'secret', text: `HO${m[1]}の秘匿HOを渡す`, hos: [Number(m[1])] });
      }
      continue;
    }
    if (section !== 'play') continue;
    const cell = raw.match(/^\|(.*)\|\s*$/);
    if (cell) {
      if (/^\|\s*:?-{3,}/.test(raw)) continue;
      const cells = cell[1].split(/(?<!\\)\|/);
      const it = boxItem(cells[0]) || (cells.length === 1 ? null : null);
      if (it) push(it);
      continue;
    }
    if (/【[^】]*HO[^】]*秘匿[^】]*】/.test(plain(raw))) {
      const it = boxItem(raw);
      if (it) push(it);
    }
  }
  void lastLevel;
  return { items: dropEmptySubScenes(items), ends };
}

/** 情報のない小見出し(お店・部屋・Q.1 など)は、シーンにせず「行ったか」をチェックする項目にする */
function dropEmptySubScenes(items) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.type === 'scene' && it.level >= 3) {
      const next = items[i + 1];
      if (!next || next.type === 'scene') { out.push({ ...it, type: 'info', text: `▶ ${it.text}` }); continue; }
    }
    out.push(it);
  }
  return out.map(({ level, ...rest }) => rest);
}

/** 見出しのない文字(PDFなど)を読む */
function parsePlain(text) {
  const all = String(text).split(/\r?\n/).map(plain).filter(Boolean);
  const items = [];
  const ends = [];
  const seen = new Set();
  let started = false;
  let stop = false;
  let ending = false;
  for (let li = 0; li < all.length; li++) {
    if (stop) break;
    let t = all[li];
    if (/[\s.…・]\d{1,3}$/.test(t) && t.length < 40 && !started) continue; // 目次
    if (END_NAME.test(t) && t.length <= 40 && !/場合|から|移動/.test(t)) {
      const name = t.replace(/^[〇○◯・]\s*/, '');
      if (!ends.includes(name)) ends.push(name);
      ending = true;
      continue;
    }
    // 「【目星】」「【HO2秘匿情報】」だけの行 → ダイス・秘匿(次の行の中身をつなげる)
    if (isDiceOrSecret(t) && t.replace(/^(強制\s*)?【[^】]*】/, '').trim().length < 4) {
      const secretHead = /秘匿/.test(t);
      let k = li + 1;
      while (k < all.length && /^(成功時|失敗時|※.{0,30})$/.test(all[k])) k++;
      const nx = all[k];
      if (nx && nx.length > 1 && !/秘匿/.test(nx) && (secretHead || !isDiceOrSecret(nx))) { t = `${t} ${nx}`; li = k; }
    }
    const isHead = !isDiceOrSecret(t) && t.length <= 28 && (/^(導入|プロローグ|オープニング)$/.test(t) || /^【[^】]{1,24}】$/.test(t) || /^ー.{1,20}ー$/.test(t) || /^HO\s*[0-9０-９].{0,6}導入$/.test(t) || /^■.{1,24}$/.test(t));
    if (isHead) {
      if (BACK.test(t) && started) { stop = true; continue; }
      if (ENDING.test(t)) { ending = true; continue; }
      if (FRONT.test(t)) continue;
      if (/導入/.test(t)) started = true;
      if (!started || ending) continue;
      items.push({ id: uid('s'), type: 'scene', text: t.replace(/^■/, ''), hos: [] });
      continue;
    }
    if (!started || ending) continue;
    const it = boxItem(t, true);
    if (!it) continue;
    const key = `${it.type}:${it.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ id: uid(it.type[0]), ...it });
  }
  return { items, ends };
}

/**
 * 人数・HOを読む。
 * 「人数:4人固定」「推奨人数:1~4人」「2人以上(PL1人+KPCのタイマン可)」「HO1:「万屋」…」など
 */
export function readMeta(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => toHalf(plain(l)));
  let min = null; let max = null;
  for (const l of lines) {
    if (!/人[\s]*数/.test(l) || /探索者の人数|人数分/.test(l)) continue;
    const r = l.match(/([0-9]+)\s*人?\s*[~〜～\-ー－]\s*([0-9]+)\s*人/);
    if (r) { min = Number(r[1]); max = Number(r[2]); break; }
    const more = l.match(/([0-9]+)\s*人\s*以上/);
    if (more) {
      min = Number(more[1]); max = null;
      const solo = l.match(/PL\s*([0-9]+)\s*人/);
      if (solo) min = Math.min(min, Number(solo[1]));
      break;
    }
    const one = l.match(/([0-9]+)\s*人/);
    if (one) { min = max = Number(one[1]); break; }
  }
  const names = [];
  let hoCount = 0;
  for (const l of lines) {
    const m = l.match(/^\|?\s*HO\s*([0-9])\s*[:：]\s*(「([^」]{1,16})」)?/i);
    if (!m) continue;
    const n = Number(m[1]);
    hoCount = Math.max(hoCount, n);
    if (m[3] && !names[n - 1]) names[n - 1] = m[3];
  }
  if (hoCount && max == null) max = Math.max(hoCount, min || 0);
  if (hoCount && min == null) min = hoCount;
  if (min == null && max == null) { min = 1; max = 4; }
  if (max == null) max = Math.max(min, 6);
  return { minPL: min, maxPL: Math.min(max, 9), hoCount: Math.min(hoCount, 9), hoNames: Array.from({ length: Math.min(hoCount, 9) }, (_, i) => names[i] || '') };
}

/** 本文全体から、候補とENDを作る */
export function parseScenario(text) {
  const isMd = /^#{2,4}\s/m.test(text);
  const r = isMd ? parseMarkdown(text) : parsePlain(text);
  return { ...r, meta: readMeta(text) };
}

/** 平らな候補リストを、シーンごとのまとまりにする */
export function toScenes(items) {
  const scenes = [];
  let cur = null;
  for (const it of items) {
    if (it.type === 'scene') { cur = { id: it.id, title: it.text, items: [] }; scenes.push(cur); continue; }
    if (!cur) { cur = { id: uid('s'), title: 'はじめ', items: [] }; scenes.push(cur); }
    cur.items.push({ id: it.id, type: it.type, text: it.text, hos: it.hos || [] });
  }
  return scenes;
}

/** シーンのまとまりを、平らなリストに戻す(編集用) */
export function fromScenes(scenes) {
  const out = [];
  for (const s of scenes) {
    out.push({ id: s.id, type: 'scene', text: s.title, hos: [] });
    for (const it of s.items) out.push({ ...it });
  }
  return out;
}

/** Googleドキュメントからの貼りつけ(HTML)を、書き出しと同じ形の文字にする */
export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines = [];
  const txt = (el) => el.textContent.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const walk = (el) => {
    for (const node of el.childNodes) {
      if (node.nodeType !== 1) continue;
      const tag = node.tagName.toLowerCase();
      const hm = tag.match(/^h([1-6])$/);
      if (hm) { const t = txt(node); if (t) lines.push(`${'#'.repeat(Number(hm[1]))} ${t}`); continue; }
      if (tag === 'table') {
        for (const tr of node.querySelectorAll('tr')) {
          const cells = [...tr.children].map((td) => [...td.querySelectorAll('p, li')].map(txt).filter(Boolean).join(' ') || txt(td));
          if (cells.some(Boolean)) lines.push(`| ${cells.join(' | ')} |`);
        }
        continue;
      }
      if (['p', 'li', 'pre', 'blockquote'].includes(tag) || (tag === 'div' && !node.querySelector('p, li, h1, h2, h3, h4, table, div'))) {
        const t = txt(node);
        if (t) lines.push(tag === 'li' ? `・${t}` : t);
        continue;
      }
      walk(node);
    }
  };
  walk(doc.body);
  return lines.join('\n');
}

/** PDFから文字を取り出す(pdf.js をその場で読みこむ。ファイルは外に送らない) */
export async function pdfToText(file, onProgress = () => {}) {
  // PDFを読む部品は、このサイトの中に置いてある(外部サイトに頼らない)
  const BASE = new URL('./vendor/pdfjs/', import.meta.url).href;
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = BASE + 'pdf.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('PDFを読む準備ができませんでした。インターネットにつながっているか確認してください。'));
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js';
  }
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress(p, pdf.numPages);
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    let line = '';
    let lastY = null;
    for (const it of tc.items) {
      const y = it.transform ? Math.round(it.transform[5]) : lastY;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line) { out.push(line); line = ''; }
      line += it.str;
      lastY = y;
      if (it.hasEOL) { out.push(line); line = ''; lastY = null; }
    }
    if (line) out.push(line);
  }
  return out.join('\n');
}
