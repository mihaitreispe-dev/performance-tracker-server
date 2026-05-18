export const s3Keys = {
  upload: {
    exercise: ({ visitorId, filename }: { visitorId: string; filename: string }) => ({
      video: `exercises/${visitorId}/${filename}`,
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
  },
  content: {
    exercise: ({ userId, exerciseId }: { userId: string; exerciseId: string }) => {
      const base = `exercises/${userId}/${exerciseId}`;
      return {
        base,
        video: `${base}/video.m3u8`,
        audio: `${base}/video_audio.mp4`,
        poster: `${base}/video_poster.0000000.jpg`,
        thumbnail: `${base}/video_thumbnail.0000000.jpg`,
      };
    },
  },
  dataImportArchive: (userId: string, importType: string, filename: string) =>
    `data-imports/${userId}/${importType}/${Date.now()}_${filename}`,
  dataExport: (userId: string, jobId: string, filename: string) => `data-exports/${userId}/${jobId}/${filename}`,
};
