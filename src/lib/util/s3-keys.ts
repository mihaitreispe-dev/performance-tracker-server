export const s3Keys = {
  upload: {
    exercise: ({ visitorId, filename }: { visitorId: string; filename: string }) => ({
      video: `exercises/${visitorId}/${filename}`,
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
};
