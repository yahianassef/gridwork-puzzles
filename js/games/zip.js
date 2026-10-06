/* Zip: draw one path through every cell, passing the numbers in order. */
(function () {
  'use strict';
  const { el, shuffle, range, randInt, neighbors, adjacent, cellFromPoint, pathPoints } = PZ.util;

  // Cells per checkpoint number, by difficulty.
  const CELLS_PER_NUMBER = { easy: 4, medium: 7, hard: 10 };

  /** Random Hamiltonian path via "backbite" moves, starting from a serpentine. */
  function hamiltonianPath(n) {
    let path = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) path.push(r * n + (r % 2 ? n - 1 - c : c));
    const iterations = n * n * 60;
    for (let k = 0; k < iterations; k++) {
      if (Math.random() < 0.5) path.reverse();
      const head = path[0];
      const options = neighbors(head, n).filter(x => x !== path[1]);
      const j = path.indexOf(options[randInt(options.length)]);
      // Link head to path[j] and drop the link path[j-1]–path[j]: reverse path[0..j-1].
      const front = path.slice(0, j).reverse();
      path = front.concat(path.slice(j));
    }
    return path;
  }

  function generate(opts) {
    const n = Number(opts.size), total = n * n;
    const path = hamiltonianPath(n);
    const count = Math.max(3, Math.round(total / CELLS_PER_NUMBER[opts.difficulty]));
    const middle = shuffle(range(total - 2).map(i => i + 1)).slice(0, count - 2).sort((a, b) => a - b);
    const nums = new Array(total).fill(0);
    [0, ...middle, total - 1].forEach((pos, k) => (nums[path[pos]] = k + 1));
    return { puzzle: { n, nums, count, solution: path }, progress: { path: [] } };
  }

  function check(puzzle, progress) {
    const { n, nums, count } = puzzle, path = progress.path, bad = new Set();
    let expected = 1;
    for (const i of path) {
      if (!nums[i]) continue;
      if (nums[i] === expected) expected++;
      else bad.add(i);
    }
    const solved = path.length === n * n && bad.size === 0 && expected === count + 1 && nums[path[path.length - 1]] === count;
    return { solved, bad };
  }

  function mount(root, ctx) {
    const { n, nums } = ctx.puzzle;
    const board = el('div', { class: 'path-board zip-board', style: { '--n': n } });
    const grid = el('div', { class: 'path-grid', role: 'grid', 'aria-label': 'Zip board' });
    const cells = range(n * n).map(i => {
      const cell = el('div', { class: 'path-cell', role: 'gridcell', 'aria-label': nums[i] ? `number ${nums[i]}` : null });
      grid.append(cell);
      return cell;
    });
    // The path and the numbered dots share one SVG so the dots always sit on top of the line.
    const svgNS = 'http://www.w3.org/2000/svg';
    const svgEl = (tag, attrs) => {
      const node = document.createElementNS(svgNS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      return node;
    };
    const svg = svgEl('svg', { viewBox: `0 0 ${n} ${n}`, class: 'path-svg', 'aria-hidden': 'true' });
    const line = svgEl('polyline', { class: 'zip-line' });
    svg.append(line);
    const dots = {};
    nums.forEach((k, i) => {
      if (!k) return;
      const cx = (i % n) + 0.5, cy = Math.floor(i / n) + 0.5;
      const g = svgEl('g', { class: 'zip-dot' });
      g.append(svgEl('circle', { cx, cy, r: 0.3 }));
      const t = svgEl('text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
      t.textContent = k;
      g.append(t);
      svg.append(g);
      dots[i] = g;
    });
    board.append(grid, svg);
    const status = el('p', { class: 'hint-line', 'aria-live': 'polite' });
    root.append(board, status);

    let dragging = false;
    grid.addEventListener('pointerdown', e => {
      if (ctx.locked) return;
      const i = cellFromPoint(grid, e, n);
      if (i < 0) return;
      e.preventDefault();
      const path = ctx.progress.path, idx = path.indexOf(i);
      ctx.begin();
      if (!path.length) {
        if (nums[i] !== 1) { say('Start your path on 1.'); return; }
        path.push(i);
      } else if (idx >= 0) {
        path.length = idx + 1; // tap a cell on the path to cut back to it
      } else if (adjacent(i, path[path.length - 1], n)) {
        path.push(i);
      } else {
        say('Continue from the end of your path, or tap a cell on it to back up.');
        return;
      }
      dragging = true;
      grid.setPointerCapture(e.pointerId);
      ctx.commit();
    });
    grid.addEventListener('pointermove', e => {
      if (!dragging) return;
      const i = cellFromPoint(grid, e, n);
      const path = ctx.progress.path, last = path[path.length - 1];
      if (i < 0 || i === last) return;
      if (path.length > 1 && i === path[path.length - 2]) path.pop();
      else if (!path.includes(i) && adjacent(i, last, n)) path.push(i);
      else return;
      ctx.commit();
    });
    const stop = () => (dragging = false);
    grid.addEventListener('pointerup', stop);
    grid.addEventListener('pointercancel', stop);

    function say(text) { status.textContent = text; }

    function update() {
      const path = ctx.progress.path, bad = ctx.result.bad;
      const onPath = new Set(path);
      cells.forEach((cell, i) => {
        cell.classList.toggle('on', onPath.has(i));
        cell.classList.toggle('end', i === path[path.length - 1]);
        if (dots[i]) dots[i].classList.toggle('bad', bad.has(i));
      });
      line.setAttribute('points', pathPoints(path, n));
      if (ctx.result.solved) say('Every cell filled, every number in order.');
      else if (bad.size) say('A number was reached out of order. Back up and reroute.');
      else if (path.length) say(`${path.length} of ${n * n} cells filled.`);
      else say('Press on 1 and drag to draw.');
    }
    return { update };
  }

  PZ.register({
    id: 'zip',
    name: 'Zip',
    tagline: 'Draw one path through every cell, hitting the numbers in order.',
    glyph: '1→',
    options: [
      { key: 'size', label: 'Size', default: '6', choices: [['5', '5×5'], ['6', '6×6'], ['7', '7×7'], ['8', '8×8']] },
      { key: 'difficulty', label: 'Difficulty', default: 'medium', choices: [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']] },
    ],
    label: o => `${o.size}×${o.size} · ${o.difficulty[0].toUpperCase()}${o.difficulty.slice(1)}`,
    rules: [
      'Draw a single path that starts on 1 and ends on the highest number.',
      'The path moves up, down, left or right and visits every cell exactly once.',
      'It must pass through the numbers in ascending order.',
    ],
    controls: [
      'Press on 1 and drag through neighbouring cells.',
      'Drag back over your path to erase it, or tap any cell on the path to cut it back to there.',
    ],
    generate,
    check,
    mount,
  });
})();
