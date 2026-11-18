// ══════════════════════════════════════════════════════════
// ECS — Entity Component System
// ══════════════════════════════════════════════════════════

let nextEntityId = 0;

export class Entity {
  constructor(name = 'entity') {
    this.id = nextEntityId++;
    this.name = name;
    this.components = new Map();
    this.tags = new Set();
    this.active = true;
    this.destroyed = false;
  }

  addComponent(component) {
    this.components.set(component.constructor.name, component);
    component.entity = this;
    return this;
  }

  getComponent(ComponentClass) {
    return this.components.get(ComponentClass.name) || null;
  }

  hasComponent(ComponentClass) {
    return this.components.has(ComponentClass.name);
  }

  removeComponent(ComponentClass) {
    const comp = this.components.get(ComponentClass.name);
    if (comp) {
      comp.entity = null;
      this.components.delete(ComponentClass.name);
    }
    return this;
  }

  addTag(tag) { this.tags.add(tag); return this; }
  hasTag(tag) { return this.tags.has(tag); }
  removeTag(tag) { this.tags.delete(tag); return this; }

  destroy() {
    this.destroyed = true;
    this.active = false;
  }
}

export class Component {
  constructor() {
    this.entity = null;
  }
}

export class System {
  constructor(name, priority = 0) {
    this.name = name;
    this.priority = priority;
    this.enabled = true;
  }

  init(world) { }
  update(dt, world) { }
  fixedUpdate(dt, world) { }
  destroy() { }
}

export class World {
  constructor() {
    this.entities = new Map();
    this.systems = [];
    this.entitiesToDestroy = [];
  }

  addEntity(entity) {
    this.entities.set(entity.id, entity);
    return entity;
  }

  removeEntity(id) {
    this.entities.delete(id);
  }

  getEntitiesWith(...ComponentClasses) {
    const results = [];
    for (const entity of this.entities.values()) {
      if (!entity.active || entity.destroyed) continue;
      let hasAll = true;
      for (const CC of ComponentClasses) {
        if (!entity.hasComponent(CC)) { hasAll = false; break; }
      }
      if (hasAll) results.push(entity);
    }
    return results;
  }

  getEntitiesWithTag(tag) {
    const results = [];
    for (const entity of this.entities.values()) {
      if (entity.active && !entity.destroyed && entity.hasTag(tag)) {
        results.push(entity);
      }
    }
    return results;
  }

  getEntityByName(name) {
    for (const entity of this.entities.values()) {
      if (entity.name === name && !entity.destroyed) return entity;
    }
    return null;
  }

  addSystem(system) {
    this.systems.push(system);
    this.systems.sort((a, b) => a.priority - b.priority);
    system.init(this);
    return system;
  }

  update(dt) {
    for (const system of this.systems) {
      if (system.enabled) system.update(dt, this);
    }
    this._cleanup();
  }

  fixedUpdate(dt) {
    for (const system of this.systems) {
      if (system.enabled) system.fixedUpdate(dt, this);
    }
  }

  _cleanup() {
    for (const entity of this.entities.values()) {
      if (entity.destroyed) {
        this.entities.delete(entity.id);
      }
    }
  }

  destroy() {
    for (const system of this.systems) {
      system.destroy();
    }
    this.entities.clear();
    this.systems = [];
  }
}
