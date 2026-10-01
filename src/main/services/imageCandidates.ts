export type ImageCandidateSource = 'detail' | 'original' | 'srcset' | 'link' | 'banner';

export interface ImageCandidate {
  url: string;
  source: ImageCandidateSource;
}

export interface DiscoveredImageCandidate {
  url: string;
  source: ImageCandidateSource;
  alt?: string;
  context?: string;
  width?: number;
  height?: number;
}

const MAX_IMAGE_CANDIDATES = 6;
const PLACEHOLDER_PATTERN = /(?:placeholder|spacer|pixel|avatar|profile|logo|icon|default[-_]?image|no[-_]?image)/i;
const FLYER_PATTERN = /flyer|poster|event image|event graphic/i;

export function selectImageCandidates(
  discovered: DiscoveredImageCandidate[],
  fallbackUrl = ''
): ImageCandidate[] {
  const candidates = [...discovered];
  if (fallbackUrl) candidates.push({ url: fallbackUrl, source: 'banner' });

  const bestByUrl = new Map<string, ImageCandidate & { rank: number; index: number }>();
  candidates.forEach((candidate, index) => {
    const url = normalizeImageUrl(candidate.url);
    if (!url) return;

    const description = `${candidate.url} ${candidate.alt || ''} ${candidate.context || ''}`;
    if (PLACEHOLDER_PATTERN.test(description)) return;
    // Rendered thumbnail dimensions do not describe its original, linked, or srcset asset.
    const usesRenderedDimensions = candidate.source === 'detail' || candidate.source === 'banner';
    if (usesRenderedDimensions && candidate.width && candidate.height &&
      (candidate.width < 90 || candidate.height < 70)) return;

    const fullFlyer = FLYER_PATTERN.test(`${candidate.alt || ''} ${candidate.context || ''}`);
    const rank = candidate.source === 'original' ? 0
      : candidate.source === 'detail' && fullFlyer ? 1
        : candidate.source === 'srcset' ? 2
          : candidate.source === 'link' ? 3
            : candidate.source === 'detail' ? 4
              : fullFlyer ? 5 : 6;
    const current = bestByUrl.get(url);
    if (!current || rank < current.rank) {
      bestByUrl.set(url, { url, source: candidate.source, rank, index });
    }
  });

  const ranked = [...bestByUrl.values()].sort((a, b) => a.rank - b.rank || a.index - b.index);
  const banners = ranked.filter((candidate) => candidate.source === 'banner');
  const selected = banners.length > 0
    ? [...ranked.filter((candidate) => candidate.source !== 'banner').slice(0, MAX_IMAGE_CANDIDATES - 1), banners[0]]
    : ranked.slice(0, MAX_IMAGE_CANDIDATES);

  return selected
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ url, source }) => ({ url, source }));
}

export function chooseLargestSrcset(srcset: string): string | null {
  const options = srcset.split(',').map((entry, index) => {
    const [url, descriptor = ''] = entry.trim().split(/\s+/, 2);
    const value = Number.parseFloat(descriptor);
    const score = descriptor.endsWith('w') || descriptor.endsWith('x') ? value : 0;
    return { url, score, index };
  }).filter(({ url }) => Boolean(url));

  options.sort((a, b) => b.score - a.score || a.index - b.index);
  return options[0]?.url || null;
}

function normalizeImageUrl(rawUrl: string): string | null {
  const value = rawUrl.trim();
  if (!value || /^(?:data:|blob:|javascript:)/i.test(value) || /\.svg(?:[?#]|$)/i.test(value)) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}
