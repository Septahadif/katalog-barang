export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/" || path === "/index.html") {
      return new Response(INDEX_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (path === "/script.js") {
      return new Response(SCRIPT_JS, {
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
      });
    }

    if (path === "/cropper.css") {
      return new Response(CROPPER_CSS, {
        headers: { "Content-Type": "text/css" },
      });
    }

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

    if (path === "/api/check-admin") {
      const cookie = req.headers.get("Cookie") || "";
      return new Response(JSON.stringify({ isAdmin: cookie.includes("admin=true") }), {
        headers: { "Content-Type": "application/json" }
      });
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
      const data = await env.KATALOG.get("items");
      return new Response(data || "[]", {
        headers: { "Content-Type": "application/json" },
      });
    }

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
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Katalog Barang</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css">
  <style>
    .cropper-view-box {
      outline: 1px solid #39f;
      border-radius: 0;
    }
    .cropper-modal {
      background: white;
    }
    #cropModal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }
    #cropContainer {
      background: white;
      padding: 20px;
      border-radius: 8px;
      max-width: 90%;
      max-height: 90%;
    }
    #imagePreview {
      max-width: 100%;
      max-height: 200px;
      margin-top: 10px;
    }
  </style>
</head>
<body class="bg-gray-100 min-h-screen p-4">
  <div class="max-w-3xl mx-auto">
    <!-- Header dengan tombol login di bawah judul -->
    <div class="text-center mb-6">
      <h1 class="text-3xl font-bold text-gray-800">📦 Katalog Barang</h1>
      <button id="showLoginBtn" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
        Login Admin
      </button>
    </div>

    <!-- Admin Login Modal -->
    <div id="loginModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white p-6 rounded-lg shadow-xl w-80">
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
          <div class="flex gap-2">
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
      <div id="cropContainer">
        <h3 class="text-lg font-bold mb-3">Atur Posisi Gambar</h3>
        <div class="cropper-container" style="height: 300px">
          <img id="cropImage">
        </div>
        <div class="flex justify-center gap-2 mt-4">
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
    <div id="adminControls" class="hidden mb-8 bg-white p-4 rounded-lg shadow">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">Admin Panel</h2>
        <button id="logoutBtn" class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition">
          Logout
        </button>
      </div>

      <!-- Form Tambah Barang -->
      <form id="formBarang" class="space-y-4">
        <div>
          <label class="block mb-1 font-medium">Nama Barang</label>
          <input id="nama" type="text" required class="w-full border p-2 rounded">
        </div>
        <div>
          <label class="block mb-1 font-medium">Harga (Rp)</label>
          <input id="harga" type="number" required class="w-full border p-2 rounded">
        </div>
        <div>
          <label class="block mb-1 font-medium">Satuan</label>
          <input id="satuan" type="text" required class="w-full border p-2 rounded">
        </div>
        <div>
          <label class="block mb-1 font-medium">Gambar</label>
          <input id="gambar" type="file" accept="image/*" required class="w-full border p-2 rounded">
          <img id="imagePreview" class="hidden mt-2 border rounded">
        </div>
        <button type="submit" class="w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition">
          Tambah Barang
        </button>
      </form>
    </div>

    <!-- Katalog -->
    <div id="katalog" class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"></div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js"></script>
  <script src="/script.js"></script>
</body>
</html>`;

const SCRIPT_JS = `class BarangApp {
  constructor() {
    this.isAdmin = false;
    this.cropper = null;
    this.croppedBlob = null;

    this.initElements();
    this.initEventListeners();
    this.checkAdminStatus();
    this.loadBarang();
  }

  initElements() {
    this.elements = {
      form: document.getElementById('formBarang'),
      katalog: document.getElementById('katalog'),
      adminControls: document.getElementById('adminControls'),
      loginModal: document.getElementById('loginModal'),
      loginForm: document.getElementById('loginForm'),
      logoutBtn: document.getElementById('logoutBtn'),
      showLoginBtn: document.getElementById('showLoginBtn'),
      cancelLoginBtn: document.getElementById('cancelLoginBtn'),
      fileInput: document.getElementById('gambar'),
      imagePreview: document.getElementById('imagePreview'),
      cropModal: document.getElementById('cropModal'),
      cropImage: document.getElementById('cropImage'),
      saveCropBtn: document.getElementById('saveCrop'),
      cancelCropBtn: document.getElementById('cancelCrop')
    };
  }

  initEventListeners() {
    this.elements.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.elements.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    this.elements.logoutBtn.addEventListener('click', () => this.handleLogout());
    this.elements.showLoginBtn.addEventListener('click', () => this.showLoginModal());
    this.elements.cancelLoginBtn.addEventListener('click', () => this.cancelLogin());
    this.elements.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.elements.saveCropBtn.addEventListener('click', () => this.saveCrop());
    this.elements.cancelCropBtn.addEventListener('click', () => this.cancelCrop());
  }

  showLoginModal() {
    this.elements.loginModal.classList.remove('hidden');
  }

  cancelLogin() {
    this.elements.loginModal.classList.add('hidden');
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
      this.elements.adminControls.classList.remove('hidden');
      this.elements.showLoginBtn.classList.add('hidden');
    } else {
      this.elements.adminControls.classList.add('hidden');
      this.elements.loginModal.classList.add('hidden');
      this.elements.showLoginBtn.classList.remove('hidden');
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

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Hanya format JPG, PNG, atau WebP yang didukung');
      this.elements.fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      this.elements.cropImage.src = event.target.result;
      this.elements.cropModal.style.display = 'flex';
      
      if (this.cropper) {
        this.cropper.destroy();
      }
      
      // Inisialisasi Cropper dengan pengaturan khusus
      this.cropper = new Cropper(this.elements.cropImage, {
        aspectRatio: 1,
        viewMode: 1,
        autoCropArea: 1,
        responsive: true,
        dragMode: 'move',       // Hanya bisa geser gambar
        cropBoxMovable: false,  // Kotak crop tidak bisa dipindah
        cropBoxResizable: false, // Kotak crop tidak bisa diubah ukuran
        toggleDragModeOnDblclick: false
      });
    };
    reader.readAsDataURL(file);
  }

  saveCrop() {
    const canvas = this.cropper.getCroppedCanvas({
      width: 500,
      height: 500,
      fillColor: '#fff',
      imageSmoothingQuality: 'high'
    });

    canvas.toBlob((blob) => {
      this.croppedBlob = blob;
      const previewUrl = URL.createObjectURL(blob);
      this.elements.imagePreview.src = previewUrl;
      this.elements.imagePreview.classList.remove('hidden');
      
      // Update file input dengan gambar yang sudah di-crop
      const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      this.elements.fileInput.files = dataTransfer.files;
      
      this.cancelCrop();
    }, 'image/jpeg', 0.9);
  }

  cancelCrop() {
    this.elements.cropModal.style.display = 'none';
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
  }

  async handleSubmit(e) {
    e.preventDefault();
    const submitBtn = this.elements.form.querySelector('button[type="submit"]');
    
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Memproses...';

      const formData = {
        nama: this.elements.form.nama.value.trim(),
        harga: this.elements.form.harga.value.trim(),
        satuan: this.elements.form.satuan.value.trim(),
        gambar: this.elements.fileInput.files[0]
      };

      if (!formData.nama || !formData.harga || !formData.satuan || !formData.gambar) {
        throw new Error('Harap isi semua field');
      }

      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
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

      if (!response.ok) throw new Error('Gagal menambahkan barang');

      alert('Barang berhasil ditambahkan!');
      this.elements.form.reset();
      this.elements.imagePreview.classList.add('hidden');
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
      this.elements.katalog.innerHTML = '<div class="col-span-full text-center py-8"><p class="text-gray-500">Memuat data...</p></div>';
      
      const response = await fetch('/api/list');
      if (!response.ok) throw new Error('Gagal memuat data');
      
      const items = await response.json();
      
      if (!items.length) {
        this.elements.katalog.innerHTML = '<div class="col-span-full text-center py-8"><p class="text-gray-500">Belum ada barang</p></div>';
        return;
      }

      this.elements.katalog.innerHTML = items.map(item => `
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="aspect-square bg-gray-100">
            <img src="${item.base64}" alt="${this.escapeHtml(item.nama)}" class="w-full h-full object-cover">
          </div>
          <div class="p-4">
            <h3 class="font-bold text-lg">${this.escapeHtml(item.nama)}</h3>
            <p class="text-gray-600">Rp ${Number(item.harga).toLocaleString('id-ID')} / ${this.escapeHtml(item.satuan)}</p>
            ${this.isAdmin ? `
              <button onclick="app.hapusBarang('${item.id}')" 
                class="mt-2 w-full bg-red-600 text-white py-1 rounded hover:bg-red-700 transition">
                Hapus
              </button>
            ` : ''}
          </div>
        </div>
      `).join('');
    } catch (error) {
      console.error('Error:', error);
      this.elements.katalog.innerHTML = `
        <div class="col-span-full text-center py-8 text-red-500">
          <p>Gagal memuat data: ${this.escapeHtml(error.message)}</p>
        </div>
      `;
    }
  }

  async hapusBarang(id) {
    if (!confirm('Yakin ingin menghapus barang ini?')) return;
    
    try {
      const response = await fetch(`/api/hapus?id=${id}`, { method: 'POST' });
      if (!response.ok) throw new Error('Gagal menghapus barang');
      
      alert('Barang berhasil dihapus');
      await this.loadBarang();
    } catch (error) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
    }
  }

  escapeHtml(text) {
    return text.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

const app = new BarangApp();
window.app = app;`;
