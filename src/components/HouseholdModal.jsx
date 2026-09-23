import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useBackGuard } from '../hooks/useBackGuard';

export default function HouseholdModal({ household, onClose }) {
  const [name, setName] = useState(household.name ?? '');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useBackGuard(true, onClose);

  async function saveName() {
    const trimmed = name.trim();
    await updateDoc(doc(db, 'households', household.id), { name: trimmed || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function copyCode() {
    navigator.clipboard.writeText(household.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      zIndex: 100, display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }} onClick={onClose}>
      <div
        style={{
          marginTop: 'auto', background: '#0f1f0f', borderRadius: '20px 20px 0 0',
          padding: '24px', border: '1px solid #2d4a2d',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>🏠 Household</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a8c5a0', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        <label style={labelStyle}>Household name</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setSaved(false); }}
            placeholder="e.g. Our Plants 🌿"
            style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
          />
          <button onClick={saveName} style={{
            background: '#4caf50', color: '#fff', border: 'none',
            borderRadius: '10px', padding: '0 16px', fontSize: '14px',
            fontWeight: '600', cursor: 'pointer', flexShrink: 0,
          }}>
            {saved ? '✓' : 'Save'}
          </button>
        </div>

        <label style={labelStyle}>Invite code</label>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#1e331e', border: '1px solid #2d4a2d', borderRadius: '10px',
          padding: '12px 14px',
        }}>
          <span style={{ color: '#fff', fontWeight: '700', fontSize: '20px', letterSpacing: '4px' }}>
            {household.id}
          </span>
          <button onClick={copyCode} style={{
            background: copied ? '#4caf50' : '#2d4a2d', color: '#fff', border: 'none',
            borderRadius: '8px', padding: '6px 12px', fontSize: '13px',
            fontWeight: '600', cursor: 'pointer',
          }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <p style={{ color: '#6a8f6a', fontSize: '12px', marginTop: '8px' }}>
          Share this code with your plant partner to join your household.
        </p>
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
