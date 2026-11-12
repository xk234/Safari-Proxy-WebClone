/* GX Wisp networking adapter.
 * Relay pool/selection behavior adapted from GUST-XK-IMPROVED.html.
 * HTTPS transport: libcurl.js 0.7.4 (ading2210), LGPL-3.0-or-later.
 * Runtime is pinned to the upstream 0.7.4 browser JS + WASM files on jsDelivr.
 */
(() => {
  "use strict";
  const LIBCURL_JS = "https://cdn.jsdelivr.net/npm/libcurl.js@0.7.4/libcurl.js";
  const LIBCURL_WASM = "https://cdn.jsdelivr.net/npm/libcurl.js@0.7.4/libcurl.wasm";
  const DEFAULTS = [
  "wss://wisp.rhw.one/wisp/",
  "wss://definitelyscience.com/wisp/",
  "wss://mages.io/wisp/",
  "wss://lichology.com/wisp/",
  "wss://motor-cycle-part.org/wisp/",
  "wss://area.forwardersoft.com/wisp/",
  "wss://truf.the-nest.at/wisp/",
  "wss://thoughts.forwardersoft.com/wisp/",
  "wss://wisp.terbiumon.top/wisp/",
  "wss://anura.pro/",
  "wss://wisp.mercurywork.shop/",
  "wss://nebulaproxy.io/wisp/",
  "wss://invisiproxy.com/wisp/",
  "wss://english.algebra.teacher.vocabulary.homework.forwardersoft.com/wisp/"
];
  const STORE = {
    preferred: "gx:wisp:v1",
    fastest: "gx:wisp:fastest:v1",
    health: "gx:wisp:health:v1",
    custom: "gx:fallback:wisp"
  };
  const COOLDOWN_MS = 5 * 60 * 1000;
  const TIMEOUT_MS = 9000;
  const RUNTIME_STATE_KEY = "__GX_LIBCURL_RUNTIME_V1__";
  let activeRelay = "";
  let requestQueue = Promise.resolve();
  const sessions = new Map();

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  };
  function readHealth() {
    try { return JSON.parse(storage.get(STORE.health) || "{}"); } catch (_) { return {}; }
  }
  function writeHealth(value) { storage.set(STORE.health, JSON.stringify(value)); }
  function hostOf(url) { try { return new URL(url).hostname; } catch (_) { return "unknown"; } }
  function getWispPool() {
    return [...new Set([
      ...DEFAULTS,
      storage.get(STORE.preferred),
      storage.get(STORE.fastest),
      storage.get(STORE.custom)
    ].filter(Boolean))];
  }
  function rankPoolCandidates(host) {
    const health = readHealth();
    const now = Date.now();
    const preferred = storage.get(STORE.preferred);
    const fastest = storage.get(STORE.fastest);
    return getWispPool().map((url, index) => {
      const item = health[url] && health[url][host] || {};
      return { url, index, latency: Number(item.latency) || 0,
        failedUntil: Number(item.failedUntil) || 0,
        preferred: url === preferred, fastest: url === fastest };
    }).filter(x => x.failedUntil <= now)
      .sort((a, b) => Number(b.preferred) - Number(a.preferred)
        || Number(b.fastest) - Number(a.fastest)
        || (a.latency && b.latency ? a.latency - b.latency : a.latency ? -1 : b.latency ? 1 : a.index - b.index));
  }
  function rememberResult(url, host, ok, latency) {
    const health = readHealth();
    health[url] = health[url] || {};
    health[url][host] = ok
      ? { latency: Math.round(latency), failedUntil: 0, lastOk: Date.now() }
      : { ...(health[url][host] || {}), failedUntil: Date.now() + COOLDOWN_MS, lastFail: Date.now() };
    writeHealth(health);
    if (ok) storage.set(STORE.fastest, url);
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load libcurl.js from " + src));
      document.head.appendChild(script);
    });
  }
  function getRuntimeState() {
    // Shared on window so duplicate adapter instances cannot inject libcurl twice.
    if (!window[RUNTIME_STATE_KEY]) {
      window[RUNTIME_STATE_KEY] = { scriptPromise: null, wasmPromise: null };
    }
    return window[RUNTIME_STATE_KEY];
  }
  async function ensureRuntime() {
    const state = getRuntimeState();
    let existing = window.GXLibcurl || null;

    // libcurl.js declares a top-level lexical "const libcurl", not window.libcurl.
    // A later classic script can still see that binding, so reuse it before injecting.
    if (!existing) {
      try {
        if (typeof libcurl !== "undefined") existing = libcurl;
      } catch (_) {}
    }
    if (existing) {
      window.GXLibcurl = existing;
      if (!state.scriptPromise) state.scriptPromise = Promise.resolve(existing);
    }

    if (!state.scriptPromise) {
      state.scriptPromise = loadScript(LIBCURL_JS).then(() => {
        let runtime = window.GXLibcurl || null;
        if (!runtime) {
          try {
            if (typeof libcurl !== "undefined") runtime = libcurl;
          } catch (_) {}
        }
        if (!runtime) throw new Error("libcurl.js loaded but its lexical libcurl binding was not found");
        window.GXLibcurl = runtime;
        return runtime;
      });
    }

    if (!state.wasmPromise) {
      state.wasmPromise = state.scriptPromise.then(async runtime => {
        if (!runtime.ready) await runtime.load_wasm(LIBCURL_WASM);
        if (!runtime.ready) throw new Error("libcurl.js WASM initialization did not complete");
        return runtime;
      }).catch(error => {
        // Keep the successfully loaded JS promise; retry only WASM initialization.
        state.wasmPromise = null;
        throw error;
      });
    }
    return state.wasmPromise;
  }
  function getSession(libcurl, relay) {
    let session = sessions.get(relay);
    if (!session) {
      session = new libcurl.HTTPSession({ enable_cookies: true });
      session.set_connections(24, 18, 8);
      sessions.set(relay, session);
    }
    return session;
  }
  async function fetchOnce(libcurl, relay, url, options) {
    libcurl.set_websocket(relay);
    const session = getSession(libcurl, relay);
    const controller = new AbortController();
    const externalSignal = options && options.signal;
    const onAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", onAbort, { once: true });
    }
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = performance.now();
    try {
      const fetchOptions = { ...(options || {}), signal: controller.signal };
      const response = await session.fetch(url, fetchOptions);
      const bytes = await response.arrayBuffer();
      const latency = performance.now() - started;
      rememberResult(relay, hostOf(url), true, latency);
      activeRelay = relay;
      return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      rememberResult(relay, hostOf(url), false, 0);
      try { session.close(); } catch (_) {}
      sessions.delete(relay);
      throw error;
    } finally {
      clearTimeout(timeout);
      if (externalSignal) externalSignal.removeEventListener("abort", onAbort);
    }
  }
  async function fetchInternal(url, options = {}) {
    const libcurl = await ensureRuntime();
    const host = hostOf(url);
    const candidates = rankPoolCandidates(host);
    if (activeRelay) candidates.sort((a, b) => Number(b.url === activeRelay) - Number(a.url === activeRelay));
    if (!candidates.length) throw new Error("No Wisp relays are currently eligible; wait for cooldown or reset the relay pool.");
    const errors = [];
    for (const candidate of candidates) {
      try {
        return await fetchOnce(libcurl, candidate.url, url, options);
      } catch (error) {
        errors.push(candidate.url + ": " + (error && error.message || error));
      }
    }
    throw new Error("Every GX Wisp relay failed. " + errors.join(" | "));
  }
  function fetch(url, options = {}) {
    const run = requestQueue.then(() => fetchInternal(url, options));
    requestQueue = run.catch(() => {});
    return run;
  }
  function setPreferred(url) {
    const value = String(url || "").trim();
    if (!value) { storage.set(STORE.preferred, ""); return; }
    if (!/^wss:\/\//i.test(value)) throw new Error("Wisp relay must begin with wss://");
    storage.set(STORE.preferred, value.replace(/\s+/g, ""));
    activeRelay = "";
  }
  function openSettings() {
    const current = storage.get(STORE.preferred) || activeRelay || DEFAULTS[0];
    const answer = window.prompt(
      "Preferred Wisp relay (wss://...). Leave blank to use the GX relay pool.\n\nGX defaults: " + DEFAULTS.length,
      current
    );
    if (answer === null) return;
    if (!answer.trim()) {
      storage.set(STORE.preferred, "");
      storage.set(STORE.fastest, "");
      alert("GX Wisp default pool restored.");
      return;
    }
    try {
      setPreferred(answer);
      alert("Preferred Wisp relay saved. It will be tested on the next navigation.");
    } catch (error) { alert(error.message); }
  }
  window.GXWisp = {
    defaults: DEFAULTS.slice(),
    fetch,
    ensureRuntime,
    getWispPool,
    get activeRelay() { return activeRelay; },
    openSettings,
    reset() {
      storage.set(STORE.preferred, "");
      storage.set(STORE.fastest, "");
      storage.set(STORE.health, "{}");
      activeRelay = "";
      for (const session of sessions.values()) { try { session.close(); } catch (_) {} }
      sessions.clear();
    }
  };
})();