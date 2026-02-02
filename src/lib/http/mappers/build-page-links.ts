import { Request } from 'express';
import { PageLinks } from 'src/lib/http/dto/page-response.dto';

export function buildPageLinks(opts: {
  request: Request;
  apiUrl: string;
  limit?: number;
  offset?: number;
  itemCount: number;
}): PageLinks {
  const { request, apiUrl, limit = 0, offset = 0, itemCount } = opts;
  let next: string | undefined;
  if (limit > 0 && itemCount >= limit) {
    const nextOffset = offset + itemCount;
    let originalUrl;
    if (request.originalUrl) {
      originalUrl = apiUrl + request.originalUrl;
    } else {
      originalUrl = apiUrl + request.url;
    }
    const nextUrl = new URL(originalUrl);
    nextUrl.searchParams.set('limit', `${limit}`);
    nextUrl.searchParams.set('offset', `${nextOffset}`);
    next = nextUrl.toString();
  }
  return { next };
}
