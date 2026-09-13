import { parse } from 'node-html-parser';
import { CheckedIcon, CheckerMessage, CheckerStatus, FetchResponse, MessageId } from './types';
import {
  AnalyzedTouchIcon,
  checkTouchIcon,
  checkTouchIconIcon,
  checkTouchIconTitle,
  getDuplicatedSizes,
  parseTouchIconSizes,
  selectTouchIcon,
  touchIconSizeVerdict,
} from './touch-icon';
import { testFetcher } from './test-helper';
import { bufferToDataUrl, filePathToReadableStream, readableStreamToBuffer, stringToReadableStream } from './helper';
import sharp from 'sharp';

type TestOutput = {
  messages: Pick<CheckerMessage, 'id' | 'status'>[];
  appTitle?: string;
  icon?: CheckedIcon | null;
};

const runCheckTouchIconTitleTest = async (
  headFragment: string | null,
  output: TestOutput,
  fetchDatabase: { [url: string]: FetchResponse } = {},
) => {
  const root = headFragment ? parse(headFragment) : null;
  const result = await checkTouchIconTitle('https://example.com/', root, testFetcher(fetchDatabase));
  const filteredMessages = result.messages.map(m => ({ status: m.status, id: m.id }));
  expect({
    messages: filteredMessages,
    appTitle: result.appTitle,
  }).toEqual(output);
};

test('checkTouchIconTitle - noHead', async () => {
  await runCheckTouchIconTitleTest(null, {
    messages: [
      {
        status: CheckerStatus.Error,
        id: MessageId.noHead,
      },
    ],
  });
});

test('checkTouchIconTitle - noTouchWebAppTitle', async () => {
  await runCheckTouchIconTitleTest('<title>Some text</title>', {
    messages: [
      {
        status: CheckerStatus.Warning,
        id: MessageId.noTouchWebAppTitle,
      },
    ],
  });
});

test('checkTouchIconTitle - multipleTouchWebAppTitles', async () => {
  await runCheckTouchIconTitleTest(
    `
    <meta name="apple-mobile-web-app-title" content="First title">
    <meta name="apple-mobile-web-app-title" content="Second title">
  `,
    {
      messages: [
        {
          status: CheckerStatus.Error,
          id: MessageId.multipleTouchWebAppTitles,
        },
      ],
    },
  );
});

test('checkTouchIconTitle - touchWebAppTitleDeclared', async () => {
  await runCheckTouchIconTitleTest(
    `
    <meta name="apple-mobile-web-app-title" content="The App Name">
  `,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.touchWebAppTitleDeclared,
        },
      ],
      appTitle: 'The App Name',
    },
  );
});

const runCheckTouchIconTest = async (
  headFragment: string | null,
  output: TestOutput,
  fetchDatabase: { [url: string]: FetchResponse } = {},
) => {
  const root = headFragment ? parse(headFragment) : null;
  const result = await checkTouchIconIcon('https://example.com/', root, testFetcher(fetchDatabase));
  const filteredMessages = result.messages.map(m => ({ status: m.status, id: m.id }));
  expect({
    messages: filteredMessages,
    icon: result.icon,
  }).toEqual({
    ...output,
    icon: output.icon || null,
  });
};

// The touch icon sizes iOS ever asked for have no fixture of their own: the
// files are generated here, so the `sizes` attributes and the images match.
const pngOfSize = (width: number, height: number = width): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 4, background: { r: 30, g: 90, b: 200, alpha: 1 } } })
    .png()
    .toBuffer();

const bufferToReadableStream = (buffer: Buffer): ReadableStream =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    },
  });

const pngResponse = (buffer: Buffer): FetchResponse => ({
  status: 200,
  contentType: 'image/png',
  readableStream: bufferToReadableStream(buffer),
});

const expectedIcon = (buffer: Buffer, url: string, width: number, height: number = width): CheckedIcon => ({
  content: bufferToDataUrl(buffer, 'image/png'),
  url,
  width,
  height,
});

const ok = (id: MessageId) => ({ status: CheckerStatus.Ok, id });
const warning = (id: MessageId) => ({ status: CheckerStatus.Warning, id });
const error = (id: MessageId) => ({ status: CheckerStatus.Error, id });

test('checkTouchIcon - noHead', async () => {
  await runCheckTouchIconTest(null, {
    messages: [
      {
        status: CheckerStatus.Error,
        id: MessageId.noHead,
      },
    ],
  });
});

test('checkTouchIcon - noTouchIcon', async () => {
  await runCheckTouchIconTest('<title>Some text</title>', {
    messages: [
      {
        status: CheckerStatus.Error,
        id: MessageId.noTouchIcon,
      },
    ],
  });
});

test('checkTouchIcon - multipleTouchIcon - no size', async () => {
  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" href="some-icon.png">
    <link rel="apple-touch-icon" href="some-other-icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        error(MessageId.duplicatedTouchIconSizes),
        warning(MessageId.multipleTouchIcons),
        error(MessageId.noTouchIcon180x180),
      ],
      icon: {
        content: null,
        url: 'https://example.com/some-other-icon.png',
        width: null,
        height: null,
      },
    },
    {
      'https://example.com/some-icon.png': {
        status: 200,
        contentType: 'image/png',
        readableStream: null,
      },
      'https://example.com/some-other-icon.png': {
        status: 200,
        contentType: 'image/png',
        readableStream: null,
      },
    },
  );
});

test('checkTouchIcon - multipleTouchIcon - specific size', async () => {
  // Both declare 180x180 and neither file could be read: nothing contradicts
  // them, so there is no `noTouchIcon180x180` error
  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="180x180" href="some-icon.png">
    <link rel="apple-touch-icon" sizes="180x180" href="some-other-icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        error(MessageId.duplicatedTouchIconSizes),
        warning(MessageId.multipleTouchIcons),
      ],
      icon: {
        content: null,
        url: 'https://example.com/some-other-icon.png',
        width: null,
        height: null,
      },
    },
    {
      'https://example.com/some-icon.png': {
        status: 200,
        contentType: 'image/png',
        readableStream: null,
      },
      'https://example.com/some-other-icon.png': {
        status: 200,
        contentType: 'image/png',
        readableStream: null,
      },
    },
  );
});

const testIcon = './fixtures/180x180.png';
const smallTestIcon = './fixtures/57x57.png';
const nonSquareTestIcon = './fixtures/non-square.png';

test('checkTouchIcon - Regular case', async () => {
  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" href="some-other-icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        ok(MessageId.touchIcon180x180),
      ],
      icon: {
        content: bufferToDataUrl(await readableStreamToBuffer(await filePathToReadableStream(testIcon)), 'image/png'),
        url: 'https://example.com/some-other-icon.png',
        width: 180,
        height: 180,
      },
    },
    {
      'https://example.com/some-other-icon.png': {
        status: 200,
        contentType: 'image/png',
        readableStream: await filePathToReadableStream(testIcon),
      },
    },
  );
});

test('checkTouchIcon - Legacy iOS size', async () => {
  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" href="some-other-icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        warning(MessageId.touchIconLegacyIosSize),
        error(MessageId.noTouchIcon180x180),
      ],
      icon: {
        content: bufferToDataUrl(
          await readableStreamToBuffer(await filePathToReadableStream(smallTestIcon)),
          'image/png',
        ),
        url: 'https://example.com/some-other-icon.png',
        width: 57,
        height: 57,
      },
    },
    {
      'https://example.com/some-other-icon.png': {
        status: 200,
        contentType: 'image/png',
        readableStream: await filePathToReadableStream(smallTestIcon),
      },
    },
  );
});

test('checkTouchIcon - Redundant iOS size', async () => {
  const buffer = await pngOfSize(120);

  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="120x120" href="icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        warning(MessageId.touchIconRedundantIosSize),
        error(MessageId.noTouchIcon180x180),
      ],
      icon: expectedIcon(buffer, 'https://example.com/icon.png', 120),
    },
    { 'https://example.com/icon.png': pngResponse(buffer) },
  );
});

test('checkTouchIcon - Unexpected size', async () => {
  const buffer = await pngOfSize(96);

  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="96x96" href="icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        error(MessageId.touchIconWrongSize),
        error(MessageId.noTouchIcon180x180),
      ],
      icon: expectedIcon(buffer, 'https://example.com/icon.png', 96),
    },
    { 'https://example.com/icon.png': pngResponse(buffer) },
  );
});

test('checkTouchIcon - Too big', async () => {
  const buffer = await pngOfSize(512);

  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" href="icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        error(MessageId.touchIconTooBig),
        error(MessageId.noTouchIcon180x180),
      ],
      icon: expectedIcon(buffer, 'https://example.com/icon.png', 512),
    },
    { 'https://example.com/icon.png': pngResponse(buffer) },
  );
});

test('checkTouchIcon - Non-square icon', async () => {
  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" href="some-other-icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        ok(MessageId.touchIconDownloadable),
        error(MessageId.touchIconNotSquare),
        error(MessageId.noTouchIcon180x180),
      ],
      icon: {
        content: bufferToDataUrl(
          await readableStreamToBuffer(await filePathToReadableStream(nonSquareTestIcon)),
          'image/png',
        ),
        url: 'https://example.com/some-other-icon.png',
        width: 240,
        height: 180,
      },
    },
    {
      'https://example.com/some-other-icon.png': {
        status: 200,
        contentType: 'image/png',
        readableStream: await filePathToReadableStream(nonSquareTestIcon),
      },
    },
  );
});

test('checkTouchIcon - The 180x180 icon is declared last', async () => {
  const legacy = await pngOfSize(57);
  const right = await pngOfSize(180);

  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="57x57" href="legacy.png">
    <link rel="apple-touch-icon" sizes="180x180" href="right.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        warning(MessageId.multipleTouchIcons),
        warning(MessageId.touchIconLegacyIosSize),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        ok(MessageId.touchIcon180x180),
      ],
      icon: expectedIcon(right, 'https://example.com/right.png', 180),
    },
    {
      'https://example.com/legacy.png': pngResponse(legacy),
      'https://example.com/right.png': pngResponse(right),
    },
  );
});

test('checkTouchIcon - The whole iOS size set', async () => {
  const sizes = [57, 60, 72, 76, 114, 120, 144, 152, 180];
  const buffers = new Map<number, Buffer>();
  for (const size of sizes) {
    buffers.set(size, await pngOfSize(size));
  }

  const head = sizes
    .map(size => `<link rel="apple-touch-icon" sizes="${size}x${size}" href="icon-${size}.png">`)
    .join('\n');
  const database: { [url: string]: FetchResponse } = {};
  sizes.forEach(size => {
    database[`https://example.com/icon-${size}.png`] = pngResponse(buffers.get(size) as Buffer);
  });

  const root = parse(head);
  const result = await checkTouchIconIcon('https://example.com/', root, testFetcher(database));

  expect(result.messages.map(m => ({ status: m.status, id: m.id }))).toEqual([
    ok(MessageId.touchIconDeclared),
    warning(MessageId.multipleTouchIcons),
    warning(MessageId.touchIconLegacyIosSize), // 57
    warning(MessageId.touchIconRedundantIosSize), // 60
    warning(MessageId.touchIconLegacyIosSize), // 72
    warning(MessageId.touchIconRedundantIosSize), // 76
    warning(MessageId.touchIconLegacyIosSize), // 114
    warning(MessageId.touchIconRedundantIosSize), // 120
    warning(MessageId.touchIconLegacyIosSize), // 144
    warning(MessageId.touchIconRedundantIosSize), // 152
    ok(MessageId.touchIconDownloadable),
    ok(MessageId.touchIconSquare),
    ok(MessageId.touchIcon180x180),
  ]);
  // Nothing to fix, only noise to remove
  expect(result.messages.filter(m => m.status === CheckerStatus.Error)).toEqual([]);
  expect(result.icon?.width).toEqual(180);
});

test('checkTouchIcon - The sizes attribute and the file disagree', async () => {
  const buffer = await pngOfSize(57);

  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="180x180" href="icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        error(MessageId.touchIconSizeMismatch),
        error(MessageId.noTouchIcon180x180),
      ],
      icon: expectedIcon(buffer, 'https://example.com/icon.png', 57),
    },
    { 'https://example.com/icon.png': pngResponse(buffer) },
  );
});

test('checkTouchIcon - Non-square file with a sizes attribute', async () => {
  const buffer = await pngOfSize(240, 180);

  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="180x180" href="icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        ok(MessageId.touchIconDownloadable),
        error(MessageId.touchIconNotSquare),
        error(MessageId.touchIconSizeMismatch),
        error(MessageId.noTouchIcon180x180),
      ],
      icon: expectedIcon(buffer, 'https://example.com/icon.png', 240, 180),
    },
    { 'https://example.com/icon.png': pngResponse(buffer) },
  );
});

test('checkTouchIcon - Non-square sizes attribute', async () => {
  const buffer = await pngOfSize(180);

  // The attribute is wrong, the file is right: one error, and the file has the
  // last word
  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="180x110" href="icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        error(MessageId.touchIconNonSquareSizes),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        ok(MessageId.touchIcon180x180),
      ],
      icon: expectedIcon(buffer, 'https://example.com/icon.png', 180),
    },
    { 'https://example.com/icon.png': pngResponse(buffer) },
  );
});

test('checkTouchIcon - Non-square sizes attribute over a legacy icon', async () => {
  const buffer = await pngOfSize(57);

  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="180x110" href="icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        error(MessageId.touchIconNonSquareSizes),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        warning(MessageId.touchIconLegacyIosSize),
        error(MessageId.noTouchIcon180x180),
      ],
      icon: expectedIcon(buffer, 'https://example.com/icon.png', 57),
    },
    { 'https://example.com/icon.png': pngResponse(buffer) },
  );
});

test('checkTouchIcon - A sizes attribute with no size at all', async () => {
  const buffer = await pngOfSize(180);

  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="any" href="icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        ok(MessageId.touchIcon180x180),
      ],
      icon: expectedIcon(buffer, 'https://example.com/icon.png', 180),
    },
    { 'https://example.com/icon.png': pngResponse(buffer) },
  );
});

test('checkTouchIcon - One icon out of two is missing', async () => {
  const buffer = await pngOfSize(180);

  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="152x152" href="missing.png">
    <link rel="apple-touch-icon" sizes="180x180" href="icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        warning(MessageId.multipleTouchIcons),
        error(MessageId.touchIcon404),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        ok(MessageId.touchIcon180x180),
      ],
      icon: expectedIcon(buffer, 'https://example.com/icon.png', 180),
    },
    { 'https://example.com/icon.png': pngResponse(buffer) },
  );
});

test('checkTouchIcon - Every icon is missing', async () => {
  // The 180x180 icon is declared: the 404 is the thing to fix, no need for a
  // second error saying the size is missing
  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="180x180" href="missing.png">
    <link rel="apple-touch-icon" href="missing-too.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        warning(MessageId.multipleTouchIcons),
        error(MessageId.touchIcon404),
        error(MessageId.touchIcon404),
      ],
      icon: {
        content: null,
        url: 'https://example.com/missing-too.png',
        width: null,
        height: null,
      },
    },
  );
});

test('checkTouchIcon - The icon cannot be fetched', async () => {
  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="180x180" href="icon.png">
  `,
    {
      messages: [ok(MessageId.touchIconDeclared), error(MessageId.touchIconCannotGet)],
      icon: {
        content: null,
        url: 'https://example.com/icon.png',
        width: null,
        height: null,
      },
    },
    { 'https://example.com/icon.png': { status: 500, contentType: null, readableStream: null } },
  );
});

test('checkTouchIcon - A declaration has no href', async () => {
  const buffer = await pngOfSize(180);

  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="152x152">
    <link rel="apple-touch-icon" sizes="180x180" href="icon.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        warning(MessageId.multipleTouchIcons),
        error(MessageId.noTouchIconHref),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        ok(MessageId.touchIcon180x180),
      ],
      icon: expectedIcon(buffer, 'https://example.com/icon.png', 180),
    },
    { 'https://example.com/icon.png': pngResponse(buffer) },
  );
});

test('checkTouchIcon - The same file declared twice is fetched once', async () => {
  const buffer = await pngOfSize(180);
  const database = { 'https://example.com/icon.png': pngResponse(buffer) };
  let calls = 0;
  const fetcher = testFetcher(database);
  const countingFetcher = async (url: string, contentType?: string) => {
    calls += 1;
    return fetcher(url, contentType);
  };

  const root = parse(`
    <link rel="apple-touch-icon" sizes="180x180" href="icon.png">
    <link rel="apple-touch-icon" sizes="152x152" href="icon.png">
  `);
  const result = await checkTouchIconIcon('https://example.com/', root, countingFetcher);

  expect(calls).toEqual(1);
  expect(result.messages.map(m => m.id)).toEqual([
    MessageId.touchIconDeclared,
    MessageId.multipleTouchIcons,
    // The first declaration is right about the file
    MessageId.touchIcon180x180,
    // The second one claims 152x152 over that very same file
    MessageId.touchIconDownloadable,
    MessageId.touchIconSquare,
    MessageId.touchIconSizeMismatch,
  ]);
});

test('checkTouchIcon - Without a 180x180 icon, the largest one is reported', async () => {
  const small = await pngOfSize(57);
  const medium = await pngOfSize(96);
  const large = await pngOfSize(192);

  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="57x57" href="small.png">
    <link rel="apple-touch-icon" sizes="192x192" href="large.png">
    <link rel="apple-touch-icon" sizes="96x96" href="medium.png">
  `,
    {
      messages: [
        ok(MessageId.touchIconDeclared),
        warning(MessageId.multipleTouchIcons),
        warning(MessageId.touchIconLegacyIosSize),
        ok(MessageId.touchIconDownloadable),
        ok(MessageId.touchIconSquare),
        error(MessageId.touchIconTooBig),
        error(MessageId.touchIconWrongSize),
        error(MessageId.noTouchIcon180x180),
      ],
      icon: expectedIcon(large, 'https://example.com/large.png', 192),
    },
    {
      'https://example.com/small.png': pngResponse(small),
      'https://example.com/medium.png': pngResponse(medium),
      'https://example.com/large.png': pngResponse(large),
    },
  );
});

test('checkTouchIcon - The last icon wins ties', async () => {
  const first = await pngOfSize(192);
  const second = await pngOfSize(192);

  const root = parse(`
    <link rel="apple-touch-icon" sizes="192x192" href="first.png">
    <link rel="apple-touch-icon" sizes="192x192" href="second.png">
  `);
  const result = await checkTouchIconIcon(
    'https://example.com/',
    root,
    testFetcher({
      'https://example.com/first.png': pngResponse(first),
      'https://example.com/second.png': pngResponse(second),
    }),
  );

  expect(result.icon?.url).toEqual('https://example.com/second.png');
});

test('checkTouchIcon - Title and icon reports are concatenated', async () => {
  const buffer = await pngOfSize(180);
  const root = parse(`
    <meta name="apple-mobile-web-app-title" content="The App Name">
    <link rel="apple-touch-icon" sizes="180x180" href="icon.png">
  `);
  const result = await checkTouchIcon(
    'https://example.com/',
    root,
    testFetcher({ 'https://example.com/icon.png': pngResponse(buffer) }),
  );

  expect(result.appTitle).toEqual('The App Name');
  expect(result.messages.map(m => m.id)).toEqual([
    MessageId.touchWebAppTitleDeclared,
    MessageId.touchIconDeclared,
    MessageId.touchIconDownloadable,
    MessageId.touchIconSquare,
    MessageId.touchIcon180x180,
  ]);
});

test('getDuplicatedSizes', () => {
  // No duplicates
  expect(getDuplicatedSizes([])).toEqual([]);
  expect(getDuplicatedSizes([undefined])).toEqual([]);
  expect(getDuplicatedSizes(['180x180'])).toEqual([]);
  expect(getDuplicatedSizes([undefined, '180x180'])).toEqual([]);

  // Duplicates
  expect(getDuplicatedSizes(['152x152', '180x180', '180x180'])).toEqual(['180x180']);
  expect(getDuplicatedSizes([undefined, '180x180', undefined, undefined])).toEqual([undefined]);
  expect(getDuplicatedSizes(['152x152', '180x180', '152x152', undefined, '152x152', undefined])).toEqual([
    '152x152',
    undefined,
  ]);
});

test('parseTouchIconSizes', () => {
  expect(parseTouchIconSizes(undefined)).toEqual({ kind: 'none' });
  expect(parseTouchIconSizes('')).toEqual({ kind: 'none' });
  expect(parseTouchIconSizes('any')).toEqual({ kind: 'none' });
  expect(parseTouchIconSizes('180x180')).toEqual({ kind: 'square', size: 180 });
  expect(parseTouchIconSizes('180X180')).toEqual({ kind: 'square', size: 180 });
  expect(parseTouchIconSizes('180x180 152x152')).toEqual({ kind: 'square', size: 180 });
  expect(parseTouchIconSizes('180x110')).toEqual({ kind: 'nonSquare', width: 180, height: 110 });
});

test('touchIconSizeVerdict', () => {
  expect([57, 72, 114, 144].map(touchIconSizeVerdict)).toEqual(['legacy', 'legacy', 'legacy', 'legacy']);
  expect([60, 76, 120, 152, 167].map(touchIconSizeVerdict)).toEqual([
    'redundant',
    'redundant',
    'redundant',
    'redundant',
    // The iPad Retina size of Apple's own example, not a mistake
    'redundant',
  ]);
  expect([16, 32, 48, 96, 179].map(touchIconSizeVerdict)).toEqual([
    'unexpected',
    'unexpected',
    'unexpected',
    'unexpected',
    'unexpected',
  ]);
  expect(touchIconSizeVerdict(180)).toEqual('right');
  expect([181, 192, 256, 512, 1024].map(touchIconSizeVerdict)).toEqual([
    'tooBig',
    'tooBig',
    'tooBig',
    'tooBig',
    'tooBig',
  ]);
});

const analyzedIcon = (over: Partial<AnalyzedTouchIcon>): AnalyzedTouchIcon => ({
  url: 'https://example.com/icon.png',
  sizesAttribute: undefined,
  declared: { kind: 'none' },
  outcome: { kind: 'fetched' },
  output: null,
  width: null,
  height: null,
  isSquare: null,
  mismatch: false,
  size: null,
  ...over,
});

const downloadedIcon = (url: string, width: number, height: number = width): AnalyzedTouchIcon =>
  analyzedIcon({
    url,
    output: { content: 'data:image/png;base64,', url, width, height },
    width,
    height,
    isSquare: width === height,
    size: width === height ? width : null,
  });

test('selectTouchIcon', () => {
  expect(selectTouchIcon([])).toEqual(null);

  // Nothing was downloaded: the last declaration is still worth showing
  const missing = analyzedIcon({
    url: 'https://example.com/missing.png',
    outcome: { kind: 'notFound' },
    output: { content: null, url: 'https://example.com/missing.png', width: null, height: null },
  });
  expect(selectTouchIcon([missing])).toEqual(missing);

  const nonSquare = downloadedIcon('https://example.com/non-square.png', 240, 180);
  expect(selectTouchIcon([nonSquare])).toEqual(nonSquare);

  // The 180x180 one, wherever it is declared
  const legacy = downloadedIcon('https://example.com/legacy.png', 57);
  const right = downloadedIcon('https://example.com/right.png', 180);
  const big = downloadedIcon('https://example.com/big.png', 512);
  expect(selectTouchIcon([legacy, right, big])).toEqual(right);
  expect(selectTouchIcon([right, legacy])).toEqual(right);

  // No 180x180: the largest one
  expect(selectTouchIcon([legacy, big, nonSquare])).toEqual(big);

  // Ties go to the last declaration
  const otherBig = downloadedIcon('https://example.com/other-big.png', 512);
  expect(selectTouchIcon([big, otherBig])).toEqual(otherBig);
});

test('checkTouchIcon - an unreadable file is reported, not thrown', async () => {
  await runCheckTouchIconTest(
    `
    <link rel="apple-touch-icon" sizes="180x180" href="icon.png">
  `,
    {
      // The declaration claims 180x180 and the unreadable file contradicts
      // nothing, so the broken file is the single thing to fix
      messages: [ok(MessageId.touchIconDeclared), error(MessageId.touchIconUnreadable)],
      icon: {
        content: null,
        url: 'https://example.com/icon.png',
        width: null,
        height: null,
      },
    },
    {
      'https://example.com/icon.png': {
        status: 200,
        contentType: 'image/png',
        readableStream: stringToReadableStream('this is definitely not an image'),
      },
    },
  );
});

// The markup of icloud.com: without the `<base>`, the icon resolves to a 404
test('checkTouchIcon - Relative href under a <base href>', async () => {
  const root = parse(`
    <base href="/system/icloud.com/2630Build56/en-us/">
    <link rel="apple-touch-icon" sizes="180x180" href="../favicons/default-favicon-light-180x180.png">
  `);
  const iconUrl = 'https://www.icloud.com/system/icloud.com/2630Build56/favicons/default-favicon-light-180x180.png';
  const result = await checkTouchIconIcon(
    'https://www.icloud.com/',
    root,
    testFetcher({ [iconUrl]: pngResponse(await pngOfSize(180)) }),
  );

  expect(result.messages.map(m => m.id)).not.toContain(MessageId.touchIcon404);
  expect(result.messages.map(m => m.id)).toContain(MessageId.touchIcon180x180);
  expect(result.icon?.url).toEqual(iconUrl);
});
