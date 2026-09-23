// Plant family (lineage) tracking.
//
// A family groups plants that descend from one another — a mother Monstera, the
// cutting you rooted from it, the pup you divided off. Plants carry `familyId`
// and optionally `parentPlantId`; life events (repots, cuttings, propagations)
// live in `familyEvents` keyed by familyId so the whole lineage shares a timeline.

export const FAMILY_EVENT_TYPES = [
  {
    key: 'repot',
    label: 'Re-potted',
    icon: '🪴',
    color: '#b07d4a',
    hint: 'Moved to a new pot or fresh soil',
  },
  {
    key: 'cutting',
    label: 'Took a cutting',
    icon: '✂️',
    color: '#8eb85a',
    hint: 'Cut material off the parent plant',
    canSpawnChild: true,
  },
  {
    key: 'propagate',
    label: 'Started propagating',
    icon: '🫙',
    color: '#5ba3be',
    hint: 'Put a cutting in water, soil, or moss',
    canSpawnChild: true,
  },
  {
    key: 'rooted',
    label: 'Rooted',
    icon: '🌱',
    color: '#4caf50',
    hint: 'Roots appeared on a propagation',
  },
  {
    key: 'potted',
    label: 'Potted up',
    icon: '🌿',
    color: '#4caf50',
    hint: 'A rooted propagation went into soil',
    canSpawnChild: true,
  },
  {
    key: 'divided',
    label: 'Divided',
    icon: '🔪',
    color: '#c06080',
    hint: 'Split the root ball into separate plants',
    canSpawnChild: true,
  },
  {
    key: 'pruned',
    label: 'Pruned',
    icon: '✂️',
    color: '#6a8f6a',
    hint: 'Trimmed back without keeping the cuttings',
  },
  {
    key: 'note',
    label: 'Note',
    icon: '📝',
    color: '#a8c5a0',
    hint: 'Anything else worth remembering',
  },
];

export function eventType(key) {
  return FAMILY_EVENT_TYPES.find(t => t.key === key) || FAMILY_EVENT_TYPES.at(-1);
}

/**
 * Short human-readable family code, e.g. "MON-4F2A". Stored on the family doc so
 * it stays stable and is easy to write on a pot label.
 */
export function makeFamilyCode(name) {
  const prefix = (name || 'FAM')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3)
    .padEnd(3, 'X');
  const suffix = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, '0');
  return `${prefix}-${suffix}`;
}

/**
 * Build parent → children lookups and assign each plant a generation number
 * (0 for plants with no parent inside the family).
 */
export function buildLineage(members) {
  const byId = new Map(members.map(p => [p.id, p]));
  const childrenOf = new Map();

  members.forEach(p => {
    const parentId = p.parentPlantId && byId.has(p.parentPlantId) ? p.parentPlantId : null;
    const bucket = childrenOf.get(parentId) || [];
    bucket.push(p);
    childrenOf.set(parentId, bucket);
  });

  const generation = new Map();
  const walk = (plant, depth, seen) => {
    if (seen.has(plant.id)) return; // defensive: a cycle would otherwise hang
    seen.add(plant.id);
    generation.set(plant.id, depth);
    (childrenOf.get(plant.id) || []).forEach(child => walk(child, depth + 1, seen));
  };
  (childrenOf.get(null) || []).forEach(root => walk(root, 0, new Set()));
  members.forEach(p => { if (!generation.has(p.id)) generation.set(p.id, 0); });

  return { byId, childrenOf, generation, roots: childrenOf.get(null) || [] };
}

/** Flatten a lineage into render order: each root followed by its descendants. */
export function flattenLineage(members) {
  const { childrenOf, roots } = buildLineage(members);
  const out = [];
  const visit = (plant, depth, seen) => {
    if (seen.has(plant.id)) return;
    seen.add(plant.id);
    out.push({ plant, depth });
    [...(childrenOf.get(plant.id) || [])]
      .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
      .forEach(child => visit(child, depth + 1, seen));
  };
  const seen = new Set();
  [...roots]
    .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
    .forEach(root => visit(root, 0, seen));
  members.forEach(p => { if (!seen.has(p.id)) out.push({ plant: p, depth: 0 }); });
  return out;
}
