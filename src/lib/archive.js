// Archiving a plant keeps its history (watering, fertilizer, health, family
// events) but pulls it out of the day-to-day rotation: the main grid, the Thirst
// Quencher, and the reminder notifications.

export const ARCHIVE_REASONS = [
  { key: 'replanted', label: 'Re-potted / replanted', icon: '🪴' },
  { key: 'propagated', label: 'Became a propagation', icon: '🌱' },
  { key: 'given', label: 'Given away', icon: '🎁' },
  { key: 'sold', label: 'Sold', icon: '💸' },
  { key: 'died', label: 'Died', icon: '🥀' },
  { key: 'other', label: 'Other', icon: '📦' },
];

export function archiveReason(key) {
  return ARCHIVE_REASONS.find(r => r.key === key) || null;
}

export function archiveReasonLabel(plant) {
  const reason = archiveReason(plant?.archiveReason);
  if (!reason) return 'Archived';
  return `${reason.icon} ${reason.label}`;
}

export const isArchived = plant => !!plant?.archived;
