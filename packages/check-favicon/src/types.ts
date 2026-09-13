export enum CheckerStatus {
  Ok = 'Ok',
  Error = 'Error',
  Warning = 'Warning',
}

/**
 * The id of a checker message.
 *
 * Every id carries its number explicitly: the values are serialized into stored
 * reports, into the public API and into the favicon survey dataset, so they are
 * frozen forever. Order is free — group a new id with the family it belongs to
 * and give it the next unused number. Never reuse the number of a retired id:
 * `touchIconWithSize` is gone, 36 stays taken.
 */
export enum MessageId {
  noHead = 0,

  svgFaviconDeclared = 1,
  noSvgFavicon = 2,
  multipleSvgFavicons = 3,
  duplicatedSvgFaviconDeclarations = 79,
  noSvgFaviconHref = 4,
  svgFavicon404 = 5,
  svgFaviconCannotGet = 6,
  svgFaviconDownloadable = 7,
  svgFaviconSquare = 8,
  svgFaviconNotSquare = 9,
  svgFaviconUnreadable = 87,

  noIcoFavicon = 10,
  multipleIcoFavicons = 11,
  duplicatedIcoFaviconDeclarations = 78,
  icoFaviconDeclared = 12,
  icoFaviconImplicitInRoot = 13,
  noIcoFaviconHref = 14,
  icoFavicon404 = 15,
  icoFaviconCannotGet = 16,
  icoFaviconDownloadable = 17,
  icoFaviconExtraSizes = 18,
  icoFaviconMissingSizes = 19,
  icoFaviconExpectedSizes = 20,
  icoFaviconUnreadable = 89,
  icoFaviconIsHtml = 92,

  noDesktopPngFavicon = 21,
  no96x96DesktopPngFavicon = 22,
  desktopPngFaviconDeclared = 23,
  noDesktopPngFaviconHref = 24,
  desktopPngFaviconCannotGet = 25,
  desktopPngFaviconDownloadable = 26,
  desktopPngFavicon404 = 27,
  desktopPngFaviconWrongSize = 28,
  desktopPngFaviconRightSize = 29,
  desktopPngFaviconUnreadable = 88,

  noTouchWebAppTitle = 30,
  multipleTouchWebAppTitles = 31,
  emptyTouchWebAppTitle = 32,
  touchWebAppTitleDeclared = 33,
  noTouchIcon = 34,
  multipleTouchIcons = 80,
  duplicatedTouchIconSizes = 35,
  touchIconDeclared = 37,
  touchIconImplicitInRoot = 93,
  noTouchIconHref = 38,
  touchIcon404 = 39,
  touchIconCannotGet = 40,
  touchIconDownloadable = 41,
  touchIconSquare = 42,
  touchIconNotSquare = 44,
  touchIconNonSquareSizes = 85,
  touchIconSizeMismatch = 84,
  touchIcon180x180 = 43,
  noTouchIcon180x180 = 86,
  touchIconLegacyIosSize = 81,
  touchIconRedundantIosSize = 82,
  touchIconWrongSize = 45,
  touchIconTooBig = 83,
  touchIconUnreadable = 90,

  noManifest = 46,
  noManifestHref = 47,
  manifest404 = 48,
  manifestCannotGet = 49,
  manifestInvalidJson = 50,
  manifestName = 51,
  noManifestName = 52,
  manifestShortName = 53,
  noManifestShortName = 54,
  manifestBackgroundColor = 55,
  noManifestBackgroundColor = 56,
  manifestThemeColor = 57,
  noManifestThemeColor = 58,
  noManifestIcons = 59,
  noManifestIcon = 60,
  manifestIconDeclared = 61,
  manifestIconCannotGet = 62,
  manifestIconDownloadable = 63,
  manifestIcon404 = 64,
  manifestIconNoHref = 65,
  manifestIconNotSquare = 66,
  manifestIconRightSize = 67,
  manifestIconSquare = 68,
  manifestIconWrongSize = 69,
  manifestIconUnreadable = 91,

  googleNoRobotsFile = 70,
  googleRobotsFileFound = 71,
  googleIcoBlockedByRobots = 72,
  googleIcoAllowedByRobots = 73,
  googleSvgIconBlockedByRobots = 74,
  googleSvgIconAllowedByRobots = 75,
  googlePngIconBlockedByRobots = 76,
  googlePngIconAllowedByRobots = 77,
}

export type CheckerMessage = {
  status: CheckerStatus;
  id: MessageId;
  text: string;
};

export type FetchResponse = {
  status: number;
  contentType: string | null;
  readableStream?: ReadableStream | null;
};

export type Fetcher = (url: string, contentType?: string) => Promise<FetchResponse>;

export type CheckedIcon = {
  content: string | null;
  url: string | null;
  width: number | null;
  height: number | null;
};

export type DesktopSingleReport = {
  messages: CheckerMessage[];
  icon: CheckedIcon | null;
};

export type DesktopFaviconReport = {
  messages: CheckerMessage[];
  icon: string | null;
  icons: {
    png: CheckedIcon | null;
    ico: CheckedIcon | null;
    svg: CheckedIcon | null;
  };
};

export type TouchIconTitleReport = {
  messages: CheckerMessage[];
  appTitle?: string;
};

export type TouchIconIconReport = {
  messages: CheckerMessage[];
  icon: CheckedIcon | null;
};

export type WebAppManifestReport = {
  messages: CheckerMessage[];
  name?: string;
  shortName?: string;
  backgroundColor?: string;
  themeColor?: string;
  icon: CheckedIcon | null;
};

export type FaviconReport = {
  pageTitle?: string;
  desktop: DesktopFaviconReport;
  touchIcon: TouchIconReport;
  webAppManifest: WebAppManifestReport;
};

export type TouchIconReport = TouchIconIconReport & TouchIconTitleReport;

export type GoogleReport = {
  messages: CheckerMessage[];
  icon: string | null;
  icons: CheckedIcon[];
};
