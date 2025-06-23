export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Serve static index.html
    if (path === "/" || path === "/index.html") {
      return new Response(INDEX_HTML, {
        headers: { "Content-Type": "text/html" }
      });
    }

    // Serve script.js
    if (path === "/script.js") {
      return new Response(SCRIPT_JS, {
        headers: { "Content-Type": "application/javascript" }
      });
    }

    // API: ambil data katalog
    if (path === "/api/list") {
      const data = await env.KATALOG.get("items");
      return new Response(data || "[]", {
        headers: { "Content-Type": "application/json" }
      });
    }

    // API: tambah barang
    if (path === "/api/tambah" && req.method === "POST") {
      const item = await req.json();
      const items = JSON.parse(await env.KATALOG.get("items") || "[]");
      items.push(item);
      await env.KATALOG.put("items", JSON.stringify(items));
      return new Response("OK");
    }

    // API: hapus barang
    if (path === "/api/hapus" && req.method === "POST") {
      const id = parseInt(url.searchParams.get("id"));
      const items = JSON.parse(await env.KATALOG.get("items") || "[]");
      items.splice(id, 1);
      await env.KATALOG.put("items", JSON.stringify(items));
      return new Response("Deleted");
    }

    return new Response("404 Not Found", { status: 404 });
  }
}

// Kamu harus menyalin isi index.html dan script.js ke sini:
const INDEX_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Katalog Barang</title>
  <script defer src="script.js"></script>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
</head>
<body class="p-4 bg-gray-100">
  <h1 class="text-xl font-bold mb-4">📦 Katalog Barang</h1>
  <form id="formBarang" class="mb-6 space-y-2">
    <input id="nama" placeholder="Nama Barang" required class="border p-2 w-full" />
    <input id="harga" type="number" placeholder="Harga (Rp)" required class="border p-2 w-full" />
    <input id="satuan" placeholder="Satuan" required class="border p-2 w-full" />
    <input id="gambar" type="file" accept="image/*" required class="border p-2 w-full" />
    <button type="submit" class="bg-blue-500 text-white px-4 py-2">Tambah</button>
  </form>
  <div id="katalog" class="grid grid-cols-1 sm:grid-cols-2 gap-4"></div>
</body>
</html>
`;

const SCRIPT_JS = `
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
  katalog.innerHTML = items.map((item,i)=>\`
    <div class="bg-white p-2 rounded shadow">
      <img src="\${item.base64}" class="w-full h-40 object-cover rounded" />
      <h2 class="text-lg font-bold">\${item.nama}</h2>
      <p>Rp \${Number(item.harga).toLocaleString()} / \${item.satuan}</p>
      <button onclick="hapus(\${i})" class="mt-2 text-red-600">Hapus</button>
    </div>
  \`).join("");
}

async function hapus(i) {
  await fetch(\`/api/hapus?id=\${i}\`,{ method:"POST" });
  location.reload();
}
`;
