// Path: index.js (Master Router - Final Stable & Podcast Fixed)

const LP_CACHE_TTL = 3600; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname; 
    let path = url.pathname; 

    // ==================================================================
    // 1. FITUR PINTEREST VERIFICATION (REAL TIME)
    // ==================================================================
    if (path.includes("/pinterest-") && path.includes(".html")) {
      const rawFileName = path.split('/').pop();
      const cleanCode = rawFileName.replace('pinterest-', '').replace('.html', '');
      const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="p:domain_verify" content="${cleanCode}"/><meta name="pinterest-site-verification" content="${cleanCode}" /><title>Pinterest Verification</title></head><body><h1>Code: ${cleanCode}</h1></body></html>`;
      
      return new Response(htmlContent, {
        headers: { 
          'Content-Type': 'text/html; charset=UTF-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 
          'Pragma': 'no-cache',
          'Expires': '0'
        },
      });
    }

    // ==================================================================
    // 2. IDENTIFIKASI PROJECT
    // ==================================================================
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

    const rootDomain = allowedDomains.find(d => hostname.endsWith(d));
    if (!rootDomain) return new Response("Error 403: Invalid Domain Config", { status: 403 });

    let projectKey = hostname.replace(`.${rootDomain}`, "");
    if (projectKey === rootDomain) projectKey = "default"; 

    let mappings = {};
    try {
        const configReq = await fetch(CONFIG_URL, { cf: { cacheTtl: 600, cacheEverything: true } });
        mappings = configReq.ok ? await configReq.json() : {};
    } catch (e) { mappings = {}; }

    const targetProject = mappings[projectKey] || DEFAULT_FALLBACK_PROJECT;
    const targetHostname = `${targetProject}.pages.dev`;

    // ==================================================================
    // 3. FITUR RSS & PODCAST LINK REWRITER (FIXED)
    // ==================================================================
    const isRssRequest = path.toLowerCase().includes('rss') || 
                         path.toLowerCase().includes('feed') || 
                         path.toLowerCase().includes('podcast') ||
                         path.endsWith('.xml');

    if (isRssRequest) {
        const rssUrl = new URL(request.url);
        rssUrl.hostname = targetHostname;
        rssUrl.protocol = "https:";
        
        // Teruskan header agar Function tahu hostname aslinya
        const newHeaders = new Headers(request.headers);
        newHeaders.set("X-Forwarded-Host", hostname);

        const rssRes = await fetch(new Request(rssUrl, { headers: newHeaders }), { 
            cf: { cacheTtl: 60, cacheEverything: true } 
        });
        
        let xmlText = await rssRes.text();
        
        // MODIFIED: Hanya ganti URL (https://...pages.dev) bukan string mentah
        // Ini mencegah kebocoran email contact@project.pages.dev menjadi salah format
        const targetFullUrl = `https://${targetHostname}`;
        const originalFullUrl = `https://${hostname}`;
        
        xmlText = xmlText.split(targetFullUrl).join(originalFullUrl);
        // Secondary clean up untuk link tanpa protocol jika ada
        xmlText = xmlText.split(targetHostname).join(hostname);
        
        return new Response(xmlText, {
            headers: { 
                "Content-Type": "application/rss+xml; charset=utf-8",
                "Cache-Control": "public, max-age=60", 
                "Access-Control-Allow-Origin": "*"
            }
        });
    }

    // ==================================================================
    // 4. LOGIKA PINDAH ALAM (MONEYSITE REDIRECT)
    // ==================================================================
    const MONEYSITE_URL = "https://brianna.brocenter.co.uk";
    if (projectKey === "brianna" && !isRssRequest) {
      const targetUrl = `${MONEYSITE_URL}${path}${url.search}`;
      const htmlRedirect = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${targetUrl}"></head><body></body></html>`;
      return new Response(htmlRedirect, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
    }

    // ==================================================================
    // 5. PROXY UTAMA (KE CLOUDFLARE PAGES)
    // ==================================================================
    const finalUrl = new URL(request.url);
    finalUrl.hostname = targetHostname;
    finalUrl.protocol = "https:";

    const proxyRequest = new Request(finalUrl, request);
    proxyRequest.headers.set("Host", targetHostname);
    proxyRequest.headers.set("X-Forwarded-Host", hostname);
    
    try {
        let response = await fetch(proxyRequest, { 
            cf: { cacheTtl: LP_CACHE_TTL, cacheEverything: true } 
        });
        
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
