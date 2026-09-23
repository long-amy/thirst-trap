import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const callAnalyze = httpsCallable(functions, 'analyzePlantHealth', { timeout: 120000 });

/**
 * Asks Claude to diagnose a plant photo.
 *
 * The photo is uploaded to Storage first and passed here by path — the API key
 * lives in Secret Manager and is only ever read by the Cloud Function, so it
 * never reaches the browser bundle.
 */
export async function analyzePlantHealth(storagePath, userNote) {
  let result;
  try {
    result = await callAnalyze({ storagePath, note: userNote ?? '' });
  } catch (err) {
    // Callable errors carry the function's message in err.message.
    throw new Error(err?.message || 'Analysis failed. Try again.', { cause: err });
  }

  const raw = result?.data?.analysis;
  if (!raw) throw new Error('Analysis came back empty. Try again.');

  // Strip markdown so it renders as clean plain text
  return raw
    .replace(/#{1,6}\s+/g, '')           // ## headings
    .replace(/\*\*(.*?)\*\*/g, '$1')     // **bold**
    .replace(/\*(.*?)\*/g, '$1')         // *italic*
    .replace(/`([^`]*)`/g, '$1')         // `code`
    .replace(/^[-*]\s+/gm, '')           // - bullet points
    .replace(/\n{3,}/g, '\n\n')          // collapse extra blank lines
    .trim();
}
