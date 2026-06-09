import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export function useAuth() {
  const [user, setUser] = useState(undefined);
  const [household, setHousehold] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubHousehold = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubHousehold) { unsubHousehold(); unsubHousehold = null; }

      if (!firebaseUser) {
        setUser(null);
        setHousehold(null);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (profileSnap.exists() && profileSnap.data().householdId) {
        const householdRef = doc(db, 'households', profileSnap.data().householdId);
        unsubHousehold = onSnapshot(householdRef, snap => {
          setHousehold(snap.exists() ? { id: snap.id, ...snap.data() } : null);
          setLoading(false);
        });
      } else {
        setHousehold(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubHousehold) unsubHousehold();
    };
  }, []);

  return { user, household, loading };
}
