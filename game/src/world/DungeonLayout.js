// ══════════════════════════════════════════════════════════
// DungeonLayout — the floor plan of a Descent
//
// A Descent used to be an open disc of ordinary terrain with a glowing
// cylinder around it. This is the plan of what is built there now: a
// seeded set of rooms joined by corridors on a 2 m grid, deterministic
// on (element, tier) so the same Gate always opens onto the same place.
//
//   · the Warden's hall at the realm origin (where the Warden has
//     always spawned)
//   · the entry hall south of it, where the player arrives, with one
//     corridor running OUT past the abort radius. That corridor is the
//     only way back, and walking down it is how you leave (the old
//     boundary rule, unchanged)
//   · side rooms in a ring between them, joined by a minimum spanning
//     tree plus a loop or two so the fight is not one long line
//
// Pure data: no THREE, no scene. rendering/DungeonKit.js builds it and
// DescentSystem uses `spawnCells` / `nav` against it.
//
// Coordinates are metres LOCAL to the realm origin (x east, z south).
// ══════════════════════════════════════════════════════════

export const CELL = 2;          // metres per grid cell
const CORRIDOR_HALF = 2;        // corridors are 4 m wide; big creatures fit

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dungeonSeed(element, tier) {
  let h = 2166136261;
  const s = `${element}:${tier}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const snap = v => Math.round(v / CELL) * CELL;

/**
 * @param {number} seed
 * @param {number} R  the tier's radius (40–88). All floor stays inside
 *                    R - 3 except the exit corridor.
 */
export function generateDungeon(seed, R, opts = {}) {
  const organic = !!opts.organic;   // a cave: round chambers, wandering tunnels, ragged edges
  const rng = mulberry32(seed);
  const half = Math.ceil((R + 16) / CELL);
  const N = half * 2;
  const grid = new Uint8Array(N * N);     // 0 solid, 1 floor
  const roomOf = new Int16Array(N * N).fill(-1);
  const ci = v => Math.floor(v / CELL) + half;          // metre → cell
  const cc = i => (i - half) * CELL + CELL / 2;         // cell → centre metre
  const idx = (i, j) => j * N + i;

  const rooms = [];
  const carve = (x0, z0, x1, z1, room = -1) => {
    const i0 = Math.max(0, ci(Math.min(x0, x1))), i1 = Math.min(N - 1, ci(Math.max(x0, x1) - 0.01));
    const j0 = Math.max(0, ci(Math.min(z0, z1))), j1 = Math.min(N - 1, ci(Math.max(z0, z1) - 0.01));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      grid[idx(i, j)] = 1;
      if (room >= 0 && roomOf[idx(i, j)] < 0) roomOf[idx(i, j)] = room;
    }
  };
  const addRoom = (kind, x, z, hw, hd) => {
    const r = { kind, x: snap(x), z: snap(z), hw: snap(hw), hd: snap(hd), id: rooms.length };
    rooms.push(r);
    return r;
  };
  const overlaps = (x, z, hw, hd, pad) => rooms.some(r =>
    Math.abs(r.x - x) < r.hw + hw + pad && Math.abs(r.z - z) < r.hd + hd + pad);

  // ── Rooms ──
  const W = Math.max(10, Math.min(20, snap(R * 0.27)));
  addRoom('warden', 0, 0, W, W);
  const entryZ = snap(R * 0.6);
  addRoom('entry', 0, entryZ, 6, 5);

  const want = 3 + Math.round(R / 22);
  for (let tries = 0; tries < 400 && rooms.length < want + 2; tries++) {
    const a = rng() * Math.PI * 2;
    const d = R * (0.42 + rng() * 0.38);
    const hw = 4 + Math.floor(rng() * 4) * 2 * (R > 60 ? 1.25 : 1);
    const hd = 4 + Math.floor(rng() * 4) * 2 * (R > 60 ? 1.25 : 1);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    // Inside the abort circle, corners included.
    if (Math.hypot(Math.abs(x) + hw, Math.abs(z) + hd) > R - 3) continue;
    if (overlaps(x, z, hw, hd, 5)) continue;
    addRoom('side', x, z, hw, hd);
  }

  // ── Corridors: MST (Prim) on room centres, plus loops ──
  // ⚠️ Every corridor must stay inside the abort circle: walking past
  // R + 6 ends the Descent, and an L-bend between two rooms on the rim
  // can put its corner well outside it. A route is tried as an L both
  // ways, then as a Z through the midpoint both ways; an edge with no
  // route that fits is simply not used (Prim picks the next nearest).
  const fits = (x, z) => Math.hypot(Math.abs(x) + CORRIDOR_HALF, Math.abs(z) + CORRIDOR_HALF) <= R - 1;
  const route = (A, B) => {
    const mx = snap((A.x + B.x) / 2), mz = snap((A.z + B.z) / 2);
    const options = [
      [[A.x, A.z], [B.x, A.z], [B.x, B.z]],
      [[A.x, A.z], [A.x, B.z], [B.x, B.z]],
      [[A.x, A.z], [mx, A.z], [mx, B.z], [B.x, B.z]],
      [[A.x, A.z], [A.x, mz], [B.x, mz], [B.x, B.z]],
    ];
    if (rng() < 0.5) [options[0], options[1]] = [options[1], options[0]];
    for (const o of options) if (o.every(([x, z]) => fits(x, z))) return o;
    return null;
  };
  const edges = [];
  const inTree = new Set([0]);
  while (inTree.size < rooms.length) {
    let best = null;
    for (const a of inTree) for (const b of rooms) {
      if (inTree.has(b.id)) continue;
      const d = Math.hypot(rooms[a].x - b.x, rooms[a].z - b.z);
      if (best && d >= best.d) continue;
      const r = route(rooms[a], b);
      if (r) best = { a, b: b.id, d, r };
    }
    if (!best) {
      // Unreachable room: drop it rather than ship a hall you cannot enter.
      for (const r of rooms) if (!inTree.has(r.id)) r.dead = true;
      break;
    }
    edges.push(best);
    inTree.add(best.b);
  }
  const loops = 1 + Math.floor(rng() * 2) + (R > 60 ? 1 : 0);
  let added = 0;
  for (let k = 0; k < loops * 8 && added < loops; k++) {
    const a = Math.floor(rng() * rooms.length), b = Math.floor(rng() * rooms.length);
    if (a === b || rooms[a].dead || rooms[b].dead) continue;
    if (edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))) continue;
    if (Math.hypot(rooms[a].x - rooms[b].x, rooms[a].z - rooms[b].z) > R * 0.9) continue;
    const r = route(rooms[a], rooms[b]);
    if (!r) continue;
    edges.push({ a, b, r });
    added++;
  }
  const corridors = [];
  for (const { r } of edges) {
    for (let k = 0; k + 1 < r.length; k++) {
      const [x0, z0] = r[k], [x1, z1] = r[k + 1];
      if (x0 === x1 && z0 === z1) continue;
      if (!organic) {
        carve(Math.min(x0, x1) - CORRIDOR_HALF, Math.min(z0, z1) - CORRIDOR_HALF,
          Math.max(x0, x1) + CORRIDOR_HALF, Math.max(z0, z1) + CORRIDOR_HALF);
      } else {
        // A TUNNEL: discs along the leg, wandering side to side and
        // swelling and pinching as it goes.
        const L = Math.hypot(x1 - x0, z1 - z0) || 1, ux = (x1 - x0) / L, uz = (z1 - z0) / L;
        const ph = rng() * 6.28;
        for (let t = 0; t <= L; t += 1) {
          const wob = Math.sin(t * 0.18 + ph) * 2.2, rad = 2.1 + Math.sin(t * 0.31 + ph * 2) * 0.6;
          let px = x0 + ux * t - uz * wob, pz = z0 + uz * t + ux * wob;
          const lim = R - 1 - rad; const d = Math.hypot(px, pz); if (d > lim) { px *= lim / d; pz *= lim / d; }
          for (let j = ci(pz - rad); j <= ci(pz + rad); j++) for (let i = ci(px - rad); i <= ci(px + rad); i++) {
            if (i >= 0 && j >= 0 && i < N && j < N && Math.hypot(cc(i) - px, cc(j) - pz) <= rad) grid[idx(i, j)] = 1;
          }
        }
      }
      corridors.push({ x0, z0, x1, z1 });
    }
  }
  if (!organic) {
    for (const r of rooms) if (!r.dead) carve(r.x - r.hw, r.z - r.hd, r.x + r.hw, r.z + r.hd, r.id);
  } else {
    // A CHAMBER: an ellipse whose edge is pushed in and out by a seeded
    // wobble, so no two are the same shape and none are boxes.
    for (const r of rooms) {
      if (r.dead) continue;
      const ph = rng() * 6.28, amp = 0.12 + rng() * 0.12;
      for (let j = ci(r.z - r.hd - 4); j <= ci(r.z + r.hd + 4); j++) for (let i = ci(r.x - r.hw - 4); i <= ci(r.x + r.hw + 4); i++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const dx = (cc(i) - r.x) / (r.hw + 1), dz = (cc(j) - r.z) / (r.hd + 1);
        const a = Math.atan2(dz, dx), lim = 1 + Math.sin(a * 3 + ph) * amp + Math.sin(a * 5 - ph) * amp * 0.5;
        if (dx * dx + dz * dz <= lim * lim && Math.hypot(cc(i), cc(j)) < R - 2) {
          grid[idx(i, j)] = 1;
          if (roomOf[idx(i, j)] < 0) roomOf[idx(i, j)] = r.id;
        }
      }
    }
  }

  // The way out: entry hall south, past the abort radius.
  const exitZ = R + 12;
  carve(-CORRIDOR_HALF, entryZ, CORRIDOR_HALF, exitZ);
  corridors.push({ x0: 0, z0: entryZ, x1: 0, z1: exitZ, exit: true });

  // ── Walls: solid cells touching floor (8-neighbour) ──
  const isFloor = (i, j) => i >= 0 && j >= 0 && i < N && j < N && grid[idx(i, j)] === 1;
  const wallCell = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (grid[idx(i, j)]) continue;
    let touch = false;
    for (let dj = -1; dj <= 1 && !touch; dj++) for (let di = -1; di <= 1; di++) {
      if ((di || dj) && isFloor(i + di, j + dj)) { touch = true; break; }
    }
    if (touch) wallCell[idx(i, j)] = 1;
  }
  // The exit corridor's mouth stays open at its far end — no cap.
  const exitJ = ci(exitZ - 0.01);
  for (let i = 0; i < N; i++) if (wallCell[idx(i, exitJ + 1)] && Math.abs(cc(i)) <= CORRIDOR_HALF + CELL) wallCell[idx(i, exitJ + 1)] = 0;

  // Greedy rectangles over wall cells → few, large colliders.
  const wallRects = [];
  const used = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!wallCell[idx(i, j)] || used[idx(i, j)]) continue;
    let i1 = i;
    while (i1 + 1 < N && wallCell[idx(i1 + 1, j)] && !used[idx(i1 + 1, j)]) i1++;
    let j1 = j;
    outer: while (j1 + 1 < N) {
      for (let k = i; k <= i1; k++) if (!wallCell[idx(k, j1 + 1)] || used[idx(k, j1 + 1)]) break outer;
      j1++;
    }
    for (let jj = j; jj <= j1; jj++) for (let k = i; k <= i1; k++) used[idx(k, jj)] = 1;
    wallRects.push({
      x0: (i - half) * CELL, z0: (j - half) * CELL,
      x1: (i1 + 1 - half) * CELL, z1: (j1 + 1 - half) * CELL,
    });
  }

  // Exposed faces: each wall cell side that looks onto floor.
  // dir: 0 +x, 1 -x, 2 +z, 3 -z (the direction the face LOOKS).
  const faces = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!wallCell[idx(i, j)]) continue;
    if (isFloor(i + 1, j)) faces.push({ i, j, dir: 0 });
    if (isFloor(i - 1, j)) faces.push({ i, j, dir: 1 });
    if (isFloor(i, j + 1)) faces.push({ i, j, dir: 2 });
    if (isFloor(i, j - 1)) faces.push({ i, j, dir: 3 });
  }

  const D = {
    seed, R, N, half, cell: CELL, grid, roomOf, wallCell, rooms: rooms.filter(r => !r.dead), corridors,
    wallRects, faces, exitZ, entry: rooms[1], warden: rooms[0],
    ci, cc, idx, isFloor, rng,
    _dist: null, _distFrom: -1,
  };
  return D;
}

// ── Navigation ──────────────────────────────────────────────

/** BFS distance field (in cells) from the cell containing (x, z). */
export function updateFlow(D, x, z) {
  const i = D.ci(x), j = D.ci(z);
  const k = D.idx(i, j);
  if (k === D._distFrom && D._dist) return;
  if (!D.isFloor(i, j)) return;          // keep the last good field
  const N = D.N, dist = D._dist || new Int32Array(N * N);
  dist.fill(-1);
  const q = new Int32Array(N * N);
  let h = 0, t = 0;
  dist[k] = 0; q[t++] = k;
  while (h < t) {
    const c = q[h++], ci = c % N, cj = (c / N) | 0, dc = dist[c] + 1;
    if (ci + 1 < N && D.grid[c + 1] && dist[c + 1] < 0) { dist[c + 1] = dc; q[t++] = c + 1; }
    if (ci > 0 && D.grid[c - 1] && dist[c - 1] < 0) { dist[c - 1] = dc; q[t++] = c - 1; }
    if (cj + 1 < N && D.grid[c + N] && dist[c + N] < 0) { dist[c + N] = dc; q[t++] = c + N; }
    if (cj > 0 && D.grid[c - N] && dist[c - N] < 0) { dist[c - N] = dc; q[t++] = c - N; }
  }
  D._dist = dist;
  D._distFrom = k;
}

/** True when the straight segment between two points stays on floor. */
export function clearLine(D, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(len / (D.cell * 0.5));
  for (let s = 1; s < steps; s++) {
    const t = s / steps, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    // A creature has width: test a little either side too.
    if (!D.isFloor(D.ci(x), D.ci(z))) return false;
  }
  return true;
}

/**
 * Where a creature at (x, z) should walk to reach the field's source.
 * Writes into `out` ({x, z}) and returns true when it is a waypoint
 * (false = walk straight at the target, it is in plain sight).
 */
export function navStep(D, x, z, tx, tz, out) {
  if (!D._dist) return false;
  if (clearLine(D, x, z, tx, tz)) return false;
  const i = D.ci(x), j = D.ci(z), N = D.N;
  let here = D.isFloor(i, j) ? D._dist[D.idx(i, j)] : 1e9;
  if (here < 0) here = 1e9;
  let best = -1, bestD = here;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (!di && !dj) continue;
    const a = i + di, b = j + dj;
    if (!D.isFloor(a, b)) continue;
    // No corner-cutting through a wall.
    if (di && dj && (!D.isFloor(i + di, j) || !D.isFloor(i, j + dj))) continue;
    const d = D._dist[b * N + a];
    if (d >= 0 && d < bestD) { bestD = d; best = b * N + a; }
  }
  if (best < 0) return false;
  // Look one step further along the gradient so the path is smooth.
  out.x = D.cc(best % N);
  out.z = D.cc((best / N) | 0);
  return true;
}

/**
 * Floor cells between `minD` and `maxD` metres of walking from the
 * field's source — where a wave should come from. Rooms preferred.
 */
export function spawnCells(D, count, minD = 12, maxD = 44) {
  const out = [];
  if (!D._dist) return out;
  const pool = [], room = [];
  const lo = minD / D.cell, hi = maxD / D.cell;
  for (let k = 0; k < D._dist.length; k++) {
    const d = D._dist[k];
    if (d < lo || d > hi) continue;
    const p = { x: D.cc(k % D.N), z: D.cc((k / D.N) | 0) };
    if (Math.hypot(p.x, p.z) > D.R - 2) continue;   // never in the exit corridor's tail
    (D.roomOf[k] >= 0 ? room : pool).push(p);
  }
  const src = room.length >= count ? room : room.concat(pool);
  for (let n = 0; n < count && src.length; n++) {
    const k = Math.floor(Math.random() * src.length);
    out.push(src.splice(k, 1)[0]);
  }
  return out;
}
