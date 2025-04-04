import fs from 'fs/promises'
import path from 'path';
import { CheckerStatus, FaviconReport, Fetcher } from './types';
import sharp, { FormatEnum } from 'sharp';

export const filePathToReadableStream = async (path: string): Promise<ReadableStream> => {
  const file = await fs.open(path, 'r');
  const stream = file.createReadStream();

  return new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => {
        controller.enqueue(chunk);
      });
      stream.on('close', () => {
        controller.close();
      });
    }
  });
}

export const filePathToString = async (path: string): Promise<string> => (
  fs.readFile(path, 'utf-8')
)

export const stringToReadableStream = (str: string): ReadableStream => {
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(str);

  return new ReadableStream({
    start(controller) {
      controller.enqueue(uint8Array);
      controller.close();
    }
  });
}

export const readableStreamToString = async (readableStream: ReadableStream): Promise<string> => {
  const reader = readableStream.getReader();
  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const { value, done: doneValue } = await reader.read();
    done = doneValue;
    if (value) {
      chunks.push(value);
    }
  }
  const concatenatedChunks = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    concatenatedChunks.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8").decode(concatenatedChunks);
}

export const readableStreamToBuffer = async (readableStream: ReadableStream): Promise<Buffer> => {
  const reader = readableStream.getReader();
  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const { value, done: doneValue } = await reader.read();
    done = doneValue;
    if (value) {
      chunks.push(value);
    }
  }
  const concatenatedChunks = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    concatenatedChunks.set(chunk, offset);
    offset += chunk.length;
  }
  return Buffer.from(concatenatedChunks);
}

export type CheckIconProcessor = {
  noHref: () => void,
  icon404: () => void,
  cannotGet: (httpStatusCode: number) => void,
  downloadable: () => void,
  square: (widthHeight: number) => void,
  notSquare: (width: number, Height: number) => void,
  rightSize: (widthHeight: number) => void,
  wrongSize: (widthHeight: number) => void
}

export const pathToMimeType = (path: string): string => {
  const ext = path.split('.').pop();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'svg':
      return 'image/svg+xml';
    case 'ico':
      return 'image/x-icon';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

export type CheckIconOutput = {
  content: string | null,
  url: string | null,
  width: number | null,
  height: number | null,
}

export const checkIcon = async (
  iconUrl: string | undefined,
  processor: CheckIconProcessor,
  fetcher: Fetcher,
  mimeType: string | undefined,
  expectedWidthHeight?: number
): Promise<CheckIconOutput | null> => {
  if (!iconUrl) {
    processor.noHref();
    return null;
  }

  const res = await fetcher(iconUrl, mimeType);
  if (res.status === 404) {
    processor.icon404();
  } else if (res.status >= 300) {
    processor.cannotGet(res.status);
  } else if (res.readableStream) {
    processor.downloadable();

    const rawContent = await readableStreamToBuffer(res.readableStream);
    const meta = await sharp(rawContent).metadata();

    const contentType = res.contentType || pathToMimeType(iconUrl);

    const content = await bufferToDataUrl(rawContent, contentType);

    if (meta.width && meta.height) {
      if (meta.width !== meta.height) {
        processor.notSquare(meta.width, meta.height);
      } else {
        processor.square(meta.width);

        if (expectedWidthHeight) {
          if (meta.width === expectedWidthHeight) {
            processor.rightSize(meta.width);
          } else {
            processor.wrongSize(meta.width);
          }
        }
      }
    }

    return {
      content,
      url: iconUrl,
      width: meta.width || null,
      height: meta.height || null
    }
  }

  return {
    content: null,
    url: iconUrl,
    width: null,
    height: null
  };
}

export const mergeUrlAndPath = (baseUrl: string, absoluteOrRelativePath: string): string => {
  // If the path is a full URL, return it as is
  if (absoluteOrRelativePath.startsWith('http://') || absoluteOrRelativePath.startsWith('https://')) {
    return absoluteOrRelativePath;
  }

  const url = new URL(baseUrl);

  // Protocol-relative URL
  if (absoluteOrRelativePath.startsWith('//')) {
    return `${url.protocol}${absoluteOrRelativePath}`;
  } else if (absoluteOrRelativePath.startsWith('/')) {
    // If the path starts with a slash, replace the pathname
    return `${url.origin}${absoluteOrRelativePath}`;
  } else {
    // Otherwise, append the path to the existing pathname
    return `${url.href}${url.href.endsWith('/') ? '' : '/'}${absoluteOrRelativePath}`;
  }
}

export const parseSizesAttribute = (sizes: string | undefined | null): number | null => {
  if (!sizes) {
    return null;
  }

  const match = sizes.match(/(\d+)x(\d+)/);
  if (match) {
    if (match[1] !== match[2]) {
      return null;
    }

    return parseInt(match[1]);
  }

  return null;
}

export const bufferToDataUrl = (buffer: Buffer, mimeType: string): string => {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export const filePathToDataUrl = async (filePath: string): Promise<string> => {
  const readStream = await filePathToReadableStream(filePath);
  const rawContent = await readableStreamToBuffer(readStream);
  const contentType = pathToMimeType(filePath);
  return bufferToDataUrl(rawContent, contentType);
}

export const fetchFetcher: Fetcher = async (url, contentType) => {
  const res = await fetch(url, {
    headers: {
      'Content-Type': contentType || pathToMimeType(url),
      'user-agent': 'RealFaviconGenerator Favicon Checker'
    }
  });

  return {
    status: res.status,
    contentType: res.headers.get('Content-Type') || null,
    readableStream: res.body
  }
}

export const reportHasErrors = (report: FaviconReport): boolean => {
  return report.desktop.messages.some(message => message.status === CheckerStatus.Error) ||
    report.touchIcon.messages.some(message => message.status === CheckerStatus.Error) ||
    report.webAppManifest.messages.some(message => message.status === CheckerStatus.Error);
}

export const reportHasWarnings = (report: FaviconReport): boolean => {
  return report.desktop.messages.some(message => message.status === CheckerStatus.Warning) ||
    report.touchIcon.messages.some(message => message.status === CheckerStatus.Warning) ||
    report.webAppManifest.messages.some(message => message.status === CheckerStatus.Warning);
}
