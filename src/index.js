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
    // Menangkap URL apapun yang berawalan /pinterest-
    
    if (path.includes("/pinterest-") && path.includes(".html")) {
      
      // 1. AMBIL DATA DARI URL APA ADANYA
      // path: /pinterest-2cb22134ea1fd0750aea6b565a2234bf.html
      
      const rawFileName = path.split('/').pop(); // pinterest-xxxx.html
      // Bersihkan nama file untuk mendapatkan kodenya saja
      const cleanCode = rawFileName.replace('pinterest-', '').replace('.html', '');

      // 2. BUAT HTML VALID
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

      // 3. HEADER PEMBUNUH CACHE (RAHASIANYA DISINI)
      // 'no-store' = Jangan disimpan di storage manapun
      // 'max-age=0' = Data ini langsung kadaluarsa detik ini juga
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
    // AKHIR FITUR PINTEREST
    // =========================================================


    // --- LOGIKA ROUTER BAWAAN (JANGAN DIUBAH) ---
    const CONFIG_URL = "https://raw.githubusercontent.com/routerbaru/master-router/main/routes.json";
    const DEFAULT_FALLBACK_PROJECT = "lp-eqk"; 

    const allowedDomains = [
      "bokklastread.co.uk",
      "cengeng.co.uk",
      "gembul.co.uk",
      "gentonk.co.uk",
      "master-router.router2.workers.dev"
    ];

    let projectKey = ""; 
    let isWorkerDomain = hostname === "master-router.router2.workers.dev";

    if (isWorkerDomain) {
        const pathSegments = path.split('/').filter(Boolean);
        if (pathSegments.length > 0) {
            projectKey = pathSegments[0]; 
            path = "/" + pathSegments.slice(1).join("/");
        } else {
            projectKey = "default"; 
        }
    } else {
        const rootDomain = allowedDomains.find(d => hostname.endsWith(d));
        if (!rootDomain) return new Response("Error 403: Invalid Domain Config", { status: 403 });
        projectKey = hostname.replace(`.${rootDomain}`, "");
    }

    let targetProject = null;
    const HARDCODED_BACKUP = {
       "dalban": "lp-eqk",
       "orbit": "lp-eqk"
    };

    let mappings = {};
    try {
        const configReq = await fetch(CONFIG_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
        if (configReq.ok) {
            mappings = await configReq.json();
        } else {
            mappings = HARDCODED_BACKUP; 
        }
    } catch (e) {
        mappings = HARDCODED_BACKUP;
    }

    if (Object.keys(mappings).length === 0) mappings = HARDCODED_BACKUP;

    if (mappings[projectKey]) {
        targetProject = mappings[projectKey];
    } else {
        targetProject = DEFAULT_FALLBACK_PROJECT;
    }

    const targetHostname = `${targetProject}.pages.dev`;
    const targetUrl = new URL(request.url);
    targetUrl.hostname = targetHostname;
    targetUrl.pathname = path; 
    targetUrl.protocol = "https:";

    const proxyRequest = new Request(targetUrl, request);
    
    proxyRequest.headers.set("Host", targetHostname);
    proxyRequest.headers.set("X-Forwarded-Host", hostname);
    
    try {
        // Cache LP tetap jalan (agar user experience bagus)
        let response = await fetch(proxyRequest, {
            cf: { cacheTtl: LP_CACHE_TTL, cacheEverything: true }
        });

        if (response.status === 404 && response.headers.get("x-cf-pages")) {
             return Response.redirect(`https://${hostname}/`, 302);
        }

        const newResponse = new Response(response.body, response);
        const locationHeader = newResponse.headers.get("Location");
        if (locationHeader && locationHeader.includes(".pages.dev")) {
            const fixedLocation = locationHeader.replace(targetHostname, hostname);
            newResponse.headers.set("Location", fixedLocation);
        }

        return newResponse;

    } catch (err) {
        return new Response(`Error: Upstream Timeout (${err.message})`, { status: 502 });
    }
  }
};
