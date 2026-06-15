const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

exports.sendWateringReminders = onSchedule('0 * * * *', async () => {
  const now = new Date();

  const usersSnap = await db.collection('users')
    .where('notifications.enabled', '==', true)
    .get();

  for (const userDoc of usersSnap.docs) {
    try {
      const userData = userDoc.data();
      const notif = userData.notifications || {};
      if (!notif.fcmToken) continue;

      // Check if it's the right hour in the user's timezone
      const timezone = notif.timezone || 'America/Los_Angeles';
      const currentHour = parseInt(
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }).format(now),
        10
      );
      const targetHour = notif.time === 'evening' ? 18 : 9;
      if (currentHour !== targetHour) continue;

      const householdId = userData.householdId;
      if (!householdId) continue;

      // Get all plants for this household
      const plantsSnap = await db.collection('plants')
        .where('householdId', '==', householdId)
        .get();

      const thirstyPlants = [];

      for (const plantDoc of plantsSnap.docs) {
        const plant = { id: plantDoc.id, ...plantDoc.data() };
        if (!plant.waterIntervalDays) continue;

        // If a check pushed the schedule, use the override date
        if (plant.nextWateringOverride) {
          const overrideDate = plant.nextWateringOverride.toDate();
          overrideDate.setHours(0, 0, 0, 0);
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const daysUntil = Math.round((overrideDate - today) / (1000 * 60 * 60 * 24));
          if (daysUntil <= 0) thirstyPlants.push({ name: plant.name, overdue: daysUntil < 0 });
          continue;
        }

        // Get all watering logs for this plant, sort to find most recent
        const logsSnap = await db.collection('wateringLogs')
          .where('plantId', '==', plant.id)
          .get();

        if (logsSnap.empty) {
          thirstyPlants.push({ name: plant.name, overdue: true });
          continue;
        }

        const logs = logsSnap.docs.map(d => d.data());
        logs.sort((a, b) => (b.wateredAt?.seconds ?? 0) - (a.wateredAt?.seconds ?? 0));
        const lastWater = logs[0].wateredAt?.toDate();
        if (!lastWater) continue;

        const lastDay = new Date(lastWater); lastDay.setHours(0, 0, 0, 0);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const daysSince = Math.round((today - lastDay) / (1000 * 60 * 60 * 24));
        const daysUntil = plant.waterIntervalDays - daysSince;

        if (daysUntil <= 0) thirstyPlants.push({ name: plant.name, overdue: daysUntil < 0 });
      }

      if (thirstyPlants.length === 0) continue;

      // Very Thirsty plants first, then due today
      thirstyPlants.sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0));
      const plantList = thirstyPlants
        .map(p => p.overdue ? `${p.name} (Very Thirsty)` : p.name)
        .join(', ');

      await admin.messaging().send({
        token: notif.fcmToken,
        notification: {
          title: 'Your Plants Are Thirsty! 🌿',
          body: `Begging to be quenched: ${plantList}`,
        },
        webpush: {
          fcmOptions: { link: 'https://thirst-trap-15acc.web.app' },
          notification: {
            icon: 'https://thirst-trap-15acc.web.app/icon.png',
            badge: 'https://thirst-trap-15acc.web.app/icon.png',
          },
        },
      });

      console.log(`Notified ${userDoc.id}: ${thirstyPlants.length} thirsty plant(s)`);

    } catch (err) {
      // Stale token — clear it so we stop trying
      if (err.code === 'messaging/registration-token-not-registered') {
        await userDoc.ref.update({ 'notifications.fcmToken': admin.firestore.FieldValue.delete() });
        console.log(`Cleared stale token for ${userDoc.id}`);
      } else {
        console.error(`Failed for user ${userDoc.id}:`, err.message);
      }
    }
  }
});
