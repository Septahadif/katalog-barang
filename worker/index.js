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
  <style>
    .cropper-container { width: 100%; height: 300px; position: relative; overflow: hidden; }
    .cropper-preview { width: 100%; height: 100%; object-fit: cover; position: absolute; }
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
    .cropper-grid-cell { border: 1px dashed rgba(255,255,255,0.5); }
    .cropper-controls { position: absolute; bottom: 10px; width: 100%; text-align: center; }
    .aspect-square { aspect-ratio: 1/1; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen flex flex-col items-center p-4">
  <div class="w-full max-w-xl">
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-2xl font-bold">📦 Katalog Barang</h1>
      <button id="showLoginBtn" class="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition">
        Login Admin
      </button>
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
          <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded w-full">Login</button>
        </form>
      </div>
    </div>

    <!-- Admin Controls -->
    <div id="adminControls" class="hidden mb-6">
      <button id="logoutBtn" class="bg-red-600 text-white px-4 py-2 rounded mb-4">Logout</button>
      
      <!-- Form Tambah Barang -->
      <form id="formBarang" class="bg-white p-4 rounded shadow space-y-3 mb-6">
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
          <input id="satuan" name="satuan" type="text" required class="w-full border p-2 rounded">
        </div>
        <div>
          <label class="block mb-1 font-medium">Gambar</label>
          <input id="gambar" name="gambar" type="file" accept="image/*" required class="w-full border p-2 rounded">
          
          <!-- Image Cropper -->
          <div id="cropperContainer" class="cropper-container mt-2 hidden">
            <img id="cropperPreview" class="cropper-preview">
            <div class="cropper-overlay">
              <div class="cropper-grid-cell"></div><div class="cropper-grid-cell"></div><div class="cropper-grid-cell"></div>
              <div class="cropper-grid-cell"></div><div class="cropper-grid-cell"></div><div class="cropper-grid-cell"></div>
              <div class="cropper-grid-cell"></div><div class="cropper-grid-cell"></div><div class="cropper-grid-cell"></div>
            </div>
            <div class="cropper-controls">
              <button type="button" id="cropCancel" class="bg-gray-500 text-white px-3 py-1 rounded mr-2">Batal</button>
              <button type="button" id="cropConfirm" class="bg-blue-600 text-white px-3 py-1 rounded">Simpan</button>
            </div>
          </div>
        </div>
        <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition w-full">Tambah Barang</button>
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
    this.cropper = {
      image: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
      isDragging: false
    };
    
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
    this.cropperContainer = document.getElementById('cropperContainer');
    this.cropperPreview = document.getElementById('cropperPreview');
    this.cropConfirm = document.getElementById('cropConfirm');
    this.cropCancel = document.getElementById('cropCancel');
    this.fileInput = document.getElementById('gambar');
  }

  initEventListeners() {
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    this.logoutBtn.addEventListener('click', () => this.handleLogout());
    this.showLoginBtn.addEventListener('click', () => this.showLoginModal());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.cropConfirm.addEventListener('click', () => this.applyCrop());
    this.cropCancel.addEventListener('click', () => this.cancelCrop());
    
    // Cropper drag events
    this.cropperPreview.addEventListener('mousedown', (e) => this.startDrag(e));
    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('mouseup', () => this.endDrag());
  }

  showLoginModal() {
    this.loginModal.classList.remove('hidden');
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

    const reader = new FileReader();
    reader.onload = (event) => {
      this.cropperPreview.src = event.target.result;
      this.cropperContainer.classList.remove('hidden');
      this.cropper.image = new Image();
      this.cropper.image.src = event.target.result;
      this.cropperPreview.style.left = '0px';
      this.cropperPreview.style.top = '0px';
    };
    reader.readAsDataURL(file);
  }

  startDrag(e) {
    this.cropper.isDragging = true;
    this.cropper.startX = e.clientX;
    this.cropper.startY = e.clientY;
    this.cropper.offsetX = parseInt(this.cropperPreview.style.left) || 0;
    this.cropper.offsetY = parseInt(this.cropperPreview.style.top) || 0;
  }

  drag(e) {
    if (!this.cropper.isDragging) return;
    
    const dx = e.clientX - this.cropper.startX;
    const dy = e.clientY - this.cropper.startY;
    
    this.cropperPreview.style.left = (this.cropper.offsetX + dx) + 'px';
    this.cropperPreview.style.top = (this.cropper.offsetY + dy) + 'px';
  }

  endDrag() {
    this.cropper.isDragging = false;
  }

  applyCrop() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const containerRect = this.cropperContainer.getBoundingClientRect();
    const imgRect = this.cropperPreview.getBoundingClientRect();
    
    // Set canvas to square size (1:1 ratio)
    const size = Math.min(containerRect.width, containerRect.height);
    canvas.width = size;
    canvas.height = size;
    
    // Calculate crop area
    const scaleX = this.cropper.image.naturalWidth / imgRect.width;
    const scaleY = this.cropper.image.naturalHeight / imgRect.height;
    
    const sx = (imgRect.left - containerRect.left) * -1 * scaleX;
    const sy = (imgRect.top - containerRect.top) * -1 * scaleY;
    const sWidth = containerRect.width * scaleX;
    const sHeight = containerRect.height * scaleY;
    
    // Draw cropped image (1:1 ratio)
    ctx.drawImage(
      this.cropper.image,
      sx, sy, sWidth, sHeight,
      0, 0, size, size
    );
    
    // Convert to blob and update file input
    canvas.toBlob((blob) => {
      const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      this.fileInput.files = dataTransfer.files;
      this.cancelCrop();
    }, 'image/jpeg', 0.9);
  }

  cancelCrop() {
    this.cropperContainer.classList.add('hidden');
    this.cropperPreview.style.left = '0';
    this.cropperPreview.style.top = '0';
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

      // Convert image to base64
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
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
      await this.loadBarang();
    } catch (error) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Tambah Barang';
    }
  }

  async loadBarang() {
    try {
      this.katalog.innerHTML = '<div class="text-center py-4"><p class="text-gray-500">Memuat data...</p></div>';
      
      const response = await fetch('/api/list');
      if (!response.ok) throw new Error('Gagal memuat data');
      
      const items = await response.json();
      
      if (items.length === 0) {
        this.katalog.innerHTML = '<div class="text-center py-4"><p class="text-gray-500">Belum ada barang.</p></div>';
        return;
      }

      this.katalog.innerHTML = items.map(item => {
        const escapedId = this.escapeHtml(item.id);
        const escapedBase64 = this.escapeHtml(item.base64);
        const escapedNama = this.escapeHtml(item.nama);
        const escapedSatuan = this.escapeHtml(item.satuan);
        const hargaFormatted = Number(item.harga).toLocaleString('id-ID');
        
        return '<div class="bg-white p-3 rounded shadow" data-id="' + escapedId + '">' +
          '<div class="aspect-square overflow-hidden">' +
            '<img src="' + escapedBase64 + '" alt="' + escapedNama + '" class="w-full h-full object-cover">' +
          '</div>' +
          '<h2 class="text-lg font-semibold mt-2">' + escapedNama + '</h2>' +
          '<p class="text-sm text-gray-600">Rp ' + hargaFormatted + ' / ' + escapedSatuan + '</p>' +
          (this.isAdmin ? 
            '<button onclick="app.hapusBarang(\\'' + escapedId + '\\')" class="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition">Hapus</button>' 
            : '') +
        '</div>';
      }).join('');
    } catch (error) {
      console.error('Error:', error);
      this.katalog.innerHTML = '<div class="text-center py-4 text-red-500"><p>Gagal memuat data: ' + this.escapeHtml(error.message) + '</p></div>';
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
