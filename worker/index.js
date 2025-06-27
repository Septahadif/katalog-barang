// Fungsi utilitas
async function getAllItems(env) {
  const items1 = JSON.parse(await env.KATALOG.get("items") || "[]");
  const items2 = JSON.parse(await env.KATALOG_2.get("items") || "[]");
  return [...items1, ...items2];
}

async function saveItem(env, item) {
  try {
    const items = JSON.parse(await env.KATALOG.get("items") || "[]");
    items.push(item);
    await env.KATALOG.put("items", JSON.stringify(items));
    return "KATALOG";
  } catch (err) {
    const items2 = JSON.parse(await env.KATALOG_2.get("items") || "[]");
    items2.push(item);
    await env.KATALOG_2.put("items", JSON.stringify(items2));
    return "KATALOG_2";
  }
}

async function deleteItemById(env, id) {
  let found = false;

  const from1 = JSON.parse(await env.KATALOG.get("items") || "[]");
  const filtered1 = from1.filter(item => item.id !== id);
  if (filtered1.length !== from1.length) {
    await env.KATALOG.put("items", JSON.stringify(filtered1));
    found = true;
  }

  const from2 = JSON.parse(await env.KATALOG_2.get("items") || "[]");
  const filtered2 = from2.filter(item => item.id !== id);
  if (filtered2.length !== from2.length) {
    await env.KATALOG_2.put("items", JSON.stringify(filtered2));
    found = true;
  }

  return found;
}

   async function saveItemSmart(env, item) {
  const MAX_SAFE_SIZE = 17_500_000; // ~70% dari 25MB
  try {
    const raw = await env.KATALOG.get("items");
    let items = [];

    if (raw) {
      items = JSON.parse(raw);
      const size = new TextEncoder().encode(JSON.stringify(items)).length;

      if (size >= MAX_SAFE_SIZE) {
        // Simpan ke KATALOG_2
        const raw2 = await env.KATALOG_2.get("items");
        const items2 = raw2 ? JSON.parse(raw2) : [];
        items2.push(item);
        await env.KATALOG_2.put("items", JSON.stringify(items2));
        return "KATALOG_2";
      }
    }

    // Simpan ke KATALOG
    items.push(item);
    await env.KATALOG.put("items", JSON.stringify(items));
    return "KATALOG";
  } catch (err) {
    console.warn("Fallback ke KATALOG_2 karena error:", err.message);
    const raw2 = await env.KATALOG_2.get("items");
    const items2 = raw2 ? JSON.parse(raw2) : [];
    items2.push(item);
    await env.KATALOG_2.put("items", JSON.stringify(items2));
    return "KATALOG_2";
  }
}

async function tulisLog(env, isi, level = "info") {
  const timestamp = new Date().toISOString();
  const logEntry = {
    waktu: timestamp,
    level,
    isi: typeof isi === "string" ? isi : JSON.stringify(isi)
  };
  const key = `log:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    await env.LOGS.put(key, JSON.stringify(logEntry));
  } catch (err) {
    console.error("Gagal menulis log:", err);
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/" || path === "/index.html") {
      return new Response(INDEX_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600"
        },
      });
    }

    if (path === "/script.js") {
      return new Response(SCRIPT_JS, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=3600"
        },
      });
    }

    if (path.startsWith("/api/image/")) {
      const id = path.split('/')[3];
      if (!id) return new Response("Missing ID", { status: 400 });

      const cacheKey = new Request(url.toString());
      const cached = await caches.default.match(cacheKey);
      if (cached) return cached;

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Image load timeout")), 5000)
        );

        const itemsPromise = getAllItems(env);
        const items = await Promise.race([itemsPromise, timeoutPromise]);

        const item = items.find(item => item.id === id);
        if (!item || !item.base64) {
          return new Response("Image not found", { status: 404 });
        }

        let base64Data = item.base64;
        const base64Regex = /^data:image\/([a-zA-Z]*);base64,([^\"]*)$/;

        if (base64Regex.test(item.base64)) {
          base64Data = item.base64.split(',')[1];
        }

        if (!base64Data || base64Data.length % 4 !== 0) {
          return new Response("Invalid image data", { status: 400 });
        }

        const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const response = new Response(imageBuffer, {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable"
          }
        });

        ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
        return response;
      } catch (error) {
        console.error("Image load error:", error);
        return new Response("Error loading image", {
          status: 500,
          headers: { "Retry-After": "2" }
        });
      }
    }

    if (path === "/api/login" && req.method === "POST") {
      try {
        const { username, password } = await req.json();
        const ADMIN_USERNAME = env.ADMIN_USERNAME || "septa";
        const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "septa2n2n";
        const isAdmin = username === ADMIN_USERNAME && password === ADMIN_PASSWORD;

        if (isAdmin) {
          const token = crypto.randomUUID();
          await env.KATALOG.put("admin_token", token);

          return new Response(JSON.stringify({ success: true }), {
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": `admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/`
            }
          });
        }
        return new Response(JSON.stringify({ success: false }), { status: 401 });
      } catch (error) {
        return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
      }
    }

    if (path === "/api/check-admin") {
      try {
        const cookieHeader = req.headers.get("Cookie") || "";
        const cookies = new Map(cookieHeader.split(';').map(c => c.trim().split('=')));
        const token = cookies.get("admin");
        const validToken = await env.KATALOG.get("admin_token");

        return new Response(JSON.stringify({ isAdmin: token === validToken }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ isAdmin: false }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (path === "/api/logout") {
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "admin=; expires=Thu, 01 Jan 1970 00:00:00 GMT"
        }
      });
    }

    if (path === "/api/list") {
      try {
        const page = Math.max(1, parseInt(url.searchParams.get("page")) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit")) || 10));

        const cacheKey = new Request(url.toString());
        const cached = await caches.default.match(cacheKey);
        if (cached) return cached;

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("KV timeout")), 3000)
        );

        const items = await Promise.race([getAllItems(env), timeoutPromise]);
        items.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        const startIndex = (page - 1) * limit;
        const endIndex = Math.min(startIndex + limit, items.length);

        const response = new Response(JSON.stringify({
          items: items.slice(startIndex, endIndex),
          total: items.length,
          page,
          limit,
          hasMore: endIndex < items.length
        }), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=60"
          }
        });

        ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
        return response;
      } catch (error) {
        console.error("Error in /api/list:", error);
        return new Response(JSON.stringify({
          error: "Internal Server Error",
          message: error.message
        }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
    }

    if (path === "/api/tambah" && req.method === "POST") {
  try {
    const cookieHeader = req.headers.get("Cookie") || "";
    const cookies = new Map(cookieHeader.split(';').map(c => c.trim().split('=')));
    const token = cookies.get("admin");
    const validToken = await env.KATALOG.get("admin_token");

    if (token !== validToken) {
      await tulisLog(env, "Tambah ditolak: unauthorized", "warn");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const body = await req.json();

    if (!body.nama || typeof body.nama !== "string" || body.nama.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Nama barang harus diisi" }), { status: 400 });
    }
    if (!body.harga || isNaN(body.harga) || Number(body.harga) <= 0) {
      return new Response(JSON.stringify({ error: "Harga harus angka positif" }), { status: 400 });
    }
    if (!body.satuan || typeof body.satuan !== "string" || body.satuan.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Satuan harus diisi" }), { status: 400 });
    }
    if (!body.base64 || typeof body.base64 !== "string" || !body.base64.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "Gambar tidak valid" }), { status: 400 });
    }

    const item = {
      ...body,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      nama: body.nama.trim(),
      satuan: body.satuan.trim(),
      harga: Number(body.harga)
    };

    const namespaceUsed = await saveItemSmart(env, item);

    await tulisLog(env, `Barang ditambah: ${item.nama} (${item.id}) ke ${namespaceUsed}`, "info");

    ctx.waitUntil(caches.default.delete("/api/list"));

    return new Response(JSON.stringify({
      success: true,
      id: item.id,
      storedIn: namespaceUsed
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    await tulisLog(env, `Gagal menambah barang: ${error.message}`, "error");
    console.error("Error adding item:", error);
    return new Response(JSON.stringify({
      error: "Failed to add item",
      details: error.message
    }), { status: 500 });
  }
}

    if (path === "/api/hapus" && req.method === "POST") {
  try {
    const cookieHeader = req.headers.get("Cookie") || "";
    const cookies = new Map(cookieHeader.split(';').map(c => c.trim().split('=')));
    const token = cookies.get("admin");
    const validToken = await env.KATALOG.get("admin_token");

    if (token !== validToken) {
      await tulisLog(env, "Hapus ditolak: unauthorized", "warn");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { id } = await req.json();
    if (!id) return new Response("Missing ID", { status: 400 });

    const found = await deleteItemById(env, id);
    if (!found) {
      await tulisLog(env, `Gagal hapus: ID ${id} tidak ditemukan`, "warn");
      return new Response(JSON.stringify({ error: "ID not found" }), { status: 404 });
    }

    await tulisLog(env, `Barang dihapus: ${id}`, "info");

    ctx.waitUntil(Promise.all([
      caches.default.delete("/api/list"),
      caches.default.delete(new Request(new URL("/api/image/" + id, req.url).toString()))
    ]));

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    await tulisLog(env, `Gagal menghapus barang: ${error.message}`, "error");
    console.error("Error deleting item:", error);
    return new Response(JSON.stringify({
      error: "Failed to delete item",
      details: error.message
    }), { status: 500 });
  }
}

if (path === "/api/logs") {
  const list = await env.LOGS.list({ prefix: "log:", limit: 100, reverse: true });
  const logs = await Promise.all(list.keys.map(async key => {
    const val = await env.LOGS.get(key.name);
    return JSON.parse(val || "{}");
  }));

  return new Response(JSON.stringify(logs, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
}

if (path === "/api/logs-clear") {
  try {
    // Cek admin token dari cookie
    const cookieHeader = req.headers.get("Cookie") || "";
    const cookies = new Map(cookieHeader.split(';').map(c => c.trim().split('=')));
    const token = cookies.get("admin");
    const validToken = await env.KATALOG.get("admin_token");

    if (token !== validToken) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Ambil semua log key
    const list = await env.LOGS.list({ prefix: "log:" });

    // Hapus semuanya
    await Promise.all(list.keys.map(key => env.LOGS.delete(key.name)));

    await tulisLog(env, `Admin menghapus semua log`, "warn");

    return new Response(`✅ ${list.keys.length} log berhasil dihapus.`, {
      headers: { "Content-Type": "text/plain" }
    });
  } catch (err) {
    console.error("Gagal menghapus log:", err);
    return new Response("❌ Gagal hapus log: " + err.message, { status: 500 });
  }
}



    return new Response("404 Not Found", { status: 404 });
  }
}

const INDEX_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Katalog Barang</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
  <style>
    .login-modal-buttons {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
    #adminControls {
      transition: all 0.3s ease;
    }
    .image-preview {
      max-width: 100%;
      height: auto;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-top: 10px;
      background-color: white;
      display: block;
    }
    .header-container {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      margin-bottom: 1rem;
      width: 100%;
    }
    .title-center {
      text-align: center;
      width: 100%;
      margin-top: 10px;
    }
    .login-btn-container {
      margin-bottom: 10px;
    }
    .login-btn {
      background-color: #4b5563;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }
    .capitalize-input {
      text-transform: capitalize;
    }
    .skeleton-item {
      background-color: #f3f4f6;
      border-radius: 0.25rem;
      overflow: hidden;
    }
    .skeleton-image {
      width: 100%;
      height: 0;
      padding-bottom: 100%;
      background-color: #e5e7eb;
    }
    .skeleton-text {
      height: 1rem;
      background-color: #e5e7eb;
      border-radius: 0.125rem;
      margin: 0.5rem 0;
    }
    .skeleton-text.short {
      width: 60%;
    }
    .skeleton-text.medium {
      width: 80%;
    }
    .image-container {
      position: relative;
      width: 100%;
      height: 0;
      padding-bottom: 100%;
      overflow: hidden;
      background-color: #f3f4f6;
    }
    .image-container img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: opacity 0.3s ease;
    }
    .image-container img.loading {
      opacity: 0;
    }
    .image-container img.loaded {
      opacity: 1;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .item-animate {
      animation: fadeIn 0.3s ease forwards;
      opacity: 0;
    }
    .retry-btn {
      background-color: #3b82f6;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      margin-top: 0.5rem;
      cursor: pointer;
      border: none;
    }
    .retry-btn:hover {
      background-color: #2563eb;
    }
    .loading-indicator {
      text-align: center;
      padding: 1rem;
      color: #6b7280;
    }
    .error-message {
      color: #ef4444;
      text-align: center;
      padding: 1rem;
      background-color: #fee2e2;
      border-radius: 0.375rem;
      margin: 1rem 0;
    }
    .image-retry {
      transition: all 0.3s ease;
    }
    .image-retry.hidden {
      opacity: 0;
      pointer-events: none;
    }
  </style>
</head>
<body class="bg-gray-100 min-h-screen flex flex-col items-center p-4">
  <div class="w-full max-w-xl">
    <div class="header-container">
      <div class="login-btn-container">
        <button id="showLoginBtn" class="login-btn hover:bg-gray-700 transition">
          Login
        </button>
      </div>
      <h1 class="text-2xl font-bold title-center">📦 Katalog Barang</h1>
    </div>
    
    <div id="loginModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white p-6 rounded-lg shadow-lg w-80">
        <h2 class="text-xl font-bold mb-4">Login Admin</h2>
        <form id="loginForm" class="space-y-4">
          <div>
            <label class="block mb-1">Username</label>
            <input type="text" id="loginUsername" class="w-full border p-2 rounded" required>
          </div>
          <div>
            <label class="block mb-1">Password</label>
            <input type="password" id="loginPassword" class="w-full border p-2 rounded" required>
          </div>
          <div class="login-modal-buttons">
            <button type="button" id="cancelLoginBtn" class="flex-1 bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition">
              Batal
            </button>
            <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
              Login
            </button>
          </div>
        </form>
      </div>
    </div>

    <div id="adminControls" class="hidden mb-6">
      <button id="logoutBtn" class="bg-red-600 text-white px-4 py-2 rounded mb-4 hover:bg-red-700 transition">
        Logout
      </button>
      
      <form id="formBarang" class="bg-white p-4 rounded shadow space-y-3 mb-6">
        <div>
          <label class="block mb-1 font-medium">Nama Barang</label>
          <input id="nama" name="nama" type="text" required 
                 class="w-full border p-2 rounded capitalize-input"
                 placeholder="Contoh: Buku Gambar">
        </div>
        <div>
          <label class="block mb-1 font-medium">Harga (Rp)</label>
          <input id="harga" name="harga" type="number" required 
                 class="w-full border p-2 rounded"
                 placeholder="Contoh: 25000">
        </div>
        <div>
          <label class="block mb-1 font-medium">Satuan</label>
          <input id="satuan" name="satuan" type="text" required 
                 class="w-full border p-2 rounded capitalize-input"
                 placeholder="Contoh: Box / Pack">
        </div>
        <div>
          <label class="block mb-1 font-medium">Gambar</label>
          <input id="gambar" name="gambar" type="file" accept="image/*" required class="w-full border p-2 rounded">
          <div id="imagePreviewContainer" class="mt-2 hidden">
            <img id="imagePreview" class="image-preview">
          </div>
        </div>
        <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition w-full">
          Tambah Barang
        </button>
      </form>
    </div>

    <div id="katalog" class="grid gap-4 grid-cols-1 sm:grid-cols-2"></div>
    <div id="loadingIndicator" class="loading-indicator hidden">Memuat...</div>
    <div id="errorMessage" class="error-message hidden"></div>
  </div>

  <script src="script.js"></script>
</body>
</html>`;

const SCRIPT_JS = `"use strict";
class BarangApp {
  constructor() {
    this.isAdmin = false;
    this.currentPage = 1;
    this.itemsPerPage = 10;
    this.hasMoreItems = true;
    this.isLoading = false;
    this.maxRetries = 3;
    this.retryCount = 0;
    this.baseDelay = 1000;
    this.abortController = null;
    this.scrollDebounce = null;
    this.imageLoadTimeouts = new Map();
    
    this.scrollHandler = () => this.handleScroll();

    this.initElements();
    this.initEventListeners();
    this.checkAdminStatus();
    this.loadBarang();
  }

  initElements() {
    this.form = document.getElementById('formBarang');
    this.katalog = document.getElementById('katalog');
    this.adminControls = document.getElementById('adminControls');
    this.loginModal = document.getElementById('loginModal');
    this.loginForm = document.getElementById('loginForm');
    this.logoutBtn = document.getElementById('logoutBtn');
    this.showLoginBtn = document.getElementById('showLoginBtn');
    this.cancelLoginBtn = document.getElementById('cancelLoginBtn');
    this.fileInput = document.getElementById('gambar');
    this.imagePreview = document.getElementById('imagePreview');
    this.imagePreviewContainer = document.getElementById('imagePreviewContainer');
    this.namaInput = document.getElementById('nama');
    this.satuanInput = document.getElementById('satuan');
    this.loadingIndicator = document.getElementById('loadingIndicator');
    this.errorMessage = document.getElementById('errorMessage');
  }

  initEventListeners() {
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    this.logoutBtn.addEventListener('click', () => this.handleLogout());
    this.showLoginBtn.addEventListener('click', () => this.showLoginModal());
    this.cancelLoginBtn.addEventListener('click', () => this.cancelLogin());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.namaInput.addEventListener('input', (e) => this.autoCapitalize(e));
    this.satuanInput.addEventListener('input', (e) => this.autoCapitalize(e));
    this.namaInput.addEventListener('blur', (e) => this.autoCapitalize(e, true));
    this.satuanInput.addEventListener('blur', (e) => this.autoCapitalize(e, true));
    window.addEventListener('scroll', this.scrollHandler);
  }

  cleanup() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.observer.disconnect();
    if (this.scrollDebounce) {
      clearTimeout(this.scrollDebounce);
    }
    this.imageLoadTimeouts.forEach(timeout => clearTimeout(timeout));
    this.imageLoadTimeouts.clear();
    
    window.removeEventListener('scroll', this.scrollHandler);
  }

  autoCapitalize(event, force = false) {
    const input = event.target;
    const originalValue = input.value;
    
    if (originalValue.length === 0) return;
    
    const startPos = input.selectionStart;
    const endPos = input.selectionEnd;
    
    let newValue = originalValue.replace(/\\b\\w/g, char => char.toUpperCase());
    
    if (force && newValue !== originalValue) {
      newValue = newValue.replace(/\\s+/g, ' ').trim();
    }
    
    if (newValue !== originalValue) {
      input.value = newValue;
      const lengthDiff = newValue.length - originalValue.length;
      input.setSelectionRange(startPos + lengthDiff, endPos + lengthDiff);
    }
  }

  showLoginModal() {
    this.loginModal.classList.remove('hidden');
    document.getElementById('loginUsername').focus();
  }

  cancelLogin() {
    this.loginModal.classList.add('hidden');
  }

  async checkAdminStatus() {
    try {
      const response = await this.fetchWithRetry('/api/check-admin');
      const { isAdmin } = await response.json();
      this.isAdmin = isAdmin;
      this.toggleAdminUI();
    } catch (error) {
      console.error('Error checking admin status:', error);
      this.isAdmin = false;
      this.toggleAdminUI();
    }
  }

  toggleAdminUI() {
    if (this.isAdmin) {
      this.adminControls.classList.remove('hidden');
      this.showLoginBtn.classList.add('hidden');
    } else {
      this.adminControls.classList.add('hidden');
      this.loginModal.classList.add('hidden');
      this.showLoginBtn.classList.remove('hidden');
    }
  }

  async fetchWithRetry(url, options = {}, retries = this.maxRetries) {
    if (this.abortController) {
      this.abortController.abort();
    }
    
    this.abortController = new AbortController();
    
    try {
      const timeoutId = setTimeout(() => this.abortController.abort(), 10000);
      
      const response = await fetch(url, {
        ...options,
        signal: this.abortController.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(\`HTTP error! status: \${response.status}\`);
      
      return response;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (retries <= 0) throw error;
      
      const delay = Math.min(this.baseDelay * Math.pow(2, this.maxRetries - retries), 30000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.fetchWithRetry(url, options, retries - 1);
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
      const response = await this.fetchWithRetry('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (response.ok) {
        this.isAdmin = true;
        this.toggleAdminUI();
        this.loginModal.classList.add('hidden');
        this.resetAndLoad();
      } else {
        this.showError('Login gagal! Periksa username dan password');
      }
    } catch (error) {
      console.error('Login error:', error);
      this.showError('Terjadi kesalahan saat login. Silakan coba lagi.');
    }
  }

  async handleLogout() {
    try {
      await this.fetchWithRetry('/api/logout');
      this.isAdmin = false;
      this.toggleAdminUI();
      this.resetAndLoad();
    } catch (error) {
      console.error('Logout error:', error);
      this.showError('Terjadi kesalahan saat logout. Silakan coba lagi.');
    }
  }

  resetAndLoad() {
    this.currentPage = 1;
    this.hasMoreItems = true;
    this.katalog.innerHTML = '';
    this.loadBarang();
  }

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (!validTypes.includes(file.type)) {
      this.showError('Format gambar tidak didukung. Gunakan JPG, PNG, GIF, WebP, atau AVIF.');
      this.fileInput.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) { // 2MB max
      this.showError('Ukuran gambar terlalu besar. Maksimal 2MB.');
      this.fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      this.imagePreview.src = event.target.result;
      this.imagePreviewContainer.classList.remove('hidden');
    };
    
    reader.onerror = () => {
      this.showError('Gagal membaca file. Coba lagi.');
      this.fileInput.value = '';
    };
    
    reader.readAsDataURL(file);
  }

  showError(message) {
    this.errorMessage.textContent = message;
    this.errorMessage.classList.remove('hidden');
    setTimeout(() => {
      this.errorMessage.classList.add('hidden');
    }, 5000);
  }

  async handleSubmit(e) {
    e.preventDefault();
    const submitBtn = this.form.querySelector('button[type="submit"]');

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Memproses...';

      const formData = {
        nama: this.form.nama.value.trim(),
        harga: this.form.harga.value.trim(),
        satuan: this.form.satuan.value.trim(),
        gambar: this.form.gambar.files[0]
      };

      if (!formData.nama || !formData.harga || !formData.satuan || !formData.gambar) {
        throw new Error('Semua field harus diisi');
      }

      const base64 = await this.createSquareImage(formData.gambar);

      const response = await this.fetchWithRetry('/api/tambah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: formData.nama,
          harga: Number(formData.harga),
          satuan: formData.satuan,
          base64
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Gagal menambahkan barang');
      }

      this.showError('Barang berhasil ditambahkan!');
      this.form.reset();
      this.imagePreviewContainer.classList.add('hidden');
      
      this.addNewItemToView({
        ...result,
        id: result.id,
        nama: formData.nama,
        harga: formData.harga,
        satuan: formData.satuan,
        base64,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error:', error);
      this.showError('Error: ' + error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Tambah Barang';
    }
  }

  addNewItemToView(item) {
    const itemElement = this.createItemElement(item, 0);
    this.katalog.insertBefore(itemElement, this.katalog.firstChild);
    itemElement.scrollIntoView({ behavior: 'smooth' });
  }

  createSquareImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Resize to max 800px while maintaining aspect ratio
          const maxSize = 800;
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > maxSize) {
              height *= maxSize / width;
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width *= maxSize / height;
              height = maxSize;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to WebP for smaller size (fallback to jpeg)
          const base64 = canvas.toDataURL('image/webp', 0.85) || 
                         canvas.toDataURL('image/jpeg', 0.85);
          resolve(base64);
        };
        
        img.onerror = () => {
          reject(new Error('Gagal memuat gambar'));
        };
      };
      
      reader.onerror = () => {
        reject(new Error('Gagal membaca file'));
      };
      
      reader.readAsDataURL(file);
    });
  }

  async loadBarang() {
    if (this.isLoading || !this.hasMoreItems) return;
    this.isLoading = true;
    this.loadingIndicator.classList.remove('hidden');
    this.errorMessage.classList.add('hidden');

    try {
      if (this.currentPage === 1) {
        this.katalog.innerHTML = Array.from({ length: 6 }, () => \`
          <div class="bg-white p-3 rounded shadow skeleton-item">
            <div class="skeleton-image"></div>
            <div class="skeleton-text medium"></div>
            <div class="skeleton-text short"></div>
          </div>
        \`).join('');
      }

      const response = await this.fetchWithRetry(
        \`/api/list?\${new URLSearchParams({ 
          page: this.currentPage, 
          limit: this.itemsPerPage,
          _: Date.now() 
        })}\`
      );

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(\`Invalid response: \${text.substring(0, 100)}\`);
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || \`HTTP error! status: \${response.status}\`);
      }

      const { items, total, page, limit, hasMore } = await response.json();
      this.hasMoreItems = hasMore;
      
      if (items.length === 0 && this.currentPage === 1) {
        this.katalog.innerHTML = '<div class="text-center py-4 col-span-2"><p class="text-gray-500">Belum ada barang.</p></div>';
        return;
      }

      if (this.currentPage === 1) {
        this.katalog.innerHTML = '';
      }

      items.forEach((item, index) => {
        const itemElement = this.createItemElement(item, index);
        this.katalog.appendChild(itemElement); 
      });

    } catch (error) {
      console.error('Failed to load items:', error);
      
      let errorMsg = 'Gagal memuat data';
      if (error.message.includes('Invalid response') && error.message.includes('<!DOCTYPE')) {
        errorMsg = 'Terjadi kesalahan pada server (mengembalikan HTML bukan JSON)';
      } else {
        errorMsg = error.message || errorMsg;
      }
      
      this.showError(errorMsg);
      
      if (this.currentPage > 1) {
        this.currentPage--;
      }
    } finally {
      this.isLoading = false;
      this.loadingIndicator.classList.add('hidden');
    }
  }

  getScrollPercentage() {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = document.documentElement.clientHeight;
  return (scrollTop / (scrollHeight - clientHeight)) * 100;
}

  handleScroll() {
  if (this.isLoading || !this.hasMoreItems) return;
  
  if (this.scrollDebounce) {
    clearTimeout(this.scrollDebounce);
  }
  
  // Trigger load at 80% scroll
  if (this.getScrollPercentage() > 60) {
    this.scrollDebounce = setTimeout(() => {
      this.currentPage++;
      this.loadBarang();
    }, 200);
  }
}

  createItemElement(item, index) {
    const escapedId = this.escapeHtml(item.id);
    const escapedNama = this.escapeHtml(item.nama);
    const escapedSatuan = this.escapeHtml(item.satuan);
    const hargaFormatted = Number(item.harga).toLocaleString('id-ID');
    
    const itemElement = document.createElement('div');
    itemElement.className = 'bg-white p-3 rounded shadow item-animate';
    itemElement.style.animationDelay = \`\${index * 0.05}s\`;
    itemElement.setAttribute('data-id', escapedId);
    
    itemElement.innerHTML = \`
      <div class="image-container relative">
        <img 
          src="/api/image/\${escapedId}?t=\${item.timestamp || Date.now()}" 
          alt="\${escapedNama}" 
          class="loading" 
          loading="lazy"
          onload="this.classList.remove('loading'); this.classList.add('loaded'); window.app.clearImageTimeout(this)"
          onerror="window.app.handleImageError(this)"
        >
        <div class="image-retry hidden absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <button class="retry-btn" onclick="window.app.retryLoadImage(this)">Muat Ulang</button>
        </div>
      </div>
      <h2 class="text-lg font-semibold mt-2">\${escapedNama}</h2>
      <p class="text-sm text-gray-600">Rp \${hargaFormatted} / \${escapedSatuan}</p>
      \${this.isAdmin ? 
        \`<button onclick="app.hapusBarang('\${escapedId}')" class="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition">Hapus</button>\` 
        : ''}
    \`;
    
    // Set timeout untuk gambar
    const img = itemElement.querySelector('img');
    this.setImageTimeout(img);
    
    return itemElement;
  }

  setImageTimeout(img) {
    const timeoutId = setTimeout(() => {
      if (img && img.classList.contains('loading')) {
        img.dispatchEvent(new Event('error'));
      }
    }, 8000); // Timeout 8 detik
    
    this.imageLoadTimeouts.set(img, timeoutId);
  }

  clearImageTimeout(img) {
    if (this.imageLoadTimeouts.has(img)) {
      clearTimeout(this.imageLoadTimeouts.get(img));
      this.imageLoadTimeouts.delete(img);
    }
  }

  handleImageError(imgElement) {
    this.clearImageTimeout(imgElement);
    const container = imgElement.parentElement;
    const retryOverlay = container.querySelector('.image-retry');
    if (retryOverlay) {
      retryOverlay.classList.remove('hidden');
      
      // Coba muat ulang otomatis setelah 3 detik
      setTimeout(() => {
        if (retryOverlay && !retryOverlay.classList.contains('hidden')) {
          this.retryLoadImage(retryOverlay.querySelector('.retry-btn'));
        }
      }, 3000);
    }
  }

  retryLoadImage(button) {
    const overlay = button.parentElement;
    overlay.classList.add('hidden');
    const img = overlay.previousElementSibling;
    
    if (!img) return;
    
    // Tambahkan timestamp baru untuk bypass cache
    const newSrc = img.src.includes('?') ? 
      \`\${img.src.split('?')[0]}?t=\${Date.now()}\` : 
      \`\${img.src}?t=\${Date.now()}\`;
    
    img.src = newSrc;
    this.setImageTimeout(img);
  }

  async hapusBarang(id) {
    try {
      const konfirmasi = confirm('Yakin ingin menghapus barang ini?');
      if (!konfirmasi) return;

      const response = await this.fetchWithRetry('/api/hapus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Gagal menghapus barang');
      }
      
      this.showError('Barang berhasil dihapus');
      
      const itemElement = document.querySelector(\`[data-id="\${id}"]\`);
      if (itemElement) {
        itemElement.remove();
      }
    } catch (error) {
      console.error('Error:', error);
      this.showError('Error: ' + error.message);
    }
  }

  escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

const app = new BarangApp();
window.app = app;

window.addEventListener('beforeunload', () => {
  if (window.app) {
    window.app.cleanup();
  }
});
`;
