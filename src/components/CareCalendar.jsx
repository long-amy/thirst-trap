import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isAfter, startOfDay, isToday } from 'date-fns';
import { CARE_COLORS } from '../lib/dates';

const WATER = CARE_COLORS.water;
const FERT = CARE_COLORS.fertilizer;
const OLIVE = CARE_COLORS.check;

/**
 * One calendar for the whole care history: blue for watering, pink for
 * fertilizer, olive for a "checked, didn't need it" day. Days carrying more than
 * one kind of entry get a split background plus a dot per kind, so a day you both
 * watered and fed still reads at a glance.
 *
 * `entries` is { water: [], fertilizer: [], check: [] }, each item { id, date, by }.
 */
export default function CareCalendar({
  month,
  onMonthChange,
  entries,
  projectedWater,
  projectedFert,
  selectedDay,
  targetDate,
  onDayTap,
}) {
  const monthStart = startOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(month) });
  const today = startOfDay(new Date());

  const on = (kind, day) => (entries[kind] || []).filter(e => e.date && isSameDay(e.date, day));

  return (
    <div style={{ background: '#1a2e1a', borderRadius: '14px', padding: '16px', border: '1px solid #2d4a2d' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <button onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1))} style={navBtn}>‹</button>
        <span style={{ fontWeight: '600', fontSize: '15px', color: '#fff' }}>{format(month, 'MMMM yyyy')}</span>
        <button onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1))} style={navBtn}>›</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <Legend color={WATER} label="Watered" />
        <Legend color={FERT} label="Fertilized" />
        <Legend color={OLIVE} label="Checked" />
        <Legend color={WATER} label="Due" hollow />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} style={{ color: '#a8c5a0', fontSize: '12px', paddingBottom: '6px' }}>{d}</div>
        ))}
        {Array(getDay(monthStart)).fill(null).map((_, i) => <div key={`pad-${i}`} />)}

        {days.map(day => {
          const waterLogs = on('water', day);
          const fertLogs = on('fertilizer', day);
          const checkLogs = on('check', day);
          const hasWater = waterLogs.length > 0;
          const hasFert = fertLogs.length > 0;
          const hasCheck = checkLogs.length > 0;

          const isFuture = isAfter(startOfDay(day), today);
          const isSelected = selectedDay && isSameDay(selectedDay, day);
          const isTarget = targetDate && isSameDay(targetDate, day);
          const dueWater = projectedWater && isSameDay(startOfDay(day), projectedWater) && !hasWater;
          const dueFert = projectedFert && isSameDay(startOfDay(day), projectedFert) && !hasFert;
          const missed = (dueWater || dueFert) && isAfter(today, startOfDay(day));

          const dots = [
            ...(hasWater ? [{ color: WATER, hollow: false }] : []),
            ...(hasFert ? [{ color: FERT, hollow: false }] : []),
            ...(hasCheck ? [{ color: OLIVE, hollow: false }] : []),
            ...(dueWater ? [{ color: missed ? CARE_COLORS.late : WATER, hollow: true }] : []),
            ...(dueFert ? [{ color: missed ? CARE_COLORS.late : FERT, hollow: true }] : []),
          ];

          let background = 'transparent';
          if (hasWater && hasFert) {
            background = `linear-gradient(135deg, ${WATER}59 0 50%, ${FERT}59 50% 100%)`;
          } else if (hasWater) {
            background = `${WATER}59`;
          } else if (hasFert) {
            background = `${FERT}59`;
          } else if (isTarget) {
            background = '#1a3a4a';
          }

          let border = 'none';
          if (isSelected) border = '2px solid #fff';
          else if (isTarget) border = `1px dashed ${WATER}`;
          else if (hasCheck && !hasWater && !hasFert) border = `2px solid ${OLIVE}`;
          else if (isToday(day)) border = '1px solid #4caf50';

          const numberColor = isFuture
            ? '#3a5a3a'
            : hasWater || hasFert
              ? '#fff'
              : hasCheck
                ? OLIVE
                : '#a8c5a0';

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayTap(day)}
              style={{
                aspectRatio: '1', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '2px',
                borderRadius: '50%', background, border, boxSizing: 'border-box',
                color: numberColor, fontSize: '13px',
                fontWeight: dots.length ? '700' : '400',
                cursor: isFuture ? 'default' : 'pointer',
              }}
            >
              <span style={{ lineHeight: 1 }}>{format(day, 'd')}</span>
              <span style={{ display: 'flex', gap: '2px', height: '5px', alignItems: 'center' }}>
                {dots.slice(0, 3).map((dot, i) => (
                  <span
                    key={i}
                    style={{
                      width: '5px', height: '5px', borderRadius: '50%',
                      background: dot.hollow ? 'transparent' : dot.color,
                      border: dot.hollow ? `1px solid ${dot.color}` : 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                ))}
              </span>
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ color: '#6a8f6a', fontSize: '12px', marginBottom: '8px' }}>
            {format(selectedDay, 'EEEE, MMM d')}
          </div>
          {on('water', selectedDay).map(e => (
            <DayEntry key={`w-${e.id}`} color={WATER} icon="💧" text={`${e.by || 'Someone'} watered`} date={e.date} />
          ))}
          {on('fertilizer', selectedDay).map(e => (
            <DayEntry key={`f-${e.id}`} color={FERT} icon="🌿" text={`${e.by || 'Someone'} fertilized`} date={e.date} />
          ))}
          {on('check', selectedDay).map(e => (
            <DayEntry key={`c-${e.id}`} color={OLIVE} icon="✓" text={`${e.by || 'Someone'} checked`} date={e.date} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayEntry({ color, icon, text, date }) {
  return (
    <div style={{
      marginBottom: '6px', padding: '10px', background: '#0f1f0f',
      borderRadius: '10px', fontSize: '13px', color,
      display: 'flex', justifyContent: 'space-between', gap: '8px',
    }}>
      <span>{icon} {text}</span>
      <span style={{ color: '#6a8f6a' }}>{date ? format(date, 'h:mm a') : ''}</span>
    </div>
  );
}

function Legend({ color, label, hollow }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#6a8f6a', fontSize: '11px' }}>
      <span style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: hollow ? 'transparent' : color,
        border: hollow ? `1px solid ${color}` : 'none',
        boxSizing: 'border-box',
      }} />
      {label}
    </span>
  );
}

const navBtn = { background: 'none', border: 'none', color: '#a8c5a0', fontSize: '20px', cursor: 'pointer', padding: '4px 10px' };
