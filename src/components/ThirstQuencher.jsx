import { useState } from 'react';
import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { playWaterDrop, playCompletionChime, vibrate } from '../lib/sounds';

export default function ThirstQuencher({ plants, lastWatered, user, household, onClose }) {
  const [checked, setChecked] = useState(new Set());
  const [quenching, setQuenching] = useState(false);
  const [done, setDone] = useState(false);

  function getDaysSince(plantId) {
    const ts = lastWatered[plantId];
    if (!ts) return null;
    const ms = ts.toDate ? ts.toDate().getTime() : ts.seconds * 1000;
    return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
  }

  function thirstScore(plant) {
    const days = getDaysSince(plant.id);
    const interval = plant.waterIntervalDays;
    if (!interval) return -1;
    if (days === null) return interval + 1000;
    return days / interval;
  }

  function isOverdue(plant) {
    const days = getDaysSince(plant.id);
    const interval = plant.waterIntervalDays;
    return interval && (days === null || days >= interval);
  }

  function getDueLabel(plant) {
    const days = getDaysSince(plant.id);
    const interval = plant.waterIntervalDays;
    if (!interval) {
      if (days === null) return 'Never watered';
      if (days === 0) return 'Watered today';
      return `${days}d ago`;
    }
    const until = interval - (days ?? 0);
    if (days === null) return 'Never watered';
    if (until > 0) return `In ${until}d`;
    if (until === 0) return 'Due today';
    return `${Math.abs(until)}d late`;
  }

  // Group by location, sort within each group by thirst score desc
  const groups = {};
  [...plants]
    .sort((a, b) => thirstScore(b) - thirstScore(a))
    .forEach(plant => {
      const key = plant.location || '📦 Elsewhere';
      if (!groups[key]) groups[key] = [];
      groups[key].push(plant);
    });

  const locationOrder = Object.keys(groups).sort((a, b) => {
    if (a === '📦 Elsewhere') return 1;
    if (b === '📦 Elsewhere') return -1;
    return a.localeCompare(b);
  });

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
      </div>

      {/* Plant list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px' }}>
        {locationOrder.map(location => (
          <div key={location} style={{ marginBottom: '20px' }}>
            <div style={{
              color: '#6a8f6a', fontSize: '12px', fontWeight: '700',
              textTransform: 'uppercase', letterSpacing: '1px',
              marginBottom: '8px', paddingBottom: '6px',
              borderBottom: '1px solid #1a2e1a',
            }}>
              {location === '📦 Elsewhere' ? '📦 Elsewhere' : `📍 ${location}`}
            </div>
            {groups[location].map(plant => {
              const isChecked = checked.has(plant.id);
              const overdue = isOverdue(plant);
              const dueLabel = getDueLabel(plant);
              const dueColor = overdue ? '#e07b39' : '#4caf50';

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
                      color: isChecked ? '#3a5a3a' : dueColor,
                      fontSize: '12px', marginTop: '2px', fontWeight: '600',
                    }}>
                      💧 {dueLabel}
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
