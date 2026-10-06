/* Nonogram: shade cells so each row and column matches its run-length clues. */
(function () {
  'use strict';
  const { el, range } = PZ.util;

  const EMPTY = 0, FILL = 1, CROSS = 2;
  const DENSITY = 0.58;

  /** Run lengths of filled cells, e.g. [1,1,0,1,1,1] -> [2,3]; an empty line -> [0]. */
  function runs(values) {
    const out = [];
    let run = 0;
    for (const v of values) {
      if (v === FILL) run++;
      else if (run) { out.push(run); run = 0; }
    }
    if (run) out.push(run);
    return out.length ? out : [0];
  }

  const rowOf = (g, n, r) => g.slice(r * n, r * n + n);
  const colOf = (g, n, c) => range(n).map(r => g[r * n + c]);
  const same = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);

  function generate(opts) {
    const n = Number(opts.size);
    let picture;
    // Avoid fully empty pictures, which make dull puzzles.
    do picture = range(n * n).map(() => (Math.random() < DENSITY ? FILL : EMPTY));
    while (range(n).some(r => rowOf(picture, n, r).every(v => !v)));
    return {
      puzzle: {
        n,
        rows: range(n).map(r => runs(rowOf(picture, n, r))),
        cols: range(n).map(c => runs(colOf(picture, n, c))),
      },
      progress: { cells: new Array(n * n).fill(EMPTY) },
    };
  }

  function lineStatus(puzzle, progress) {
    const { n, rows, cols } = puzzle, g = progress.cells;
    return {
      rowsOk: range(n).map(r => same(runs(rowOf(g, n, r)), rows[r])),
      colsOk: range(n).map(c => same(runs(colOf(g, n, c)), cols[c])),
    };
  }

  function check(puzzle, progress) {
    const { rowsOk, colsOk } = lineStatus(puzzle, progress);
    return { solved: rowsOk.every(Boolean) && colsOk.every(Boolean), bad: new Set() };
  }

  function mount(root, ctx) {
    const { n, rows, cols } = ctx.puzzle;
    const left = Math.max(...rows.map(r => r.length));
    const top = Math.max(...cols.map(c => c.length));
    let tool = FILL;

    // One CSS grid holds the clue gutters and the board, all in equal units.
    const wrap = el('div', { class: 'ng', style: { '--units': left + n, '--rows': top + n } });
    const colClues = cols.map((clue, c) => {
      const box = el('div', { class: 'ng-colclue', style: { gridColumn: `${left + c + 1}`, gridRow: `1 / span ${top}` } },
        ...clue.map(v => el('span', null, v)));
      wrap.append(box);
      return box;
    });
    const rowClues = rows.map((clue, r) => {
      const box = el('div', { class: 'ng-rowclue', style: { gridRow: `${top + r + 1}`, gridColumn: `1 / span ${left}` } },
        ...clue.map(v => el('span', null, v)));
      wrap.append(box);
      return box;
    });
    const board = el('div', { class: 'ng-board', style: { gridColumn: `${left + 1} / span ${n}`, gridRow: `${top + 1} / span ${n}`, '--n': n } });
    const cells = range(n * n).map(i => {
      const r = Math.floor(i / n), c = i % n;
      const cls = ['ng-cell'];
      if (c % 5 === 4 && c < n - 1) cls.push('edge-r');
      if (r % 5 === 4 && r < n - 1) cls.push('edge-b');
      const cell = el('div', { class: cls.join(' ') });
      board.append(cell);
      return cell;
    });
    wrap.append(board);

    const toolBtns = [[FILL, 'Fill'], [CROSS, 'Mark ×']].map(([t, label]) =>
      el('button', { class: 'btn seg', type: 'button', onclick: () => { tool = t; paintTools(); } }, label));
    const controls = el('div', { class: 'mini-controls' }, el('span', { class: 'mini-label' }, 'Tool'), ...toolBtns);
    root.append(wrap, controls);

    function paintTools() {
      toolBtns.forEach((b, k) => b.setAttribute('aria-pressed', String((k === 0 ? FILL : CROSS) === tool)));
    }
    paintTools();

    // Press sets a target state from the first cell, then dragging paints it in a straight line.
    let drag = null;
    board.addEventListener('contextmenu', e => e.preventDefault());
    board.addEventListener('pointerdown', e => {
      if (ctx.locked) return;
      const i = PZ.util.cellFromPoint(board, e, n);
      if (i < 0) return;
      e.preventDefault();
      const useTool = e.button === 2 ? CROSS : tool;
      const target = ctx.progress.cells[i] === useTool ? EMPTY : useTool;
      drag = { start: i, target };
      board.setPointerCapture(e.pointerId);
      ctx.begin();
      ctx.progress.cells[i] = target;
      ctx.commit();
    });
    board.addEventListener('pointermove', e => {
      if (!drag) return;
      const i = PZ.util.cellFromPoint(board, e, n);
      if (i < 0) return;
      const sr = Math.floor(drag.start / n), sc = drag.start % n;
      const r = Math.floor(i / n), c = i % n;
      // Lock to the row or column of the starting cell.
      const j = Math.abs(r - sr) >= Math.abs(c - sc) ? r * n + sc : sr * n + c;
      const g = ctx.progress.cells;
      const step = j === drag.start ? 0 : j % n === sc ? n : 1;
      if (!step) return;
      const [a, b] = j < drag.start ? [j, drag.start] : [drag.start, j];
      let changed = false;
      for (let k = a; k <= b; k += step) if (g[k] !== drag.target) { g[k] = drag.target; changed = true; }
      if (changed) ctx.commit();
    });
    const end = () => (drag = null);
    board.addEventListener('pointerup', end);
    board.addEventListener('pointercancel', end);

    function update() {
      const g = ctx.progress.cells;
      const { rowsOk, colsOk } = lineStatus(ctx.puzzle, ctx.progress);
      cells.forEach((cell, i) => {
        cell.classList.toggle('fill', g[i] === FILL);
        cell.classList.toggle('cross', g[i] === CROSS);
      });
      rowClues.forEach((box, r) => box.classList.toggle('ok', rowsOk[r]));
      colClues.forEach((box, c) => box.classList.toggle('ok', colsOk[c]));
    }
    return { update };
  }

  PZ.register({
    id: 'nonogram',
    name: 'Nonogram',
    tagline: 'Use the number clues to shade in a hidden picture.',
    glyph: '▦',
    options: [
      { key: 'size', label: 'Size', default: '10', choices: [['5', '5×5'], ['10', '10×10'], ['15', '15×15']] },
    ],
    label: o => `${o.size}×${o.size}`,
    rules: [
      'Each clue lists the lengths of the shaded runs in that row or column, in order.',
      'Runs are separated by at least one empty cell. A clue of 0 means the line is empty.',
      'A clue turns faint once its line matches. Match every line to win.',
    ],
    controls: [
      'Click or drag to fill cells. Right-click or switch the tool to Mark × for cells you know are empty.',
      'Dragging paints in a straight line from where you started.',
    ],
    generate,
    check,
    mount,
  });
})();
