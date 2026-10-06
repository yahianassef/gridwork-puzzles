/* Wend: trace four hidden words (3, 4, 5 and 6 letters) that use every letter once. */
(function () {
  'use strict';
  const { el, shuffle, range, randInt, neighbors, adjacent, cellFromPoint, pathPoints } = PZ.util;

  const N = 5;
  const LENGTHS = [3, 4, 5, 6];
  const WORDS = {
    3: 'ant ape arm art ash bag bat bed bee box boy bun bus cab cap car cat cow cup cut day den dew dog dot ear egg elf elk end eye fan fig fin fir fix fly fog fox fun gem gum hat hay hen hip hog hop hot hut ice ink ivy jam jar jet jog joy key kid kit lab lap leg lid lip log map mat mix mop mud mug net nut oak oar owl pan paw pea pen pet pie pig pin pit pot ram rat ray red rib rod rug run saw sea sip sky sun tab tag tan tap tea ten tie tin toe top toy tub van vet wax web wig win yak zip zoo',
    4: 'army back bake ball band bank barn bear bell bike bird boat bone book boot bowl cake calm camp card cart cave chip city clay coat code coin cold cook corn crab crow dart deer desk dice dish door dove drum duck dust easy echo farm fern fish flag foam fork frog game gate gift glow goat gold golf grid hand harp hawk heat hill home hook horn idea iron jump kite knot lake lamp leaf lion loop mask maze milk mint moon moth nest note oven palm park path pear pine plum pond rain reed ring road rock roof rope rose ruby sail salt sand seed ship shoe silk snow soap sock song star swan tent tide tree tune vase vine wave wind wolf wood yarn zinc',
    5: 'acorn apple badge baker beach berry blaze bloom board brick bread brush cabin camel candy cedar chair chalk charm chess cider cliff clock cloud coral crane crown daisy dance delta diary dream eagle earth fable feast field flame flute frost fruit ghost giant glass globe grape grass heart honey horse house igloo ivory jelly jewel kayak knife koala lemon light llama lunar mango maple medal melon music night ocean olive opera otter paint panda paper peach pearl piano pilot pizza plant plaza puppy queen quilt radio raven river robin salad scarf shell skate smile snail spice spoon storm sugar table tiger toast torch tower train trail tulip vapor whale wheat world zebra',
    6: 'anchor animal banana basket breeze bridge bubble button camera candle canyon carrot castle cherry circle clover cookie cotton dragon finger flower forest galaxy garden ginger guitar hammer harbor helmet island jacket jungle kitten ladder lizard magnet marble meadow mirror monkey muffin needle orange oyster parrot pencil pepper pickle pillow planet pocket potato puzzle rabbit rocket saddle salmon shadow silver spider spring stream summer sunset tomato turtle valley velvet violin walnut window winter wizard yellow',
  };
  const LISTS = {};
  for (const len of LENGTHS) LISTS[len] = WORDS[len].split(' ').filter(w => w.length === len);
  const DICT = new Set(LENGTHS.flatMap(len => LISTS[len]));

  /** Random self-avoiding walk of `len` cells over free cells, by randomized DFS. */
  function walk(start, len, used) {
    const path = [start];
    used[start] = true;
    (function rec() {
      if (path.length === len) return true;
      for (const j of shuffle(neighbors(path[path.length - 1], N))) {
        if (used[j]) continue;
        used[j] = true; path.push(j);
        if (rec()) return true;
        used[j] = false; path.pop();
      }
      return false;
    })();
    if (path.length < len) { used[start] = false; return null; }
    return path;
  }

  /** Lay out four word paths; the 7 untouched cells become walls. */
  function layout() {
    for (;;) {
      const used = new Array(N * N).fill(false), paths = [];
      for (const len of shuffle(LENGTHS)) {
        // Start next to existing words when possible so the shape stays compact.
        const free = range(N * N).filter(i => !used[i]);
        const touching = free.filter(i => neighbors(i, N).some(j => used[j]));
        let path = null;
        for (const s of shuffle(touching.length ? touching : free)) {
          path = walk(s, len, used);
          if (path) break;
        }
        if (!path) break;
        paths.push(path);
      }
      if (paths.length === LENGTHS.length) return paths;
    }
  }

  function generate() {
    const paths = layout();
    const letters = new Array(N * N).fill('');
    const words = paths.map(cells => {
      const list = LISTS[cells.length];
      const word = list[randInt(list.length)];
      cells.forEach((i, k) => (letters[i] = word[k]));
      return { word, cells };
    });
    return { puzzle: { n: N, letters, words }, progress: { found: [], hints: 0 } };
  }

  function check(puzzle, progress) {
    const covered = new Set(progress.found.flatMap(f => f.cells));
    const letterCells = puzzle.letters.filter(Boolean).length;
    return { solved: covered.size === letterCells && progress.found.length === LENGTHS.length, bad: new Set() };
  }

  function mount(root, ctx) {
    const { letters, words } = ctx.puzzle;
    let sel = [];          // cells of the word being traced (not saved)
    let gesture = null;    // { moved } during a pointer press

    const board = el('div', { class: 'path-board wend-board', style: { '--n': N } });
    const grid = el('div', { class: 'path-grid', role: 'grid', 'aria-label': 'Wend letter grid' });
    const cells = range(N * N).map(i => {
      const cell = el('div', {
        class: letters[i] ? 'path-cell wend-cell' : 'path-cell wall', role: 'gridcell',
        'aria-label': letters[i] ? letters[i].toUpperCase() : 'wall',
      });
      grid.append(cell);
      return cell;
    });
    // Lines and letters share one SVG: lines in the first group, letters drawn above them.
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${N} ${N}`);
    svg.setAttribute('class', 'path-svg');
    svg.setAttribute('aria-hidden', 'true');
    const linesLayer = document.createElementNS(svgNS, 'g');
    const lettersLayer = document.createElementNS(svgNS, 'g');
    lettersLayer.setAttribute('class', 'wend-letters');
    letters.forEach((ch, i) => {
      if (!ch) return;
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', (i % N) + 0.5);
      t.setAttribute('y', Math.floor(i / N) + 0.5);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'central');
      t.textContent = ch.toUpperCase();
      lettersLayer.append(t);
    });
    svg.append(linesLayer, lettersLayer);
    board.append(grid, svg);

    const current = el('div', { class: 'wend-current', 'aria-live': 'polite' });
    const slots = el('div', { class: 'wend-slots' });
    const status = el('p', { class: 'hint-line', 'aria-live': 'polite' });
    const controls = el('div', { class: 'mini-controls' },
      el('button', { class: 'btn', type: 'button', onclick: submit }, 'Submit word'),
      el('button', { class: 'btn', type: 'button', onclick: () => { sel = []; update(); } }, 'Clear'),
      el('button', { class: 'btn btn-quiet', type: 'button', onclick: hint }, 'Reveal a word')
    );
    root.append(board, current, controls, slots, status);

    const foundIndexAt = i => ctx.progress.found.findIndex(f => f.cells.includes(i));
    const usable = i => letters[i] && foundIndexAt(i) < 0;
    const say = text => (status.textContent = text);

    grid.addEventListener('pointerdown', e => {
      if (ctx.locked) return;
      const i = cellFromPoint(grid, e, N);
      if (i < 0 || !letters[i]) return;
      e.preventDefault();
      const fi = foundIndexAt(i);
      if (fi >= 0) {
        const word = ctx.progress.found[fi].word;
        ctx.move(pr => pr.found.splice(fi, 1));
        say(`Removed ${word.toUpperCase()}.`);
        return;
      }
      const last = sel[sel.length - 1];
      if (i === last) sel.pop();
      else if (sel.length && !sel.includes(i) && adjacent(i, last, N)) sel.push(i);
      else sel = [i];
      gesture = { moved: false };
      grid.setPointerCapture(e.pointerId);
      update();
    });
    grid.addEventListener('pointermove', e => {
      if (!gesture) return;
      const i = cellFromPoint(grid, e, N);
      const last = sel[sel.length - 1];
      if (i < 0 || i === last || !sel.length) return;
      if (sel.length > 1 && i === sel[sel.length - 2]) sel.pop();
      else if (usable(i) && !sel.includes(i) && adjacent(i, last, N)) sel.push(i);
      else return;
      gesture.moved = true;
      update();
    });
    grid.addEventListener('pointerup', () => {
      // A drag submits on release; single taps build the word step by step.
      if (gesture && gesture.moved && sel.length >= 3) submit();
      gesture = null;
    });
    grid.addEventListener('pointercancel', () => (gesture = null));

    function submit() {
      if (ctx.locked) return;
      const word = sel.map(i => letters[i]).join('');
      if (word.length < 3) return say('Words are at least 3 letters long.');
      const taken = ctx.progress.found.map(f => f.word.length);
      if (!LENGTHS.includes(word.length)) {
        say(`${word.toUpperCase()} is too long. Words have 3 to 6 letters.`);
      } else if (taken.includes(word.length)) {
        say(`You already have a ${word.length}-letter word. Tap it to remove it first.`);
      } else if (!DICT.has(word)) {
        say(`${word.toUpperCase()} is not in the word list.`);
      } else {
        const cellsCopy = sel.slice();
        sel = [];
        ctx.move(pr => pr.found.push({ word, cells: cellsCopy }));
        if (!ctx.locked) say(`Found ${word.toUpperCase()}.`);
        return;
      }
      sel = [];
      update();
    }

    function hint() {
      if (ctx.locked) return;
      const taken = ctx.progress.found.map(f => f.word.length);
      const target = words.find(w => !taken.includes(w.word.length) && w.cells.every(usable));
      if (!target) return say('Your words block the hidden ones. Remove a word to get a hint.');
      sel = [];
      say(`Revealed ${target.word.toUpperCase()}.`);
      ctx.move(pr => {
        pr.found.push({ word: target.word, cells: target.cells.slice() });
        pr.hints = (pr.hints || 0) + 1;
      });
    }

    function update() {
      const found = ctx.progress.found;
      sel = sel.filter(usable);
      const owner = new Array(N * N).fill(-1);
      found.forEach((f, k) => f.cells.forEach(i => (owner[i] = k)));
      cells.forEach((cell, i) => {
        if (!letters[i]) return;
        cell.className = 'path-cell wend-cell';
        if (owner[i] >= 0) cell.classList.add('found', `w${found[owner[i]].word.length}`);
        if (sel.includes(i)) cell.classList.add('sel');
      });
      linesLayer.replaceChildren(
        ...found.map(f => line(f.cells, `wend-line w${f.word.length}`)),
        ...(sel.length > 1 ? [line(sel, 'wend-line sel')] : [])
      );
      current.textContent = sel.length ? sel.map(i => letters[i].toUpperCase()).join('') : ' ';
      slots.replaceChildren(...LENGTHS.map(len => {
        const f = found.find(x => x.word.length === len);
        return el('div', { class: `slot w${len}${f ? ' filled' : ''}` },
          el('span', { class: 'slot-len' }, `${len}`),
          el('span', { class: 'slot-word' }, f ? f.word.toUpperCase() : '·'.repeat(len)));
      }));
      if (ctx.result.solved) say(ctx.progress.hints ? `Solved with ${ctx.progress.hints} reveal(s).` : 'Solved without reveals.');
    }

    function line(cellList, cls) {
      const pl = document.createElementNS(svgNS, 'polyline');
      pl.setAttribute('points', pathPoints(cellList, N));
      pl.setAttribute('class', cls);
      return pl;
    }

    function key(e) {
      if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') { sel = []; update(); }
    }

    return { update, key };
  }

  PZ.register({
    id: 'wend',
    name: 'Wend',
    tagline: 'Trace four hidden words that wind around the walls.',
    glyph: 'W',
    options: [],
    label: () => '5×5',
    rules: [
      'The grid hides four words: one each of 3, 4, 5 and 6 letters.',
      'Spell a word by moving between letters up, down, left or right, never diagonally. Dark cells are walls.',
      'Every letter belongs to exactly one word. Use all of them to win.',
    ],
    controls: [
      'Drag across letters and release to submit, or tap letters one by one and press Submit word (or Enter).',
      'Tap a found word to remove it. Reveal a word fills in one of the hidden words.',
    ],
    generate,
    check,
    mount,
  });
})();
