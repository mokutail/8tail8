// シナリオ本文から、シーン・情報・秘匿の候補を拾う
// 書き方がシナリオごとにちがうので、よくある書き方を手がかりにして、最後は人が直す前提

const SKILLS = [
  '目星', '聞き耳', '図書館', 'アイデア', '知識', '幸運', '歴史', 'オカルト', '心理学', '医学', '薬学', '化学', '生物学',
  '博物学', '地質学', '天文学', '物理学', '人類学', '考古学', '法律', '経理', '応急手当', '精神分析', '説得', '言いくるめ',
  '信用', '値切り', '鍵開け', '機械修理', '電気修理', 'コンピューター', 'コンピュータ', '写真術', '追跡', '隠れる', '忍び歩き',
  '回避', '跳躍', '登攀', '水泳', '運転', '操縦', '乗馬', '変装', 'ナビゲート', '芸術', '製作', '母国語', '英語', 'ラテン語',
  'クトゥルフ神話', 'POW', 'DEX', 'STR', 'CON', 'APP', 'INT', 'EDU', 'SIZ', '魅惑', '威圧', '鑑定', '自然', 'サバイバル',
];
const SKILL_RE = new RegExp(`(${SKILLS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
const BRACKET_SKILL = new RegExp(`[〔【《＜<（(「\\[]\\s*[^〕】》＞>）)」\\]]{0,12}${SKILL_RE.source}`);

const SCENE_HEAD = /^(■|◆|●|□|◇|▼|▽|◎|#{1,4}\s|第[0-9０-９一二三四五六七八九十]+[章節幕話部]|シーン|scene|導入|エンディング|エピローグ|プロローグ|クライマックス|end(?![a-z])|ending)/i;
const BULLET = /^[・•★☆◎○●◇◆\-*※▶▷→]/;
const toHalf = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

let seq = 0;
const uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** 1行を判定する。戻り値:'scene' | 'info' | 'secret' | null */
export function classify(line) {
  const t = line.trim();
  if (!t) return null;
  const n = toHalf(t);
  const hoHit = /HO\s*[0-9]/i.test(n);
  const toWhom = /(に|のみ|へ|だけ|限定|宛|向け|専用|秘匿|のPL|PLに)/.test(n);
  if (t.length <= 32 && SCENE_HEAD.test(t) && !(hoHit && toWhom && !/導入|シーン|章/.test(t))) return 'scene';
  if (/^【[^】]{1,24}】$/.test(t)) return 'scene';
  if (t.length <= 24 && /^HO\s*[0-9].{0,8}(導入|パート|シーン|個別|ルート)/i.test(n)) return 'scene';
  if (hoHit && toWhom) return 'secret';
  if (/秘匿/.test(t) && t.length <= 80) return 'secret';
  if (BRACKET_SKILL.test(t) && t.length <= 80) return 'info';
  if (BULLET.test(t) && t.length <= 40) return 'info';
  if (t.length <= 80 && new RegExp(`^${SKILL_RE.source}.{0,6}(に成功|成功|ロール|判定|で)`).test(t)) return 'info';
  return null;
}

export function hosOf(line) {
  const n = toHalf(line);
  const out = new Set();
  for (const m of n.matchAll(/HO\s*([0-9])(?:\s*[・、,と&＆]\s*(?:HO)?\s*([0-9]))?(?:\s*[・、,と&＆]\s*(?:HO)?\s*([0-9]))?/gi)) {
    [m[1], m[2], m[3]].filter(Boolean).forEach((d) => out.add(Number(d)));
  }
  return [...out].sort();
}

const clean = (s) => s.trim().replace(/^[■◆●□◇▼▽◎・•★☆○\-*※▶▷→#\s]+/, '').replace(/\s+/g, ' ').slice(0, 70);

/**
 * 本文全体から候補を作る。
 * 戻り値:[{ id, type: 'scene'|'info'|'secret', text, hos: [] }](本文の順)
 */
export function parseScenario(text) {
  const out = [];
  const seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const type = classify(raw);
    if (!type) continue;
    const t = clean(raw);
    if (!t) continue;
    const key = `${type}:${t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: uid(type[0]), type, text: t, hos: type === 'secret' ? hosOf(raw) : [] });
  }
  return out;
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

/** Googleドキュメントなどからの貼りつけ(HTML)で、見出しに ■ をつけて文字にする */
export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines = [];
  const walk = (el) => {
    for (const node of el.childNodes) {
      if (node.nodeType !== 1) continue;
      const tag = node.tagName.toLowerCase();
      if (/^h[1-4]$/.test(tag)) { const t = node.textContent.trim(); if (t) lines.push(`■ ${t}`); continue; }
      if (['p', 'li', 'div', 'tr', 'pre', 'blockquote'].includes(tag)) {
        if (node.querySelector('p, li, h1, h2, h3, h4, tr, div')) { walk(node); continue; }
        const t = node.textContent.replace(/ /g, ' ').trim();
        if (t) lines.push(tag === 'li' ? `・${t}` : t);
        continue;
      }
      walk(node);
    }
  };
  walk(doc.body);
  return lines.join('\n');
}
