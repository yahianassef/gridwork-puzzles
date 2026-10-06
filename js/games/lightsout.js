/* Lights Out: pressing a light toggles it and its four neighbours; switch them all off. */
(function () {
  'use strict';
  const { el, shuffle, range, neighbors } = PZ.util;

  // Random presses applied to a dark board, per n cells. Always solvable by construction.
  const PRESSES = { easy: 0.6, medium: 1.2, hard: 2.4 };

  function press(lights, i, n) {
    for (const j of [i, ...neighbors(i, n)]) lights[j] ^= 1;
  }

  function generate(opts) {
    const n = Number(opts.size);
    let lights;
    do {
      lights = new Array(n * n).fill(0);
      const count = Math.min(n * n, Math.max(3, Math.round(n * PRESSES[opts.difficulty])));
      for (const i of shuffle(range(n * n)).slice(0, count)) press(lights, i, n);
    } while (lights.every(v => !v));
    return { puzzle: { n }, progress: { lights, moves: 0 } };
  }

  function check(puzzle, progress) {
    return { solved: progress.lights.every(v => !v), bad: new Set() };
  }

  function mount(root, ctx) {
    const { n } = ctx.puzzle;
    const grid = el('div', { class: 'lo-grid', style: { '--n': n }, role: 'grid', 'aria-label': 'Lights' });
    const cells = range(n * n).map(i => {
      const b = el('button', { class: 'lo-cell', type: 'button', role: 'gridcell',
        onclick: () => ctx.move(pr => { press(pr.lights, i, n); pr.moves++; }) });
      grid.append(b);
      return b;
    });
    const status = el('p', { class: 'hint-line', 'aria-live': 'polite' });
    root.append(grid, status);

    function update() {
      const { lights, moves } = ctx.progress;
      cells.forEach((b, i) => {
        b.classList.toggle('lit', !!lights[i]);
        b.setAttribute('aria-pressed', String(!!lights[i]));
        b.setAttribute('aria-label', lights[i] ? 'light on' : 'light off');
      });
      const lit = lights.filter(Boolean).length;
      status.textContent = ctx.result.solved
        ? `All lights off in ${moves} presses.`
        : `${lit} light${lit === 1 ? '' : 's'} on · ${moves} press${moves === 1 ? '' : 'es'}`;
    }
    return { update };
  }

  PZ.register({
    id: 'lightsout',
    name: 'Lights Out',
    tagline: 'Every press flips a plus-shaped group. Turn the whole board dark.',
    glyph: '✦',
    options: [
      { key: 'size', label: 'Size', default: '5', choices: [['4', '4×4'], ['5', '5×5'], ['6', '6×6'], ['7', '7×7']] },
      { key: 'difficulty', label: 'Difficulty', default: 'medium', choices: [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']] },
    ],
    label: o => `${o.size}×${o.size} · ${o.difficulty[0].toUpperCase()}${o.difficulty.slice(1)}`,
    rules: [
      'Pressing a cell switches it and its neighbours above, below, left and right.',
      'Lit cells go dark and dark cells light up.',
      'Turn every light off to win. Every board here can be solved.',
    ],
    controls: ['Click a cell to press it. Pressing the same cell twice cancels out.'],
    generate,
    check,
    mount,
  });
})();
