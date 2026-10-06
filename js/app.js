/* Gridwork app shell: routing, game sessions, undo/redo, timer, save and archive. */
(function () {
  'use strict';
  const { el, formatTime } = PZ.util;

  const KEY_CURRENT = 'gridwork.current.v1';
  const KEY_ARCHIVE = 'gridwork.archive.v1';
  const KEY_PREFS = 'gridwork.prefs.v1';
  const UNDO_LIMIT = 300;        // undo steps kept in memory
  const SAVED_HISTORY = 30;      // undo steps stored with a save
  const AUTOSAVE_EVERY = 10;     // seconds between timer autosaves

  const main = document.getElementById('main');
  const modalRoot = document.getElementById('modal-root');
  const toastEl = document.getElementById('toast');

  /**
   * session = { rec, undo: [json], redo: [json], pending: json|null, result, view, ui }
   * rec (the saved record) = { id, gameId, opts, puzzle, progress, initial, elapsed, solved,
   *   createdAt, updatedAt, saveId, name, savedAt, dirty }
   */
  let session = null;
  let route = 'games';
  let closeModal = null;
  let storageWarned = false;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const gameOf = rec => PZ.games[rec.gameId];
  const describe = rec => `${gameOf(rec).name} · ${gameOf(rec).label(rec.opts)}`;
  const dateText = ts => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  /* ---------- storage ---------- */

  const loadArchive = () => PZ.store.get(KEY_ARCHIVE, []).filter(r => PZ.games[r.gameId]);
  function saveArchive(list) {
    const ok = PZ.store.set(KEY_ARCHIVE, list);
    if (!ok) toast('Could not write to browser storage. Delete old saves or allow site data.');
    updateArchiveCount(list);
    return ok;
  }

  function persistCurrent() {
    if (!session) return;
    const ok = PZ.store.set(KEY_CURRENT, { ...session.rec, history: session.undo.slice(-SAVED_HISTORY) });
    if (!ok && !storageWarned) {
      storageWarned = true;
      toast('Browser storage is unavailable, so progress will not survive a reload.');
    }
  }

  function prefsFor(gameId) {
    return PZ.store.get(KEY_PREFS, {})[gameId] || {};
  }
  function rememberPrefs(gameId, opts) {
    const all = PZ.store.get(KEY_PREFS, {});
    all[gameId] = opts;
    PZ.store.set(KEY_PREFS, all);
  }

  function updateArchiveCount(list = loadArchive()) {
    const badge = document.getElementById('archive-count');
    badge.textContent = list.length ? String(list.length) : '';
  }

  /* ---------- sessions ---------- */

  function startSession(rec, history = []) {
    session = { rec, undo: history.slice(), redo: [], pending: null, result: null, view: null, ui: null };
    session.result = gameOf(rec).check(rec.puzzle, rec.progress);
    persistCurrent();
  }

  function newRecord(gameId, opts) {
    const { puzzle, progress } = PZ.games[gameId].generate(opts);
    const now = Date.now();
    return {
      id: uid(), gameId, opts, puzzle, progress, initial: JSON.stringify(progress),
      elapsed: 0, solved: false, createdAt: now, updatedAt: now, saveId: null, dirty: false,
    };
  }

  /** The interface each game's view uses to read and change state. */
  const ctx = {
    get puzzle() { return session.rec.puzzle; },
    get progress() { return session.rec.progress; },
    get result() { return session.result; },
    get locked() { return session.rec.solved; },
    /** Remember the state before a change. Pair with commit(). */
    begin() {
      if (session.rec.solved) return false;
      session.pending = JSON.stringify(session.rec.progress);
      return true;
    },
    /** Apply changes made since begin(); may be called repeatedly during a drag. */
    commit() { commit(); },
    move(fn) {
      if (!ctx.begin()) return;
      fn(session.rec.progress);
      commit();
    },
  };

  function commit() {
    const s = session;
    if (s.pending !== null) {
      const now = JSON.stringify(s.rec.progress);
      if (now !== s.pending) {
        s.undo.push(s.pending);
        if (s.undo.length > UNDO_LIMIT) s.undo.shift();
        s.redo = [];
        s.pending = null;
        s.rec.dirty = true;
      }
    }
    afterChange();
  }

  function afterChange() {
    const s = session;
    const wasSolved = s.rec.solved;
    s.result = gameOf(s.rec).check(s.rec.puzzle, s.rec.progress);
    if (s.result.solved && !wasSolved) {
      s.rec.solved = true;
      s.rec.solvedAt = Date.now();
      s.rec.dirty = true;
    }
    s.rec.updatedAt = Date.now();
    s.view.update();
    refreshPlayChrome();
    persistCurrent();
    if (s.rec.solved && !wasSolved) toast(`Solved in ${formatTime(s.rec.elapsed)}.`);
  }

  function undo() {
    const s = session;
    if (!s || s.rec.solved || !s.undo.length) return;
    s.redo.push(JSON.stringify(s.rec.progress));
    s.rec.progress = JSON.parse(s.undo.pop());
    s.rec.dirty = true;
    afterChange();
  }

  function redo() {
    const s = session;
    if (!s || s.rec.solved || !s.redo.length) return;
    s.undo.push(JSON.stringify(s.rec.progress));
    s.rec.progress = JSON.parse(s.redo.pop());
    s.rec.dirty = true;
    afterChange();
  }

  function restart() {
    if (!session || session.rec.solved) return;
    ctx.begin();
    session.rec.progress = JSON.parse(session.rec.initial);
    commit();
    toast('Board reset. Undo brings your moves back.');
  }

  function saveToArchive() {
    const rec = session.rec;
    const list = loadArchive();
    const now = Date.now();
    const idx = rec.saveId ? list.findIndex(r => r.saveId === rec.saveId) : -1;
    if (idx < 0) rec.saveId = uid();
    rec.savedAt = now;
    rec.name = rec.name || `${describe(rec)}`;
    rec.dirty = false;
    const entry = { ...rec, history: session.undo.slice(-SAVED_HISTORY) };
    if (idx >= 0) list[idx] = entry;
    else list.unshift(entry);
    if (saveArchive(list)) {
      toast(idx >= 0 ? 'Save updated.' : 'Saved to archive.');
    } else {
      rec.dirty = true;
    }
    persistCurrent();
    refreshPlayChrome();
  }

  /** Ask before throwing away an unsaved game in progress. Calls proceed() if OK. */
  function guardUnsaved(proceed) {
    if (!session || !session.rec.dirty || session.rec.solved) return proceed();
    openModal({
      title: 'Keep your current game?',
      body: el('p', null, `${describe(session.rec)} has changes that are not in the archive. Starting another game replaces it.`),
      actions: [
        { label: 'Cancel', kind: 'quiet' },
        { label: 'Discard', kind: 'quiet', onClick: proceed },
        { label: 'Save and continue', kind: 'primary', onClick: () => { saveToArchive(); proceed(); } },
      ],
    });
  }

  /* ---------- timer ---------- */

  setInterval(() => {
    if (!session || route !== 'play' || session.rec.solved || document.hidden || closeModal) return;
    session.rec.elapsed++;
    if (session.ui) session.ui.timer.textContent = formatTime(session.rec.elapsed);
    if (session.rec.elapsed % AUTOSAVE_EVERY === 0) persistCurrent();
  }, 1000);
  document.addEventListener('visibilitychange', persistCurrent);
  window.addEventListener('pagehide', persistCurrent);

  /* ---------- UI helpers ---------- */

  let toastTimer = null;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  function openModal({ title, body, actions }) {
    if (closeModal) closeModal();
    const close = () => {
      modalRoot.replaceChildren();
      closeModal = null;
      if (previous && previous.focus) previous.focus();
    };
    const previous = document.activeElement;
    const dialog = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
      el('h2', { id: 'modal-title' }, title),
      body,
      el('div', { class: 'modal-actions' }, ...actions.map(a =>
        el('button', {
          class: `btn ${a.kind === 'primary' ? 'btn-primary' : 'btn-quiet'}`, type: 'button',
          onclick: () => { if (a.keepOpen !== true) close(); if (a.onClick) a.onClick(); },
        }, a.label)))
    );
    const backdrop = el('div', { class: 'backdrop', onclick: e => e.target === backdrop && close() }, dialog);
    modalRoot.replaceChildren(backdrop);
    closeModal = close;
    const primary = dialog.querySelector('.btn-primary') || dialog.querySelector('button');
    if (primary) primary.focus();
    return close;
  }

  /** Option picker + rules for starting a new game. */
  function openSetup(gameId, presetOpts) {
    const game = PZ.games[gameId];
    const saved = presetOpts || prefsFor(gameId);
    const opts = {};
    for (const o of game.options) {
      opts[o.key] = o.choices.some(c => c[0] === saved[o.key]) ? saved[o.key] : o.default;
    }
    const groups = game.options.map(o => {
      const buttons = o.choices.map(([value, label]) => {
        const b = el('button', { class: 'btn seg', type: 'button', 'aria-pressed': String(opts[o.key] === value),
          onclick: () => {
            opts[o.key] = value;
            buttons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
          } }, label);
        return b;
      });
      return el('div', { class: 'opt-group' },
        el('span', { class: 'opt-label', id: `opt-${o.key}` }, o.label),
        el('div', { class: 'segmented', role: 'group', 'aria-labelledby': `opt-${o.key}` }, ...buttons));
    });
    const body = el('div', { class: 'setup' },
      el('p', { class: 'setup-tagline' }, game.tagline),
      ...groups,
      el('details', { class: 'rules', open: true },
        el('summary', null, 'How to play'),
        el('ul', null, ...game.rules.map(r => el('li', null, r))))
    );
    openModal({
      title: `New ${game.name}`,
      body,
      actions: [
        { label: 'Cancel', kind: 'quiet' },
        { label: 'Start game', kind: 'primary', onClick: () => guardUnsaved(() => createGame(gameId, { ...opts })) },
      ],
    });
  }

  function createGame(gameId, opts) {
    rememberPrefs(gameId, opts);
    // Let the "Generating" state paint before the generator blocks the thread.
    main.replaceChildren(el('div', { class: 'loading' }, `Generating ${PZ.games[gameId].name}…`));
    setTimeout(() => {
      startSession(newRecord(gameId, opts));
      if (location.hash === '#play') render();
      else location.hash = '#play';
    }, 30);
  }

  function resumeRecord(entry) {
    const { history = [], ...rec } = JSON.parse(JSON.stringify(entry));
    rec.dirty = false;
    startSession(rec, history);
    if (location.hash === '#play') render();
    else location.hash = '#play';
  }

  /* ---------- views ---------- */

  function renderGames() {
    const nodes = [];
    nodes.push(el('section', { class: 'intro' },
      el('h1', null, 'Pick a puzzle'),
      el('p', null, 'Seven logic games, freshly generated every time. Save a game halfway and pick it up from the archive later.')));

    if (session && !session.rec.solved) {
      const rec = session.rec;
      nodes.push(el('a', { class: 'continue', href: '#play' },
        el('span', { class: 'continue-kicker' }, 'Continue'),
        el('span', { class: 'continue-title' }, describe(rec)),
        el('span', { class: 'continue-meta' }, `${formatTime(rec.elapsed)} played${rec.dirty ? ' · unsaved changes' : rec.saveId ? ' · saved' : ''}`)));
    }

    nodes.push(el('section', { class: 'game-grid', 'aria-label': 'Games' },
      ...PZ.order.map(id => {
        const g = PZ.games[id];
        const sizes = g.options.find(o => o.key === 'size');
        return el('button', { class: `game-card gc-${id}`, type: 'button', onclick: () => openSetup(id) },
          el('span', { class: 'gc-glyph', 'aria-hidden': 'true' }, g.glyph),
          el('span', { class: 'gc-name' }, g.name),
          el('span', { class: 'gc-tag' }, g.tagline),
          el('span', { class: 'gc-sizes' }, sizes ? sizes.choices.map(c => c[1]).join('  ') : g.label({})));
      })));
    main.replaceChildren(...nodes);
  }

  function renderPlay() {
    if (!session) return renderGames();
    const rec = session.rec, game = gameOf(rec);

    const btn = (label, onClick, extra = {}) => el('button', { class: 'btn', type: 'button', onclick: onClick, ...extra }, label);
    const ui = {
      timer: el('span', { class: 'timer', 'aria-label': 'Time played' }, formatTime(rec.elapsed)),
      undo: btn('Undo', undo, { title: 'Undo (Ctrl+Z)' }),
      redo: btn('Redo', redo, { title: 'Redo (Ctrl+Y)' }),
      restart: btn('Restart', restart, { title: 'Clear the board back to the start' }),
      save: btn('Save', saveToArchive, { class: 'btn btn-primary', title: 'Save to archive' }),
      status: el('div', { class: 'status-card' }),
    };
    session.ui = ui;

    const bar = el('div', { class: 'play-bar' },
      el('div', { class: 'play-title' },
        el('h1', null, game.name),
        el('span', { class: 'chip' }, game.label(rec.opts)),
        ui.timer),
      el('div', { class: 'play-actions' },
        ui.undo, ui.redo, ui.restart, ui.save,
        btn('New game', () => openSetup(rec.gameId, rec.opts))));

    const boardRoot = el('div', { class: `board-root game-${rec.gameId}` });
    const side = el('aside', { class: 'side' },
      ui.status,
      el('details', { class: 'rules', open: true },
        el('summary', null, 'How to play'),
        el('ul', null, ...game.rules.map(r => el('li', null, r)))),
      el('details', { class: 'rules' },
        el('summary', null, 'Controls'),
        el('ul', null, ...game.controls.map(r => el('li', null, r)),
          el('li', null, 'Ctrl+Z undoes, Ctrl+Y redoes. Progress is kept in this browser automatically; Save adds it to the archive.'))));

    main.replaceChildren(el('section', { class: 'play' }, bar, el('div', { class: 'play-body' }, boardRoot, side)));
    session.view = game.mount(boardRoot, ctx);
    session.view.update();
    refreshPlayChrome();
  }

  function refreshPlayChrome() {
    const s = session;
    if (!s || !s.ui || route !== 'play') return;
    const { rec } = s;
    s.ui.undo.disabled = rec.solved || !s.undo.length;
    s.ui.redo.disabled = rec.solved || !s.redo.length;
    s.ui.restart.disabled = rec.solved;
    s.ui.timer.textContent = formatTime(rec.elapsed);
    document.querySelector('.board-root').classList.toggle('is-solved', rec.solved);

    let saveText;
    if (!rec.saveId) saveText = 'Not in the archive yet.';
    else if (rec.dirty) saveText = `Changes since your save at ${dateText(rec.savedAt)}.`;
    else saveText = `Saved ${dateText(rec.savedAt)}.`;

    if (rec.solved) {
      s.ui.status.className = 'status-card solved';
      s.ui.status.replaceChildren(
        el('strong', null, 'Solved'),
        el('p', null, `Finished in ${formatTime(rec.elapsed)}. ${saveText}`),
        el('div', { class: 'status-actions' },
          el('button', { class: 'btn btn-primary', type: 'button', onclick: () => openSetup(rec.gameId, rec.opts) }, 'Play another'),
          rec.dirty ? el('button', { class: 'btn', type: 'button', onclick: saveToArchive }, 'Save to archive') : null));
    } else {
      s.ui.status.className = 'status-card';
      s.ui.status.replaceChildren(el('strong', null, 'In progress'), el('p', null, saveText));
    }
  }

  function renderArchive() {
    let list = loadArchive().sort((a, b) => b.savedAt - a.savedAt);
    const filter = renderArchive.filter || 'all';
    const counts = {};
    list.forEach(r => (counts[r.gameId] = (counts[r.gameId] || 0) + 1));
    const shown = filter === 'all' ? list : list.filter(r => r.gameId === filter);

    const chip = (id, label, n) => el('button', {
      class: 'btn seg', type: 'button', 'aria-pressed': String(filter === id),
      onclick: () => { renderArchive.filter = id; renderArchive(); },
    }, `${label} `, el('span', { class: 'count-dim' }, n));

    const filters = el('div', { class: 'segmented wrap', role: 'group', 'aria-label': 'Filter by game' },
      chip('all', 'All', list.length),
      ...PZ.order.filter(id => counts[id]).map(id => chip(id, PZ.games[id].name, counts[id])));

    const rows = shown.map(r => {
      const isCurrent = session && session.rec.saveId === r.saveId;
      let confirming = false;
      const del = el('button', { class: 'btn btn-quiet', type: 'button' }, 'Delete');
      del.addEventListener('click', () => {
        if (!confirming) {
          confirming = true;
          del.textContent = 'Confirm delete';
          del.classList.add('danger');
          setTimeout(() => {
            confirming = false;
            del.textContent = 'Delete';
            del.classList.remove('danger');
          }, 3000);
          return;
        }
        saveArchive(loadArchive().filter(x => x.saveId !== r.saveId));
        if (isCurrent) { session.rec.saveId = null; session.rec.dirty = true; persistCurrent(); }
        toast('Save deleted.');
        renderArchive();
      });
      const open = el('button', { class: 'btn btn-primary', type: 'button',
        onclick: () => {
          if (isCurrent && !session.rec.dirty) { location.hash = '#play'; return; }
          guardUnsaved(() => resumeRecord(r));
        } }, r.solved ? 'View' : 'Resume');
      return el('li', { class: 'save-row' },
        el('span', { class: `save-glyph gc-${r.gameId}`, 'aria-hidden': 'true' }, PZ.games[r.gameId].glyph),
        el('div', { class: 'save-main' },
          el('span', { class: 'save-name' }, describe(r)),
          el('span', { class: 'save-meta' },
            `Saved ${dateText(r.savedAt)} · ${formatTime(r.elapsed)} played`,
            isCurrent ? ' · open now' : '')),
        el('span', { class: `pill ${r.solved ? 'pill-done' : 'pill-open'}` }, r.solved ? 'Solved' : 'In progress'),
        el('div', { class: 'save-actions' }, open, del));
    });

    main.replaceChildren(el('section', { class: 'archive' },
      el('div', { class: 'intro' },
        el('h1', null, 'Archive'),
        el('p', null, 'Saved games live in this browser. Resume one to keep playing with your time and undo history intact.')),
      list.length ? filters : null,
      rows.length
        ? el('ul', { class: 'save-list' }, ...rows)
        : el('div', { class: 'empty' },
            el('p', null, list.length ? 'No saves for this game.' : 'Nothing saved yet.'),
            el('p', { class: 'muted' }, 'Press Save while playing any game and it appears here.'),
            el('a', { class: 'btn btn-primary', href: '#games' }, 'Browse games'))));
  }

  function render() {
    const hash = location.hash.replace('#', '') || 'games';
    route = ['games', 'play', 'archive'].includes(hash) ? hash : 'games';
    if (route === 'play' && !session) route = 'games';
    if (session && route !== 'play') session.ui = null;
    document.querySelectorAll('[data-nav]').forEach(a =>
      a.setAttribute('aria-current', a.dataset.nav === route ? 'page' : 'false'));
    if (closeModal) closeModal();
    if (route === 'play') renderPlay();
    else if (route === 'archive') renderArchive();
    else renderGames();
    window.scrollTo(0, 0);
  }

  /* ---------- keyboard ---------- */

  document.addEventListener('keydown', e => {
    if (closeModal) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    if (route !== 'play' || !session) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (!mod && !e.altKey && session.view.key && !session.rec.solved) {
      if (e.target.closest && e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
      session.view.key(e);
    }
  });

  /* ---------- boot ---------- */

  const saved = PZ.store.get(KEY_CURRENT, null);
  if (saved && PZ.games[saved.gameId]) {
    const { history = [], ...rec } = saved;
    try {
      startSession(rec, history);
    } catch {
      session = null;
    }
  }
  updateArchiveCount();
  window.addEventListener('hashchange', render);
  render();
})();
