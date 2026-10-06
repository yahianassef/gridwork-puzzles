/* Tango: fill with suns and moons; balanced lines, no three alike, honour = and × signs. */
(function () {
  'use strict';
  const { el, shuffle, range } = PZ.util;

  const EMPTY = 0, SUN = 1, MOON = 2;
  // [signs per n cells, extra givens per n cells added back after minimising]
  const DIFFICULTY = { easy: [1.4, 1.0], medium: [1.1, 0.4], hard: [0.8, 0] };

  /** Every adjacent pair, as [a, b] with a < b. */
  function pairs(n) {
    const out = [];
    for (let i = 0; i < n * n; i++) {
      if (i % n < n - 1) out.push([i, i + 1]);
      if (i < n * (n - 1)) out.push([i, i + n]);
    }
    return out;
  }

  /** Is the value at cell i consistent with the rest of the (partial) grid? */
  function consistent(g, n, i, signsByCell) {
    const v = g[i], r = Math.floor(i / n), c = i % n, half = n / 2;
    let rowCount = 0, colCount = 0;
    for (let k = 0; k < n; k++) {
      if (g[r * n + k] === v) rowCount++;
      if (g[k * n + c] === v) colCount++;
    }
    if (rowCount > half || colCount > half) return false;
    for (let s = -2; s <= 0; s++) {
      if (c + s >= 0 && c + s + 2 < n && [0, 1, 2].every(d => g[r * n + c + s + d] === v)) return false;
      if (r + s >= 0 && r + s + 2 < n && [0, 1, 2].every(d => g[(r + s + d) * n + c] === v)) return false;
    }
    for (const { other, same } of signsByCell[i]) {
      if (g[other] && (g[other] === v) !== same) return false;
    }
    return true;
  }

  function indexSigns(n, signs) {
    const by = range(n * n).map(() => []);
    for (const s of signs) {
      const same = s.type === '=';
      by[s.a].push({ other: s.b, same });
      by[s.b].push({ other: s.a, same });
    }
    return by;
  }

  /** Count solutions up to `limit`; with `randomize` returns the first one found. */
  function solve(givens, n, signs, limit, randomize) {
    const g = givens.slice(), by = indexSigns(n, signs);
    let count = 0, first = null;
    (function rec(i) {
      while (i < n * n && g[i]) i++;
      if (i === n * n) { count++; if (!first) first = g.slice(); return; }
      for (const v of randomize ? shuffle([SUN, MOON]) : [SUN, MOON]) {
        g[i] = v;
        if (consistent(g, n, i, by)) rec(i + 1);
        g[i] = EMPTY;
        if (count >= limit) return;
      }
    })(0);
    return { count, solution: first };
  }

  function generate(opts) {
    const n = Number(opts.size);
    const [signRate, extraRate] = DIFFICULTY[opts.difficulty];
    const solution = solve(new Array(n * n).fill(EMPTY), n, [], 1, true).solution;
    const signs = shuffle(pairs(n)).slice(0, Math.round(n * signRate)).map(([a, b]) => ({
      a, b, type: solution[a] === solution[b] ? '=' : 'x',
    }));
    // Remove givens while the solution stays unique, then add a few back for easier levels.
    const givens = solution.slice(), removed = [];
    for (const i of shuffle(range(n * n))) {
      givens[i] = EMPTY;
      if (solve(givens, n, signs, 2, false).count !== 1) givens[i] = solution[i];
      else removed.push(i);
    }
    for (const i of removed.slice(0, Math.round(n * extraRate))) givens[i] = solution[i];
    return { puzzle: { n, givens, signs }, progress: { cells: givens.slice() } };
  }

  function check(puzzle, progress) {
    const { n, signs } = puzzle, g = progress.cells, bad = new Set(), half = n / 2;
    for (let line = 0; line < n; line++) {
      const rowCells = range(n).map(k => line * n + k), colCells = range(n).map(k => k * n + line);
      for (const cellsOfLine of [rowCells, colCells]) {
        for (const v of [SUN, MOON]) {
          const same = cellsOfLine.filter(i => g[i] === v);
          if (same.length > half) same.forEach(i => bad.add(i));
        }
        for (let k = 0; k + 2 < n; k++) {
          const trio = cellsOfLine.slice(k, k + 3);
          if (g[trio[0]] && trio.every(i => g[i] === g[trio[0]])) trio.forEach(i => bad.add(i));
        }
      }
    }
    for (const s of signs) {
      if (g[s.a] && g[s.b] && (g[s.a] === g[s.b]) !== (s.type === '=')) { bad.add(s.a); bad.add(s.b); }
    }
    return { solved: g.every(Boolean) && bad.size === 0, bad };
  }

  function mount(root, ctx) {
    const { n, givens, signs } = ctx.puzzle;
    const board = el('div', { class: 'tango-board', style: { '--n': n } });
    const grid = el('div', { class: 'tango-grid', role: 'grid', 'aria-label': 'Tango board' });
    const cells = range(n * n).map(i => {
      const cell = el('button', { class: 'tango-cell', type: 'button', role: 'gridcell',
        onclick: () => {
          if (givens[i]) return;
          ctx.move(pr => (pr.cells[i] = (pr.cells[i] + 1) % 3));
        } });
      grid.append(cell);
      return cell;
    });
    board.append(grid);
    for (const s of signs) {
      const r = Math.floor(s.a / n), c = s.a % n, horizontal = s.b === s.a + 1;
      board.append(el('span', {
        class: 'tango-sign', 'aria-hidden': 'true',
        style: {
          left: `${((horizontal ? c + 1 : c + 0.5) / n) * 100}%`,
          top: `${((horizontal ? r + 0.5 : r + 1) / n) * 100}%`,
        },
      }, s.type === '=' ? '=' : '×'));
    }
    root.append(board);

    function update() {
      const g = ctx.progress.cells, bad = ctx.result.bad;
      cells.forEach((cell, i) => {
        cell.classList.toggle('given', !!givens[i]);
        cell.classList.toggle('bad', bad.has(i));
        const label = g[i] === SUN ? 'sun' : g[i] === MOON ? 'moon' : 'empty';
        cell.setAttribute('aria-label', label);
        cell.replaceChildren(g[i] ? el('span', { class: `sym ${label}` }) : '');
      });
    }
    return { update };
  }

  PZ.register({
    id: 'tango',
    name: 'Tango',
    tagline: 'Balance suns and moons in every row and column.',
    glyph: '☼',
    options: [
      { key: 'size', label: 'Size', default: '6', choices: [['6', '6×6'], ['8', '8×8']] },
      { key: 'difficulty', label: 'Difficulty', default: 'medium', choices: [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']] },
    ],
    label: o => `${o.size}×${o.size} · ${o.difficulty[0].toUpperCase()}${o.difficulty.slice(1)}`,
    rules: [
      'Fill every cell with a sun or a moon.',
      'Each row and column has the same number of suns and moons.',
      'No more than two of the same symbol may sit next to each other in a row or column.',
      'Cells joined by = must match. Cells joined by × must be opposite.',
    ],
    controls: ['Click a cell to cycle sun → moon → empty. Shaded cells are fixed.'],
    generate,
    check,
    mount,
  });
})();
