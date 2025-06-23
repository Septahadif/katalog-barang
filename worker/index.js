export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Set CORS headers for all responses
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cookie",
      };

      // Handle OPTIONS preflight request
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: corsHeaders,
        });
      }

      // Serve static assets
      if (path === "/" || path === "/index.html") {
        return new Response(INDEX_HTML, {
          headers: { 
            "Content-Type": "text/html; charset=utf-8",
            ...corsHeaders
          },
        });
      }

      if (path === "/script.js") {
        return new Response(SCRIPT_JS, {
          headers: { 
            "Content-Type": "application/javascript; charset=utf-8",
            ...corsHeaders
          },
        });
      }

      if (path === "/cropper.css") {
        return new Response(CROPPER_CSS, {
          headers: { 
            "Content-Type": "text/css",
            ...corsHeaders
          },
        });
      }

      // API endpoints
      if (path === "/api/login" && request.method === "POST") {
        const { username, password } = await request.json();
        const isAdmin = username === "septa" && password === "septa2n2n";
        
        if (isAdmin) {
          return new Response(JSON.stringify({ success: true }), {
            headers: { 
              "Content-Type": "application/json",
              "Set-Cookie": "admin=true; HttpOnly; Secure; SameSite=Strict",
              ...corsHeaders
            }
          });
        }
        return new Response(JSON.stringify({ success: false }), { 
          status: 401,
          headers: corsHeaders
        });
      }

      if (path === "/api/check-admin") {
        const cookie = request.headers.get("Cookie") || "";
        return new Response(JSON.stringify({ isAdmin: cookie.includes("admin=true") }), {
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }

      if (path === "/api/logout") {
        return new Response(JSON.stringify({ success: true }), {
          headers: { 
            "Content-Type": "application/json",
            "Set-Cookie": "admin=; expires=Thu, 01 Jan 1970 00:00:00 GMT",
            ...corsHeaders
          }
        });
      }

      // GET list barang
      if (path === "/api/list") {
        try {
          const data = await env.KATALOG.get("items", "json") || [];
          return new Response(JSON.stringify(data), {
            headers: { 
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=60",
              ...corsHeaders
            },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: "Failed to load items" }), {
            status: 500,
            headers: corsHeaders
          });
        }
      }

      // POST tambah barang (hanya admin)
      if (path === "/api/tambah" && request.method === "POST") {
        const cookie = request.headers.get("Cookie") || "";
        if (!cookie.includes("admin=true")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { 
            status: 401,
            headers: corsHeaders
          });
        }

        try {
          const body = await request.json();
          if (!body.nama || !body.harga || !body.satuan || !body.base64) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), {
              status: 400,
              headers: corsHeaders
            });
          }

          // Validasi input
          const nama = String(body.nama).substring(0, 100);
          const harga = Math.min(Math.max(Number(body.harga) || 0, 0), 999999999);
          const satuan = String(body.satuan).substring(0, 20);
          const base64 = String(body.base64);

          if (!base64.startsWith("data:image/")) {
            return new Response(JSON.stringify({ error: "Invalid image format" }), {
              status: 400,
              headers: corsHeaders
            });
          }

          const items = await env.KATALOG.get("items", "json") || [];

          const item = { 
            id: Date.now().toString(),
            nama,
            harga,
            satuan,
            base64,
            createdAt: new Date().toISOString()
          };
          
          items.push(item);
          await env.KATALOG.put("items", JSON.stringify(items));
          
          return new Response(JSON.stringify({ success: true, id: item.id }), {
            headers: { 
              "Content-Type": "application/json",
              ...corsHeaders
            },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: corsHeaders
          });
        }
      }

      // POST hapus barang (hanya admin)
      if (path === "/api/hapus" && request.method === "POST") {
        const cookie = request.headers.get("Cookie") || "";
        if (!cookie.includes("admin=true")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { 
            status: 401,
            headers: corsHeaders
          });
        }

        try {
          const { id } = await request.json();
          if (!id) {
            return new Response(JSON.stringify({ error: "Missing ID" }), {
              status: 400,
              headers: corsHeaders
            });
          }

          const items = await env.KATALOG.get("items", "json") || [];
          const updated = items.filter(item => item.id !== id);
          
          await env.KATALOG.put("items", JSON.stringify(updated));

          return new Response(JSON.stringify({ success: true }), {
            headers: { 
              "Content-Type": "application/json",
              ...corsHeaders
            },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: corsHeaders
          });
        }
      }

      // Not found handler
      return new Response("404 Not Found", { 
        status: 404,
        headers: corsHeaders
      });
    } catch (error) {
      return new Response("Internal Server Error", {
        status: 500,
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
        }
      });
    }
  }
};

const CROPPER_CSS = `/* Cropper.js CSS will be loaded from CDN */`;

const INDEX_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
      outline: 1px solid #39f;
      box-shadow: none;
    }
    .cropper-dashed {
      border: 0 dashed #eee;
    }
    .cropper-point {
      background-color: #39f;
      width: 10px;
      height: 10px;
      opacity: 1;
    }
    .cropper-line {
      background-color: #39f;
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
      justify-content: center;
      align-items: center;
      margin-bottom: 1rem;
      flex-direction: column;
    }
    .title-center {
      text-align: center;
      width: 100%;
      margin-bottom: 0.5rem;
    }
    .login-btn-container {
      margin-top: 10px;
    }
    .login-btn {
      background-color: #4b5563;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }
    
    /* Crop Modal Styles */
    #cropModal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.8);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }
    #cropModalContent {
      background: white;
      padding: 20px;
      padding-bottom: 80px;
      border-radius: 8px;
      max-width: 95%;
      max-height: 90vh;
      position: relative;
    }
    #cropImage {
      max-width: 100%;
      max-height: 70vh;
      display: block;
      background-color: white;
    }
    .crop-actions {
      position: absolute;
      bottom: 20px;
      left: 0;
      right: 0;
      display: flex;
      justify-content: center;
      gap: 10px;
    }
  </style>
</head>
<body class="bg-gray-100 min-h-screen flex flex-col items-center p-4">
  <div class="w-full max-w-xl">
    <div class="header-container">
      <h1 class="text-2xl font-bold title-center">📦 Katalog Barang</h1>
      <div class="login-btn-container">
        <button id="showLoginBtn" class="login-btn hover:bg-gray-700 transition">
          Login
        </button>
      </div>
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
    this.cropModal = document.getElementById('cropModal');
    this.cropImage = document.getElementById('cropImage');
    this.saveCropBtn = document.getElementById('saveCrop');
    this.cancelCropBtn = document.getElementById('cancelCrop');
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
        credentials: 'include',
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error('Network response was not ok');
      
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

  async handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include'
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
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
      });
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
        const maxModalWidth = window.innerWidth * 0.9;
        const maxModalHeight = window.innerHeight * 0.8;
        let displayWidth = img.width;
        let displayHeight = img.height;
        
        if (img.width > maxModalWidth || img.height > maxModalHeight) {
          const ratio = Math.min(
            maxModalWidth / img.width,
            maxModalHeight / img.height
          );
          displayWidth = img.width * ratio;
          displayHeight = img.height * ratio;
        }
        
        this.cropImage.style.width = displayWidth + 'px';
        this.cropImage.style.height = displayHeight + 'px';
        this.cropImage.src = img.src;
        this.cropModal.style.display = 'flex';
        
        if (this.cropper) {
          this.cropper.destroy();
        }
        
        this.cropper = new Cropper(this.cropImage, {
          aspectRatio: 1,
          viewMode: 3,
          autoCropArea: 0.8,
          responsive: false,
          restore: false,
          movable: false,
          zoomable: false,
          zoomOnTouch: false,
          zoomOnWheel: false,
          cropBoxMovable: false,
          cropBoxResizable: false,
          toggleDragModeOnDblclick: false,
          ready: () => {
            const containerData = this.cropper.getContainerData();
            const cropBoxSize = Math.min(containerData.width, containerData.height) * 0.8;
            
            this.cropper.setCropBoxData({
              width: cropBoxSize,
              height: cropBoxSize,
              left: (containerData.width - cropBoxSize) / 2,
              top: (containerData.height - cropBoxSize) / 2
            });
            
            const imageData = this.cropper.getImageData();
            const scale = Math.min(
              containerData.width / imageData.naturalWidth,
              containerData.height / imageData.naturalHeight
            );
            
            this.cropper.zoomTo(scale);
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
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Gagal menambahkan barang');
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
      this.katalog.innerHTML = '<div class="text-center py-4"><p class="text-gray-500">Memuat data...</p></div>';
      
      const response = await fetch('/api/list', {
        cache: 'no-store',
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Gagal memuat data');
      
      const items = await response.json();
      
      if (!Array.isArray(items)) {
        throw new Error('Data tidak valid');
      }

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
        
        return \`<div class="bg-white p-3 rounded shadow" data-id="\${escapedId}">
          <div class="aspect-square overflow-hidden">
            <img src="\${escapedBase64}" alt="\${escapedNama}" class="w-full h-full object-cover" loading="lazy">
          </div>
          <h2 class="text-lg font-semibold mt-2">\${escapedNama}</h2>
          <p class="text-sm text-gray-600">Rp \${hargaFormatted} / \${escapedSatuan}</p>
          \${this.isAdmin ? 
            '<button onclick="app.hapusBarang(\'' + escapedId + '\')" class="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition">Hapus</button>' 
            : ''}
        </div>\`;
      }).join('');
    } catch (error) {
      console.error('Error:', error);
      this.katalog.innerHTML = '<div class="text-center py-4 text-red-500"><p>Gagal memuat data: ' + this.escapeHtml(error.message) + '</p></div>';
    }
  }

  async hapusBarang(id) {
    try {
      if (!this.isAdmin) {
        alert('Anda tidak memiliki izin untuk menghapus barang');
        return;
      }

      const konfirmasi = confirm('Yakin ingin menghapus barang ini?');
      if (!konfirmasi) return;

      const response = await fetch('/api/hapus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Gagal menghapus barang');
      }
      
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
