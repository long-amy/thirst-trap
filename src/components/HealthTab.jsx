import { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { analyzePlantHealth } from '../lib/anthropic';
import { format } from 'date-fns';

export default function HealthTab({ plant, user, household }) {
  const [logs, setLogs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [note, setNote] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [pendingEntry, setPendingEntry] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef();

  useEffect(() => {
    const q = query(
      collection(db, 'healthLogs'),
      where('plantId', '==', plant.id)
    );
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setLogs(docs);
    });
  }, [plant.id]);

  function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!photoFile) { setError('Please select a photo'); return; }
    setAnalyzing(true);
    setError('');

    const tempId = Date.now().toString();
    setPendingEntry({ id: tempId, pending: true, note, photoPreview });

    try {
      // Convert image to base64
      const arrayBuffer = await photoFile.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      // Call Claude
      const analysis = await analyzePlantHealth(base64, photoFile.type, note);

      // Upload photo
      const storageRef = ref(storage, `health/${household.id}/${Date.now()}_${photoFile.name}`);
      await uploadBytes(storageRef, photoFile);
      const photoUrl = await getDownloadURL(storageRef);

      // Save to Firestore
      await addDoc(collection(db, 'healthLogs'), {
        plantId: plant.id,
        householdId: household.id,
        photoUrl,
        notes: note.trim(),
        claudeAnalysis: analysis,
        createdAt: serverTimestamp(),
        createdBy: { userId: user.uid, displayName: user.displayName?.split(' ')[0] || 'Someone' },
      });

      setPendingEntry(null);
      setShowForm(false);
      setPhotoFile(null);
      setPhotoPreview(null);
      setNote('');
    } catch (err) {
      console.error(err);
      setError('Analysis failed. Check your API key and try again.');
      setPendingEntry(null);
    }

    setAnalyzing(false);
  }

  return (
    <div style={{ padding: '20px 16px', color: '#fff' }}>
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          style={{
            width: '100%', background: '#1a2e1a', color: '#4caf50',
            border: '1px solid #4caf50', borderRadius: '12px',
            padding: '14px', fontSize: '15px', fontWeight: '600',
            cursor: 'pointer', marginBottom: '20px',
          }}
        >
          + Add health check
        </button>
      )}

      {showForm && (
        <div style={{ background: '#1a2e1a', borderRadius: '14px', padding: '16px', marginBottom: '20px', border: '1px solid #2d4a2d' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>New health check</h3>
            <button onClick={() => { setShowForm(false); setPhotoFile(null); setPhotoPreview(null); setNote(''); }} style={{ background: 'none', border: 'none', color: '#a8c5a0', fontSize: '20px', cursor: 'pointer' }}>×</button>
          </div>

          {photoPreview ? (
            <div style={{ position: 'relative', marginBottom: '14px' }}>
              <img src={photoPreview} alt="Selected" style={{ width: '100%', borderRadius: '10px', maxHeight: '200px', objectFit: 'cover' }} />
              <button
                onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontSize: '13px' }}
              >
                Change
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', height: '140px', background: '#0f1f0f',
                borderRadius: '10px', border: '2px dashed #4caf50',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', marginBottom: '14px', color: '#a8c5a0',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📷</div>
              <p style={{ margin: 0, fontSize: '14px' }}>Add a photo</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} />

          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Anything specific you're noticing? (optional)"
            rows={3}
            style={{
              width: '100%', background: '#0f1f0f', border: '1px solid #2d4a2d',
              borderRadius: '10px', padding: '12px', color: '#fff', fontSize: '15px',
              outline: 'none', boxSizing: 'border-box', resize: 'none', marginBottom: '14px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          />

          {error && <p style={{ color: '#ff6b6b', fontSize: '14px', margin: '0 0 12px' }}>{error}</p>}

          <button onClick={handleSubmit} disabled={analyzing} style={{
            width: '100%', background: '#4caf50', color: '#fff', border: 'none',
            borderRadius: '12px', padding: '14px', fontSize: '15px', fontWeight: '600', cursor: 'pointer',
          }}>
            {analyzing ? '🔍 Analyzing your plant...' : 'Analyze with Claude'}
          </button>
        </div>
      )}

      {pendingEntry && (
        <HealthCard log={pendingEntry} pending />
      )}

      {logs.map(log => (
        <HealthCard key={log.id} log={log} />
      ))}

      {logs.length === 0 && !pendingEntry && !showForm && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#a8c5a0' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
          <p style={{ margin: 0 }}>No health checks yet.</p>
        </div>
      )}
    </div>
  );
}

function HealthCard({ log, pending }) {
  return (
    <div style={{
      background: '#1a2e1a', borderRadius: '14px', padding: '16px',
      marginBottom: '14px', border: '1px solid #2d4a2d',
      opacity: pending ? 0.7 : 1,
    }}>
      {(log.photoUrl || log.photoPreview) && (
        <img
          src={log.photoUrl || log.photoPreview}
          alt="Plant health"
          style={{ width: '100%', borderRadius: '10px', maxHeight: '180px', objectFit: 'cover', marginBottom: '12px' }}
        />
      )}

      {pending ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#a8c5a0' }}>
          <div style={{ animation: 'spin 1s linear infinite', fontSize: '18px' }}>⏳</div>
          <span style={{ fontSize: '14px' }}>Analyzing your plant...</span>
        </div>
      ) : (
        <>
          <p style={{ margin: '0 0 10px', fontSize: '14px', lineHeight: '1.5', color: '#e8f5e9' }}>
            {log.claudeAnalysis}
          </p>
          {log.notes && (
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#a8c5a0', fontStyle: 'italic' }}>
              "{log.notes}"
            </p>
          )}
          <div style={{ fontSize: '12px', color: '#6a8f6a' }}>
            {log.createdBy?.displayName} · {log.createdAt?.toDate ? format(log.createdAt.toDate(), 'MMM d, yyyy') : ''}
          </div>
        </>
      )}
    </div>
  );
}
