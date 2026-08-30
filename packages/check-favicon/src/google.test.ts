import { checkGoogleFaviconFromDesktopReport, checkRobotsFile, getRobotsFileUrl, RobotsIcon } from "./google";
import { stringToReadableStream } from "./helper";
import { testFetcher } from "./test-helper";
import { CheckedIcon, CheckerMessage, CheckerStatus, DesktopFaviconReport, Fetcher, FetchResponse, MessageId } from "./types";

test('getRobotsFileUrl', () => {
  expect(getRobotsFileUrl('https://example.com')).toEqual('https://example.com/robots.txt');
  expect(getRobotsFileUrl('https://example.com/some-path')).toEqual('https://example.com/robots.txt');
});

const pageRobotsUrl = 'https://example.com/robots.txt';
const cdnRobotsUrl = 'https://cdn.example.net/robots.txt';

const allowAllRobotsFile = `
User-agent: *
Allow: /`;

const blockImagesRobotsFile = `
# *
User-agent: *
Allow: /

User-agent: Googlebot-Image
Disallow: /*.png
Disallow: /*.ico
Disallow: /*.svg
`;

// `robotsFiles` maps the URL of a robots.txt file to its content. Any other robots.txt
// URL is served as a 404, ie the origin has no robots.txt file at all.
const buildFetcher = async (robotsFiles: { [robotsUrl: string]: string }): Promise<{ fetcher: Fetcher, fetchedUrls: string[] }> => {
  const database: { [url: string]: FetchResponse } = {};
  for (const robotsUrl of Object.keys(robotsFiles)) {
    database[robotsUrl] = {
      status: 200,
      contentType: 'text/plain',
      readableStream: await stringToReadableStream(robotsFiles[robotsUrl])
    };
  }

  const fetchedUrls: string[] = [];
  const databaseFetcher = testFetcher(database);

  return {
    fetchedUrls,
    fetcher: async (url, contentType) => {
      fetchedUrls.push(url);
      return databaseFetcher(url, contentType);
    }
  };
}

const runRobotsTest = async (
  icons: RobotsIcon[],
  robotsFiles: { [robotsUrl: string]: string },
  messages: Pick<CheckerMessage, 'id' | 'status'>[]
): Promise<{ messages: CheckerMessage[], fetchedUrls: string[] }> => {
  const { fetcher, fetchedUrls } = await buildFetcher(robotsFiles);

  const report = await checkRobotsFile('https://example.com', icons, fetcher);

  const filteredMessages = report.map(m => ({ status: m.status, id: m.id }));
  expect(filteredMessages).toEqual(messages);

  return { messages: report, fetchedUrls };
}

const getLineNumber = (message: CheckerMessage): number => {
  const match = message.text.match(/line (-?\d+)\)/);
  return match ? parseInt(match[1]) : NaN;
}

test('checkRobotsFile - No robots file', async () => {
  await runRobotsTest(
    [ { url: 'https://example.com/favicon.png', type: 'png' } ],
    {},
    [
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleNoRobotsFile
      },
      {
        status: CheckerStatus.Ok,
        id: MessageId.googlePngIconAllowedByRobots
      }
    ]
  );
});

test('checkRobotsFile - PNG favicon is accessible', async () => {
  await runRobotsTest(
    [ { url: 'https://example.com/favicon.png', type: 'png' } ],
    { [pageRobotsUrl]: allowAllRobotsFile },
    [
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleRobotsFileFound
      },
      {
        status: CheckerStatus.Ok,
        id: MessageId.googlePngIconAllowedByRobots
      }
    ]
  );
});

test('checkRobotsFile - PNG favicon is *not* accessible', async () => {
  const { messages } = await runRobotsTest(
    [ { url: 'https://example.com/favicon.png', type: 'png' } ],
    { [pageRobotsUrl]: blockImagesRobotsFile },
    [
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleRobotsFileFound
      },
      {
        status: CheckerStatus.Error,
        id: MessageId.googlePngIconBlockedByRobots
      }
    ]
  );

  // The error points at the line of the robots.txt file that blocks the icon
  expect(getLineNumber(messages[1])).toBeGreaterThan(0);
  expect(messages[1].text).toContain(pageRobotsUrl);
});

test('checkRobotsFile - ICO favicon gets the ICO message ids', async () => {
  await runRobotsTest(
    [ { url: 'https://example.com/favicon.ico', type: 'ico' } ],
    { [pageRobotsUrl]: blockImagesRobotsFile },
    [
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleRobotsFileFound
      },
      {
        status: CheckerStatus.Error,
        id: MessageId.googleIcoBlockedByRobots
      }
    ]
  );

  await runRobotsTest(
    [ { url: 'https://example.com/favicon.ico', type: 'ico' } ],
    { [pageRobotsUrl]: allowAllRobotsFile },
    [
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleRobotsFileFound
      },
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleIcoAllowedByRobots
      }
    ]
  );
});

test('checkRobotsFile - SVG favicon gets the SVG message ids', async () => {
  await runRobotsTest(
    [ { url: 'https://example.com/favicon.svg', type: 'svg' } ],
    { [pageRobotsUrl]: blockImagesRobotsFile },
    [
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleRobotsFileFound
      },
      {
        status: CheckerStatus.Error,
        id: MessageId.googleSvgIconBlockedByRobots
      }
    ]
  );

  await runRobotsTest(
    [ { url: 'https://example.com/favicon.svg', type: 'svg' } ],
    { [pageRobotsUrl]: allowAllRobotsFile },
    [
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleRobotsFileFound
      },
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleSvgIconAllowedByRobots
      }
    ]
  );
});

test('checkRobotsFile - Icon on another origin is checked against the robots file of that origin', async () => {
  const { fetchedUrls } = await runRobotsTest(
    [ { url: 'https://cdn.example.net/favicon.png', type: 'png' } ],
    {
      // The page blocks images, the CDN does not: the icon is allowed
      [pageRobotsUrl]: blockImagesRobotsFile,
      [cdnRobotsUrl]: allowAllRobotsFile
    },
    [
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleRobotsFileFound
      },
      {
        status: CheckerStatus.Ok,
        id: MessageId.googlePngIconAllowedByRobots
      }
    ]
  );

  expect(fetchedUrls).toEqual([ pageRobotsUrl, cdnRobotsUrl ]);
});

test('checkRobotsFile - Icon blocked by the robots file of its own origin', async () => {
  const { messages } = await runRobotsTest(
    [ { url: 'https://cdn.example.net/favicon.png', type: 'png' } ],
    {
      [pageRobotsUrl]: allowAllRobotsFile,
      [cdnRobotsUrl]: blockImagesRobotsFile
    },
    [
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleRobotsFileFound
      },
      {
        status: CheckerStatus.Error,
        id: MessageId.googlePngIconBlockedByRobots
      }
    ]
  );

  expect(getLineNumber(messages[1])).toBeGreaterThan(0);
  expect(messages[1].text).toContain(cdnRobotsUrl);
});

test('checkRobotsFile - Icon on an origin without robots file is allowed', async () => {
  const { fetchedUrls } = await runRobotsTest(
    [ { url: 'https://cdn.example.net/favicon.png', type: 'png' } ],
    { [pageRobotsUrl]: blockImagesRobotsFile },
    [
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleRobotsFileFound
      },
      {
        status: CheckerStatus.Ok,
        id: MessageId.googlePngIconAllowedByRobots
      }
    ]
  );

  expect(fetchedUrls).toEqual([ pageRobotsUrl, cdnRobotsUrl ]);
});

test('checkRobotsFile - Icons sharing an origin trigger a single robots file fetch', async () => {
  const { fetchedUrls } = await runRobotsTest(
    [
      { url: 'https://example.com/favicon.ico', type: 'ico' },
      { url: 'https://cdn.example.net/favicon.png', type: 'png' },
      { url: 'https://cdn.example.net/favicon.svg', type: 'svg' }
    ],
    {
      [pageRobotsUrl]: allowAllRobotsFile,
      [cdnRobotsUrl]: allowAllRobotsFile
    },
    [
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleRobotsFileFound
      },
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleIcoAllowedByRobots
      },
      {
        status: CheckerStatus.Ok,
        id: MessageId.googlePngIconAllowedByRobots
      },
      {
        status: CheckerStatus.Ok,
        id: MessageId.googleSvgIconAllowedByRobots
      }
    ]
  );

  // One fetch for the page origin, one for the CDN origin shared by two icons
  expect(fetchedUrls).toEqual([ pageRobotsUrl, cdnRobotsUrl ]);
});

const checkedIcon = (url: string): CheckedIcon => ({
  content: `data:image/png;base64,${url}`,
  url,
  width: 32,
  height: 32
});

test('checkGoogleFaviconFromDesktopReport - Each icon gets the message ids of its own type', async () => {
  const desktopReport: DesktopFaviconReport = {
    messages: [],
    icon: null,
    icons: {
      png: checkedIcon('https://example.com/favicon.png'),
      ico: checkedIcon('https://example.com/favicon.ico'),
      svg: checkedIcon('https://cdn.example.net/favicon.svg')
    }
  };

  const { fetcher } = await buildFetcher({
    [pageRobotsUrl]: blockImagesRobotsFile,
    [cdnRobotsUrl]: allowAllRobotsFile
  });

  const report = await checkGoogleFaviconFromDesktopReport('https://example.com', desktopReport, fetcher);

  expect(report.messages.map(m => ({ status: m.status, id: m.id }))).toEqual([
    {
      status: CheckerStatus.Ok,
      id: MessageId.googleRobotsFileFound
    },
    {
      status: CheckerStatus.Error,
      id: MessageId.googlePngIconBlockedByRobots
    },
    {
      status: CheckerStatus.Error,
      id: MessageId.googleIcoBlockedByRobots
    },
    {
      // Served by a CDN that allows everything
      status: CheckerStatus.Ok,
      id: MessageId.googleSvgIconAllowedByRobots
    }
  ]);
});
