# Gridwork Puzzles

Seven logic puzzles in one static website: Sudoku (8×8, 9×9, 10×10, 12×12), Queens, Wend, Zip, Tango, Nonogram and Lights Out. Every puzzle is generated fresh, has undo/redo and win detection, and can be saved to an archive in the browser.

## Run it

No build step and no dependencies. Either:

- open `index.html` directly in a browser, or
- serve the folder with any static server, e.g. `python -m http.server` and visit http://localhost:8000.

Progress is stored in `localStorage`, so saves stay in the browser and on the device where they were made.

## Features

- **Game picker** with size and difficulty options per game, plus rules shown before starting.
- **Undo / Redo / Restart** (Ctrl+Z, Ctrl+Y). Restart is undoable too.
- **Autosave** of the game in progress: reload the page and it resumes, timer included.
- **Archive**: Save adds the current game (with its last 30 undo steps) to a list you can filter by game, resume or delete. Saving again updates the same entry.
- **Validation**: rule breaks are highlighted live (red cells), and a game locks with a "Solved" card when complete. Win checks test the rules, not a stored answer, so any valid solution counts.
- Works with mouse, keyboard and touch; layout adapts down to phone width; light and dark themes follow the system.

## Project layout

```
index.html            page shell and script order
css/styles.css        all styles; colour tokens at the top (light + dark)
js/core.js            game registry, DOM/random helpers, safe storage wrapper
js/app.js             routing, sessions, undo/redo, timer, save/archive UI
js/games/*.js         one file per game
```

## Adding a game

Create `js/games/<id>.js`, call `PZ.register({...})`, and add a `<script>` tag before `app.js`. A game provides:

| Field | Purpose |
| --- | --- |
| `id`, `name`, `tagline`, `glyph` | identity shown on the home page |
| `options` | `[{ key, label, default, choices: [[value, label]] }]` |
| `label(opts)` | short description such as `9×9 · Medium` |
| `rules`, `controls` | arrays of sentences shown beside the board |
| `generate(opts)` | returns `{ puzzle, progress }`, both plain JSON |
| `check(puzzle, progress)` | returns `{ solved, bad: Set<cellIndex> }` |
| `mount(root, ctx)` | builds the board; returns `{ update(), key?(event) }` |

Inside `mount`, change state with `ctx.move(progress => { ... })`. For drags, call `ctx.begin()` on press and `ctx.commit()` after each change; the whole drag becomes one undo step. Always read `ctx.progress` fresh, because undo replaces the object.

## Generators

- **Sudoku**: random full grid from a bitmask backtracking solver, then cells removed while the solution stays unique (2.5 s budget on large hard grids).
- **Queens**: random non-touching queen placement, colour regions grown from each queen; layouts with exactly one solution are preferred.
- **Zip**: random Hamiltonian path (backbite moves), with numbered checkpoints placed along it.
- **Wend**: four word paths (3, 4, 5, 6 letters) laid on a 5×5 grid; the leftover cells become walls. Any word from the built-in list of the right length is accepted.
- **Tango**: random valid grid, random =/× signs, givens removed while the solution stays unique.
- **Nonogram**: random picture, clues derived from it.
- **Lights Out**: random presses applied to a dark board, so every board is solvable.
