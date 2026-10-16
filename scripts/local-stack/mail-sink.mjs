#!/usr/bin/env node
// Local inbox for the Docker-free stack: a dependency-free SMTP sink and the subset of Mailpit's HTTP API
// the tests use (a real `supabase start` runs Mailpit on the same port, so tests work against either).
//
//   SMTP  127.0.0.1:54325  EHLO/HELO, MAIL, RCPT, DATA, RSET, NOOP, QUIT (no AUTH, no STARTTLS)
//   HTTP  127.0.0.1:54324
//     GET    /api/v1/messages                     { total, messages: [summary] } newest first
//     GET    /api/v1/search?query=to:"<addr>"     same shape, filtered by recipient
//     GET    /api/v1/message/<ID>                 { ID, From, To, Subject, Created, Text, HTML }
//     DELETE /api/v1/messages                     body { IDs: [...] } deletes those; no body deletes all
//     GET    /templates/sign-in-code.html         the repo's email template (GoTrue fetches it by URL)
// Messages live in memory only (the last 500).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.MAIL_SINK_HOST ?? "127.0.0.1";
const SMTP_PORT = Number(process.env.MAIL_SINK_SMTP_PORT ?? 54325);
const HTTP_PORT = Number(process.env.MAIL_SINK_HTTP_PORT ?? 54324);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TEMPLATES = { "sign-in-code.html": path.join(ROOT, "supabase/templates/sign-in-code.html") };
const MAX_MESSAGES = 500;

/** @type {{ ID: string; From: {Name: string; Address: string}; To: {Name: string; Address: string}[]; Subject: string; Created: string; Text: string; HTML: string; envelopeTo: string[] }[]} */
let messages = [];

// ---------------------------------------------------------------- MIME parsing (enough for GoTrue's mails)
function splitHeaders(raw) {
  const idx = raw.search(/\r?\n\r?\n/);
  const head = idx < 0 ? raw : raw.slice(0, idx);
  const body = idx < 0 ? "" : raw.slice(idx).replace(/^\r?\n\r?\n/, "");
  const headers = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (m) headers[m[1].toLowerCase()] = m[2];
  }
  return { headers, body };
}

function decodeQuotedPrintable(s) {
  const bytes = Buffer.from(s.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
  return bytes.toString("utf8");
}

function decodeBody(body, encoding) {
  const enc = (encoding ?? "").toLowerCase();
  if (enc === "quoted-printable") return decodeQuotedPrintable(body);
  if (enc === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  return body;
}

function decodeWords(s) {
  return (s ?? "").replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_, _charset, kind, text) =>
    kind.toLowerCase() === "b"
      ? Buffer.from(text, "base64").toString("utf8")
      : decodeQuotedPrintable(text.replace(/_/g, " ")),
  );
}

function parts(raw) {
  const { headers, body } = splitHeaders(raw);
  const type = headers["content-type"] ?? "text/plain";
  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
  if (/^multipart\//i.test(type) && boundary) {
    return body
      .split(`--${boundary}`)
      .slice(1)
      .filter((p) => !p.startsWith("--"))
      .flatMap((p) => parts(p.replace(/^\r?\n/, "")));
  }
  return [{ type: type.split(";")[0].trim().toLowerCase(), content: decodeBody(body, headers["content-transfer-encoding"]) }];
}

function htmlToText(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(br|\/p|\/h\d|\/tr|\/div)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function address(s) {
  const v = decodeWords(s ?? "").trim();
  const m = /^(.*)<([^>]+)>$/.exec(v);
  return m ? { Name: m[1].trim().replace(/^"(.*)"$/, "$1"), Address: m[2].trim() } : { Name: "", Address: v };
}

function store(raw, envelopeTo) {
  const { headers } = splitHeaders(raw);
  const all = parts(raw);
  const HTML = all.find((p) => p.type === "text/html")?.content ?? "";
  const plain = all.find((p) => p.type === "text/plain")?.content;
  const to = (headers.to ?? "").split(",").filter(Boolean).map(address);
  messages.unshift({
    ID: randomUUID(),
    From: address(headers.from),
    To: to.length ? to : envelopeTo.map((a) => ({ Name: "", Address: a })),
    Subject: decodeWords(headers.subject),
    Created: new Date().toISOString(),
    Text: plain ?? htmlToText(HTML),
    HTML,
    envelopeTo,
  });
  messages = messages.slice(0, MAX_MESSAGES);
}

// ---------------------------------------------------------------- SMTP
const smtp = net.createServer((socket) => {
  socket.setEncoding("utf8");
  let buffer = "";
  let inData = false;
  let data = [];
  let rcpt = [];
  const reply = (line) => socket.write(`${line}\r\n`);
  reply("220 bolton-vouched-mail-sink ESMTP");
  socket.on("data", (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).replace(/\r$/, "");
      buffer = buffer.slice(i + 1);
      if (inData) {
        if (line === ".") {
          inData = false;
          store(data.join("\r\n"), rcpt);
          data = [];
          rcpt = [];
          reply("250 OK: queued");
        } else {
          data.push(line.startsWith("..") ? line.slice(1) : line);
        }
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "EHLO") {
        socket.write("250-bolton-vouched-mail-sink\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n");
      } else if (cmd === "HELO") reply("250 bolton-vouched-mail-sink");
      else if (cmd === "MAIL") {
        rcpt = [];
        reply("250 OK");
      } else if (cmd === "RCPT") {
        const m = /<([^>]*)>/.exec(line);
        if (m) rcpt.push(m[1]);
        reply("250 OK");
      } else if (cmd === "DATA") {
        inData = true;
        reply("354 End data with <CR><LF>.<CR><LF>");
      } else if (cmd === "RSET") {
        rcpt = [];
        data = [];
        reply("250 OK");
      } else if (cmd === "NOOP") reply("250 OK");
      else if (cmd === "QUIT") {
        reply("221 Bye");
        socket.end();
      } else reply("502 Command not implemented");
    }
  });
  socket.on("error", () => {});
});

// ---------------------------------------------------------------- HTTP (Mailpit API subset)
function summary(m) {
  const { Text, HTML, envelopeTo, ...rest } = m;
  void HTML;
  void envelopeTo;
  return { ...rest, Snippet: Text.slice(0, 250) };
}

function recipient(query) {
  const m = /^to:"?([^"]*)"?$/i.exec(query.trim());
  return m ? m[1].trim().toLowerCase() : null;
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

const api = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://placeholder");
  const p = url.pathname;
  if (req.method === "GET" && p.startsWith("/templates/")) {
    const file = TEMPLATES[p.slice("/templates/".length)];
    if (!file) return send(res, 404, "not found", "text/plain");
    return send(res, 200, readFileSync(file, "utf8"), "text/html; charset=utf-8");
  }
  if (req.method === "GET" && (p === "/api/v1/messages" || p === "/api/v1/search")) {
    let list = messages;
    if (p === "/api/v1/search") {
      const to = recipient(url.searchParams.get("query") ?? "");
      if (to === null) return send(res, 400, { error: "only to:<address> queries are supported" });
      list = messages.filter(
        (m) => m.To.some((t) => t.Address.toLowerCase() === to) || m.envelopeTo.some((a) => a.toLowerCase() === to),
      );
    }
    return send(res, 200, { total: messages.length, messages_count: list.length, count: list.length, start: 0, messages: list.map(summary) });
  }
  const one = /^\/api\/v1\/message\/([^/]+)$/.exec(p);
  if (req.method === "GET" && one) {
    const m = messages.find((x) => x.ID === one[1]);
    if (!m) return send(res, 404, "message not found", "text/plain");
    const { envelopeTo, ...rest } = m;
    void envelopeTo;
    return send(res, 200, rest);
  }
  if (req.method === "DELETE" && p === "/api/v1/messages") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      let ids = null;
      try {
        ids = body.trim() ? JSON.parse(body).IDs ?? null : null;
      } catch {
        return send(res, 400, "bad JSON", "text/plain");
      }
      messages = Array.isArray(ids) && ids.length ? messages.filter((m) => !ids.includes(m.ID)) : [];
      send(res, 200, "ok", "text/plain");
    });
    return;
  }
  send(res, 404, "not found", "text/plain");
});

smtp.listen(SMTP_PORT, HOST, () => console.log(`mail-sink: SMTP on ${HOST}:${SMTP_PORT}`));
api.listen(HTTP_PORT, HOST, () => console.log(`mail-sink: HTTP on http://${HOST}:${HTTP_PORT}`));
