import assert from 'node:assert/strict';

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.style = {};
    this.dataset = {};
    this.value = 'previous.csv';
  }

  append(...children) {
    this.children.push(...children);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  click() {
    for (const listener of this.listeners.get('click') || []) {
      listener({ target: this });
    }
  }

  setAttribute(name, value) {
    this[name] = value;
  }
}

const storage = new Map();
const storageApi = {
  getItem: key => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};

let fileDialogOpenCount = 0;
let importRequest = null;
const createdElements = [];
globalThis.localStorage = storageApi;
globalThis.sessionStorage = storageApi;
globalThis.fetch = async (url, options = {}) => {
  if (url === '/api/auth/config') {
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ publishableKey: 'pk_test' })
    };
  }
  if (url === '/api/imports/csv') {
    importRequest = { url, options };
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ totalRows: 1 })
    };
  }
  throw new Error(`Unexpected fetch: ${url}`);
};
globalThis.window = {
  APP_CONFIG: {},
  location: { hostname: 'localhost' },
  setInterval: () => 1,
  clearInterval: () => {},
  addEventListener: () => {},
  dispatchEvent: () => {},
  prompt: () => ''
};
globalThis.document = {
  createElement(tagName) {
    const element = new TestElement(tagName);
    if (tagName === 'input') {
      element.click = () => {
        fileDialogOpenCount += 1;
      };
    }
    createdElements.push(element);
    return element;
  },
  querySelector: () => null,
  head: {
    appendChild: element => {
      window.Clerk = {
        load: async () => {},
        session: { getToken: async () => 'token' }
      };
      for (const listener of element.listeners.get('load') || []) listener();
    }
  }
};

const { UploadCsvButton } = await import('../shared/UploadCsvButton.js');

const promptCalls = [];
window.prompt = (message, defaultValue) => {
  promptCalls.push({ message, defaultValue });
  return promptCalls.length === 1 ? '2026-09-01' : '2026-09-30';
};

const wrapper = UploadCsvButton({ onImported: () => {} });
const [input, button] = wrapper.children;

button.click();

assert.equal(promptCalls.length, 2);
assert.equal(promptCalls[1].defaultValue, '2026-09-01');
assert.equal(input.hidden, undefined);
assert.equal(input['aria-hidden'], 'true');
assert.equal(input.style.position, 'fixed');
assert.equal(input.value, '');
assert.equal(fileDialogOpenCount, 1);

input.files = [new Blob(['csv'], { type: 'text/csv' })];
await Promise.all((input.listeners.get('change') || []).map(listener => listener()));

assert.equal(importRequest.url, '/api/imports/csv');
assert.equal(importRequest.options.method, 'POST');
assert.equal(importRequest.options.body.get('periodStart'), '2026-09-01');
assert.equal(importRequest.options.body.get('periodEnd'), '2026-09-30');
assert.equal(importRequest.options.body.has('file'), true);
