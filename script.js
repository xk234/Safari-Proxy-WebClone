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
    const bridge = "<script>" + "(function(){\n\"use strict\";\nif(window.__GX_REWRITE_BRIDGE__)return;\nwindow.__GX_REWRITE_BRIDGE__=true;\nvar pending=new Map(),nextId=0,nativeFetch=window.fetch.bind(window),nativeSetAttribute=Element.prototype.setAttribute;\nfunction send(url,options,body){\n return new Promise(function(resolve,reject){\n  var id=++nextId;pending.set(id,{resolve:resolve,reject:reject});\n  var msg={type:\"wisp:fetch\",id:id,url:url,options:options||{},body:body};\n  try{window.parent.postMessage(msg,\"*\",body instanceof ArrayBuffer?[body]:[]);}\n  catch(e){pending.delete(id);reject(e);}\n });\n}\nwindow.addEventListener(\"message\",function(ev){\n var d=ev.data;if(!d||d.type!==\"wisp:fetch:response\")return;\n var p=pending.get(d.id);if(!p)return;pending.delete(d.id);\n if(d.error){p.reject(new TypeError(d.error));return;}\n p.resolve(d);\n});\nfunction headersArray(h){var x=new Headers(h||{});return Array.from(x.entries());}\nwindow.fetch=async function(input,init){\n var req=input instanceof Request?input:null;\n var url=new URL(req?req.url:String(input),document.baseURI);\n if(url.protocol!==\"http:\"&&url.protocol!==\"https:\")return nativeFetch(input,init);\n var method=String((init&&init.method)||(req&&req.method)||\"GET\").toUpperCase();\n var headers=new Headers(req?req.headers:undefined);\n if(init&&init.headers)new Headers(init.headers).forEach(function(v,k){headers.set(k,v);});\n var body=init&&Object.prototype.hasOwnProperty.call(init,\"body\")?init.body:undefined;\n if(body===undefined&&req&&method!==\"GET\"&&method!==\"HEAD\")body=await req.clone().arrayBuffer();\n if(body instanceof URLSearchParams){if(!headers.has(\"content-type\"))headers.set(\"content-type\",\"application/x-www-form-urlencoded;charset=UTF-8\");body=body.toString();}\n if(body instanceof Blob)body=await body.arrayBuffer();\n var transfer=body instanceof ArrayBuffer?body:undefined;\n var d=await send(url.href,{method:method,headers:headersArray(headers),credentials:(init&&init.credentials)||(req&&req.credentials)||\"same-origin\",redirect:(init&&init.redirect)||(req&&req.redirect)||\"follow\",cache:(init&&init.cache)||(req&&req.cache)||\"default\"},body);\n var bytes=d.body&&d.body.byteLength?new Uint8Array(d.body):null;\n if(d.status===204||d.status===205||d.status===304)bytes=null;\n return new Response(bytes,{status:d.status,statusText:d.statusText,headers:d.headers||[]});\n};\nfunction GXXHR(){\n this.readyState=0;this.status=0;this.statusText=\"\";this.response=null;this.responseText=\"\";\n this.responseType=\"\";this.responseURL=\"\";this.timeout=0;this.withCredentials=false;\n this.upload={addEventListener:function(){},removeEventListener:function(){},dispatchEvent:function(){}};\n this._headers={};this._responseHeaders={};this._listeners={};this._aborted=false;this._controller=null;\n}\nGXXHR.UNSENT=0;GXXHR.OPENED=1;GXXHR.HEADERS_RECEIVED=2;GXXHR.LOADING=3;GXXHR.DONE=4;\nGXXHR.prototype.addEventListener=function(n,f){(this._listeners[n]||(this._listeners[n]=[])).push(f);};\nGXXHR.prototype.removeEventListener=function(n,f){this._listeners[n]=(this._listeners[n]||[]).filter(function(x){return x!==f;});};\nGXXHR.prototype.dispatchEvent=function(e){this._emit(e.type);return true;};\nGXXHR.prototype._emit=function(n){var self=this,e={type:n,target:this,currentTarget:this};(this._listeners[n]||[]).forEach(function(f){try{f.call(self,e);}catch(x){setTimeout(function(){throw x;});}});if(typeof this[\"on\"+n]===\"function\")try{this[\"on\"+n].call(this,e);}catch(x){}};\nGXXHR.prototype.open=function(method,url,async,user,password){\n this._method=String(method||\"GET\").toUpperCase();this._url=new URL(url,document.baseURI).href;this._async=async!==false;\n this._user=user;this._password=password;this._headers={};this._aborted=false;this.readyState=1;this._emit(\"readystatechange\");\n};\nGXXHR.prototype.setRequestHeader=function(k,v){this._headers[k]=this._headers[k]?this._headers[k]+\", \"+v:String(v);};\nGXXHR.prototype.getResponseHeader=function(k){return this._responseHeaders[String(k).toLowerCase()]||null;};\nGXXHR.prototype.getAllResponseHeaders=function(){return Object.keys(this._responseHeaders).map(function(k){return k+\": \"+this._responseHeaders[k];},this).join(\"\\r\\n\");};\nGXXHR.prototype.overrideMimeType=function(v){this._mime=v;};\nGXXHR.prototype.abort=function(){this._aborted=true;if(this._controller)this._controller.abort();this.readyState=0;this._emit(\"abort\");this._emit(\"loadend\");};\nGXXHR.prototype.send=function(body){\n var self=this;this._controller=new AbortController();\n var timeoutId=this.timeout?setTimeout(function(){self._controller.abort();self._emit(\"timeout\");},this.timeout):null;\n var payload=body;\n if(payload instanceof Document)payload=new XMLSerializer().serializeToString(payload);\n if(payload instanceof URLSearchParams){if(!this._headers[\"Content-Type\"])this._headers[\"Content-Type\"]=\"application/x-www-form-urlencoded;charset=UTF-8\";payload=payload.toString();}\n if(payload instanceof Blob){payload.arrayBuffer().then(function(b){self.send(b);});return;}\n if(payload instanceof ArrayBuffer===false&&ArrayBuffer.isView(payload))payload=payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength);\n var transfer=payload instanceof ArrayBuffer?payload:undefined;\n send(this._url,{method:this._method,headers:headersArray(this._headers),credentials:this.withCredentials?\"include\":\"same-origin\",redirect:\"follow\",signal:this._controller.signal},payload).then(function(d){\n  if(self._aborted)return;\n  self.status=d.status;self.statusText=d.statusText;self.responseURL=self._url;\n  self._responseHeaders={};(d.headers||[]).forEach(function(h){self._responseHeaders[String(h[0]).toLowerCase()]=h[1];});\n  self.readyState=2;self._emit(\"readystatechange\");\n  var bytes=d.body?new Uint8Array(d.body):new Uint8Array(0);\n  self.readyState=3;self._emit(\"readystatechange\");\n  var type=self.responseType;\n  if(type===\"arraybuffer\")self.response=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);\n  else if(type===\"blob\")self.response=new Blob([bytes],{type:self.getResponseHeader(\"content-type\")||\"\"});\n  else if(type===\"json\"){try{self.response=JSON.parse(new TextDecoder().decode(bytes));}catch(e){self.response=null;}}\n  else {self.responseText=new TextDecoder().decode(bytes);self.response=self.responseText;}\n  self.readyState=4;self._emit(\"readystatechange\");self._emit(\"load\");self._emit(\"loadend\");\n }).catch(function(e){if(self._aborted)return;self.readyState=4;self._emit(\"readystatechange\");self._emit(\"error\");self._emit(\"loadend\");})\n .finally(function(){if(timeoutId)clearTimeout(timeoutId);});\n};\nwindow.XMLHttpRequest=GXXHR;\nfunction eligible(el,attr){\n if(!el||!el.getAttribute)return false;\n var raw=el.getAttribute(attr);if(!raw||/^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(raw.trim()))return false;\n var tag=el.tagName.toLowerCase(),rel=(el.getAttribute(\"rel\")||\"\").toLowerCase();\n if(tag===\"link\"&&rel!==\"stylesheet\"&&!/(^|\\s)(icon|manifest)(\\s|$)/.test(rel))return false;\n return /^(script|img|source|video|audio|track|input|link|embed|object)$/.test(tag);\n}\nvar processing=new WeakSet();\nasync function proxyResource(el,attr){\n if(processing.has(el)||!eligible(el,attr))return;\n var raw=el.getAttribute(attr),url;\n try{url=new URL(raw,document.baseURI);if(url.origin===location.origin&&raw.indexOf(\"blob:\")===0)return;}catch(e){return;}\n if(url.protocol!==\"http:\"&&url.protocol!==\"https:\")return;\n processing.add(el);el.setAttribute(\"data-gx-original-\"+attr,raw);\n try{\n  var d=await send(url.href,{method:\"GET\",headers:[[\"Accept\",\"*/*\"]],credentials:\"same-origin\",redirect:\"follow\"});\n  if(d.status<200||d.status>=300)throw new Error(\"HTTP \"+d.status);\n  var bytes=d.body?new Uint8Array(d.body):new Uint8Array(0),type=(d.headers||[]).find(function(h){return String(h[0]).toLowerCase()===\"content-type\";});\n  var mime=type?type[1]:\"application/octet-stream\";\n  if(el.tagName.toLowerCase()===\"link\"&&mime.indexOf(\"text/css\")>=0){\n   var css=new TextDecoder().decode(bytes);css=await rewriteCSS(css,url.href);\n   el.setAttribute(attr,URL.createObjectURL(new Blob([css],{type:\"text/css\"})));\n  }else el.setAttribute(attr,URL.createObjectURL(new Blob([bytes],{type:mime})));\n  el.removeAttribute(\"crossorigin\");el.removeAttribute(\"integrity\");\n }catch(e){console.debug(\"[GX rewrite] Dynamic resource left unchanged:\",url.href,e);}\n}\nasync function rewriteCSS(css,base){\n var matches=[...css.matchAll(/url\\(\\s*(?:([\"'])(.*?)\\1|([^)]*?))\\s*\\)/gi)];\n for(var m of matches){var raw=(m[2]||m[3]||\"\").trim();if(!raw||/^(data:|blob:|#)/i.test(raw))continue;\n  try{var u=new URL(raw,base),d=await send(u.href,{method:\"GET\",headers:[[\"Accept\",\"*/*\"]],credentials:\"same-origin\"});\n   if(d.status>=200&&d.status<300){var h=(d.headers||[]).find(function(x){return String(x[0]).toLowerCase()===\"content-type\";});var blob=URL.createObjectURL(new Blob([d.body||new ArrayBuffer(0)],{type:h?h[1]:\"application/octet-stream\"}));css=css.replace(m[0],'url(\"'+blob+'\")');}\n  }catch(e){console.debug(\"[GX rewrite] CSS asset failed:\",raw);}\n }\n return css;\n}\nvar observer=new MutationObserver(function(records){\n records.forEach(function(r){\n  if(r.type===\"attributes\"){var el=r.target,tag=el.tagName.toLowerCase();var attr=tag===\"link\"?\"href\":tag===\"video\"?\"poster\":\"src\";if(r.attributeName===attr)proxyResource(el,attr);if(r.attributeName===\"srcset\")rewriteSrcset(el);}\n  (r.addedNodes||[]).forEach(function(n){if(n.nodeType!==1)return;\n   var all=[n].concat(Array.from(n.querySelectorAll(\"*\")));\n   all.forEach(function(el){var tag=el.tagName.toLowerCase();var attr=tag===\"link\"?\"href\":tag===\"video\"?\"poster\":\"src\";if(eligible(el,attr))proxyResource(el,attr);if(el.hasAttribute(\"srcset\"))rewriteSrcset(el);});\n  });\n });\n});\nfunction rewriteSrcset(el){\n var raw=el.getAttribute(\"srcset\");if(!raw||el.__gxSrcset)return;el.__gxSrcset=true;\n var parts=raw.split(\",\").map(function(x){return x.trim();});\n Promise.all(parts.map(async function(part){var bits=part.split(/\s+/),u=bits.shift();try{var d=await send(new URL(u,document.baseURI).href,{method:\"GET\",headers:[[\"Accept\",\"*/*\"]],credentials:\"same-origin\"});if(d.status>=200&&d.status<300){var blob=URL.createObjectURL(new Blob([d.body||new ArrayBuffer(0)]));return [blob].concat(bits).join(\" \");}}catch(e){}return part;})).then(function(x){el.setAttribute(\"srcset\",x.join(\", \"));});\n}\nobserver.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:[\"src\",\"href\",\"poster\",\"srcset\"]});\ndocument.addEventListener(\"click\",function(ev){\n var a=ev.target.closest&&ev.target.closest(\"a[href]\");if(!a||a.hasAttribute(\"download\"))return;\n var target=a.getAttribute(\"target\");if(target&&target!==\"_self\")return;\n var u=new URL(a.href,document.baseURI);if(u.protocol!==\"http:\"&&u.protocol!==\"https:\")return;\n var b=new URL(document.baseURI);if(u.origin===b.origin&&u.pathname===b.pathname&&u.search===b.search)return;\n ev.preventDefault();window.parent.postMessage({type:\"nav\",url:u.href},\"*\");\n},true);\ndocument.addEventListener(\"submit\",function(ev){\n var f=ev.target;if(!f||!f.action)return;\n var method=String(f.method||\"get\").toLowerCase();if(method!==\"get\")return;\n var u=new URL(f.action,document.baseURI),data=new FormData(f),q=new URLSearchParams();\n data.forEach(function(v,k){if(typeof v===\"string\")q.append(k,v);});\n var submitter=ev.submitter;if(submitter&&submitter.name)q.append(submitter.name,submitter.value);\n u.search=q.toString();ev.preventDefault();window.parent.postMessage({type:\"nav\",url:u.href},\"*\");\n},true);\n})();" + "<\\/script>";
    return /<head\b[^>]*>/i.test(html)
      ? html.replace(/<head\b[^>]*>/i, head => head + bridge)
      : bridge + html;
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


  // Fetch parser-discovered resources through Wisp and expose them as same-origin
  // blob URLs. Without this step, srcdoc's parser requests scripts/styles directly
  // from their original hosts and the browser enforces their CORS headers.
  async function rewriteHTMLResources(html, pageURL) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const base = new URL(pageURL);
    let baseTag = parsed.querySelector("base[href]");
    if (!baseTag) {
      baseTag = parsed.createElement("base");
      parsed.head.prepend(baseTag);
    }
    baseTag.href = pageURL;

    const assetCache = new Map();
    const skipURL = value => !value || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(value.trim());

    async function fetchBlobURL(rawURL, depth = 0) {
      const absolute = new URL(rawURL, pageURL).href;
      if (skipURL(absolute) || depth > 3) return rawURL;
      if (assetCache.has(absolute)) return assetCache.get(absolute);
      const task = (async () => {
        const response = await GXWisp.fetch(absolute, { headers: { "Accept": "*/*" } });
        if (!response.ok) throw new Error("HTTP " + response.status + " for " + absolute);
        const type = response.headers.get("content-type") || "";
        if (type.includes("text/css") || /\.css(?:[?#]|$)/i.test(absolute)) {
          const css = await response.text();
          const rewritten = await rewriteCSS(css, absolute, depth + 1);
          return URL.createObjectURL(new Blob([rewritten], { type: type || "text/css" }));
        }
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      })();
      assetCache.set(absolute, task);
      try { return await task; }
      catch (error) {
        assetCache.delete(absolute);
        console.warn("[GX rewrite] Resource failed:", absolute, error);
        throw error;
      }
    }

    async function rewriteCSS(css, stylesheetURL, depth) {
      const pattern = /url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/gi;
      const matches = [...css.matchAll(pattern)];
      let output = css;
      for (const match of matches) {
        const raw = (match[2] || match[3] || "").trim();
        if (skipURL(raw)) continue;
        try {
          const blobURL = await fetchBlobURL(new URL(raw, stylesheetURL).href, depth);
          output = output.replace(match[0], 'url("' + blobURL + '")');
        } catch (_) {
          output = output.replace(match[0], "url(data:,)");
        }
      }
      const imports = [...output.matchAll(/@import\s+(["'])(.*?)\1/gi)];
      for (const match of imports) {
        try {
          const blobURL = await fetchBlobURL(new URL(match[2], stylesheetURL).href, depth);
          output = output.replace(match[0], '@import url("' + blobURL + '")');
        } catch (_) {
          output = output.replace(match[0], "");
        }
      }
      return output;
    }

    const tasks = [];
    for (const node of parsed.querySelectorAll("script[src],link[href],img[src],source[src],video[poster],audio[src],track[src],input[src]")) {
      const tag = node.tagName.toLowerCase();
      let attr = tag === "link" ? "href" : tag === "video" ? "poster" : "src";
      const rel = (node.getAttribute("rel") || "").toLowerCase();
      if (tag === "link" && /(?:preload|prefetch|dns-prefetch|preconnect)/.test(rel)) {
        node.remove();
        continue;
      }
      const raw = node.getAttribute(attr);
      if (skipURL(raw)) continue;
      tasks.push((async () => {
        try {
          const blobURL = await fetchBlobURL(new URL(raw, pageURL).href);
          node.setAttribute(attr, blobURL);
          node.removeAttribute("crossorigin");
          node.removeAttribute("integrity");
        } catch (_) {
          if (tag === "script" || (tag === "link" && rel === "stylesheet")) node.remove();
          else node.removeAttribute(attr);
        }
      })());
    }

    // Responsive images and inline/style-block CSS are parser-discovered too.
    for (const node of parsed.querySelectorAll("[srcset]")) {
      tasks.push((async () => {
        const raw = node.getAttribute("srcset") || "";
        const candidates = raw.split(",").map(part => part.trim()).filter(Boolean);
        const rewritten = await Promise.all(candidates.map(async part => {
          const bits = part.split(/\s+/);
          const source = bits.shift();
          if (skipURL(source)) return part;
          try {
            const blob = await fetchBlobURL(new URL(source, pageURL).href);
            return [blob, ...bits].join(" ");
          } catch (_) { return part; }
        }));
        node.setAttribute("srcset", rewritten.join(", "));
      })());
    }
    for (const node of parsed.querySelectorAll("[style]")) {
      tasks.push((async () => {
        const css = node.getAttribute("style") || "";
        node.setAttribute("style", await rewriteCSS(css, pageURL, 1));
      })());
    }
    for (const node of parsed.querySelectorAll("style")) {
      tasks.push((async () => {
        node.textContent = await rewriteCSS(node.textContent || "", pageURL, 1);
      })());
    }

    await Promise.all(tasks);
    const doctype = parsed.doctype ? "<!doctype " + parsed.doctype.name + ">" : "<!doctype html>";
    return doctype + parsed.documentElement.outerHTML;
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

       content = await rewriteHTMLResources(content, url);
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