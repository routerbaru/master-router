// Path: index.js (Master Router - Fix Redirect & RSS Image Full)

const LP_CACHE_TTL = 3600; 
const MONEYSITE_URL = "https://brianna.brocenter.co.uk";

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
      const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="p:domain_verify" content="${cleanCode}"/><title>Verification</title></head><body>${cleanCode}</body></html>`;
      
      return new Response(htmlContent, {
        headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' },
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
    if (!rootDomain) return new Response("Error 403", { status: 403 });

    let projectKey = hostname.replace(`.${rootDomain}`, "");
    if (projectKey === rootDomain || projectKey === "") projectKey = "default"; 

    let mappings = {};
    try {
        const configReq = await fetch(CONFIG_URL, { cf: { cacheTtl: 600, cacheEverything: true } });
        mappings = configReq.ok ? await configReq.json() : {};
    } catch (e) { mappings = {}; }

    const targetProject = mappings[projectKey] || DEFAULT_FALLBACK_PROJECT;
    const targetHostname = `${targetProject}.pages.dev`;

    // ==================================================================
    // 3. LOGIKA PINDAH ALAM (MONEYSITE REDIRECT)
    // ==================================================================
    const isRssRequest = path.toLowerCase().includes('rss') || 
                         path.toLowerCase().includes('feed') || 
                         path.endsWith('.xml');

    // Redirect ke moneysite jika bukan halaman root, bukan RSS, dan bukan pinterest file
    if (!isRssRequest && path !== "/" && !path.includes("pinterest-")) {
      const targetUrl = `${MONEYSITE_URL}${path}${url.search}`;
      return new Response(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${targetUrl}"></head></html>`, { 
        headers: { 'Content-Type': 'text/html; charset=UTF-8' } 
      });
    }

    // ==================================================================
    // 4. FITUR RSS & PODCAST (FIX GAMBAR & LINK BOCOR)
    // ==================================================================
    if (isRssRequest) {
        const rssUrl = new URL(request.url);
        rssUrl.hostname = targetHostname;
        
        const rssRes = await fetch(new Request(rssUrl, request), { cf: { cacheTtl: 60 } });
        let xmlText = await rssRes.text();
        
        // Ganti semua link .pages.dev ke domain asli (Pembersihan Bocor)
        const pagesPattern = new RegExp(`https?://[^"'>]*?${targetProject}\\.pages\\.dev`, 'g');
        xmlText = xmlText.replace(pagesPattern, `https://${hostname}`);
        xmlText = xmlText.split(targetHostname).join(hostname);
        
        // FIX GAMBAR PINTEREST: Jika ada URL gambar (.jpg/.png) tapi tidak ada tag <enclosure>
        // Kita paksa masukkan enclosure agar Pinterest bisa baca gambarnya
        if (!xmlText.includes("<enclosure")) {
          xmlText = xmlText.replace(/<item>/g, (match) => {
            // Mencari URL gambar pertama di dalam konten untuk dijadikan enclosure
            const imgMatch = xmlText.match(/https?:\/\/[^"'>\s]+\.(?:jpg|jpeg|png|webp|gif)/);
            const imgUrl = imgMatch ? imgMatch[0] : `https://${hostname}/default-image.jpg`;
            return `<item>\n<enclosure url="${imgUrl}" length="0" type="image/jpeg" />`;
          });
        }
        
        return new Response(xmlText, {
            headers: { 
                "Content-Type": "application/xml; charset=utf-8",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }

    // ==================================================================
    // 5. PROXY UTAMA (KE CLOUDFLARE PAGES)
    // ==================================================================
    const finalUrl = new URL(request.url);
    finalUrl.hostname = targetHostname;

    try {
        let response = await fetch(new Request(finalUrl, request), { 
            cf: { cacheTtl: LP_CACHE_TTL, cacheEverything: true } 
        });
        
        if (response.status === 404) return Response.redirect(`https://${hostname}/`, 302);

        const newResponse = new Response(response.body, response);
        const loc = newResponse.headers.get("Location");
        if (loc && loc.includes(".pages.dev")) {
            newResponse.headers.set("Location", loc.replace(targetHostname, hostname));
        }
        return newResponse;
    } catch (err) {
        return new Response("Error: Upstream Timeout", { status: 502 });
    }
  }
};
