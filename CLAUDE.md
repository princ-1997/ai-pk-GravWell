# GRAVWELL GPT - Agent Project Guide

## What Is This

A web-based LLM benchmark game. AI models write JavaScript `decide(ctx)` functions to control spaceships in a 2D gravitational physics simulation. Ships must stay inside a moving scoring zone while avoiding suns. The game tests LLMs' ability to understand physics, write code, and iteratively improve.

## Tech Stack

- **Vite 6 + TypeScript** (strict mode), vanilla DOM, no framework
- **Canvas 2D** for rendering (no WebGL, no game engine)
- **Zero runtime dependencies** — all hand-written
- CSS custom properties for theming, monospace font throughout

## Project Structure

```
src/
├── main.ts              # Bootstrap only (~12 lines): creates App, registers tabs
├── types.ts             # All shared interfaces (Ship, Sun, Zone, Vec2, etc.)
├── constants.ts         # Game defaults, colors, theme tokens
├── core/                # Pure simulation engine (NO DOM, NO Canvas)
│   ├── simulation.ts    # Game loop: Simulation class with tick() and runToCompletion()
│   ├── physics.ts       # Verlet integration, gravity, collision detection
│   ├── arena.ts         # Seed → suns + ship positions + zone path
│   ├── zone.ts          # Lissajous zone path, radius shrink, predictions
│   ├── context.ts       # Builds the ctx object passed to decide()
│   └── prng.ts          # Mulberry32 seeded PRNG
├── llm/                 # LLM integration
│   ├── api.ts           # OpenRouter / Anthropic / OpenAI / DeepSeek API client
│   ├── prompt-builder.ts # Builds the system+user prompt with game rules
│   ├── improvement-prompt.ts # Improvement prompt for iteration rounds 2+
│   ├── iteration-engine.ts   # Multi-round iterative learning engine
│   ├── code-parser.ts   # Extracts decide() from LLM response text
│   ├── sandbox.ts       # new Function() sandbox + baseline bot code
│   └── diagnostic.ts    # Post-run diagnostic report generation
├── ui/                  # Modular UI layer
│   ├── app.ts           # AppState interface, App class (tab routing, state)
│   ├── tabs/
│   │   ├── simulator-tab.ts      # Simulator: canvas + all business logic
│   │   ├── llm-materials-tab.ts  # LLM Materials: prompt/response/diagnostic
│   │   └── full-runs-tab.ts      # Full Runs: multi-seed batch runner + chart
│   └── components/
│       ├── api-config.ts         # API configuration (provider/key/model)
│       ├── code-editor.ts        # Bot code textarea + action buttons
│       ├── iteration-panel.ts    # Iterate/stop + rounds + progress
│       └── replay-controls.ts    # Run/play/stop + speed + status + results
├── modes/               # Game mode orchestrators
│   └── multi-seed-runner.ts # Batch execution across multiple seeds
├── renderer/            # Canvas rendering (consumes TickRecord[])
│   ├── game-renderer.ts # Main render orchestrator, coordinate mapping
│   ├── starfield.ts     # OffscreenCanvas cached starfield
│   ├── sun-renderer.ts  # Multi-layer glow/corona effect
│   ├── ship-renderer.ts # Ship dots + alpha-fading trail polylines
│   ├── zone-renderer.ts # White circle outline
│   └── effects.ts       # Particle system (explosions)
└── utils/
    └── math.ts          # Vec2 operations: distance, normalize, clamp, etc.
```

## Key Architecture Decisions

1. **Simulation is pure** — `src/core/` has zero DOM/Canvas imports. It produces `TickRecord[]` data. The renderer consumes it. This enables headless runs and easy testing.

2. **Determinism** — All randomness goes through seeded PRNG (`core/prng.ts`). Same seed = identical game. This is critical for fair benchmarking.

3. **LLM code runs via `new Function()`** — Not a Web Worker yet (MVP). The ctx object is a snapshot copy so decide() can't mutate game state. Errors are caught and return `{x:0, y:0}`.

4. **Replay from stored data** — Replays use `TickRecord[]` stored after simulation, not re-simulation.

5. **Modular UI** — `main.ts` is bootstrap only. Each tab is a class implementing `Tab` interface with `onActivate()`/`onDeactivate()` lifecycle. Components are pure UI (no business logic) with callback pattern. `AppState` is a plain mutable object passed by reference — no reactivity framework.

## Core Physics

- **Verlet integration**: `next = current + (current - previous) + gravity + thrust`
- **Gravity**: `accel = 0.003 * sun.mass / (dist + 0.002)^2` toward each sun
- **Thrust**: magnitude capped to 1.0, fuel consumed = magnitude per tick
- **Arena**: 100×100, 200 ticks, 4 suns, 3 ships per player

## Commands

```bash
npm run dev      # Start Vite dev server (localhost:5173)
npm run build    # TypeScript check + production build
npx tsc --noEmit # Type check only
```

## Common Tasks

### Adding a new game mode
1. Create `src/modes/<mode>.ts` orchestrator
2. Create `src/ui/tabs/<mode>-tab.ts` tab class implementing `Tab` interface
3. Register in `main.ts` with `app.registerTab()`
4. Simulation class already supports multiple players via `deciders[]` array

### Modifying physics
Edit `src/core/physics.ts`. The formulas are in `calculateGravity()` and `verletStep()`. Constants live in `src/constants.ts` (`DEFAULT_CONFIG`).

### Adding a new LLM provider
Add a new function in `src/llm/api.ts` following the pattern of `callOpenRouter()`. Update `ApiProvider` type and the `callLLM()` switch. Add the option to the provider dropdown in `src/ui/components/api-config.ts`.

### Changing the prompt
Edit `src/llm/prompt-builder.ts`. The prompt is a template literal that includes seed-specific arena data.

## Not Yet Implemented (Planned)

- Battle Royale mode (4 players)
- PVP mode with Elo ratings
- Leaderboard with 100-seed averaging
- IndexedDB persistence
- Web Worker sandbox for decide() execution

See `ROADMAP.md` for the full phased development plan (Phase 0-7).

## Development Workflow

### Git Commit Strategy: Small & Frequent
- Commit after each **single feature point** (one function, one component, one interface, etc.)
- Keep commit messages concise and specific
- Do NOT batch multiple feature points into one commit

### Phase Completion Checklist
After each Phase is verified working, you MUST:
1. Update `README.md` — sync new feature descriptions, check off roadmap items
2. Update `ROADMAP.md` — mark the completed Phase as ✅
3. Update `CLAUDE.md` — sync project structure, new files, new commands
4. Update `CHANGELOG.md` — record version number + added/changed/fixed
5. Commit the 4 updated docs
6. Run `git push` to push all changes to remote
