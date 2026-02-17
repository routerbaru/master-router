// Path: index.js (Master Router)

const LP_CACHE_TTL = 3600; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname; 
    let path = url.pathname; 

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
      return Response.redirect(`${MONEYSITE_URL}${path}${url.search}`, 302);
    }

    // 2. ROUTER ENGINE & MAPPING (FIXED LOGIC)
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
    
    if (rootDomain) {
        // Log: Ambil prefix subdomain, kalau root doang jadikan 'default'
        projectKey = hostname === rootDomain ? "default" : hostname.replace(`.${rootDomain}`, "");
    } else {
        projectKey = "default";
    }

    let mappings = {};
    try {
        const configReq = await fetch(CONFIG_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
        mappings = configReq.ok ? await configReq.json() : {};
    } catch (e) { mappings = {}; }

    // Log: Cari di mapping, kalau nggak ada lari ke lp-7jw
    const targetProject = mappings[projectKey] || DEFAULT_FALLBACK_PROJECT;
    const targetHostname = `${targetProject}.pages.dev`;
    
    const targetUrl = new URL(request.url);
    targetUrl.hostname = targetHostname;
    targetUrl.protocol = "https:";

    const proxyRequest = new Request(targetUrl, request);
    
    // Log: KUNCI FIX NAV-TITLE
    proxyRequest.headers.set("Host", targetHostname);
    proxyRequest.headers.set("X-Forwarded-Host", hostname);
    
    try {
        let response = await fetch(proxyRequest, { cf: { cacheTtl: LP_CACHE_TTL, cacheEverything: true } });

        // Balikin ke Home kalau 404 dari Pages
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
