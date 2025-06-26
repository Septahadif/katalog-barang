export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Serve HTML
    if (path === "/" || path === "/index.html") {
      return new Response(INDEX_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Serve JS
    if (path === "/script.js") {
      return new Response(SCRIPT_JS, {
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
      });
    }

    // Serve Image
    if (path.startsWith("/api/image/")) {
      const id = path.split('/')[3];
      if (!id) return new Response("Missing ID", { status: 400 });

      const items = JSON.parse(await env.KATALOG.get("items") || "[]");
      const item = items.find(item => item.id === id);
      
      if (!item || !item.base64) {
        return new Response("Image not found", { status: 404 });
      }

      // Extract image data from base64
      const base64Data = item.base64.split(',')[1] || item.base64;
      const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      return new Response(imageBuffer, {
        headers: { 
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000" // Cache for 1 year
        }
      });
    }

    // Login Admin
    if (path === "/api/login" && req.method === "POST") {
      const { username, password } = await req.json();
      const isAdmin = username === "septa" && password === "septa2n2n";
      
      if (isAdmin) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { 
            "Content-Type": "application/json",
            "Set-Cookie": "admin=true; HttpOnly; Secure; SameSite=Strict"
          }
        });
      }
      return new Response(JSON.stringify({ success: false }), { status: 401 });
    }

    // Check Admin Status
    if (path === "/api/check-admin") {
      const cookie = req.headers.get("Cookie") || "";
      return new Response(JSON.stringify({ isAdmin: cookie.includes("admin=true") }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Logout
    if (path === "/api/logout") {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 
          "Content-Type": "application/json",
          "Set-Cookie": "admin=; expires=Thu, 01 Jan 1970 00:00:00 GMT"
        }
      });
    }

    // GET list barang with pagination
    if (path === "/api/list") {
      const page = parseInt(url.searchParams.get("page")) || 1;
      const perPage = 10;
      
      const data = await env.KATALOG.get("items");
      const items = JSON.parse(data || "[]");
      
      // Sort by timestamp descending (newest first)
      items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      const totalItems = items.length;
      const totalPages = Math.ceil(totalItems / perPage);
      const startIndex = (page - 1) * perPage;
      const endIndex = Math.min(startIndex + perPage, totalItems);
      
      const paginatedItems = items.slice(startIndex, endIndex);
      
      return new Response(JSON.stringify({
        items: paginatedItems,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          perPage
        }
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache"
        },
      });
    }

    // POST tambah barang (hanya admin)
    if (path === "/api/tambah" && req.method === "POST") {
      const cookie = req.headers.get("Cookie") || "";
      if (!cookie.includes("admin=true")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }

      const body = await req.json();
      const items = JSON.parse(await env.KATALOG.get("items") || "[]");

      const item = { 
        ...body, 
        id: Date.now().toString(),
        timestamp: Date.now()
      };
      items.push(item);

      await env.KATALOG.put("items", JSON.stringify(items));
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // POST hapus barang (hanya admin)
    if (path === "/api/hapus" && req.method === "POST") {
      const cookie = req.headers.get("Cookie") || "";
      if (!cookie.includes("admin=true")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }

      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing ID", { status: 400 });

      const items = JSON.parse(await env.KATALOG.get("items") || "[]");
      const updated = items.filter(item => item.id !== id);
      await env.KATALOG.put("items", JSON.stringify(updated));

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
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

    /* Loading spinner */
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
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
    <div id="loadingIndicator" class="hidden">
      <div class="loading-spinner"></div>
    </div>
  </div>

  <script src="script.js"></script>
</body>
</html>`;

const SCRIPT_JS = `"use strict";
class BarangApp {
  constructor() {
    this.isAdmin = false;
    this.currentPage = 1;
    this.totalPages = 1;
    this.isLoading = false;
    this.hasMoreItems = true;
    
    this.initElements();
    this.initEventListeners();
    this.checkAdminStatus();
    this.loadBarang();
    
    // Setup scroll listener for infinite loading
    window.addEventListener('scroll', () => this.handleScroll());
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
      const response = await fetch('/api/check-admin');
      const { isAdmin } = await response.json();
      this.isAdmin = isAdmin;
      this.toggleAdminUI();
    } catch (error) {
      console.error('Error checking admin status:', error);
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
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (response.ok) {
        this.isAdmin = true;
        this.toggleAdminUI();
        this.loginModal.classList.add('hidden');
        // Reset pagination when logging in
        this.currentPage = 1;
        this.katalog.innerHTML = '';
        this.loadBarang();
      } else {
        alert('Login gagal! Periksa username dan password');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Terjadi kesalahan saat login');
    }
  }

  async handleLogout() {
    try {
      await fetch('/api/logout');
      this.isAdmin = false;
      this.toggleAdminUI();
      // Reset pagination when logging out
      this.currentPage = 1;
      this.katalog.innerHTML = '';
      this.loadBarang();
    } catch (error) {
      console.error('Logout error:', error);
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

    const reader = new FileReader();
    reader.onload = (event) => {
      this.imagePreview.src = event.target.result;
      this.imagePreviewContainer.classList.remove('hidden');
    };
    
    reader.onerror = () => {
      alert('Gagal membaca file. Coba lagi.');
      this.fileInput.value = '';
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

      if (!formData.nama || !formData.harga || !formData.satuan || !formData.gambar) {
        throw new Error('Semua field harus diisi');
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

      if (!response.ok) {
        throw new Error('Gagal menambahkan barang');
      }

      alert('Barang berhasil ditambahkan!');
      this.form.reset();
      this.imagePreviewContainer.classList.add('hidden');
      // Reset pagination when adding new item
      this.currentPage = 1;
      this.katalog.innerHTML = '';
      await this.loadBarang();
    } catch (error) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Tambah Barang';
    }
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
    
    try {
      // Show skeleton loading for first page
      if (this.currentPage === 1) {
        this.katalog.innerHTML = Array.from({ length: 10 }, () => \`
          <div class="bg-white p-3 rounded shadow skeleton-item">
            <div class="skeleton-image"></div>
            <div class="skeleton-text medium"></div>
            <div class="skeleton-text short"></div>
          </div>
        \`).join('');
      }

      const response = await fetch(\`/api/list?page=\${this.currentPage}&t=\${Date.now()}\`);
      if (!response.ok) throw new Error('Gagal memuat data');
      
      const { items, pagination } = await response.json();
      
      this.totalPages = pagination.totalPages;
      this.hasMoreItems = this.currentPage < this.totalPages;
      
      if (items.length === 0 && this.currentPage === 1) {
        this.katalog.innerHTML = '<div class="text-center py-4"><p class="text-gray-500">Belum ada barang.</p></div>';
        return;
      }

      // If it's the first page, clear the container
      if (this.currentPage === 1) {
        this.katalog.innerHTML = '';
      }

      // Add items to DOM with animation
      items.forEach((item, index) => {
        this.addItemToDOM(item, index);
      });
      
      // Increment page for next load
      if (items.length > 0) {
        this.currentPage++;
      }
    } catch (error) {
      console.error('Error:', error);
      if (this.currentPage === 1) {
        this.katalog.innerHTML = \`<div class="text-center py-4 text-red-500"><p>Gagal memuat data: \${this.escapeHtml(error.message)}</p></div>\`;
      }
    } finally {
      this.isLoading = false;
      this.loadingIndicator.classList.add('hidden');
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
    
    itemElement.innerHTML = \`
      <div class="image-container">
        <img 
          src="/api/image/\${escapedId}?t=\${item.timestamp || Date.now()}" 
          alt="\${escapedNama}" 
          class="loading" 
          loading="lazy"
          onload="this.classList.remove('loading'); this.classList.add('loaded')"
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

  handleScroll() {
    // Check if we've scrolled 75% down the page and there are more items to load
    const scrollPosition = window.innerHeight + window.scrollY;
    const pageHeight = document.body.offsetHeight;
    const threshold = pageHeight * 0.75;
    
    if (scrollPosition >= threshold && this.hasMoreItems && !this.isLoading) {
      this.loadBarang();
    }
  }

  async hapusBarang(id) {
    try {
      const konfirmasi = confirm('Yakin ingin menghapus barang ini?');
      if (!konfirmasi) return;

      const response = await fetch('/api/hapus?id=' + id, { method: 'POST' });
      if (!response.ok) throw new Error('Gagal menghapus barang');
      
      alert('Barang berhasil dihapus');
      // Reset pagination when deleting item
      this.currentPage = 1;
      this.katalog.innerHTML = '';
      await this.loadBarang();
    } catch (error) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
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
`;
