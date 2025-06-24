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

    // Serve Cropper CSS
    if (path === "/cropper.css") {
      return new Response(CROPPER_CSS, {
        headers: { "Content-Type": "text/css" },
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

    // GET list barang
    if (path === "/api/list") {
      const data = await env.KATALOG.get("items");
      return new Response(data || "[]", {
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

const CROPPER_CSS = `/* Cropper.js CSS will be loaded from CDN */`;

const INDEX_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Katalog Barang</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css">
  <style>
    /* Cropper Custom Styles */
    .cropper-container {
      background-color: white !important;
    }
    .cropper-modal {
      background-color: white !important;
    }
    .cropper-view-box {
      outline: 2px solid #39f;
      box-shadow: none;
    }
    .cropper-dashed {
      border: 0 dashed #eee;
    }
    .cropper-point {
      background-color: #39f;
      width: 24px;
      height: 24px;
      opacity: 1;
      border-radius: 50%;
    }
    .cropper-line {
      background-color: rgba(57, 153, 255, 0.6);
    }
    
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
    
    /* Enhanced Crop Modal Styles */
    #cropModal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.9);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      padding: 0;
      box-sizing: border-box;
      touch-action: none;
    }

    #cropModalContent {
      background: white;
      padding: 15px;
      border-radius: 8px;
      width: 95%;
      max-width: 95%;
      height: 90vh;
      max-height: 90vh;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    #cropImage {
      max-width: 100%;
      max-height: calc(90vh - 150px);
      display: block;
      background-color: white;
      touch-action: none;
    }

    .crop-actions {
      position: absolute;
      bottom: 15px;
      left: 0;
      right: 0;
      display: flex;
      justify-content: center;
      gap: 10px;
      padding: 0 15px;
    }

    .crop-actions button {
      flex: 1;
      padding: 12px;
      font-size: 16px;
    }

    /* Zoom Controls */
    .zoom-controls {
      position: absolute;
      top: 15px;
      right: 15px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 1;
    }

    .zoom-controls button {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border: none;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Mobile-specific styles */
    @media (max-width: 480px) {
      #cropModalContent {
        width: 100%;
        height: 100%;
        max-height: 100%;
        border-radius: 0;
        padding: 10px;
      }

      #cropImage {
        max-height: calc(100vh - 140px);
      }

      .cropper-point {
        width: 28px;
        height: 28px;
      }

      .crop-actions {
        bottom: 10px;
      }

      .crop-actions button {
        padding: 10px;
        font-size: 14px;
      }
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

    <!-- Crop Modal -->
    <div id="cropModal">
      <div id="cropModalContent">
        <h3 class="text-lg font-bold mb-3">Crop Gambar</h3>
        <div class="zoom-controls">
          <button id="zoomInBtn">+</button>
          <button id="zoomOutBtn">-</button>
          <button id="resetZoomBtn">↻</button>
        </div>
        <img id="cropImage">
        <div class="crop-actions">
          <button id="cancelCrop" class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition">
            Batal
          </button>
          <button id="saveCrop" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
            Simpan
          </button>
        </div>
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
         placeholder="">
        </div>
        <div>
          <label class="block mb-1 font-medium">Harga (Rp)</label>
          <input id="harga" name="harga" type="number" required class="w-full border p-2 rounded">
        </div>
        <div>
  <label class="block mb-1 font-medium">Satuan</label>
  <input id="satuan" name="satuan" type="text" required 
         class="w-full border p-2 rounded capitalize-input"
         placeholder="">
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

  <script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js"></script>
  <script src="script.js"></script>
</body>
</html>`;

const SCRIPT_JS = `"use strict";
class BarangApp {
  constructor() {
    this.isAdmin = false;
    this.cropper = null;
    this.croppedImageBlob = null;
    this.loadingQueue = [];
    this.currentLoadingIndex = 0;
    this.loadingBatchSize = 4;
    
    this.initElements();
    this.initEventListeners();
    this.checkAdminStatus();
    this.loadBarang();
    this.namaInput = document.getElementById('nama');
    this.satuanInput = document.getElementById('satuan');
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
    this.cropModal = document.getElementById('cropModal');
    this.cropImage = document.getElementById('cropImage');
    this.saveCropBtn = document.getElementById('saveCrop');
    this.cancelCropBtn = document.getElementById('cancelCrop');
    this.zoomInBtn = document.getElementById('zoomInBtn');
    this.zoomOutBtn = document.getElementById('zoomOutBtn');
    this.resetZoomBtn = document.getElementById('resetZoomBtn');
  }

  initEventListeners() {
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    this.logoutBtn.addEventListener('click', () => this.handleLogout());
    this.showLoginBtn.addEventListener('click', () => this.showLoginModal());
    this.cancelLoginBtn.addEventListener('click', () => this.cancelLogin());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.saveCropBtn.addEventListener('click', () => this.saveCrop());
    this.cancelCropBtn.addEventListener('click', () => this.cancelCrop());
    this.zoomInBtn.addEventListener('click', () => this.zoomIn());
    this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
    this.resetZoomBtn.addEventListener('click', () => this.resetZoom());
    this.namaInput.addEventListener('input', (e) => this.autoCapitalize(e));
    this.satuanInput.addEventListener('input', (e) => this.autoCapitalize(e));
    this.namaInput.addEventListener('blur', (e) => this.autoCapitalize(e, true));
    this.satuanInput.addEventListener('blur', (e) => this.autoCapitalize(e, true));
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
  
  autoCapitalize(event, force = false) {
  const input = event.target;
  const originalValue = input.value;
  
  if (originalValue.length === 0) return;
  
  const startPos = input.selectionStart;
  const endPos = input.selectionEnd;
  
  let newValue = originalValue.replace(/\b\w/g, char => char.toUpperCase());
  
  if (force && newValue !== originalValue) {
    newValue = newValue.replace(/\s+/g, ' ').trim();
  }
  
  if (newValue !== originalValue) {
    input.value = newValue;
    const lengthDiff = newValue.length - originalValue.length;
    input.setSelectionRange(startPos + lengthDiff, endPos + lengthDiff);
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

  zoomIn() {
    if (this.cropper) {
      this.cropper.zoom(0.1);
    }
  }

  zoomOut() {
    if (this.cropper) {
      this.cropper.zoom(-0.1);
    }
  }

  resetZoom() {
    if (this.cropper) {
      this.cropper.reset();
      this.cropper.zoomTo(1.0);
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
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        this.cropImage.src = img.src;
        this.cropModal.style.display = 'flex';
        
        if (this.cropper) {
          this.cropper.destroy();
        }
        
        this.cropper = new Cropper(this.cropImage, {
          aspectRatio: 1,
          viewMode: 1,
          autoCropArea: 0.8,
          responsive: true,
          restore: false,
          checkCrossOrigin: false,
          checkOrientation: false,
          modal: true,
          guides: false,
          center: false,
          highlight: false,
          background: false,
          movable: true,
          rotatable: false,
          scalable: false,
          zoomable: true,
          zoomOnTouch: true,
          zoomOnWheel: true,
          wheelZoomRatio: 0.1,
          cropBoxMovable: true,
          cropBoxResizable: true,
          toggleDragModeOnDblclick: false,
          minCanvasWidth: 200,
          minCanvasHeight: 200,
          minContainerWidth: 200,
          minContainerHeight: 200,
          minCropBoxWidth: 100,
          minCropBoxHeight: 100,
          ready: () => {
            this.cropper.zoomTo(1.0);
            
            const containerData = this.cropper.getContainerData();
            const cropBoxWidth = Math.min(containerData.width, containerData.height) * 0.8;
            
            this.cropper.setCropBoxData({
              width: cropBoxWidth,
              height: cropBoxWidth,
              left: (containerData.width - cropBoxWidth) / 2,
              top: (containerData.height - cropBoxWidth) / 2
            });
          }
        });
      };
      
      img.onerror = () => {
        alert('Gagal memuat gambar. Coba gambar lain.');
        this.fileInput.value = '';
      };
    };
    
    reader.onerror = () => {
      alert('Gagal membaca file. Coba lagi.');
      this.fileInput.value = '';
    };
    
    reader.readAsDataURL(file);
  }

  saveCrop() {
    if (!this.cropper) {
      alert('Cropper belum siap');
      return;
    }

    const canvas = this.cropper.getCroppedCanvas({
      width: 800,
      height: 800,
      minWidth: 400,
      minHeight: 400,
      maxWidth: 1200,
      maxHeight: 1200,
      fillColor: '#fff',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });

    canvas.toBlob((blob) => {
      if (!blob) {
        alert('Gagal melakukan crop gambar');
        return;
      }

      this.croppedImageBlob = blob;
      
      const previewUrl = URL.createObjectURL(blob);
      this.imagePreview.src = previewUrl;
      this.imagePreviewContainer.classList.remove('hidden');
      
      this.cropModal.style.display = 'none';
      this.cropper.destroy();
      this.cropper = null;
      
      const fileName = this.fileInput.files[0].name;
      const fileExt = fileName.split('.').pop().toLowerCase();
      const newFileName = 'cropped.' + fileExt;
      
      const file = new File([blob], newFileName, { type: blob.type });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      this.fileInput.files = dataTransfer.files;
    }, 'image/jpeg', 0.95);
  }

  cancelCrop() {
    this.cropModal.style.display = 'none';
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
    this.fileInput.value = '';
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

      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64Data = reader.result.split(',')[1] || reader.result;
          resolve('data:image/jpeg;base64,' + base64Data);
        };
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
      this.imagePreviewContainer.classList.add('hidden');
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
      this.katalog.innerHTML = Array.from({ length: 6 }, () => \`
        <div class="bg-white p-3 rounded shadow skeleton-item">
          <div class="skeleton-image"></div>
          <div class="skeleton-text medium"></div>
          <div class="skeleton-text short"></div>
        </div>
      \`).join('');

      const response = await fetch('/api/list?t=' + Date.now());
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
      this.katalog.innerHTML = \`<div class="text-center py-4 text-red-500"><p>Gagal memuat data: \${this.escapeHtml(error.message)}</p></div>\`;
    }
  }

  processLoadingQueue() {
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

const app = new BarangApp();
window.app = app;
`;
