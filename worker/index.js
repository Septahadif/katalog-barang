export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Serve HTML
    if (path === "/" || path === "/index.html") {
      return new Response(INDEX_HTML, {
        headers: { 
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache"
        },
      });
    }

    // Serve JS
    if (path === "/script.js") {
      return new Response(SCRIPT_JS, {
        headers: { 
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-cache"
        },
      });
    }

    // Serve Image with robust handling
    if (path.startsWith("/api/image/")) {
      try {
        const id = path.split('/')[3];
        if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
          return new Response("Invalid ID", { status: 400 });
        }

        const items = JSON.parse(await env.KATALOG.get("items") || "[]");
        const item = items.find(item => item.id === id);
        
        if (!item || !item.base64) {
          return new Response("Image not found", { status: 404 });
        }

        // Robust base64 handling
        let base64Data;
        if (item.base64.startsWith("data:")) {
          const parts = item.base64.split(',');
          if (parts.length < 2) {
            return new Response("Invalid image format", { status: 400 });
          }
          base64Data = parts[1];
        } else {
          base64Data = item.base64;
        }

        // Validate base64
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) {
          return new Response("Invalid image data", { status: 400 });
        }

        // Convert to buffer
        const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        // Determine content type
        let contentType = "image/jpeg";
        if (item.base64.startsWith("data:image/png")) {
          contentType = "image/png";
        } else if (item.base64.startsWith("data:image/webp")) {
          contentType = "image/webp";
        }

        // Generate ETag for caching
        const etag = await crypto.subtle.digest('SHA-1', imageBuffer)
          .then(hash => Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0')).join('');
          });
        // Check If-None-Match header
        const ifNoneMatch = req.headers.get('If-None-Match');
        if (ifNoneMatch === etag) {
          return new Response(null, { status: 304 });
        }

        return new Response(imageBuffer, {
          headers: { 
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "ETag": etag
          }
        });
      } catch (error) {
        console.error("Image processing error:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    }

    // Login Admin with security headers
    if (path === "/api/login" && req.method === "POST") {
      try {
        const { username, password } = await req.json();
        const isAdmin = username === "septa" && password === "septa2n2n";
        
        if (isAdmin) {
          return new Response(JSON.stringify({ success: true }), {
            headers: { 
              "Content-Type": "application/json",
              "Set-Cookie": "admin=true; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400"
            }
          });
        }
        return new Response(JSON.stringify({ success: false, error: "Invalid credentials" }), { 
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "Invalid request" }), { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Check Admin Status
    if (path === "/api/check-admin") {
      const cookie = req.headers.get("Cookie") || "";
      return new Response(JSON.stringify({ 
        isAdmin: cookie.includes("admin=true") 
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    }

    // Logout
    if (path === "/api/logout") {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 
          "Content-Type": "application/json",
          "Set-Cookie": "admin=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/"
        }
      });
    }

    // GET list barang with cache control
    if (path === "/api/list") {
      try {
        const data = await env.KATALOG.get("items");
        return new Response(data || "[]", {
          headers: { 
            "Content-Type": "application/json",
            "Cache-Control": "no-cache"
          },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "Failed to load data" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // POST tambah barang (admin only) with validation
    if (path === "/api/tambah" && req.method === "POST") {
      try {
        const cookie = req.headers.get("Cookie") || "";
        if (!cookie.includes("admin=true")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { 
            status: 401,
            headers: { "Content-Type": "application/json" }
          });
        }

        const body = await req.json();
        
        // Robust validation
        if (!body.nama || typeof body.nama !== 'string' || body.nama.trim().length === 0) {
          return new Response(JSON.stringify({ error: "Nama barang harus diisi" }), { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        
        if (!body.harga || isNaN(body.harga) || body.harga <= 0) {
          return new Response(JSON.stringify({ error: "Harga tidak valid" }), { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        
        if (!body.satuan || typeof body.satuan !== 'string' || body.satuan.trim().length === 0) {
          return new Response(JSON.stringify({ error: "Satuan harus diisi" }), { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        
        if (!body.base64 || typeof body.base64 !== 'string' || !body.base64.startsWith('data:image/')) {
          return new Response(JSON.stringify({ error: "Gambar tidak valid" }), { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const items = JSON.parse(await env.KATALOG.get("items") || "[]");

        const item = { 
          ...body,
          id: Date.now().toString(),
          timestamp: Date.now(),
          nama: body.nama.trim(),
          satuan: body.satuan.trim(),
          harga: Number(body.harga)
        };

        items.push(item);

        await env.KATALOG.put("items", JSON.stringify(items));
        return new Response(JSON.stringify({ success: true, id: item.id }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error adding item:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // POST hapus barang (admin only) with validation
    if (path === "/api/hapus" && req.method === "POST") {
      try {
        const cookie = req.headers.get("Cookie") || "";
        if (!cookie.includes("admin=true")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { 
            status: 401,
            headers: { "Content-Type": "application/json" }
          });
        }

        const id = url.searchParams.get("id");
        if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
          return new Response(JSON.stringify({ error: "ID tidak valid" }), { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const items = JSON.parse(await env.KATALOG.get("items") || "[]");
        const updated = items.filter(item => item.id !== id);
        
        if (items.length === updated.length) {
          return new Response(JSON.stringify({ error: "Barang tidak ditemukan" }), { 
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        await env.KATALOG.put("items", JSON.stringify(updated));
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error deleting item:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Not found handler
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
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
    /* Custom Styles */
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
    
    /* Auto-capitalize input */
    .capitalize-input {
      text-transform: capitalize;
    }

    /* Loading states */
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

    /* Image container */
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

    /* Animation */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .item-animate {
      animation: fadeIn 0.3s ease forwards;
      opacity: 0;
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
    
    <!-- Admin Login Modal -->
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

    <!-- Admin Controls -->
    <div id="adminControls" class="hidden mb-6">
      <button id="logoutBtn" class="bg-red-600 text-white px-4 py-2 rounded mb-4 hover:bg-red-700 transition">
        Logout
      </button>
      
      <!-- Form Tambah Barang -->
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

    <!-- Katalog -->
    <div id="katalog" class="grid gap-4 grid-cols-1 sm:grid-cols-2"></div>
  </div>

  <script src="script.js"></script>
</body>
</html>`;

const SCRIPT_JS = `"use strict";
class BarangApp {
  constructor() {
    this.isAdmin = false;
    this.loadingQueue = [];
    this.currentLoadingIndex = 0;
    this.loadingBatchSize = 4;
    
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
      const response = await fetch('/api/check-admin', {
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error('Network response was not ok');
      
      const { isAdmin } = await response.json();
      this.isAdmin = isAdmin;
      this.toggleAdminUI();
    } catch (error) {
      console.error('Error checking admin status:', error);
      // Fallback to non-admin mode if check fails
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

  async handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
      alert('Username dan password harus diisi');
      return;
    }
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        this.isAdmin = true;
        this.toggleAdminUI();
        this.loginModal.classList.add('hidden');
        this.loadBarang();
      } else {
        alert(data.error || 'Login gagal! Periksa username dan password');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Terjadi kesalahan saat login. Coba lagi nanti.');
    }
  }

  async handleLogout() {
    try {
      const response = await fetch('/api/logout');
      if (response.ok) {
        this.isAdmin = false;
        this.toggleAdminUI();
        this.loadBarang();
      } else {
        throw new Error('Logout failed');
      }
    } catch (error) {
      console.error('Logout error:', error);
      alert('Gagal logout. Coba lagi.');
    }
  }

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (!validTypes.includes(file.type)) {
      alert('Format gambar tidak didukung. Gunakan JPG, PNG, GIF, WebP, atau AVIF.');
      this.fileInput.value = '';
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran gambar terlalu besar. Maksimal 5MB.');
      this.fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      this.imagePreview.src = event.target.result;
      this.imagePreviewContainer.classList.remove('hidden');
    };
    
    reader.onerror = () => {
      alert('Gagal membaca file. Coba lagi.');
      this.fileInput.value = '';
      this.imagePreviewContainer.classList.add('hidden');
    };
    
    reader.readAsDataURL(file);
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

      // Client-side validation
      if (!formData.nama) {
        throw new Error('Nama barang harus diisi');
      }
      
      if (!formData.harga || isNaN(formData.harga) || formData.harga <= 0) {
        throw new Error('Harga harus angka dan lebih dari 0');
      }
      
      if (!formData.satuan) {
        throw new Error('Satuan harus diisi');
      }
      
      if (!formData.gambar) {
        throw new Error('Gambar harus dipilih');
      }

      // Create a square version of the image
      const base64 = await this.createSquareImage(formData.gambar);

      const response = await fetch('/api/tambah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: formData.nama,
          harga: Number(formData.harga),
          satuan: formData.satuan,
          base64
        })
      });

      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || 'Gagal menambahkan barang');
      }

      // Show success message
      const successMsg = document.createElement('div');
      successMsg.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg';
      successMsg.textContent = 'Barang berhasil ditambahkan!';
      document.body.appendChild(successMsg);
      
      // Remove after 3 seconds
      setTimeout(() => {
        successMsg.classList.add('opacity-0', 'transition-opacity', 'duration-300');
        setTimeout(() => successMsg.remove(), 300);
      }, 3000);

      this.form.reset();
      this.imagePreviewContainer.classList.add('hidden');
      await this.loadBarang();
    } catch (error) {
      console.error('Error:', error);
      
      // Show error message
      const errorMsg = document.createElement('div');
      errorMsg.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg';
      errorMsg.textContent = 'Error: ' + error.message;
      document.body.appendChild(errorMsg);
      
      // Remove after 5 seconds
      setTimeout(() => {
        errorMsg.classList.add('opacity-0', 'transition-opacity', 'duration-300');
        setTimeout(() => errorMsg.remove(), 300);
      }, 5000);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Tambah Barang';
    }
  }

  createSquareImage(file) {
    return new Promise((resolve, reject) => {
      // Validate file type
      if (!file.type.match('image.*')) {
        reject(new Error('File bukan gambar'));
        return;
      }

      // Validate file size
      if (file.size > 5 * 1024 * 1024) { // 5MB max
        reject(new Error('Ukuran gambar terlalu besar (maks 5MB)'));
        return;
      }

      const reader = new FileReader();
      
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Determine the size of the square (use the smaller dimension)
            const size = Math.min(img.width, img.height);
            canvas.width = size;
            canvas.height = size;
            
            // Draw the image centered and cropped to square
            const offsetX = (img.width - size) / 2;
            const offsetY = (img.height - size) / 2;
            ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, size, size);
            
            // Convert to base64 with quality 85%
            const base64 = canvas.toDataURL('image/jpeg', 0.85);
            resolve(base64);
          } catch (error) {
            reject(new Error('Gagal memproses gambar'));
          }
        };
        
        img.onerror = () => {
          reject(new Error('Gagal memuat gambar'));
        };
      };
      
      reader.onerror = () => {
        reject(new Error('Gagal membaca file'));
      };
      
      reader.onabort = () => {
        reject(new Error('Pembacaan file dibatalkan'));
      };
      
      reader.readAsDataURL(file);
    });
  }

  async loadBarang() {
    try {
      // Show skeleton loading
      this.katalog.innerHTML = Array.from({ length: 6 }, () => \`
        <div class="bg-white p-3 rounded shadow skeleton-item">
          <div class="skeleton-image"></div>
          <div class="skeleton-text medium"></div>
          <div class="skeleton-text short"></div>
        </div>
      \`).join('');

      // Fetch with cache busting
      const response = await fetch('/api/list?t=' + Date.now(), {
        cache: 'no-cache'
      });
      
      if (!response.ok) throw new Error('Gagal memuat data');
      
      const items = await response.json();
      
      if (items.length === 0) {
        this.katalog.innerHTML = '<div class="text-center py-4"><p class="text-gray-500">Belum ada barang.</p></div>';
        return;
      }

      this.katalog.innerHTML = '';
      this.loadingQueue = items;
      this.currentLoadingIndex = 0;
      this.processLoadingQueue();
    } catch (error) {
      console.error('Error:', error);
      
      // Show error message in the catalog
      this.katalog.innerHTML = \`
        <div class="col-span-2 text-center py-4">
          <p class="text-red-500">Gagal memuat data: \${this.escapeHtml(error.message)}</p>
          <button onclick="app.loadBarang()" class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition">
            Coba Lagi
          </button>
        </div>
      \`;
    }
  }

  processLoadingQueue() {
    // Use requestIdleCallback if available for better performance
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback((deadline) => {
        while (this.currentLoadingIndex < this.loadingQueue.length && deadline.timeRemaining() > 0) {
          const endIndex = Math.min(
            this.currentLoadingIndex + this.loadingBatchSize,
            this.loadingQueue.length
          );
          
          for (let i = this.currentLoadingIndex; i < endIndex; i++) {
            this.addItemToDOM(this.loadingQueue[i], i);
          }
          
          this.currentLoadingIndex = endIndex;
        }
        
        if (this.currentLoadingIndex < this.loadingQueue.length) {
          requestIdleCallback(() => this.processLoadingQueue());
        }
      });
    } else {
      // Fallback for browsers without requestIdleCallback
      const endIndex = Math.min(
        this.currentLoadingIndex + this.loadingBatchSize,
        this.loadingQueue.length
      );
      
      for (let i = this.currentLoadingIndex; i < endIndex; i++) {
        this.addItemToDOM(this.loadingQueue[i], i);
      }
      
      this.currentLoadingIndex = endIndex;
      
      if (this.currentLoadingIndex < this.loadingQueue.length) {
        setTimeout(() => this.processLoadingQueue(), 100);
      }
    }
  }

  addItemToDOM(item, index) {
    const escapedId = this.escapeHtml(item.id);
    const escapedNama = this.escapeHtml(item.nama);
    const escapedSatuan = this.escapeHtml(item.satuan);
    const hargaFormatted = Number(item.harga).toLocaleString('id-ID');
    
    const itemElement = document.createElement('div');
    itemElement.className = 'bg-white p-3 rounded shadow item-animate';
    itemElement.style.animationDelay = \`\${index * 0.05}s\`;
    itemElement.setAttribute('data-id', escapedId);
    
    // Fallback image in case of error
    const fallbackImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjY2IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTAiPkdhbWJhciB0aWRhayBkYXBhdCBkaXRlbXBha2FuPC90ZXh0Pjwvc3ZnPg==';
    
    itemElement.innerHTML = \`
      <div class="image-container">
        <img 
          src="/api/image/\${escapedId}?t=\${item.timestamp || Date.now()}" 
          alt="\${escapedNama}" 
          class="loading" 
          loading="lazy"
          onload="this.classList.remove('loading'); this.classList.add('loaded')"
          onerror="this.onerror=null;this.src='\${fallbackImage}';this.classList.remove('loading');this.classList.add('loaded')"
        >
      </div>
      <h2 class="text-lg font-semibold mt-2">\${escapedNama}</h2>
      <p class="text-sm text-gray-600">Rp \${hargaFormatted} / \${escapedSatuan}</p>
      \${this.isAdmin ? 
        \`<button onclick="app.hapusBarang('\${escapedId}')" class="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition">Hapus</button>\` 
        : ''}
    \`;
    
    this.katalog.appendChild(itemElement);
  }

  async hapusBarang(id) {
    try {
      const konfirmasi = confirm('Yakin ingin menghapus barang ini?');
      if (!konfirmasi) return;

      const response = await fetch('/api/hapus?id=' + encodeURIComponent(id), { 
        method: 'POST' 
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || 'Gagal menghapus barang');
      }
      
      // Show success message
      const successMsg = document.createElement('div');
      successMsg.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg';
      successMsg.textContent = 'Barang berhasil dihapus!';
      document.body.appendChild(successMsg);
      
      // Remove after 3 seconds
      setTimeout(() => {
        successMsg.classList.add('opacity-0', 'transition-opacity', 'duration-300');
        setTimeout(() => successMsg.remove(), 300);
      }, 3000);

      await this.loadBarang();
    } catch (error) {
      console.error('Error:', error);
      
      // Show error message
      const errorMsg = document.createElement('div');
      errorMsg.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg';
      errorMsg.textContent = 'Error: ' + error.message;
      document.body.appendChild(errorMsg);
      
      // Remove after 5 seconds
      setTimeout(() => {
        errorMsg.classList.add('opacity-0', 'transition-opacity', 'duration-300');
        setTimeout(() => errorMsg.remove(), 300);
      }, 5000);
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

// Initialize the app
const app = new BarangApp();
window.app = app;

// Add to global scope for button onclick handlers
window.hapusBarang = (id) => app.hapusBarang(id);
`;
