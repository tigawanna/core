import { parse } from 'node-html-parser';
import { iconMarkupFormat } from './declarations';

const formatOf = (markup: string) => iconMarkupFormat(parse(markup).querySelector('link')!);

test('iconMarkupFormat - a known type is authoritative', () => {
  expect(formatOf('<link rel="icon" type="image/x-icon" href="/favicon.ico">')).toEqual('ico');
  expect(formatOf('<link rel="icon" type="image/vnd.microsoft.icon" href="/favicon">')).toEqual('ico');
  expect(formatOf('<link rel="icon" type="image/svg+xml" href="/favicon.svg">')).toEqual('svg');
  expect(formatOf('<link rel="icon" type="IMAGE/PNG; charset=binary" href="/favicon.png">')).toEqual('png');
  // Even when the extension says otherwise
  expect(formatOf('<link rel="icon" type="image/png" href="/favicon.ico">')).toEqual('png');
});

test('iconMarkupFormat - no type, the href extension decides', () => {
  expect(formatOf('<link rel="icon" href="/favicon.ico?v=2">')).toEqual('ico');
  expect(formatOf('<link rel="icon" href="/favicon.svg">')).toEqual('svg');
  expect(formatOf('<link rel="icon" href="/favicon.png#x">')).toEqual('png');
  expect(formatOf('<link rel="icon" href="/favicon.jpg">')).toBeNull();
  expect(formatOf('<link rel="icon" href="/favicon">')).toBeNull();
  expect(formatOf('<link rel="shortcut icon" href="/favicon">')).toEqual('ico');
});

// Types found in the wild, in the Tranco top 5000: browsers still use those icons
test('iconMarkupFormat - an unknown type falls back to the href extension', () => {
  expect(formatOf('<link rel="shortcut icon" type="image/ico" href="/static/img/bookmark_icon.ico">')).toEqual('ico');
  expect(formatOf('<link rel="icon" type="images/x-icon" href="/favicon.ico">')).toEqual('ico');
  expect(formatOf('<link rel="icon" type="image/icon" href="/favicon.ico">')).toEqual('ico');
  expect(formatOf('<link rel="icon" type="shortcut icon" href="/favicon.ico">')).toEqual('ico');
  expect(formatOf('<link rel="icon" type="image/gif" href="/favicon.ico">')).toEqual('ico');
  expect(formatOf('<link rel="icon" type="image/svg" href="/favicon.svg">')).toEqual('svg');
  expect(formatOf('<link rel="icon" type="images/png" href="/favicon.png">')).toEqual('png');
  expect(formatOf('<link rel="shortcut icon" type="image/ico" href="/favicon">')).toEqual('ico');

  expect(formatOf('<link rel="icon" type="image/jpg" href="/favicon.jpg">')).toBeNull();
  expect(formatOf('<link rel="icon" type="image/ico" href="/favicon">')).toBeNull();
});
