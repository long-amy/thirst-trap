import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from 'date-fns';

export default function FertilizerTab({ plant, user, household, onPlantUpdate }) {
  const [logs, setLogs] = useState([]);
  const [logging, setLogging] = useState(false);
  const [confirmDouble, setConfirmDouble] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [intervalDays, setIntervalDays] = useState(plant.fertilizerIntervalDays ?? '');

  useEffect(() => {
    const q = query(collection(db, 'fertilizerLogs'), where('plantId', '==', plant.id));
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.fertilizedAt?.seconds ?? 0) - (a.fertilizedAt?.seconds ?? 0));
      setLogs(docs);
    });
  }, [plant.id]);

  async function logFertilizer(confirmed = false) {
    if (logging) return;
    if (!confirmed && logs.length > 0) {
      const latestDate = logs[0].fertilizedAt?.toDate();
      if (latestDate && Date.now() - latestDate.getTime() < 60 * 60 * 1000) {
        const minutesAgo = Math.round((Date.now() - latestDate.getTime()) / 60000);
        setConfirmDouble({ name: logs[0].loggedBy?.displayName, minutesAgo });
        return;
      }
    }
    setConfirmDouble(null);
    setLogging(true);
    try {
      await addDoc(collection(db, 'fertilizerLogs'), {
        plantId: plant.id,
        householdId: household.id,
        fertilizedAt: serverTimestamp(),
        loggedBy: { userId: user.uid, displayName: user.displayName?.split(' ')[0] || 'Someone' },
      });
    } catch (err) {
      console.error('Fertilizer log failed', err);
    }
    setLogging(false);
  }

  async function saveInterval(val) {
    const n = parseInt(val);
    if (!val || isNaN(n) || n < 1) {
      setIntervalDays('');
      await updateDoc(doc(db, 'plants', plant.id), { fertilizerIntervalDays: null });
      onPlantUpdate({ ...plant, fertilizerIntervalDays: null });
      return;
    }
    await updateDoc(doc(db, 'plants', plant.id), { fertilizerIntervalDays: n });
    onPlantUpdate({ ...plant, fertilizerIntervalDays: n });
  }

  const lastLog = logs[0];
  const lastDate = lastLog?.fertilizedAt?.toDate();
  const daysAgo = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

  function lastFertilizedLabel() {
    if (!lastDate) return 'Never fertilized';
    if (daysAgo === 0) return `Fertilized today by ${lastLog.loggedBy?.displayName || 'someone'}`;
    if (daysAgo === 1) return `Fertilized 1 day ago by ${lastLog.loggedBy?.displayName || 'someone'}`;
    return `Last fertilized ${daysAgo} days ago by ${lastLog.loggedBy?.displayName || 'someone'}`;
  }

  const totalLogs = logs.length;
  let avgPerWeek = '—';
  if (logs.length >= 2) {
    const oldest = logs[logs.length - 1].fertilizedAt?.toDate();
    const newest = logs[0].fertilizedAt?.toDate();
    if (oldest && newest) {
      const weeks = (newest - oldest) / (1000 * 60 * 60 * 24 * 7) || 1;
      avgPerWeek = (logs.length / weeks).toFixed(1);
    }
  }

  const monthStart = startOfMonth(calendarMonth);
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(calendarMonth) });

  function logsOnDay(day) {
    return logs.filter(l => l.fertilizedAt && isSameDay(l.fertilizedAt.toDate(), day));
  }

  return (
    <div style={{ padding: '20px 16px', color: '#fff' }}>
      {/* Last fertilized summary */}
      <div style={{
        background: daysAgo === 0 ? '#2d0a1a' : '#1a2e1a',
        borderRadius: '14px', padding: '16px', marginBottom: '16px',
        border: `1px solid ${daysAgo === 0 ? '#4caf50' : '#2d4a2d'}`,
      }}>
        <p style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: daysAgo === 0 ? '#4caf50' : '#fff' }}>
          {daysAgo === 0 ? '✅ ' : '🌿 '}{lastFertilizedLabel()}
        </p>
      </div>

      {/* Double-log warning */}
      {confirmDouble ? (
        <div style={{ background: '#2d2010', border: '1px solid #e07b39', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ color: '#e07b39', margin: '0 0 12px', fontSize: '14px' }}>
            {confirmDouble.name} already fertilized this {confirmDouble.minutesAgo} minute{confirmDouble.minutesAgo !== 1 ? 's' : ''} ago. Log again?
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => logFertilizer(true)} style={{ ...smallBtn, background: '#4caf50', color: '#fff' }}>Yes, log again</button>
            <button onClick={() => setConfirmDouble(null)} style={{ ...smallBtn, background: 'transparent', color: '#a8c5a0', border: '1px solid #2d4a2d' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => logFertilizer(false)} disabled={logging} style={{
          width: '100%', background: '#c06080', color: '#fff', border: 'none',
          borderRadius: '12px', padding: '16px', fontSize: '17px', fontWeight: '700',
          cursor: 'pointer', marginBottom: '16px',
        }}>
          {logging ? 'Logging...' : '🌿 Fertilize'}
        </button>
      )}

      {/* Interval setting */}
      <div style={{
        background: '#1a2e1a', borderRadius: '12px', padding: '14px 16px',
        border: '1px solid #2d4a2d', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
      }}>
        <span style={{ color: '#a8c5a0', fontSize: '14px' }}>🌿 Fertilize every</span>
        <input
          type="number"
          min="1"
          value={intervalDays}
          onChange={e => setIntervalDays(e.target.value)}
          onBlur={e => saveInterval(e.target.value)}
          placeholder="—"
          style={{
            width: '52px', background: '#0f1f0f', border: '1px solid #c06080',
            borderRadius: '8px', padding: '4px 8px', color: '#fff', fontSize: '16px',
            fontWeight: '700', textAlign: 'center', outline: 'none',
          }}
        />
        <span style={{ color: '#a8c5a0', fontSize: '14px' }}>days</span>
        {intervalDays && <span style={{ color: '#6a8f6a', fontSize: '12px', marginLeft: 'auto' }}>saved</span>}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <StatCard label="Avg per week" value={avgPerWeek} />
        <StatCard label="Total feedings" value={totalLogs} />
      </div>

      {/* Calendar */}
      <div style={{ background: '#1a2e1a', borderRadius: '14px', padding: '16px', border: '1px solid #2d4a2d' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <button onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))} style={navBtn}>‹</button>
          <span style={{ fontWeight: '600', fontSize: '15px' }}>{format(calendarMonth, 'MMMM yyyy')}</span>
          <button onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))} style={navBtn}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} style={{ color: '#a8c5a0', fontSize: '12px', paddingBottom: '8px' }}>{d}</div>
          ))}
          {Array(getDay(monthStart)).fill(null).map((_, i) => <div key={`pad-${i}`} />)}
          {days.map(day => {
            const dayLogs = logsOnDay(day);
            const hasLog = dayLogs.length > 0;
            const isSelected = selectedDay && isSameDay(selectedDay, day);
            return (
              <div
                key={day.toISOString()}
                onClick={() => hasLog && setSelectedDay(isSelected ? null : day)}
                style={{
                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%',
                  background: hasLog ? (isSelected ? '#8b1a4a' : '#c06080') : 'transparent',
                  color: hasLog ? '#fff' : '#a8c5a0', fontSize: '13px',
                  cursor: hasLog ? 'pointer' : 'default', fontWeight: hasLog ? '700' : '400',
                }}
              >
                {format(day, 'd')}
              </div>
            );
          })}
        </div>
        {selectedDay && logsOnDay(selectedDay).map((log, i) => (
          <div key={i} style={{ marginTop: '12px', padding: '10px', background: '#0f1f0f', borderRadius: '10px', fontSize: '13px', color: '#a8c5a0' }}>
            🌿 {log.loggedBy?.displayName || 'Someone'} — {log.fertilizedAt?.toDate ? format(log.fertilizedAt.toDate(), 'h:mm a') : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ flex: 1, background: '#1a2e1a', borderRadius: '12px', padding: '14px', border: '1px solid #2d4a2d', textAlign: 'center' }}>
      <div style={{ fontSize: '22px', fontWeight: '700', color: '#c06080' }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#a8c5a0', marginTop: '4px' }}>{label}</div>
    </div>
  );
}

const smallBtn = { flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: '600', cursor: 'pointer' };
const navBtn = { background: 'none', border: 'none', color: '#a8c5a0', fontSize: '20px', cursor: 'pointer', padding: '4px 10px' };
