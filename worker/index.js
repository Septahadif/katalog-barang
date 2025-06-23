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

    // GET list barang
    if (path === "/api/list") {
      const data = await env.KATALOG.get("items");
      return new Response(data || "[]", {
        headers: { "Content-Type": "application/json" },
      });
    }

    // POST tambah barang
    if (path === "/api/tambah" && req.method === "POST") {
      const body = await req.json();
      const items = JSON.parse(await env.KATALOG.get("items") || "[]");

      // Tambahkan ID agar bisa dihapus
      const item = { ...body, id: Date.now().toString() };
      items.push(item);

      await env.KATALOG.put("items", JSON.stringify(items));
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // POST hapus barang
    if (path === "/api/hapus" && req.method === "POST") {
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

// Masukkan isi index.html kamu di sini (dalam string)
const INDEX_HTML = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Katalog Barang</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
</head>
<body class="bg-gray-100 min-h-screen flex flex-col items-center p-4">

  <div class="w-full max-w-xl">
    <h1 class="text-2xl font-bold mb-4 text-center">📦 Katalog Barang</h1>

    <!-- Form Tambah Barang -->
    <form id="formBarang" class="bg-white p-4 rounded shadow space-y-3 mb-6">
      <div>
        <label class="block mb-1 font-medium">Nama Barang</label>
        <input id="nama" name="nama" type="text" required class="w-full border p-2 rounded" placeholder="Contoh: Gula Pasir" />
      </div>
      <div>
        <label class="block mb-1 font-medium">Harga (Rp)</label>
        <input id="harga" name="harga" type="number" required class="w-full border p-2 rounded" placeholder="Contoh: 15000" />
      </div>
      <div>
        <label class="block mb-1 font-medium">Satuan</label>
        <input id="satuan" name="satuan" type="text" required class="w-full border p-2 rounded" placeholder="Contoh: Kg / Liter" />
      </div>
      <div>
        <label class="block mb-1 font-medium">Gambar</label>
        <input id="gambar" name="gambar" type="file" accept="image/*" required class="w-full border p-2 rounded" />
      </div>
      <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition w-full">Tambah Barang</button>
    </form>

    <!-- Katalog -->
    <div id="katalog" class="grid gap-4 grid-cols-1 sm:grid-cols-2"></div>
  </div>

  <!-- Script -->
  <script src="script.js"></script>
</body>
</html>
`;

// Masukkan isi script.js kamu di sini (dalam string)
const SCRIPT_JS = `
// ================ UTILITY FUNCTIONS ================
const Utils = {
  // Kompres gambar dengan kualitas dan dimensi maksimum
  async compressImage(file, maxWidth = 800, quality = 0.8) {
    if (!file.type.match('image.*')) {
      throw new Error('File harus berupa gambar');
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('Gagal membaca file'));
      img.onerror = () => reject(new Error('Gagal memuat gambar'));

      reader.onload = (e) => (img.src = e.target.result);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const scale = Math.min(maxWidth / img.width, 1);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error('Kompresi gagal'));
              if (blob.size > 2 * 1024 * 1024) {
                reject(new Error('Gambar terlalu besar setelah kompresi (maks 2MB)'));
              }
              resolve(blob);
            },
            'image/jpeg',
            quality
          );
        } catch (err) {
          reject(err);
        }
      };

      reader.readAsDataURL(file);
    });
  },

  // Konversi blob ke base64
  async toBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Konversi ke base64 gagal'));
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  },

  // Validasi input
  validateInputs({ nama, harga, satuan, gambar }) {
    const errors = [];

    if (!nama || typeof nama !== 'string' || nama.trim().length < 2) {
      errors.push('Nama harus minimal 2 karakter');
    }

    if (!harga || isNaN(harga) || Number(harga) <= 0) {
      errors.push('Harga harus angka lebih dari 0');
    }

    if (!satuan || typeof satuan !== 'string' || satuan.trim().length === 0) {
      errors.push('Satuan harus diisi');
    }

    if (!gambar || !gambar.type.match('image.*')) {
      errors.push('File harus berupa gambar');
    } else if (gambar.size > 5 * 1024 * 1024) {
      errors.push('Gambar terlalu besar (maks 5MB)');
    }

    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }
  },

  // Tampilkan loading state
  setLoading(element, isLoading, loadingText = 'Memproses...') {
    if (isLoading) {
      element.disabled = true;
      element.dataset.originalText = element.textContent;
      element.textContent = loadingText;
    } else {
      element.disabled = false;
      element.textContent = element.dataset.originalText;
    }
  },
};

// ================ MAIN APPLICATION ================
class BarangApp {
  constructor() {
    this.form = document.getElementById('formBarang');
    this.katalog = document.getElementById('katalog');
    this.init();
  }

  init() {
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.loadBarang();
  }

  async handleSubmit(e) {
    e.preventDefault();
    const submitBtn = this.form.querySelector('button[type="submit"]');

    try {
      Utils.setLoading(submitBtn, true);

      const formData = {
        nama: this.form.nama.value.trim(),
        harga: this.form.harga.value.trim(),
        satuan: this.form.satuan.value.trim(),
        gambar: this.form.gambar.files[0],
      };

      Utils.validateInputs(formData);

      // Kompres gambar dan konversi ke base64
      const compressed = await Utils.compressImage(formData.gambar);
      const base64 = await Utils.toBase64(compressed);

      // Kirim ke server
      const response = await fetch('/api/tambah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: formData.nama,
          harga: Number(formData.harga),
          satuan: formData.satuan,
          base64,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Gagal menambahkan barang');
      }

      alert('✅ Barang berhasil ditambahkan!');
      this.form.reset();
      await this.loadBarang();
    } catch (error) {
      console.error('Error:', error);
      alert(\`❌ \${error.message}\`);
    } finally {
      Utils.setLoading(submitBtn, false);
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

      this.katalog.innerHTML = items
  .map(
    (item) => \`
    <div class=\"bg-white p-3 rounded shadow\" data-id=\"\${item.id}\">
      <img src=\"\${this.escapeHtml(item.base64)}\" alt=\"\${this.escapeHtml(item.nama)}\" 
           class=\"w-full h-40 object-cover rounded mb-2\" />
      <h2 class=\"text-lg font-semibold\">\${this.escapeHtml(item.nama)}</h2>
      <p class=\"text-sm text-gray-600\">Rp \${Number(item.harga).toLocaleString('id-ID')} / \${this.escapeHtml(item.satuan)}</p>
      <button onclick=\"app.hapusBarang('\${item.id}')\" 
              class=\"mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition\">
        Hapus
      </button>
    </div>
  \`
).join('');
    } catch (error) {
      console.error('Error:', error);
      this.katalog.innerHTML = `
        <div class="text-center py-4 text-red-500">
          <p>Gagal memuat data: ${this.escapeHtml(error.message)}</p>
        </div>
      `;
    }
  }

  async hapusBarang(id) {
    try {
      const itemElement = document.querySelector(`[data-id="${id}"]`);
      const itemName = itemElement?.querySelector('h2')?.textContent || 'barang ini';

      const konfirmasi = confirm(`Yakin ingin menghapus ${itemName}?`);
      if (!konfirmasi) return;

      const response = await fetch(`/api/hapus?id=${id}`, { method: 'POST' });
      if (!response.ok) throw new Error('Gagal menghapus barang');

      alert('✅ Barang berhasil dihapus');
      await this.loadBarang();
    } catch (error) {
      console.error('Error:', error);
      alert(\`❌ \${error.message}\`);
    }
  }

  // Prevent XSS
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
window.app = app; // Make it accessible for button clicks
`;
