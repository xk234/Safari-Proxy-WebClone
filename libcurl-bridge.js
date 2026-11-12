/* Bridges libcurl.js's top-level lexical binding into the GX adapter.
 * Keep this as a separate classic script loaded only after libcurl.js.
 */
(function () {
  "use strict";
  if (typeof libcurl === "undefined") {
    throw new Error("libcurl.js loaded without exposing its libcurl binding");
  }
  if (window.GXLibcurl && window.GXLibcurl !== libcurl) {
    throw new Error("A different libcurl runtime is already registered");
  }
  window.GXLibcurl = libcurl;
})();
