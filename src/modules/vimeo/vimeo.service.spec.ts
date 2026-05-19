import { UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import { VimeoService, type VimeoProgressiveRendition, type VimeoVideoMetadata } from './vimeo.service';

describe('VimeoService', () => {
  let service: VimeoService;
  let configService: { vimeoAccessToken: string | undefined };

  beforeEach(() => {
    configService = { vimeoAccessToken: 'test-token-abc' };
    service = new VimeoService(configService as unknown as AppConfigService);
  });

  describe('parseVideoId', () => {
    it('accepts a raw numeric id', () => {
      expect(service.parseVideoId('76979871')).toBe('76979871');
    });

    it('trims whitespace around a numeric id', () => {
      expect(service.parseVideoId('  76979871  ')).toBe('76979871');
    });

    it('parses vimeo.com/{id} URL', () => {
      expect(service.parseVideoId('https://vimeo.com/76979871')).toBe('76979871');
    });

    it('parses vimeo.com/{id} URL without protocol', () => {
      expect(service.parseVideoId('vimeo.com/76979871')).toBe('76979871');
    });

    it('parses player.vimeo.com/video/{id}', () => {
      expect(service.parseVideoId('https://player.vimeo.com/video/76979871')).toBe('76979871');
    });

    it('throws on a non-vimeo URL', () => {
      expect(() => service.parseVideoId('https://youtube.com/watch?v=abc')).toThrow(
        UnprocessableEntityException,
      );
    });

    it('throws on garbage input', () => {
      expect(() => service.parseVideoId('not-a-video')).toThrow(UnprocessableEntityException);
    });
  });

  describe('pickRendition', () => {
    const renditions: VimeoProgressiveRendition[] = [
      { rendition: '1440p', width: 2560, height: 1440, link: 'https://1440.example/file.mp4', type: 'video/mp4' },
      { rendition: '1080p', width: 1920, height: 1080, link: 'https://1080.example/file.mp4', type: 'video/mp4' },
      { rendition: '720p', width: 1280, height: 720, link: 'https://720.example/file.mp4', type: 'video/mp4' },
      { rendition: '540p', width: 960, height: 540, link: 'https://540.example/file.mp4', type: 'video/mp4' },
    ];
    const meta = (overrides: Partial<VimeoVideoMetadata> = {}): VimeoVideoMetadata => ({
      id: '1',
      name: 'Demo',
      description: null,
      duration: 30,
      play: { progressive: renditions },
      ...overrides,
    });

    it('picks the highest rendition within maxHeight (default 1080)', () => {
      const picked = service.pickRendition(meta());
      expect(picked.rendition).toBe('1080p');
    });

    it('respects an explicit maxHeight cap', () => {
      const picked = service.pickRendition(meta(), 720);
      expect(picked.rendition).toBe('720p');
    });

    it('falls back to lowest rendition when all exceed maxHeight', () => {
      const picked = service.pickRendition(meta(), 480);
      expect(picked.rendition).toBe('540p');
    });

    it('throws when no progressive renditions exist (free Vimeo tier)', () => {
      expect(() => service.pickRendition(meta({ play: { progressive: [] } }))).toThrow(
        UnprocessableEntityException,
      );
    });

    it('throws when the play field is missing entirely', () => {
      expect(() => service.pickRendition(meta({ play: undefined }))).toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('pickThumbnail', () => {
    it('returns the first size at or above minWidth', () => {
      const result = service.pickThumbnail(
        {
          id: '1',
          name: '',
          description: null,
          duration: 10,
          pictures: {
            sizes: [
              { width: 200, link: 'small' },
              { width: 800, link: 'medium' },
              { width: 1600, link: 'large' },
            ],
          },
        },
        640,
      );
      expect(result).toBe('medium');
    });

    it('falls back to the largest size when none meet minWidth', () => {
      const result = service.pickThumbnail(
        {
          id: '1',
          name: '',
          description: null,
          duration: 10,
          pictures: { sizes: [{ width: 100, link: 'tiny' }, { width: 200, link: 'small' }] },
        },
        640,
      );
      expect(result).toBe('small');
    });

    it('returns null when no thumbnails exist', () => {
      const result = service.pickThumbnail({
        id: '1',
        name: '',
        description: null,
        duration: 10,
      });
      expect(result).toBeNull();
    });
  });

  describe('fetchMetadata', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('throws when no access token is configured', async () => {
      configService.vimeoAccessToken = undefined;
      await expect(service.fetchMetadata('1')).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws Unauthorized when Vimeo returns 401', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'unauthorized',
      }) as unknown as typeof fetch;
      await expect(service.fetchMetadata('1')).rejects.toThrow(UnauthorizedException);
    });

    it('throws Unprocessable on 404', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'not found',
      }) as unknown as typeof fetch;
      await expect(service.fetchMetadata('1')).rejects.toThrow(UnprocessableEntityException);
    });

    it('returns parsed metadata on success', async () => {
      const payload: VimeoVideoMetadata = {
        id: '76979871',
        name: 'Demo',
        description: 'desc',
        duration: 90,
      };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload,
      }) as unknown as typeof fetch;
      await expect(service.fetchMetadata('76979871')).resolves.toEqual(payload);
    });

    it('forwards the bearer token in the auth header', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: '1', name: '', description: null, duration: 0 }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      await service.fetchMetadata('1');
      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token-abc');
    });
  });
});
