import { useState } from 'react';
import { collection, writeBatch, doc, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { playWaterDrop, playCompletionChime, vibrate } from '../lib/sounds';
import { wateringStatus, thirstScore, startOfLocalDay } from '../lib/dates';
import { useBackGuard } from '../hooks/useBackGuard';
import { format, addDays } from 'date-fns';

const ELSEWHERE = '📦 Elsewhere';
// Anything further out than this collapses into one "Later" group so the list
// doesn't turn into a wall of single-plant date headers.
const HORIZON_DAYS = 7;

export default function ThirstQuencher({ plants, lastWatered, lastChecked = {}, user, household, onClose }) {
  const [checked, setChecked] = useState(new Set());
  const [quenching, setQuenching] = useState(false);
  const [done, setDone] = useState(false);
  const [groupBy, setGroupBy] = useState('day');

  useBackGuard(!done, onClose);

  const statusFor = plant => wateringStatus(plant, lastWatered[plant.id], lastChecked[plant.id]);
  const scoreFor = plant => thirstScore(plant, lastWatered[plant.id], lastChecked[plant.id]);

  const byThirst = [...plants].sort((a, b) => scoreFor(b) - scoreFor(a));

  // --- by room -------------------------------------------------------------
  function roomGroups() {
    const map = new Map();
    byThirst.forEach(plant => {
      const key = plant.location || ELSEWHERE;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(plant);
    });
    return [...map.keys()]
      .sort((a, b) => (a === ELSEWHERE ? 1 : b === ELSEWHERE ? -1 : a.localeCompare(b)))
      .map(key => ({
        key,
        title: key === ELSEWHERE ? ELSEWHERE : `📍 ${key}`,
        subtitle: null,
        plants: map.get(key),
        urgent: false,
      }));
  }

  // --- by day --------------------------------------------------------------
  // Buckets: everything already due lands in Overdue, then one group per
  // calendar day out to the horizon, then Later, then plants with no schedule.
  function dayGroups() {
    const buckets = new Map();
    const push = (key, plant) => {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(plant);
    };

    byThirst.forEach(plant => {
      const { state, daysUntil } = statusFor(plant);
      if (state === 'unset') push('none', plant);
      else if (state === 'never' || state === 'late') push('overdue', plant);
      else if (daysUntil > HORIZON_DAYS) push('later', plant);
      else push(`d${daysUntil}`, plant);
    });

    const today = startOfLocalDay(new Date());
    const dayTitle = n =>
      n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : format(addDays(today, n), 'EEEE');

    const order = [
      { key: 'overdue', title: '⚠️ Overdue', subtitle: 'Should already have been watered', urgent: true },
      ...Array.from({ length: HORIZON_DAYS + 1 }, (_, n) => ({
        key: `d${n}`,
        title: dayTitle(n),
        subtitle: format(addDays(today, n), 'MMM d'),
        urgent: n === 0,
      })),
      { key: 'later', title: 'Later', subtitle: `More than ${HORIZON_DAYS} days out`, urgent: false },
      { key: 'none', title: 'No schedule', subtitle: 'No watering interval set', urgent: false },
    ];

    return order
      .filter(g => buckets.has(g.key))
      .map(g => ({
        ...g,
        // Within a day, walk room by room so you're not criss-crossing the house
        plants: [...buckets.get(g.key)].sort(
          (a, b) =>
            (a.location || '￿').localeCompare(b.location || '￿') ||
            a.name.localeCompare(b.name)
        ),
      }));
  }

  const sections = groupBy === 'day' ? dayGroups() : roomGroups();

  function toggle(plantId) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(plantId)) {
        next.delete(plantId);
      } else {
        next.add(plantId);
        playWaterDrop();
        vibrate(40);
      }
      return next;
    });
  }

  async function quench() {
    if (!checked.size || quenching) return;
    setQuenching(true);
    try {
      const batch = writeBatch(db);
      const displayName = user.displayName?.split(' ')[0] || 'Someone';
      checked.forEach(plantId => {
        const logRef = doc(collection(db, 'wateringLogs'));
        batch.set(logRef, {
          plantId,
          householdId: household.id,
          wateredAt: serverTimestamp(),
          loggedBy: { userId: user.uid, displayName },
        });
        // Watering supersedes any "check pushed this out" override
        batch.update(doc(db, 'plants', plantId), { nextWateringOverride: deleteField() });
      });
      await batch.commit();
      playCompletionChime();
      vibrate([50, 50, 100]);
      setDone(true);
      setTimeout(onClose, 1800);
    } catch (err) {
      console.error(err);
      setQuenching(false);
    }
  }

  if (done) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#0f1f0f', zIndex: 50,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>💧</div>
        <p style={{ color: '#4caf50', fontSize: '22px', fontWeight: '700', margin: 0 }}>
          {checked.size} plant{checked.size !== 1 ? 's' : ''} quenched!
        </p>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#0f1f0f', zIndex: 50,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 16px 12px', background: '#0f1f0f',
        borderBottom: '1px solid #1a2e1a', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ color: '#fff', margin: '0 0 2px', fontSize: '20px', fontWeight: '700' }}>
              🚿 Thirst Quencher
            </h2>
            <p style={{ color: '#6a8f6a', margin: 0, fontSize: '13px' }}>
              Tap each plant as you water it
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '10px',
              color: '#fff', padding: '8px 12px', cursor: 'pointer', fontSize: '18px', lineHeight: 1,
            }}
          >
            ←
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginTop: '12px', alignItems: 'center' }}>
          <span style={{ color: '#6a8f6a', fontSize: '12px' }}>Group by:</span>
          {[
            { key: 'day', label: '📅 Day' },
            { key: 'room', label: '📍 Room' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setGroupBy(opt.key)}
              style={{
                padding: '5px 12px', borderRadius: '20px', fontSize: '12px',
                fontWeight: groupBy === opt.key ? '700' : '400',
                background: groupBy === opt.key ? '#4caf50' : '#1e331e',
                color: groupBy === opt.key ? '#fff' : '#a8c5a0',
                border: groupBy === opt.key ? 'none' : '1px solid #2d4a2d',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Plant list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px' }}>
        {sections.map(section => (
          <div key={section.key} style={{ marginBottom: '20px' }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px',
              marginBottom: '8px', paddingBottom: '6px',
              borderBottom: `1px solid ${section.urgent ? '#2d4a2d' : '#1a2e1a'}`,
            }}>
              <span style={{
                color: section.urgent ? '#e0a060' : '#6a8f6a', fontSize: '12px', fontWeight: '700',
                textTransform: 'uppercase', letterSpacing: '1px',
              }}>
                {section.title}
              </span>
              <span style={{ color: '#3a5a3a', fontSize: '11px', whiteSpace: 'nowrap' }}>
                {section.subtitle ? `${section.subtitle} · ` : ''}
                {section.plants.length} plant{section.plants.length !== 1 ? 's' : ''}
              </span>
            </div>
            {section.plants.map(plant => {
              const isChecked = checked.has(plant.id);
              const status = statusFor(plant);
              const overdue = status.state === 'late' || status.state === 'never';
              const dueLabel = status.shortLabel;
              const dueColor = status.color;

              return (
                <div
                  key={plant.id}
                  onClick={() => toggle(plant.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    background: isChecked ? '#0a2a0a' : '#1a2e1a',
                    borderRadius: '12px', padding: '10px 12px',
                    marginBottom: '8px', cursor: 'pointer',
                    border: `1px solid ${isChecked ? '#4caf50' : overdue ? '#e07b39' : '#2d4a2d'}`,
                    opacity: isChecked ? 0.6 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Photo */}
                  <div style={{
                    width: '52px', height: '52px', borderRadius: '10px',
                    overflow: 'hidden', flexShrink: 0, background: '#2d4a2d',
                  }}>
                    {plant.photoUrl ? (
                      <img src={plant.photoUrl} alt={plant.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🌿</div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: isChecked ? '#6a8f6a' : '#fff',
                      fontWeight: '600', fontSize: '15px',
                      textDecoration: isChecked ? 'line-through' : 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {plant.name}
                    </div>
                    <div style={{
                      color: isChecked ? '#3a5a3a' : groupBy === 'day' ? '#6a8f6a' : dueColor,
                      fontSize: '12px', marginTop: '2px', fontWeight: '600',
                    }}>
                      {groupBy === 'day'
                        ? (plant.location ? `📍 ${plant.location}` : ELSEWHERE)
                        : `${status.icon} ${dueLabel}`}
                    </div>
                  </div>

                  {/* Checkbox */}
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${isChecked ? '#4caf50' : '#2d4a2d'}`,
                    background: isChecked ? '#4caf50' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '14px', fontWeight: '700',
                  }}>
                    {isChecked ? '✓' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom action bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#0f1f0f', borderTop: '1px solid #2d4a2d',
        padding: '16px', zIndex: 60,
      }}>
        <button
          onClick={quench}
          disabled={!checked.size || quenching}
          style={{
            width: '100%', background: checked.size ? '#4caf50' : '#1e331e',
            color: checked.size ? '#fff' : '#3a5a3a', border: 'none',
            borderRadius: '14px', padding: '16px', fontSize: '17px',
            fontWeight: '700', cursor: checked.size ? 'pointer' : 'default',
            transition: 'all 0.2s',
          }}
        >
          {quenching ? 'Quenching...' : checked.size
            ? `🚿 Quench ${checked.size} plant${checked.size !== 1 ? 's' : ''}`
            : 'Tap plants to check them off'}
        </button>
      </div>
    </div>
  );
}
