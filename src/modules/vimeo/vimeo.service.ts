import { Injectable, Logger, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

const VIMEO_API_BASE = 'https://api.vimeo.com';

/**
 * Subset of the Vimeo `/videos/:id` payload we care about. The real response has
 * dozens of fields — this is the shape required to import a video and decide which
 * progressive (MP4) rendition to pull. See https://developer.vimeo.com/api/reference/videos
 */
export interface VimeoVideoMetadata {
  /** Vimeo numeric id as a string (e.g. "76979871") */
  id: string;
  name: string;
  description: string | null;
  duration: number;
  pictures?: { sizes: { width: number; link: string }[] };
  /**
   * Progressive (direct MP4) renditions. Only present for Pro/Plus accounts. Free
   * accounts don't expose this; we fail with a clear error in that case.
   */
  play?: {
    progressive: VimeoProgressiveRendition[];
  };
}

export interface VimeoProgressiveRendition {
  /** e.g. "1080p", "720p" */
  rendition: string;
  width: number;
  height: number;
  link: string;
  type: string;
}

@Injectable()
export class VimeoService {
  private readonly logger = new Logger(VimeoService.name);

  constructor(private readonly configService: AppConfigService) {}

  /**
   * Extract the numeric Vimeo id from any of: a raw id ("76979871"), an URL of
   * the form vimeo.com/76979871, or a player URL like player.vimeo.com/video/76979871.
   */
  parseVideoId(input: string): string {
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (!match) {
      throw new UnprocessableEntityException(
        'Could not parse a Vimeo video id from the URL. Expected a numeric id or a vimeo.com/{id} URL.',
      );
    }
    return match[1];
  }

  async fetchMetadata(videoId: string): Promise<VimeoVideoMetadata> {
    const token = this.requireToken();
    const res = await fetch(`${VIMEO_API_BASE}/videos/${videoId}?fields=id,name,description,duration,pictures.sizes,play.progressive`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.vimeo.*+json;version=3.4',
      },
    });
    if (res.status === 404) {
      throw new UnprocessableEntityException(`Vimeo video ${videoId} not found or not accessible with this token`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedException('Vimeo rejected the access token. Check VIMEO_ACCESS_TOKEN scopes.');
    }
    if (!res.ok) {
      const body = await res.text();
      throw new UnprocessableEntityException(`Vimeo API error ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as VimeoVideoMetadata;
    return json;
  }

  /**
   * Pick the best progressive rendition that fits within `maxHeight`. Defaults
   * to 1080p ceiling because that's a reasonable balance of quality vs storage
   * for exercise demos. Vimeo returns renditions sorted highest-quality-first.
   */
  pickRendition(meta: VimeoVideoMetadata, maxHeight = 1080): VimeoProgressiveRendition {
    const renditions = meta.play?.progressive ?? [];
    if (renditions.length === 0) {
      throw new UnprocessableEntityException(
        'No progressive (MP4) renditions available. The Vimeo source account must be Pro/Plus tier and the access token needs the video_files scope.',
      );
    }
    const within = renditions.filter((r) => r.height <= maxHeight);
    return within[0] ?? renditions[renditions.length - 1];
  }

  /**
   * Open a streaming fetch against the rendition URL. Returns the Response so callers
   * can pipe res.body straight into S3/MinIO without buffering the whole MP4 in memory.
   */
  async openSourceStream(rendition: VimeoProgressiveRendition): Promise<Response> {
    const res = await fetch(rendition.link);
    if (!res.ok || !res.body) {
      throw new UnprocessableEntityException(`Failed to fetch Vimeo rendition: ${res.status}`);
    }
    return res;
  }

  pickThumbnail(meta: VimeoVideoMetadata, minWidth = 640): string | null {
    const sizes = meta.pictures?.sizes ?? [];
    if (sizes.length === 0) return null;
    const ge = sizes.filter((s) => s.width >= minWidth);
    return (ge[0] ?? sizes[sizes.length - 1]).link;
  }

  private requireToken(): string {
    const token = this.configService.vimeoAccessToken;
    if (!token) {
      throw new UnprocessableEntityException(
        'VIMEO_ACCESS_TOKEN is not configured. Set it in the server environment before using the Vimeo import flow.',
      );
    }
    return token;
  }
}
