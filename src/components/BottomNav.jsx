export default function BottomNav({ currentScreen, activePlant, onHome, onPlant }) {
  const inPlantDetail = currentScreen === 'plant';

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#0f1f0f', borderTop: '1px solid #2d4a2d',
      display: 'flex', height: '68px', zIndex: 50,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <button
        onClick={onHome}
        style={{
          flex: 1, background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '4px', color: !inPlantDetail ? '#4caf50' : '#a8c5a0',
          fontSize: '10px', fontWeight: !inPlantDetail ? '700' : '400',
        }}
      >
        <span style={{ fontSize: '22px' }}>🌿</span>
        My Plants
      </button>

      {inPlantDetail && activePlant && (
        <button
          onClick={onPlant}
          style={{
            flex: 1, background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '4px', color: '#4caf50', fontSize: '10px', fontWeight: '700',
            borderLeft: '1px solid #2d4a2d',
            overflow: 'hidden',
          }}
        >
          <span style={{ fontSize: '22px' }}>🪴</span>
          <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activePlant.name}
          </span>
        </button>
      )}
    </div>
  );
}
