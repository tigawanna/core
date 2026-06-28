import { ImageAdapter, whitenFullyTransparentPixels } from '@realfavicongenerator/generate-favicon';
import { SVG, Svg, registerWindow } from '@svgdotjs/svg.js';
import sharp from 'sharp';

const dataUrlToBuffer = async (dataUrl: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const base64 = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    resolve(buffer);
  });
}

export const getNodeImageAdapter = async (): Promise<ImageAdapter> => {
  const { createSVGWindow } = await import('svgdom');

  return {
    createSvg: () => {
      const window = createSVGWindow();
      const document = window.document
      registerWindow(window, document);
      return SVG(document.documentElement) as Svg;
    },
    convertSvgToPng: async (svg: Svg) => {
      const svgBuffer = Buffer.from(svg.svg());
      // ensureAlpha() guarantees 4-channel RGBA so the transparent-background
      // fixup (shared with all adapters) can run before re-encoding.
      const { data, info } = await sharp(svgBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      whitenFullyTransparentPixels(data);
      return sharp(data, {
        raw: { width: info.width, height: info.height, channels: info.channels },
      })
        .png()
        .toBuffer();
    },
    getImageSize: async (dataUrl: string) => {
      const buffer = await dataUrlToBuffer(dataUrl);
      return new Promise((resolve, reject) => {
        sharp(buffer)
        .metadata()
        .then(metadata => {
          const width = metadata.width;
          const height = metadata.height;
          if (width === undefined || height === undefined) {
            reject('Failed to get image metadata');
          } else {
            resolve({ width, height });
          }
        })
        .catch(err => {
          reject(err);
        });
      });
    },
    getImageData: async (dataUrl: string, widthHeight: number) => {
      const buffer = await dataUrlToBuffer(dataUrl);
      return new Promise((resolve, reject) => {
        sharp(buffer)
          .resize(widthHeight, widthHeight)
          .raw()
          .toBuffer((err, data, info) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          });
      });
    }
  }
};
