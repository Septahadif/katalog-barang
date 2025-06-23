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

    // GET list barang
    if (path === "/api/list") {
      const data = await env.KATALOG.get("items");
      return new Response(data || "[]", {
        headers: { "Content-Type": "application/json" },
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

      const item = { ...body, id: Date.now().toString() };
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Katalog Barang</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css">
  <style>
    .header-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    .title-center {
      text-align: center;
      flex-grow: 1;
    }
    .login-btn {
      background-color: #4b5563;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }
    
    /* Cropper Styles */
    .cropper-container { 
      width: 100%;
      height: 400px;
      position: relative;
      overflow: hidden;
      border: 2px dashed #ccc;
      background-color: #f5f5f5;
      margin-top: 1rem;
    }
    .cropper-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      grid-template-rows: 1fr 1fr 1fr;
      pointer-events: none;
    }
    .cropper-grid-cell { 
      border: 1px dashed rgba(0,0,0,0.2);
    }
    .cropper-controls {
      position: absolute;
      bottom: 15px;
      width: 100%;
      text-align: center;
      display: flex;
      justify-content: center;
      gap: 15px;
      z-index: 10;
    }
    .zoom-controls {
      position: absolute;
      top: 15px;
      right: 15px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 10;
    }
    .zoom-btn {
      width: 36px;
      height: 36px;
      background: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      cursor: pointer;
      border: none;
      font-weight: bold;
      font-size: 1.2rem;
    }
    
    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-content {
      background: white;
      border-radius: 0.5rem;
      width: 90%;
      max-width: 400px;
      padding: 1.5rem;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    /* Loading Indicator */
    .loading {
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255,255,255,0.9);
      padding: 1.5rem;
      border-radius: 0.5rem;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 1000;
      text-align: center;
    }
  </style>
</head>
<body class="bg-gray-100 min-h-screen p-4">
  <div class="max-w-4xl mx-auto">
    <div class="header-container">
      <h1 class="text-2xl font-bold title-center">📦 Katalog Barang</h1>
      <button id="showLoginBtn" class="login-btn hover:bg-gray-700 transition">
        Login Admin
      </button>
    </div>
    
    <!-- Admin Login Modal -->
    <div id="loginModal" class="modal-overlay">
      <div class="modal-content">
        <h2 class="text-xl font-bold mb-4">Login Admin</h2>
        <form id="loginForm" class="space-y-4">
          <div>
            <label class="block mb-1 text-sm font-medium">Username</label>
            <input type="text" id="loginUsername" class="w-full border p-2 rounded" required>
          </div>
          <div>
            <label class="block mb-1 text-sm font-medium">Password</label>
            <input type="password" id="loginPassword" class="w-full border p-2 rounded" required>
          </div>
          <div class="flex gap-3">
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
      <form id="formBarang" class="bg-white p-4 rounded-lg shadow space-y-4 mb-6">
        <div>
          <label class="block mb-1 font-medium">Nama Barang</label>
          <input id="nama" name="nama" type="text" required class="w-full border p-2 rounded">
        </div>
        <div>
          <label class="block mb-1 font-medium">Harga (Rp)</label>
          <input id="harga" name="harga" type="number" required class="w-full border p-2 rounded">
        </div>
        <div>
          <label class="block mb-1 font-medium">Satuan</label>
          <select id="satuan" class="w-full border p-2 rounded">
            <option value="pcs">pcs</option>
            <option value="lusin">lusin</option>
            <option value="pak">pak</option>
            <option value="rol">rol</option>
            <option value="bal">bal</option>
            <option value="karton">karton</option>
            <option value="gros">gros</option>
            <option value="toples">toples</option>
          </select>
        </div>
        <div>
          <label class="block mb-1 font-medium">Gambar</label>
          <input id="gambar" name="gambar" type="file" accept="image/*" required class="w-full border p-2 rounded">
          
          <!-- Image Cropper -->
          <div id="cropperContainer" class="cropper-container mt-2 hidden">
            <div class="zoom-controls">
              <button class="zoom-btn" id="zoomIn">+</button>
              <button class="zoom-btn" id="zoomOut">-</button>
            </div>
            <img id="cropperPreview">
            <div class="cropper-overlay">
              <div class="cropper-grid-cell"></div><div class="cropper-grid-cell"></div><div class="cropper-grid-cell"></div>
              <div class="cropper-grid-cell"></div><div class="cropper-grid-cell"></div><div class="cropper-grid-cell"></div>
              <div class="cropper-grid-cell"></div><div class="cropper-grid-cell"></div><div class="cropper-grid-cell"></div>
            </div>
            <div class="cropper-controls">
              <button type="button" id="cropCancel" class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition">
                Batal
              </button>
              <button type="button" id="cropConfirm" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
                Simpan
              </button>
            </div>
          </div>
        </div>
        <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition w-full">
          Tambah Barang
        </button>
      </form>
    </div>

    <!-- Katalog -->
    <div id="katalog" class="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"></div>
  </div>

  <!-- Loading Indicator -->
  <div id="loading" class="loading">
    <img src="https://i.gifer.com/ZZ5H.gif" alt="Loading" width="50">
    <p>Menyimpan barang...</p>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js"></script>
  <script src="script.js"></script>
</body>
</html>`;

const SCRIPT_JS = `"use strict";
class BarangApp {
  constructor() {
    this.isAdmin = false;
    this.cropper = null;
    this.cropImageBlob = null;
    
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
    this.cropperContainer = document.getElementById('cropperContainer');
    this.cropperPreview = document.getElementById('cropperPreview');
    this.cropConfirm = document.getElementById('cropConfirm');
    this.cropCancel = document.getElementById('cropCancel');
    this.fileInput = document.getElementById('gambar');
    this.zoomInBtn = document.getElementById('zoomIn');
    this.zoomOutBtn = document.getElementById('zoomOut');
    this.loadingIndicator = document.getElementById('loading');
  }

  initEventListeners() {
    // Login modal handlers
    this.showLoginBtn.addEventListener('click', () => {
      this.loginModal.style.display = 'flex';
    });
    
    this.cancelLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.loginModal.style.display = 'none';
    });
    
    this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    
    // Other form handlers
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.logoutBtn.addEventListener('click', () => this.handleLogout());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.cropConfirm.addEventListener('click', () => this.applyCrop());
    this.cropCancel.addEventListener('click', () => this.cancelCrop());
    this.zoomInBtn.addEventListener('click', () => this.zoom(1.2));
    this.zoomOutBtn.addEventListener('click', () => this.zoom(0.8));
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
      this.loginModal.style.display = 'none';
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
        this.loginModal.style.display = 'none';
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
      this.loadBarang();
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validasi tipe file
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (!validTypes.includes(file.type)) {
      alert('Format gambar tidak didukung. Gunakan JPG, PNG, GIF, WebP, atau AVIF.');
      this.fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      this.cropperPreview.src = event.target.result;
      this.cropperContainer.classList.remove('hidden');
      
      // Inisialisasi Cropper.js
      if (this.cropper) {
        this.cropper.destroy();
      }
      
      this.cropper = new Cropper(this.cropperPreview, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.8,
        responsive: true,
        zoomable: true,
        cropBoxMovable: true,
        cropBoxResizable: true,
        minContainerWidth: 300,
        minContainerHeight: 300
      });
    };
    reader.readAsDataURL(file);
  }

  zoom(factor) {
    if (!this.cropper) return;
    
    if (factor > 1) {
      this.cropper.zoom(factor - 1);
    } else {
      this.cropper.zoom(-(1 - factor));
    }
  }

  applyCrop() {
    if (!this.cropper) return;
    
    // Dapatkan canvas yang sudah di-crop dengan kualitas HD
    const canvas = this.cropper.getCroppedCanvas({
      width: 1200,
      height: 1200,
      minWidth: 800,
      minHeight: 800,
      maxWidth: 2000,
      maxHeight: 2000,
      fillColor: '#fff',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    });
    
    // Konversi ke blob dengan kualitas tinggi
    canvas.toBlob((blob) => {
      this.cropImageBlob = blob;
      
      // Preview hasil crop
      const previewUrl = URL.createObjectURL(blob);
      const preview = document.createElement('img');
      preview.src = previewUrl;
      preview.className = 'w-full mt-4 rounded border image-preview';
      this.form.querySelector('.image-preview')?.remove();
      this.form.querySelector('#gambar').after(preview);
      
      this.cancelCrop();
    }, 'image/jpeg', 0.95); // Kualitas 95% untuk hasil terbaik
  }

  cancelCrop() {
    this.cropperContainer.classList.add('hidden');
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
  }

  async handleSubmit(e) {
    e.preventDefault();
    const submitBtn = this.form.querySelector('button[type="submit"]');

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Memproses...';
      this.loadingIndicator.style.display = 'block';

      const formData = {
        nama: this.form.nama.value.trim(),
        harga: this.form.harga.value.trim(),
        satuan: this.form.satuan.value.trim(),
        gambar: this.cropImageBlob
      };

      if (!formData.nama || !formData.harga || !formData.satuan || !formData.gambar) {
        throw new Error('Semua field harus diisi');
      }

      // Convert image to base64 dengan kualitas tinggi
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(formData.gambar);
      });

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
      document.querySelector('.image-preview')?.remove();
      await this.loadBarang();
    } catch (error) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Tambah Barang';
      this.loadingIndicator.style.display = 'none';
    }
  }

  async loadBarang() {
    try {
      this.katalog.innerHTML = '<div class="text-center py-8"><p class="text-gray-500">Memuat data katalog...</p></div>';
      
      const response = await fetch('/api/list');
      if (!response.ok) throw new Error('Gagal memuat data');
      
      const items = await response.json();
      
      if (items.length === 0) {
        this.katalog.innerHTML = '<div class="text-center py-8"><p class="text-gray-500">Belum ada barang.</p></div>';
        return;
      }

      this.katalog.innerHTML = items.map(item => {
        const escapedId = this.escapeHtml(item.id);
        const escapedBase64 = this.escapeHtml(item.base64);
        const escapedNama = this.escapeHtml(item.nama);
        const escapedSatuan = this.escapeHtml(item.satuan);
        const hargaFormatted = Number(item.harga).toLocaleString('id-ID');
        
        return \`
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <img src="\${escapedBase64}" alt="\${escapedNama}" class="w-full h-48 object-cover">
            <div class="p-4">
              <h3 class="font-bold text-lg">\${escapedNama}</h3>
              <p class="text-gray-600">Rp \${hargaFormatted} / \${escapedSatuan}</p>
              \${this.isAdmin ? 
                \`<button onclick="app.hapusBarang('\${escapedId}')" class="mt-3 bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700">
                  Hapus
                </button>\` : ''}
            </div>
          </div>
        \`;
      }).join('');
    } catch (error) {
      console.error('Error:', error);
      this.katalog.innerHTML = '<div class="text-center py-8 text-red-500"><p>Gagal memuat data: ' + this.escapeHtml(error.message) + '</p></div>';
    }
  }

  async hapusBarang(id) {
    try {
      const konfirmasi = confirm('Yakin ingin menghapus barang ini?');
      if (!konfirmasi) return;

      const response = await fetch('/api/hapus?id=' + id, { method: 'POST' });
      if (!response.ok) throw new Error('Gagal menghapus barang');
      
      alert('Barang berhasil dihapus');
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

// Initialize app
const app = new BarangApp();
window.app = app;
`;
