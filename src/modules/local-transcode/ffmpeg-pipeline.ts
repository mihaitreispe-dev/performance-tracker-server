/**
 * Pure ffmpeg pipeline — no Nest, no S3, no DB — so it can be shared by the
 * injectable LocalTranscodeService (the automatic, upload-triggered path) and
 * the standalone local-transcode-exercise.ts backfill script.
 *
 * Produces the same artifact set AWS MediaConvert writes, keyed *relative* to
 * the exercise content base (s3Keys.content.exercise().base); the caller
 * prepends the base + bucket. Smart crop has no local equivalent, so
 * `wideMode` controls how the 16:9 frame is filled:
 *   pad  : letterbox (matches the server's no-crop default)
 *   crop : centre-crop to fill (approximates a smart-crop result)
 */
import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type WideMode = 'pad' | 'crop';

export interface TranscodeArtifact {
  /** Key relative to the content base, e.g. 'video.m3u8', 'wide/segment0.ts', 'video_poster.0000000.jpg'. */
  relKey: string;
  localPath: string;
  contentType: string;
}

export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.split('\n').slice(-5).join(' ').slice(0, 300)}`));
    });
  });
}

/** Fit the source into WxH, then either letterbox (pad) or centre-crop (crop). */
function fitFilter(width: number, height: number, mode: WideMode): string {
  if (mode === 'crop') {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
}

async function transcodeOrientation(opts: {
  sourcePath: string;
  outDir: string;
  width: number;
  height: number;
  mode: WideMode;
}): Promise<void> {
  await mkdir(opts.outDir, { recursive: true });
  await runFfmpeg([
    '-y',
    '-i',
    opts.sourcePath,
    '-vf',
    fitFilter(opts.width, opts.height, opts.mode),
    '-c:v',
    'libx264',
    '-profile:v',
    'main',
    '-pix_fmt',
    'yuv420p',
    '-an', // HLS variant is video-only; audio ships as a separate track
    '-start_number',
    '0',
    '-hls_time',
    '6',
    '-hls_list_size',
    '0',
    '-hls_segment_filename',
    join(opts.outDir, 'segment%d.ts'),
    '-f',
    'hls',
    join(opts.outDir, 'video.m3u8'),
  ]);
}

async function extractStill(sourcePath: string, outPath: string, width: number, height: number): Promise<void> {
  await runFfmpeg([
    '-y',
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    '-vf',
    fitFilter(width, height, 'pad'),
    '-q:v',
    '2',
    outPath,
  ]);
}

/**
 * Transcode a source clip into both orientations + posters + thumbnails +
 * audio. Returns the artifacts to upload (relative keys). Audio is
 * best-effort — silent demo clips simply omit it.
 */
export async function transcodeExerciseSource(opts: {
  sourcePath: string;
  workDir: string;
  wideMode: WideMode;
}): Promise<TranscodeArtifact[]> {
  const { sourcePath, workDir, wideMode } = opts;
  const artifacts: TranscodeArtifact[] = [];

  // 9:16 portrait (letterbox — the source orientation) and 16:9 wide.
  const portraitDir = join(workDir, 'portrait');
  const wideDir = join(workDir, 'wide');
  await transcodeOrientation({ sourcePath, outDir: portraitDir, width: 720, height: 1280, mode: 'pad' });
  await transcodeOrientation({ sourcePath, outDir: wideDir, width: 1280, height: 720, mode: wideMode });

  await pushHls(artifacts, portraitDir, '');
  await pushHls(artifacts, wideDir, 'wide/');

  // Posters + thumbnails for both orientations.
  const stills: Array<{ rel: string; file: string; w: number; h: number }> = [
    { rel: 'video_poster.0000000.jpg', file: 'poster.jpg', w: 720, h: 1280 },
    { rel: 'video_thumbnail.0000000.jpg', file: 'thumb.jpg', w: 180, h: 320 },
    { rel: 'wide/video_poster.0000000.jpg', file: 'poster_wide.jpg', w: 1280, h: 720 },
    { rel: 'wide/video_thumbnail.0000000.jpg', file: 'thumb_wide.jpg', w: 320, h: 180 },
  ];
  for (const still of stills) {
    const localPath = join(workDir, still.file);
    await extractStill(sourcePath, localPath, still.w, still.h);
    artifacts.push({ relKey: still.rel, localPath, contentType: 'image/jpeg' });
  }

  // Separate audio track (best-effort).
  try {
    const audioPath = join(workDir, 'audio.mp4');
    await runFfmpeg(['-y', '-i', sourcePath, '-vn', '-c:a', 'aac', '-b:a', '128k', audioPath]);
    artifacts.push({ relKey: 'video_audio.mp4', localPath: audioPath, contentType: 'audio/mp4' });
  } catch {
    // No audio stream — fine for silent demo loops.
  }

  return artifacts;
}

/** Add an HLS dir's playlist + segments as artifacts under `prefix`. */
async function pushHls(artifacts: TranscodeArtifact[], dir: string, prefix: string): Promise<void> {
  artifacts.push({ relKey: `${prefix}video.m3u8`, localPath: join(dir, 'video.m3u8'), contentType: 'application/vnd.apple.mpegurl' });
  const segments = (await readdir(dir)).filter((f) => f.endsWith('.ts'));
  for (const seg of segments) {
    artifacts.push({ relKey: `${prefix}${seg}`, localPath: join(dir, seg), contentType: 'video/mp2t' });
  }
}
