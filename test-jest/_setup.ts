// add all jest-extended matchers
import * as matchers from 'jest-extended';
expect.extend(matchers);

console.log('turning off console');

jest.spyOn(global.console, 'log').mockImplementation(jest.fn());
jest.spyOn(global.console, 'info').mockImplementation(jest.fn());
jest.spyOn(global.console, 'debug').mockImplementation(jest.fn());
const nodeFetch = require('node-fetch');
if (!globalThis.fetch) {
  console.log('setting up node fetch polyfill');
  globalThis.fetch = nodeFetch.default;
  globalThis.Headers = nodeFetch.Headers;
  globalThis.Request = nodeFetch.Request;
  globalThis.Response = nodeFetch.Response;
}
