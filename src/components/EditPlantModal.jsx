import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useBackGuard } from '../hooks/useBackGuard';

export default function EditPlantModal({ plant, onClose, onSave }) {
  const [name, setName] = useState(plant.name);
  const [location, setLocation] = useState(plant.location ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useBackGuard(true, onClose);

  async function handleSave() {
    if (!name.trim()) { setError('Plant name is required'); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'plants', plant.id), {
        name: name.trim(),
        location: location.trim(),
      });
      onSave({ ...plant, name: name.trim(), location: location.trim() });
      onClose();
    } catch (err) {
      setError('Failed to save. Try again.');
      console.error(err);
    }
    setSaving(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      zIndex: 200, display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }} onClick={onClose}>
      <div
        style={{ marginTop: 'auto', background: '#0f1f0f', borderRadius: '20px 20px 0 0', padding: '24px', border: '1px solid #2d4a2d' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>✏️ Edit plant</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a8c5a0', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        <label style={labelStyle}>Plant name *</label>
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} autoFocus />

        <label style={labelStyle}>Location</label>
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. living room" style={inputStyle} />

        {error && <p style={{ color: '#ff6b6b', fontSize: '14px', margin: '0 0 12px' }}>{error}</p>}

        <button onClick={handleSave} disabled={saving} style={{
          width: '100%', background: '#4caf50', color: '#fff', border: 'none',
          borderRadius: '12px', padding: '14px', fontSize: '16px', fontWeight: '600', cursor: 'pointer',
        }}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
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
