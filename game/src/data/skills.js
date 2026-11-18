// ══════════════════════════════════════════════════════════
// Skill Definitions
// ══════════════════════════════════════════════════════════

export const SKILLS = {
  fireball: { id: 'fireball', element: 'fire', name: 'Fireball', description: 'Hurl a ball of fire.', cost: 10, cooldown: 2, type: 'magic' },
  heal: { id: 'heal', element: 'light', name: 'Restoration', description: 'Restore health.', cost: 20, cooldown: 5, type: 'magic' },
  dash: { id: 'dash', element: 'wind', name: 'Aero Dash', description: 'Dash quickly forward.', cost: 10, cooldown: 3, type: 'utility' },
  shield_bash: { id: 'shield_bash', element: 'earth', name: 'Shield Bash', description: 'Bash enemies with shield.', cost: 15, cooldown: 4, type: 'melee' },
  strike: { id: 'strike', element: 'neutral', name: 'Heavy Strike', description: 'A powerful melee attack.', cost: 12, cooldown: 3, type: 'melee' },
  backstab: { id: 'backstab', element: 'shadow', name: 'Backstab', description: 'High damage from behind.', cost: 15, cooldown: 6, type: 'melee' },
  volley: { id: 'volley', element: 'wind', name: 'Arrow Volley', description: 'Fire multiple arrows.', cost: 20, cooldown: 5, type: 'ranged' },
  summon_wolf: { id: 'summon_wolf', element: 'poison', name: 'Summon Wolf', description: 'Summon a spirit wolf.', cost: 30, cooldown: 15, type: 'summon' },
  parry: { id: 'parry', element: 'arcane', name: 'Perfect Parry', description: 'Deflect incoming damage.', cost: 10, cooldown: 2, type: 'defense' },
  dark_blast: { id: 'dark_blast', element: 'void', name: 'Dark Blast', description: 'Unleash void energy.', cost: 25, cooldown: 6, type: 'magic' }
};
