export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    if(path === "/api/list") {
      const d = await env.KATALOG.get("items");
      return new Response(d || "[]", { headers:{"Content-Type":"application/json"} });
    }
    if(path === "/api/tambah" && req.method==="POST") {
      const b = await req.json();
      const arr = JSON.parse(await env.KATALOG.get("items") || "[]");
      arr.push(b);
      await env.KATALOG.put("items", JSON.stringify(arr));
      return new Response("OK");
    }
    if(path === "/api/hapus" && req.method==="POST") {
      const i = +url.searchParams.get("id");
      const arr = JSON.parse(await env.KATALOG.get("items") || "[]");
      arr.splice(i,1);
      await env.KATALOG.put("items", JSON.stringify(arr));
      return new Response("Deleted");
    }
    // fallback: serve static
    if(path === "/" || path.startsWith("/script.js")) {
      return fetch(req);
    }
    return new Response("Not Found", { status:404 });
  }
}
