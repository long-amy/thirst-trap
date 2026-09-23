const TABS = [
  { key: 'plants', icon: '🌿', label: 'My Plants' },
  { key: 'families', icon: '🌳', label: 'Families' },
];

export default function BottomNav({ current, onNavigate }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#0f1f0f', borderTop: '1px solid #2d4a2d',
      display: 'flex', height: '64px', zIndex: 40,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {TABS.map(tab => {
        const active = current === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onNavigate(tab.key)}
            style={{
              flex: 1, background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '3px', color: active ? '#4caf50' : '#6a8f6a',
              fontSize: '10px', fontWeight: active ? '700' : '400',
            }}
          >
            <span style={{ fontSize: '21px', opacity: active ? 1 : 0.7 }}>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
