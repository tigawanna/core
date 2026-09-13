import { parse } from 'node-html-parser';
import sharp from 'sharp';
import {
  CheckIconProcessor,
  bufferToDataUrl,
  checkIcon,
  documentBaseUrl,
  filePathToDataUrl,
  filePathToReadableStream,
  filePathToString,
  mergeUrlAndPath,
  parseSizesAttribute,
} from './helper';
import { testFetcher } from './test-helper';

const getTestProcessor = () => {
  const messages: string[] = [];

  const processor: CheckIconProcessor = {
    noHref: () => {
      messages.push('noHref');
    },
    icon404: () => {
      messages.push('icon404');
    },
    cannotGet: (httpStatusCode: number) => {
      messages.push(`cannotGet ${httpStatusCode}`);
    },
    downloadable: () => {
      messages.push('downloadable');
    },
    unreadable: (reason: string) => {
      messages.push(`unreadable ${reason}`);
    },
    square: (widthHeight: number) => {
      messages.push(`square ${widthHeight}`);
    },
    notSquare: (width: number, Height: number) => {
      messages.push(`notSquare ${width}x${Height}`);
    },
    rightSize: (width: number) => {
      messages.push(`rightSize ${width}x${width}`);
    },
    wrongSize: (widthHeight: number) => {
      messages.push(`wrongSize ${widthHeight}x${widthHeight}`);
    },
  };

  return { processor, messages };
};

const testIcon = './fixtures/logo-transparent.png';
const nonSquareIcon = './fixtures/non-square.png';

test('checkIcon - noHref', async () => {
  const processor = getTestProcessor();
  expect(await checkIcon(undefined, processor.processor, testFetcher({}), 'image/png')).toBeNull();
  expect(processor.messages).toEqual(['noHref']);
});

test('checkIcon - icon404', async () => {
  const processor = getTestProcessor();
  expect(await checkIcon('/does-not-exist.png', processor.processor, testFetcher({}), 'image/png')).toEqual({
    content: null,
    url: '/does-not-exist.png',
    width: null,
    height: null,
  });
  expect(processor.messages).toEqual(['icon404']);
});

test('checkIcon - icon404', async () => {
  const processor = getTestProcessor();
  expect(
    await checkIcon(
      '/bad-icon.png',
      processor.processor,
      testFetcher({
        '/bad-icon.png': {
          contentType: 'image/png',
          status: 500,
        },
      }),
      'image/png',
    ),
  ).toEqual({
    content: null,
    url: '/bad-icon.png',
    width: null,
    height: null,
  });
  expect(processor.messages).toEqual(['cannotGet 500']);
});

test('checkIcon - downloadable & square', async () => {
  const processor = getTestProcessor();
  expect(
    await checkIcon(
      '/some-icon.png',
      processor.processor,
      testFetcher({
        '/some-icon.png': {
          status: 200,
          contentType: 'image/png',
          readableStream: await filePathToReadableStream(testIcon),
        },
      }),
      'image/png',
    ),
  ).not.toBeNull();
  expect(processor.messages).toEqual(['downloadable', 'square 754']);
});

test('checkIcon - downloadable & rightSize', async () => {
  const processor = getTestProcessor();
  expect(
    await checkIcon(
      '/some-icon.png',
      processor.processor,
      testFetcher({
        '/some-icon.png': {
          status: 200,
          contentType: 'image/png',
          readableStream: await filePathToReadableStream(testIcon),
        },
      }),
      'image/png',
      754,
    ),
  ).not.toBeNull();
  expect(processor.messages).toEqual(['downloadable', 'square 754', 'rightSize 754x754']);
});

test('checkIcon - downloadable & wrongSize', async () => {
  const processor = getTestProcessor();
  expect(
    await checkIcon(
      '/some-icon.png',
      processor.processor,
      testFetcher({
        '/some-icon.png': {
          status: 200,
          contentType: 'image/png',
          readableStream: await filePathToReadableStream(testIcon),
        },
      }),
      'image/png',
      500,
    ),
  ).not.toBeNull();
  expect(processor.messages).toEqual(['downloadable', 'square 754', 'wrongSize 754x754']);
});

test('checkIcon - downloadable & notSquare', async () => {
  const processor = getTestProcessor();
  expect(
    await checkIcon(
      '/non-square-icon.png',
      processor.processor,
      testFetcher({
        '/non-square-icon.png': {
          status: 200,
          contentType: 'image/png',
          readableStream: await filePathToReadableStream(nonSquareIcon),
        },
      }),
      'image/png',
      500,
    ),
  ).toEqual({
    content: await filePathToDataUrl(nonSquareIcon),
    url: '/non-square-icon.png',
    width: 240,
    height: 180,
  });
  expect(processor.messages).toEqual(['downloadable', 'notSquare 240x180']);
});

test('mergeUrlAndPath', () => {
  expect(mergeUrlAndPath('https://example.com', '/some-path')).toBe('https://example.com/some-path');
  expect(mergeUrlAndPath('https://example.com', 'some/path')).toBe('https://example.com/some/path');

  expect(mergeUrlAndPath('https://example.com', 'some/path?some=param&and=other-param')).toBe(
    'https://example.com/some/path?some=param&and=other-param',
  );

  expect(mergeUrlAndPath('https://example.com/sub-page', '/some-path')).toBe('https://example.com/some-path');
  // A relative path is relative to the "directory" of the base URL, not to the base URL itself
  expect(mergeUrlAndPath('https://example.com/sub-page', 'some/path')).toBe('https://example.com/some/path');
  expect(mergeUrlAndPath('https://example.com/sub-page/', 'some/path')).toBe('https://example.com/sub-page/some/path');
  expect(
    mergeUrlAndPath('https://www.nasa.gov/wp-content/favicons/site.webmanifest', 'android-chrome-192x192.png'),
  ).toBe('https://www.nasa.gov/wp-content/favicons/android-chrome-192x192.png');
  expect(mergeUrlAndPath('https://example.com/assets/icons/site.webmanifest', '../icon.png')).toBe(
    'https://example.com/assets/icon.png',
  );
  expect(mergeUrlAndPath('https://example.com/assets/site.webmanifest', './icon.png')).toBe(
    'https://example.com/assets/icon.png',
  );

  // The query string and the fragment of the base URL are not part of the result
  expect(mergeUrlAndPath('https://example.com/?from=home#top', 'favicon.png')).toBe('https://example.com/favicon.png');
  expect(mergeUrlAndPath('https://example.com/?from=home', '/favicon.png')).toBe('https://example.com/favicon.png');

  expect(mergeUrlAndPath('https://example.com', 'https://elsewhere.com/some-path')).toBe(
    'https://elsewhere.com/some-path',
  );

  // Protocol-relative URL
  // For https://github.com/RealFaviconGenerator/core/issues/2
  expect(mergeUrlAndPath('https://example.com', '//elsewhere.com/some-path')).toBe('https://elsewhere.com/some-path');
  expect(mergeUrlAndPath('http://example.com', '//elsewhere.com/some-other/path')).toBe(
    'http://elsewhere.com/some-other/path',
  );
});

test('parseSizesAttribute', () => {
  expect(parseSizesAttribute(null)).toEqual(null);
  expect(parseSizesAttribute('dummy')).toEqual(null);

  expect(parseSizesAttribute('16x16')).toEqual(16);
  expect(parseSizesAttribute('50x170')).toEqual(null);
});

test('documentBaseUrl', () => {
  const baseOf = (headFragment: string, pageUrl = 'https://www.icloud.com/') =>
    documentBaseUrl(pageUrl, parse(headFragment));

  expect(baseOf('<title>No base</title>')).toBe('https://www.icloud.com/');
  expect(baseOf('<base href="/system/icloud.com/2630Build56/en-us/">')).toBe(
    'https://www.icloud.com/system/icloud.com/2630Build56/en-us/',
  );
  // Relative to the page URL, not to the origin
  expect(baseOf('<base href="assets/">', 'https://example.com/fr/index.html')).toBe('https://example.com/fr/assets/');
  expect(baseOf('<base href="https://cdn.example.net/site/">')).toBe('https://cdn.example.net/site/');
  // Only the first `<base>` with an href counts
  expect(baseOf('<base target="_blank"><base href="/first/"><base href="/second/">')).toBe(
    'https://www.icloud.com/first/',
  );
  expect(baseOf('<base href="  ">')).toBe('https://www.icloud.com/');
  expect(baseOf('<base href="http://[invalid">')).toBe('https://www.icloud.com/');
});
