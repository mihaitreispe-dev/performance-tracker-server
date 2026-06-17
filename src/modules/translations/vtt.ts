/**
 * Render plain text into a WebVTT caption track.
 *
 * We don't have per-word timing for the *translated* text (Transcribe's
 * timing is for the source language, and authored cue scripts have
 * none), so we segment into short readable chunks and pace them evenly.
 * When the media duration is known the chunks are spread across it;
 * otherwise we fall back to a fixed reading pace. This produces a
 * legible, paced track — not frame-accurate alignment, which is a
 * later refinement (translate each source-VTT cue in place).
 */
const WORDS_PER_CUE = 12;
const SECONDS_PER_CUE_FALLBACK = 3.2;

function formatTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

/** Split text into ~WORDS_PER_CUE-word chunks, preferring sentence ends. */
function chunkText(text: string): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const chunks: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    const longEnough = current.length >= WORDS_PER_CUE;
    const sentenceEnd = /[.!?]$/.test(word) && current.length >= Math.ceil(WORDS_PER_CUE / 2);
    if (longEnough || sentenceEnd) {
      chunks.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) chunks.push(current.join(' '));
  return chunks;
}

export function buildVttFromText(text: string, durationSeconds: number | null): string {
  const chunks = chunkText(text);
  if (chunks.length === 0) return 'WEBVTT\n';

  const perCue =
    durationSeconds && durationSeconds > 0
      ? durationSeconds / chunks.length
      : SECONDS_PER_CUE_FALLBACK;

  const lines: string[] = ['WEBVTT', ''];
  chunks.forEach((chunk, i) => {
    const start = i * perCue;
    const end = (i + 1) * perCue;
    lines.push(`${formatTimestamp(start)} --> ${formatTimestamp(end)}`);
    lines.push(chunk);
    lines.push('');
  });
  return lines.join('\n');
}
