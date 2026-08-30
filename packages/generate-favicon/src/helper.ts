import { Svg } from '@svgdotjs/svg.js';

export const convertBufferToDataUrl = (content: Buffer, mimeType: string): string => {
  return `data:${mimeType};base64,${content.toString('base64')}`;
};

// When an SVG rasterizes to a transparent background, the rasterizer leaves the
// fully transparent pixels as (0, 0, 0, 0). Most consumers honor the alpha
// channel, but some (notably Google search results) discard it, which turns
// that "transparent black" into an opaque black background. Repaint fully
// transparent pixels white so that, if the alpha channel is dropped, the
// background degrades to white instead of black. Pixels with any opacity are
// left untouched, so correctly rendered output is unchanged.
//
// This is platform-agnostic policy: it operates on a raw RGBA pixel buffer, so
// every ImageAdapter (Node/Sharp, browser/Canvas, ...) shares the same rule.
// The structural type accepts a Node Buffer, a Uint8Array and a browser
// Uint8ClampedArray (e.g. ImageData.data) without coupling to any of them.
type MutableRgbaBuffer = { readonly length: number; [index: number]: number };

export const whitenFullyTransparentPixels = <T extends MutableRgbaBuffer>(rgba: T): T => {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) {
      rgba[i] = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
    }
  }
  return rgba;
};

export const convertSvgToDataUrl = (svg: Svg): string => {
  return convertBufferToDataUrl(Buffer.from(svg.svg()), 'image/svg+xml');
};
