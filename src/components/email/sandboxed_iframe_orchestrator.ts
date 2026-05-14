//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export const ORCHESTRATOR_SCRIPT = `(function(){
"use strict";
var MAX_H = 12000;
var ASTER_PATH_ALLOWLIST = /^(?:settings(?:\\/[a-z0-9_-]{1,32})?)$/i;
var last_height = 0;
var raf_id = 0;
var ready_sent = false;

function post(msg){ try { parent.postMessage(msg, "*"); } catch(_) {} }

function detect_simple(){
  var body = document.body;
  if (!body) return;
  var has_rich = body.querySelector("table[width], table[bgcolor], table[background], center, [class]:not(img)") !== null
    || (body.querySelector("table") !== null && body.querySelectorAll("table").length > 1);
  var forces_light = false;
  var styles = document.querySelectorAll("style");
  for (var i = 0; i < styles.length; i++){
    var t = styles[i].textContent || "";
    if (t.indexOf("color-scheme") >= 0 && t.indexOf("light only") >= 0){ forces_light = true; break; }
  }
  body.style.padding = "8px 16px 16px 16px";
  if (body.getAttribute("data-is-html") === "1" && (!body.style.backgroundColor || body.style.backgroundColor === "transparent")){
    var first_el = body.firstElementChild;
    var detected = null;
    if (first_el){
      detected = first_el.getAttribute && first_el.getAttribute("bgcolor");
      if (!detected) detected = first_el.style && first_el.style.backgroundColor;
      if (!detected && (first_el.tagName === "TABLE" || first_el.tagName === "DIV")){
        try { detected = window.getComputedStyle(first_el).backgroundColor; } catch(_){}
      }
    }
    if (detected && detected !== "transparent" && detected !== "rgba(0, 0, 0, 0)"){
      body.style.backgroundColor = detected;
      document.documentElement.style.backgroundColor = detected;
    }
  }
  if (!has_rich && body.getAttribute("data-is-plain") !== "1" && !forces_light){
    body.classList.add("aster-simple");
  }
}

function measure(){
  var body = document.body;
  if (!body) return;
  var measured = body.scrollHeight;
  var height = Math.min(measured + 8, MAX_H);
  if (Math.abs(height - last_height) < 2) return;
  last_height = height;
  post({ type: "aster_height", value: height });
  if (!ready_sent){
    ready_sent = true;
    post({ type: "aster_ready" });
  }
}

function schedule_measure(){
  if (raf_id) cancelAnimationFrame(raf_id);
  raf_id = requestAnimationFrame(measure);
}

function listen_images(root){
  var imgs = root.querySelectorAll("img");
  for (var i = 0; i < imgs.length; i++){
    var img = imgs[i];
    if (!img.complete){
      img.addEventListener("load", schedule_measure, { once: true });
      img.addEventListener("error", schedule_measure, { once: true });
    }
  }
}

function collect_proxy_images(){
  var imgs = document.querySelectorAll("img");
  var list = [];
  for (var i = 0; i < imgs.length; i++){
    var src = imgs[i].getAttribute("src") || "";
    if (src.indexOf("/api/images/v1/proxy") >= 0 || src.indexOf("/api/proxy/image") >= 0){
      imgs[i].setAttribute("data-aster-proxy-id", String(i));
      list.push({ id: i, src: src });
    }
  }
  if (list.length){ post({ type: "aster_resolve_native", images: list }); }
}

function apply_native_blobs(map){
  for (var key in map){
    if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
    var el = document.querySelector('img[data-aster-proxy-id="' + key + '"]');
    if (el){ el.setAttribute("src", map[key]); }
  }
  schedule_measure();
}

function unblock_remote(proxy_base){
  var blocked = document.querySelectorAll("img[data-blocked='true']");
  for (var i = 0; i < blocked.length; i++){
    var el = blocked[i];
    var src = el.getAttribute("data-proxy-src") || el.getAttribute("data-original-src");
    if (src) el.setAttribute("src", src);
    el.removeAttribute("data-blocked");
    el.classList.remove("blocked-remote-image");
    if (el.getAttribute("alt") === "[Click to load image]") el.setAttribute("alt", "");
    (function(im){ im.addEventListener("error", function(){ im.style.display = "none"; }, { once: true }); })(el);
  }
  var alt_only = document.querySelectorAll("img[alt='[Click to load image]']");
  for (var j = 0; j < alt_only.length; j++){ alt_only[j].setAttribute("alt", ""); }
  var spans = document.querySelectorAll("span.blocked-image[data-original-src]");
  for (var k = 0; k < spans.length; k++){
    var span = spans[k];
    var original = span.getAttribute("data-original-src") || "";
    var img = document.createElement("img");
    img.src = (proxy_base || "") + "?url=" + encodeURIComponent(original);
    var w = span.getAttribute("data-width");
    var h = span.getAttribute("data-height");
    var s = span.getAttribute("data-style");
    if (w) img.setAttribute("width", w);
    if (h) img.setAttribute("height", h);
    if (s) img.setAttribute("style", s);
    if (span.parentNode) span.parentNode.replaceChild(img, span);
  }
  schedule_measure();
}

document.addEventListener("click", function(e){
  var target = e.target;
  if (!target) return;
  var toggle = target.closest && target.closest(".aster-quote-toggle");
  if (toggle){
    var wrapper = toggle.parentElement;
    if (wrapper){
      var content = wrapper.querySelector(".aster-quoted-content");
      if (content){
        var hidden = content.style.display === "none";
        content.style.display = hidden ? "" : "none";
        toggle.classList.toggle("aster-quote-expanded", hidden);
        schedule_measure();
      }
    }
    return;
  }
  if (target.tagName === "IMG" && !(target.closest && target.closest("a"))){
    if (target.getAttribute("data-blocked") !== "true"){
      var img_el = target;
      if (img_el.naturalWidth >= 16 && img_el.naturalHeight >= 16){
        e.preventDefault();
        var src = img_el.currentSrc || img_el.src;
        if (src) post({ type: "aster_image_zoom", src: src });
        return;
      }
    }
  }
  var link = target.closest && target.closest("a");
  if (!link) return;
  var href = link.getAttribute("href") || "";
  if (!href || href.charAt(0) === "#" || href.indexOf("mailto:") === 0) return;
  e.preventDefault();
  e.stopPropagation();
  if (href.indexOf("aster:") === 0){
    var path = href.slice("aster:".length);
    if (ASTER_PATH_ALLOWLIST.test(path)){ post({ type: "aster_internal_link", path: path }); }
  } else {
    var resolved = href;
    if (resolved.indexOf("http://") !== 0 && resolved.indexOf("https://") !== 0){ resolved = "https://" + resolved; }
    post({ type: "aster_external_link", url: resolved });
  }
}, true);

document.addEventListener("wheel", function(e){
  post({ type: "aster_wheel", delta_x: e.deltaX, delta_y: e.deltaY, delta_mode: e.deltaMode });
}, { passive: true });

function touch_payload(e){
  function arr(list){
    var out = [];
    for (var i = 0; i < list.length; i++){
      var t = list[i];
      out.push({ identifier: t.identifier, client_x: t.clientX, client_y: t.clientY, page_x: t.pageX, page_y: t.pageY });
    }
    return out;
  }
  return { touches: arr(e.touches), target_touches: arr(e.targetTouches), changed_touches: arr(e.changedTouches) };
}
document.addEventListener("touchstart", function(e){ post(Object.assign({ type: "aster_touch", phase: "start" }, touch_payload(e))); }, { passive: true });
document.addEventListener("touchmove", function(e){ post(Object.assign({ type: "aster_touch", phase: "move" }, touch_payload(e))); }, { passive: true });
document.addEventListener("touchend", function(e){ post(Object.assign({ type: "aster_touch", phase: "end" }, touch_payload(e))); }, { passive: true });

window.addEventListener("message", function(e){
  var data = e.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "aster_unblock_remote"){ unblock_remote(data.proxy_base || ""); }
  else if (data.type === "aster_native_blobs" && data.map){ apply_native_blobs(data.map); }
  else if (data.type === "aster_measure"){ schedule_measure(); }
});

function init(){
  detect_simple();
  if (document.body){
    var ro = new ResizeObserver(function(){ schedule_measure(); });
    ro.observe(document.body);
    listen_images(document);
    var mo = new MutationObserver(function(muts){
      for (var i = 0; i < muts.length; i++){
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++){
          var node = added[j];
          if (node instanceof HTMLImageElement){
            if (!node.complete){
              node.addEventListener("load", schedule_measure, { once: true });
              node.addEventListener("error", schedule_measure, { once: true });
            } else { schedule_measure(); }
          } else if (node instanceof HTMLElement){
            listen_images(node);
            schedule_measure();
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.fonts && document.fonts.ready){
    document.fonts.ready.then(function(){ schedule_measure(); });
  }
  schedule_measure();
  collect_proxy_images();
}

if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
})();`;

let cached_hash: string | null = null;
let pending_hash: Promise<string> | null = null;

async function compute_sha256_base64(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

export function get_orchestrator_hash(): Promise<string> {
  if (cached_hash) return Promise.resolve(cached_hash);
  if (pending_hash) return pending_hash;
  pending_hash = compute_sha256_base64(ORCHESTRATOR_SCRIPT).then((h) => {
    cached_hash = h;
    return h;
  });
  return pending_hash;
}

export function get_orchestrator_hash_sync(): string | null {
  return cached_hash;
}
