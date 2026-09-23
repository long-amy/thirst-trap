import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ARCHIVE_REASONS } from '../lib/archive';
import { useBackGuard } from '../hooks/useBackGuard';

export default function ArchivePlantModal({ plant, user, onClose, onArchived }) {
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useBackGuard(true, onClose);

  async function archive() {
    setSaving(true);
    setError('');
    try {
      const patch = {
        archived: true,
        archivedAt: serverTimestamp(),
        archiveReason: reason || null,
        archiveNote: note.trim() || null,
        archivedBy: user.displayName?.split(' ')[0] || 'Someone',
      };
      await updateDoc(doc(db, 'plants', plant.id), patch);
      onArchived?.({ ...plant, ...patch, archivedAt: new Date() });
      onClose();
    } catch (err) {
      console.error('Archive failed', err);
      setError('Could not archive. Try again.');
      setSaving(false);
    }
  }

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>📦 Archive {plant.name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a8c5a0', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>
        <p style={{ color: '#a8c5a0', fontSize: '13px', margin: '0 0 20px', lineHeight: 1.5 }}>
          It'll drop out of your plant grid, the Thirst Quencher, and reminders — but every log,
          photo and family event is kept. You can unarchive it any time.
        </p>

        <label style={labelStyle}>Reason (optional)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '18px' }}>
          {ARCHIVE_REASONS.map(r => (
            <button
              key={r.key}
              onClick={() => setReason(prev => (prev === r.key ? null : r.key))}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left',
                background: reason === r.key ? '#2d4a1e' : '#1e331e',
                border: `1px solid ${reason === r.key ? '#4caf50' : '#2d4a2d'}`,
                borderRadius: '10px', padding: '11px 10px', cursor: 'pointer',
                color: reason === r.key ? '#a8e080' : '#a8c5a0',
                fontSize: '13px', fontWeight: reason === r.key ? '700' : '400',
              }}
            >
              <span style={{ fontSize: '16px' }}>{r.icon}</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
            </button>
          ))}
        </div>

        <label style={labelStyle}>Note (optional)</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="e.g. gave it to Sam, root rot took it, split into 3"
          style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }}
        />

        {error && <p style={{ color: '#ff6b6b', fontSize: '14px', margin: '0 0 12px' }}>{error}</p>}

        <button
          onClick={archive}
          disabled={saving}
          style={{
            width: '100%', background: '#8a7030', color: '#fff', border: 'none',
            borderRadius: '12px', padding: '14px', fontSize: '16px', fontWeight: '700', cursor: 'pointer',
          }}
        >
          {saving ? 'Archiving…' : '📦 Archive plant'}
        </button>
      </div>
    </div>
  );
}

const labelStyle = {
  color: '#a8c5a0', fontSize: '13px', fontWeight: '600',
  marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px',
};
const inputStyle = {
  width: '100%', background: '#1e331e', border: '1px solid #2d4a2d',
  borderRadius: '10px', padding: '12px 14px', color: '#fff', fontSize: '16px',
  outline: 'none', boxSizing: 'border-box', marginBottom: '16px',
};
