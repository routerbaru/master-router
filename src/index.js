// Path: index.js (Master Router - FINAL ANTI-ERROR)

const LP_CACHE_TTL = 3600; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname; 
    let path = url.pathname; 

    // 1. IDENTIFIKASI PROJECT PAGES (PINDAH KE ATAS AGAR STATIS BISA PAKAI)
    const CONFIG_URL = "https://raw.githubusercontent.com/masbero323-art/master-router/main/routes.json";
    const DEFAULT_FALLBACK_PROJECT = "lp-7jw"; 

    const allowedDomains = [
      "bokklastread.co.uk", "brocenter.co.uk", "brocenter.uk", "cengeng.co.uk",
      "dalbankeak.co.uk", "gembul.co.uk", "gentonk.co.uk", "getpdfbook.co.uk",
      "getpdfbook.uk", "kopyor.co.uk", "kopyor.uk", "kuntrink.co.uk",
      "kuntrink.uk", "lemper.co.uk", "lemper.org.uk", "smilespirit.co.uk",
      "smilespirit.uk", "shopee-cod.my.id", "cenulmania.my.id",
      "cantikul.my.id", "kiwil.my.id"
    ];

    let projectKey = ""; 
    const rootDomain = allowedDomains.find(d => hostname.endsWith(d));
    projectKey = rootDomain ? (hostname === rootDomain ? "default" : hostname.replace(`.${rootDomain}`, "")) : "default";

    // AMBIL MAPPING (CACHE 24 JAM)
    let mappings = {};
    try {
        const configReq = await fetch(CONFIG_URL, { cf: { cacheTtl: 86400, cacheEverything: true } });
        mappings = configReq.ok ? await configReq.json() : {};
    } catch (e) { mappings = {}; }

    const targetProject = mappings[projectKey] || DEFAULT_FALLBACK_PROJECT;
    const targetHostname = `${targetProject}.pages.dev`;

    // ==================================================================
    // 2. FILTER BOT & STATIC FILES (FIXED LOGIC)
    // ==================================================================
    const userAgent = request.headers.get("User-Agent") || "";
    const allowedBots = ["Pinterest", "Spotify", "Amazon", "CastBox", "KKBOX", "PocketCasts", "AppleCoreMedia", "Googlebot"];
    
    const staticExt = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.css', '.js', '.txt', '.woff', '.woff2'];
    const isStaticFile = staticExt.some(ext => path.toLowerCase().includes(ext));
    
    // FIX SAKTI: File statis harus diarahkan ke targetHostname, bukan fetch(request) biasa!
    if (isStaticFile) {
        const staticUrl = new URL(request.url);
        staticUrl.hostname = targetHostname;
        staticUrl.protocol = "https:";
        return fetch(new Request(staticUrl, request), { cf: { cacheTtl: 86400, cacheEverything: true } });
    }

    // Filter Bot Unknown (Hanya untuk halaman)
    if (!request.cf?.bot && !allowedBots.some(bot => userAgent.includes(bot))) {
        if (userAgent === "" || userAgent.length < 15) {
            return new Response("Access Denied", { status: 403 });
        }
    }

    // 0. FITUR PINTEREST (JANGAN DISENTUH)
    if (path.includes("/pinterest-") && path.includes(".html")) {
      const rawFileName = path.split('/').pop();
      const cleanCode = rawFileName.replace('pinterest-', '').replace('.html', '');
      const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="p:domain_verify" content="${cleanCode}"/><meta name="pinterest-site-verification" content="${cleanCode}" /><title>Pinterest Verification</title></head><body><h1>Pinterest Verification Code: ${cleanCode}</h1></body></html>`;
      return new Response(htmlContent, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
    }

    // 1. LOGIKA PINDAH ALAM SELEKTIF (JANGAN DISENTUH)
    const isRssRequest = path.includes('rss') || path.includes('feed') || path.includes('.xml');
    const MONEYSITE_URL = "https://brianna.brocenter.co.uk"; 
    const isMoneySite = hostname === "brianna.brocenter.co.uk";

    if (path.startsWith('/post/') && !isRssRequest && !isMoneySite) {
      const targetUrl = `${MONEYSITE_URL}${path}${url.search}`;
      const htmlRedirect = `<!DOCTYPE html><html><head><title>Redirecting...</title><meta http-equiv="refresh" content="0;url=${targetUrl}"></head><body><p>Redirecting to <a href="${targetUrl}">${targetUrl}</a></p></body></html>`.trim();
      return new Response(htmlRedirect, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
    }

    // 3. PROXY KE PAGES (UNTUK HALAMAN HTML)
    const targetUrl = new URL(request.url);
    targetUrl.hostname = targetHostname;
    targetUrl.protocol = "https:";

    const proxyRequest = new Request(targetUrl, request);
    proxyRequest.headers.set("Host", targetHostname);
    proxyRequest.headers.set("X-Forwarded-Host", hostname);
    
    try {
        let response = await fetch(proxyRequest, { cf: { cacheTtl: LP_CACHE_TTL, cacheEverything: true } });
        if (response.status === 404 && response.headers.get("x-cf-pages")) {
             return Response.redirect(`https://${hostname}/`, 302);
        }
        const newResponse = new Response(response.body, response);
        const locationHeader = newResponse.headers.get("Location");
        if (locationHeader && locationHeader.includes(".pages.dev")) {
            newResponse.headers.set("Location", locationHeader.replace(targetHostname, hostname));
        }
        return newResponse;
    } catch (err) {
        return new Response(`Error: Upstream Timeout`, { status: 502 });
    }
  }
};
