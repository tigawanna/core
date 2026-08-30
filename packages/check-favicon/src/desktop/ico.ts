import { CheckedIcon, CheckerMessage, CheckerStatus, DesktopSingleReport, Fetcher, MessageId } from '../types';
import { HTMLElement } from 'node-html-parser';
import { bufferToDataUrl, mergeUrlAndPath, readableStreamToBuffer } from '../helper';
import { findIconDeclarations, resolveIconDeclarations } from './declarations';
import decodeIco from 'decode-ico';

export const IcoFaviconSizes = [48, 32, 16];

export const checkIcoFavicon = async (
  url: string,
  head: HTMLElement | null,
  fetcher: Fetcher,
): Promise<DesktopSingleReport> => {
  const messages: CheckerMessage[] = [];

  if (!head) {
    messages.push({
      status: CheckerStatus.Error,
      id: MessageId.noHead,
      text: 'No <head> element',
    });

    return {
      messages,
      icon: { content: null, url: null, width: null, height: null },
    };
  }

  const icos = findIconDeclarations(url, head, 'ico');
  const { withHref, distinctUrls, winner } = resolveIconDeclarations(icos);

  let iconUrl: string | null = null;
  let images;
  let isDeclared = false;

  if (icos.length > 0) {
    isDeclared = true;
    messages.push({
      status: CheckerStatus.Ok,
      id: MessageId.icoFaviconDeclared,
      text: 'The ICO favicon is declared',
    });

    if (!winner) {
      messages.push({
        status: CheckerStatus.Error,
        id: MessageId.noIcoFaviconHref,
        text: 'The ICO markup has no href attribute',
      });
    } else {
      if (distinctUrls.length > 1) {
        messages.push({
          status: CheckerStatus.Warning,
          id: MessageId.multipleIcoFavicons,
          text: `There are ${distinctUrls.length} ICO favicons (${distinctUrls.join(', ')}). Browsers use the last one, ${winner.url}`,
        });
      } else if (withHref.length > 1) {
        messages.push({
          status: CheckerStatus.Warning,
          id: MessageId.duplicatedIcoFaviconDeclarations,
          text: `The ICO favicon ${winner.url} is declared ${withHref.length} times`,
        });
      }

      iconUrl = winner.url;
    }
  } else {
    // No declared ICO favicon, try the implicit /favicon.ico convention
    iconUrl = mergeUrlAndPath(url, '/favicon.ico');
  }

  // If we have an iconUrl (either from declaration or implicit), try to fetch it
  if (iconUrl) {
    const iconResponse = await fetcher(iconUrl, 'image/x-icon');
    if (iconResponse.status === 404) {
      if (isDeclared) {
        messages.push({
          status: CheckerStatus.Error,
          id: MessageId.icoFavicon404,
          text: `ICO favicon not found at ${iconUrl}`,
        });
      } else {
        // Implicit favicon not found, report no ICO favicon
        messages.push({
          status: CheckerStatus.Error,
          id: MessageId.noIcoFavicon,
          text: 'There is no ICO favicon',
        });
        iconUrl = null;
      }
    } else if (iconResponse.status >= 300 || !iconResponse.readableStream) {
      if (isDeclared) {
        messages.push({
          status: CheckerStatus.Error,
          id: MessageId.icoFaviconCannotGet,
          text: `Error fetching ICO favicon at ${iconUrl} (status ${iconResponse.status})`,
        });
      } else {
        // Implicit favicon cannot be fetched, report no ICO favicon
        messages.push({
          status: CheckerStatus.Error,
          id: MessageId.noIcoFavicon,
          text: 'There is no ICO favicon',
        });
        iconUrl = null;
      }
    } else {
      if (!isDeclared) {
        messages.push({
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconImplicitInRoot,
          text: 'An implicit ICO favicon is found at /favicon.ico',
        });
      }

      messages.push({
        status: CheckerStatus.Ok,
        id: MessageId.icoFaviconDownloadable,
        text: 'ICO favicon found',
      });

      const iconBuffer = await readableStreamToBuffer(iconResponse.readableStream);
      images = decodeIco(new Uint8Array(iconBuffer));

      const imageSizes = images.map(image => `${image.width}x${image.height}`);

      const expectedSizes = IcoFaviconSizes.map(size => `${size}x${size}`);

      const extraSizes = imageSizes.filter(size => !expectedSizes.includes(size));
      if (extraSizes.length > 0) {
        messages.push({
          status: CheckerStatus.Warning,
          id: MessageId.icoFaviconExtraSizes,
          text: `Extra sizes found in ICO favicon: ${extraSizes.join(', ')}`,
        });
      }

      const missingSizes = expectedSizes.filter(size => !imageSizes.includes(size));
      if (missingSizes.length > 0) {
        messages.push({
          status: CheckerStatus.Warning,
          id: MessageId.icoFaviconMissingSizes,
          text: `Missing sizes in ICO favicon: ${missingSizes.join(', ')}`,
        });
      }

      if (extraSizes.length === 0 && missingSizes.length === 0) {
        messages.push({
          status: CheckerStatus.Ok,
          id: MessageId.icoFaviconExpectedSizes,
          text: `The ICO favicon has the expected sizes (${imageSizes.join(', ')})`,
        });
      }
    }
  }

  const theIcon: CheckedIcon = {
    content: null,
    url: iconUrl,
    width: null,
    height: null,
  };
  if (images) {
    const image = images[0];
    const mimeType = image.type === 'bmp' ? 'image/bmp' : 'image/png';
    theIcon.content = bufferToDataUrl(
      Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength),
      mimeType,
    );
    theIcon.width = image.width;
    theIcon.height = image.height;
  }

  return {
    messages,
    icon: theIcon,
  };
};
