// ══════════════════════════════════════════════════════════
// FacetCaster — runs any composed Facet (data/facets.js)
//
// One executor for every composed skill. A skill's `spec` says HOW it
// reaches (its delivery), how hard, how often and with what riders; this
// file implements each delivery once and applies the riders the same way
// for all of them. A new motion is therefore data, never a new branch in
// main.js's ASPECT_USED switch (which still runs the OLD keyed Facets of
// existing saves — they are not touched).
//
// ⚠️ EFFECTS LAND ON THE SKILL'S OWN IMPACT FRAMES. `spec.hit` (and
// `rehit`) are fractions of the skill's animation (`spec.dur`); the cast
// queues them and `update(dt)` fires them on time, so the damage arrives
// when the motion in your hands actually connects — same rule as the
// basic swing (WeaponMotion, IMPACT_LAG). Nothing uses setTimeout, so a
// paused game pauses its skills.
//
// ⚠️ Damage goes through COMBAT_HIT with `source: 'player'`, so every
// power system (lineage, Leaning, Ascent, Boons, epithets, the Refusal)
// applies exactly as it does to a sword swing (HANDOFF trap #12).
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { wind } from '../world/Wind.js';

const _v = new THREE.Vector3(), _to = new THREE.Vector3();

class FacetCaster {
  constructor() {
    this.ctx = null;
    this._queue = [];   // { t, fn }
  }

  /**
   * @param {object} ctx  live game objects, injected by main.js:
   *   player, enemySpawner, eventBus, Events, weaveVFX, particleBursts,
   *   cameraController, chunkManager, projectileManager, applyBleed,
   *   notify, elementHex
   */
  init(ctx) { this.ctx = ctx; return this; }

  update(dt) {
    if (!this._queue.length) return;
    for (const q of this._queue) q.t -= dt;
    const due = this._queue.filter(q => q.t <= 0);
    this._queue = this._queue.filter(q => q.t > 0);
    for (const q of due) { try { q.fn(); } catch (err) { console.warn('[FacetCaster] effect failed:', err); } }
  }

  _at(t, fn) { this._queue.push({ t, fn }); }

  /** Cast a composed Facet. `power` is the Remnant's power. */
  /**
   * @param {object} [timing] { dur, hits: seconds[] } — the impact frames of
   *   the skill's own choreography (rendering/Choreo.js). When given they
   *   win over the spec's authored fractions: the blow lands when you SEE
   *   it land.
   */
  cast(ability, power, timing = null) {
    const c = this.ctx, s = ability?.spec;
    if (!c || !s) return false;
    const el = s.element || 'neutral';
    const name = ability.name;
    let hits;
    if (timing?.hits?.length && timing.dur > 0) {
      hits = timing.hits.map(t => t / s.dur);           // fractions of s.dur, scheduled below as h * s.dur
    } else {
      hits = [s.hit ?? 0.5, ...(Array.isArray(s.rehit) ? s.rehit : s.rehit != null ? [s.rehit] : [])];
    }
    // More hits than blows: the rest follow through after the last one.
    while (hits.length < s.hits) hits.push(hits[hits.length - 1] + 0.12);

    // A ward is on from the first frame; a pre-dash happens before the blow.
    if (s.ward) c.player.iFrames = Math.max(c.player.iFrames || 0, s.ward * (s.durMult || 1));
    if (s.preDash) this._dash(s.preDash, el, s);

    // The echo lands when the choreography's echo stroke does (the Call
    // trait adds that stroke as the clip's LAST blow), else 0.55 s later.
    const used = hits.slice(0, Math.max(1, s.hits));
    let echoDelay = 0.55;
    if (s.echo && timing?.hits?.length > used.length) {
      echoDelay = Math.max(0.1, timing.hits[timing.hits.length - 1] - used[0] * s.dur);
    }
    let landed = 0;
    used.forEach((h, i) => {
      this._at(h * s.dur, () => {
        landed += this._deliver(s, el, power, i === 0, 1);
        if (i === 0) this._afterFirst(s, el, landed, name);
      });
      if (s.echo) this._at(h * s.dur + echoDelay, () => { this._deliver(s, el, power, false, s.echo); });
    });
    return true;
  }

  // ── Deliveries ──────────────────────────────────────────
  _deliver(s, el, power, first, scale) {
    const c = this.ctx, p = c.player;
    const dir = c.cameraController.getAimDirection();
    const flat = _v.copy(dir).setY(0).normalize().clone();
    const chest = p.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const dmg = power * s.mult * scale;
    let foes = [];
    switch (s.delivery) {
      case 'arc': {
        const half = THREE.MathUtils.degToRad(Math.min(360, s.arc) / 2), cosH = Math.cos(half);
        foes = c.enemySpawner.getEnemiesInRange(p.position, s.radius).filter(e => {
          _to.copy(e.position).sub(p.position).setY(0);
          return s.arc >= 360 || _to.lengthSq() < 0.5 || _to.normalize().dot(flat) >= cosH;
        });
        c.weaveVFX.arc(chest.clone().addScaledVector(dir, 1.6), dir, el, { size: s.radius * 0.75, sweep: THREE.MathUtils.degToRad(s.arc) * (first ? 1 : -1), roll: first ? 1.2 : -1.2, life: 0.32 });
        break;
      }
      case 'ring':
      case 'pull':
      case 'self': {
        foes = s.delivery === 'self' ? [] : c.enemySpawner.getEnemiesInRange(p.position, s.radius);
        if (s.delivery === 'pull' && first) for (const e of foes) this._shove(e, -Math.max(1, e.position.distanceTo(p.position) - 1.4));
        c.weaveVFX.ring(p.position, el, { size: s.radius, life: 0.55 });
        if (s.delivery === 'self') c.weaveVFX.dome(chest, el, { size: s.radius * 0.7, life: Math.max(0.8, s.ward || 1) });
        break;
      }
      case 'line': {
        const len = s.range, w = s.width || 1;
        foes = c.enemySpawner.getEnemiesInRange(p.position, len + w).filter(e => {
          _to.copy(e.position).sub(chest);
          const along = _to.dot(dir);
          if (along < 0 || along > len) return false;
          return _to.addScaledVector(dir, -along).length() <= w + 0.6;
        });
        if (!s.through && foes.length) {
          foes.sort((a, b) => a.position.distanceToSquared(p.position) - b.position.distanceToSquared(p.position));
          foes = foes.slice(0, 1);
        }
        c.weaveVFX.streak(chest.clone(), chest.clone().addScaledVector(dir, len), el, { size: Math.max(0.5, w) });
        break;
      }
      case 'point': {
        const cand = c.enemySpawner.getEnemiesInRange(p.position, s.range).filter(e => {
          _to.copy(e.position).sub(p.position).setY(0);
          return _to.lengthSq() < 0.5 || _to.normalize().dot(flat) > 0.55;
        });
        cand.sort((a, b) => a.position.distanceToSquared(p.position) - b.position.distanceToSquared(p.position));
        foes = cand.slice(0, 1);
        if (foes[0]) c.particleBursts.spawn(foes[0].position, el, { count: 16, sizeMult: 1.3 });
        break;
      }
      case 'leap':
      case 'dash': {
        if (first) {
          const from = this._dash(s.dash, el, s);
          if (s.delivery === 'dash') {
            // Everything on the path between where you were and where you are.
            const seg = p.position.clone().sub(from), L = seg.length(); seg.normalize();
            foes = c.enemySpawner.getEnemiesInRange(from, L + 2).filter(e => {
              _to.copy(e.position).sub(from); const a = _to.dot(seg);
              return a >= -0.5 && a <= L + 0.5 && _to.addScaledVector(seg, -a).length() <= (s.width || 1) + 0.6;
            });
            break;
          }
        }
        foes = c.enemySpawner.getEnemiesInRange(p.position, s.radius || 2.5);
        c.weaveVFX.ring(p.position, el, { size: s.radius || 2.5, life: 0.5 });
        break;
      }
      case 'target': {
        const at = p.position.clone().addScaledVector(flat, s.range);
        at.y = c.chunkManager.getGroundY(at.x, at.z);
        foes = c.enemySpawner.getEnemiesInRange(at, s.radius);
        c.weaveVFX.ring(at, el, { size: s.radius, life: 0.6 });
        c.particleBursts.spawn(at.clone().setY(at.y + 0.6), el, { count: 18, sizeMult: 1.3 });
        break;
      }
      case 'volley': {
        if (first && s.dash) this._dash(s.dash, el, s);
        const n = Math.max(1, s.shots), spread = THREE.MathUtils.degToRad(s.spread || 0);
        for (let i = 0; i < n; i++) {
          const a = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
          const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
          c.projectileManager.spawnFireball(chest.clone().addScaledVector(d, 0.9), d, Math.round(dmg), c.elementHex(el), el);
        }
        return n;
      }
    }
    // The ground answers the skill: flattened grass, a splash, dust.
    const R = s.radius || (s.delivery === 'line' ? 2.5 : 2);
    const at = s.delivery === 'target' ? p.position.clone().addScaledVector(flat, s.range)
      : (s.delivery === 'ring' || s.delivery === 'pull' || s.delivery === 'leap' || s.delivery === 'self') ? p.position
      : p.position.clone().addScaledVector(flat, Math.min(4, (s.range || s.radius || 3) * 0.5));
    wind.impulse(at, Math.min(7, R), Math.min(1.6, 0.6 + s.mult * 0.25) * scale);
    for (const e of foes) this._strike(e, dmg, s, el);
    if (foes.length) c.cameraController.shake(Math.min(0.4, 0.08 + s.mult * 0.05), 0.2 + s.stagger * 0.1);
    return foes.length;
  }

  /** One target struck: damage, then every rider the spec carries. */
  _strike(e, dmg, s, el) {
    const c = this.ctx, d = s.durMult || 1;
    // Perception's armour bypass: an honest extra share, not a stat edit.
    const total = dmg * (1 + (s.armour || 0) * 0.5);
    c.eventBus.emit(c.Events.COMBAT_HIT, { source: 'player', target: e, damage: total, element: el });
    c.particleBursts.spawn(e.position, el, { count: 8, sizeMult: 0.9 });
    if (s.bleed) c.applyBleed(e, total * 0.12 * s.bleed, 4 * d, el);
    if (s.burn) c.applyBleed(e, total * 0.08, s.burn, el);
    if (s.slow) e.applySlow?.(1 - Math.min(0.8, s.slow), 2.5 * d);
    if (s.stagger) e.hitStun = Math.max(e.hitStun || 0, 0.4 + s.stagger * 0.6 * d);
    if (s.knock) this._shove(e, 2.4 * s.knock);
    if (s.pull) this._shove(e, -1.6);
    if (s.leech) c.player.heal(total * s.leech);
  }

  _afterFirst(s, el, landed, name) {
    const c = this.ctx;
    if (s.mend) c.player.heal(c.player.maxHp * s.mend);
    c.notify(landed ? `${name} — ${landed} struck.` : `${name}.`);
  }

  /** Push an enemy along the line from the player (negative pulls it in). */
  _shove(e, dist) {
    const c = this.ctx;
    _to.copy(e.position).sub(c.player.position).setY(0);
    if (_to.lengthSq() < 1e-4) return;
    _to.normalize().multiplyScalar(dist);
    e.position.add(_to);
    e.position.y = c.chunkManager.getGroundY(e.position.x, e.position.z);
  }

  /** Travel `dist` along the aim (negative = backwards). Returns where you started. */
  _dash(dist, el, s) {
    const c = this.ctx, p = c.player;
    const from = p.position.clone();
    const flat = c.cameraController.getAimDirection().setY(0).normalize();
    p.position.addScaledVector(flat, dist);
    p.position.y = c.chunkManager.getGroundY(p.position.x, p.position.z) + 1;
    p.iFrames = Math.max(p.iFrames || 0, 0.25);
    c.weaveVFX.streak(from.clone().setY(from.y + 1), p.position.clone().setY(p.position.y + 0.2), el, { size: 0.8 });
    return from;
  }
}

export const facetCaster = new FacetCaster();
