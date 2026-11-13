(() => {
  "use strict";

  // Navigation and page requests use the GX Wisp transport.
  
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
      'window.addEventListener("message",function(ev){var d=ev.data;if(!d||d.type!=="wisp:fetch:response")return;var p=pending.get(d.id);if(!p)return;pending.delete(d.id);if(d.error){p.reject(new TypeError(d.error));return;}try{var rb=(d.body&&d.body.byteLength)?new Uint8Array(d.body):null;if(d.status===204||d.status===205||d.status===304)rb=null;p.resolve(new Response(rb,{status:d.status,statusText:d.statusText,headers:d.headers||[]}));}catch(err){p.reject(err);}});' +
      'window.fetch=async function(input,init){var req=input instanceof Request?input:null;var url=new URL(req?req.url:String(input),document.baseURI);if(url.protocol!=="http:"&&url.protocol!=="https:")return nativeFetch(input,init);var method=(init&&init.method)||(req&&req.method)||"GET";var headers=new Headers(req?req.headers:undefined);if(init&&init.headers)new Headers(init.headers).forEach(function(v,k){headers.set(k,v);});var body=init&&Object.prototype.hasOwnProperty.call(init,"body")?init.body:undefined;if(body===undefined&&req&&method!=="GET"&&method!=="HEAD")body=await req.clone().arrayBuffer();if(body instanceof URLSearchParams){if(!headers.has("content-type"))headers.set("content-type","application/x-www-form-urlencoded;charset=UTF-8");body=body.toString();}if(body instanceof Blob)body=await body.arrayBuffer();var id=++nextId;var opts={method:method,headers:Array.from(headers.entries()),credentials:(init&&init.credentials)||(req&&req.credentials)||"same-origin",redirect:(init&&init.redirect)||(req&&req.redirect)||"follow"};return new Promise(function(resolve,reject){pending.set(id,{resolve:resolve,reject:reject});var msg={type:"wisp:fetch",id:id,url:url.href,options:opts,body:body};try{window.parent.postMessage(msg,"*",body instanceof ArrayBuffer?[body]:[]);}catch(err){pending.delete(id);reject(err);}});};' +
      'document.addEventListener("click",function(ev){var a=ev.target.closest&&ev.target.closest("a[href]");if(!a||a.hasAttribute("download"))return;var target=a.getAttribute("target");if(target&&target!=="_self")return;var u=new URL(a.href,document.baseURI);if(u.protocol!=="http:"&&u.protocol!=="https:")return;var b=new URL(document.baseURI);if(u.origin===b.origin&&u.pathname===b.pathname&&u.search===b.search)return;ev.preventDefault();window.parent.postMessage({type:"nav",url:u.href},"*");},true);' +
      'document.addEventListener("submit",function(ev){var f=ev.target;if(!f||String(f.method||"get").toLowerCase()!=="get")return;var u=new URL(f.action||document.baseURI,document.baseURI);var q=new URLSearchParams(new FormData(f));u.search=q.toString();ev.preventDefault();window.parent.postMessage({type:"nav",url:u.href},"*");},true);' +
      '}catch(e){console.warn("Wisp page bridge:",e);}})();</script>';
    const inspector = `<script>
(function(){
 if(window.__safariInspectorInstalled)return;window.__safariInspectorInstalled=true;
 var ids=new WeakMap(),byId={},next=0,inspectMode=false;
 function idFor(n){if(!ids.has(n)){ids.set(n,++next);byId[next]=n;}return ids.get(n);}
 function pathFor(el){var p=[],n=el;while(n&&n.nodeType===1&&n!==document.documentElement){var par=n.parentElement;if(!par)break;p.unshift(Array.prototype.indexOf.call(par.children,n));n=par;}return p;}
 function send(type,data){try{parent.postMessage({type:type,data:data||{}},"*");}catch(e){}}
 function describe(n,depth){if(!n||n.nodeType!==1)return null;var a={};Array.prototype.slice.call(n.attributes||[]).slice(0,40).forEach(function(x){a[x.name]=x.value;});var o={id:idFor(n),tag:n.tagName.toLowerCase(),attrs:a,text:n.children.length?"":(n.textContent||"").trim().slice(0,150),path:pathFor(n),children:[]};if(depth>0)Array.prototype.slice.call(n.children||[]).slice(0,70).forEach(function(c){var x=describe(c,depth-1);if(x)o.children.push(x);});return o;}
 function snapshot(){try{send("inspector:dom",{tree:describe(document.documentElement,8),url:location.href,title:document.title});}catch(e){send("inspector:error",{message:String(e)});}}
 var timer;function changed(){clearTimeout(timer);timer=setTimeout(snapshot,200);}
 try{new MutationObserver(changed).observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});}catch(e){}
 function selected(el){var s=getComputedStyle(el),styles={};["display","position","width","height","margin","padding","color","backgroundColor","fontSize","fontFamily","border","opacity","zIndex","overflow"].forEach(function(k){styles[k]=s[k];});var attrs={};Array.prototype.slice.call(el.attributes||[]).forEach(function(a){attrs[a.name]=a.value;});send("inspector:selected",{id:idFor(el),tag:el.tagName.toLowerCase(),attrs:attrs,text:(el.textContent||"").trim().slice(0,300),path:pathFor(el),styles:styles,html:el.outerHTML.slice(0,3500)});}
 document.addEventListener("click",function(e){if(!inspectMode)return;e.preventDefault();e.stopPropagation();selected(e.target);},true);
 ["log","info","warn","error","debug"].forEach(function(k){var orig=console[k];console[k]=function(){try{send("inspector:console",{level:k,args:Array.prototype.slice.call(arguments).map(function(v){try{return typeof v==="string"?v:JSON.stringify(v);}catch(e){return String(v);}}).join(" "),time:Date.now()});}catch(e){}return orig.apply(console,arguments);};});
 addEventListener("error",function(e){send("inspector:console",{level:"error",args:(e.message||"Script error")+" · "+(e.filename||"")+":"+(e.lineno||0),time:Date.now()});});
 addEventListener("unhandledrejection",function(e){send("inspector:console",{level:"error",args:"Unhandled rejection: "+String(e.reason),time:Date.now()});});
 try{new PerformanceObserver(function(list){list.getEntries().forEach(function(e){send("inspector:resource",{name:e.name,type:e.initiatorType||"resource",duration:Math.round(e.duration),size:e.transferSize||0});});}).observe({type:"resource",buffered:true});}catch(e){}
 addEventListener("message",function(e){var d=e.data;if(!d||d.type!=="inspector:command")return;var a=d.data||{},el;try{if(a.action==="snapshot")snapshot();else if(a.action==="inspect-mode"){inspectMode=!!a.enabled;document.documentElement.style.cursor=inspectMode?"crosshair":"";}else if(a.action==="highlight"){el=(function(p){var n=document.documentElement;(p||[]).forEach(function(i){n=n&&n.children[i];});return n;})(a.path);if(el){el.scrollIntoView({block:"center"});el.style.outline="2px solid #0a84ff";setTimeout(function(){el.style.outline="";},1000);}}else if(a.action==="select-by-id"){el=byId[a.id];if(el)selected(el);}else if(a.action==="set-style"){el=document.documentElement;(a.path||[]).forEach(function(i){el=el&&el.children[i];});if(el)el.style.setProperty(a.name.replace(/[A-Z]/g,function(m){return "-"+m.toLowerCase();}),a.value);changed();}else if(a.action==="set-attr"){el=document.documentElement;(a.path||[]).forEach(function(i){el=el&&el.children[i];});if(el)el.setAttribute(a.name,a.value);changed();}else if(a.action==="remove"){el=document.documentElement;(a.path||[]).forEach(function(i){el=el&&el.children[i];});if(el&&el!==document.documentElement)el.remove();changed();}}catch(err){send("inspector:error",{message:String(err)});}});
 function reportExtras(){
  try{var items=[];Array.prototype.slice.call(document.scripts||[]).forEach(function(x,i){items.push({kind:"script",url:x.src||"",name:"inline script "+(i+1),preview:x.src?"":(x.textContent||"").slice(0,500)});});
  Array.prototype.slice.call(document.querySelectorAll("link[rel~='stylesheet'],style")).forEach(function(x,i){items.push({kind:"stylesheet",url:x.href||"",name:"inline style "+(i+1),preview:x.tagName==="STYLE"?(x.textContent||"").slice(0,350):""});});send("inspector:sources",{items:items});}catch(e){}
  var storage={localStorage:{},sessionStorage:{},cookies:""};try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);storage.localStorage[k]=localStorage.getItem(k);}}catch(e){storage.localStorageUnavailable=String(e);}
  try{for(var j=0;j<sessionStorage.length;j++){var sk=sessionStorage.key(j);storage.sessionStorage[sk]=sessionStorage.getItem(sk);}}catch(e){storage.sessionStorageUnavailable=String(e);}
  try{storage.cookies=document.cookie;}catch(e){storage.cookiesUnavailable=String(e);}send("inspector:storage",storage);
 }
 send("inspector:ready",{url:location.href});setTimeout(function(){snapshot();reportExtras();},250);
})();
</script>`;
    return /<head\b[^>]*>/i.test(html)
      ? html.replace(/<head\b[^>]*>/i, head => head + bridge + inspector)
      : bridge + inspector + html;
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
       const response = await GXWisp.fetch(url);
       let content = await response.text();
       const base = new URL(url).origin;
       if (!content.toLowerCase().includes("<base")) {
         if (content.toLowerCase().includes("<head")) content = content.replace(/<head[^>]*>/i, `$&<base href="${url}">`);
         else content = `<base href="${url}">` + content;
       }

       content = injectWispBridge(content);
       const frame = $(`#frame-${tab.id}`);
       frame.removeAttribute("srcdoc");
       frame.srcdoc = content;
       frame.style.background = "#fff";
       frame.sandbox = "allow-forms allow-scripts allow-popups allow-modals";
       
       const m = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
       const title = m ? m[1].trim() : new URL(url).hostname;
       finishLoad(tab, title);

    } catch (e) {
       renderError(tab, url, "All GX Wisp relays timed out, rejected the connection, or could not fetch this page.");
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

  window.addEventListener("message", async (e) => {
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
        window.dispatchEvent(new CustomEvent("safari:wisp-response", { detail: { id: e.data.id, url: e.data.url, status: response.status } }));
        e.source.postMessage({ type: "wisp:fetch:response", id: e.data.id, status: response.status, statusText: response.statusText, headers: Array.from(response.headers.entries()), body }, "*", [body]);
      } catch (error) {
        window.dispatchEvent(new CustomEvent("safari:wisp-response", { detail: { id: e.data.id, url: e.data.url, status: "failed" } }));
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