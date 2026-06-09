import { useState } from 'react';
import { doc, setDoc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function HouseholdSetupScreen({ user }) {
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState(user.displayName?.split(' ')[0] || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!displayName.trim()) { setError('Enter your display name'); return; }
    setLoading(true);
    setError('');
    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const householdRef = doc(db, 'households', code);
      await setDoc(householdRef, {
        inviteCode: code,
        members: [user.uid],
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'users', user.uid), {
        householdId: code,
        displayName: displayName.trim(),
        email: user.email,
        photoURL: user.photoURL,
      });
    } catch (err) {
      setError('Something went wrong. Try again.');
      console.error(err);
    }
    setLoading(false);
  }

  async function handleJoin() {
    if (!displayName.trim()) { setError('Enter your display name'); return; }
    if (!inviteCode.trim()) { setError('Enter the invite code'); return; }
    setLoading(true);
    setError('');
    try {
      const code = inviteCode.trim().toUpperCase();
      const householdRef = doc(db, 'households', code);
      const snap = await getDoc(householdRef);
      if (!snap.exists()) { setError('Invite code not found'); setLoading(false); return; }
      const data = snap.data();
      if (data.members.length >= 2) { setError('This household is full (max 2 members)'); setLoading(false); return; }
      if (data.members.includes(user.uid)) { setError('You\'re already in this household'); setLoading(false); return; }
      await updateDoc(householdRef, { members: arrayUnion(user.uid) });
      await setDoc(doc(db, 'users', user.uid), {
        householdId: code,
        displayName: displayName.trim(),
        email: user.email,
        photoURL: user.photoURL,
      });
    } catch (err) {
      setError('Something went wrong. Try again.');
      console.error(err);
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0f1f0f',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      padding: '48px 24px 24px',
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌱</div>
      <h1 style={{ fontSize: '28px', fontWeight: '700', margin: '0 0 8px' }}>Welcome!</h1>
      <p style={{ color: '#a8c5a0', margin: '0 0 32px', fontSize: '15px' }}>
        Set up your plant household.
      </p>

      <label style={labelStyle}>Your display name</label>
      <input
        value={displayName}
        onChange={e => setDisplayName(e.target.value)}
        placeholder="e.g. Amy"
        style={inputStyle}
      />

      {!mode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
          <button onClick={() => setMode('create')} style={primaryBtn}>
            Create a new household
          </button>
          <button onClick={() => setMode('join')} style={secondaryBtn}>
            Join with an invite code
          </button>
        </div>
      )}

      {mode === 'create' && (
        <div style={{ marginTop: '8px' }}>
          <p style={{ color: '#a8c5a0', fontSize: '14px', marginBottom: '16px' }}>
            You'll get a 6-character invite code to share with your plant partner.
          </p>
          <button onClick={handleCreate} disabled={loading} style={primaryBtn}>
            {loading ? 'Creating...' : 'Create household'}
          </button>
          <button onClick={() => setMode(null)} style={{ ...secondaryBtn, marginTop: '8px' }}>Back</button>
        </div>
      )}

      {mode === 'join' && (
        <div style={{ marginTop: '8px' }}>
          <label style={labelStyle}>Invite code</label>
          <input
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            placeholder="e.g. AB12CD"
            style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '4px' }}
            maxLength={6}
          />
          <button onClick={handleJoin} disabled={loading} style={{ ...primaryBtn, marginTop: '12px' }}>
            {loading ? 'Joining...' : 'Join household'}
          </button>
          <button onClick={() => setMode(null)} style={{ ...secondaryBtn, marginTop: '8px' }}>Back</button>
        </div>
      )}

      {error && <p style={{ color: '#ff6b6b', marginTop: '16px', fontSize: '14px' }}>{error}</p>}
    </div>
  );
}

const labelStyle = {
  color: '#a8c5a0',
  fontSize: '13px',
  fontWeight: '600',
  marginBottom: '6px',
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const inputStyle = {
  width: '100%',
  background: '#1e331e',
  border: '1px solid #2d4a2d',
  borderRadius: '10px',
  padding: '12px 14px',
  color: '#fff',
  fontSize: '16px',
  outline: 'none',
  boxSizing: 'border-box',
  marginBottom: '16px',
};

const primaryBtn = {
  width: '100%',
  background: '#4caf50',
  color: '#fff',
  border: 'none',
  borderRadius: '12px',
  padding: '14px',
  fontSize: '16px',
  fontWeight: '600',
  cursor: 'pointer',
  display: 'block',
};

const secondaryBtn = {
  width: '100%',
  background: 'transparent',
  color: '#a8c5a0',
  border: '1px solid #2d4a2d',
  borderRadius: '12px',
  padding: '14px',
  fontSize: '16px',
  cursor: 'pointer',
  display: 'block',
};
