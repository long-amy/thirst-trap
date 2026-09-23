import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format } from 'date-fns';
import { toDate } from '../lib/dates';
import { FAMILY_EVENT_TYPES, eventType, makeFamilyCode } from '../lib/families';
import { useBackGuard } from '../hooks/useBackGuard';

export default function FamilyTab({ plant, user, household, onPlantUpdate, onSelectPlant }) {
  const [families, setFamilies] = useState([]);
  const [familyPlants, setFamilyPlants] = useState([]);
  const [events, setEvents] = useState([]);
  const [showLog, setShowLog] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
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
    if (!plant.familyId) return undefined;
    const q = query(
      collection(db, 'plants'),
      where('householdId', '==', household.id),
      where('familyId', '==', plant.familyId),
    );
    return onSnapshot(q, snap => {
      setFamilyPlants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [plant.familyId, household.id]);

  useEffect(() => {
    const q = query(
      collection(db, 'familyEvents'),
      where('householdId', '==', household.id),
      where('plantId', '==', plant.id),
    );
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.occurredAt?.seconds ?? 0) - (a.occurredAt?.seconds ?? 0));
      setEvents(docs);
    });
  }, [plant.id, household.id]);

  // Guard against a stale snapshot from a family this plant just left
  const members = plant.familyId ? familyPlants.filter(m => m.familyId === plant.familyId) : [];
  const family = families.find(f => f.id === plant.familyId) || null;
  const parent = members.find(m => m.id === plant.parentPlantId) || null;
  const children = members.filter(m => m.parentPlantId === plant.id);
  const siblings = members.filter(
    m => m.id !== plant.id && m.id !== plant.parentPlantId && m.parentPlantId !== plant.id
  );

  async function createFamily(name) {
    setBusy(true);
    try {
      const ref = await addDoc(collection(db, 'plantFamilies'), {
        householdId: household.id,
        name: name.trim(),
        code: makeFamilyCode(name),
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
      await updateDoc(doc(db, 'plants', plant.id), { familyId: ref.id, parentPlantId: null });
      onPlantUpdate({ ...plant, familyId: ref.id, parentPlantId: null });
    } catch (err) {
      console.error('Create family failed', err);
    }
    setBusy(false);
    setShowJoin(false);
  }

  async function joinFamily(familyId, parentPlantId) {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'plants', plant.id), { familyId, parentPlantId: parentPlantId || null });
      onPlantUpdate({ ...plant, familyId, parentPlantId: parentPlantId || null });
    } catch (err) {
      console.error('Join family failed', err);
    }
    setBusy(false);
    setShowJoin(false);
  }

  async function setParent(parentPlantId) {
    await updateDoc(doc(db, 'plants', plant.id), { parentPlantId: parentPlantId || null });
    onPlantUpdate({ ...plant, parentPlantId: parentPlantId || null });
  }

  async function leaveFamily() {
    await updateDoc(doc(db, 'plants', plant.id), { familyId: null, parentPlantId: null });
    onPlantUpdate({ ...plant, familyId: null, parentPlantId: null });
  }

  async function saveEvent({ type, date, notes, childName }) {
    setBusy(true);
    try {
      const batch = writeBatch(db);
      const occurredAt = Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0));
      const loggedBy = { userId: user.uid, displayName: user.displayName?.split(' ')[0] || 'Someone' };

      let childPlantId = null;
      if (childName?.trim()) {
        const childRef = doc(collection(db, 'plants'));
        childPlantId = childRef.id;
        batch.set(childRef, {
          householdId: household.id,
          name: childName.trim(),
          location: plant.location || '',
          photoUrl: null,
          familyId: plant.familyId,
          parentPlantId: plant.id,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
      }

      const eventRef = doc(collection(db, 'familyEvents'));
      batch.set(eventRef, {
        householdId: household.id,
        familyId: plant.familyId,
        plantId: plant.id,
        plantName: plant.name,
        type,
        occurredAt,
        notes: notes?.trim() || '',
        childPlantId,
        childPlantName: childName?.trim() || null,
        loggedBy,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (err) {
      console.error('Family event failed', err);
    }
    setBusy(false);
    setShowLog(false);
  }

  async function deleteEvent(id) {
    await deleteDoc(doc(db, 'familyEvents', id));
  }

  if (!plant.familyId) {
    return (
      <div style={{ padding: '20px 16px', color: '#fff' }}>
        <div style={{ background: '#1a2e1a', border: '1px solid #2d4a2d', borderRadius: '14px', padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🌳</div>
          <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: '17px' }}>Not in a family yet</h3>
          <p style={{ color: '#a8c5a0', fontSize: '13px', margin: '0 0 18px', lineHeight: 1.5 }}>
            Families group a mother plant with everything propagated from it, and give you one shared
            timeline of re-pots, cuttings and divisions.
          </p>
          <button onClick={() => setShowJoin(true)} style={primaryBtn}>🌳 Start or join a family</button>
        </div>
        {showJoin && (
          <JoinFamilyModal
            families={families}
            busy={busy}
            onCreate={createFamily}
            onJoin={joinFamily}
            onClose={() => setShowJoin(false)}
            householdId={household.id}
            plantId={plant.id}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 16px', color: '#fff' }}>
      {/* Family header */}
      <div style={{ background: '#1a2e1a', border: '1px solid #2d4a2d', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#6a8f6a', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Family</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '700', marginTop: '2px' }}>
              🌳 {family?.name || 'Unnamed family'}
            </div>
            {family?.code && (
              <div style={{ color: '#8eb85a', fontSize: '12px', fontFamily: 'ui-monospace, monospace', marginTop: '4px' }}>
                {family.code}
              </div>
            )}
          </div>
          <button onClick={leaveFamily} style={{ background: 'none', border: '1px solid #2d4a2d', borderRadius: '8px', color: '#a8c5a0', fontSize: '12px', padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}>
            Leave
          </button>
        </div>
        <div style={{ display: 'flex', gap: '16px', marginTop: '14px' }}>
          <Stat label="Members" value={members.length} />
          <Stat label="Generation" value={parent ? 'Descendant' : 'Founder'} />
          <Stat label="Events" value={events.length} />
        </div>
      </div>

      {/* Lineage */}
      <Section title="Lineage">
        <RelationRow
          label="Parent"
          plants={parent ? [parent] : []}
          empty="No parent — this one's a founder"
          onSelect={onSelectPlant}
        />
        <ParentPicker
          members={members.filter(m => m.id !== plant.id && m.parentPlantId !== plant.id)}
          value={plant.parentPlantId || ''}
          onChange={setParent}
        />
        <RelationRow label="Propagated from this" plants={children} empty="No cuttings logged yet" onSelect={onSelectPlant} />
        {siblings.length > 0 && (
          <RelationRow label="Also in this family" plants={siblings} empty="" onSelect={onSelectPlant} />
        )}
      </Section>

      <button onClick={() => setShowLog(true)} style={{ ...primaryBtn, marginBottom: '20px' }}>
        ＋ Log a family event
      </button>

      {/* Timeline */}
      <Section title={`This plant's events (${events.length})`}>
        {events.length === 0 && (
          <p style={{ color: '#6a8f6a', fontSize: '13px', margin: 0 }}>
            Nothing logged yet. Re-pots, cuttings and divisions show up here.
          </p>
        )}
        {events.map(ev => (
          <EventRow key={ev.id} event={ev} onDelete={() => deleteEvent(ev.id)} />
        ))}
      </Section>

      {showLog && (
        <LogEventModal
          plant={plant}
          busy={busy}
          onSave={saveEvent}
          onClose={() => setShowLog(false)}
        />
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ color: '#6a8f6a', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
        {title}
      </div>
      <div style={{ background: '#1a2e1a', border: '1px solid #2d4a2d', borderRadius: '14px', padding: '14px' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ color: '#fff', fontSize: '16px', fontWeight: '700' }}>{value}</div>
      <div style={{ color: '#6a8f6a', fontSize: '11px' }}>{label}</div>
    </div>
  );
}

function RelationRow({ label, plants, empty, onSelect }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ color: '#a8c5a0', fontSize: '12px', marginBottom: '6px' }}>{label}</div>
      {plants.length === 0 ? (
        empty ? <div style={{ color: '#6a8f6a', fontSize: '13px' }}>{empty}</div> : null
      ) : (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {plants.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect?.(p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: '#0f1f0f', border: '1px solid #2d4a2d', borderRadius: '10px',
                padding: '6px 10px 6px 6px', cursor: 'pointer', color: '#fff', fontSize: '13px',
                opacity: p.archived ? 0.5 : 1,
              }}
            >
              <span style={{ width: '26px', height: '26px', borderRadius: '6px', overflow: 'hidden', background: '#2d4a2d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                {p.photoUrl ? <img src={p.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🌿'}
              </span>
              {p.name}{p.archived ? ' · archived' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ParentPicker({ members, value, onChange }) {
  if (members.length === 0) return null;
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ color: '#a8c5a0', fontSize: '12px', marginBottom: '6px' }}>Set parent plant</div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', background: '#0f1f0f', border: '1px solid #2d4a2d', borderRadius: '10px',
          padding: '10px', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
        }}
      >
        <option value="">— none (founder) —</option>
        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </div>
  );
}

function EventRow({ event, onDelete }) {
  const type = eventType(event.type);
  const date = toDate(event.occurredAt);
  return (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'flex-start',
      padding: '10px 0', borderBottom: '1px solid #0f1f0f',
    }}>
      <span style={{ fontSize: '20px', lineHeight: 1.2 }}>{type.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: type.color, fontSize: '14px', fontWeight: '700' }}>{type.label}</div>
        <div style={{ color: '#6a8f6a', fontSize: '12px', marginTop: '2px' }}>
          {date ? format(date, 'MMM d, yyyy') : ''}
          {event.loggedBy?.displayName ? ` · ${event.loggedBy.displayName}` : ''}
        </div>
        {event.childPlantName && (
          <div style={{ color: '#8eb85a', fontSize: '12px', marginTop: '4px' }}>→ created {event.childPlantName}</div>
        )}
        {event.notes && (
          <div style={{ color: '#d0e8d0', fontSize: '13px', marginTop: '6px', lineHeight: 1.4 }}>{event.notes}</div>
        )}
      </div>
      <button onClick={onDelete} style={{ background: 'none', border: 'none', color: '#3a5a3a', cursor: 'pointer', fontSize: '15px', padding: '0 2px' }}>×</button>
    </div>
  );
}

function JoinFamilyModal({ families, busy, onCreate, onJoin, onClose }) {
  const [mode, setMode] = useState(families.length ? 'join' : 'create');
  const [name, setName] = useState('');
  const [familyId, setFamilyId] = useState(families[0]?.id || '');

  return (
    <Sheet title="🌳 Plant family" onClose={onClose}>
      {families.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
          <TabPill active={mode === 'join'} onClick={() => setMode('join')}>Join existing</TabPill>
          <TabPill active={mode === 'create'} onClick={() => setMode('create')}>Start new</TabPill>
        </div>
      )}

      {mode === 'join' && families.length > 0 ? (
        <>
          <label style={labelStyle}>Family</label>
          <select value={familyId} onChange={e => setFamilyId(e.target.value)} style={inputStyle}>
            {families.map(f => (
              <option key={f.id} value={f.id}>{f.name}{f.code ? ` (${f.code})` : ''}</option>
            ))}
          </select>
          <button onClick={() => onJoin(familyId, null)} disabled={busy || !familyId} style={primaryBtn}>
            {busy ? 'Saving…' : 'Join family'}
          </button>
        </>
      ) : (
        <>
          <label style={labelStyle}>Family name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Big Monstera line"
            style={inputStyle}
            autoFocus
          />
          <button onClick={() => onCreate(name)} disabled={busy || !name.trim()} style={primaryBtn}>
            {busy ? 'Saving…' : 'Create family'}
          </button>
        </>
      )}
    </Sheet>
  );
}

function LogEventModal({ plant, busy, onSave, onClose }) {
  const [type, setType] = useState('repot');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [makeChild, setMakeChild] = useState(false);
  const [childName, setChildName] = useState('');

  const selected = eventType(type);
  const canSpawn = !!selected.canSpawnChild;

  function submit() {
    const [y, m, d] = date.split('-').map(Number);
    onSave({
      type,
      date: new Date(y, m - 1, d),
      notes,
      childName: canSpawn && makeChild ? childName : '',
    });
  }

  return (
    <Sheet title="Log a family event" onClose={onClose}>
      <label style={labelStyle}>What happened?</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '18px' }}>
        {FAMILY_EVENT_TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left',
              background: type === t.key ? `${t.color}22` : '#1e331e',
              border: `1px solid ${type === t.key ? t.color : '#2d4a2d'}`,
              borderRadius: '10px', padding: '10px', cursor: 'pointer',
              color: type === t.key ? t.color : '#a8c5a0', fontSize: '13px', fontWeight: type === t.key ? '700' : '400',
            }}
          >
            <span style={{ fontSize: '16px' }}>{t.icon}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
          </button>
        ))}
      </div>

      <p style={{ color: '#6a8f6a', fontSize: '12px', margin: '-10px 0 16px' }}>{selected.hint}</p>

      <label style={labelStyle}>When</label>
      <input type="date" value={date} max={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} style={inputStyle} />

      {canSpawn && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#a8c5a0', fontSize: '14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={makeChild} onChange={e => setMakeChild(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#4caf50' }} />
            Add the new plant to this family
          </label>
          {makeChild && (
            <input
              value={childName}
              onChange={e => setChildName(e.target.value)}
              placeholder={`e.g. ${plant.name} cutting #1`}
              style={{ ...inputStyle, marginTop: '10px', marginBottom: 0 }}
            />
          )}
        </div>
      )}

      <label style={labelStyle}>Notes</label>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={3}
        placeholder="Pot size, soil mix, how many cuttings…"
        style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }}
      />

      <button onClick={submit} disabled={busy || (makeChild && !childName.trim())} style={primaryBtn}>
        {busy ? 'Saving…' : 'Save event'}
      </button>
    </Sheet>
  );
}

function Sheet({ title, children, onClose }) {
  useBackGuard(true, onClose);
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200,
        display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      onClick={onClose}
    >
      <div
        style={{ marginTop: 'auto', background: '#0f1f0f', borderRadius: '20px 20px 0 0', padding: '24px', maxHeight: '90dvh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a8c5a0', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TabPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '8px', borderRadius: '10px', fontSize: '13px',
        fontWeight: active ? '700' : '400',
        background: active ? '#4caf50' : '#1e331e',
        color: active ? '#fff' : '#a8c5a0',
        border: active ? 'none' : '1px solid #2d4a2d', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const labelStyle = {
  color: '#a8c5a0', fontSize: '13px', fontWeight: '600',
  marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px',
};
const inputStyle = {
  width: '100%', background: '#1e331e', border: '1px solid #2d4a2d',
  borderRadius: '10px', padding: '12px 14px', color: '#fff', fontSize: '16px',
  outline: 'none', boxSizing: 'border-box', marginBottom: '16px',
};
const primaryBtn = {
  width: '100%', background: '#4caf50', color: '#fff', border: 'none',
  borderRadius: '12px', padding: '14px', fontSize: '16px', fontWeight: '600', cursor: 'pointer',
};
