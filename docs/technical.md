# Technical Document — RBMK Simulator

## Architecture

The simulator is organized around a single global `STATE` object that holds all mutable state. Three layers interact in a strict loop:

- **Physics** — pure functions that read `STATE` and return deltas
- **Systems** — game logic (economy, trust, personnel, maintenance, random events, safety-trial chains)
- **UI** — reads `STATE` and renders the DOM; no side effects on physics

## Data Flow

```
Player Input → main.js → STATE mutation
                         → physics step (sub-stepped)
                         → systems step
                         → UI render (requestAnimationFrame)
```

Each tick advances `STATE.time` by 0.5 s of simulation time. Stiff equations (neutronics, xenon) use sub-stepping inside the physics step.

## Physical Equations

### Point Kinetics (6 delayed-neutron groups)

```
dP/dt  = (ρ − β) / Λ · P  +  Σ λ_i · C_i
dC_i/dt  = β_i / Λ · P  −  λ_i · C_i
```

- `P` — reactor power (fraction of rated)
- `ρ` — total reactivity (pcm)
- `β` — effective delayed-neutron fraction
- `Λ` — prompt-neutron lifetime (s)
- `λ_i`, `β_i` — decay constant and fraction for group `i`
- `C_i` — precursor concentration for group `i`

### Reactivity Synthesis

```
ρ_total = ρ_rods + ρ_void + ρ_fuel + ρ_xenon + ρ_external
```

- `ρ_rods` — from control-rod insertion depth (with AZ-5 override)
- `ρ_void` — void-reactivity feedback (positive in RBMK)
- `ρ_fuel` — Doppler (negative) feedback
- `ρ_xenon` — xenon-poisoning reactivity
- `ρ_external` — operator-injected or event-driven worth

### Thermal Hydraulics (5 axial zones)

```
dT_zone/dt = (P_zone − h · A · (T_zone − T_coolant)) / (m · c_p)
```

- `P_zone` — fraction of core power deposited in zone `i`
- `h` — heat-transfer coefficient
- `A` — surface area of zone
- `T_zone`, `T_coolant` — zone and coolant temperatures (°C)
- `m` — mass of fuel / graphite in zone
- `c_p` — specific heat capacity

### Xenon Poisoning

```
dXe/dt  = γ_xe · Σ_f · Φ + λ_I · I − λ_xe · Xe − σ_xe · Φ · Xe
dI/dt   = γ_I  · Σ_f · Φ − λ_I · I
```

- `Xe`, `I` — xenon / iodine concentrations
- `Φ` — neutron flux (proportional to power)
- `Σ_f` — macroscopic fission cross-section
- `γ_xe`, `γ_I` — fission yields
- `λ_xe`, `λ_I` — decay constants
- `σ_xe` — microscopic absorption cross-section of Xe-135

### Turbine & Generator

- Steam flow from boiler pressure / enthalpy drop
- Electrical power = mass flow × isentropic enthalpy drop × efficiency
- Turbine speed governed by steam-admission valve position

### AZ-5 (Emergency Protection)

Three-phase rod insertion:
1. **Phase 1** — rod tips enter core (possible **positive scram spike** if graphite displacer enters water)
2. **Phase 2** — main absorber section follows
3. **Phase 3** — rods fully inserted, full shutdown

The positive scram spike is optional (controlled by config parameter) and requires sub-stepping to capture.

## Key Parameters

| Constant | Value | Description |
|---|---|---|
| `RATED_T` | 700 °C | Rated fuel temperature |
| `MELT_T` | 2800 °C | Fuel melting threshold |
| `NUM_RODS` | 211 | Total control rods |
| `ORM_MIN` | 15 | Minimum operable rod count |
| `ORM_CRIT` | 1.0 | ORM safety threshold |
| `FLOW_RATED` | 8000 m³/h | Rated coolant flow |
| `AXIAL_ZONES` | 5 | Number of thermal zones |

See `src/config.js` for the full set of parameters and their defaults.

## STATE Schema

The complete `STATE` object (initialized in `src/state.js`):

```
STATE
├── time              (float, seconds)
├── running           (bool)
├── speed             (float, multiplier)
├── scenario          (string)
│
├── reactor
│   ├── power         (float, fraction 0..1)
│   ├── power_target  (float)
│   ├── scram         (bool)
│   ├── az5_phase     (0|1|2|3)
│   ├── rods          (array[NUM_RODS])
│   ├── orm           (float)
│   ├── period        (float, seconds)
│   ├── rho_total     (float, pcm)
│   ├── rho_rods      (float)
│   ├── rho_void      (float)
│   ├── rho_fuel      (float)
│   ├── rho_xenon     (float)
│   ├── flux          (float)
│   └── precursors    (array[6])
│
├── core
│   ├── zones         (array[5]: temp, power_frac, coolant_temp)
│   ├── avg_temp      (float)
│   ├── peak_temp     (float)
│   └── damage        (float, cumulative)
│
├── coolant
│   ├── flow          (float)
│   ├── pressure      (float)
│   ├── inlet_temp    (float)
│   └── outlet_temp   (float)
│
├── xenon
│   ├── concentration (float)
│   ├── iodine        (float)
│   └── reactivity    (float)
│
├── turbine
│   ├── speed         (float, rpm)
│   ├── power         (float, MW)
│   ├── steam_pressure (float)
│   ├── steam_flow    (float)
│   └── valve_pos     (float, 0..1)
│
├── building
│   ├── pressure      (float)
│   ├── radiation     (float)
│   ├── containment   (bool)
│   └── alarms        (array)
│
├── economy
│   ├── balance       (float)
│   ├── power_price   (float)
│   ├── penalty       (float)
│   └── maintenance   (float)
│
├── trust
│   ├── public        (float, 0..1)
│   ├── government    (float, 0..1)
│   └── staff         (float, 0..1)
│
├── personnel
│   ├── chief         (object)
│   ├── operators     (array)
│   └── morale        (float)
│
├── events
│   ├── queue         (array)
│   └── active        (object|null)
│
├── ui
│   ├── active_panel  (string)
│   ├── modal         (object|null)
│   ├── trend_buffer  (array)
│   └── alerts        (array)
│
└── test_chain
    ├── active        (bool)
    ├── current_step  (int)
    ├── safety_margin (float)
    └── history       (array)
```

## Stepping Strategy

One physics tick = 0.5 s of simulation time. Within each tick:

1. Compute sub-step size `dt_sub` (adaptive, clamped to 1 ms – 50 ms).
2. Loop over sub-steps:
   - Solve neutronics (RK4 for point kinetics + precursors).
   - Solve xenon/iodine (RK4).
   - Solve thermal zones (Euler or RK4).
   - Update coolant properties.
   - Update turbine.
3. After full tick: update game systems, generate events, compute UI deltas.

Stiffness from short neutron lifetime and xenon absorption is handled by the RK4 sub-stepping; the main loop remains decoupled for responsiveness.

## Verification Method

- **Golden-master checkpoints**: deterministic runs compare `STATE` snapshots at tick boundaries against stored JSON hashes.
- **Scenario replay**: each test scenario (e.g., `scenarios/az5-test.json`) is played from fixed seed; output must match golden file exactly.
- CI runs `npm test` which invokes the deterministic runner and diffs checkpoints.
