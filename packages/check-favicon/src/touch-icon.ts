import {
  CheckerMessage,
  CheckerStatus,
  Fetcher,
  MessageId,
  TouchIconIconReport,
  TouchIconReport,
  TouchIconTitleReport,
} from './types';
import { HTMLElement, parse } from 'node-html-parser';
import {
  CheckIconOutput,
  CheckIconProcessor,
  checkIcon,
  documentBaseUrl,
  fetchFetcher,
  mergeUrlAndPath,
  readableStreamToBuffer,
} from './helper';
import { IconDeclaration, resolveIconDeclarations } from './desktop/declarations';
import { isHtmlDocument } from './desktop/ico';

export const TouchIconFileSize = 180;

// The sizes iOS asked for before it settled on 180x180.
const LegacyIosTouchIconSizes = [57, 72, 114, 144]; // iOS 6 and prior
// iOS 7 and above. 167 is the iPad Retina size of Apple's own example in
// `Configuring Web Applications`, alongside 152 and 180.
const ModernIosTouchIconSizes = [60, 76, 120, 152, 167];

export const checkTouchIconTitle = async (
  baseUrl: string,
  head: HTMLElement | null,
  fetcher: Fetcher = fetchFetcher,
): Promise<TouchIconTitleReport> => {
  const messages: CheckerMessage[] = [];
  let appTitle = undefined;

  if (!head) {
    messages.push({
      status: CheckerStatus.Error,
      id: MessageId.noHead,
      text: 'No <head> element',
    });

    return { messages };
  }

  const titleMarkup = head.querySelectorAll("meta[name='apple-mobile-web-app-title']");
  if (titleMarkup.length === 0) {
    messages.push({
      status: CheckerStatus.Warning,
      id: MessageId.noTouchWebAppTitle,
      text: 'No touch web app title declared',
    });

    return { messages };
  }

  if (titleMarkup.length > 1) {
    messages.push({
      status: CheckerStatus.Error,
      id: MessageId.multipleTouchWebAppTitles,
      text: `The touch web app title is declared ${titleMarkup.length} times`,
    });

    return { messages };
  }

  if (!titleMarkup[0].getAttribute('content')) {
    messages.push({
      status: CheckerStatus.Error,
      id: MessageId.emptyTouchWebAppTitle,
      text: 'The touch web app title has no content',
    });

    return { messages };
  }

  appTitle = titleMarkup[0].getAttribute('content');
  messages.push({
    status: CheckerStatus.Ok,
    id: MessageId.touchWebAppTitleDeclared,
    text: `The touch web app title is "${appTitle}"`,
  });

  return { messages, appTitle };
};

export type TouchIconSizes =
  { kind: 'none' } | { kind: 'square'; size: number } | { kind: 'nonSquare'; width: number; height: number };

/**
 * What a `sizes` attribute claims: nothing, a square size, or a non-square one.
 *
 * `parseSizesAttribute` cannot be reused here: it returns null both for a missing
 * attribute and for a non-square one, and those two cases now differ. A missing
 * size falls back to the file, a non-square size is an error of its own.
 */
export const parseTouchIconSizes = (sizes: string | undefined | null): TouchIconSizes => {
  const match = (sizes || '').match(/(\d+)x(\d+)/i);
  if (!match) {
    return { kind: 'none' };
  }

  const width = parseInt(match[1]);
  const height = parseInt(match[2]);

  return width === height ? { kind: 'square', size: width } : { kind: 'nonSquare', width, height };
};

export type TouchIconSizeVerdict = 'right' | 'legacy' | 'redundant' | 'unexpected' | 'tooBig';

/**
 * How good a touch icon size is. The two iOS lists come before the generic
 * "below 180" case: 120 and 152 are below 180 too, yet they are not mistakes.
 */
export const touchIconSizeVerdict = (size: number): TouchIconSizeVerdict =>
  size === TouchIconFileSize
    ? 'right'
    : size > TouchIconFileSize
      ? 'tooBig'
      : LegacyIosTouchIconSizes.includes(size)
        ? 'legacy'
        : ModernIosTouchIconSizes.includes(size)
          ? 'redundant'
          : 'unexpected';

type TouchIconFetchOutcome =
  | { kind: 'noHref' }
  | { kind: 'notFound' }
  | { kind: 'cannotGet'; httpStatus: number }
  // 2xx with no body: `checkIcon` calls none of its callbacks
  | { kind: 'noBytes' }
  /** Downloaded, but not an image anything can decode. */
  | { kind: 'unreadable'; reason: string }
  | { kind: 'fetched' };

type TouchIconFetch = {
  outcome: TouchIconFetchOutcome;
  output: CheckIconOutput | null;
};

/**
 * `checkIcon` pushes its findings through callbacks, but the touch icon check
 * cannot decide what to say until every declaration has been analyzed: only one
 * "downloadable" message is emitted, for the icon the report ends up showing.
 * So the processor records the outcome instead of producing messages.
 */
const fetchTouchIcon = async (url: string, fetcher: Fetcher): Promise<TouchIconFetch> => {
  let outcome: TouchIconFetchOutcome = { kind: 'noBytes' };

  const processor: CheckIconProcessor = {
    noHref: () => {
      outcome = { kind: 'noHref' };
    },
    icon404: () => {
      outcome = { kind: 'notFound' };
    },
    cannotGet: httpStatus => {
      outcome = { kind: 'cannotGet', httpStatus };
    },
    downloadable: () => {
      outcome = { kind: 'fetched' };
    },
    unreadable: reason => {
      outcome = { kind: 'unreadable', reason };
    },
    // The size verdict is built from the returned dimensions, not from these.
    // `rightSize` and `wrongSize` are never called: no expected size is passed.
    square: () => {},
    notSquare: () => {},
    rightSize: () => {},
    wrongSize: () => {},
  };

  const output = await checkIcon(url, processor, fetcher, undefined);

  return { outcome, output };
};

/**
 * Where iOS looks for a touch icon when the page declares none, in the order it
 * tries them — the touch icon counterpart of `/favicon.ico`. Like it, they live
 * at the root of the page's own origin, whatever `<base href>` says.
 */
export const ImplicitTouchIconPaths = ['/apple-touch-icon-precomposed.png', '/apple-touch-icon.png'];

type ImplicitTouchIcon = {
  declaration: IconDeclaration;
  fetch: TouchIconFetch;
};

const findImplicitTouchIcon = async (pageUrl: string, fetcher: Fetcher): Promise<ImplicitTouchIcon | null> => {
  for (const path of ImplicitTouchIconPaths) {
    const url = mergeUrlAndPath(pageUrl, path);
    const response = await fetcher(url, 'image/png');
    if (response.status >= 300 || !response.readableStream) {
      continue;
    }

    // A server that answers every URL with a page is not serving a touch icon
    const buffer = await readableStreamToBuffer(response.readableStream);
    if (isHtmlDocument(buffer, response.contentType)) {
      continue;
    }

    // The bytes are already here: replay them instead of downloading them again
    const replay: Fetcher = async () => ({
      ...response,
      readableStream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(buffer));
          controller.close();
        },
      }),
    });

    return {
      declaration: {
        markup: parse(`<link rel="apple-touch-icon" href="${path}">`).querySelector('link') as HTMLElement,
        href: path,
        url,
      },
      fetch: await fetchTouchIcon(url, replay),
    };
  }

  return null;
};

export type AnalyzedTouchIcon = {
  url: string | null;
  sizesAttribute: string | undefined;
  declared: TouchIconSizes;
  outcome: TouchIconFetchOutcome;
  output: CheckIconOutput | null;
  width: number | null;
  height: number | null;
  // null when the file could not be decoded
  isSquare: boolean | null;
  // The `sizes` attribute and the file disagree
  mismatch: boolean;
  // The size to judge: what the markup claims, the file otherwise
  size: number | null;
};

const analyzeTouchIcon = (declaration: IconDeclaration, fetched: Map<string, TouchIconFetch>): AnalyzedTouchIcon => {
  const sizesAttribute = declaration.markup.getAttribute('sizes');
  const declared = parseTouchIconSizes(sizesAttribute);
  const fetch = declaration.url ? fetched.get(declaration.url) : undefined;
  const output = fetch?.output || null;
  const width = output?.width ?? null;
  const height = output?.height ?? null;
  const hasFile = width !== null && height !== null;
  const isSquare = hasFile ? width === height : null;
  // A non-square attribute claims nothing: it is reported, then ignored
  const declaredSize = declared.kind === 'square' ? declared.size : null;

  return {
    url: declaration.url,
    sizesAttribute,
    declared,
    outcome: fetch?.outcome || { kind: 'noHref' },
    output,
    width,
    height,
    isSquare,
    mismatch: hasFile && declaredSize !== null && (width !== declaredSize || height !== declaredSize),
    size: declaredSize ?? (isSquare === true ? width : null),
  };
};

/**
 * The icon the report shows: the 180x180 one, the largest square one otherwise.
 * The last declaration wins ties. The size is the measured one, not the declared
 * one: this icon is displayed, so it has to be an actual file.
 */
export const selectTouchIcon = (icons: AnalyzedTouchIcon[]): AnalyzedTouchIcon | null => {
  const candidates = icons.filter(icon => icon.output?.content && icon.isSquare === true);
  if (candidates.length > 0) {
    const rightSize = candidates.filter(icon => icon.width === TouchIconFileSize);
    if (rightSize.length > 0) {
      return rightSize[rightSize.length - 1];
    }

    return candidates.reduce((best, icon) => ((icon.width as number) >= (best.width as number) ? icon : best));
  }

  // Nothing usable: still show something, such as a non-square file
  const downloaded = icons.filter(icon => icon.output?.content);
  if (downloaded.length > 0) {
    return downloaded[downloaded.length - 1];
  }

  const withOutput = icons.filter(icon => icon.output);
  return withOutput.length > 0 ? withOutput[withOutput.length - 1] : null;
};

/**
 * A declaration counts as the 180x180 icon when it claims that size and nothing
 * contradicts it. A file we could not download is not a contradiction: the 404
 * is the error to fix, no need for a second one.
 */
const countsAs180x180 = (icon: AnalyzedTouchIcon): boolean =>
  icon.size === TouchIconFileSize && !icon.mismatch && icon.isSquare !== false;

const sizeVerdictMessage = (icon: AnalyzedTouchIcon): CheckerMessage => {
  const size = icon.size as number;

  switch (touchIconSizeVerdict(size)) {
    case 'right':
      return {
        status: CheckerStatus.Ok,
        id: MessageId.touchIcon180x180,
        text: `The touch icon \`${icon.url}\` has the right size (${size}x${size})`,
      };
    case 'legacy':
      return {
        status: CheckerStatus.Warning,
        id: MessageId.touchIconLegacyIosSize,
        text: `The touch icon \`${icon.url}\` is ${size}x${size}, a size for iOS 6 and prior. You probably don't want to support these devices anymore: a single 180x180 icon is enough.`,
      };
    case 'redundant':
      return {
        status: CheckerStatus.Warning,
        id: MessageId.touchIconRedundantIosSize,
        text: `The touch icon \`${icon.url}\` is ${size}x${size}. iOS 7 and above scale the 180x180 icon down, so this declaration only adds noise.`,
      };
    case 'tooBig':
      return {
        status: CheckerStatus.Error,
        id: MessageId.touchIconTooBig,
        text: `The touch icon \`${icon.url}\` is ${size}x${size}, larger than the recommended 180x180`,
      };
    case 'unexpected':
      return {
        status: CheckerStatus.Error,
        id: MessageId.touchIconWrongSize,
        text: `The touch icon \`${icon.url}\` is ${size}x${size}. No iOS device asks for this size; the recommended size is 180x180.`,
      };
  }
};

/**
 * Errors and warnings are reported for every declaration: each one is something
 * to fix. The "all good" messages describe the selected icon only, so a page
 * with nine declarations does not repeat them nine times.
 */
const declarationMessages = (icon: AnalyzedTouchIcon, isSelected: boolean): CheckerMessage[] => {
  const messages: CheckerMessage[] = [];

  if (icon.declared.kind === 'nonSquare') {
    messages.push({
      status: CheckerStatus.Error,
      id: MessageId.touchIconNonSquareSizes,
      text: `The touch icon declares \`sizes="${icon.sizesAttribute}"\`, which is not square. A touch icon must be square, and the recommended size is 180x180.`,
    });
  }

  if (icon.url === null) {
    messages.push({
      status: CheckerStatus.Error,
      id: MessageId.noTouchIconHref,
      text: 'A touch icon declaration has no href attribute',
    });

    return messages;
  }

  switch (icon.outcome.kind) {
    case 'notFound':
      messages.push({
        status: CheckerStatus.Error,
        id: MessageId.touchIcon404,
        text: `The touch icon at ${icon.url} is not found`,
      });

      return messages;

    case 'cannotGet':
      messages.push({
        status: CheckerStatus.Error,
        id: MessageId.touchIconCannotGet,
        text: `The touch icon \`${icon.url}\` cannot be fetched (${icon.outcome.httpStatus})`,
      });

      return messages;

    case 'unreadable':
      messages.push({
        status: CheckerStatus.Error,
        id: MessageId.touchIconUnreadable,
        text: `The touch icon \`${icon.url}\` cannot be read (${icon.outcome.reason})`,
      });

      return messages;

    case 'noHref':
    case 'noBytes':
      return messages;

    case 'fetched':
      break;
  }

  if (isSelected) {
    messages.push({
      status: CheckerStatus.Ok,
      id: MessageId.touchIconDownloadable,
      text: 'The touch icon is downloadable',
    });
  }

  if (icon.isSquare === false) {
    messages.push({
      status: CheckerStatus.Error,
      id: MessageId.touchIconNotSquare,
      text: `The touch icon \`${icon.url}\` is not square (${icon.width}x${icon.height})`,
    });
  } else if (icon.isSquare === true && isSelected) {
    messages.push({
      status: CheckerStatus.Ok,
      id: MessageId.touchIconSquare,
      text: `The touch icon is square (${icon.width}x${icon.width})`,
    });
  }

  if (icon.mismatch) {
    messages.push({
      status: CheckerStatus.Error,
      id: MessageId.touchIconSizeMismatch,
      text: `The touch icon \`${icon.url}\` declares \`sizes="${icon.sizesAttribute}"\` but the file is ${icon.width}x${icon.height}`,
    });
  }

  // A broken declaration has no size to judge: its own error says it all
  if (icon.isSquare === true && !icon.mismatch && icon.size !== null) {
    messages.push(sizeVerdictMessage(icon));
  }

  return messages;
};

export const checkTouchIconIcon = async (
  baseUrl: string,
  head: HTMLElement | null,
  fetcher: Fetcher = fetchFetcher,
): Promise<TouchIconIconReport> => {
  const messages: CheckerMessage[] = [];

  if (!head) {
    messages.push({
      status: CheckerStatus.Error,
      id: MessageId.noHead,
      text: 'No <head> element',
    });

    return { messages, icon: null };
  }

  const iconMarkup = head.querySelectorAll("link[rel='apple-touch-icon']");
  let declarations: IconDeclaration[];
  const fetched = new Map<string, TouchIconFetch>();

  if (iconMarkup.length === 0) {
    const implicit = await findImplicitTouchIcon(baseUrl, fetcher);
    if (!implicit) {
      messages.push({
        status: CheckerStatus.Error,
        id: MessageId.noTouchIcon,
        text: `No touch icon declared, and none at ${ImplicitTouchIconPaths.join(' or ')}`,
      });

      return { messages, icon: null };
    }

    // Allowed, but only iOS is known to look there: the other clients that want a
    // big icon — bookmark managers, link previews, launchers — read the markup.
    messages.push({
      status: CheckerStatus.Warning,
      id: MessageId.touchIconImplicitInRoot,
      text: `The touch icon is not declared, but found at ${implicit.declaration.href}. Declare it: not every client looks there.`,
    });

    declarations = [implicit.declaration];
    fetched.set(implicit.declaration.url as string, implicit.fetch);
  } else {
    messages.push({
      status: CheckerStatus.Ok,
      id: MessageId.touchIconDeclared,
      text: 'The touch icon is declared',
    });

    const duplicatedSizes = getDuplicatedSizes(iconMarkup.map(icon => icon.getAttribute('sizes')));
    if (duplicatedSizes.length > 0) {
      messages.push({
        status: CheckerStatus.Error,
        id: MessageId.duplicatedTouchIconSizes,
        text: `The touch icon sizes ${duplicatedSizes.map(s => s || '(no size)').join(', ')} are declared more than once`,
      });
    }

    if (iconMarkup.length > 1) {
      messages.push({
        status: CheckerStatus.Warning,
        id: MessageId.multipleTouchIcons,
        text: `There are ${iconMarkup.length} touch icon declarations. Nowadays a single 180x180 touch icon is enough.`,
      });
    }

    const documentUrl = documentBaseUrl(baseUrl, head);
    declarations = iconMarkup.map(markup => {
      const href = markup.getAttribute('href') || null;
      return {
        markup,
        href,
        url: href ? mergeUrlAndPath(documentUrl, href) : null,
      };
    });

    // The same file declared twice is a single download. `winner` is not used:
    // touch icons are picked by size, not by document order.
    const { distinctUrls } = resolveIconDeclarations(declarations);
    for (const url of distinctUrls) {
      fetched.set(url, await fetchTouchIcon(url, fetcher));
    }
  }

  const icons = declarations.map(declaration => analyzeTouchIcon(declaration, fetched));
  const selected = selectTouchIcon(icons);

  icons.forEach(icon => messages.push(...declarationMessages(icon, icon === selected)));

  if (!icons.some(countsAs180x180)) {
    messages.push({
      status: CheckerStatus.Error,
      id: MessageId.noTouchIcon180x180,
      text: 'There is no 180x180 touch icon. This is the size iOS expects.',
    });
  }

  return { messages, icon: selected?.output || null };
};

export const getDuplicatedSizes = (sizes: (string | undefined)[]): (string | undefined)[] => {
  const duplicated = sizes.filter((size, index) => sizes.indexOf(size, index + 1) >= 0);
  return duplicated.filter((size, index) => duplicated.indexOf(size) === index);
};

export const checkTouchIcon = async (
  baseUrl: string,
  head: HTMLElement | null,
  fetcher: Fetcher = fetchFetcher,
): Promise<TouchIconReport> => {
  const titleReport = await checkTouchIconTitle(baseUrl, head, fetcher);
  const iconReport = await checkTouchIconIcon(baseUrl, head, fetcher);

  return {
    messages: [...titleReport.messages, ...iconReport.messages],
    appTitle: titleReport.appTitle,
    icon: iconReport.icon,
  };
};
