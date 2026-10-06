/* Gridwork core: game registry, small DOM/random helpers and safe storage. */
'use strict';

const PZ = (window.PZ = { games: {}, order: [] });

/**
 * Register a game. A game definition provides:
 *   id, name, tagline, rules[], controls[], options[]
 *   label(opts)                 -> short text like "9×9 · Medium"
 *   generate(opts)              -> { puzzle, progress }   (both JSON-serialisable)
 *   check(puzzle, progress)     -> { solved: boolean, bad: Set<cellIndex> }
 *   mount(root, ctx)            -> { update(), key?(event) }
 * `puzzle` never changes after generation; `progress` is everything the player changes,
 * which is what undo/redo snapshots and saves capture.
 */
PZ.register = def => {
  PZ.games[def.id] = def;
  PZ.order.push(def.id);
};

PZ.util = {
  randInt: n => Math.floor(Math.random() * n),

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  range: n => Array.from({ length: n }, (_, i) => i),

  /** Orthogonal neighbours of cell i in an n×n grid. */
  neighbors(i, n) {
    const r = Math.floor(i / n), c = i % n, out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  },

  adjacent(a, b, n) {
    const dr = Math.abs(Math.floor(a / n) - Math.floor(b / n));
    const dc = Math.abs((a % n) - (b % n));
    return dr + dc === 1;
  },

  /** el('div', {class: 'x', onclick: fn}, child, 'text', ...) */
  el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [prop, val] of Object.entries(v)) {
          if (prop.startsWith('--')) node.style.setProperty(prop, String(val));
          else node.style[prop] = val;
        }
      }
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const ch of children.flat()) {
      if (ch == null || ch === false) continue;
      node.append(ch instanceof Node ? ch : document.createTextNode(String(ch)));
    }
    return node;
  },

  /** Index of the grid cell under a pointer event, or -1. Works during pointer capture. */
  cellFromPoint(gridEl, e, n) {
    const r = gridEl.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < 0 || y < 0 || x >= r.width || y >= r.height) return -1;
    return Math.floor((y / r.height) * n) * n + Math.floor((x / r.width) * n);
  },

  /** SVG polyline points through cell centres, in a viewBox of 0 0 n n. */
  pathPoints(cells, n) {
    return cells.map(i => `${(i % n) + 0.5},${Math.floor(i / n) + 0.5}`).join(' ');
  },

  formatTime(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  },
};

/** localStorage wrapper that never throws (private mode, quota, blocked storage). */
PZ.store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
