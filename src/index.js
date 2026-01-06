// =========================================================
// CONFIG: GLOBAL CACHE & TIMEOUT
// =========================================================
const CACHE_TTL = 3600; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname; 
    let path = url.pathname; // Kita butuh ini untuk logika worker

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
      // 👇 TAMBAHAN: Domain Worker Bawaan
      "router-utama.masbero323.workers.dev"
    ];

    // =========================================================
    // 2. LOGIKA DETEKSI "KEY" (NAMA PROJECT)
    // =========================================================
    let projectKey = ""; // Ini pengganti variabel 'subdomain'
    let isWorkerDomain = hostname === "router-utama.masbero323.workers.dev";

    if (isWorkerDomain) {
        // --- LOGIKA JALUR DARURAT (WORKERS.DEV) ---
        // Cara pakai: router-utama.masbero323.workers.dev/dalban/halaman-buku
        // Kita ambil "dalban" dari path pertama
        const pathSegments = path.split('/').filter(Boolean);
        
        if (pathSegments.length > 0) {
            projectKey = pathSegments[0]; // Ambil 'dalban'
            
            // PENTING: Hapus 'dalban' dari path agar tidak error di target
            // Jadi request ke target tetap /halaman-buku, bukan /dalban/halaman-buku
            path = "/" + pathSegments.slice(1).join("/");
        } else {
            // Jika dibuka tanpa path, pakai default
            projectKey = "default"; 
        }

    } else {
        // --- LOGIKA NORMAL (SUBDOMAIN) ---
        // Cara pakai: dalban.gembul.co.uk
        const rootDomain = allowedDomains.find(d => hostname.endsWith(d));
        if (!rootDomain) return new Response("Error 403: Invalid Domain Config", { status: 403 });
        
        projectKey = hostname.replace(`.${rootDomain}`, "");
    }

    // =========================================================
    // 3. SMART ROUTING (JSON + HARDCODED BACKUP)
    // =========================================================
    let targetProject = null;
    
    // Cadangan Mati (Isi manual beberapa yang paling penting buat jaga-jaga)
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

    // Gabungkan backup jika fetch gagal total
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
    
    // Buat URL baru dengan Path yang sudah dibersihkan (jika pakai worker)
    const targetUrl = new URL(request.url);
    targetUrl.hostname = targetHostname;
    targetUrl.pathname = path; // Path yang sudah disesuaikan
    targetUrl.protocol = "https:";

    const proxyRequest = new Request(targetUrl, request);
    
    // Header Masking
    proxyRequest.headers.set("Host", targetHostname);
    proxyRequest.headers.set("X-Forwarded-Host", hostname);
    
    try {
        let response = await fetch(proxyRequest, {
            cf: { cacheTtl: CACHE_TTL, cacheEverything: true }
        });

        // Cek jika Pages Tujuan Mati (404 Not Found dari Cloudflare Pages)
        if (response.status === 404 && response.headers.get("x-cf-pages")) {
             return Response.redirect(`https://${hostname}/`, 302);
        }

        const newResponse = new Response(response.body, response);

        // Anti-Leak Redirect Adjustment
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
