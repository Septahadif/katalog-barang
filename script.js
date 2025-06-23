async function compressImage(file, maxWidth=800) {
  return new Promise(resolve => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => img.src = e.target.result;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
      canvas.toBlob(resolve, "image/jpeg", 0.8);
    };
    reader.readAsDataURL(file);
  });
}

function toBase64(blob) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

document.getElementById("formBarang").addEventListener("submit", async e => {
  e.preventDefault();
  const nama = nama.value, harga = harga.value, satuan = satuan.value;
  const imgFile = gambar.files[0];
  const compressed = await compressImage(imgFile,800);
  const base64 = await toBase64(compressed);
  await fetch("/api/tambah", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ nama, harga, satuan, base64 })
  });
  location.reload();
});

window.onload = async () => {
  const res = await fetch("/api/list");
  const items = await res.json();
  katalog.innerHTML = items.map((item,i)=>`
    <div class="bg-white p-2 rounded shadow">
      <img src="${item.base64}" class="w-full h-40 object-cover rounded" />
      <h2 class="text-lg font-bold">${item.nama}</h2>
      <p>Rp ${Number(item.harga).toLocaleString()} / ${item.satuan}</p>
      <button onclick="hapus(${i})" class="mt-2 text-red-600">Hapus</button>
    </div>
  `).join("");
}

async function hapus(i) {
  await fetch(`/api/hapus?id=${i}`,{ method:"POST" });
  location.reload();
}
