// Path: index.js (Master Router - Secure Amazon Affiliate Redirect)
const LP_CACHE_TTL = 3600; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname; 
    let path = url.pathname; 

    // 1. PINTEREST VERIFICATION (Tetap di Subdomain Asli)
    if (path.includes("/pinterest-") && path.includes(".html")) {
      const cleanCode = path.split('/').pop().replace('pinterest-', '').replace('.html', '');
      return new Response(`<!DOCTYPE html><html><head><meta name="p:domain_verify" content="${cleanCode}"/></head><body>${cleanCode}</body></html>`, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // 2. IDENTIFIKASI PROJECT
    const CONFIG_URL = "https://raw.githubusercontent.com/masbero323-art/master-router/main/routes.json";
    const allowedDomains = ["co.uk", "uk", "org.uk", "my.id"];
    if (!allowedDomains.some(d => hostname.endsWith(d))) return new Response("Forbidden", { status: 403 });

    let projectKey = hostname.split('.')[0]; 
    let mappings = {};
    try {
        const configReq = await fetch(CONFIG_URL, { cf: { cacheTtl: 600 } });
        mappings = configReq.ok ? await configReq.json() : {};
    } catch (e) { mappings = {}; }

    const targetProject = mappings[projectKey] || "lp-7jw";
    const targetHostname = `${targetProject}.pages.dev`;

    // 3. RSS & PODCAST (Tetap di Subdomain Asli - WAJIB UNTUK INDEXING)
    const isRssRequest = path.toLowerCase().includes('rss') || path.includes('.xml');
    if (isRssRequest) {
        const rssUrl = new URL(request.url);
        rssUrl.hostname = targetHostname;
        
        const newHeaders = new Headers(request.headers);
        newHeaders.set("X-Forwarded-Host", hostname);

        const rssRes = await fetch(new Request(rssUrl, { headers: newHeaders }));
        let xmlText = await rssRes.text();
        
        // Rewrite URL agar tetap mengarah ke subdomain asli di dalam RSS
        xmlText = xmlText.split(`https://${targetHostname}`).join(`https://${hostname}`);
        
        return new Response(xmlText, { headers: { "Content-Type": "application/rss+xml" } });
    }

    // 4. REDIRECT 302 KE MONEYSITE (KHUSUS HALAMAN POST)
    const MONEYSITE_DOMAIN = "brianna.brocenter.co.uk";
    
    if (path.startsWith("/post/") && hostname !== MONEYSITE_DOMAIN) {
      const targetMoneysiteUrl = `https://${MONEYSITE_DOMAIN}${path}${url.search}`;
      
      // Menggunakan 302 agar aman untuk Affiliate & SEO
      return Response.redirect(targetMoneysiteUrl, 302);
    }

    // 5. PROXY UTAMA (HOME, ADMIN, ASSETS)
    const finalUrl = new URL(request.url);
    finalUrl.hostname = targetHostname;
    
    const proxyRequest = new Request(finalUrl, request);
    proxyRequest.headers.set("Host", targetHostname);
    proxyRequest.headers.set("X-Forwarded-Host", hostname);
    
    try {
        let response = await fetch(proxyRequest, { 
            cf: { cacheTtl: LP_CACHE_TTL, cacheEverything: true } 
        });

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
