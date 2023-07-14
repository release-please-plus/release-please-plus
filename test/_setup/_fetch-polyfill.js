// nock doesn't support native fetch, and hence we need this polyfill.
const nodeFetch = require('node-fetch');
if (!globalThis.fetch) {
  globalThis.fetch = nodeFetch.default;
  globalThis.Headers = nodeFetch.Headers;
  globalThis.Request = nodeFetch.Request;
  globalThis.Response = nodeFetch.Response;
}
