/* Sudoku in 8×8, 9×9, 10×10 and 12×12 with rectangular boxes. */
(function () {
  'use strict';
  const { el, shuffle, range } = PZ.util;

  const SYMBOLS = '123456789ABC';
  // Box shape [rows, cols] per grid size.
  const BOX = { 8: [2, 4], 9: [3, 3], 10: [2, 5], 12: [3, 4] };
  // Share of cells left as givens.
  const CLUE_RATIO = { easy: 0.52, medium: 0.42, hard: 0.34 };
  const GEN_BUDGET_MS = 2500;

  const geometryCache = {};
  /** Row/col/box index per cell plus the cell lists of every unit. */
  function geometry(n) {
    if (geometryCache[n]) return geometryCache[n];
    const [br, bc] = BOX[n];
    const R = [], C = [], B = [], units = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n;
      R.push(r);
      C.push(c);
      B.push(Math.floor(r / br) * (n / bc) + Math.floor(c / bc));
    }
    for (let u = 0; u < n; u++) {
      units.push(range(n * n).filter(i => R[i] === u));
      units.push(range(n * n).filter(i => C[i] === u));
      units.push(range(n * n).filter(i => B[i] === u));
    }
    const peers = range(n * n).map(i =>
      range(n * n).filter(j => j !== i && (R[j] === R[i] || C[j] === C[i] || B[j] === B[i]))
    );
    return (geometryCache[n] = { br, bc, R, C, B, units, peers });
  }

  function popcount(m) {
    let k = 0;
    while (m) { m &= m - 1; k++; }
    return k;
  }

  /**
   * Bitmask backtracking solver with fewest-candidates-first.
   * Stops after `limit` solutions or `nodeLimit` search nodes (then `aborted` is true).
   */
  function solve(grid, n, limit, nodeLimit, randomize) {
    const { R, C, B } = geometry(n);
    const g = grid.slice(), full = (1 << n) - 1;
    const rows = new Array(n).fill(0), cols = new Array(n).fill(0), boxes = new Array(n).fill(0);
    for (let i = 0; i < n * n; i++) {
      if (!g[i]) continue;
      const bit = 1 << (g[i] - 1);
      if ((rows[R[i]] | cols[C[i]] | boxes[B[i]]) & bit) return { count: 0, solution: null, aborted: false };
      rows[R[i]] |= bit; cols[C[i]] |= bit; boxes[B[i]] |= bit;
    }
    let count = 0, nodes = 0, solution = null, aborted = false;

    (function rec() {
      if (++nodes > nodeLimit) { aborted = true; return; }
      let best = -1, bestMask = 0, bestCount = 99;
      for (let i = 0; i < n * n; i++) {
        if (g[i]) continue;
        const m = full & ~(rows[R[i]] | cols[C[i]] | boxes[B[i]]);
        const k = popcount(m);
        if (k < bestCount) { best = i; bestMask = m; bestCount = k; if (k <= 1) break; }
      }
      if (best < 0) { count++; if (!solution) solution = g.slice(); return; }
      if (bestCount === 0) return;
      let vals = [];
      for (let v = 0; v < n; v++) if (bestMask & (1 << v)) vals.push(v);
      if (randomize) vals = shuffle(vals);
      for (const v of vals) {
        const bit = 1 << v;
        g[best] = v + 1;
        rows[R[best]] |= bit; cols[C[best]] |= bit; boxes[B[best]] |= bit;
        rec();
        g[best] = 0;
        rows[R[best]] &= ~bit; cols[C[best]] &= ~bit; boxes[B[best]] &= ~bit;
        if (count >= limit || aborted) return;
      }
    })();
    return { count, solution, aborted };
  }

  function generate(opts) {
    const n = Number(opts.size);
    let full = null;
    while (!full) full = solve(new Array(n * n).fill(0), n, 1, 200000, true).solution;

    // Dig holes while the puzzle keeps exactly one solution.
    const givens = full.slice();
    const target = Math.round(n * n * CLUE_RATIO[opts.difficulty]);
    const start = performance.now();
    let clues = n * n;
    for (const i of shuffle(range(n * n))) {
      if (clues <= target || performance.now() - start > GEN_BUDGET_MS) break;
      const v = givens[i];
      givens[i] = 0;
      const res = solve(givens, n, 2, 20000, false);
      if (res.count === 1 && !res.aborted) clues--;
      else givens[i] = v;
    }
    return {
      puzzle: { n, givens, solution: full },
      progress: { values: givens.slice(), notes: new Array(n * n).fill(0) },
    };
  }

  function check(puzzle, progress) {
    const { units } = geometry(puzzle.n);
    const vals = progress.values, bad = new Set();
    for (const unit of units) {
      const seen = {};
      for (const i of unit) {
        const v = vals[i];
        if (!v) continue;
        if (seen[v] !== undefined) { bad.add(i); bad.add(seen[v]); }
        else seen[v] = i;
      }
    }
    return { solved: vals.every(v => v) && bad.size === 0, bad };
  }

  function mount(root, ctx) {
    const { n, givens } = ctx.puzzle;
    const { br, bc, R, C, B, peers } = geometry(n);
    let selected = givens.findIndex(v => !v);
    let notesMode = false;

    const grid = el('div', { class: 'sd-grid', style: { '--n': n }, role: 'grid', 'aria-label': 'Sudoku grid' });
    const cells = range(n * n).map(i => {
      const r = R[i], c = C[i];
      const cls = ['sd-cell'];
      if ((c + 1) % bc === 0 && c < n - 1) cls.push('edge-r');
      if ((r + 1) % br === 0 && r < n - 1) cls.push('edge-b');
      const cell = el('div', { class: cls.join(' '), role: 'gridcell', 'data-i': i });
      cell.addEventListener('pointerdown', () => { selected = i; update(); });
      grid.append(cell);
      return cell;
    });

    const noteCols = n > 9 ? 4 : 3;
    const keypad = el('div', { class: 'keypad', style: { '--cols': n > 9 ? 6 : n === 8 ? 4 : 5 } });
    const keyButtons = range(n).map(v => {
      const b = el('button', { class: 'key', type: 'button', onclick: () => input(v + 1) }, SYMBOLS[v]);
      keypad.append(b);
      return b;
    });
    const notesBtn = el('button', { class: 'key key-wide', type: 'button', 'aria-pressed': 'false',
      onclick: () => { notesMode = !notesMode; update(); } }, 'Notes');
    keypad.append(
      el('button', { class: 'key key-wide', type: 'button', onclick: () => input(0) }, 'Erase'),
      notesBtn
    );
    root.append(grid, keypad);

    function input(v) {
      if (selected < 0 || givens[selected]) return;
      const i = selected;
      ctx.move(pr => {
        if (v === 0) { pr.values[i] = 0; pr.notes[i] = 0; return; }
        if (notesMode) {
          if (!pr.values[i]) pr.notes[i] ^= 1 << (v - 1);
          return;
        }
        pr.values[i] = pr.values[i] === v ? 0 : v;
        pr.notes[i] = 0;
        // Placing a digit clears it from the pencil marks of its peers.
        if (pr.values[i]) for (const j of peers[i]) pr.notes[j] &= ~(1 << (v - 1));
      });
    }

    function update() {
      const { values, notes } = ctx.progress;
      const bad = ctx.result.bad;
      const selVal = selected >= 0 ? values[selected] : 0;
      const counts = new Array(n + 1).fill(0);
      values.forEach(v => counts[v]++);
      cells.forEach((cell, i) => {
        const v = values[i];
        const related = selected >= 0 && (R[i] === R[selected] || C[i] === C[selected] || B[i] === B[selected]);
        cell.classList.toggle('given', !!givens[i]);
        cell.classList.toggle('selected', i === selected);
        cell.classList.toggle('peer', related && i !== selected);
        cell.classList.toggle('same', !!selVal && v === selVal && i !== selected);
        cell.classList.toggle('bad', bad.has(i));
        if (v) {
          cell.textContent = SYMBOLS[v - 1];
        } else if (notes[i]) {
          const box = el('div', { class: 'sd-notes', style: { '--nc': noteCols } });
          for (let k = 0; k < n; k++) box.append(el('span', null, notes[i] & (1 << k) ? SYMBOLS[k] : ''));
          cell.replaceChildren(box);
        } else {
          cell.textContent = '';
        }
      });
      keyButtons.forEach((b, k) => b.classList.toggle('done', counts[k + 1] >= n));
      notesBtn.setAttribute('aria-pressed', String(notesMode));
      notesBtn.classList.toggle('on', notesMode);
    }

    function key(e) {
      const k = e.key;
      const moves = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
      if (moves[k] !== undefined) {
        e.preventDefault();
        if (selected < 0) selected = 0;
        const r = R[selected], c = C[selected];
        if (k === 'ArrowLeft' && c === 0) return;
        if (k === 'ArrowRight' && c === n - 1) return;
        if ((k === 'ArrowUp' && r === 0) || (k === 'ArrowDown' && r === n - 1)) return;
        selected += moves[k];
        update();
      } else if (k === 'Backspace' || k === 'Delete') {
        input(0);
      } else if (k === 'n' || k === 'N') {
        notesMode = !notesMode;
        update();
      } else {
        let v = SYMBOLS.indexOf(k.toUpperCase()) + 1;
        if (k === '0' && n >= 10) v = 10;
        if (v >= 1 && v <= n) input(v);
      }
    }

    return { update, key };
  }

  PZ.register({
    id: 'sudoku',
    name: 'Sudoku',
    tagline: 'Fill the grid so every row, column and box holds each symbol once.',
    glyph: '9',
    options: [
      { key: 'size', label: 'Size', default: '9', choices: [['8', '8×8'], ['9', '9×9'], ['10', '10×10'], ['12', '12×12']] },
      { key: 'difficulty', label: 'Difficulty', default: 'medium', choices: [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']] },
    ],
    label: o => `${o.size}×${o.size} · ${o.difficulty[0].toUpperCase()}${o.difficulty.slice(1)}`,
    rules: [
      'Every row, every column and every outlined box must contain each symbol exactly once.',
      'Sizes above 9 use letters: A = 10, B = 11, C = 12.',
      'Boxes are 2×4 on 8×8, 3×3 on 9×9, 2×5 on 10×10 and 3×4 on 12×12.',
      'Clashing symbols turn red.',
    ],
    controls: [
      'Click a cell, then type a symbol or use the keypad. Arrow keys move the selection.',
      'Notes mode (N) toggles small pencil marks instead of answers.',
      'Backspace or Erase clears a cell. On 10×10 and up, 0 also enters 10.',
    ],
    generate,
    check,
    mount,
  });
})();
