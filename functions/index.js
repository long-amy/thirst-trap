const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const Anthropic = require('@anthropic-ai/sdk');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Stored in Google Secret Manager, never in the client bundle. Set with:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const HEALTH_SYSTEM_PROMPT =
  'You are a plant health expert. The user will share a photo of their plant and ' +
  "optionally describe what they're seeing. Respond in 2-3 short plain text sentences " +
  '- no markdown, no bullet points, no headers. Give a quick diagnosis and one or two ' +
  'specific actions to take.';

/**
 * Analyzes a plant photo that has already been uploaded to Storage.
 *
 * The photo is passed by path rather than as base64: callable requests cap at 10MB
 * and base64 inflates a file by ~33%, so large phone photos would fail. Reading the
 * file here with the Admin SDK removes that ceiling.
 */
exports.analyzePlantHealth = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You need to be signed in.');
    }

    const { storagePath, note } = request.data ?? {};
    if (typeof storagePath !== 'string' || !storagePath) {
      throw new HttpsError('invalid-argument', 'storagePath is required.');
    }

    // Authorize against the caller's household rather than trusting the path.
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    const householdId = userSnap.get('householdId');
    if (!householdId) {
      throw new HttpsError('failed-precondition', 'Join a household first.');
    }
    if (storagePath.includes('..') || !storagePath.startsWith(`health/${householdId}/`)) {
      throw new HttpsError('permission-denied', 'That photo is not in your household.');
    }

    const file = admin.storage().bucket().file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError('not-found', 'Photo not found.');
    }

    const [metadata] = await file.getMetadata();
    const mediaType = metadata.contentType;
    if (!ALLOWED_IMAGE_TYPES.includes(mediaType)) {
      throw new HttpsError('invalid-argument', 'That file is not a supported image.');
    }
    if (Number(metadata.size) > MAX_IMAGE_BYTES) {
      throw new HttpsError(
        'invalid-argument',
        'That photo is too large to analyze. Try one under 5 MB.',
      );
    }

    const [buffer] = await file.download();

    const content = [
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') },
      },
    ];
    if (typeof note === 'string' && note.trim()) {
      content.push({ type: 'text', text: note.trim().slice(0, 2000) });
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    let response;
    try {
      response = await client.beta.messages.create({
        model: 'claude-opus-5',
        max_tokens: 4000,
        // Adaptive thinking is on by default; low effort keeps a short vision
        // task from spending tokens it doesn't need.
        output_config: { effort: 'low' },
        // If a safety classifier declines, the API retries on a fallback model
        // in the same call instead of returning nothing. Safe to drop.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: HEALTH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      });
    } catch (err) {
      console.error('Claude request failed', err);
      if (err instanceof Anthropic.RateLimitError) {
        throw new HttpsError('resource-exhausted', 'Too many requests right now. Try again shortly.');
      }
      if (err instanceof Anthropic.AuthenticationError) {
        throw new HttpsError('internal', 'The plant expert is misconfigured. Check the API key.');
      }
      throw new HttpsError('internal', 'Analysis failed. Try again.');
    }

    if (response.stop_reason === 'refusal') {
      throw new HttpsError('failed-precondition', "Claude declined to analyze that photo.");
    }

    // content is a mix of block types (thinking blocks included) - take the text.
    const analysis = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();

    if (!analysis) {
      throw new HttpsError('internal', 'Got an empty analysis back. Try again.');
    }

    return { analysis };
  },
);

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
        if (plant.archived) continue;
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
