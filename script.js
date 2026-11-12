(() => {
  "use strict";

  // Network transport is provided by GXWisp/libcurl.js.
  
  const HOMEPAGE = "about:home";
  
  const DEFAULTS = {
    favorites: [
      { url: "https://www.apple.com", title: "Apple", icon: "https://www.apple.com/favicon.ico" },
      { url: "https://en.uncyclopedia.co/", title: "Uncyclopedia", icon: "https://upload.wikimedia.org/wikipedia/commons/8/80/Wikipedia-logo-v2.svg" },
      { url: "https://www.bing.com/", title: "Bing", icon: "https://upload.wikimedia.org/wikipedia/commons/9/9c/Bing_Fluent_Logo.svg" },
      { url: "https://www.amazon.com", title: "Amazon", icon: "https://upload.wikimedia.org/wikipedia/commons/4/4a/Amazon_icon.svg" },
      { url: "https://kick.com/browse", title: "Kick", icon: "https://emoji.discadia.com/emojis/34d2e9b2-b9bd-4a49-95c0-0f22fb78fc36.PNG" },
      { url: "https://discord.com", title: "Discord", icon: "https://freelogopng.com/images/all_img/1691730813discord-icon-png.png" },
      { url: "https://www.reddit.com", title: "Reddit", icon: "https://www.redditstatic.com/desktop2x/img/favicon/favicon-96x96.png" },
      { url: "https://store.steampowered.com", title: "Steam", icon: "https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" },
      { url: "https://github.com", title: "GitHub", icon: "https://upload.wikimedia.org/wikipedia/commons/c/c2/GitHub_Invertocat_Logo.svg" }
    ]
  };

  const $ = s => document.querySelector(s);
  const escape = s => (s||"").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  
  function getFavicon(url) {
    if (!url || url.startsWith("about:") || url.startsWith("data:")) return "";
    const fav = favorites.find(f => f.url === url);
    if (fav && fav.icon) return fav.icon;
    try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; } catch { return ""; }
  }

  function normalizeUrl(input) {
    let s = String(input || "").trim();
    if (!s) return "about:blank";
    if (s === "about:home") return s;
    if (s.startsWith("data:")) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.includes(".") && !s.includes(" ")) return "https://" + s;
    return `https://www.bing.com/search?q=${encodeURIComponent(s)}`;
  }

  let tabs = [];
  let activeTabId = null;
  let favorites = [...DEFAULTS.favorites];
  let isLightMode = false;

  // --- INITIALIZATION: Create Overlay for Start Page ---
  // We do this to ensure the start page uses the main window's CSS
  // which fixes the "broken style" issue on local files.
  const webContent = $("#web-content");
  const startPageOverlay = document.createElement("div");
  startPageOverlay.id = "ntp-overlay";
  startPageOverlay.style.display = "none";
  startPageOverlay.style.width = "100%";
  startPageOverlay.style.height = "100%";
  startPageOverlay.style.position = "absolute";
  startPageOverlay.style.top = "0";
  startPageOverlay.style.zIndex = "50";
  webContent.appendChild(startPageOverlay);

  // Helper to grab CSS variables from the root for injection into iframes
  function getThemeColors() {
      const style = getComputedStyle(document.documentElement);
      return {
          bg: style.getPropertyValue('--menu-bg').trim(),
          text: style.getPropertyValue('--tab-text').trim(),
          shadow: style.getPropertyValue('--shadow').trim(),
          accent: style.getPropertyValue('--accent').trim()
      };
  }

  async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 8000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  }

  function injectWispBridge(html) {
    const bridge = '<script>(function(){try{' +
      'var pending=new Map(),nextId=0,nativeFetch=window.fetch.bind(window);' +
      '  window.addEventListener("message", async (e) => {
    const frame = Array.from(document.querySelectorAll("iframe.web-frame")).find(item => item.contentWindow === e.source);
    if (!frame || !e.data) return;
    if (e.data.type === "nav" && typeof e.data.url === "string") {
      window.navigateActiveTab(e.data.url);
      return;
    }
    if (e.data.type === "wisp:fetch" && typeof e.data.url === "string") {
      try {
        const options = { ...(e.data.options || {}) };
        if (e.data.body !== undefined) options.body = e.data.body;
        const response = await GXWisp.fetch(e.data.url, options);
        const body = await response.arrayBuffer();
        e.source.postMessage({ type: "wisp:fetch:response", id: e.data.id, status: response.status, statusText: response.statusText, headers: Array.from(response.headers.entries()), body }, "*", [body]);
      } catch (error) {
        e.source.postMessage({ type: "wisp:fetch:response", id: e.data.id, error: String(error && error.message || error) }, "*");
      }
    }
  });
  $("#tab-strip-plus").onclick = $("#toolbar-plus-btn").onclick = $("#menu-new-tab").onclick = () => { 
    $("#menu-popup").classList.remove("show"); 
    createTab(); 
  };
  
  $("#urlbar-input").onkeydown = (e) => {
    if (e.key === "Enter") {
       window.navigateActiveTab($("#urlbar-input").value);
    }
  };
  $("#reload-btn").onclick = () => { const t = tabs.find(x => x.id === activeTabId); navigate(t, t.url); };
  $("#back-btn").onclick = () => {
    const t = tabs.find(x => x.id === activeTabId);
    if(t.historyIdx > 0) { t.historyIdx--; navigate(t, t.historyStack[t.historyIdx]); }
  };
  $("#forward-btn").onclick = () => {
    const t = tabs.find(x => x.id === activeTabId);
    if(t.historyIdx < t.historyStack.length-1) { t.historyIdx++; navigate(t, t.historyStack[t.historyIdx]); }
  };
  $("#home-btn").onclick = () => { 
     const t = tabs.find(x => x.id === activeTabId); 
     navigate(t, HOMEPAGE); 
  };

  $("#menu-btn").onclick = (e) => { 
    e.stopPropagation(); 
    $("#bookmarks-popup").classList.remove("show");
    $("#menu-popup").classList.toggle("show"); 
  };
  
  $("#bookmarks-btn").onclick = (e) => {
    e.stopPropagation();
    $("#menu-popup").classList.remove("show");
    $("#bookmarks-popup").classList.toggle("show");
  };

  document.addEventListener("click", (e) => {
    if (!$("#menu-btn").contains(e.target) && !$("#menu-popup").contains(e.target)) {
       $("#menu-popup").classList.remove("show");
    }
    if (!$("#bookmarks-btn").contains(e.target) && !$("#bookmarks-popup").contains(e.target)) {
       $("#bookmarks-popup").classList.remove("show");
    }
  });

  $("#menu-theme-toggle").onclick = () => {
     isLightMode = !isLightMode;
     document.body.classList.toggle("light-mode", isLightMode);
     $("#menu-theme-toggle").textContent = isLightMode ? "Switch to Dark Mode" : "Switch to Light Mode";
     
     // Re-render Start Page to update wallpaper if needed
     const t = tabs.find(x => x.id === activeTabId);
     if(t.url === "about:home") {
        renderStartPage();
     }
  };

  const wispSettingsButton = $("#menu-wisp-settings");
  if (wispSettingsButton) wispSettingsButton.onclick = () => {
    $("#menu-popup").classList.remove("show");
    GXWisp.openSettings();
  };

  renderBookmarks();
  createTab(HOMEPAGE);

})();
/* =========================================================================
   WebApp Protection
   ========================================================================= */
  if (window.top !== window.self) {
    if (document.referrer && document.referrer.includes("typespectrum.com")) {
      try {
        // Try to hijack the entire browser tab and redirect to your site
        window.top.location.href = "https://ywa.app";
      } catch (e) {
        // If the browser blocks the hijack, absolutely nuke the iframe content
        document.documentElement.innerHTML = `
          <head>
            <title>ERROR</title>
          </head>
          <body style="margin: 0; padding: 0; overflow: hidden;">
            <div style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #e50000; color: white; z-index: 2147483647; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; font-family: system-ui, -apple-system, sans-serif; padding: 20px; box-sizing: border-box;">
              <h1 style="font-size: clamp(24px, 5vw, 48px); margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 2px;">
                ⚠️ Error ⚠️
              </h1>
              <p style="font-size: clamp(16px, 3vw, 24px); margin: 0 0 10px 0; line-height: 1.5;">
                This WebApp can not be displayed here.
              </p>
              <p style="font-size: clamp(14px, 2.5vw, 20px); margin: 0; line-height: 1.5;">
                Possible Scam site detected</strong>.<br>
                For security, Please visit ywa.app to use it.
              </p>
            </div>
          </body>
        `;
      }
    }
  }