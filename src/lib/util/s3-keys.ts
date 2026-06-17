export const s3Keys = {
  upload: {
    exercise: ({ visitorId, filename }: { visitorId: string; filename: string }) => ({
      video: `exercises/${visitorId}/${filename}`,
    }),
    /**
     * Per-exercise voice-over recording. Lives under the same per-user
     * uploads prefix as the video so storage policies / cleanup tasks
     * cover it uniformly. `voiceover-` filename prefix keeps it
     * trivially distinguishable from the video file in S3 console
     * listings.
     */
    exerciseVoiceover: ({
      visitorId,
      exerciseId,
      filename,
    }: {
      visitorId: string;
      exerciseId: string;
      filename: string;
    }) => ({
      audio: `exercises/${visitorId}/${exerciseId}/voiceover-${filename}`,
    }),
    workoutImport: ({ userId, filename }: { userId: string; filename: string }) => ({
      file: `workout-imports/${userId}/${filename}`,
    }),
    contentItem: ({
      organisationId,
      contentItemId,
      filename,
    }: {
      organisationId: string;
      contentItemId: string;
      filename: string;
    }) => ({
      video: `content-items/${organisationId}/${contentItemId}/${filename}`,
      thumbnail: `content-items/${organisationId}/${contentItemId}/thumbnail-${filename}`,
    }),
    courseCover: ({
      organisationId,
      courseId,
      filename,
    }: {
      organisationId: string;
      courseId: string;
      filename: string;
    }) => ({
      cover: `courses/${organisationId}/${courseId}/cover-${filename}`,
    }),
    organisationLogo: ({
      organisationId,
      filename,
    }: {
      organisationId: string;
      filename: string;
    }) => ({
      logo: `organisations/${organisationId}/logo-${filename}`,
    }),
    organisationFavicon: ({
      organisationId,
      filename,
    }: {
      organisationId: string;
      filename: string;
    }) => ({
      favicon: `organisations/${organisationId}/favicon-${filename}`,
    }),
  },
  content: {
    exercise: ({ userId, exerciseId }: { userId: string; exerciseId: string }) => {
      const base = `exercises/${userId}/${exerciseId}`;
      const wide = `${base}/wide`;
      const square = `${base}/square`;
      return {
        base,
        // 9:16 portrait (primary) — historical layout, unchanged.
        video: `${base}/video.m3u8`,
        audio: `${base}/video_audio.mp4`,
        poster: `${base}/video_poster.0000000.jpg`,
        thumbnail: `${base}/video_thumbnail.0000000.jpg`,
        // 16:9 wide companion — mirrors the portrait layout under wide/.
        videoWide: `${wide}/video.m3u8`,
        posterWide: `${wide}/video_poster.0000000.jpg`,
        thumbnailWide: `${wide}/video_thumbnail.0000000.jpg`,
        // 1:1 square companion extracted from the MIDDLE of the clip
        // (not frame 0), so listing surfaces that render square tiles
        // (workout-detail rows, the prep "What you'll do" list, the
        // player preview segment list, NextPreviewTile) show a
        // recognisable frame instead of the first letterbox of black
        // before motion starts. Lives under square/ to mirror the
        // wide/ rendition layout.
        thumbnailSquare: `${square}/video_thumbnail.0000000.jpg`,
      };
    },
    /**
     * Per-(target, locale) translation outputs. Keyed by the same
     * (target_type, target_id, locale) triple as the content_translations
     * row so a row's outputs are derivable without extra columns:
     *   translations/{targetType}/{targetId}/{locale}/captions.vtt
     *   translations/{targetType}/{targetId}/{locale}/voiceover.mp3
     */
    translation: ({
      targetType,
      targetId,
      locale,
    }: {
      targetType: string;
      targetId: string;
      locale: string;
    }) => {
      const base = `translations/${targetType}/${targetId}/${locale}`;
      return {
        base,
        captionVtt: `${base}/captions.vtt`,
        dubbedAudio: `${base}/voiceover.mp3`,
      };
    },
  },
  dataImportArchive: (userId: string, importType: string, filename: string) =>
    `data-imports/${userId}/${importType}/${Date.now()}_${filename}`,
  dataExport: (userId: string, jobId: string, filename: string) => `data-exports/${userId}/${jobId}/${filename}`,
};
