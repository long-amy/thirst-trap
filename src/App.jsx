import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import LoginScreen from './screens/LoginScreen';
import HouseholdSetupScreen from './screens/HouseholdSetupScreen';
import HomeScreen from './screens/HomeScreen';
import PlantDetailScreen from './screens/PlantDetailScreen';

export default function App() {
  const { user, household, loading } = useAuth();
  const [selectedPlant, setSelectedPlant] = useState(null);

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
    />
  );

  return (
    <HomeScreen
      user={user}
      household={household}
      onSelectPlant={setSelectedPlant}
    />
  );
}
