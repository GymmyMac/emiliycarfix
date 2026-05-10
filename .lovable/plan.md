## Goal
Make the Knowledge Globe feel like a real physical object — heavy, with momentum that gradually settles — and make the network of connections clearly visible.

## Changes to `src/pages/Dashboard.tsx`

### 1. Globe rotation: momentum + decay (the "real" feel)
Replace the constant `rot.current.y += .0005*dt` auto-spin with a velocity-based system:

- Add `vel = useRef({x: 0, y: 0})` for angular velocity.
- On pointer drag: instead of writing directly to `rot`, accumulate into `vel` (e.g. `vel.y += dx * 0.0008`), and also apply immediately so dragging still feels 1:1.
- Each frame (when not dragging):
  - `rot.x += vel.x * dt; rot.y += vel.y * dt`
  - Apply exponential damping: `vel.x *= 0.985; vel.y *= 0.985` (per-frame, scaled by dt).
  - Add a tiny ambient drift (~0.00008) on Y so it never fully stops, but only when |vel| is below a small threshold — so a flick spins for a few seconds then eases back to gentle drift.
- Result: flick the globe → it spins fast, gradually slows, settles into a slow idle rotation. Feels like a real sphere with friction.

### 2. Atom orbits: slower & calmer
- Halve atom angular speed: `(0.002 + Math.random()*.0035)` instead of `(0.004 + Math.random()*.007)`.
- Reduce node pulse decay so highlights linger longer (`-.012*dt` instead of `-.018*dt`).
- Particle travel speed halved (`0.003 + Math.random()*.003`) so data flow reads as deliberate.

### 3. Connecting lines: clearly visible
Currently `rgba(99,102,241, 0.03–0.11)` — barely there. Upgrade to:
- Use the **source node colour** (not generic indigo) so each connection has identity.
- Front of sphere: `alpha 0.42`, lineWidth `1.2`.
- Back of sphere: `alpha 0.14`, lineWidth `0.9` (still depth-faded, but visible).
- Add a soft additive glow pass: redraw each front-facing edge with `globalCompositeOperation = 'lighter'`, lineWidth `2.5`, alpha `0.08` for a subtle bloom.
- Keep the curved great-circle path (slerp segments) so they hug the sphere.

### 4. Wireframe sphere: slightly stronger
Bump grid lines from `0.055` to `0.09` alpha so the globe surface reads as a solid object behind the connections, not empty space.

## Out of scope
- No layout, header, legend, tooltip, or data-fetching changes.
- No new dependencies.
