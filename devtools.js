(() => {
"use strict";
const $=s=>document.querySelector(s),S={open:false,tab:"elements",tree:null,console:[],network:[],resources:[],inspect:false};
const panel=document.createElement("section");panel.id="safari-inspector";panel.innerHTML=`
<header class="si-head"><b>◉ Web Inspector <small>Safari developer tools</small></b><span><button id="si-clear">Clear</button> <button id="si-close">×</button></span></header>
<nav class="si-tabs"><button data-tab="elements" class="active">Elements</button><button data-tab="console">Console</button><button data-tab="network">Network</button><button data-tab="resources">Resources</button><button data-tab="sources">Sources</button><button data-tab="storage">Storage</button></nav>
<div class="si-body"><div class="si-view" id="si-elements"><div id="si-tree" class="si-tree">Waiting for page…</div><aside class="si-details"><b>Node details</b><div id="si-detail-content" class="si-empty">Select an element to inspect it.</div></aside></div>
<div class="si-view si-list" id="si-console"><div class="si-toolbar"><button id="si-picker">Select element on page</button><span>Runtime messages and JavaScript errors</span></div><div id="si-console-list"></div></div>
<div class="si-view si-list" id="si-network"><div class="si-toolbar"><button id="si-net-clear">Clear</button><span>Wisp fetch requests</span></div><div class="si-row si-headrow"><span>Method</span><span>URL</span><span>Status</span></div><div id="si-network-list"></div></div>
<div class="si-view si-list" id="si-resources"><div class="si-toolbar">Page Performance API resources</div><div id="si-resource-list"></div></div><div class="si-view si-list" id="si-sources"><div class="si-toolbar">Scripts and stylesheets declared by the page</div><div id="si-source-list"></div></div><div class="si-view si-list" id="si-storage"><div class="si-toolbar">Storage available inside the sandboxed page</div><div id="si-storage-list"></div></div></div>
<footer class="si-foot"><span id="si-status">Inspector ready</span><span>Page sandbox and cross-origin limits still apply</span></footer>`;
document.body.appendChild(panel);
function frame(){return Array.from(document.querySelectorAll("iframe.web-frame")).find(f=>f.style.display==="block")||document.querySelector("iframe.web-frame");}
function cmd(action,data){const f=frame();if(f&&f.contentWindow)f.contentWindow.postMessage({type:"inspector:command",data:Object.assign({action},data||{})},"*");}
function open(){S.open=true;panel.classList.add("visible");cmd("snapshot");}
function close(){S.open=false;panel.classList.remove("visible");if(S.inspect){S.inspect=false;cmd("inspect-mode",{enabled:false});}}
function esc(v){return String(v==null?"":v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function walk(n,d){if(!n)return"";let a=Object.entries(n.attrs||{}).slice(0,3).map(([k,v])=>" "+k+'="'+esc(v).slice(0,50)+'"').join("");return "<div class='si-node' style='--d:"+d+"'><button data-id='"+n.id+"'><i>&lt;"+esc(n.tag)+"</i>"+esc(a)+"&gt;</button>"+(n.text?"<em>"+esc(n.text)+"</em>":"")+(n.children||[]).map(x=>walk(x,d+1)).join("")+"</div>";}
function details(d){S.selected=d;$("#si-detail-content").innerHTML="<h3>&lt;"+esc(d.tag)+"&gt;</h3><h4>Attributes</h4>"+Object.entries(d.attrs||{}).map(([k,v])=>"<label>"+esc(k)+"<input data-attr='"+esc(k)+"' value='"+esc(v)+"'></label>").join("")+"<h4>Computed style · editable inline</h4>"+Object.entries(d.styles||{}).map(([k,v])=>"<label>"+esc(k)+"<input data-style='"+esc(k)+"' value='"+esc(v)+"'></label>").join("")+"<h4>HTML</h4><pre>"+esc(d.html)+"</pre><button id='si-remove'>Remove element</button>";
$("#si-detail-content").querySelectorAll("[data-style]").forEach(i=>i.onchange=()=>cmd("set-style",{path:d.path,name:i.dataset.style,value:i.value}));
$("#si-detail-content").querySelectorAll("[data-attr]").forEach(i=>i.onchange=()=>cmd("set-attr",{path:d.path,name:i.dataset.attr,value:i.value}));
$("#si-remove").onclick=()=>{if(confirm("Remove this element?"))cmd("remove",{path:d.path});};}
function tab(name){S.tab=name;panel.querySelectorAll(".si-tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));panel.querySelectorAll(".si-view").forEach(v=>v.style.display=v.id==="si-"+name?"flex":"none");}
panel.addEventListener("click",e=>{const b=e.target.closest(".si-tabs button");if(b)tab(b.dataset.tab);const n=e.target.closest(".si-node button");if(n){const find=x=>{if(!x)return null;if(x.id===+n.dataset.id)return x;for(const c of x.children||[]){const r=find(c);if(r)return r;}return null;};const x=find(S.tree);if(x){cmd("highlight",{path:x.path});cmd("select-by-id",{id:x.id});}}});
function consoleRender(){$("#si-console-list").innerHTML=S.console.map(x=>"<div class='si-log "+esc(x.level)+"'><time>"+new Date(x.time||Date.now()).toLocaleTimeString()+"</time>"+esc(x.args)+"</div>").join("");}
function networkRender(){$("#si-network-list").innerHTML=S.network.slice().reverse().map(x=>"<div class='si-row'><span>"+esc(x.method)+"</span><span title='"+esc(x.url)+"'>"+esc(x.url)+"</span><span>"+esc(x.status)+"</span></div>").join("");}
function resourcesRender(){$("#si-resource-list").innerHTML=S.resources.slice().reverse().map(x=>"<div class='si-row'><span>"+esc(x.type)+"</span><span title='"+esc(x.name)+"'>"+esc(x.name)+"</span><span>"+esc(x.duration)+" ms</span></div>").join("");}
window.addEventListener("message",e=>{const f=Array.from(document.querySelectorAll("iframe.web-frame")).find(x=>x.contentWindow===e.source);if(!f||!e.data)return;const d=e.data.data||{};
if(e.data.type==="inspector:ready"){$("#si-status").textContent="Connected · "+(d.url||"page");if(S.open)cmd("snapshot");}
if(e.data.type==="inspector:dom"){S.tree=d.tree;$("#si-tree").innerHTML=walk(d.tree,0);$("#si-status").textContent=(d.url||"Page")+" · DOM live";}
if(e.data.type==="inspector:selected"){details(d);tab("elements");}
if(e.data.type==="inspector:console"){S.console.push(d);if(S.console.length>400)S.console.shift();consoleRender();}
if(e.data.type==="inspector:error"){S.console.push({level:"error",args:d.message,time:Date.now()});consoleRender();}
if(e.data.type==="inspector:resource"){S.resources.push(d);if(S.resources.length>800)S.resources.shift();resourcesRender();}
if(e.data.type==="inspector:sources"){$("#si-source-list").innerHTML=(d.items||[]).map(x=>"<div class=si-source><b>"+esc(x.kind)+"</b> "+esc(x.url||x.name)+"<pre>"+esc(x.preview||"")+"</pre></div>").join("")||"No script or stylesheet elements found."}
if(e.data.type==="inspector:storage"){$("#si-storage-list").innerHTML="<pre class=si-storage>"+esc(JSON.stringify(d,null,2))+"</pre>";}
if(e.data.type==="wisp:fetch"){S.network.push({method:(e.data.options||{}).method||"GET",url:e.data.url,status:"sent"});if(S.network.length>400)S.network.shift();networkRender();}
if(e.data.type==="wisp:fetch:response"){const p=S.network.find(x=>x.status==="sent");if(p)p.status=e.data.status||"failed";networkRender();}
});
window.addEventListener("safari:wisp-response",e=>{const d=e.detail||{};const p=S.network.find(x=>x.status==="sent"&&(!d.url||x.url===d.url));if(p)p.status=d.status;networkRender();});
$("#si-close").onclick=close;$("#si-clear").onclick=()=>{S.console=[];consoleRender();};$("#si-net-clear").onclick=()=>{S.network=[];networkRender();};
$("#si-picker").onclick=()=>{S.inspect=!S.inspect;cmd("inspect-mode",{enabled:S.inspect});$("#si-picker").classList.toggle("active",S.inspect);$("#si-status").textContent=S.inspect?"Click an element in the page":"Element picker off";};
$("#menu-inspect").onclick=()=>{$("#menu-popup").classList.remove("show");open();};
document.addEventListener("keydown",e=>{if((e.altKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==="i"){e.preventDefault();S.open?close():open();}});
window.SafariWebInspector={open,close,refresh:()=>cmd("snapshot")};
})();