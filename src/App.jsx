import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import LoginScreen from './screens/LoginScreen';
import HouseholdSetupScreen from './screens/HouseholdSetupScreen';
import HomeScreen from './screens/HomeScreen';
import FamiliesScreen from './screens/FamiliesScreen';
import PlantDetailScreen from './screens/PlantDetailScreen';
import BottomNav from './components/BottomNav';
import { useBackGuard } from './hooks/useBackGuard';

export default function App() {
  const { user, household, loading } = useAuth();
  const [tab, setTab] = useState('plants');
  const [selectedPlant, setSelectedPlant] = useState(null);

  // Android back gesture: leave the plant, or fall back to the Plants tab,
  // rather than closing the app outright.
  useBackGuard(!!selectedPlant, () => setSelectedPlant(null));
  useBackGuard(!selectedPlant && tab !== 'plants', () => setTab('plants'));

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh', background: '#0f1f0f',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ textAlign: 'center', color: '#a8c5a0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌿</div>
          <p style={{ margin: 0 }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  if (!household) return <HouseholdSetupScreen user={user} />;

  if (selectedPlant) return (
    <PlantDetailScreen
      plant={selectedPlant}
      user={user}
      household={household}
      onBack={() => setSelectedPlant(null)}
      onPlantUpdate={setSelectedPlant}
      onSelectPlant={setSelectedPlant}
    />
  );

  return (
    <>
      {tab === 'plants' ? (
        <HomeScreen
          user={user}
          household={household}
          onSelectPlant={setSelectedPlant}
        />
      ) : (
        <FamiliesScreen
          user={user}
          household={household}
          onSelectPlant={setSelectedPlant}
        />
      )}
      <BottomNav current={tab} onNavigate={setTab} />
    </>
  );
}
