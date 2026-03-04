(() => {
  "use strict";

  const PROXIES = [
    { url: "https://api.allorigins.win/get?url=", type: "json" },
    { url: "https://corsproxy.io/?", type: "raw" },
    { url: "https://api.codetabs.com/v1/proxy?quest=", type: "raw" }
  ];
  
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

  async function raceProxies(targetUrl) {
    const promises = PROXIES.map(async (proxy) => {
      try {
        const res = await fetchWithTimeout(proxy.url + encodeURIComponent(targetUrl));
        if (!res.ok) throw new Error("Status " + res.status);
        let text = "";
        if (proxy.type === "json") {
          const json = await res.json();
          text = json.contents;
        } else {
          text = await res.text();
        }
        if (!text || text.length < 50) throw new Error("Empty content");
        return text; 
      } catch (e) { throw e; }
    });
    return await Promise.any(promises);
  }

  function renderStartPage() {
      const favsHTML = favorites.map(f => `
        <div class="fav-card" onclick="window.navigateActiveTab('${f.url}')">
          <div class="fav-icon"><img src="${f.icon}"></div>
          <div class="fav-label">${f.title}</div>
        </div>`).join('');

      startPageOverlay.innerHTML = `
        <div class="internal-page">
          <div class="start-container">
            <div class="section-title">Favorites</div>
            <div class="favorites-grid">${favsHTML}</div>
            
            <div class="section-title">Privacy Report</div>
            <div class="privacy-card">
              <svg class="shield-big" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <div class="privacy-text">
                <h3>0 Trackers Prevented</h3>
                <p>Your IP address was hidden from known trackers.</p>
              </div>
            </div>
          </div>
        </div>`;
  }

  async function navigate(tab, url) {
    tab.loading = true;
    tab.url = url;
    updateUI();

    // 1. START PAGE HANDLING
    if (url === "about:home") {
        renderStartPage();
        finishLoad(tab, "Start Page");
        return;
    }

    if (url.startsWith("data:")) {
       renderInternal(tab, "Data", null);
       setTimeout(() => { $(`#frame-${tab.id}`).src = url; }, 10);
       finishLoad(tab, "Data");
       return;
    }

    try {
       let content = await raceProxies(url);
       const base = new URL(url).origin;
       if (!content.toLowerCase().includes("<base")) {
         if (content.toLowerCase().includes("<head")) content = content.replace(/<head[^>]*>/i, `$&<base href="${url}">`);
         else content = `<base href="${url}">` + content;
       }

       const frame = $(`#frame-${tab.id}`);
       frame.removeAttribute("srcdoc");
       frame.srcdoc = content;
       frame.style.background = "#fff";
       frame.sandbox = "allow-forms allow-scripts allow-popups allow-same-origin allow-modals";
       
       const m = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
       const title = m ? m[1].trim() : new URL(url).hostname;
       finishLoad(tab, title);

    } catch (e) {
       renderError(tab, url, "All connections timed out or were blocked.");
    }
  }

  function renderInternal(tab, title, html) {
    const frame = $(`#frame-${tab.id}`);
    frame.removeAttribute("src");
    frame.style.background = "transparent";
    
    // Inject Basic Styles for Error/Data pages since they are in iframe
    const theme = getThemeColors();
    const styleBlock = `
      <style>
        body { font-family: -apple-system, sans-serif; color: ${theme.text}; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
        .error-card { background: ${theme.bg}; padding: 40px; border-radius: 12px; box-shadow: ${theme.shadow}; text-align: center; max-width: 500px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(128,128,128,0.1); }
        h2 { color: #FF3B30; margin-top: 0; }
        button { background: ${theme.accent}; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; margin-top: 20px; font-size: 13px; }
      </style>
    `;

    if (html) {
        frame.srcdoc = `<!doctype html><html><head>${styleBlock}</head><body>${html}</body></html>`;
    }
    finishLoad(tab, title);
  }

  function finishLoad(tab, title) {
    tab.loading = false;
    tab.title = title;
    updateUI();
  }

  function renderError(tab, url, msg) {
    renderInternal(tab, "Connection Failed", `
      <div class="error-card">
        <h2>Safari cannot open the page</h2>
        <p>The error was: "${escape(msg)}"</p>
        <button onclick="window.parent.navigateActiveTab('${escape(url)}')" >Reload</button>
      </div>
    `);
  }

  function createTab(url = HOMEPAGE) {
    const id = "t-" + Math.random().toString(36).substr(2, 9);
    const iframe = document.createElement("iframe");
    iframe.className = "web-frame";
    iframe.id = "frame-" + id;
    $("#web-content").appendChild(iframe);

    const tab = { id, url, title: "Start Page", loading: false, historyStack: [], historyIdx: -1 };
    tabs.push(tab);
    activateTab(id);
    
    tab.historyStack.push(url);
    tab.historyIdx = 0;
    navigate(tab, url);
  }

  function activateTab(id) {
    activeTabId = id;
    // Hide all iframes
    document.querySelectorAll('.web-frame').forEach(f => f.style.display = 'none');
    updateUI();
  }

  function closeTab(id) {
    if (tabs.length === 1) { navigate(tabs[0], HOMEPAGE); return; }
    const idx = tabs.findIndex(t => t.id === id);
    $(`#frame-${id}`).remove();
    tabs.splice(idx, 1);
    if (activeTabId === id) activateTab(tabs[Math.max(0, idx - 1)].id);
    else updateUI();
  }

  function updateUI() {
    const container = $("#tabs-container");
    container.innerHTML = "";
    
    // 1. Manage Tabs Strip
    const strip = $("#tabs-strip");
    if (tabs.length <= 1) {
      strip.classList.add("hidden");
    } else {
      strip.classList.remove("hidden");
    }

    tabs.forEach(t => {
      const el = document.createElement("div");
      el.className = `tab ${t.id === activeTabId ? 'active' : ''} ${t.loading ? 'loading' : ''}`;
      
      let favSrc = getFavicon(t.url);
      if(t.url === "about:home") favSrc = ""; 

      const imgHtml = favSrc ? `<img class="tab-favicon" src="${favSrc}">` : '';

      el.innerHTML = `
        <div class="tab-icon-area">
          <div class="tab-spinner"></div>
          ${imgHtml}
        </div>
        <span class="tab-title">${escape(t.title)}</span>
        <button class="tab-close" onclick="window.closeTab('${t.id}')">×</button>
      `;
      el.onclick = (e) => { if(!e.target.classList.contains("tab-close")) activateTab(t.id); };
      container.appendChild(el);
    });

    // 2. Manage Content Visibility (Overlay vs Iframe)
    const t = tabs.find(x => x.id === activeTabId);
    if (t) {
        if (t.url === "about:home") {
            startPageOverlay.style.display = "block";
            // Make sure the active iframe is hidden
            if($(`#frame-${t.id}`)) $(`#frame-${t.id}`).style.display = "none";
        } else {
            startPageOverlay.style.display = "none";
            // Show the active iframe
            if($(`#frame-${t.id}`)) {
                $(`#frame-${t.id}`).style.display = "block";
                $(`#frame-${t.id}`).classList.add("active");
            }
        }

      $("#urlbar-input").value = t.url === "about:home" ? "" : t.url;
      const wrapper = $("#urlbar-wrapper");
      wrapper.classList.toggle("loading", t.loading);
      
      $("#status-bar").textContent = t.loading ? "Loading..." : "Ready";
      $("#back-btn").disabled = t.historyIdx <= 0;
      $("#forward-btn").disabled = t.historyIdx >= t.historyStack.length - 1;
    }
  }

  function renderBookmarks() {
    const list = $("#bookmarks-list");
    list.innerHTML = "";
    favorites.forEach(f => {
      const item = document.createElement("div");
      item.className = "menu-item";
      item.innerHTML = `<img src="${f.icon}"> ${escape(f.title)}`;
      item.onclick = () => {
          const t = tabs.find(x => x.id === activeTabId);
          navigate(t, f.url);
          $("#bookmarks-popup").classList.remove("show");
      };
      list.appendChild(item);
    });
  }

  // --- GLOBAL HELPERS FOR HTML CLICKS ---
  window.closeTab = (id) => { event.stopPropagation(); closeTab(id); };
  window.navigateActiveTab = (url) => {
      const t = tabs.find(x => x.id === activeTabId);
      if(t) {
          // Push to history
          const norm = normalizeUrl(url);
          t.historyStack = t.historyStack.slice(0, t.historyIdx + 1);
          t.historyStack.push(norm);
          t.historyIdx++;
          navigate(t, norm);
      }
  };

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

  renderBookmarks();
  createTab(HOMEPAGE);

})();