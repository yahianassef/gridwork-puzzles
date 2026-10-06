/* Queens: one queen per row, column and colour region; queens may not touch. */
(function () {
  'use strict';
  const { el, shuffle, range, randInt, neighbors, cellFromPoint } = PZ.util;

  const EMPTY = 0, MARK = 1, QUEEN = 2;
  const GEN_ATTEMPTS = 400, GEN_BUDGET_MS = 1500;

  /** Random queen placement: a permutation where consecutive rows differ by more than 1 column. */
  function placeQueens(n) {
    const cols = [], used = new Array(n).fill(false);
    (function rec(r) {
      if (r === n) return true;
      for (const c of shuffle(range(n))) {
        if (used[c] || (r > 0 && Math.abs(cols[r - 1] - c) <= 1)) continue;
        used[c] = true; cols[r] = c;
        if (rec(r + 1)) return true;
        used[c] = false;
      }
      return false;
    })(0);
    return cols;
  }

  /** Grow one region from each queen by random flood fill until every cell is claimed. */
  function growRegions(n, cols) {
    const reg = new Array(n * n).fill(-1);
    cols.forEach((c, r) => (reg[r * n + c] = r));
    let remaining = n * n - n;
    while (remaining > 0) {
      const k = randInt(n);
      const frontier = [];
      for (let i = 0; i < n * n; i++) {
        if (reg[i] !== k) continue;
        for (const j of neighbors(i, n)) if (reg[j] === -1) frontier.push(j);
      }
      if (!frontier.length) continue;
      reg[frontier[randInt(frontier.length)]] = k;
      remaining--;
    }
    return reg;
  }

  function countSolutions(n, reg, limit) {
    const colUsed = new Array(n).fill(false), regUsed = new Array(n).fill(false), pos = [];
    let count = 0;
    (function rec(r) {
      if (count >= limit) return;
      if (r === n) { count++; return; }
      for (let c = 0; c < n; c++) {
        const k = reg[r * n + c];
        if (colUsed[c] || regUsed[k] || (r > 0 && Math.abs(pos[r - 1] - c) <= 1)) continue;
        colUsed[c] = regUsed[k] = true; pos[r] = c;
        rec(r + 1);
        colUsed[c] = regUsed[k] = false;
      }
    })(0);
    return count;
  }

  function generate(opts) {
    const n = Number(opts.size);
    const start = performance.now();
    let regions = null;
    // Prefer a layout with a unique solution; win detection is rule-based either way.
    for (let a = 0; a < GEN_ATTEMPTS; a++) {
      regions = growRegions(n, placeQueens(n));
      if (countSolutions(n, regions, 2) === 1) break;
      if (performance.now() - start > GEN_BUDGET_MS) break;
    }
    return { puzzle: { n, regions }, progress: { marks: new Array(n * n).fill(EMPTY) } };
  }

  function check(puzzle, progress) {
    const { n, regions } = puzzle;
    const queens = [];
    progress.marks.forEach((m, i) => m === QUEEN && queens.push(i));
    const bad = new Set();
    for (let a = 0; a < queens.length; a++) {
      for (let b = a + 1; b < queens.length; b++) {
        const p = queens[a], q = queens[b];
        const dr = Math.abs(Math.floor(p / n) - Math.floor(q / n)), dc = Math.abs((p % n) - (q % n));
        if (dr === 0 || dc === 0 || regions[p] === regions[q] || (dr <= 1 && dc <= 1)) {
          bad.add(p); bad.add(q);
        }
      }
    }
    // n non-conflicting queens means exactly one per row, column and region.
    return { solved: queens.length === n && bad.size === 0, bad };
  }

  function mount(root, ctx) {
    const { n, regions } = ctx.puzzle;
    const grid = el('div', { class: 'q-grid', style: { '--n': n }, role: 'grid', 'aria-label': 'Queens board' });
    const cells = range(n * n).map(i => {
      const r = Math.floor(i / n), c = i % n, k = regions[i];
      const edge = (j, cond) => (cond && regions[j] === k ? 'thin' : 'thick');
      const cell = el('div', {
        class: 'q-cell', role: 'gridcell',
        style: { background: `var(--region-${k})` },
      });
      cell.dataset.top = edge(i - n, r > 0);
      cell.dataset.bottom = edge(i + n, r < n - 1);
      cell.dataset.left = edge(i - 1, c > 0);
      cell.dataset.right = edge(i + 1, c < n - 1);
      grid.append(cell);
      return cell;
    });
    root.append(grid);

    // Tap cycles empty → × → queen. Dragging from an empty cell marks × across cells.
    let drag = null;
    grid.addEventListener('pointerdown', e => {
      if (ctx.locked) return;
      const i = cellFromPoint(grid, e, n);
      if (i < 0) return;
      e.preventDefault();
      grid.setPointerCapture(e.pointerId);
      drag = { start: i, moved: false, painting: ctx.progress.marks[i] === EMPTY };
    });
    grid.addEventListener('pointermove', e => {
      if (!drag || !drag.painting) return;
      const i = cellFromPoint(grid, e, n);
      if (i < 0 || (i === drag.start && !drag.moved)) return;
      const marks = ctx.progress.marks;
      if (!drag.moved) {
        drag.moved = true;
        ctx.begin();
        marks[drag.start] = MARK;
      }
      if (marks[i] === EMPTY) marks[i] = MARK;
      ctx.commit();
    });
    const end = () => {
      if (drag && !drag.moved) {
        const i = drag.start;
        ctx.move(pr => (pr.marks[i] = (pr.marks[i] + 1) % 3));
      }
      drag = null;
    };
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', () => (drag = null));

    function update() {
      const marks = ctx.progress.marks, bad = ctx.result.bad;
      cells.forEach((cell, i) => {
        cell.classList.toggle('bad', bad.has(i));
        cell.textContent = marks[i] === QUEEN ? '♛' : marks[i] === MARK ? '×' : '';
        cell.classList.toggle('queen', marks[i] === QUEEN);
        cell.classList.toggle('mark', marks[i] === MARK);
      });
    }
    return { update };
  }

  PZ.register({
    id: 'queens',
    name: 'Queens',
    tagline: 'Place one crown in every row, column and colour region.',
    glyph: '♛',
    options: [
      { key: 'size', label: 'Size', default: '8', choices: [['5', '5×5'], ['6', '6×6'], ['7', '7×7'], ['8', '8×8'], ['9', '9×9']] },
    ],
    label: o => `${o.size}×${o.size}`,
    rules: [
      'Place exactly one queen in each row, each column and each colour region.',
      'Two queens may not touch each other, not even diagonally.',
      'Queens that break a rule turn red.',
    ],
    controls: [
      'Click a cell once for × (a note that no queen goes there), twice for a queen, three times to clear.',
      'Drag across empty cells to mark several × at once.',
    ],
    generate,
    check,
    mount,
  });
})();
