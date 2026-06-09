import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import AddPlantModal from '../components/AddPlantModal';
import HouseholdModal from '../components/HouseholdModal';
import ThirstQuencher from '../components/ThirstQuencher';
import mascotImg from '../assets/mascot.png';

const SORT_OPTIONS = [
  { key: 'thirstiest', label: '💧 Thirstiest' },
  { key: 'alpha', label: 'A → Z' },
  { key: 'recent', label: '🆕 Recent' },
];

export default function HomeScreen({ user, household, onSelectPlant }) {
  const [plants, setPlants] = useState([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [lastWatered, setLastWatered] = useState({});
  const [sort, setSort] = useState('thirstiest');
  const [locationFilter, setLocationFilter] = useState(null);
  const [showHousehold, setShowHousehold] = useState(false);
  const [showQuencher, setShowQuencher] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [batching, setBatching] = useState(false);

  useEffect(() => {
    if (!household) return;
    const q = query(collection(db, 'plants'), where('householdId', '==', household.id));
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setPlants(docs);
    });
  }, [household]);

  useEffect(() => {
    if (!household) return;
    const q = query(collection(db, 'wateringLogs'), where('householdId', '==', household.id));
    return onSnapshot(q, snap => {
      const map = {};
      snap.docs.forEach(d => {
        const { plantId, wateredAt } = d.data();
        const seconds = wateredAt?.seconds ?? 0;
        if (!map[plantId] || seconds > (map[plantId]?.seconds ?? 0)) map[plantId] = wateredAt;
      });
      setLastWatered(map);
    });
  }, [household]);

  function getDaysSince(ts) {
    if (!ts) return null;
    const ms = ts.toDate ? ts.toDate().getTime() : ts.seconds * 1000;
    return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
  }

  function thirstScore(plant) {
    const days = getDaysSince(lastWatered[plant.id]);
    const interval = plant.waterIntervalDays;
    if (!interval) return -1;
    if (days === null) return interval + 1000;
    return days / interval;
  }

  const locations = [...new Set(plants.map(p => p.location).filter(Boolean))].sort();

  function sortedPlants() {
    let filtered = plants.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.location?.toLowerCase().includes(search.toLowerCase())
    );
    if (locationFilter) filtered = filtered.filter(p => p.location === locationFilter);
    if (sort === 'alpha') return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'recent') return filtered;
    return [...filtered].sort((a, b) => thirstScore(b) - thirstScore(a));
  }

  function enterMultiSelect(plantId) {
    setMultiSelect(true);
    setSelected(new Set([plantId]));
  }

  function toggleSelect(plantId) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(plantId) ? next.delete(plantId) : next.add(plantId);
      return next;
    });
  }

  function exitMultiSelect() {
    setMultiSelect(false);
    setSelected(new Set());
  }

  async function batchLog(type) {
    if (!selected.size || batching) return;
    setBatching(true);
    const batch = writeBatch(db);
    const displayName = user.displayName?.split(' ')[0] || 'Someone';
    selected.forEach(plantId => {
      const logRef = doc(collection(db, type === 'water' ? 'wateringLogs' : 'fertilizerLogs'));
      const entry = type === 'water'
        ? { plantId, householdId: household.id, wateredAt: serverTimestamp(), loggedBy: { userId: user.uid, displayName } }
        : { plantId, householdId: household.id, fertilizedAt: serverTimestamp(), loggedBy: { userId: user.uid, displayName } };
      batch.set(logRef, entry);
    });
    await batch.commit();
    setBatching(false);
    exitMultiSelect();
  }

  const displayPlants = sortedPlants();

  return (
    <div style={{ minHeight: '100dvh', background: '#0f1f0f', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: multiSelect ? '100px' : '24px' }}>
      <div style={{ padding: '20px 16px 12px', position: 'sticky', top: 0, background: '#0f1f0f', zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px' }}>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: '700', margin: 0 }}>
            🌿 {household.name ? `${household.name}'s Plants` : 'My Plants'}
          </h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setShowHousehold(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: '#1e331e', border: '1px solid #2d4a2d',
                borderRadius: '10px', padding: '6px 10px', cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '14px' }}>🏠</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {household.name || household.id}
              </span>
            </button>
            <button
              onClick={() => signOut(auth)}
              style={{
                background: '#1e331e', border: '1px solid #2d4a2d', borderRadius: '10px',
                padding: '6px 10px', cursor: 'pointer', fontSize: '16px', color: '#a8c5a0', lineHeight: 1,
              }}
            >
              ⏻
            </button>
          </div>
        </div>

        {!multiSelect && (
          <>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or location..."
              style={{
                width: '100%', background: '#1e331e', border: '1px solid #2d4a2d',
                borderRadius: '10px', padding: '10px 14px', color: '#fff', fontSize: '15px',
                outline: 'none', boxSizing: 'border-box', marginBottom: '10px',
              }}
            />
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', alignItems: 'center' }}>
              <span style={{ color: '#6a8f6a', fontSize: '12px', flexShrink: 0 }}>Sort:</span>
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSort(opt.key)}
                  style={{
                    flexShrink: 0, padding: '5px 10px', borderRadius: '20px', fontSize: '12px',
                    fontWeight: sort === opt.key ? '700' : '400',
                    background: sort === opt.key ? '#4caf50' : '#1e331e',
                    color: sort === opt.key ? '#fff' : '#a8c5a0',
                    border: sort === opt.key ? 'none' : '1px solid #2d4a2d',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {locations.length > 1 && (
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', marginTop: '6px' }}>
                <span style={{ color: '#6a8f6a', fontSize: '12px', flexShrink: 0, alignSelf: 'center' }}>📍</span>
                <button
                  onClick={() => setLocationFilter(null)}
                  style={{
                    flexShrink: 0, padding: '5px 10px', borderRadius: '20px', fontSize: '12px',
                    fontWeight: !locationFilter ? '700' : '400',
                    background: !locationFilter ? '#2d4a1e' : '#1e331e',
                    color: !locationFilter ? '#a8e080' : '#a8c5a0',
                    border: !locationFilter ? '1px solid #4caf50' : '1px solid #2d4a2d',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  All
                </button>
                {locations.map(loc => (
                  <button
                    key={loc}
                    onClick={() => setLocationFilter(f => f === loc ? null : loc)}
                    style={{
                      flexShrink: 0, padding: '5px 10px', borderRadius: '20px', fontSize: '12px',
                      fontWeight: locationFilter === loc ? '700' : '400',
                      background: locationFilter === loc ? '#2d4a1e' : '#1e331e',
                      color: locationFilter === loc ? '#a8e080' : '#a8c5a0',
                      border: locationFilter === loc ? '1px solid #4caf50' : '1px solid #2d4a2d',
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {multiSelect && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#a8c5a0', fontSize: '14px' }}>
              {selected.size} plant{selected.size !== 1 ? 's' : ''} selected
            </span>
            <button onClick={exitMultiSelect} style={{ background: 'none', border: 'none', color: '#a8c5a0', cursor: 'pointer', fontSize: '14px' }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {displayPlants.length === 0 && !search && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: '#a8c5a0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🪴</div>
          <p style={{ fontSize: '16px', margin: 0 }}>No plants yet. Add your first one!</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '12px 16px 0' }}>
        {displayPlants.map(plant => (
          <PlantTile
            key={plant.id}
            plant={plant}
            lastWateredTs={lastWatered[plant.id]}
            multiSelect={multiSelect}
            isSelected={selected.has(plant.id)}
            onLongPress={() => enterMultiSelect(plant.id)}
            onClick={() => multiSelect ? toggleSelect(plant.id) : onSelectPlant(plant)}
          />
        ))}
      </div>

      {/* FABs — hidden in multiselect */}
      {!multiSelect && (
        <>
          <button
            onClick={() => setShowQuencher(true)}
            style={{
              position: 'fixed', bottom: '24px', left: '20px',
              width: '60px', height: '60px', borderRadius: '50%',
              background: '#1e3a1e', border: '1px solid #4caf50', color: '#fff',
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(76,175,80,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20,
              fontSize: '26px',
            }}
          >
            🚿
          </button>
          <button
            onClick={() => setShowAdd(true)}
            style={{
              position: 'fixed', bottom: '24px', right: '20px',
              width: '60px', height: '60px', borderRadius: '50%',
              background: '#4caf50', color: '#fff', border: 'none',
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(76,175,80,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20,
            }}
          >
            <span style={{ fontSize: '26px' }}>🌱</span>
          </button>
        </>
      )}

      {/* Multiselect action bar */}
      {multiSelect && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#1a2e1a', borderTop: '1px solid #2d4a2d',
          padding: '16px', display: 'flex', gap: '12px', zIndex: 30,
        }}>
          <button
            onClick={() => batchLog('water')}
            disabled={!selected.size || batching}
            style={{
              flex: 1, background: '#5ba3be', color: '#fff', border: 'none',
              borderRadius: '12px', padding: '14px', fontSize: '16px', fontWeight: '700',
              cursor: 'pointer', opacity: !selected.size ? 0.5 : 1,
            }}
          >
            💧 Water all
          </button>
          <button
            onClick={() => batchLog('fertilize')}
            disabled={!selected.size || batching}
            style={{
              flex: 1, background: '#c06080', color: '#fff', border: 'none',
              borderRadius: '12px', padding: '14px', fontSize: '16px', fontWeight: '700',
              cursor: 'pointer', opacity: !selected.size ? 0.5 : 1,
            }}
          >
            🌿 Fertilize all
          </button>
        </div>
      )}

      {showAdd && <AddPlantModal user={user} household={household} onClose={() => setShowAdd(false)} />}
      {showHousehold && <HouseholdModal household={household} onClose={() => setShowHousehold(false)} />}
      {showQuencher && (
        <ThirstQuencher
          plants={plants}
          lastWatered={lastWatered}
          user={user}
          household={household}
          onClose={() => setShowQuencher(false)}
        />
      )}
    </div>
  );
}

function PlantTile({ plant, lastWateredTs, multiSelect, isSelected, onLongPress, onClick }) {
  const pressTimer = useRef(null);

  function startPress() {
    pressTimer.current = setTimeout(() => onLongPress(), 600);
  }

  function cancelPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  function getDaysSince() {
    if (!lastWateredTs) return null;
    const ms = lastWateredTs.toDate ? lastWateredTs.toDate().getTime() : lastWateredTs.seconds * 1000;
    return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
  }

  const daysAgo = getDaysSince();
  const interval = plant.waterIntervalDays;
  const isOverdue = interval && (daysAgo === null || daysAgo >= interval);

  function getWateredLabel() {
    if (interval) {
      if (daysAgo === null) return 'Never watered';
      const daysUntil = interval - daysAgo;
      if (daysUntil > 1) return `In ${daysUntil} days`;
      if (daysUntil === 1) return 'In 1 day';
      if (daysUntil === 0) return 'Due today';
      return `${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''} late`;
    }
    if (daysAgo === null) return 'Never watered';
    if (daysAgo === 0) return 'Watered today';
    if (daysAgo === 1) return '1 day ago';
    return `${daysAgo} days ago`;
  }

  const badgeColor = isOverdue ? '#e07b39' : daysAgo === 0 ? '#4caf50' : daysAgo === null ? '#666' : '#4caf50';

  return (
    <div
      onClick={onClick}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      style={{
        background: '#1a2e1a', borderRadius: '16px', overflow: 'hidden', cursor: 'pointer',
        border: `1px solid ${isSelected ? '#4caf50' : isOverdue ? '#e07b39' : '#2d4a2d'}`,
        boxShadow: isSelected ? '0 0 0 2px #4caf50' : isOverdue ? '0 0 0 1px #e07b3944' : 'none',
        transition: 'box-shadow 0.15s',
        userSelect: 'none',
      }}
    >
      <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#2d4a2d', position: 'relative' }}>
        {plant.photoUrl ? (
          <img src={plant.photoUrl} alt={plant.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' }}>🌿</div>
        )}
        {multiSelect && (
          <div style={{
            position: 'absolute', top: '8px', right: '8px',
            width: '22px', height: '22px', borderRadius: '50%',
            background: isSelected ? '#4caf50' : 'rgba(0,0,0,0.5)',
            border: '2px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', color: '#fff',
          }}>
            {isSelected ? '✓' : ''}
          </div>
        )}
      </div>
      <div style={{ padding: '10px' }}>
        <div style={{ color: '#fff', fontWeight: '600', fontSize: '14px', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {plant.name}
        </div>
        {plant.location && (
          <div style={{ color: '#a8c5a0', fontSize: '12px', marginBottom: '6px' }}>📍 {plant.location}</div>
        )}
        <div style={{
          display: 'inline-block', background: badgeColor + '22', color: badgeColor,
          borderRadius: '6px', padding: '2px 6px', fontSize: '11px', fontWeight: '600',
        }}>
          💧 {getWateredLabel()}
        </div>
      </div>
    </div>
  );
}
