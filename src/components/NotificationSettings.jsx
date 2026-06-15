import { useState, useEffect } from 'react';
import { getToken } from 'firebase/messaging';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db, messaging } from '../lib/firebase';

export default function NotificationSettings({ user, onClose }) {
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState('morning');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        const notif = snap.data().notifications || {};
        setEnabled(!!notif.enabled);
        setTime(notif.time || 'morning');
      }
      setLoading(false);
    });
  }, [user.uid]);

  async function handleToggle() {
    const newEnabled = !enabled;
    setSaving(true);
    setError('');
    try {
      if (newEnabled) {
        if (!import.meta.env.VITE_FIREBASE_VAPID_KEY) {
          setError('VAPID key not configured. Add VITE_FIREBASE_VAPID_KEY to your .env file.');
          setSaving(false);
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setError('Notifications were blocked. To enable them, tap the lock icon in your browser address bar and allow notifications, then try again.');
          setSaving(false);
          return;
        }
        const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY });
        await updateDoc(doc(db, 'users', user.uid), {
          'notifications.enabled': true,
          'notifications.time': time,
          'notifications.timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
          'notifications.fcmToken': token,
        });
        setEnabled(true);
      } else {
        await updateDoc(doc(db, 'users', user.uid), {
          'notifications.enabled': false,
          'notifications.fcmToken': deleteField(),
        });
        setEnabled(false);
      }
    } catch (err) {
      console.error('Notification settings error', err);
      setError('Something went wrong. Try again.');
    }
    setSaving(false);
  }

  async function handleTimeChange(newTime) {
    setTime(newTime);
    try {
      await updateDoc(doc(db, 'users', user.uid), { 'notifications.time': newTime });
    } catch (err) {
      console.error('Failed to save time preference', err);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#1a2e1a', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', boxSizing: 'border-box', fontFamily: 'system-ui, -apple-system, sans-serif' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>🔔 Notifications</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a8c5a0', fontSize: '24px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {loading ? (
          <p style={{ color: '#a8c5a0', textAlign: 'center', padding: '20px 0' }}>Loading...</p>
        ) : (
          <>
            {/* Toggle row */}
            <div style={{
              background: '#0f1f0f', borderRadius: '14px', padding: '16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '16px', border: '1px solid #2d4a2d',
            }}>
              <div>
                <div style={{ color: '#fff', fontWeight: '600', fontSize: '15px' }}>Watering reminders</div>
                <div style={{ color: '#a8c5a0', fontSize: '12px', marginTop: '2px' }}>
                  Get notified when plants need water
                </div>
              </div>
              <button
                onClick={handleToggle}
                disabled={saving}
                style={{
                  width: '50px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                  background: enabled ? '#4caf50' : '#2d4a2d',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <div style={{
                  position: 'absolute', top: '3px',
                  left: enabled ? '25px' : '3px',
                  width: '22px', height: '22px', borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>

            {/* Time picker — only shown when enabled */}
            {enabled && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{ color: '#a8c5a0', fontSize: '13px', margin: '0 0 10px' }}>Notify me in the:</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[
                    { key: 'morning', label: '🌅 Morning', sub: '9:00 AM' },
                    { key: 'evening', label: '🌙 Evening', sub: '6:00 PM' },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => handleTimeChange(opt.key)}
                      style={{
                        flex: 1, padding: '14px', borderRadius: '12px', cursor: 'pointer',
                        background: time === opt.key ? '#2d4a1e' : '#0f1f0f',
                        border: time === opt.key ? '2px solid #4caf50' : '2px solid #2d4a2d',
                        color: '#fff', textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '15px', fontWeight: '700' }}>{opt.label}</div>
                      <div style={{ fontSize: '12px', color: '#a8c5a0', marginTop: '2px' }}>{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {enabled && (
              <p style={{ color: '#6a8f6a', fontSize: '12px', margin: '0 0 8px', lineHeight: '1.4' }}>
                You'll only get a notification on days when plants actually need water. Quiet days = happy plants.
              </p>
            )}

            {error && (
              <p style={{ color: '#e07b39', fontSize: '13px', margin: '8px 0 0', lineHeight: '1.4' }}>{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
