import { useState, useRef, useEffect } from 'react';
import CareTab from '../components/CareTab';
import FamilyTab from '../components/FamilyTab';
import HealthTab from '../components/HealthTab';
import EditPlantModal from '../components/EditPlantModal';
import ArchivePlantModal from '../components/ArchivePlantModal';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { db, storage } from '../lib/firebase';
import { archiveReasonLabel } from '../lib/archive';
import { useBackGuard } from '../hooks/useBackGuard';

const TABS = [
  { key: 'care', label: '💧 Care' },
  { key: 'family', label: '🌳 Family' },
  { key: 'health', label: '🔍 Health' },
];

export default function PlantDetailScreen({ plant, user, household, onBack, onPlantUpdate, onSelectPlant }) {
  const [tab, setTab] = useState('care');
  const [showArchive, setShowArchive] = useState(false);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notes, setNotes] = useState(plant.notes ?? '');
  const photoInputRef = useRef();

  useBackGuard(showDeleteConfirm, () => setShowDeleteConfirm(false));
  useBackGuard(menuOpen, () => setMenuOpen(false));

  // Close menu on outside tap
  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => setMenuOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpen]);

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpdatingPhoto(true);
    try {
      const storageRef = ref(storage, `plants/${household.id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'plants', plant.id), { photoUrl: url });
      onPlantUpdate({ ...plant, photoUrl: url });
    } catch (err) {
      console.error('Photo update failed', err);
    }
    setUpdatingPhoto(false);
  }

  async function saveNotes(value) {
    await updateDoc(doc(db, 'plants', plant.id), { notes: value });
    onPlantUpdate({ ...plant, notes: value });
  }

  async function unarchive() {
    const patch = {
      archived: false,
      archivedAt: deleteField(),
      archiveReason: deleteField(),
      archiveNote: deleteField(),
      archivedBy: deleteField(),
    };
    await updateDoc(doc(db, 'plants', plant.id), patch);
    onPlantUpdate({ ...plant, archived: false, archivedAt: null, archiveReason: null, archiveNote: null, archivedBy: null });
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'plants', plant.id));
      onBack();
    } catch (err) {
      console.error('Delete failed', err);
      setDeleting(false);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#0f1f0f', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: '24px' }}>
      {/* Header banner */}
      <div style={{ position: 'relative', height: '220px', background: '#1a2e1a' }}>
        {plant.photoUrl ? (
          <img src={plant.photoUrl} alt={plant.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px' }}>🌿</div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(15,31,15,0.9) 100%)' }} />

        {/* Back */}
        <button
          onClick={onBack}
          style={{
            position: 'absolute', top: '16px', left: '16px',
            background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '10px',
            color: '#fff', padding: '8px 12px', cursor: 'pointer', fontSize: '18px', lineHeight: 1,
          }}
        >
          ←
        </button>

        {/* Top-right actions */}
        <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px' }}>
          {/* Photo */}
          <label style={{
            background: 'rgba(0,0,0,0.5)', borderRadius: '10px',
            color: '#fff', padding: '8px 10px', cursor: 'pointer', fontSize: '16px', lineHeight: 1,
          }}>
            {updatingPhoto ? '⏳' : '📷'}
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
          </label>

          {/* Kebab */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
              style={{
                background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '10px',
                color: '#fff', padding: '8px 10px', cursor: 'pointer', fontSize: '18px', lineHeight: 1,
              }}
            >
              ⋮
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute', top: '40px', right: 0,
                background: '#1a2e1a', border: '1px solid #2d4a2d', borderRadius: '12px',
                overflow: 'hidden', zIndex: 50, minWidth: '140px',
              }}>
                <button onClick={() => { setMenuOpen(false); setShowEdit(true); }} style={menuItem}>
                  ✏️ Edit plant
                </button>
                {plant.archived ? (
                  <button onClick={() => { setMenuOpen(false); unarchive(); }} style={menuItem}>
                    ↩️ Unarchive
                  </button>
                ) : (
                  <button onClick={() => { setMenuOpen(false); setShowArchive(true); }} style={menuItem}>
                    📦 Archive plant
                  </button>
                )}
                <button onClick={() => { setMenuOpen(false); setShowDeleteConfirm(true); }} style={{ ...menuItem, color: '#ff6b6b' }}>
                  🗑️ Delete plant
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: '16px', left: '16px', right: '16px' }}>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: '700', margin: '0 0 4px' }}>{plant.name}</h1>
          {plant.location && <p style={{ color: '#a8c5a0', margin: 0, fontSize: '14px' }}>📍 {plant.location}</p>}
        </div>
      </div>

      {plant.archived && (
        <div style={{
          background: '#2a2312', borderBottom: '1px solid #8a7030',
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ fontSize: '18px' }}>📦</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#e0c070', fontSize: '13px', fontWeight: '700' }}>
              Archived — {archiveReasonLabel(plant)}
            </div>
            {plant.archiveNote && (
              <div style={{ color: '#a8c5a0', fontSize: '12px', marginTop: '2px' }}>{plant.archiveNote}</div>
            )}
          </div>
          <button
            onClick={unarchive}
            style={{ background: 'transparent', border: '1px solid #8a7030', borderRadius: '8px', color: '#e0c070', fontSize: '12px', padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}
          >
            Unarchive
          </button>
        </div>
      )}

      {/* Notes */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1a2e1a' }}>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={e => saveNotes(e.target.value)}
          placeholder="Add a note about this plant…"
          rows={2}
          style={{
            width: '100%', background: 'transparent', border: 'none',
            color: notes ? '#d0e8d0' : '#6a8f6a', fontSize: '14px', resize: 'none',
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: '1.5',
          }}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #2d4a2d', background: '#0f1f0f', position: 'sticky', top: 0, zIndex: 5 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '13px 4px', background: 'none', border: 'none',
              color: tab === t.key ? '#4caf50' : '#a8c5a0',
              fontWeight: tab === t.key ? '700' : '400',
              fontSize: '13px', cursor: 'pointer',
              borderBottom: tab === t.key ? '2px solid #4caf50' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'care' && <CareTab plant={plant} user={user} household={household} onPlantUpdate={onPlantUpdate} />}
      {tab === 'family' && (
        <FamilyTab
          plant={plant}
          user={user}
          household={household}
          onPlantUpdate={onPlantUpdate}
          onSelectPlant={onSelectPlant}
        />
      )}
      {tab === 'health' && <HealthTab plant={plant} user={user} household={household} />}

      {/* Edit modal */}
      {showEdit && (
        <EditPlantModal
          plant={plant}
          onClose={() => setShowEdit(false)}
          onSave={onPlantUpdate}
        />
      )}

      {showArchive && (
        <ArchivePlantModal
          plant={plant}
          user={user}
          onClose={() => setShowArchive(false)}
          onArchived={onPlantUpdate}
        />
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          <div style={{ background: '#1a2e1a', borderRadius: '16px', padding: '24px', border: '1px solid #2d4a2d', maxWidth: '320px', width: '100%' }}>
            <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: '18px' }}>Delete {plant.name}?</h3>
            <p style={{ color: '#a8c5a0', margin: '0 0 20px', fontSize: '14px' }}>
              This can't be undone. Watering and health logs will be kept.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #2d4a2d', borderRadius: '10px', color: '#a8c5a0', fontSize: '15px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ flex: 1, padding: '12px', background: '#c0392b', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const menuItem = {
  display: 'block', width: '100%', padding: '12px 16px', background: 'none',
  border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer',
  textAlign: 'left', borderBottom: '1px solid #2d4a2d',
};
