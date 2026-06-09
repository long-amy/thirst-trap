import { useState, useRef } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';

export default function AddPlantModal({ user, household, onClose }) {
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef();

  function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!name.trim()) { setError('Plant name is required'); return; }
    setSaving(true);
    setError('');
    try {
      let photoUrl = null;
      if (photoFile) {
        const storageRef = ref(storage, `plants/${household.id}/${Date.now()}_${photoFile.name}`);
        await uploadBytes(storageRef, photoFile);
        photoUrl = await getDownloadURL(storageRef);
      }
      await addDoc(collection(db, 'plants'), {
        householdId: household.id,
        name: name.trim(),
        location: location.trim(),
        photoUrl,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
      onClose();
    } catch (err) {
      setError('Failed to save plant. Try again.');
      console.error(err);
    }
    setSaving(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      zIndex: 100, display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        marginTop: 'auto', background: '#0f1f0f', borderRadius: '20px 20px 0 0',
        padding: '24px', maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>Add a plant</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a8c5a0', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        <label style={labelStyle}>Plant name *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Monstera"
          style={inputStyle}
          autoFocus
        />

        <label style={labelStyle}>Location</label>
        <input
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="e.g. living room, backyard"
          style={inputStyle}
        />

        <label style={labelStyle}>Photo (optional)</label>
        {photoPreview ? (
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <img
              src={photoPreview}
              alt="Plant preview"
              style={{ width: '100%', borderRadius: '12px', maxHeight: '220px', objectFit: 'cover' }}
            />
            <button
              onClick={() => { setPhotoFile(null); setPhotoPreview(null); fileInputRef.current.value = ''; }}
              style={{
                position: 'absolute', top: '8px', right: '8px',
                background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontSize: '13px',
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%', height: '110px', background: '#1e331e',
              borderRadius: '12px', border: '2px dashed #2d4a2d',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', marginBottom: '20px', color: '#a8c5a0', gap: '6px',
            }}
          >
            <span style={{ fontSize: '28px' }}>📷</span>
            <span style={{ fontSize: '13px' }}>Tap to add a photo</span>
          </div>
        )}
        {/* no capture attribute here so desktop gets file picker and mobile gets camera/library choice */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoSelect}
          style={{ display: 'none' }}
        />

        {error && <p style={{ color: '#ff6b6b', fontSize: '14px', margin: '0 0 12px' }}>{error}</p>}

        <button onClick={handleSave} disabled={saving} style={primaryBtn}>
          {saving ? 'Saving...' : 'Save plant'}
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

const primaryBtn = {
  width: '100%', background: '#4caf50', color: '#fff', border: 'none',
  borderRadius: '12px', padding: '14px', fontSize: '16px', fontWeight: '600',
  cursor: 'pointer', display: 'block',
};
