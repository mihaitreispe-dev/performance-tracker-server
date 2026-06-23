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

/**
 * Read the source's duration in seconds via ffprobe. Used by the
 * middle-frame thumbnail extractor so we can seek to half-way without
 * baking in a hard-coded offset. Returns 0 (caller falls back to a
 * frame-0 extract) when ffprobe can't determine duration — either
 * because the binary is missing, the source has no `format.duration`
 * tag, or stdout is unparseable.
 */
function probeDurationSeconds(sourcePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', sourcePath],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let stdout = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.on('error', () => resolve(0));
    proc.on('close', (code) => {
      if (code !== 0) return resolve(0);
      const parsed = parseFloat(stdout.trim());
      resolve(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
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
    // Mux the source audio into the HLS segments so the demo plays with its
    // original sound (e.g. a talking-head intro) — matching prod MediaConvert,
    // whose HLS outputs carry AudioDescriptions. A silent source just yields
    // video-only segments (ffmpeg has no audio stream to encode). The separate
    // video_audio.mp4 below is still emitted for the translation/STT pipeline.
    '-c:a',
    'aac',
    '-b:a',
    '128k',
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
 * Extract a single still from the midpoint of the source clip. Uses
 * `-ss <half_duration>` BEFORE `-i` for a fast keyframe seek (vs the
 * frame-accurate but slow form that puts -ss after -i). For a tile
 * thumbnail, keyframe-accurate is plenty — we just want "something
 * recognisable from the middle of the rep", not a specific frame.
 *
 * The crop is centre-crop (mode='crop') instead of letterbox-pad so
 * square tiles show a tightly framed subject instead of a black
 * letterbox. Falls back to a frame-0 extract via `extractStill` when
 * ffprobe can't read the duration (binary missing, unparseable
 * output, zero-length source) — never throws on its own; the caller
 * always gets a file at outPath.
 */
async function extractMiddleSquareStill(
  sourcePath: string,
  outPath: string,
  size: number,
): Promise<void> {
  const duration = await probeDurationSeconds(sourcePath);
  if (duration <= 0) {
    // No duration — extract from frame 0 with centre-crop so the tile
    // still has the right aspect, even if it's not "from the middle".
    await runFfmpeg([
      '-y',
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-vf',
      fitFilter(size, size, 'crop'),
      '-q:v',
      '2',
      outPath,
    ]);
    return;
  }
  const seekSeconds = duration / 2;
  await runFfmpeg([
    '-y',
    // -ss BEFORE -i = fast keyframe seek (acceptable for a thumbnail).
    '-ss',
    seekSeconds.toFixed(3),
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    '-vf',
    fitFilter(size, size, 'crop'),
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

  // Posters + thumbnails for both orientations, both extracted from
  // frame 0 so they line up with what MediaConvert produces in prod.
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

  // Square thumbnail from the MIDDLE of the clip — used by every
  // square-tile surface (workout-detail rows, prep "What you'll do"
  // list, preview segment rows, NextPreviewTile). Frame 0 is often
  // a black letterbox or a setup pose; midpoint usually catches the
  // athlete mid-rep so the tile reads as the exercise itself, not
  // an empty stage. Centre-crop (not pad) keeps the subject in
  // frame instead of letterboxing a portrait/landscape source into
  // a square with black bars.
  const squareThumbPath = join(workDir, 'thumb_square.jpg');
  await extractMiddleSquareStill(sourcePath, squareThumbPath, 480);
  artifacts.push({
    relKey: 'square/video_thumbnail.0000000.jpg',
    localPath: squareThumbPath,
    contentType: 'image/jpeg',
  });

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

/**
 * Produce a single 9:16 mp4 companion for a snack from its uploaded
 * source. Snacks are short coached clips delivered over HTTP Range
 * — no need for the full HLS dance the exercise pipeline runs. Audio
 * is preserved (unlike the silent exercise demos), centre-crop is the
 * fit (`crop` mode) so the typical subject in the centre stays visible
 * instead of getting letterboxed into a stamp. `+faststart` puts the
 * moov atom at the head so the browser can seek immediately.
 *
 * Returns the path to the produced file; caller uploads + sets the
 * resulting key on content_items.video_portrait_s3_*.
 */
export async function transcodeSnackPortrait(opts: {
  sourcePath: string;
  outPath: string;
}): Promise<string> {
  await runFfmpeg([
    '-y',
    '-i',
    opts.sourcePath,
    '-vf',
    fitFilter(720, 1280, 'crop'),
    '-c:v',
    'libx264',
    '-profile:v',
    'main',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    opts.outPath,
  ]);
  return opts.outPath;
}
