import robotsParser from "robots-parser";
import { checkDesktopFavicon } from "./desktop/desktop";
import { fetchFetcher, readableStreamToString } from "./helper";
import { CheckedIcon, CheckerMessage, CheckerStatus, DesktopFaviconReport, Fetcher, GoogleReport, MessageId } from "./types";
import { HTMLElement } from "node-html-parser";

export const GoogleBot = 'Googlebot';
export const GoogleImageBot = 'Googlebot-Image';

export type RobotsIconType = 'png' | 'ico' | 'svg';

export type RobotsIcon = {
  url: string,
  type: RobotsIconType
}

type Robots = ReturnType<typeof robotsParser>;

const robotsMessageIds: { [type in RobotsIconType]: { allowed: MessageId, blocked: MessageId } } = {
  png: {
    allowed: MessageId.googlePngIconAllowedByRobots,
    blocked: MessageId.googlePngIconBlockedByRobots
  },
  ico: {
    allowed: MessageId.googleIcoAllowedByRobots,
    blocked: MessageId.googleIcoBlockedByRobots
  },
  svg: {
    allowed: MessageId.googleSvgIconAllowedByRobots,
    blocked: MessageId.googleSvgIconBlockedByRobots
  }
};

export const getRobotsFileUrl = (baseUrl: string): string => {
  try {
    const url = new URL(baseUrl);
    url.pathname = '/robots.txt';
    return url.toString();
  } catch (error) {
    throw new Error(`Invalid URL ${baseUrl}`);
  }
}

const getOrigin = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch (error) {
    return null;
  }
}

// Returns null when the origin has no robots.txt file, which means everything is allowed.
const fetchRobotsFile = async (robotsUrl: string, fetcher: Fetcher): Promise<Robots | null> => {
  const robotsResponse = await fetcher(robotsUrl);

  if (robotsResponse.status !== 200) {
    return null;
  }

  const robotsFile = robotsResponse.readableStream ? await readableStreamToString(robotsResponse.readableStream) : '';

  return robotsParser(robotsUrl, robotsFile);
}

export const checkRobotsFile = async (baseUrl: string, icons: RobotsIcon[], fetcher: Fetcher = fetchFetcher): Promise<CheckerMessage[]> => {
  const messages: CheckerMessage[] = [];

  const pageRobotsUrl = getRobotsFileUrl(baseUrl);
  const pageRobots = await fetchRobotsFile(pageRobotsUrl, fetcher);

  if (pageRobots) {
    messages.push({
      status: CheckerStatus.Ok,
      text: `robots.txt file found at ${pageRobotsUrl}`,
      id: MessageId.googleRobotsFileFound
    });
  } else {
    messages.push({
      status: CheckerStatus.Ok,
      text: `No \`robots.txt\` file found at \`${pageRobotsUrl}\`. Also this is not a recommanded setup, at least Google is not restricted from accessing favicon assets.`,
      id: MessageId.googleNoRobotsFile
    });
  }

  // robots.txt is a per-origin thing: when an icon is served by a CDN,
  // `Googlebot-Image` obeys the robots.txt file of the CDN, not the one of the page.
  // So each icon is checked against the robots.txt file of its own origin, with one
  // fetch per distinct origin.
  const robotsByOrigin = new Map<string, { robots: Robots | null, url: string }>();

  const pageOrigin = getOrigin(baseUrl);
  if (pageOrigin) {
    robotsByOrigin.set(pageOrigin, { robots: pageRobots, url: pageRobotsUrl });
  }

  for (const icon of icons) {
    if (!icon || !icon.url) {
      continue;
    }

    const origin = getOrigin(icon.url);
    let entry = origin ? robotsByOrigin.get(origin) : undefined;

    if (origin && !entry) {
      const robotsUrl = `${origin}/robots.txt`;
      entry = { robots: await fetchRobotsFile(robotsUrl, fetcher), url: robotsUrl };
      robotsByOrigin.set(origin, entry);
    }

    const robots = entry ? entry.robots : null;
    const ids = robotsMessageIds[icon.type];

    // `isAllowed()` returns undefined when it cannot decide, typically when the URL
    // does not belong to the origin of the robots.txt file. Only an explicit false
    // means the icon is actually blocked.
    if (!robots || robots.isAllowed(icon.url, GoogleImageBot) !== false) {
      messages.push({
        status: CheckerStatus.Ok,
        text: `Access to \`${icon.url}\` is allowed for \`${GoogleImageBot}\``,
        id: ids.allowed
      });
    } else {
      const line = robots.getMatchingLineNumber(icon.url, GoogleImageBot);
      messages.push({
        status: CheckerStatus.Error,
        text: `Access to \`${icon.url}\` is blocked for \`${GoogleImageBot}\` (\`${entry?.url}\`, line ${line})`,
        id: ids.blocked
      });
    }
  }

  return messages;
}

export const checkGoogleFaviconFromDesktopReport = async (baseUrl: string, desktopReport: DesktopFaviconReport, fetcher: Fetcher = fetchFetcher): Promise<GoogleReport> => {
  const typedIcons: { icon: CheckedIcon | null, type: RobotsIconType }[] = [
    { icon: desktopReport.icons.png, type: 'png' },
    { icon: desktopReport.icons.ico, type: 'ico' },
    { icon: desktopReport.icons.svg, type: 'svg' }
  ];

  const allIcons: CheckedIcon[] = typedIcons.map(i => i.icon).filter((i): i is CheckedIcon => !!i);

  const robotsIcons: RobotsIcon[] = [];
  typedIcons.forEach(({ icon, type }) => {
    if (icon && icon.url) {
      robotsIcons.push({ url: icon.url, type });
    }
  });

  const robotsMessages = await checkRobotsFile(baseUrl, robotsIcons, fetcher);

  const messages: CheckerMessage[] = [ ...desktopReport.messages, ...robotsMessages ];

  let finalIcon: string | null = null;
  let icons: CheckedIcon[] = [];
  let maxWidth = 0;

  allIcons.forEach(icon => {
    if (icon.content && icon.width && icon.height && icon.url) {
      icons.push(icon);
      if (icon.width > maxWidth) {
        finalIcon = icon.content;
        maxWidth = icon.width;
      }
    }
  });

  return {
    messages,
    icon: finalIcon,
    icons
  }
}

export const checkGoogleFavicon = async (baseUrl: string, head: HTMLElement | null, fetcher: Fetcher = fetchFetcher): Promise<GoogleReport> => {
  const desktopReport = await checkDesktopFavicon(baseUrl, head, fetcher);
  return checkGoogleFaviconFromDesktopReport(baseUrl, desktopReport, fetcher);
}
