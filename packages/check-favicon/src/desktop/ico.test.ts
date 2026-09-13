import { parse } from 'node-html-parser';
import { checkIcoFavicon, isHtmlDocument } from './ico';
import { CheckerMessage, CheckerStatus, DesktopSingleReport, FetchResponse, MessageId } from '../types';
import { filePathToReadableStream, stringToReadableStream } from '../helper';
import { testFetcher } from '../test-helper';
import sharp from 'sharp';

type TestOutput = {
  messages: Pick<CheckerMessage, 'id' | 'status'>[];
  icon: DesktopSingleReport['icon'];
};

const runIcoTest = async (
  headFragment: string | null,
  output: TestOutput,
  fetchDatabase: { [url: string]: FetchResponse } = {},
  checkContent = true,
) => {
  const root = headFragment ? parse(headFragment) : null;
  const result = await checkIcoFavicon('https://example.com/', root, testFetcher(fetchDatabase));
  const filteredMessages = result.messages.map(m => ({ status: m.status, id: m.id }));
  expect(filteredMessages).toEqual(output.messages);

  // Check icon properties - icon is always returned by checkIcoFavicon
  const resultIcon = result.icon!;
  const outputIcon = output.icon!;

  expect(resultIcon.url).toEqual(outputIcon.url);
  expect(resultIcon.width).toEqual(outputIcon.width);
  expect(resultIcon.height).toEqual(outputIcon.height);

  // For content, just check if it's null or not null unless exact match is needed
  if (checkContent && outputIcon.content === null) {
    expect(resultIcon.content).toBeNull();
  } else if (checkContent && outputIcon.content !== null) {
    expect(resultIcon.content).not.toBeNull();
    expect(resultIcon.content).toMatch(/^data:image\/png;base64,/);
  }
};

test('checkIcoFavicon - noHead', async () => {
  await runIcoTest(null, {
    messages: [
      {
        status: CheckerStatus.Error,
        id: MessageId.noHead,
      },
    ],
    icon: {
      content: null,
      url: null,
      width: null,
      height: null,
    },
  });
});

test('checkIcoFavicon - noIcoFavicon', async () => {
  await runIcoTest(`<title>Some text</title>`, {
    messages: [
      {
        status: CheckerStatus.Error,
        id: MessageId.noIcoFavicon,
      },
    ],
    icon: {
      content: null,
      url: null,
      width: null,
      height: null,
    },
  });
});

test('checkIcoFavicon - implicit /favicon.ico when not declared', async () => {
  const testIconPath = './fixtures/simple-ico.ico';

  await runIcoTest(
    `<title>Some text</title>`,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconImplicitInRoot,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDownloadable,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconExpectedSizes,
        },
      ],
      icon: {
        content: 'data:image/png;base64,placeholder', // Will be checked for format only
        url: 'https://example.com/favicon.ico',
        width: 48,
        height: 48,
      },
    },
    {
      'https://example.com/favicon.ico': {
        status: 200,
        contentType: 'image/x-icon',
        readableStream: await filePathToReadableStream(testIconPath),
      },
    },
  );
});

test('isHtmlDocument', () => {
  const html = '<!DOCTYPE html><html><head><title>Home</title></head></html>';
  expect(isHtmlDocument(Buffer.from(html), 'text/html; charset=utf-8')).toBe(true);
  expect(isHtmlDocument(Buffer.from(html), 'image/x-icon')).toBe(true);
  expect(isHtmlDocument(Buffer.from(`\uFEFF\n  <html lang="en"></html>`), null)).toBe(true);
  expect(isHtmlDocument(Buffer.from('<head><title>Home</title></head>'), 'text/html')).toBe(true);

  expect(isHtmlDocument(Buffer.from('<head><title>Home</title></head>'), null)).toBe(false);
  expect(isHtmlDocument(Buffer.from([0, 0, 1, 0, 1, 0, 16, 16]), 'text/html')).toBe(false);
  expect(isHtmlDocument(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'text/html')).toBe(false);
});

// A single-page app fallback, a geo wall or a soft 404 answers /favicon.ico with a page
test('checkIcoFavicon - implicit /favicon.ico that is a web page', async () => {
  const icoFaviconIsHtml = {
    messages: [
      {
        status: CheckerStatus.Error,
        id: MessageId.icoFaviconIsHtml,
      },
    ],
    icon: {
      content: null,
      url: null,
      width: null,
      height: null,
    },
  };

  await runIcoTest(`<title>Some text</title>`, icoFaviconIsHtml, {
    'https://example.com/favicon.ico': {
      status: 200,
      contentType: 'text/html; charset=utf-8',
      readableStream: stringToReadableStream('<!DOCTYPE html><html><head><title>Home</title></head></html>'),
    },
  });

  // Whatever the server claims
  await runIcoTest(`<title>Some text</title>`, icoFaviconIsHtml, {
    'https://example.com/favicon.ico': {
      status: 200,
      contentType: 'image/x-icon',
      readableStream: stringToReadableStream('<html><head><title>Not found</title></head></html>'),
    },
  });
});

test('checkIcoFavicon - implicit /favicon.ico served as text/html is still an ICO', async () => {
  await runIcoTest(
    `<title>Some text</title>`,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconImplicitInRoot,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDownloadable,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconExpectedSizes,
        },
      ],
      icon: {
        content: 'data:image/png;base64,placeholder',
        url: 'https://example.com/favicon.ico',
        width: 48,
        height: 48,
      },
    },
    {
      'https://example.com/favicon.ico': {
        status: 200,
        contentType: 'text/html',
        readableStream: await filePathToReadableStream('./fixtures/simple-ico.ico'),
      },
    },
  );
});

// The page points at the file, which stays in the report, as for a 404
test('checkIcoFavicon - declared ICO that is a web page', async () => {
  await runIcoTest(
    `<link rel="icon" href="/favicon.ico" />`,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDeclared,
        },
        {
          status: CheckerStatus.Error,
          id: MessageId.icoFaviconIsHtml,
        },
      ],
      icon: {
        content: null,
        url: 'https://example.com/favicon.ico',
        width: null,
        height: null,
      },
    },
    {
      'https://example.com/favicon.ico': {
        status: 200,
        contentType: 'text/html',
        readableStream: stringToReadableStream('<!DOCTYPE html><html><head><title>Home</title></head></html>'),
      },
    },
  );
});

test('checkIcoFavicon - multipleIcoFavicons with shortcut icon', async () => {
  await runIcoTest(
    `
  <link rel="shortcut icon" href="/favicon1.ico" />
  <link rel="shortcut icon" href="/favicon2.ico" />
  `,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDeclared,
        },
        {
          status: CheckerStatus.Warning,
          id: MessageId.multipleIcoFavicons,
        },
        {
          status: CheckerStatus.Error,
          id: MessageId.icoFavicon404,
        },
      ],
      icon: {
        content: null,
        url: 'https://example.com/favicon2.ico',
        width: null,
        height: null,
      },
    },
  );
});

test('checkIcoFavicon - multipleIcoFavicons with type="image/x-icon"', async () => {
  await runIcoTest(
    `
  <link rel="icon" type="image/x-icon" href="/favicon1.ico" />
  <link rel="icon" type="image/x-icon" href="/favicon2.ico" />
  `,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDeclared,
        },
        {
          status: CheckerStatus.Warning,
          id: MessageId.multipleIcoFavicons,
        },
        {
          status: CheckerStatus.Error,
          id: MessageId.icoFavicon404,
        },
      ],
      icon: {
        content: null,
        url: 'https://example.com/favicon2.ico',
        width: null,
        height: null,
      },
    },
  );
});

// The spec-correct modern form: rel="icon", no type attribute. The ICO favicon
// is declared, it is not the implicit /favicon.ico convention.
test('checkIcoFavicon - rel="icon" with an .ico href and no type', async () => {
  const testIconPath = './fixtures/simple-ico.ico';

  await runIcoTest(
    `<link rel="icon" href="/favicon.ico" />`,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDeclared,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDownloadable,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconExpectedSizes,
        },
      ],
      icon: {
        content: 'data:image/png;base64,placeholder', // Will be checked for format only
        url: 'https://example.com/favicon.ico',
        width: 48,
        height: 48,
      },
    },
    {
      'https://example.com/favicon.ico': {
        status: 200,
        contentType: 'image/x-icon',
        readableStream: await filePathToReadableStream(testIconPath),
      },
    },
  );
});

test('checkIcoFavicon - untyped href with a query string', async () => {
  const testIconPath = './fixtures/simple-ico.ico';

  await runIcoTest(
    `<link rel="icon" href="/favicon.ico?v=2" />`,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDeclared,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDownloadable,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconExpectedSizes,
        },
      ],
      icon: {
        content: 'data:image/png;base64,placeholder', // Will be checked for format only
        url: 'https://example.com/favicon.ico?v=2',
        width: 48,
        height: 48,
      },
    },
    {
      'https://example.com/favicon.ico?v=2': {
        status: 200,
        contentType: 'image/x-icon',
        readableStream: await filePathToReadableStream(testIconPath),
      },
    },
  );
});

// An untyped PNG declaration is not an ICO favicon: the checker must fall back
// to the implicit /favicon.ico convention.
test('checkIcoFavicon - untyped .png href is not an ICO favicon', async () => {
  await runIcoTest(`<link rel="icon" href="/favicon.png" />`, {
    messages: [
      {
        status: CheckerStatus.Error,
        id: MessageId.noIcoFavicon,
      },
    ],
    icon: {
      content: null,
      url: null,
      width: null,
      height: null,
    },
  });
});

// The rel="icon" + rel="shortcut icon" pair inherited from the IE era: the same
// file declared twice is a single favicon, not an error.
test('checkIcoFavicon - the same URL declared twice', async () => {
  const testIconPath = './fixtures/simple-ico.ico';

  await runIcoTest(
    `
  <link rel="icon" href="/favicon.ico" />
  <link rel="shortcut icon" href="/favicon.ico" />
  `,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDeclared,
        },
        {
          status: CheckerStatus.Warning,
          id: MessageId.duplicatedIcoFaviconDeclarations,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDownloadable,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconExpectedSizes,
        },
      ],
      icon: {
        content: 'data:image/png;base64,placeholder', // Will be checked for format only
        url: 'https://example.com/favicon.ico',
        width: 48,
        height: 48,
      },
    },
    {
      'https://example.com/favicon.ico': {
        status: 200,
        contentType: 'image/x-icon',
        readableStream: await filePathToReadableStream(testIconPath),
      },
    },
  );
});

// The same URL, declared once relative and once absolute: deduplication happens
// on the resolved URL.
test('checkIcoFavicon - the same URL declared twice, in two different forms', async () => {
  const testIconPath = './fixtures/simple-ico.ico';

  await runIcoTest(
    `
  <link rel="shortcut icon" href="https://example.com/favicon.ico" />
  <link rel="icon" href="/favicon.ico" />
  `,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDeclared,
        },
        {
          status: CheckerStatus.Warning,
          id: MessageId.duplicatedIcoFaviconDeclarations,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDownloadable,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconExpectedSizes,
        },
      ],
      icon: {
        content: 'data:image/png;base64,placeholder', // Will be checked for format only
        url: 'https://example.com/favicon.ico',
        width: 48,
        height: 48,
      },
    },
    {
      'https://example.com/favicon.ico': {
        status: 200,
        contentType: 'image/x-icon',
        readableStream: await filePathToReadableStream(testIconPath),
      },
    },
  );
});

// Two genuinely different files: the last declaration wins, the way browsers
// resolve it, and the competing declarations are only worth a warning.
test('checkIcoFavicon - two different URLs, the last one wins', async () => {
  const testIconPath = './fixtures/simple-ico.ico';

  await runIcoTest(
    `
  <link rel="icon" href="/favicon-light.ico" />
  <link rel="shortcut icon" href="/favicon.ico" />
  `,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDeclared,
        },
        {
          status: CheckerStatus.Warning,
          id: MessageId.multipleIcoFavicons,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDownloadable,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconExpectedSizes,
        },
      ],
      icon: {
        content: 'data:image/png;base64,placeholder', // Will be checked for format only
        url: 'https://example.com/favicon.ico',
        width: 48,
        height: 48,
      },
    },
    {
      'https://example.com/favicon-light.ico': {
        status: 200,
        contentType: 'image/x-icon',
        readableStream: await filePathToReadableStream(testIconPath),
      },
      'https://example.com/favicon.ico': {
        status: 200,
        contentType: 'image/x-icon',
        readableStream: await filePathToReadableStream(testIconPath),
      },
    },
  );
});

test('checkIcoFavicon - icoFaviconDeclared & noIcoFaviconHref', async () => {
  await runIcoTest(`<link rel="shortcut icon" />`, {
    messages: [
      {
        status: CheckerStatus.Ok,
        id: MessageId.icoFaviconDeclared,
      },
      {
        status: CheckerStatus.Error,
        id: MessageId.noIcoFaviconHref,
      },
    ],
    icon: {
      content: null,
      url: null,
      width: null,
      height: null,
    },
  });
});

test('checkIcoFavicon - icoFaviconDeclared & icoFavicon404', async () => {
  await runIcoTest(`<link rel="shortcut icon" href="/favicon.ico" />`, {
    messages: [
      {
        status: CheckerStatus.Ok,
        id: MessageId.icoFaviconDeclared,
      },
      {
        status: CheckerStatus.Error,
        id: MessageId.icoFavicon404,
      },
    ],
    icon: {
      content: null,
      url: 'https://example.com/favicon.ico',
      width: null,
      height: null,
    },
  });
});

test('checkIcoFavicon - icoFaviconDeclared & icoFaviconCannotGet', async () => {
  await runIcoTest(
    `<link rel="shortcut icon" href="/favicon.ico" />`,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDeclared,
        },
        {
          status: CheckerStatus.Error,
          id: MessageId.icoFaviconCannotGet,
        },
      ],
      icon: {
        content: null,
        url: 'https://example.com/favicon.ico',
        width: null,
        height: null,
      },
    },
    {
      'https://example.com/favicon.ico': {
        status: 403,
        contentType: 'image/x-icon',
      },
    },
  );
});

test('checkIcoFavicon - icoFaviconDeclared & icoFaviconDownloadable & icoFaviconExpectedSizes', async () => {
  const testIconPath = './fixtures/simple-ico.ico';

  await runIcoTest(
    `<link rel="shortcut icon" href="/favicon.ico" />`,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDeclared,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDownloadable,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconExpectedSizes,
        },
      ],
      icon: {
        content: 'data:image/png;base64,placeholder', // Will be checked for format only
        url: 'https://example.com/favicon.ico',
        width: 48,
        height: 48,
      },
    },
    {
      'https://example.com/favicon.ico': {
        status: 200,
        contentType: 'image/x-icon',
        readableStream: await filePathToReadableStream(testIconPath),
      },
    },
  );
});

test('checkIcoFavicon - using type="image/x-icon"', async () => {
  const testIconPath = './fixtures/simple-ico.ico';

  await runIcoTest(
    `<link rel="icon" type="image/x-icon" href="/favicon.ico" />`,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDeclared,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDownloadable,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconExpectedSizes,
        },
      ],
      icon: {
        content: 'data:image/png;base64,placeholder', // Will be checked for format only
        url: 'https://example.com/favicon.ico',
        width: 48,
        height: 48,
      },
    },
    {
      'https://example.com/favicon.ico': {
        status: 200,
        contentType: 'image/x-icon',
        readableStream: await filePathToReadableStream(testIconPath),
      },
    },
  );
});

// For https://github.com/RealFaviconGenerator/core/issues/2
test('checkIcoFavicon - Protocol-relative URL', async () => {
  const testIconPath = './fixtures/simple-ico.ico';

  await runIcoTest(
    `<link rel="shortcut icon" href="//example.com/favicon.ico" />`,
    {
      messages: [
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDeclared,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconDownloadable,
        },
        {
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconExpectedSizes,
        },
      ],
      icon: {
        content: 'data:image/png;base64,placeholder', // Will be checked for format only
        url: 'https://example.com/favicon.ico',
        width: 48,
        height: 48,
      },
    },
    {
      'https://example.com/favicon.ico': {
        status: 200,
        contentType: 'image/x-icon',
        readableStream: await filePathToReadableStream(testIconPath),
      },
    },
  );
});

// `decode-ico` returns the original file for a PNG entry, but raw RGBA pixels
// for a BMP one. Handing those pixels over as `image/bmp` built a data URL no
// browser could display, which broke the previews of every site whose favicon
// is a plain ICO — amazon.com among them.
const iconOfIcoFile = async (path: string) => {
  const root = parse(`<link rel="icon" href="/favicon.ico" />`);
  const result = await checkIcoFavicon(
    'https://example.com/',
    root,
    testFetcher({
      'https://example.com/favicon.ico': {
        status: 200,
        contentType: 'image/x-icon',
        readableStream: await filePathToReadableStream(path),
      },
    }),
  );

  return result.icon;
};

test('checkIcoFavicon - a BMP encoded ICO yields a displayable PNG', async () => {
  const icon = await iconOfIcoFile('./fixtures/simple-ico.ico');

  expect(icon?.content).toMatch(/^data:image\/png;base64,/);
  const meta = await sharp(Buffer.from((icon?.content as string).split(',')[1], 'base64')).metadata();
  expect({ format: meta.format, width: meta.width, height: meta.height }).toEqual({
    format: 'png',
    width: 48,
    height: 48,
  });
});

test('checkIcoFavicon - a PNG encoded ICO is passed through', async () => {
  const icon = await iconOfIcoFile('./fixtures/lemonde.ico');

  expect(icon?.content).toMatch(/^data:image\/png;base64,/);
  const meta = await sharp(Buffer.from((icon?.content as string).split(',')[1], 'base64')).metadata();
  expect({ format: meta.format, width: meta.width, height: meta.height }).toEqual({
    format: 'png',
    width: 32,
    height: 32,
  });
});
