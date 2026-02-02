// =========================================================
// CONFIG: GLOBAL CACHE & TIMEOUT (Versi 27 Nov 2025)
// =========================================================
const CACHE_TTL = 3600; // Cache selama 1 Jam

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname; 
    let path = url.pathname; 

    // 1. KONFIGURASI URL & PROJECT DEFAULT
    const CONFIG_URL = "https://raw.githubusercontent.com/masbero323-art/master-router/main/routes.json";
    
    // 🔴 PROJECT FALLBACK (Sesuai History)
    const DEFAULT_FALLBACK_PROJECT = "lp-eqk"; 

    // Daftar Domain Kamu
    const allowedDomains = [
      "dalbankeak.co.uk ",
      "gembul.co.uk ",
      "gentonk.co.uk ",
      "getpdfbook.co.uk ",
      "getpdfbook.uk ",
      "kiwil.my.id ",
      "kopyor.co.uk ",
      "kopyor.uk ",
      "kuntrink.co.uk ",
      "kuntrink.uk ",
      "lemper.co.uk ",
      "lemper.org.uk ",
      "shopee-cod.my.id ",
      "smilespirit.co.uk ",
      "smilespirit.uk "

      // 👇 TAMBAHAN: Domain Worker Bawaan
      "router-utama.masbero323.workers.dev"
    ];

    // =========================================================
    // 2. LOGIKA DETEKSI "KEY" (NAMA PROJECT)
    // =========================================================
    let projectKey = ""; 
    let isWorkerDomain = hostname === "router-utama.masbero323.workers.dev";

    if (isWorkerDomain) {
        // --- LOGIKA JALUR DARURAT (WORKERS.DEV) ---
        // Cara pakai: router-utama.../dalban/halaman-buku
        const pathSegments = path.split('/').filter(Boolean);
        
        if (pathSegments.length > 0) {
            projectKey = pathSegments[0]; // Ambil 'dalban'
            
            // Hapus 'dalban' dari path agar tidak error di target
            path = "/" + pathSegments.slice(1).join("/");
        } else {
            projectKey = "default"; 
        }

    } else {
        // --- LOGIKA NORMAL (SUBDOMAIN) ---
        // Cara pakai: dalban.gembul.co.uk
        const rootDomain = allowedDomains.find(d => hostname.endsWith(d));
        
        // Jika domain tidak dikenali, tolak
        if (!rootDomain) return new Response("Error 403: Invalid Domain Config", { status: 403 });
        
        projectKey = hostname.replace(`.${rootDomain}`, "");
    }

    // =========================================================
    // 3. SMART ROUTING (JSON + HARDCODED BACKUP)
    // =========================================================
    let targetProject = null;

    // Cadangan Mati (Sesuai History 27 Nov)
    const HARDCODED_BACKUP = {
       "dalban": "books3-1q5",
       "orbit": "books2-5ju"
    };

    let mappings = {};

    try {
        // Fetch JSON dengan Cache
        const configReq = await fetch(CONFIG_URL, { 
            cf: { cacheTtl: 300, cacheEverything: true } 
        });

        if (configReq.ok) {
            mappings = await configReq.json();
        } else {
            mappings = HARDCODED_BACKUP; 
        }
    } catch (e) {
        mappings = HARDCODED_BACKUP;
    }

    // Gabungkan backup jika fetch gagal total
    if (Object.keys(mappings).length === 0) mappings = HARDCODED_BACKUP;

    // Penentuan Target Akhir
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
    targetUrl.protocol = "https:"; 
    targetUrl.pathname = path; 

    const proxyRequest = new Request(targetUrl, request);

    // 🛡️ HEADER MASKING
    proxyRequest.headers.set("Host", targetHostname);
    proxyRequest.headers.set("X-Forwarded-Host", hostname);
    proxyRequest.headers.set("X-Forwarded-Proto", "https");

    // =========================================================
    // 5. EKSEKUSI DENGAN CACHE & ANTI-LEAK
    // =========================================================
    try {
        let response = await fetch(proxyRequest, {
            cf: { cacheTtl: CACHE_TTL, cacheEverything: true }
        });

        // Cek jika Pages Tujuan Mati (404 Not Found dari Cloudflare Pages)
        if (response.status === 404 && response.headers.get("x-cf-pages")) {
             return Response.redirect(`https://${hostname}/`, 302);
        }

        const newResponse = new Response(response.body, response);

        // ANTI-LEAK: Fix Redirect Location
        const locationHeader = newResponse.headers.get("Location");
        if (locationHeader && locationHeader.includes(".pages.dev")) {
            const fixedLocation = locationHeader.replace(targetHostname, hostname);
            newResponse.headers.set("Location", fixedLocation);
        }

        // Security Header (Opsional)
        newResponse.headers.set("X-Powered-By", "Master-Router");

        return newResponse;

    } catch (err) {
        return new Response(`Error: Upstream Timeout (${err.message})`, { status: 502 });
    }
  }
};
