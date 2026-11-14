/** Local static server for DESENREDA 6.3. The simulated assistant is 100% in-browser.
 * No AI provider is contacted, and no API keys are needed or read. */
import http from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2"
};
function send(res, code, body) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(body));
}
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url || "/", "http://localhost"); }
  catch { return send(res, 400, { error: "Dirección inválida." }); }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, { ok: true, assistantMode: "local-simulation", externalAI: false });
  }
  // The legacy online AI endpoint has intentionally been disabled.
  if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "La demostración funciona directamente en el navegador." });
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Método no permitido." });

  let pathname;
  try { pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname); }
  catch { return send(res, 400, { error: "Codificación de URL no válida." }); }
  if (pathname.split("/").some(segment => segment.startsWith("."))) return send(res, 404, { error: "Archivo no encontrado." });
  const target = path.resolve(ROOT, `.${pathname}`);
  if (!target.startsWith(ROOT + path.sep)) return send(res, 403, { error: "Ruta no permitida." });
  try {
    const resolved = await realpath(target);
    if (!resolved.startsWith(ROOT + path.sep)) return send(res, 403, { error: "Ruta no permitida." });
    if (!(await stat(resolved)).isFile()) return send(res, 404, { error: "Archivo no encontrado." });
    res.writeHead(200, {
      "Content-Type": mime[path.extname(resolved).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control": /\.(?:html|css|js|webmanifest)$/.test(resolved) ? "no-cache" : "public, max-age=3600"
    });
    if (req.method === "HEAD") return res.end();
    return res.end(await readFile(resolved));
  } catch { return send(res, 404, { error: "Archivo no encontrado." }); }
});
server.listen(PORT, HOST, () => {
  console.log(`DESENREDA 6.3 · Simulación local disponible en http://${HOST}:${PORT}`);
});
