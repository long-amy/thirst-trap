import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format } from 'date-fns';
import { toDate } from '../lib/dates';
import { eventType, makeFamilyCode, flattenLineage } from '../lib/families';

export default function FamiliesScreen({ user, household, onSelectPlant }) {
  const [families, setFamilies] = useState([]);
  const [plants, setPlants] = useState([]);
  const [events, setEvents] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [assigning, setAssigning] = useState(null); // familyId
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'plantFamilies'), where('householdId', '==', household.id));
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setFamilies(docs);
    });
  }, [household.id]);

  useEffect(() => {
    const q = query(collection(db, 'plants'), where('householdId', '==', household.id));
    return onSnapshot(q, snap => setPlants(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [household.id]);

  useEffect(() => {
    const q = query(collection(db, 'familyEvents'), where('householdId', '==', household.id));
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.occurredAt?.seconds ?? 0) - (a.occurredAt?.seconds ?? 0));
      setEvents(docs);
    });
  }, [household.id]);

  async function createFamily() {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      await addDoc(collection(db, 'plantFamilies'), {
        householdId: household.id,
        name: newName.trim(),
        code: makeFamilyCode(newName),
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
      setNewName('');
      setShowNew(false);
    } catch (err) {
      console.error('Create family failed', err);
    }
    setBusy(false);
  }

  async function deleteFamily(family) {
    const members = plants.filter(p => p.familyId === family.id);
    await Promise.all(
      members.map(p => updateDoc(doc(db, 'plants', p.id), { familyId: null, parentPlantId: null }))
    );
    await deleteDoc(doc(db, 'plantFamilies', family.id));
    setExpanded(null);
  }

  async function setMembership(plant, familyId) {
    await updateDoc(doc(db, 'plants', plant.id), {
      familyId,
      parentPlantId: familyId ? plant.parentPlantId ?? null : null,
    });
  }

  const unassigned = plants.filter(p => !p.familyId && !p.archived);

  return (
    <div style={{ minHeight: '100dvh', background: '#0f1f0f', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: '92px' }}>
      <div style={{ padding: '20px 16px 12px', position: 'sticky', top: 0, background: '#0f1f0f', zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: '700', margin: 0 }}>🌳 Families</h1>
          <button
            onClick={() => setShowNew(v => !v)}
            style={{ background: '#4caf50', border: 'none', borderRadius: '10px', color: '#fff', padding: '8px 12px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
          >
            {showNew ? 'Cancel' : '＋ New'}
          </button>
        </div>
        <p style={{ color: '#6a8f6a', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.4 }}>
          Group a mother plant with everything propagated from it, and keep one timeline of
          re-pots, cuttings and divisions.
        </p>

        {showNew && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createFamily()}
              placeholder="Family name, e.g. Big Monstera line"
              autoFocus
              style={{
                flex: 1, background: '#1e331e', border: '1px solid #2d4a2d', borderRadius: '10px',
                padding: '11px 14px', color: '#fff', fontSize: '15px', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <button
              onClick={createFamily}
              disabled={!newName.trim() || busy}
              style={{ background: '#4caf50', border: 'none', borderRadius: '10px', color: '#fff', padding: '0 16px', fontWeight: '700', cursor: 'pointer', opacity: newName.trim() ? 1 : 0.5 }}
            >
              {busy ? '…' : 'Create'}
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: '4px 16px 0' }}>
        {families.length === 0 && (
          <div style={{ textAlign: 'center', padding: '50px 24px', color: '#a8c5a0' }}>
            <div style={{ fontSize: '44px', marginBottom: '14px' }}>🌳</div>
            <p style={{ fontSize: '15px', margin: 0, lineHeight: 1.5 }}>
              No families yet. Create one, then add the mother plant and anything you've
              propagated from it.
            </p>
          </div>
        )}

        {families.map(family => {
          const members = plants.filter(p => p.familyId === family.id);
          const familyEvents = events.filter(e => e.familyId === family.id);
          const isOpen = expanded === family.id;
          const lineage = flattenLineage(members);

          return (
            <div
              key={family.id}
              style={{
                background: '#1a2e1a', border: '1px solid #2d4a2d', borderRadius: '16px',
                marginBottom: '12px', overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : family.id)}
                style={{
                  width: '100%', background: 'none', border: 'none', padding: '16px',
                  display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '24px' }}>🌳</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: '16px', fontWeight: '700' }}>{family.name}</div>
                  <div style={{ color: '#6a8f6a', fontSize: '12px', marginTop: '3px' }}>
                    {family.code && <span style={{ fontFamily: 'ui-monospace, monospace', color: '#8eb85a' }}>{family.code}</span>}
                    {family.code && ' · '}
                    {members.length} plant{members.length !== 1 ? 's' : ''} · {familyEvents.length} event{familyEvents.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <span style={{ color: '#a8c5a0', fontSize: '16px' }}>{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div style={{ padding: '0 16px 16px' }}>
                  <SubHeading>Lineage</SubHeading>
                  {lineage.length === 0 ? (
                    <p style={{ color: '#6a8f6a', fontSize: '13px', margin: '0 0 12px' }}>No plants in this family yet.</p>
                  ) : (
                    lineage.map(({ plant, depth }) => (
                      <div
                        key={plant.id}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: `${depth * 18}px`, marginBottom: '6px' }}
                      >
                        {depth > 0 && <span style={{ color: '#3a5a3a', fontSize: '12px' }}>└</span>}
                        <button
                          onClick={() => onSelectPlant(plant)}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', gap: '10px',
                            background: '#0f1f0f', border: '1px solid #2d4a2d', borderRadius: '10px',
                            padding: '8px 10px', cursor: 'pointer', textAlign: 'left',
                            opacity: plant.archived ? 0.5 : 1,
                          }}
                        >
                          <span style={{ width: '30px', height: '30px', borderRadius: '7px', overflow: 'hidden', background: '#2d4a2d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0 }}>
                            {plant.photoUrl ? <img src={plant.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🌿'}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, color: '#fff', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {plant.name}
                            {plant.archived && <span style={{ color: '#8a7030', fontSize: '11px' }}> · archived</span>}
                          </span>
                          <span style={{ color: '#6a8f6a', fontSize: '11px', flexShrink: 0 }}>
                            {depth === 0 ? 'founder' : `gen ${depth + 1}`}
                          </span>
                        </button>
                        <button
                          onClick={() => setMembership(plant, null)}
                          title="Remove from family"
                          style={{ background: 'none', border: 'none', color: '#3a5a3a', cursor: 'pointer', fontSize: '16px' }}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}

                  <button
                    onClick={() => setAssigning(assigning === family.id ? null : family.id)}
                    style={{
                      marginTop: '10px', width: '100%', background: 'transparent', border: '1px dashed #2d4a2d',
                      borderRadius: '10px', padding: '10px', color: '#a8c5a0', fontSize: '13px', cursor: 'pointer',
                    }}
                  >
                    ＋ Add a plant to this family
                  </button>

                  {assigning === family.id && (
                    <div style={{ marginTop: '10px', maxHeight: '220px', overflowY: 'auto' }}>
                      {unassigned.length === 0 ? (
                        <p style={{ color: '#6a8f6a', fontSize: '13px', margin: 0 }}>
                          Every active plant already belongs to a family.
                        </p>
                      ) : (
                        unassigned.map(p => (
                          <button
                            key={p.id}
                            onClick={() => setMembership(p, family.id)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                              background: '#0f1f0f', border: '1px solid #2d4a2d', borderRadius: '10px',
                              padding: '8px 10px', marginBottom: '6px', cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <span style={{ fontSize: '15px' }}>🌿</span>
                            <span style={{ color: '#fff', fontSize: '14px' }}>{p.name}</span>
                            <span style={{ marginLeft: 'auto', color: '#4caf50', fontSize: '13px' }}>Add</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  <SubHeading>Timeline</SubHeading>
                  {familyEvents.length === 0 ? (
                    <p style={{ color: '#6a8f6a', fontSize: '13px', margin: 0 }}>
                      No events yet — log re-pots and cuttings from a plant's Family tab.
                    </p>
                  ) : (
                    familyEvents.slice(0, 20).map(ev => {
                      const type = eventType(ev.type);
                      const date = toDate(ev.occurredAt);
                      return (
                        <div key={ev.id} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: '1px solid #0f1f0f' }}>
                          <span style={{ fontSize: '17px', lineHeight: 1.3 }}>{type.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', color: type.color, fontWeight: '700' }}>
                              {type.label}
                              <span style={{ color: '#a8c5a0', fontWeight: '400' }}> · {ev.plantName || 'a plant'}</span>
                            </div>
                            <div style={{ color: '#6a8f6a', fontSize: '11px', marginTop: '2px' }}>
                              {date ? format(date, 'MMM d, yyyy') : ''}
                              {ev.loggedBy?.displayName ? ` · ${ev.loggedBy.displayName}` : ''}
                            </div>
                            {ev.notes && <div style={{ color: '#d0e8d0', fontSize: '12px', marginTop: '4px' }}>{ev.notes}</div>}
                          </div>
                        </div>
                      );
                    })
                  )}

                  <button
                    onClick={() => deleteFamily(family)}
                    style={{
                      marginTop: '16px', width: '100%', background: 'transparent',
                      border: '1px solid #4a2020', borderRadius: '10px', padding: '10px',
                      color: '#c07070', fontSize: '13px', cursor: 'pointer',
                    }}
                  >
                    Delete family (plants are kept)
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SubHeading({ children }) {
  return (
    <div style={{ color: '#6a8f6a', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: '16px 0 8px' }}>
      {children}
    </div>
  );
}
