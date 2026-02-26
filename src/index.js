// Path: index.js (Master Router - RSS Link Fix & Bot Filter)

const LP_CACHE_TTL = 3600; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname; 
    let path = url.pathname.toLowerCase(); 

    // 1. IDENTIFIKASI PROJECT & MAPPING
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

    let mappings = {};
    try {
        const configReq = await fetch(CONFIG_URL, { cf: { cacheTtl: 86400, cacheEverything: true } });
        mappings = configReq.ok ? await configReq.json() : {};
    } catch (e) { mappings = {}; }

    const targetProject = mappings[projectKey] || DEFAULT_FALLBACK_PROJECT;
    const targetHostname = `${targetProject}.pages.dev`;

    // ==================================================================
    // 2. FITUR RSS LINK REWRITER & STATIC BYPASS
    // ==================================================================
    const isRssRequest = path.includes('rss') || path.includes('feed') || path.includes('.xml');
    const staticExt = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.css', '.js', '.txt', '.woff', '.woff2'];
    const isStaticFile = staticExt.some(ext => path.includes(ext));

    // LOGIKA KHUSUS RSS: Ganti link .pages.dev menjadi Hostname asli
    if (isRssRequest) {
        const rssUrl = new URL(request.url);
        rssUrl.hostname = targetHostname;
        rssUrl.protocol = "https:";
        
        const rssRes = await fetch(new Request(rssUrl, request), { cf: { cacheTtl: 3600, cacheEverything: true } });
        let xmlText = await rssRes.text();
        
        // GANTI SEMUA LINK .pages.dev MENJADI HOSTNAME ASLI AGAR PINTEREST VALID
        xmlText = xmlText.split(targetHostname).join(hostname);
        
        return new Response(xmlText, {
            headers: { 
                "Content-Type": "application/xml; charset=utf-8",
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }

    // LOGIKA KHUSUS STATIS: Langsung ambil tanpa filter bot
    if (isStaticFile) {
        const staticUrl = new URL(request.url);
        staticUrl.hostname = targetHostname;
        staticUrl.protocol = "https:";
        return fetch(new Request(staticUrl, request), { cf: { cacheTtl: 86400, cacheEverything: true } });
    }

    // ==================================================================
    // 3. FILTER BOT UNKNOWN (HEMAT KUOTA 100K)
    // ==================================================================
    const userAgent = request.headers.get("User-Agent") || "";
    const allowedBots = ["Pinterest", "Spotify", "Amazon", "CastBox", "KKBOX", "PocketCasts", "AppleCoreMedia", "Googlebot"];
    
    if (!request.cf?.bot && !allowedBots.some(bot => userAgent.includes(bot))) {
        if (userAgent === "" || userAgent.length < 15) {
            return new Response("Access Denied", { status: 403 });
        }
    }

    // 0. FITUR PINTEREST VERIFIKASI (JANGAN DISENTUH)
    if (path.includes("/pinterest-") && path.includes(".html")) {
      const rawFileName = path.split('/').pop();
      const cleanCode = rawFileName.replace('pinterest-', '').replace('.html', '');
      const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="p:domain_verify" content="${cleanCode}"/><meta name="pinterest-site-verification" content="${cleanCode}" /><title>Pinterest Verification</title></head><body><h1>Pinterest Verification Code: ${cleanCode}</h1></body></html>`;
      return new Response(htmlContent, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
    }

    // 1. LOGIKA PINDAH ALAM SELEKTIF (JANGAN DISENTUH)
    const MONEYSITE_URL =
