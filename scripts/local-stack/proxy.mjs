#!/usr/bin/env node
// Minimal stand-in for Supabase's Kong gateway on :54321.
//   /rest/v1/*  -> PostgREST   (prefix stripped)
//   /auth/v1/*  -> Supabase Auth (prefix stripped)
//   /storage/v1/* -> a small file-backed stand-in for Storage (storage.mjs)
// Forwards all headers (apikey, Authorization, ...) and answers CORS permissively.
import http from "node:http";
import { handleStorage } from "./storage.mjs";

const PORT = Number(process.env.PROXY_PORT ?? 54321);
const HOST = process.env.PROXY_HOST ?? "127.0.0.1";
const ROUTES = [
  { prefix: "/rest/v1", port: Number(process.env.POSTGREST_PORT ?? 54330) },
  { prefix: "/auth/v1", port: Number(process.env.AUTH_PORT ?? 54331) },
];

function cors(req) {
  return {
    "access-control-allow-origin": req.headers.origin ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
    "access-control-allow-headers":
      req.headers["access-control-request-headers"] ??
      "authorization,apikey,content-type,prefer,range,x-client-info,accept-profile,content-profile",
    "access-control-expose-headers": "content-range,content-location,location,x-total-count",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://placeholder");
  const route = ROUTES.find((r) => url.pathname === r.prefix || url.pathname.startsWith(`${r.prefix}/`));

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors(req));
    return res.end();
  }
  if (url.pathname.startsWith("/storage/v1/")) {
    for (const [k, v] of Object.entries(cors(req))) res.setHeader(k, v);
    return void handleStorage(req, res, url.pathname.slice("/storage/v1".length), url.search);
  }
  if (!route) {
    res.writeHead(404, { "content-type": "application/json", ...cors(req) });
    return res.end(JSON.stringify({ message: "no Route matched with those values" }));
  }

  const path = url.pathname.slice(route.prefix.length) || "/";
  const headers = { ...req.headers, host: `127.0.0.1:${route.port}` };
  // Kong in the Supabase CLI falls back to the apikey when no Authorization is sent.
  if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
  headers["x-forwarded-host"] = req.headers.host ?? `${HOST}:${PORT}`;
  headers["x-forwarded-proto"] = "http";
  headers["x-forwarded-prefix"] = route.prefix;

  const upstream = http.request(
    { host: "127.0.0.1", port: route.port, method: req.method, path: path + url.search, headers },
    (up) => {
      const out = { ...up.headers };
      for (const h of Object.keys(out)) if (h.startsWith("access-control-")) delete out[h];
      res.writeHead(up.statusCode ?? 502, { ...out, ...cors(req) });
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json", ...cors(req) });
    res.end(JSON.stringify({ message: `upstream ${route.prefix} unavailable: ${err.message}` }));
  });
  req.pipe(upstream);
});

server.listen(PORT, HOST, () => console.log(`proxy listening on http://${HOST}:${PORT}`));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.close(() => process.exit(0)));
