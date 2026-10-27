// Minimal stand-in for Supabase Storage on the local stack (served by proxy.mjs under /storage/v1), so the app's
// uploads (review proofs, Pro ID documents, work photos) work without Docker. Only what @supabase/supabase-js calls:
//   POST|PUT /object/<bucket>/<path>          upload (service role only; x-upsert honoured)
//   DELETE   /object/<bucket>   {prefixes}     remove (service role only)
//   POST     /object/sign/<bucket>/<path>      {expiresIn} -> {signedURL} (service role only)
//   GET      /object/sign/<bucket>/<path>?token=...        a signed link
//   GET      /object/public/<bucket>/<path>                public buckets only (STORAGE_PUBLIC_BUCKETS)
// Files live in scripts/local-stack/run/storage/<bucket>/<path> (git-ignored), each with a .meta.json holding its
// content type. Bucket settings (size limits, MIME types) are not enforced: the app checks those itself.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JWT_SECRET } from "./jwt.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.STORAGE_DIR ?? path.join(HERE, "run", "storage");
// The migrations make 'work-photos' and 'trader-logos' public on a real stack; here it's configuration.
const PUBLIC_BUCKETS = new Set((process.env.STORAGE_PUBLIC_BUCKETS ?? "work-photos,trader-logos").split(",").filter(Boolean));

const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function role(req) {
  const auth = req.headers.authorization ?? (req.headers.apikey ? `Bearer ${req.headers.apikey}` : "");
  const token = auth.replace(/^Bearer\s+/i, "");
  const [h, b, s] = token.split(".");
  if (!h || !b || !s) return null;
  const want = createHmac("sha256", JWT_SECRET).update(`${h}.${b}`).digest();
  const got = Buffer.from(s, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    return JSON.parse(Buffer.from(b, "base64url").toString()).role ?? null;
  } catch {
    return null;
  }
}

/** bucket + object path from the URL rest, or null when either is unsafe. */
function locate(rest) {
  const parts = rest.split("/").map((p) => decodeURIComponent(p)).filter(Boolean);
  if (parts.length < 1 || !parts.every((p) => SAFE.test(p))) return null;
  return { bucket: parts[0], key: parts.slice(1).join("/") };
}

const file = (bucket, key) => path.join(ROOT, bucket, key);
const sign = (bucket, key, exp) => createHmac("sha256", JWT_SECRET).update(`${bucket}/${key}:${exp}`).digest("base64url");

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { "content-type": isBuf ? "application/octet-stream" : "application/json", ...headers });
  res.end(isBuf ? body : JSON.stringify(body));
}

function serve(res, bucket, key) {
  const f = file(bucket, key);
  if (!key || !existsSync(f) || !statSync(f).isFile()) return send(res, 404, { statusCode: "404", error: "not_found", message: "Object not found" });
  let type = "application/octet-stream";
  try {
    type = JSON.parse(readFileSync(`${f}.meta.json`, "utf8")).contentType ?? type;
  } catch {}
  send(res, 200, readFileSync(f), { "content-type": type, "cache-control": "public, max-age=60" });
}

const body = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c)).on("end", () => resolve(Buffer.concat(chunks))).on("error", reject);
  });

/** Handles one /storage/v1 request (the prefix already stripped). */
export async function handleStorage(req, res, rest, search) {
  const url = new URL(`http://x${rest}${search}`);
  const p = url.pathname;
  try {
    if (req.method === "GET" && p.startsWith("/object/public/")) {
      const loc = locate(p.slice("/object/public/".length));
      if (!loc || !PUBLIC_BUCKETS.has(loc.bucket)) return send(res, 400, { statusCode: "404", error: "not_found", message: "Bucket not found" });
      return serve(res, loc.bucket, loc.key);
    }
    if (req.method === "GET" && p.startsWith("/object/sign/")) {
      const loc = locate(p.slice("/object/sign/".length));
      const [exp, sig] = (url.searchParams.get("token") ?? "").split(".");
      if (!loc || !exp || !sig || Number(exp) < Date.now() / 1000 || sig !== sign(loc.bucket, loc.key, exp)) {
        return send(res, 400, { statusCode: "400", error: "InvalidJWT", message: "invalid signature" });
      }
      return serve(res, loc.bucket, loc.key);
    }
    if (role(req) !== "service_role") return send(res, 403, { statusCode: "403", error: "Unauthorized", message: "service role only (local stand-in)" });

    if (req.method === "POST" && p.startsWith("/object/sign/")) {
      const loc = locate(p.slice("/object/sign/".length));
      if (!loc || !loc.key || !existsSync(file(loc.bucket, loc.key))) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      const { expiresIn = 60 } = JSON.parse((await body(req)).toString() || "{}");
      const exp = String(Math.floor(Date.now() / 1000) + Number(expiresIn));
      const token = `${exp}.${sign(loc.bucket, loc.key, exp)}`;
      return send(res, 200, { signedURL: `/object/sign/${loc.bucket}/${loc.key}?token=${token}` });
    }
    if ((req.method === "POST" || req.method === "PUT") && p.startsWith("/object/")) {
      const loc = locate(p.slice("/object/".length));
      if (!loc || !loc.key) return send(res, 400, { statusCode: "400", error: "invalid_key", message: "Invalid key" });
      const f = file(loc.bucket, loc.key);
      if (existsSync(f) && req.method === "POST" && req.headers["x-upsert"] !== "true") {
        await body(req);
        return send(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
      }
      const data = await body(req);
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(f, data);
      writeFileSync(`${f}.meta.json`, JSON.stringify({ contentType: req.headers["content-type"] ?? "application/octet-stream" }));
      return send(res, 200, { Key: `${loc.bucket}/${loc.key}`, Id: randomUUID() });
    }
    if (req.method === "DELETE" && p.startsWith("/object/")) {
      const loc = locate(p.slice("/object/".length));
      if (!loc) return send(res, 400, { statusCode: "400", error: "invalid_bucket", message: "Invalid bucket" });
      const { prefixes = [] } = JSON.parse((await body(req)).toString() || "{}");
      const gone = [];
      for (const key of prefixes) {
        const k = String(key);
        if (!k.split("/").every((part) => SAFE.test(part))) continue;
        const f = file(loc.bucket, k);
        if (existsSync(f)) {
          rmSync(f, { force: true });
          rmSync(`${f}.meta.json`, { force: true });
          gone.push({ name: k, bucket_id: loc.bucket });
        }
      }
      return send(res, 200, gone);
    }
    return send(res, 404, { statusCode: "404", error: "not_found", message: "Not supported by the local stand-in" });
  } catch (err) {
    return send(res, 500, { statusCode: "500", error: "internal", message: String(err?.message ?? err) });
  }
}
