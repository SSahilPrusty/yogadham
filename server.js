import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const PORT = Number(process.env.PORT || 3000);
const ROOT = resolve(".");
const PUBLIC_DIR = join(ROOT, "public");
const UPLOAD_DIR = join(PUBLIC_DIR, "uploads");
const ADMIN_USER = process.env.ADMIN_USER || "yogisahilprusty@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "yogadham123";
const sessions = new Set();

// Public client — publishable/anon key, respects RLS
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Service client — secret key, bypasses RLS for admin writes
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

await mkdir(UPLOAD_DIR, { recursive: true });

// ─── helpers ────────────────────────────────────────────────────────────────

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function cookieValue(req, name) {
  const cookies = req.headers.cookie || "";
  return cookies
    .split(";")
    .map((item) => item.trim().split("="))
    .find(([key]) => key === name)?.[1] || "";
}

function isAdmin(req) {
  const token = cookieValue(req, "yd_admin");
  return token && sessions.has(token);
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  json(res, 401, { error: "Admin login required" });
  return false;
}

function passwordMatches(value) {
  return value === ADMIN_PASSWORD;
}

async function bodyJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function multipart(req) {
  const type = req.headers["content-type"] || "";
  const boundary = type.match(/boundary=(.+)$/)?.[1];
  if (!boundary) return { fields: {}, files: {} };
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  const parts = buffer.toString("binary").split(`--${boundary}`);
  const fields = {};
  const files = {};

  for (const part of parts) {
    if (!part || part === "--\r\n" || part === "--") continue;
    const headerEndIndex = part.indexOf("\r\n\r\n");
    if (headerEndIndex === -1) continue;
    const rawHeaders = part.slice(0, headerEndIndex);
    const rawBody = part.slice(headerEndIndex + 4);
    const name = rawHeaders.match(/name="([^"]+)"/)?.[1];
    const filename = rawHeaders.match(/filename="([^"]*)"/)?.[1];
    if (!name) continue;
    const content = rawBody.slice(0, -2);
    if (filename && filename.trim()) {
      const safeExt = extname(filename).toLowerCase() || ".bin";
      const finalName = `${Date.now()}-${randomUUID()}${safeExt}`;
      const filePath = join(UPLOAD_DIR, finalName);
      await writeFile(filePath, Buffer.from(content, "binary"));
      files[name] = `/uploads/${finalName}`;
    } else {
      fields[name] = Buffer.from(content, "binary").toString("utf8");
    }
  }
  return { fields, files };
}

// ─── database helpers ────────────────────────────────────────────────────────

async function listEvents() {
  const { data, error } = await supabaseAdmin
    .from("events")
    .select("*")
    .order("date", { ascending: true })
    .order("id", { ascending: false });
  return data || [];
}

async function listNotices() {
  const { data, error } = await supabaseAdmin
    .from("notices")
    .select("*")
    .order("published_on", { ascending: false })
    .order("id", { ascending: false });
  return data || [];
}

async function getSettings() {
  try {
    const { data, error } = await supabase
      .from("site_settings")
      .select("key, value");
    if (error) throw error;
    const settings = {};
    for (const row of data || []) settings[row.key] = row.value;
    // Ensure defaults exist
    if (!settings.hero_image_url) {
      settings.hero_image_url = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1800&q=85";
    }
    return settings;
  } catch {
    // Table may not exist yet — return defaults
    return {
      logo_url: "",
      hero_image_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1800&q=85"
    };
  }
}

// ─── API router ──────────────────────────────────────────────────────────────

async function api(req, res, url) {

  // Public data
  if (req.method === "GET" && url.pathname === "/api/events") {
    return json(res, 200, await listEvents());
  }
  if (req.method === "GET" && url.pathname === "/api/notices") {
    return json(res, 200, await listNotices());
  }
  if (req.method === "GET" && url.pathname === "/api/settings") {
    return json(res, 200, await getSettings());
  }
  if (req.method === "GET" && url.pathname === "/api/site") {
    const events = await listEvents();
    const notices = await listNotices();
    const settings = await getSettings();
    return json(res, 200, {
      events,
      notices,
      settings,
      stats: { events: events.length, notices: notices.length }
    });
  }

  // Auth
  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const data = await bodyJson(req);
    if (data.username === ADMIN_USER && passwordMatches(data.password)) {
      const token = randomUUID();
      sessions.add(token);
      res.setHeader("Set-Cookie", `yd_admin=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
      return json(res, 200, { ok: true, user: ADMIN_USER });
    }
    return json(res, 401, { error: "Invalid admin username or password" });
  }
  if (req.method === "POST" && url.pathname === "/api/admin/logout") {
    const token = cookieValue(req, "yd_admin");
    if (token) sessions.delete(token);
    res.setHeader("Set-Cookie", "yd_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    return json(res, 200, { ok: true });
  }

  // Admin dashboard
  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    if (!requireAdmin(req, res)) return;
    const events = await listEvents();
    const notices = await listNotices();
    const settings = await getSettings();
    return json(res, 200, {
      events,
      notices,
      settings,
      stats: { events: events.length, notices: notices.length }
    });
  }

  // Add event
  if (req.method === "POST" && url.pathname === "/api/events") {
    if (!requireAdmin(req, res)) return;
    const data = await bodyJson(req);
    const { error } = await supabaseAdmin.from("events").insert({
      title: data.title,
      teacher: data.teacher,
      category: data.category || "Yoga Session",
      date: data.date,
      time: data.time,
      location: data.location,
      fee: data.fee || "Free",
      description: data.description,
      image_url: data.image_url || "",
      pdf_url: data.pdf_url || "",
      whatsapp: data.whatsapp || "919999999999"
    });
    return json(res, 201, { ok: true, events: await listEvents() });
  }

  // Add notice
  if (req.method === "POST" && url.pathname === "/api/notices") {
    if (!requireAdmin(req, res)) return;
    const data = await bodyJson(req);
    const { error } = await supabaseAdmin.from("notices").insert({
      title: data.title,
      type: data.type || "Notice",
      published_on: data.published_on,
      summary: data.summary,
      pdf_url: data.pdf_url || ""
    });
    return json(res, 201, { ok: true, notices: await listNotices() });
  }

  // Upload file (PDF or image)
  if (req.method === "POST" && url.pathname === "/api/upload") {
    if (!requireAdmin(req, res)) return;
    const parsed = await multipart(req);
    return json(res, 201, { ok: true, files: parsed.files });
  }

  // Update site settings (logo_url, hero_image_url, etc.)
  if (req.method === "POST" && url.pathname === "/api/settings") {
    if (!requireAdmin(req, res)) return;
    const data = await bodyJson(req);
    const updates = [];
    for (const [key, value] of Object.entries(data)) {
      updates.push(
        supabaseAdmin
          .from("site_settings")
          .upsert({ key, value }, { onConflict: "key" })
      );
    }
    const results = await Promise.all(updates);
    for (const { error } of results) if (error) throw error;
    return json(res, 200, { ok: true, settings: await getSettings() });
  }

  // Delete event
  if (req.method === "DELETE" && url.pathname.startsWith("/api/events/")) {
    if (!requireAdmin(req, res)) return;
    const id = url.pathname.split("/").pop();
    const { error } = await supabaseAdmin.from("events").delete().eq("id", id);
    return json(res, 200, { ok: true, events: await listEvents() });
  }

  // Delete notice
  if (req.method === "DELETE" && url.pathname.startsWith("/api/notices/")) {
    if (!requireAdmin(req, res)) return;
    const id = url.pathname.split("/").pop();
    const { error } = await supabaseAdmin.from("notices").delete().eq("id", id);
    return json(res, 200, { ok: true, notices: await listNotices() });
  }

  return json(res, 404, { error: "Not found" });
}

// ─── Static file server ───────────────────────────────────────────────────────

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

async function staticFile(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = normalize(join(PUBLIC_DIR, requested));
  if (!file.startsWith(PUBLIC_DIR) || !existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const content = await readFile(file);
  res.writeHead(200, { "Content-Type": mime[extname(file).toLowerCase()] || "application/octet-stream" });
  res.end(content);
}

// ─── Main server ──────────────────────────────────────────────────────────────

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return await staticFile(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "Server error", detail: error.message });
  }
}).listen(PORT, () => {
  console.log(`Yoga Dham server running at http://localhost:${PORT}`);
});
