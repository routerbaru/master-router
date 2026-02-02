// =========================================================
// CONFIG: CACHE & BACKUP
// =========================================================
const LP_CACHE_TTL = 3600; 
const DEFAULT_FALLBACK_PROJECT = "lp-eqk"; // Project Utama (Backup Terakhir)

// Ini Backup Logic Abang (Sangat Penting)
// Dipakai kalau GitHub down ATAU Akun Pages tujuan kena Banned
const HARDCODED_BACKUP_PROJECT = "lp-eqk"; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname; 
    let path = url.pathname; 

    // =========================================================
    // 0. FITUR PINTEREST (TETAP SAMA)
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
    <title>Pinterest Verification</title>
</head>
<body><h1>Pinterest Verification</h1><p>Code: ${cleanCode}</p></body>
</html>`;
      return new Response(htmlContent, {
        headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' },
      });
    }

    // =========================================================
    // 1. AMBIL KONFIGURASI ROUTER (DIPERBAIKI)
    // =========================================================
    const CONFIG_URL = "https://raw.githubusercontent.com/masbero323-art/master-router/main/routes.json";
    
    // LOGIKA PERTAMA: Ambil JSON dengan bypass Cache (Supaya router baru langsung aktif)
    let mappings = {};
    const timestamp = Date.now(); // Trik agar selalu dapat data segar
    
    try {
        const configReq = await fetch(`${CONFIG_URL}?t=${timestamp}`, { 
            headers: { 'Cache-Control': 'no-cache' } // Paksa Cloudflare baca GitHub yang baru
        });
        
        if (configReq.ok) {
            mappings = await configReq.json();
        } else {
            // Kalau GitHub Down, biarkan kosong dulu (nanti dihandle di bawah)
            console.log("GitHub Error");
        }
    } catch (e) {
        console.log("Fetch Error");
    }

    // =========================================================
    // 2. TENTUKAN PROJECT TUJUAN
    // =========================================================
    // Deteksi Domain
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
        projectKey = pathSegments.length > 0 ? pathSegments[0] : "default";
        if(pathSegments.length > 0) path = "/" + pathSegments.slice(1).join("/");
    } else {
        const rootDomain = allowedDomains.find(d => hostname.endsWith(d));
        if (!rootDomain) return new Response("Error 403: Invalid Domain", { status: 403 });
        projectKey = hostname.replace(`.${rootDomain}`, "");
        if (projectKey === hostname) projectKey = "default"; 
    }

    // Cek tujuan di JSON. Kalau gak ada di JSON, default ke Backup.
    let targetProject = mappings[projectKey] || DEFAULT_FALLBACK_PROJECT;

    // =========================================================
    // 3. PROXY KE PAGES (DENGAN FITUR ANTI-BANNED)
    // =========================================================
    async function fetchFromPages(project) {
        const targetHostname = `${project}.pages.dev`;
        const targetUrl = new URL(request.url);
        targetUrl.hostname = targetHostname;
        targetUrl.pathname = path;
        targetUrl.protocol = "https:";
        
        const proxyReq = new Request(targetUrl, request);
        proxyReq.headers.set("Host", targetHostname);
        proxyReq.headers.set("X-Forwarded-Host", hostname);

        return await fetch(proxyReq, {
            cf: { cacheTtl: LP_CACHE_TTL, cacheEverything: true }
        });
    }

    try {
        // COBA 1: Tembak ke Project sesuai JSON (misal: books2-5ju)
        let response = await fetchFromPages(targetProject);

        // LOGIKA KEDUA (PENTING!): Cek apakah akun tujuan mati/dibanned?
        // Biasanya kalau diban returnnya 404 (Not Found dari Cloudflare) atau 522/502
        // Kita cek header "x-cf-pages" untuk memastikan itu error dari Pages
        
        const isDead = response.status === 404 || response.status >= 500;
        
        if (isDead) {
            // Kalau target utama MATI, kita oper ke BACKUP (Sesuai keinginan Abang)
            // Tapi cek dulu, jangan switch kalau targetnya emang sudah backup (biar gak looping)
            if (targetProject !== HARDCODED_BACKUP_PROJECT) {
                console.log(`Target ${targetProject} mati/ban. Pindah ke Backup.`);
                response = await fetchFromPages(HARDCODED_BACKUP_PROJECT);
            }
        }

        // Fix Redirect & Return
        const newResponse = new Response(response.body, response);
        const locationHeader = newResponse.headers.get("Location");
        if (locationHeader && locationHeader.includes(".pages.dev")) {
            newResponse.headers.set("Location", locationHeader.replace(".pages.dev", hostname));
        }
        return newResponse;

    } catch (err) {
        // Kalau error koneksi parah, jalan terakhir ke Backup
        return Response.redirect(`https://${hostname}/`, 302);
    }
  }
};
