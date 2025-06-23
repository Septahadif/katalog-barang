// Fungsi kompres gambar
async function compressImage(file, maxWidth = 800) {
  return new Promise(resolve => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => img.src = e.target.result;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, "image/jpeg", 0.8);
    };
    reader.readAsDataURL(file);
  });
}

// Ubah blob ke base64
function toBase64(blob) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

// Tambah barang
document.getElementById("formBarang").addEventListener("submit", async e => {
  e.preventDefault();

  const nama = document.getElementById("nama").value.trim();
  const harga = document.getElementById("harga").value.trim();
  const satuan = document.getElementById("satuan").value.trim();
  const gambarInput = document.getElementById("gambar");
  const gambarFile = gambarInput.files[0];

  if (!nama || !harga || !satuan || !gambarFile) {
    alert("Mohon lengkapi semua data dan unggah gambar!");
    return;
  }

  // Kompres gambar dan ubah ke base64
  const compressed = await compressImage(gambarFile, 800);
  const base64 = await toBase64(compressed);

  // Kirim data ke backend
  const res = await fetch("/api/tambah", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nama, harga, satuan, base64 })
  });

  if (res.ok) {
    alert("✅ Barang berhasil ditambahkan!");
    location.reload();
  } else {
    alert("❌ Gagal menambahkan barang.");
  }
});

// Ambil dan tampilkan data barang saat halaman dimuat
window.onload = async () => {
  const katalog = document.getElementById("katalog");
  katalog.innerHTML = `<p class="text-gray-500">Memuat data...</p>`;

  const res = await fetch("/api/list");
  const items = await res.json();

  if (items.length === 0) {
    katalog.innerHTML = `<p class="text-gray-500">Belum ada barang.</p>`;
    return;
  }

  katalog.innerHTML = items.map((item, i) => `
    <div class="bg-white p-3 rounded shadow">
      <img src="${item.base64}" class="w-full h-40 object-cover rounded mb-2" />
      <h2 class="text-lg font-semibold">${item.nama}</h2>
      <p class="text-sm text-gray-600">Rp ${Number(item.harga).toLocaleString()} / ${item.satuan}</p>
      <button onclick="hapus(${i})" class="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded">Hapus</button>
    </div>
  `).join("");
}

// Fungsi hapus barang
async function hapus(i) {
  const konfirmasi = confirm("Yakin ingin menghapus barang ini?");
  if (!konfirmasi) return;

  const res = await fetch(`/api/hapus?id=${i}`, { method: "POST" });
  if (res.ok) {
    alert("✅ Barang berhasil dihapus.");
    location.reload();
  } else {
    alert("❌ Gagal menghapus barang.");
  }
}
