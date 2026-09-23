import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format, isSameDay, isAfter, startOfDay, isToday } from 'date-fns';
import { toDate, startOfLocalDay, wateringStatus, fertilizerStatus, CARE_COLORS } from '../lib/dates';
import { useBackGuard } from '../hooks/useBackGuard';
import CareCalendar from './CareCalendar';

const WATER = CARE_COLORS.water;
const FERT = CARE_COLORS.fertilizer;
const OLIVE = CARE_COLORS.check;

export default function CareTab({ plant, user, household, onPlantUpdate }) {
  const [waterLogs, setWaterLogs] = useState([]);
  const [fertLogs, setFertLogs] = useState([]);
  const [checkLogs, setCheckLogs] = useState([]);
  const [busy, setBusy] = useState(null); // 'water' | 'fertilize' | 'check'
  const [showCheckPopup, setShowCheckPopup] = useState(false);
  const [confirmDouble, setConfirmDouble] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [targetDate, setTargetDate] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [waterInterval, setWaterInterval] = useState(plant.waterIntervalDays ?? '');
  const [fertInterval, setFertInterval] = useState(plant.fertilizerIntervalDays ?? '');

  useBackGuard(showCheckPopup, () => setShowCheckPopup(false));
  useBackGuard(!!confirmDouble, () => setConfirmDouble(null));
  useBackGuard(!!targetDate, () => setTargetDate(null));

  useSubscription('wateringLogs', 'wateredAt', plant.id, household.id, setWaterLogs);
  useSubscription('fertilizerLogs', 'fertilizedAt', plant.id, household.id, setFertLogs);
  useSubscription('checkLogs', 'checkedAt', plant.id, household.id, setCheckLogs);

  const lastWateredTs = waterLogs[0]?.wateredAt ?? null;
  const lastFertTs = fertLogs[0]?.fertilizedAt ?? null;
  const lastCheckTs = checkLogs[0]?.checkedAt ?? null;

  const water = wateringStatus(plant, lastWateredTs, lastCheckTs);
  const fert = fertilizerStatus(plant, lastFertTs);

  function stampFor(date) {
    return date
      ? Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0))
      : serverTimestamp();
  }

  const loggedBy = () => ({ userId: user.uid, displayName: user.displayName?.split(' ')[0] || 'Someone' });

  async function logWatering(confirmed = false) {
    if (busy) return;
    if (!targetDate && !confirmed && waterLogs.length > 0) {
      const latest = toDate(waterLogs[0].wateredAt);
      if (latest && Date.now() - latest.getTime() < 60 * 60 * 1000) {
        setConfirmDouble({
          kind: 'water',
          name: waterLogs[0].loggedBy?.displayName,
          minutesAgo: Math.round((Date.now() - latest.getTime()) / 60000),
        });
        return;
      }
    }
    setConfirmDouble(null);
    setBusy('water');
    try {
      await addDoc(collection(db, 'wateringLogs'), {
        plantId: plant.id,
        householdId: household.id,
        wateredAt: stampFor(targetDate),
        loggedBy: loggedBy(),
      });
      await updateDoc(doc(db, 'plants', plant.id), { nextWateringOverride: deleteField() });
      onPlantUpdate({ ...plant, nextWateringOverride: null });
      setTargetDate(null);
      setSelectedDay(null);
    } catch (err) {
      console.error('Watering log failed', err);
    }
    setBusy(null);
  }

  async function logFertilizer(confirmed = false) {
    if (busy) return;
    if (!targetDate && !confirmed && fertLogs.length > 0) {
      const latest = toDate(fertLogs[0].fertilizedAt);
      if (latest && Date.now() - latest.getTime() < 60 * 60 * 1000) {
        setConfirmDouble({
          kind: 'fertilize',
          name: fertLogs[0].loggedBy?.displayName,
          minutesAgo: Math.round((Date.now() - latest.getTime()) / 60000),
        });
        return;
      }
    }
    setConfirmDouble(null);
    setBusy('fertilize');
    try {
      await addDoc(collection(db, 'fertilizerLogs'), {
        plantId: plant.id,
        householdId: household.id,
        fertilizedAt: stampFor(targetDate),
        loggedBy: loggedBy(),
      });
      setTargetDate(null);
      setSelectedDay(null);
    } catch (err) {
      console.error('Fertilizer log failed', err);
    }
    setBusy(null);
  }

  async function logCheck(intervalAction) {
    if (busy) return;
    setBusy('check');
    setShowCheckPopup(false);
    try {
      await addDoc(collection(db, 'checkLogs'), {
        plantId: plant.id,
        householdId: household.id,
        checkedAt: serverTimestamp(),
        loggedBy: loggedBy(),
      });
      let pushDays = null;
      if (intervalAction === 'tomorrow') pushDays = 1;
      else if (intervalAction === 'cycle' && plant.waterIntervalDays) pushDays = plant.waterIntervalDays;

      if (pushDays !== null) {
        const next = startOfLocalDay(new Date());
        next.setDate(next.getDate() + pushDays);
        const override = Timestamp.fromDate(next);
        await updateDoc(doc(db, 'plants', plant.id), { nextWateringOverride: override });
        onPlantUpdate({ ...plant, nextWateringOverride: override });
      }
    } catch (err) {
      console.error('Check log failed', err);
    }
    setBusy(null);
  }

  async function saveInterval(field, val, setLocal) {
    const n = parseInt(val, 10);
    const value = !val || isNaN(n) || n < 1 ? null : n;
    if (value === null) setLocal('');
    await updateDoc(doc(db, 'plants', plant.id), { [field]: value });
    onPlantUpdate({ ...plant, [field]: value });
  }

  function handleDayTap(day) {
    if (isAfter(startOfDay(day), startOfDay(new Date()))) return;
    const hasEntries =
      entries.water.some(e => isSameDay(e.date, day)) ||
      entries.fertilizer.some(e => isSameDay(e.date, day)) ||
      entries.check.some(e => isSameDay(e.date, day));

    if (hasEntries) {
      setSelectedDay(prev => (prev && isSameDay(prev, day) ? null : day));
      setTargetDate(null);
    } else if (isToday(day)) {
      setTargetDate(null);
      setSelectedDay(null);
    } else {
      setTargetDate(prev => (prev && isSameDay(prev, day) ? null : day));
      setSelectedDay(null);
    }
  }

  const entries = {
    water: toEntries(waterLogs, 'wateredAt'),
    fertilizer: toEntries(fertLogs, 'fertilizedAt'),
    check: toEntries(checkLogs, 'checkedAt'),
  };

  const projectedWater = projectedDue(lastWateredTs, plant.waterIntervalDays, plant.nextWateringOverride, water.checkedAfterWatering);
  const projectedFert = projectedDue(lastFertTs, plant.fertilizerIntervalDays);

  return (
    <div style={{ padding: '20px 16px', color: '#fff' }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <StatusCard
          icon="💧"
          title="Water"
          status={water}
          lastLog={waterLogs[0]}
          accent={WATER}
        />
        <StatusCard
          icon="🌿"
          title="Fertilizer"
          status={fert}
          lastLog={fertLogs[0]}
          accent={FERT}
        />
      </div>

      {targetDate && (
        <div style={{
          background: '#1a2a33', border: `1px solid ${WATER}`, borderRadius: '12px',
          padding: '10px 14px', marginBottom: '12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: WATER, fontSize: '14px' }}>
            📅 Logging for {format(targetDate, 'EEEE, MMM d')}
          </span>
          <button onClick={() => setTargetDate(null)} style={{ background: 'none', border: 'none', color: '#a8c5a0', cursor: 'pointer', fontSize: '16px' }}>×</button>
        </div>
      )}

      {confirmDouble ? (
        <div style={{ background: '#2d2010', border: '1px solid #e07b39', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ color: '#e07b39', margin: '0 0 12px', fontSize: '14px' }}>
            {confirmDouble.name || 'Someone'} already {confirmDouble.kind === 'water' ? 'watered' : 'fertilized'} this{' '}
            {confirmDouble.minutesAgo} minute{confirmDouble.minutesAgo !== 1 ? 's' : ''} ago. Log again?
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => (confirmDouble.kind === 'water' ? logWatering(true) : logFertilizer(true))}
              style={{ ...smallBtn, background: confirmDouble.kind === 'water' ? WATER : FERT, color: '#fff' }}
            >
              Yes, log again
            </button>
            <button onClick={() => setConfirmDouble(null)} style={{ ...smallBtn, background: 'transparent', color: '#a8c5a0', border: '1px solid #2d4a2d' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <ActionButton
            onClick={() => logWatering(false)}
            disabled={!!busy}
            background={WATER}
            label={busy === 'water' ? 'Logging…' : targetDate ? `💧 ${format(targetDate, 'MMM d')}` : '💧 Water'}
          />
          <ActionButton
            onClick={() => setShowCheckPopup(true)}
            disabled={!!busy || !!targetDate}
            outline={OLIVE}
            label={busy === 'check' ? 'Logging…' : '✓ Checked'}
          />
          <ActionButton
            onClick={() => logFertilizer(false)}
            disabled={!!busy}
            background={FERT}
            label={busy === 'fertilize' ? 'Logging…' : targetDate ? `🌿 ${format(targetDate, 'MMM d')}` : '🌿 Feed'}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <IntervalField
          label="💧 Water every"
          value={waterInterval}
          accent={WATER}
          onChange={setWaterInterval}
          onCommit={val => saveInterval('waterIntervalDays', val, setWaterInterval)}
        />
        <IntervalField
          label="🌿 Feed every"
          value={fertInterval}
          accent={FERT}
          onChange={setFertInterval}
          onCommit={val => saveInterval('fertilizerIntervalDays', val, setFertInterval)}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <StatCard label={waterLogs.length === 1 ? 'Watering' : 'Waterings'} value={waterLogs.length} color={WATER} />
        <StatCard label="Water / wk" value={avgPerWeek(waterLogs, 'wateredAt')} color={WATER} />
        <StatCard label={fertLogs.length === 1 ? 'Feeding' : 'Feedings'} value={fertLogs.length} color={FERT} />
      </div>

      <p style={{ color: '#6a8f6a', fontSize: '12px', margin: '0 0 10px', textAlign: 'center' }}>
        Tap a past day to log water or fertilizer for that date
      </p>

      <CareCalendar
        month={calendarMonth}
        onMonthChange={setCalendarMonth}
        entries={entries}
        projectedWater={projectedWater}
        projectedFert={projectedFert}
        selectedDay={selectedDay}
        targetDate={targetDate}
        onDayTap={handleDayTap}
      />

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
              <CheckOption icon="📅" title="Keep same schedule" hint="No change to watering timeline" onClick={() => logCheck('keep')} />
              <CheckOption icon="⏭️" title="Push to tomorrow" hint="Come back and water it tomorrow" onClick={() => logCheck('tomorrow')} />
              {plant.waterIntervalDays && (
                <CheckOption
                  icon="🔄"
                  title="Push a full cycle"
                  hint={`Water in ${plant.waterIntervalDays} more days`}
                  onClick={() => logCheck('cycle')}
                />
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

function useSubscription(collectionName, dateField, plantId, householdId, setter) {
  useEffect(() => {
    // householdId is redundant for finding the rows, but security rules scope
    // reads by household, so the query has to carry it to be allowed.
    const q = query(
      collection(db, collectionName),
      where('householdId', '==', householdId),
      where('plantId', '==', plantId),
    );
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b[dateField]?.seconds ?? 0) - (a[dateField]?.seconds ?? 0));
      setter(docs);
    });
  }, [collectionName, dateField, plantId, householdId, setter]);
}

function toEntries(logs, dateField) {
  return logs
    .map(l => ({ id: l.id, date: toDate(l[dateField]), by: l.loggedBy?.displayName }))
    .filter(e => e.date);
}

function projectedDue(lastTs, interval, override, overrideActive) {
  if (overrideActive && override) {
    const d = toDate(override);
    return d ? startOfLocalDay(d) : null;
  }
  const last = toDate(lastTs);
  if (!last || !interval) return null;
  const due = startOfLocalDay(last);
  due.setDate(due.getDate() + interval);
  return due;
}

function avgPerWeek(logs, dateField) {
  if (logs.length < 2) return '—';
  const newest = toDate(logs[0][dateField]);
  const oldest = toDate(logs[logs.length - 1][dateField]);
  if (!newest || !oldest) return '—';
  const weeks = (newest - oldest) / (1000 * 60 * 60 * 24 * 7) || 1;
  return (logs.length / weeks).toFixed(1);
}

function StatusCard({ icon, title, status, lastLog, accent }) {
  const isToday_ = status.daysAgo === 0;
  return (
    <div style={{
      flex: 1, background: isToday_ ? `${accent}22` : '#1a2e1a',
      borderRadius: '14px', padding: '14px',
      border: `1px solid ${isToday_ ? accent : '#2d4a2d'}`,
      minWidth: 0,
    }}>
      <div style={{ color: '#6a8f6a', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
        {icon} {title}
      </div>
      <div style={{ color: status.color, fontSize: '16px', fontWeight: '700' }}>
        {status.label}
      </div>
      <div style={{ color: '#6a8f6a', fontSize: '11px', marginTop: '4px' }}>
        {status.daysAgo === null
          ? 'no history'
          : `last: ${status.daysAgo === 0 ? 'today' : status.daysAgo === 1 ? 'yesterday' : `${status.daysAgo}d ago`}`}
        {lastLog?.loggedBy?.displayName ? ` · ${lastLog.loggedBy.displayName}` : ''}
      </div>
    </div>
  );
}

function ActionButton({ onClick, disabled, background, outline, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, minWidth: 0,
        background: background || 'transparent',
        color: background ? '#fff' : outline,
        border: background ? 'none' : `2px solid ${outline}`,
        borderRadius: '12px', padding: '15px 4px', fontSize: '15px', fontWeight: '700',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {label}
    </button>
  );
}

function IntervalField({ label, value, accent, onChange, onCommit }) {
  return (
    <div style={{
      flex: 1, background: '#1a2e1a', borderRadius: '12px', padding: '12px',
      border: '1px solid #2d4a2d', minWidth: 0,
    }}>
      <div style={{ color: '#a8c5a0', fontSize: '12px', marginBottom: '8px', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          type="number" min="1" value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={e => onCommit(e.target.value)}
          placeholder="—"
          style={{
            width: '48px', background: '#0f1f0f', border: `1px solid ${accent}`,
            borderRadius: '8px', padding: '4px 6px', color: '#fff', fontSize: '16px',
            fontWeight: '700', textAlign: 'center', outline: 'none',
          }}
        />
        <span style={{ color: '#a8c5a0', fontSize: '13px' }}>days</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: '#1a2e1a', borderRadius: '12px', padding: '12px', border: '1px solid #2d4a2d', textAlign: 'center' }}>
      <div style={{ fontSize: '20px', fontWeight: '700', color }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#a8c5a0', marginTop: '4px' }}>{label}</div>
    </div>
  );
}

function CheckOption({ icon, title, hint, onClick }) {
  return (
    <button onClick={onClick} style={checkOptionBtn}>
      <span style={{ fontSize: '22px' }}>{icon}</span>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontWeight: '700', color: '#fff', fontSize: '15px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: '#a8c5a0' }}>{hint}</div>
      </div>
    </button>
  );
}

const smallBtn = { flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: '600', cursor: 'pointer' };
const checkOptionBtn = {
  display: 'flex', alignItems: 'center', gap: '14px',
  background: '#0f1f0f', border: 'none', borderRadius: '12px',
  padding: '14px 16px', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
};
