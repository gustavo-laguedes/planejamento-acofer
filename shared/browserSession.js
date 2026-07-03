const BROWSER_SESSION_KEY = 'planejamento_browser_session_id';
const TAB_SESSION_KEY = 'planejamento_tab_session_id';
const TAB_BROWSER_KEY = 'planejamento_tab_browser_session_id';
const ACTIVE_TABS_KEY = 'planejamento_active_tabs';
const TAB_TTL_MS = 15000;
const HEARTBEAT_MS = 5000;

function randomId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readActiveTabs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_TABS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeActiveTabs(tabs) {
  localStorage.setItem(ACTIVE_TABS_KEY, JSON.stringify(tabs));
}

const tabSessionId = sessionStorage.getItem(TAB_SESSION_KEY) || randomId();
sessionStorage.setItem(TAB_SESSION_KEY, tabSessionId);

const restoredBrowserSessionId = sessionStorage.getItem(TAB_BROWSER_KEY);
const browserSessionId = restoredBrowserSessionId
  || localStorage.getItem(BROWSER_SESSION_KEY)
  || randomId();
sessionStorage.setItem(TAB_BROWSER_KEY, browserSessionId);
localStorage.setItem(BROWSER_SESSION_KEY, browserSessionId);

function heartbeat() {
  const now = Date.now();
  const tabs = readActiveTabs();
  for (const [id, tab] of Object.entries(tabs)) {
    if (!tab?.updatedAt || now - tab.updatedAt > TAB_TTL_MS) delete tabs[id];
  }
  tabs[tabSessionId] = { browserSessionId, updatedAt: now };
  writeActiveTabs(tabs);
}

function closeLastTab() {
  const now = Date.now();
  const tabs = readActiveTabs();
  delete tabs[tabSessionId];
  for (const [id, tab] of Object.entries(tabs)) {
    if (!tab?.updatedAt || now - tab.updatedAt > TAB_TTL_MS) delete tabs[id];
  }
  writeActiveTabs(tabs);
  const hasOtherTabs = Object.values(tabs).some(tab => tab.browserSessionId === browserSessionId);
  if (hasOtherTabs) return;
  if (localStorage.getItem(BROWSER_SESSION_KEY) === browserSessionId) {
    localStorage.removeItem(BROWSER_SESSION_KEY);
  }
}

heartbeat();
const heartbeatTimer = window.setInterval(heartbeat, HEARTBEAT_MS);
window.addEventListener('storage', event => {
  if (event.key === ACTIVE_TABS_KEY || event.key === BROWSER_SESSION_KEY) heartbeat();
});
window.addEventListener('beforeunload', closeLastTab);

export function getBrowserSessionId() {
  return browserSessionId;
}

export function rememberSessionToken(token) {
  return Boolean(token);
}

export function clearBrowserSession() {
  window.clearInterval(heartbeatTimer);
  const tabs = readActiveTabs();
  delete tabs[tabSessionId];
  writeActiveTabs(tabs);
  if (localStorage.getItem(BROWSER_SESSION_KEY) === browserSessionId) {
    localStorage.removeItem(BROWSER_SESSION_KEY);
  }
  sessionStorage.removeItem(TAB_BROWSER_KEY);
}
