// ══════════════════════════════════════════════════════════
// Character Preview — top-right paperdoll
//
// The Pioneer's own body is hidden in first person (see Player.js —
// the camera sits at its eye height, so rendering it would mean
// staring out through the inside of your own hood). That's correct
// for the view, but it means the player has never actually been able
// to SEE their own attunement colour or equipped gear on their own
// character since the game went first-person. This is a second,
// completely independent scene + renderer — its own rig instance,
// never the hidden one — turntabling in a small inset panel so
// there's still somewhere to look at yourself.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { forgePioneer, retintPioneer, forgeWand, retintWand, animateWand, forgeWeapon, animateWeapon, applyPioneerCorruption } from '../rendering/EntityForge.js';
import { eventBus, Events } from '../core/EventBus.js';
import { sceneManager } from '../rendering/SceneManager.js';

class CharacterPreviewUI {
  constructor() {
    this._element = 'arcane';
    this._time = 0;
    this._ready = false;
    this._injectHTML();
    this._bindEvents();
  }

  _injectHTML() {
    const host = document.getElementById('hud-top-right');
    if (!host) return;

    const panel = document.createElement('div');
    panel.id = 'character-preview';
    panel.innerHTML = `<canvas id="character-preview-canvas"></canvas>`;
    // First child of the top-right column — stacks above the minimap
    // in the existing flex layout, no manual offset math needed.
    host.insertBefore(panel, host.firstChild);
    this._canvas = panel.querySelector('canvas');
  }

  _bindEvents() {
    eventBus.on(Events.ATTUNEMENT_UPDATE, (snap) => {
      if (snap.dominant) this.setElement(snap.dominant);
      if (snap.mastery) this.setCorrupted(true);
    });
    eventBus.on(Events.PLAYER_EQUIP_VISUAL, ({ color }) => this.setEquipTint(color));
    eventBus.on(Events.PLAYER_EQUIP_WEAPON, (data) => this.setWeapon(data));
  }

  /** Deferred until the canvas has real layout size — called once from main.js after the HUD is shown. */
  init() {
    if (this._ready || !this._canvas) return;
    const w = this._canvas.clientWidth || 140;
    const h = this._canvas.clientHeight || 176;

    this.renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x000000, 0); // transparent — the panel's own CSS chrome shows through
    // Match the main scene's grading so the figure doesn't read as a
    // flat, differently-lit cutout pasted over the game's own render.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    // The Pioneer rig stands ~3 units tall, feet at y=0, hood-tip near
    // y=2.97 (see forgePioneer). The previous camera (dist 3.4, 32° FOV,
    // centred at y=1.35) only ever framed the chest/belt — the head sat
    // entirely above the frustum, which is why the panel read as a
    // giant unreadable dark blob. Framed here to show the full figure
    // with headroom/footroom, from a slightly elevated three-quarter
    // angle typical of a character-select portrait.
    this.camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 20);
    this.camera.position.set(0, 2.05, 5.35);
    this.camera.lookAt(0, 1.4, 0);

    // Fixed, flattering three-point-ish lighting — deliberately NOT
    // tied to Atmosphere's day/path cycle, so the panel reads exactly
    // the same regardless of what the sky is doing.
    // Neutral light (realism pass): purple ambient + blue rim at 1.6 was toy lighting.
    this.scene.add(new THREE.HemisphereLight(0xb8c0cc, 0x3a3228, 0.9));
    const key = new THREE.DirectionalLight(0xffe6c8, 1.7);
    key.position.set(2, 3, 2.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xc8d2e0, 0.6);
    rim.position.set(-2, 1.5, -2);
    this.scene.add(rim);
    // Soft fill from below-front so the shadow side of the robe never
    // crushes to pure black at this close a viewing distance.
    const fill = new THREE.DirectionalLight(0x8a8478, 0.35);
    fill.position.set(-1.5, 0.5, 3);
    this.scene.add(fill);

    this._rig = forgePioneer(this._element);
    this._wand = forgeWand(this._element);
    this._rig.weaponGroup.add(this._wand);
    // Wand's own point light is tuned for a whole 3D world, not 3
    // world-units from a tiny camera — same fix as the FPS viewmodel.
    this._wand.traverse(o => { if (o.name === 'wand-light') o.intensity = 0.5; });

    this._turntable = new THREE.Group();
    this._turntable.add(this._rig.group);
    this.scene.add(this._turntable);
    // Frame whatever body we got (the real 1.78 m person, or the old
    // 3 m procedural fallback) from its measured height.
    {
      const box = new THREE.Box3().setFromObject(this._rig.group);
      const h = Math.max(0.5, box.max.y - box.min.y);
      this.camera.position.set(0, h * 0.62, h * 2.15);
      this.camera.lookAt(0, h * 0.5, 0);
    }

    this._ready = true;
    if (this._corrupted) this.setCorrupted(true);
  }

  setElement(element) {
    this._element = element;
    if (!this._ready) return;
    retintPioneer(this._rig.group, element);
    retintWand(this._wand, element);
  }

  /** Mirrors Player.setCorrupted — see EntityForge.applyPioneerCorruption. */
  setCorrupted(active) {
    this._corrupted = active;
    if (!this._ready) return;
    applyPioneerCorruption(this._rig.group, active);
  }

  /**
   * Mirrors Player.equipArmor's own tinting exactly (same blunt
   * whole-body recolour, same eye-overwriting quirk) so the preview
   * never shows something the hidden in-game body doesn't actually
   * have on. There's no separate helmet/chest/leg geometry to swap in
   * this engine — the tint IS what "wearing armor" looks like here.
   */
  setEquipTint(colorHex) {
    this._equipColor = colorHex;
    if (!this._ready) return;
    const tintMat = sceneManager.createToonMaterial(colorHex, { shininess: 80 });
    this._rig.group.traverse(c => {
      if (c.isMesh && c.material?.color) c.material = tintMat;
    });
  }

  /** Mirrors Player.equipWeapon's own forge call — a separate rig, so
   *  it needs its own copy of whatever got forged at the Forge. */
  setWeapon({ weaponType, element, tierLevel, seed, metal }) {
    if (!this._ready) return;
    if (this._weaponMesh) {
      this._rig.weaponGroup.remove(this._weaponMesh);
      this._weaponMesh = null;
    }
    // ⚠️ Same `seed` the body rig and the viewmodel used, or the
    // panel would show the player a different weapon than the one
    // they are holding.
    this._weaponMesh = forgeWeapon(weaponType, element, tierLevel, seed, metal);
    this._weaponMesh.position.x = 0.07;
    this._rig.weaponGroup.add(this._weaponMesh);
  }

  update(dt) {
    if (!this._ready) return;
    this._time += dt;
    this._turntable.rotation.y += dt * 0.35;
    // The real body has a skeleton: without its mixer ticking it stands
    // in its bind pose with its arms out (measured in the first shot).
    this._rig.group.userData.mixer?.update(dt);
    animateWand(this._wand, this._time);
    if (this._weaponMesh) animateWeapon(this._weaponMesh, this._time);
  }

  render() {
    if (!this._ready || !this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }
}

export const characterPreviewUI = new CharacterPreviewUI();
