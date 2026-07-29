# Development Guide — RBMK Simulator

## Environment

- A modern browser (Chrome, Firefox, Edge) with ES6+ support.
- No build tools required for development — all modules loaded via `<script>` tags.
- For serving locally you need Python 3 or Node.js (for `serve.sh`).

## How to Run

```bash
cd tools
bash serve.sh
```

Then open **http://localhost:8000** in your browser.

## Build

```bash
bash tools/build.sh
```

Output is written to **dist/index.html** (single self-contained file).

## File Structure

```
rbmk-simulator/
├── index.html             # Entry point, load order master
├── src/
│   ├── config.js          # All tunable parameters
│   ├── state.js           # STATE initialization
│   ├── main.js            # Game loop, orchestrator
│   ├── physics/
│   │   ├── neutronics.js  # Point kinetics + precursors
│   │   ├── reactivity.js  # Reactivity synthesis
│   │   ├── thermal.js     # 5-zone thermal hydraulics
│   │   ├── xenon.js       # Xenon / iodine dynamics
│   │   └── turbine.js     # Steam turbine + generator
│   ├── systems/
│   │   ├── economy.js     # Balance, pricing, penalties
│   │   ├── trust.js       # Public / government / staff trust
│   │   ├── personnel.js   # Staff management, morale
│   │   ├── maintenance.js # Equipment wear, repairs
│   │   ├── events.js      # Random event dispatcher
│   │   └── test_chain.js  # Safety trial mission chain
│   ├── ui/
│   │   ├── dashboard.js   # Main instrument panel
│   │   ├── panels.js      # Secondary panels
│   │   ├── modal.js       # Alert / modal dialogs
│   │   └── trends.js      # Trend-line charts
│   └── utils/
│       ├── math.js        # RK4 integrator, helpers
│       └── deterministic.js # Seeded RNG, golden-master tools
├── tools/
│   ├── serve.sh           # Dev server
│   ├── build.sh           # Production build script
│   └── test.sh            # Run verification suite
├── tests/
│   ├── unit/              # Unit tests (4)
│   └── scenarios/         # Scenario JSON files (3)
├── docs/
│   ├── technical.md       # Architecture & physics reference
│   ├── dev-guide.md       # This file
│   └── changelog.md       # Release history
└── README.md
```

## Load Order (from `index.html`)

1. `src/config.js`
2. `src/utils/math.js`
3. `src/utils/deterministic.js`
4. `src/state.js`
5. `src/physics/neutronics.js`
6. `src/physics/reactivity.js`
7. `src/physics/thermal.js`
8. `src/physics/xenon.js`
9. `src/physics/turbine.js`
10. `src/systems/economy.js`
11. `src/systems/trust.js`
12. `src/systems/personnel.js`
13. `src/systems/maintenance.js`
14. `src/systems/events.js`
15. `src/systems/test_chain.js`
16. `src/ui/dashboard.js`
17. `src/ui/panels.js`
18. `src/ui/modal.js`
19. `src/ui/trends.js`
20. `src/main.js`

## Coding Conventions

- **Language**: ES6+ (no transpilation step in dev)
- **Indentation**: 2 spaces (no tabs)
- **Naming**:
  - Constants: `UPPER_SNAKE_CASE` (exported from config.js)
  - Functions: `camelCase`
  - Namespaces/objects: `PascalCase` (e.g., `Neutronics.step()`, `Economy.tick()`)
- **State**: all mutable state lives in global `STATE`; no stray globals
- **Physics functions**: pure, accept `STATE` and `dt`, return deltas object
- **Systems**: may mutate `STATE` directly; should be idempotent within a tick
- **UI code**: read-only on `STATE`; DOM updates only
- **Comments**: only where intent is not obvious from code

## Adding a New System

1. Create file `src/systems/your_system.js`
2. Add `<script>` tag in `index.html` (before `main.js`)
3. Initialize fields in `src/state.js` under the appropriate namespace
4. Call `YourSystem.tick(STATE, dt)` in `main.js` game loop
5. Read from `STATE.your_system` in `src/ui/` to render

## Parameter Tuning

All tunable numbers live in `src/config.js`. Never hardcode magic numbers
in physics or UI modules. Change values in config to adjust gameplay.

## Known Issues

None yet.
