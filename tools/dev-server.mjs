// Development-only server for converting Microsoft Rocketbox (MIT) avatars: serves the converter page,
// the Rocketbox sources and a three.js package, and writes converted files posted to /save under build/.
//   node tools/dev-server.mjs <rocketbox avatars dir> <three package dir> [port]
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import url from "node:url";
const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const [,, rbDir, threeDir, port = "8791"] = process.argv;
const out = path.join(root, "build");
const types = { ".js": "text/javascript", ".html": "text/html", ".tga": "image/x-tga", ".fbx": "application/octet-stream" };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"), p = decodeURIComponent(u.pathname);
  if (req.method === "POST" && p === "/save") {
    const rel = u.searchParams.get("path") || "";
    const dest = path.join(out, rel);
    if (!dest.startsWith(out + path.sep) || rel.includes("..")) { res.writeHead(400); return res.end("bad path"); }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => { fs.writeFileSync(dest, Buffer.concat(chunks)); res.writeHead(200); res.end("ok"); });
    return;
  }
  const f = p.startsWith("/rb/") ? path.join(rbDir, p.slice(4)) : p.startsWith("/three/") ? path.join(threeDir, p.slice(7)) : path.join(root, "tools", p.slice(1));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "content-type": types[path.extname(f).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(f).pipe(res);
}).listen(+port, "127.0.0.1", () => console.log("convert server on " + port));
