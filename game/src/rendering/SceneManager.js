// ══════════════════════════════════════════════════════════
// Scene Manager — Three.js Scene with Anime Cel-Shading
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { atmosphere } from './Atmosphere.js';
import { quality } from './Quality.js';
import { environmentIBL } from './EnvironmentIBL.js';
import { weather } from './Weather.js';

class SceneManager {
  constructor() {
    this.scene = null;
    this.renderer = null;
    this.canvas = null;
    this.clock = new THREE.Clock();

    // Toon shading gradient
    this.toonGradientMap = null;
  }

  init(canvasId = 'game-canvas') {
    this.canvas = document.getElementById(canvasId);

    // Decide the render tier before anything reads from it. Everything
    // below (pixel ratio, shadow map size, whether IBL exists at all)
    // is now a function of this rather than a hardcoded constant.
    quality.init();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      // The composer's FXAA pass already anti-aliases the final image
      // — the renderer's OWN native antialias:true was paying for a
      // second, redundant AA resolve every frame (and one that mostly
      // goes to waste anyway once post-processing renders to a plain,
      // non-multisampled target). Off.
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // 2x device pixel ratio on a high-DPI display means 4x the actual
    // fragment work for every pass (base render, bloom, grade, FXAA).
    // 1.3 is still crisp and meaningfully cheaper on retina-class
    // screens; the adaptive scaler in main.js can still push it lower
    // still under sustained load.
    // Was a hard 1.3 cap tuned for the artifact build's unknown target
    // machine. The HD tiers raise it — on a display where DPR is 2,
    // rendering at 1.3 and upscaling is the most visible single source
    // of softness in the whole image, and it costs nothing to fix on a
    // GPU that can afford it.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.settings.pixelRatioCap));
    this.renderer.shadowMap.enabled = true;
    // VSM at the higher tiers: PCF's fixed 3x3-ish kernel gives every
    // shadow the same hard-ish edge regardless of how far the occluder
    // is from the receiver, which is a strong "this is a videogame"
    // tell. VSM blurs in shadow-map space, so a monolith's shadow
    // stays crisp at its base and softens with distance the way a real
    // penumbra does. It costs a blur pass and needs a larger bias, both
    // of which are handled below.
    // ⚠️ PCF soft at every tier now (perf pass) — RŌNIN's choice. VSM
    // added a blur pass to every shadow update and its own shader
    // variants to compile; the softness it bought at distance is not
    // worth that on the hardware this was reported laggy on.
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4; // Atmosphere.apply() overrides per-path on boot
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene — sky, fog and grade are owned by Atmosphere so the world
    // and the interface share one art direction.
    this.scene = new THREE.Scene();
    atmosphere.init(this.scene, this.renderer);

    // Create toon gradient texture (3-band anime shading)
    this._createToonGradient();

    // Lighting
    this._setupLighting();

    // Handle resize
    window.addEventListener('resize', () => this._onResize());

    console.log('[SceneManager] Initialized with anime shading pipeline');
    return this;
  }

  _createToonGradient() {
    // 4-step gradient for anime-style cel shading.
    // This only quantizes each DIRECT light's own contribution (the
    // sun) — ambient/hemisphere bypass it entirely — but a deep-shadow
    // band this dark still read as "unlit" wherever the sun wasn't
    // hitting square-on. Raised the floor so the shadow side of a toon
    // band is dim, not black.
    const colors = new Uint8Array(4);
    colors[0] = 130;  // deep shadow
    colors[1] = 180;  // shadow
    colors[2] = 222;  // midtone
    colors[3] = 255;  // highlight

    this.toonGradientMap = new THREE.DataTexture(colors, 4, 1, THREE.RedFormat);
    this.toonGradientMap.minFilter = THREE.NearestFilter;
    this.toonGradientMap.magFilter = THREE.NearestFilter;
    this.toonGradientMap.needsUpdate = true;
  }

  _setupLighting() {
    // Built neutral; Atmosphere.apply() colours (and re-intensifies)
    // the whole rig per path immediately after bindLights() below, so
    // these are only ever visible for a single frame at most — but
    // kept as sane PBR-scale fallbacks in their own right. Lower than
    // the old toon-era defaults: MeshStandardMaterial's diffuse
    // response is continuous (no gradient-map banding to absorb
    // excess light) and adds real specular energy on top, so identical
    // toon-tuned intensities read as blown-out under PBR.
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x404040, 0.5);
    this.scene.add(this.hemiLight);

    // Directional — main sun with sharp shadows.
    // The shadow map was 4096×4096 (16M texels, rendered every frame)
    // for a frustum that only ever needs to cover the ground right
    // around the player — the light repositions to follow the camera
    // every frame (see Atmosphere.update()), so its frustum was mostly
    // shadowing empty air far from anything visible. 1536² at a tighter
    // ±60 frustum covers the same *useful* area at ~7x fewer texels,
    // and the smaller frustum actually gives sharper shadows up close.
    this.sunLight = new THREE.DirectionalLight(0xfffae0, 1.1);
    this.sunLight.position.set(50, 100, 40);
    this.sunLight.castShadow = true;
    // Shrunk again alongside the smaller render distance: the visible
    // world radius is now a fraction of what this frustum used to
    // need to cover, so the old 1536²/±60 pair was still shadowing a
    // lot of fogged-out empty ground every frame for no visible gain.
    //
    // Both numbers are now tier-driven (Quality.js). The reasoning
    // above still holds at `low`; the HD tiers spend the extra texels
    // because contact-accurate shadows are load-bearing for realism
    // and this build is not sharing a budget with anything.
    const shadowSize = quality.settings.shadowMapSize;
    const shadowExt  = quality.settings.shadowRadius;
    this.sunLight.shadow.mapSize.width = shadowSize;
    this.sunLight.shadow.mapSize.height = shadowSize;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 140;
    this.sunLight.shadow.camera.left = -shadowExt;
    this.sunLight.shadow.camera.right = shadowExt;
    this.sunLight.shadow.camera.top = shadowExt;
    this.sunLight.shadow.camera.bottom = -shadowExt;
    this.sunLight.shadow.bias = -0.0005;
    if (quality.isHD) {
      // VSM reads from a blurred, filterable depth moment texture, so
      // the classic negative depth bias that fixes PCF acne instead
      // causes light leaking here. normalBias offsets along the
      // surface normal, which is the correct control for VSM, and the
      // radius is the penumbra blur width in shadow texels.
      // PCF needs a small depth bias where VSM needed none (acne otherwise).
      this.sunLight.shadow.bias = -0.0004;
      this.sunLight.shadow.normalBias = 0.025;
      // Penumbra width and sample count, tier-driven. A hard-edged
      // shadow is one of the strongest "real-time game" tells; a wide,
      // well-sampled penumbra is most of what separates this from a
      // pre-rendered look. Cheap here because VSM blurs the moment
      // texture once, not per-receiving-pixel.
      const soft = (quality.settings.propDetail ?? 0) >= 3;
      this.sunLight.shadow.radius = soft ? 7 : 4;
      this.sunLight.shadow.blurSamples = soft ? 16 : 8;
    }
    this.scene.add(this.sunLight);

    // Rim separates silhouettes from the fog. Colour comes from the path.
    this.rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    this.rimLight.position.set(-30, 40, -20);
    this.scene.add(this.rimLight);

    this.scene.add(this.sunLight.target);
    // Was left un-added: an Object3D not in the scene graph never gets
    // its matrixWorld refreshed by the normal render traversal, which
    // is the other half of the "rim light points at the wrong thing"
    // bug fixed in Atmosphere.update().
    this.scene.add(this.rimLight.target);

    atmosphere.bindLights({
      ambient: this.ambientLight,
      hemi:    this.hemiLight,
      key:     this.sunLight,
      rim:     this.rimLight,
    });

    // Image-based lighting, baked from the sky Atmosphere just built.
    // Must come AFTER bindLights(): apply() sets the per-path light
    // intensities, and compensateLights() scales the ambient pair down
    // from whatever apply() decided, so running it first would have
    // its work immediately overwritten.
    environmentIBL.init(this.renderer, this.scene, atmosphere.sky, atmosphere.physSky);
    // Ground half takes the terrain tint, matching _refreshEnvironment().
    environmentIBL.bake(`${atmosphere.path}:init`, atmosphere.palette.terrain.tint);
    environmentIBL.compensateLights({
      ambient: this.ambientLight,
      hemi: this.hemiLight,
    });
    atmosphere.bindEnvironment(environmentIBL);

    // Add ambient magical particles
    this._createAmbientParticles();

    // Weather sits on top of the finished light rig — it modulates the
    // fog and key intensity Atmosphere has just set, so it has to come
    // after apply() has run at least once.
    weather.init(this.scene, atmosphere);
  }

  _createAmbientParticles() {
    const particleCount = 200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const phases = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      phases[i] = Math.random() * Math.PI * 2;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

    // Motes take the path's ember/bone colour — the old hardcoded
    // blue read as floating plastic cubes against an ember sky.
    const material = new THREE.PointsMaterial({
      color: atmosphere.particleColor(),
      size: 0.16,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
    atmosphere.bindParticles(this.particles);
  }

  // Create a PBR-lite material. Kept the old name/signature — 6+ call
  // sites across the codebase (ChunkManager, Player, Pickup,
  // CharacterPreviewUI, main.js) pass `sceneManager.createToonMaterial
  // (color, options)`, some still in the old Phong vocabulary
  // ({ shininess, specular }) from before this was a toon material.
  // MeshStandardMaterial doesn't understand those — it silently
  // ignores unknown props — so they're translated into
  // roughness/metalness rather than passed through raw or thrown on.
  createToonMaterial(color = 0x7c5cf5, options = {}) {
    const {
      shininess,
      specular,
      roughness: roughnessOpt,
      metalness: metalnessOpt,
      ...rest
    } = options;

    let roughness = roughnessOpt;
    let metalness = metalnessOpt;

    if (roughness === undefined) {
      // Blinn-Phong shininess -> a rough PBR roughness approximation.
      // Call sites in this codebase range ~8 (matte cloth sleeve) to
      // ~80 (glossy armor tint); map that onto the low-shininess=rough,
      // high-shininess=glossy PBR curve. No shininess hint at all ->
      // a generic mid-rough default (0.6) that reads plausibly on most
      // untextured props without any per-material tuning.
      roughness = shininess !== undefined
        ? THREE.MathUtils.clamp(1 - shininess / 100, 0.05, 0.95)
        : 0.6;
    }

    if (metalness === undefined) {
      // Metalness is close to binary for real-world surfaces (PBR
      // research) — default to non-metal, since this one function
      // serves everything (cloth, leather, stone, wood) and only a
      // few callers actually mean "bare metal". An explicit tinted
      // `specular` (Phong's crude stand-in for a metallic reflection)
      // nudges the default up, but callers that actually want a
      // metal should pass metalness explicitly — that per-material
      // tuning is a later pass.
      metalness = specular !== undefined ? 0.3 : 0.0;
    }

    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness,
      metalness,
      ...rest, // emissive, emissiveIntensity, transparent, opacity, etc. pass through untouched
    });
  }

  // Create an outlined mesh (inverted hull technique for anime outlines)
  createOutlinedMesh(geometry, color = 0x7c5cf5, outlineWidth = 0.03) {
    const group = new THREE.Group();

    // Main mesh with toon material
    const mainMaterial = this.createToonMaterial(color);
    const mainMesh = new THREE.Mesh(geometry, mainMaterial);
    mainMesh.castShadow = true;
    mainMesh.receiveShadow = true;
    group.add(mainMesh);

    // Outline mesh (inverted hull)
    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.BackSide,
    });
    const outlineMesh = new THREE.Mesh(geometry, outlineMaterial);
    outlineMesh.scale.multiplyScalar(1 + outlineWidth);
    group.add(outlineMesh);

    group.userData.mainMesh = mainMesh;
    group.userData.outlineMesh = outlineMesh;

    return group;
  }

  /**
   * Atmosphere drives the sun now. This used to lock the scene to
   * "permanent brilliant High Noon" with a hardcoded blue sky, which
   * flattened every surface in the game.
   */
  updateSunPosition(_angle, cameraPosition = null, dt = 0.016) {
    atmosphere.update(dt, cameraPosition);

    if (this.particles) {
      const positions = this.particles.geometry.attributes.position.array;
      const phases = this.particles.geometry.attributes.phase.array;
      for (let i = 0; i < positions.length / 3; i++) {
        phases[i] += 0.01;
        positions[i * 3 + 1] += Math.sin(phases[i]) * 0.02;
        if (positions[i * 3 + 1] > 20) positions[i * 3 + 1] = 0;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
  }

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  add(object) {
    this.scene.add(object);
  }

  remove(object) {
    this.scene.remove(object);
  }
}

export const sceneManager = new SceneManager();
