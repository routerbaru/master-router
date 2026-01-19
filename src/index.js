// =========================================================
// CONFIG: GLOBAL CACHE & TIMEOUT
// =========================================================
const CACHE_TTL = 3600; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname; 
    let path = url.pathname; 

    // =========================================================
    // 0. FITUR ANTI-MULES: AUTO PINTEREST VERIFICATION (ULTIMATE)
    // =========================================================
    // Menangkap URL: /pinterest-xxxxx.html
    
    if (path.match(/^\/pinterest-[a-zA-Z0-9]+\.html$/)) {
      
      // 1. Ambil Kode Unik dari URL
      // Dari: /pinterest-2cb22134ea1fd0750aea6b565a2234bf.html
      // Menjadi: 2cb22134ea1fd0750aea6b565a2234bf
      const fileName = path.replace('/', ''); 
      const codeOnly = fileName.replace('pinterest-', '').replace('.html', ''); 

      // 2. BUAT HTML MENIRU FILE ASLI (Berdasarkan file yang kamu upload)
      // Kita pasang dua jenis Meta Tag sekaligus (Shotgun Strategy) biar pasti kena.
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    
    <meta name="p:domain_verify" content="${codeOnly}"/>
    
    <meta name="pinterest-site-verification" content="${codeOnly}" />
    
    <title>Pinterest Verification</title>
</head>
<body style="background-color:#f7f5f5; padding: 20px;">
    <h1>Pinterest Verification</h1>
    <p>File: ${fileName}</p>
    <p>Code: ${codeOnly}</p>
</body>
</html>`;

      // 3. Kirim sebagai HTML Valid + PAKSA HAPUS CACHE
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


    // 1. KONFIGURASI URL & PROJECT DEFAULT
    const CONFIG_URL = "https://raw.githubusercontent.com/masbero323-art/master-router/main/routes.json";
    const DEFAULT_FALLBACK_PROJECT = "books-c6s"; 

    // Daftar Domain Kamu
    const allowedDomains = [
      "bokklastread.co.uk",
      "brocenter.co.uk",
      "brocenter.uk",
      "cengeng.co.uk",
      "dalbankeak.co.uk",
      "gembul.co.uk",
      "gentonk.co.uk",
      "getpdfbook.co.uk",
      "getpdfbook.uk",
      "kopyor.co.uk",
      "kopyor.uk",
      "kuntrink.co.uk",
      "kuntrink.uk",
      "lemper.co.uk",
      "lemper.org.uk",
      "smilespirit.co.uk",
      "smilespirit.uk",
      "shopee-cod.my.id",
      "cenulmania.my.id",
      "cantikul.my.id",
      "kiwil.my.id",
      "router-utama.masbero323.workers.dev"
    ];

    // =========================================================
    // 2. LOGIKA DETEKSI "KEY" (NAMA PROJECT)
    // =========================================================
    let projectKey = ""; 
    let isWorkerDomain = hostname === "router-utama.masbero323.workers.dev";

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

    // =========================================================
    // 3. SMART ROUTING
    // =========================================================
    let targetProject = null;
    const HARDCODED_BACKUP = {
       "dalban": "books3-1q5",
       "orbit": "books2-5ju"
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

    // =========================================================
    // 4. EKSEKUSI PROXY KE PAGES
    // =========================================================
    const targetHostname = `${targetProject}.pages.dev`;
    const targetUrl = new URL(request.url);
    targetUrl.hostname = targetHostname;
    targetUrl.pathname = path; 
    targetUrl.protocol = "https:";

    const proxyRequest = new Request(targetUrl, request);
    
    proxyRequest.headers.set("Host", targetHostname);
    proxyRequest.headers.set("X-Forwarded-Host", hostname);
    
    try {
        let response = await fetch(proxyRequest, {
            cf: { cacheTtl: CACHE_TTL, cacheEverything: true }
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
