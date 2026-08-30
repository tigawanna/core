import { HTMLElement } from 'node-html-parser'
import { mergeUrlAndPath } from "../helper";

export type IconFormat = 'ico' | 'svg' | 'png';

// The `type` attribute is only a hint, but when it is there it is authoritative.
const formatMimeTypes: { [format in IconFormat]: string[] } = {
  ico: [ 'image/x-icon', 'image/vnd.microsoft.icon' ],
  svg: [ 'image/svg+xml' ],
  png: [ 'image/png' ]
};

// Fallback when the declaration has no `type` attribute.
const formatExtensions: { [format in IconFormat]: string[] } = {
  ico: [ 'ico' ],
  svg: [ 'svg' ],
  png: [ 'png' ]
};

const relTokens = (markup: HTMLElement): string[] => (
  (markup.attributes.rel || '').toLowerCase().split(/\s+/).filter(token => token.length > 0)
);

const hrefExtension = (href: string | undefined): string | null => {
  if (!href) {
    return null;
  }

  // Drop the query string and the fragment: `/favicon.ico?v=2` is an ICO file
  const lastSegment = href.split(/[?#]/)[0].split('/').pop() || '';
  const dot = lastSegment.lastIndexOf('.');
  if (dot < 1) {
    return null;
  }

  return lastSegment.slice(dot + 1).toLowerCase();
}

const findFormat = (candidates: { [format in IconFormat]: string[] }, value: string): IconFormat | null => (
  (Object.keys(candidates) as IconFormat[]).find(format => candidates[format].includes(value)) || null
);

/**
 * The format a `<link rel="icon">` markup declares, or null when it cannot be told.
 *
 * `type` is advisory in HTML, so it is used when present and the href extension is
 * the fallback otherwise. `<link rel="shortcut icon">` with neither is the legacy
 * Internet Explorer form, which could only ever be an ICO favicon.
 */
export const iconMarkupFormat = (markup: HTMLElement): IconFormat | null => {
  const type = (markup.attributes.type || '').split(';')[0].trim().toLowerCase();
  if (type) {
    return findFormat(formatMimeTypes, type);
  }

  const extension = hrefExtension(markup.attributes.href);
  if (extension) {
    return findFormat(formatExtensions, extension);
  }

  if (relTokens(markup).includes('shortcut')) {
    return 'ico';
  }

  return null;
}

export type IconDeclaration = {
  markup: HTMLElement,
  href: string | null,
  // The href resolved against the page URL, null when there is no href
  url: string | null
}

/**
 * All the favicon declarations of the given format, in document order.
 */
export const findIconDeclarations = (baseUrl: string, head: HTMLElement, format: IconFormat): IconDeclaration[] => (
  head.querySelectorAll('link')
    .filter(markup => relTokens(markup).includes('icon'))
    .filter(markup => iconMarkupFormat(markup) === format)
    .map(markup => {
      const href = markup.attributes.href || null;
      return {
        markup,
        href,
        url: href ? mergeUrlAndPath(baseUrl, href) : null
      };
    })
);

export type ResolvedIconDeclarations = {
  // The declarations that do have an href
  withHref: IconDeclaration[],
  // Their resolved URLs, deduplicated, in document order
  distinctUrls: string[],
  // The declaration a browser would use: the last one wins
  winner: IconDeclaration | null
}

/**
 * Resolve competing declarations the way a browser does: the same file declared
 * several times is a single favicon, and when several files compete the last
 * declaration wins.
 */
export const resolveIconDeclarations = (declarations: IconDeclaration[]): ResolvedIconDeclarations => {
  const withHref = declarations.filter(declaration => declaration.url !== null);
  const distinctUrls = withHref
    .map(declaration => declaration.url as string)
    .filter((url, index, urls) => urls.indexOf(url) === index);

  return {
    withHref,
    distinctUrls,
    winner: withHref.length > 0 ? withHref[withHref.length - 1] : null
  };
}
