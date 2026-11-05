// Recovered from the deployed AEO edge candidate on 2026-11-05.
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../deploy/aeo-edge/worker.mjs
import { timingSafeEqual } from "node:crypto";
var json = /* @__PURE__ */ __name((value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }), "json");
var LEGACY_AUTH = /* @__PURE__ */ new Set(["/api/auth/login", "/api/auth/magic-link", "/api/auth/magic-link/consume", "/api/auth/recover", "/api/auth/password-reset", "/api/auth/password-reset/confirm", "/api/session", "/api/logout", "/api/auth/session/rotate", "/api/auth/logout-all", "/api/shared-report/resolve"]);
var PUBLIC_PAGES = /* @__PURE__ */ new Set(["/"]);
function isV2Path(path) {
  return path === "/" || path.startsWith("/api/aeo/") || path.startsWith("/_next/") || ["/script.js", "/api/send", "/site.webmanifest", "/favicon.ico", "/aeo-icon.svg"].includes(path);
}
__name(isV2Path, "isV2Path");
function legacyWriteAllowed(path, method) {
  return ["GET", "HEAD", "OPTIONS"].includes(method) || method === "POST" && LEGACY_AUTH.has(path);
}
__name(legacyWriteAllowed, "legacyWriteAllowed");
function equal(a, b) {
  if (!a || !b || a.length > 1024 || b.length > 1024) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
__name(equal, "equal");
function cleanHeaders(headers) {
  const out = new Headers(headers);
  for (const key of [...out.keys()]) if (/^(?:cf-|x-aeo-|x-real-ip$|x-forwarded-|x-vercel-|cloudfront-|eo-|x-umami-(?:client|ip)|x-client-ip$|true-client-ip$|forwarded$|authorization$)/i.test(key)) out.delete(key);
  return out;
}
__name(cleanHeaders, "cleanHeaders");
function trackingMarkup(siteId, operator) {
  if (!/^[a-f0-9-]{36}$/.test(siteId || "")) return "";
  return `<script>window.aeoPrivateSafe=function(type,p){if(!p)return p;for(var k of ['url','referrer']){if(p[k]){try{var u=new URL(p[k],location.origin);p[k]=u.origin+u.pathname;}catch(e){delete p[k];}}}p.tag=${JSON.stringify(operator ? "aeo_operator_qualification" : "aeo_first_party")};return p;};<\/script><script defer src="/script.js" data-website-id="${siteId}" data-exclude-search="true" data-exclude-hash="true" data-do-not-track="true" data-before-send="aeoPrivateSafe"><\/script>`;
}
__name(trackingMarkup, "trackingMarkup");
function ga4Markup(id) {
  if (!/^G-[A-Z0-9]{6,20}$/.test(id || '')) return '';
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script><script>window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};window.gtag('js',new Date());var aeoRef='';try{var aeoRefUrl=new URL(document.referrer);aeoRef=aeoRefUrl.origin+aeoRefUrl.pathname;}catch(e){}window.gtag('config','${id}',{page_location:location.origin+location.pathname,page_referrer:aeoRef,allow_google_signals:false,allow_ad_personalization_signals:false});</script>`;
}
function preserveGaCsp(response) {
  const value=response.headers.get('content-security-policy');
  if (!value) return;
  const csp=value.replace(/script-src ([^;]*)/, (all, sources) => sources.includes('https://www.googletagmanager.com') ? all : all+' https://www.googletagmanager.com');
  response.headers.set('content-security-policy',csp);
}
async function forwardV2(request, env, transport) {
  if (!/^[a-f0-9]{64}$/.test(env.AEO_EDGE_ORIGIN_KEY || "")) return json({ error: "Origin unavailable" }, 503);
  const incoming = new URL(request.url), origin = new URL(env.AEO_ORIGIN_URL);
  if (origin.origin !== "https://staging.aeo.io") return json({ error: "Origin unavailable" }, 503);
  const canonical = new URL(env.AEO_CANONICAL_ORIGIN);
  if (!["https://staging.aeo.io", "https://aeo.io"].includes(canonical.origin)) return json({ error: "Origin unavailable" }, 503);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && incoming.pathname !== "/api/send") {
    if (request.headers.get("origin") !== incoming.origin) return json({ error: "Use the same website origin" }, 403);
  }
  const headers = cleanHeaders(request.headers);
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp && clientIp.length <= 45 && /^[0-9a-f:.]+$/i.test(clientIp)) headers.set("x-aeo-client-ip", clientIp);
  headers.set("x-aeo-origin-key", env.AEO_EDGE_ORIGIN_KEY);
  headers.set("x-aeo-public-host", canonical.host);
  if (incoming.pathname !== "/api/send" && request.headers.get("origin") === incoming.origin) headers.set("origin", canonical.origin);
  origin.pathname = incoming.pathname;
  origin.search = incoming.search;
  const upstream = await transport(new Request(new Request(origin, request), { headers, redirect: "manual", signal: AbortSignal.timeout(6e4) }));
  const response = new Response(upstream.body, upstream);
  response.headers.delete("www-authenticate");
  if (!response.headers.has("referrer-policy")) response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  if (env.AEO_EDGE_MODE === 'production' && incoming.hostname === 'aeo.io' && incoming.pathname === '/') {
    preserveGaCsp(response);
    response.headers.delete('x-robots-tag');
  }
  response.headers.set("X-AEO-Release", env.AEO_RELEASE || "candidate");
  if (!["/script.js", "/site.webmanifest", "/favicon.ico", "/aeo-icon.svg"].includes(incoming.pathname) && !incoming.pathname.startsWith("/_next/static/")) response.headers.set("Cache-Control", "private, no-store");
  const location = response.headers.get("location");
  if (location) {
    const target = new URL(location, origin);
    if ([origin.origin, canonical.origin].includes(target.origin)) {
      target.host = incoming.host;
      target.protocol = incoming.protocol;
      response.headers.set("location", target.toString());
    }
  }
  return response;
}
__name(forwardV2, "forwardV2");
var worker_default = {
  /** @param {Request} request @param {Env} env */
  async fetch(request, env) {
    try {
      const url = new URL(request.url), preview = url.hostname !== "aeo.io";
      if (preview && !(url.hostname.startsWith("aeo-v2-edge.") && url.hostname.endsWith(".workers.dev"))) return json({ error: "Unknown host" }, 404);
      if (preview && !equal(request.headers.get("authorization"), env.AEO_PREVIEW_AUTH)) return new Response("Private AEO qualification", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="AEO qualification"', "Cache-Control": "private, no-store" } });
      if (!["observe", "freeze", "production"].includes(env.AEO_EDGE_MODE)) return json({ error: "Release unavailable" }, 503);
      const path = url.pathname;
      const legacyReadOnly = env.AEO_EDGE_MODE !== "observe";
      const v2 = preview || ["/script.js", "/api/send"].includes(path) || env.AEO_EDGE_MODE === "production" && isV2Path(path);
      let response;
      if (v2) response = await forwardV2(request, env, fetch);
      else {
        if (legacyReadOnly && !legacyWriteAllowed(path, request.method)) return json({ error: "AEO v1 reports are read-only. Use the new workspace for changes.", code: "V1_READ_ONLY" }, 423);
        const target = new URL(request.url);
        target.host = "aeo.io";
        target.protocol = "https:";
        if (path === "/legacy" || path === "/legacy/") target.pathname = "/";
        const legacyHeaders = cleanHeaders(request.headers);
        const legacyOrigin = request.headers.get("origin");
        if (legacyOrigin) legacyHeaders.set("origin", legacyOrigin);
        const legacyAuthorization = request.headers.get("authorization");
        if (legacyAuthorization) legacyHeaders.set("authorization", legacyAuthorization);
        const clientIp = request.headers.get("cf-connecting-ip");
        if (clientIp && clientIp.length <= 45 && /^[0-9a-f:.]+$/i.test(clientIp)) legacyHeaders.set("cf-connecting-ip", clientIp);
        response = await env.LEGACY_AEO.fetch(new Request(new Request(target, request), { headers: legacyHeaders, redirect: "manual" }));
        response = new Response(response.body, response);
        response.headers.set("Cache-Control", "private, no-store");
        response.headers.set("X-AEO-Release", legacyReadOnly ? "v1-read-only" : "v1-observed");
        const location = response.headers.get("location");
        if (env.AEO_EDGE_MODE === "production" && location) {
          const dest = new URL(location, target);
          if (dest.origin === "https://aeo.io" && dest.pathname === "/") {
            dest.pathname = "/legacy";
            response.headers.set("location", dest.toString());
          }
        }
      }
      const publicHtml = !preview && request.method === "GET" && response.status === 200 && response.headers.get("content-type")?.includes("text/html") && (PUBLIC_PAGES.has(path) || path === "/legacy" || path === "/legacy/");
      if (publicHtml && typeof HTMLRewriter !== "undefined") {
        const operator = url.searchParams.get("aeo_operator") === "1";
        const banner = legacyReadOnly && (path === "/legacy" || path === "/legacy/" || (env.AEO_EDGE_MODE === "freeze" && path === "/"));
        response = new HTMLRewriter().on("body", { element(el) {
          if (banner) el.prepend(env.AEO_EDGE_MODE === "freeze" ? '<aside style="padding:12px;background:#ecfdf5;color:#064e3b;text-align:center">AEO is upgrading. Historical reports remain available; new checks are temporarily paused.</aside>' : '<aside style="padding:12px;background:#ecfdf5;color:#064e3b;text-align:center">Historical AEO v1 reports are read-only. <a href="/">Open AEO v2</a></aside>', { html: true });
          if (!banner) el.append(trackingMarkup(env.AEO_TRACKING_SITE_ID, operator), { html: true });
          if (env.AEO_EDGE_MODE === 'production' && path === '/') el.append(ga4Markup(env.AEO_GA4_ID), {html:true});
        } }).on("#accountButton", { element(el) {
          el.setAttribute("data-umami-event", "account_menu_open");
        } }).transform(response);
      }
      return response;
    } catch {
      console.info(JSON.stringify({ event: "aeo-edge", status: "upstream_unavailable" }));
      return json({ error: "AEO is temporarily unavailable. Please try again shortly." }, 503);
    }
  }
};
export {
  cleanHeaders,
  ga4Markup,
  worker_default as default,
  isV2Path,
  legacyWriteAllowed,
  trackingMarkup
};

