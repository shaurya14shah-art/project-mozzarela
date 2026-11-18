// ══════════════════════════════════════════════════════════
// GatherSystem — tools, harvesting, stations, food
//
// The world expansion (owner grilling 2026-10-06): CRAFTED TOOLS, ore
// HARDNESS by pick tier, buildable campfires and bloomeries, food that
// heals and buffs (no hunger). Data in data/expansion.js.
//
//   T ........ cycle what is in your hand: weapon → pickaxe → woodsman's
//              axe → skinning knife → weapon (only tools you carry).
//              The tool is drawn as the weapon in hand (LoadoutSystem
//              `toolOverride`), so it swings, animates and fights.
//   swing .... at a vein, rock, tree or signature node: harvests it if
//              the tool in hand is the right kind and hard enough —
//              otherwise says exactly what is needed.
//   satchel .. double-click a Campfire / Bloomery kit to set it down,
//              food to eat it, a tool to draw it.
//   Forge .... `station` recipes (smelting, cooking, tanning) only work
//              within reach of the right fire. The Sanctuary has both.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { ORES, WOODS, SIGNATURE, FOODS, BIOME_ORES } from '../data/expansion.js';
import { getItem } from '../data/itemRegistry.js';

const TOOL_ORDER = [null, 'pickaxe', 'hatchet', 'knife'];
const STATION_REACH = 7;
const TOOL_NAME = { pickaxe: 'a pickaxe', hatchet: "a woodsman's axe", knife: 'a skinning knife' };

class GatherSystem {
  constructor() {
    this.ctx = null;
    this.toolOut = null;
    this.stations = [];       // { kind, x, y, z, mesh, permanent }
    this.buffs = {};          // buff id → until (performance.now()/1000)
  }

  /** ctx: player, inventory, loadout, chunkManager, scene, notify(text), log(text, kind), combat */
  init(ctx) { this.ctx = ctx; return this; }
  say(t, kind = 'warn') { this.ctx?.log?.(t, kind); }
  get now() { return performance.now() / 1000; }

  // ── Tools ────────────────────────────────────────────────
  /** The best tool of a kind in the satchel, or null. */
  bestTool(kind) {
    let best = null;
    for (const s of this.ctx.inventory.getSlotData()) {
      const it = s?.item;
      if (it?.toolKind === kind && (!best || (it.toolPower || 0) > (best.toolPower || 0))) best = it;
    }
    return best;
  }
  hasKnife() { return !!this.bestTool('knife') || this.toolOut === 'knife'; }

  /** T: weapon → pickaxe → axe → knife → weapon, skipping what you lack. */
  cycleTool() {
    const i = TOOL_ORDER.indexOf(this.toolOut);
    for (let k = 1; k <= TOOL_ORDER.length; k++) {
      const next = TOOL_ORDER[(i + k) % TOOL_ORDER.length];
      if (next === null) { this.draw(null); return; }
      if (this.bestTool(next)) { this.draw(next); return; }
    }
  }
  /** Put a tool kind in hand (null = back to the weapon on your belt). */
  draw(kind) {
    const L = this.ctx.loadout;
    if (!kind) {
      this.toolOut = null; L.toolOverride = null; L._rebuild?.();
      eventBus.emit(Events.LOADOUT_CHANGED, L.snapshot());
      this.ctx.notify(`${L.activeWeapon?.name || 'Your weapon'} drawn.`);
      return;
    }
    const it = this.bestTool(kind);
    if (!it) { this.say(`You carry no ${kind === 'hatchet' ? "woodsman's axe" : kind}. Smith one at the Forge.`); return; }
    this.toolOut = kind;
    L.toolOverride = { ...it, isMemory: true, formId: 'weapon', formName: 'Tool', equips: 'weapon',
      element: 'neutral', stats: { attack: it.power || 8 }, abilities: [], flaws: [], signs: [], isTool: true };
    eventBus.emit(Events.LOADOUT_CHANGED, L.snapshot());
    this.ctx.notify(`${it.name} in hand — T to switch, again for your weapon.`);
  }
  /** Power of the tool in hand of that kind (0 = wrong tool / none). */
  powerOf(kind) {
    if (this.toolOut !== kind) return 0;
    return this.ctx.loadout.toolOverride?.toolPower || 0;
  }

  // ── Harvesting ───────────────────────────────────────────
  /** What a node needs: { tool, hard, what }. */
  need(node) {
    switch (node.type) {
      case 'rock': return { tool: 'pickaxe', hard: 1, what: 'stone' };
      case 'mithril': return { tool: 'pickaxe', hard: ORES.mithril_ore.hard, what: 'mithril' };
      case 'vein': return { tool: 'pickaxe', hard: ORES[node.ore]?.hard || 1, what: ORES[node.ore]?.name || 'ore' };
      case 'tree': return { tool: 'hatchet', hard: WOODS[node.wood || 'oak_wood'] || 1, what: 'the tree' };
      case 'eldertree': return { tool: 'hatchet', hard: WOODS.eldertree, what: 'an eldertree' };
      case 'signature': return { tool: node.tool || null, hard: node.hard || 0, what: getItem(node.item)?.name || 'it' };
      default: return { tool: null, hard: 0, what: '' };
    }
  }

  /**
   * A swing reached harvest nodes (main.js checkCombatCollisions). Each
   * is struck if the tool in hand is right; the first refusal is said.
   */
  strikeNodes(nodes) {
    const cm = this.ctx.chunkManager;
    let told = false;
    for (const node of nodes) {
      if (node.type === 'training_post') { cm.damageNode(node, 10); continue; }
      const n = this.need(node);
      let power = n.tool ? this.powerOf(n.tool) : 3;
      // An axe-family WEAPON can fell soft wood, badly.
      if (!power && n.tool === 'hatchet' && this.ctx.combat.family === 'axe' && n.hard <= 1) power = 1;
      if (!power) {
        if (!told) { this.say(`${n.what[0].toUpperCase() + n.what.slice(1)} needs ${TOOL_NAME[n.tool]}${this.bestTool(n.tool) ? ' — press T to draw it' : ' — smith one at the Forge'}`); told = true; }
        continue;
      }
      if (power < n.hard) {
        if (!told) { this.say(`${n.what[0].toUpperCase() + n.what.slice(1)} is too hard for this ${n.tool === 'pickaxe' ? 'pick' : 'axe'} (needs a better metal)`); told = true; }
        this.ctx.cameraController?.shake(0.05, 0.08);
        continue;
      }
      cm.damageNode(node, 6 + power * 6);
    }
  }

  /** What a destroyed node yields: [{ id, count }]. ChunkManager._destroyNode asks. */
  yieldOf(node, biome) {
    const r = Math.random();
    switch (node.type) {
      case 'vein': return [{ id: node.ore, count: 2 + Math.floor(r * 3) }];
      case 'mithril': return [{ id: 'mithril_ore', count: 2 + Math.floor(r * 2) }];
      case 'signature': return [{ id: node.item, count: 1 + Math.floor(r * 3) }];
      case 'eldertree': return [{ id: 'eldertree', count: 2 + Math.floor(r * 2) }];
      case 'tree': return [{ id: node.wood || 'oak_wood', count: 2 + Math.floor(r * 3) }];
      case 'rock': {
        const out = [{ id: 'stone', count: 2 + Math.floor(r * 3) }];
        // Plain rock sometimes carries a little of the land's ore.
        const ores = BIOME_ORES[biome?.key];
        if (ores && Math.random() < 0.3) {
          const id = ores[Math.floor(Math.random() * ores.length)];
          if ((ORES[id]?.hard || 1) <= this.powerOf('pickaxe')) out.push({ id, count: 1 });
        }
        return out;
      }
      default: return [];
    }
  }

  // ── Stations ─────────────────────────────────────────────
  nearStation(kind, pos = this.ctx.player.position) {
    // A smelter is also a fire (you can cook on a bloomery's mouth).
    return this.stations.some(s => (s.kind === kind || (kind === 'fire' && s.kind === 'smelter'))
      && Math.hypot(s.x - pos.x, s.z - pos.z) < STATION_REACH);
  }
  /** Register a permanent one (the Sanctuary's, camps'). */
  addFixed(kind, x, y, z) { this.stations.push({ kind, x, y, z, permanent: true }); }

  /** A kit from the satchel, set down in front of you. */
  place(item, save = true) {
    const p = this.ctx.player, cam = this.ctx.cameraController;
    const f = cam.getForwardDirection().setY(0).normalize();
    const x = p.position.x + f.x * 2.2, z = p.position.z + f.z * 2.2;
    const y = this.ctx.chunkManager.getGroundY(x, z);
    const st = { kind: item.station, x, y, z, permanent: false };
    st.mesh = this._build(st);
    this.stations.push(st);
    if (save) {
      this.ctx.inventory.consumeItems(item.id, 1);
      this.ctx.notify(item.station === 'fire'
        ? 'Campfire lit. Cook, tan hides and char peat here (the Forge, within a few steps).'
        : 'Bloomery built. Smelt ore and make alloys here (the Forge, within a few steps).');
    }
    return st;
  }

  _build(st) {
    const g = new THREE.Group(); g.position.set(st.x, st.y, st.z);
    const stoneM = new THREE.MeshStandardMaterial({ color: 0x6a6460, roughness: 0.95 });
    if (st.kind === 'fire') {
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), stoneM); r.position.set(Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45); g.add(r); }
      const logM = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
      for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6), logM); l.rotation.set(Math.PI / 2 - 0.5, i * Math.PI / 2, 0); l.position.y = 0.18; g.add(l); }
    } else {
      // A bloomery: a clay chimney on a stone ring, a glowing mouth.
      const clayM = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.95 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 1.5, 12, 1), clayM); body.position.y = 0.75; g.add(body);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 6, 12), clayM); lip.rotation.x = Math.PI / 2; lip.position.y = 1.5; g.add(lip);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), stoneM); r.position.set(Math.cos(a) * 0.7, 0.08, Math.sin(a) * 0.7); g.add(r); }
    }
    const fireM = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff6a10, emissiveIntensity: 2.4, roughness: 0.5, toneMapped: false });
    const fl = new THREE.Mesh(new THREE.ConeGeometry(st.kind === 'fire' ? 0.22 : 0.16, st.kind === 'fire' ? 0.5 : 0.3, 7), fireM);
    fl.position.set(0, st.kind === 'fire' ? 0.3 : 0.3, st.kind === 'fire' ? 0 : 0.58); fl.name = 'station-flame'; g.add(fl);
    const light = new THREE.PointLight(0xff8a3a, 6, 9, 2); light.position.set(0, 0.8, st.kind === 'fire' ? 0 : 0.6); g.add(light);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.ctx.scene.add(g);
    return g;
  }

  update(dt) {
    const t = this.now;
    for (const s of this.stations) {
      const fl = s.mesh?.getObjectByName('station-flame');
      if (fl) { fl.scale.setScalar(0.9 + Math.sin(t * 9 + s.x) * 0.08 + Math.sin(t * 23) * 0.04); fl.rotation.y += dt * 2; }
    }
    // The tool in hand must still be owned (dropped / used up → weapon).
    if (this.toolOut && !this.bestTool(this.toolOut)) this.draw(null);
  }

  // ── Food ─────────────────────────────────────────────────
  eat(item) {
    const f = FOODS[item.food];
    if (!f) return false;
    const p = this.ctx.player;
    p.heal?.(f.heal);
    if (f.buff) this.buffs[f.buff] = this.now + f.secs;
    this.ctx.inventory.consumeItems(item.id, 1);
    this.ctx.notify(`${f.name}. ${f.text}`);
    return true;
  }
  buff(id) { return (this.buffs[id] || 0) > this.now; }

  // ── Save ─────────────────────────────────────────────────
  save() { return { stations: this.stations.filter(s => !s.permanent).map(s => ({ kind: s.kind, x: s.x, y: s.y, z: s.z })) }; }
  restore(v) {
    for (const s of (v?.stations || [])) {
      const st = { ...s, permanent: false };
      st.mesh = this._build(st);
      this.stations.push(st);
    }
  }
}

export const gatherSystem = new GatherSystem();
