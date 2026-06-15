import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isAfter, startOfDay, isToday } from 'date-fns';

const OLIVE = '#8eb85a';

export default function WateringTab({ plant, user, household, onPlantUpdate }) {
  const [logs, setLogs] = useState([]);
  const [checkLogs, setCheckLogs] = useState([]);
  const [logging, setLogging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showCheckPopup, setShowCheckPopup] = useState(false);
  const [confirmDouble, setConfirmDouble] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [targetDate, setTargetDate] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [intervalDays, setIntervalDays] = useState(plant.waterIntervalDays ?? '');

  useEffect(() => {
    const q = query(collection(db, 'wateringLogs'), where('plantId', '==', plant.id));
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.wateredAt?.seconds ?? 0) - (a.wateredAt?.seconds ?? 0));
      setLogs(docs);
    });
  }, [plant.id]);

  useEffect(() => {
    const q = query(collection(db, 'checkLogs'), where('plantId', '==', plant.id));
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.checkedAt?.seconds ?? 0) - (a.checkedAt?.seconds ?? 0));
      setCheckLogs(docs);
    });
  }, [plant.id]);

  async function logWatering(confirmed = false) {
    if (logging) return;
    if (!targetDate && !confirmed && logs.length > 0) {
      const latestDate = logs[0].wateredAt?.toDate();
      if (latestDate && Date.now() - latestDate.getTime() < 60 * 60 * 1000) {
        const minutesAgo = Math.round((Date.now() - latestDate.getTime()) / 60000);
        setConfirmDouble({ name: logs[0].loggedBy?.displayName, minutesAgo });
        return;
      }
    }
    setConfirmDouble(null);
    setLogging(true);
    try {
      const wateredAt = targetDate
        ? Timestamp.fromDate(new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 12, 0, 0))
        : serverTimestamp();
      await addDoc(collection(db, 'wateringLogs'), {
        plantId: plant.id,
        householdId: household.id,
        wateredAt,
        loggedBy: { userId: user.uid, displayName: user.displayName?.split(' ')[0] || 'Someone' },
      });
      await updateDoc(doc(db, 'plants', plant.id), { nextWateringOverride: deleteField() });
      onPlantUpdate({ ...plant, nextWateringOverride: null });
      setTargetDate(null);
      setSelectedDay(null);
    } catch (err) {
      console.error('Watering log failed', err);
    }
    setLogging(false);
  }

  async function logCheck(intervalAction) {
    if (checking) return;
    setChecking(true);
    setShowCheckPopup(false);
    try {
      await addDoc(collection(db, 'checkLogs'), {
        plantId: plant.id,
        householdId: household.id,
        checkedAt: serverTimestamp(),
        loggedBy: { userId: user.uid, displayName: user.displayName?.split(' ')[0] || 'Someone' },
      });
      if (intervalAction === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setHours(0, 0, 0, 0);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const override = Timestamp.fromDate(tomorrow);
        await updateDoc(doc(db, 'plants', plant.id), { nextWateringOverride: override });
        onPlantUpdate({ ...plant, nextWateringOverride: override });
      } else if (intervalAction === 'cycle' && plant.waterIntervalDays) {
        const next = new Date();
        next.setHours(0, 0, 0, 0);
        next.setDate(next.getDate() + plant.waterIntervalDays);
        const override = Timestamp.fromDate(next);
        await updateDoc(doc(db, 'plants', plant.id), { nextWateringOverride: override });
        onPlantUpdate({ ...plant, nextWateringOverride: override });
      }
    } catch (err) {
      console.error('Check log failed', err);
    }
    setChecking(false);
  }

  async function saveInterval(val) {
    const n = parseInt(val);
    if (!val || isNaN(n) || n < 1) {
      setIntervalDays('');
      await updateDoc(doc(db, 'plants', plant.id), { waterIntervalDays: null });
      onPlantUpdate({ ...plant, waterIntervalDays: null });
      return;
    }
    await updateDoc(doc(db, 'plants', plant.id), { waterIntervalDays: n });
    onPlantUpdate({ ...plant, waterIntervalDays: n });
  }

  function handleDayTap(day) {
    if (isAfter(startOfDay(day), startOfDay(new Date()))) return;
    const dayWaterLogs = logsOnDay(day);
    const dayCheckLogs = checkLogsOnDay(day);
    if (dayWaterLogs.length > 0 || dayCheckLogs.length > 0) {
      setSelectedDay(prev => prev && isSameDay(prev, day) ? null : day);
      setTargetDate(null);
    } else {
      if (isToday(day)) {
        setTargetDate(null);
        setSelectedDay(null);
      } else {
        const alreadySelected = targetDate && isSameDay(targetDate, day);
        setTargetDate(alreadySelected ? null : day);
        setSelectedDay(null);
      }
    }
  }

  // Midnight-normalized days-ago (fixes off-by-one bug)
  const lastLog = logs[0];
  const lastDate = lastLog?.wateredAt?.toDate();
  const daysAgo = (() => {
    if (!lastDate) return null;
    const d = new Date(lastDate); d.setHours(0, 0, 0, 0);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((t - d) / (1000 * 60 * 60 * 24));
  })();

  function lastWateredLabel() {
    if (!lastDate) return 'Never watered';
    if (daysAgo === 0) return `Watered today by ${lastLog.loggedBy?.displayName || 'someone'}`;
    if (daysAgo === 1) return `Watered 1 day ago by ${lastLog.loggedBy?.displayName || 'someone'}`;
    return `Last watered ${daysAgo} days ago by ${lastLog.loggedBy?.displayName || 'someone'}`;
  }

  function waterButtonLabel() {
    if (logging) return 'Logging...';
    if (targetDate) return `💧 Log for ${format(targetDate, 'MMM d')}`;
    return '💧 Water';
  }

  const totalWaterings = logs.length;
  let avgPerWeek = '—';
  if (logs.length >= 2) {
    const oldest = logs[logs.length - 1].wateredAt?.toDate();
    const newest = logs[0].wateredAt?.toDate();
    if (oldest && newest) {
      const weeks = (newest - oldest) / (1000 * 60 * 60 * 24 * 7) || 1;
      avgPerWeek = (logs.length / weeks).toFixed(1);
    }
  }

  const monthStart = startOfMonth(calendarMonth);
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(calendarMonth) });
  const today = startOfDay(new Date());
  const interval = plant.waterIntervalDays;
  const projectedDate = lastDate && interval
    ? startOfDay(new Date(lastDate.getTime() + interval * 24 * 60 * 60 * 1000))
    : null;

  function logsOnDay(day) {
    return logs.filter(l => l.wateredAt && isSameDay(l.wateredAt.toDate(), day));
  }

  function checkLogsOnDay(day) {
    return checkLogs.filter(l => l.checkedAt && isSameDay(l.checkedAt.toDate(), day));
  }

  return (
    <div style={{ padding: '20px 16px', color: '#fff' }}>
      <div style={{
        background: daysAgo === 0 ? '#0a2233' : '#1a2e1a',
        borderRadius: '14px', padding: '16px', marginBottom: '16px',
        border: `1px solid ${daysAgo === 0 ? '#5ba3be' : '#2d4a2d'}`,
      }}>
        <p style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: daysAgo === 0 ? '#5ba3be' : '#fff' }}>
          {daysAgo === 0 ? '✅ ' : '💧 '}{lastWateredLabel()}
        </p>
      </div>

      {targetDate && (
        <div style={{
          background: '#1a2a33', border: '1px solid #5ba3be', borderRadius: '12px',
          padding: '10px 14px', marginBottom: '12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#5ba3be', fontSize: '14px' }}>
            📅 Logging for {format(targetDate, 'EEEE, MMM d')}
          </span>
          <button onClick={() => setTargetDate(null)} style={{ background: 'none', border: 'none', color: '#a8c5a0', cursor: 'pointer', fontSize: '16px' }}>×</button>
        </div>
      )}

      {confirmDouble ? (
        <div style={{ background: '#2d2010', border: '1px solid #e07b39', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ color: '#e07b39', margin: '0 0 12px', fontSize: '14px' }}>
            {confirmDouble.name} already watered this {confirmDouble.minutesAgo} minute{confirmDouble.minutesAgo !== 1 ? 's' : ''} ago. Log again?
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => logWatering(true)} style={{ ...smallBtn, background: '#5ba3be', color: '#fff' }}>Yes, log again</button>
            <button onClick={() => setConfirmDouble(null)} style={{ ...smallBtn, background: 'transparent', color: '#a8c5a0', border: '1px solid #2d4a2d' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <button
            onClick={() => logWatering(false)}
            disabled={logging}
            style={{
              flex: 1, background: '#5ba3be', color: '#fff', border: 'none',
              borderRadius: '12px', padding: '16px', fontSize: '17px', fontWeight: '700',
              cursor: 'pointer', opacity: logging ? 0.6 : 1,
            }}
          >
            {waterButtonLabel()}
          </button>
          <button
            onClick={() => setShowCheckPopup(true)}
            disabled={checking}
            style={{
              flex: 1, background: 'transparent', color: OLIVE,
              border: `2px solid ${OLIVE}`, borderRadius: '12px', padding: '16px',
              fontSize: '17px', fontWeight: '700', cursor: 'pointer', opacity: checking ? 0.6 : 1,
            }}
          >
            {checking ? 'Logging...' : '✓ Checked'}
          </button>
        </div>
      )}

      <div style={{
        background: '#1a2e1a', borderRadius: '12px', padding: '14px 16px',
        border: '1px solid #2d4a2d', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
      }}>
        <span style={{ color: '#a8c5a0', fontSize: '14px' }}>💧 Thirsty every</span>
        <input
          type="number" min="1" value={intervalDays}
          onChange={e => setIntervalDays(e.target.value)}
          onBlur={e => saveInterval(e.target.value)}
          placeholder="—"
          style={{
            width: '52px', background: '#0f1f0f', border: '1px solid #5ba3be',
            borderRadius: '8px', padding: '4px 8px', color: '#fff', fontSize: '16px',
            fontWeight: '700', textAlign: 'center', outline: 'none',
          }}
        />
        <span style={{ color: '#a8c5a0', fontSize: '14px' }}>days</span>
        {intervalDays && <span style={{ color: '#6a8f6a', fontSize: '12px', marginLeft: 'auto' }}>saved</span>}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <StatCard label="Avg per week" value={avgPerWeek} />
        <StatCard label="Total waterings" value={totalWaterings} />
      </div>

      <div style={{ background: '#1a2e1a', borderRadius: '14px', padding: '16px', border: '1px solid #2d4a2d' }}>
        <p style={{ color: '#6a8f6a', fontSize: '12px', margin: '0 0 12px', textAlign: 'center' }}>
          Tap any past day to log a watering for that date
        </p>
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
            const dayChecks = checkLogsOnDay(day);
            const hasWaterLog = dayLogs.length > 0;
            const hasCheckLog = dayChecks.length > 0;
            const isFuture = isAfter(startOfDay(day), today);
            const isSelected = selectedDay && isSameDay(selectedDay, day);
            const isTarget = targetDate && isSameDay(targetDate, day);
            const isProjected = projectedDate && isSameDay(startOfDay(day), projectedDate) && !hasWaterLog;
            const projectedMissed = isProjected && isAfter(today, projectedDate);

            let bg = 'transparent';
            let color = isFuture ? '#3a5a3a' : '#a8c5a0';
            let border = 'none';

            if (hasWaterLog) {
              bg = isSelected ? '#0277bd' : '#5ba3be';
              color = '#fff';
            } else if (hasCheckLog) {
              bg = isSelected ? '#3a5a20' : 'transparent';
              color = OLIVE;
              border = `2px solid ${OLIVE}`;
            } else if (isTarget) {
              bg = '#1a3a4a'; color = '#5ba3be';
              border = '1px dashed #5ba3be';
            } else if (isProjected) {
              border = `2px dashed ${projectedMissed ? '#e07b39' : '#5ba3be'}`;
              color = projectedMissed ? '#e07b39' : '#5ba3be';
            }

            return (
              <div
                key={day.toISOString()}
                onClick={() => handleDayTap(day)}
                style={{
                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', background: bg, color, fontSize: '13px',
                  cursor: isFuture ? 'default' : 'pointer',
                  fontWeight: hasWaterLog || hasCheckLog || isTarget || isProjected ? '700' : '400',
                  border,
                }}
              >
                {format(day, 'd')}
              </div>
            );
          })}
        </div>
        {selectedDay && (
          <>
            {logsOnDay(selectedDay).map((log, i) => (
              <div key={`w-${i}`} style={{ marginTop: '12px', padding: '10px', background: '#0f1f0f', borderRadius: '10px', fontSize: '13px', color: '#a8c5a0' }}>
                💧 {log.loggedBy?.displayName || 'Someone'} — {log.wateredAt?.toDate ? format(log.wateredAt.toDate(), 'h:mm a') : ''}
              </div>
            ))}
            {checkLogsOnDay(selectedDay).map((log, i) => (
              <div key={`c-${i}`} style={{ marginTop: '8px', padding: '10px', background: '#0f1f0f', borderRadius: '10px', fontSize: '13px', color: OLIVE }}>
                ✓ {log.loggedBy?.displayName || 'Someone'} checked — {log.checkedAt?.toDate ? format(log.checkedAt.toDate(), 'h:mm a') : ''}
              </div>
            ))}
          </>
        )}
      </div>

      {showCheckPopup && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setShowCheckPopup(false)}
        >
          <div
            style={{ background: '#1a2e1a', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', boxSizing: 'border-box' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: '18px' }}>How's it looking?</h3>
            <p style={{ color: '#a8c5a0', margin: '0 0 20px', fontSize: '14px' }}>Adjust the watering schedule if needed.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => logCheck('keep')} style={checkOptionBtn}>
                <span style={{ fontSize: '22px' }}>📅</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: '700', color: '#fff', fontSize: '15px' }}>Keep same schedule</div>
                  <div style={{ fontSize: '12px', color: '#a8c5a0' }}>No change to watering timeline</div>
                </div>
              </button>
              <button onClick={() => logCheck('tomorrow')} style={checkOptionBtn}>
                <span style={{ fontSize: '22px' }}>⏭️</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: '700', color: '#fff', fontSize: '15px' }}>Push to tomorrow</div>
                  <div style={{ fontSize: '12px', color: '#a8c5a0' }}>Come back and water it tomorrow</div>
                </div>
              </button>
              {plant.waterIntervalDays && (
                <button onClick={() => logCheck('cycle')} style={checkOptionBtn}>
                  <span style={{ fontSize: '22px' }}>🔄</span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: '700', color: '#fff', fontSize: '15px' }}>Push a full cycle</div>
                    <div style={{ fontSize: '12px', color: '#a8c5a0' }}>Water in {plant.waterIntervalDays} more days</div>
                  </div>
                </button>
              )}
              <button onClick={() => setShowCheckPopup(false)} style={{ ...checkOptionBtn, background: 'transparent', border: '1px solid #2d4a2d', justifyContent: 'center' }}>
                <span style={{ color: '#a8c5a0', fontSize: '15px' }}>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ flex: 1, background: '#1a2e1a', borderRadius: '12px', padding: '14px', border: '1px solid #2d4a2d', textAlign: 'center' }}>
      <div style={{ fontSize: '22px', fontWeight: '700', color: '#5ba3be' }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#a8c5a0', marginTop: '4px' }}>{label}</div>
    </div>
  );
}

const smallBtn = { flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: '600', cursor: 'pointer' };
const navBtn = { background: 'none', border: 'none', color: '#a8c5a0', fontSize: '20px', cursor: 'pointer', padding: '4px 10px' };
const checkOptionBtn = {
  display: 'flex', alignItems: 'center', gap: '14px',
  background: '#0f1f0f', border: 'none', borderRadius: '12px',
  padding: '14px 16px', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
};
