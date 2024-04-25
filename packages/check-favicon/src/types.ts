
export enum CheckerStatus {
  Ok = 'Ok',
  Error = 'Error',
  Warning = 'Warning'
}

export enum MessageId {
  noHead,

  svgFaviconDeclared,
  noSvgFavicon,
  multipleSvgFavicons,
  noSvgFaviconHref,
  svgFavicon404,
  svgFaviconCannotGet,
  svgFaviconDownloadable,
  svgFaviconSquare,
  svgFaviconNotSquare,

  noIcoFavicon,
  multipleIcoFavicons,
  icoFaviconDeclared,
  noIcoFaviconHref,
  icoFavicon404,
  icoFaviconCannotGet,
  icoFaviconDownloadable,
  icoFaviconExtraSizes,
  icoFaviconMissingSizes,
  icoFaviconExpectedSizes,

  noDesktopPngFavicon,
  no48x48DesktopPngFavicon,
  desktopPngFaviconDeclared,
  noDesktopPngFaviconHref,
  desktopPngFaviconCannotGet,
  desktopPngFaviconDownloadable,
  desktopPngFavicon404,
  desktopPngFaviconWrongSize,
  desktopPngFaviconRightSize,

  noTouchWebAppTitle,
  multipleTouchWebAppTitles,
  emptyTouchWebAppTitle,
  touchWebAppTitleDeclared,
  noTouchIcon,
  duplicatedTouchIconSizes,
  touchIconWithSize,
  touchIconDeclared,
  noTouchIconHref,
  touchIcon404,
  touchIconCannotGet,
  touchIconDownloadable,
  touchIconSquare,
  touchIcon180x180,
  touchIconNotSquare,
  touchIconWrongSize,

  noManifest,
  noManifestHref,
  manifest404,
  manifestCannotGet,
  manifestInvalidJson,
  manifestName,
  noManifestName,
  manifestShortName,
  noManifestShortName,
  manifestBackgroundColor,
  noManifestBackgroundColor,
  manifestThemeColor,
  noManifestThemeColor,
  noManifestIcons,
  noManifestIcon,
  manifestIconDeclared,
  manifestIconCannotGet,
  manifestIconDownloadable,
  manifestIcon404,
  manifestIconNoHref,
  manifestIconNotSquare,
  manifestIconRightSize,
  manifestIconSquare,
  manifestIconWrongSize
}

export type CheckerMessage = {
  status: CheckerStatus,
  id: MessageId,
  text: string
}

export type FetchResponse = {
  status: number,
  contentType: string | null,
  readableStream?: ReadableStream | null
}

export type Fetcher = (url: string, contentType?: string) => Promise<FetchResponse>;

export type DesktopFaviconReport = {
  messages: CheckerMessage[],
  icon: string | null,
}

export type TouchIconTitleReport = {
  messages: CheckerMessage[],
  appTitle?: string
}

export type TouchIconIconReport = {
  messages: CheckerMessage[],
  touchIcon: string | null,
}

export type WebManifestReport = {
  messages: CheckerMessage[],
  name?: string,
  shortName?: string,
  backgroundColor?: string,
  themeColor?: string,
  icon: string | null
}

export type FaviconReport = {
  desktop: DesktopFaviconReport,
  touchIcon: TouchIconReport,
  webAppManifest: WebManifestReport
}

export type TouchIconReport = TouchIconIconReport & TouchIconTitleReport;
