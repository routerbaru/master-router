// Path: index.js (Master Router)

// =========================================================
// CONFIG: CACHE LP (Hanya untuk User Manusia/Landing Page)
// =========================================================
const LP_CACHE_TTL = 3600; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname; 
    let path = url.pathname; 

    // =========================================================
    // 0. FITUR PINTEREST (NO-CACHE / REAL TIME GENERATOR)
    // =========================================================
    if (path.includes("/pinterest-") && path.includes(".html")) {
      const rawFileName = path.split('/').pop();
      const cleanCode = rawFileName.replace('pinterest-', '').replace('.html', '');

      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="p:domain_verify" content="${cleanCode}"/>
    <meta name="pinterest-site-verification" content="${cleanCode}" />
    <title>Pinterest Verification</title>
</head>
<body>
    <h1>Pinterest Verification</h1>
    <p>Code: ${cleanCode}</p>
</body>
</html>`;

      return new Response(htmlContent, {
        headers: { 
          'Content-Type': 'text/html; charset=UTF-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 
          'Pragma': 'no-cache',
          'Expires': '0'
        },
      });
    }

    // =========================================================
    // 1. LOGIKA PINDAH ALAM SELEKTIF
    // =========================================================
    const isRssRequest = path.includes('rss') || path.includes('feed') || path.includes('.xml');
    const MONEYSITE_URL = "https://brianna.brocenter.co.uk"; 
    const isMoneySite = hostname === "brianna.brocenter.co.uk";

    if (path.startsWith('/post/') && !isRssRequest && !isMoneySite) {
      const moneyhubUrl = `${MONEYSITE_URL}${path}${url.search}`;
      return Response.redirect(moneyhubUrl, 302);
    }

    // =========================================================
    // 2. ROUTER ENGINE & MAPPING
    // =========================================================
    const CONFIG_URL = "https://raw.githubusercontent.com/masbero323-art/master-router/main/routes.json";
    const DEFAULT_FALLBACK_PROJECT = "lp-eqk"; 

    const allowedDomains = [
      "bokklastread.co.uk", "brocenter.co.uk", "brocenter.uk", "cengeng.co.uk",
      "dalbankeak.co.uk", "gembul.co.uk", "gentonk.co.uk", "getpdfbook.co.uk",
      "getpdfbook.uk", "kopyor.co.uk", "kopyor.uk", "kuntrink.co.uk",
      "kuntrink.uk", "lemper.co.uk", "lemper.org.uk", "smilespirit.co.uk",
      "smilespirit.uk", "shopee-cod.my.id", "cenulmania.my.id",
      "cantikul.my.id", "kiwil.my.id", "router-utama.masbero323.workers.dev"
    ];

    let projectKey = ""; 
    let isWorkerDomain = hostname === "router-utama.masbero323.workers.dev";

    if (isWorkerDomain) {
        const pathSegments = path.split('/').filter(Boolean);
        if (pathSegments.length > 0) {
            projectKey = pathSegments[0]; 
            path = "/" + pathSegments.slice(1).join("/");
        } else { projectKey = "default"; }
    } else {
        const rootDomain = allowedDomains.find(d => hostname.endsWith(d));
        if (!rootDomain) return new Response("Error 403: Invalid Domain Config", { status: 403 });
        projectKey = hostname.replace(`.${rootDomain}`, "");
    }

    let mappings = {};
    try {
        const configReq = await fetch(CONFIG_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
        mappings = configReq.ok ? await configReq.json() : { "dalban": "lp-eqk", "orbit": "lp-eqk" };
    } catch (e) { mappings = { "dalban": "lp-eqk", "orbit": "lp-eqk" }; }

    const targetProject = mappings[projectKey] || DEFAULT_FALLBACK_PROJECT;
    const targetHostname = `${targetProject}.pages.dev`;
    const targetUrl = new URL(request.url);
    targetUrl.hostname = targetHostname;
    targetUrl.pathname = path; 

    // =========================================================
    // 3. PROXY FETCH (FIXED FOR BRANDING) (4).js, index (2).js]
    // =========================================================
    const proxyRequest = new Request(targetUrl, request);
    
    // Log: Pass target hostname for Pages routing
    proxyRequest.headers.set("Host", targetHostname);
    
    // Log: Pass ACTUAL hostname so [id].js can read it via request.headers.get("host")
    // [FIXED] Di Pages, header 'host' seringkali di-rewrite, maka kita kirim cadangan header (4).js]
    proxyRequest.headers.set("X-Forwarded-Host", hostname);
    
    try {
        let response = await fetch(proxyRequest, {
            cf: { cacheTtl: LP_CACHE_TTL, cacheEverything: true }
        });

        if (response.status === 404 && response.headers.get("x-cf-pages")) {
             return Response.redirect(`https://${hostname}/`, 302);
        }

        const newResponse = new Response(response.body, response);
        
        // Fix Redirect Leaks
        const locationHeader = newResponse.headers.get("Location");
        if (locationHeader && locationHeader.includes(".pages.dev")) {
            newResponse.headers.set("Location", locationHeader.replace(targetHostname, hostname));
        }

        return newResponse;

    } catch (err) {
        return new Response(`Error: Upstream Timeout (${err.message})`, { status: 502 });
    }
  }
};
