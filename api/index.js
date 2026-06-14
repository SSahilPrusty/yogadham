import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

// ─── Configuration ────────────────────────────────────────────────────────────
const ADMIN_USER     = process.env.ADMIN_USER     || "yogisahilprusty@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "yogadham123";
const ADMIN_SECRET   = process.env.ADMIN_SECRET   || "yogadham-secret-fallback";
const SUPABASE_BUCKET = "uploads";

// ─── Lazy Supabase clients ────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error(`SUPABASE_URL or SUPABASE_ANON_KEY not set`);
  return createClient(url, key);
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error(`SUPABASE_URL or SUPABASE_SERVICE_KEY not set`);
  return createClient(url, key);
}

// ─── HMAC Token Auth (stateless — works across Vercel serverless instances) ───
// NOTE: username is base64url-encoded so dots in email don't break the 3-part split
function hmac(value) {
  return createHmac("sha256", ADMIN_SECRET).update(value).digest("hex");
}

function makeToken(username) {
  const userB64 = Buffer.from(username).toString("base64url");
  const ts = Date.now().toString();
  const payload = `${userB64}.${ts}`;
  return `${payload}.${hmac(payload)}`;
}

function verifyToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const age = Date.now() - Number(parts[1]);
  if (!Number.isFinite(age) || age > 8 * 60 * 60 * 1000) return false;
  const expected = Buffer.from(hmac(payload));
  const actual   = Buffer.from(parts[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cookieValue(req, name) {
  const cookie = req.headers["cookie"] || "";
  return cookie.split(";").map((item) => item.trim().split("=")).find(([key]) => key === name)?.[1] || "";
}

function requireAdmin(req) {
  const token = cookieValue(req, "yd_admin");
  return token && verifyToken(token) ? null : { error: "Admin login required" };
}

async function listEvents() {
  const { data } = await getSupabaseAdmin()
    .from("events")
    .select("*")
    .order("date", { ascending: true })
    .order("id", { ascending: false });
  return data || [];
}

async function listNotices() {
  const { data } = await getSupabaseAdmin()
    .from("notices")
    .select("*")
    .order("published_on", { ascending: false })
    .order("id", { ascending: false });
  return data || [];
}

async function getSettings() {
  try {
    const { data } = await getSupabaseAdmin().from("site_settings").select("key, value");
    const settings = {};
    for (const row of data || []) settings[row.key] = row.value;
    if (!settings.hero_image_url) {
      settings.hero_image_url = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1800&q=85";
    }
    return settings;
  } catch {
    return {
      logo_url: "",
      hero_image_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1800&q=85"
    };
  }
}

// ─── Read raw body ────────────────────────────────────────────────────────────
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function readBody(req) {
  return readRawBody(req).then(buf => {
    try { return JSON.parse(buf.toString("utf8") || "{}"); } catch { return {}; }
  });
}

// ─── Parse multipart form data ────────────────────────────────────────────────
async function parseMultipart(req) {
  const type = req.headers["content-type"] || "";
  const boundary = type.match(/boundary=([^\s;]+)/)?.[1];
  if (!boundary) return { fields: {}, files: {} };

  const buf = await readRawBody(req);
  const text = buf.toString("binary");
  const parts = text.split(`--${boundary}`);
  const fields = {};
  const files = {};

  for (const part of parts) {
    if (!part || part === "--\r\n" || part.trim() === "--") continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headers = part.slice(0, headerEnd);
    const body = part.slice(headerEnd + 4, -2); // strip trailing \r\n
    const name = headers.match(/name="([^"]+)"/)?.[1];
    const filename = headers.match(/filename="([^"]*)"/)?.[1];
    const contentType = headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";
    if (!name) continue;
    if (filename && filename.trim()) {
      files[name] = { buffer: Buffer.from(body, "binary"), filename, contentType };
    } else {
      fields[name] = Buffer.from(body, "binary").toString("utf8");
    }
  }
  return { fields, files };
}

// ─── Upload file to Supabase Storage ─────────────────────────────────────────
async function uploadToStorage(fileBuffer, filename, contentType) {
  const ext = filename.split(".").pop().toLowerCase();
  const safeExt = ["jpg", "jpeg", "png", "gif", "webp", "svg", "pdf"].includes(ext) ? ext : "bin";
  const uniqueName = `${Date.now()}-${randomUUID()}.${safeExt}`;

  const supabase = getSupabaseAdmin();

  // Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets || []).some(b => b.name === SUPABASE_BUCKET);
  if (!exists) {
    await supabase.storage.createBucket(SUPABASE_BUCKET, { public: true });
  }

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(uniqueName, fileBuffer, { contentType, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(uniqueName);
  return publicUrl;
}

function json(res, data, status = 200, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    ...extraHeaders
  });
  res.end(body);
}

// ─── Main handler (Vercel Node.js serverless format) ─────────────────────────
export default async function handler(req, res) {
  const pathname = req.url.split("?")[0];

  try {
    // Public endpoints
    if (req.method === "GET" && pathname === "/api/site") {
      const [events, notices, settings] = await Promise.all([listEvents(), listNotices(), getSettings()]);
      return json(res, { events, notices, settings, stats: { events: events.length, notices: notices.length } });
    }
    if (req.method === "GET" && pathname === "/api/events")   return json(res, await listEvents());
    if (req.method === "GET" && pathname === "/api/notices")  return json(res, await listNotices());
    if (req.method === "GET" && pathname === "/api/settings") return json(res, await getSettings());

    // Debug endpoint
    if (req.method === "GET" && pathname === "/api/debug") {
      return json(res, {
        ADMIN_USER,
        ADMIN_PASSWORD,
        ADMIN_USER_LEN: ADMIN_USER.length,
        ADMIN_PASSWORD_LEN: ADMIN_PASSWORD.length,
        SUPABASE_URL: process.env.SUPABASE_URL || "not set",
        env_keys: Object.keys(process.env).filter(k => k.startsWith("ADMIN") || k.startsWith("SUPA"))
      });
    }
    // Admin login
    if (req.method === "POST" && pathname === "/api/admin/login") {
      const data = await readBody(req);
      console.log("[LOGIN] body_username:", JSON.stringify(data.username), "body_password:", JSON.stringify(data.password));
      console.log("[LOGIN] ADMIN_USER:", JSON.stringify(ADMIN_USER), "ADMIN_PASSWORD:", JSON.stringify(ADMIN_PASSWORD));
      console.log("[LOGIN] match:", data.username === ADMIN_USER, data.password === ADMIN_PASSWORD);
      if (data.username === ADMIN_USER && data.password === ADMIN_PASSWORD) {
        const token = makeToken(ADMIN_USER);
        return json(res, { ok: true, user: ADMIN_USER }, 200, {
          "Set-Cookie": `yd_admin=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
        });
      }
      return json(res, { error: "Invalid admin username or password", received_user: data.username, expected_user: ADMIN_USER }, 401);
    }

    // Admin logout
    if (req.method === "POST" && pathname === "/api/admin/logout") {
      return json(res, { ok: true }, 200, { "Set-Cookie": "yd_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
    }

    // Admin dashboard
    if (req.method === "GET" && pathname === "/api/dashboard") {
      const authErr = requireAdmin(req);
      if (authErr) return json(res, authErr, 401);
      const [events, notices, settings] = await Promise.all([listEvents(), listNotices(), getSettings()]);
      return json(res, { events, notices, settings, stats: { events: events.length, notices: notices.length } });
    }

    // File upload → Supabase Storage
    if (req.method === "POST" && pathname === "/api/upload") {
      const authErr = requireAdmin(req);
      if (authErr) return json(res, authErr, 401);
      const { files } = await parseMultipart(req);
      const result = {};
      for (const [field, file] of Object.entries(files)) {
        result[field] = await uploadToStorage(file.buffer, file.filename, file.contentType);
      }
      return json(res, { ok: true, files: result }, 201);
    }

    // Add event
    if (req.method === "POST" && pathname === "/api/events") {
      const authErr = requireAdmin(req);
      if (authErr) return json(res, authErr, 401);
      const data = await readBody(req);
      const { error } = await getSupabaseAdmin().from("events").insert({
        title: data.title, teacher: data.teacher,
        category: data.category || "Yoga Session",
        date: data.date, time: data.time, location: data.location,
        fee: data.fee || "Free", description: data.description,
        image_url: data.image_url || "", pdf_url: data.pdf_url || "",
        whatsapp: data.whatsapp || "919999999999"
      });
      if (error) throw error;
      return json(res, { ok: true, events: await listEvents() }, 201);
    }

    // Add notice
    if (req.method === "POST" && pathname === "/api/notices") {
      const authErr = requireAdmin(req);
      if (authErr) return json(res, authErr, 401);
      const data = await readBody(req);
      const { error } = await getSupabaseAdmin().from("notices").insert({
        title: data.title, type: data.type || "Notice",
        published_on: data.published_on, summary: data.summary,
        pdf_url: data.pdf_url || ""
      });
      if (error) throw error;
      return json(res, { ok: true, notices: await listNotices() }, 201);
    }

    // Update settings
    if (req.method === "POST" && pathname === "/api/settings") {
      const authErr = requireAdmin(req);
      if (authErr) return json(res, authErr, 401);
      const data = await readBody(req);
      await Promise.all(
        Object.entries(data).map(([key, value]) =>
          getSupabaseAdmin().from("site_settings").upsert({ key, value }, { onConflict: "key" })
        )
      );
      return json(res, { ok: true, settings: await getSettings() });
    }

    // Delete event
    if (req.method === "DELETE" && pathname.startsWith("/api/events/")) {
      const authErr = requireAdmin(req);
      if (authErr) return json(res, authErr, 401);
      const id = pathname.split("/").pop();
      const { error } = await getSupabaseAdmin().from("events").delete().eq("id", id);
      if (error) throw error;
      return json(res, { ok: true, events: await listEvents() });
    }

    // Delete notice
    if (req.method === "DELETE" && pathname.startsWith("/api/notices/")) {
      const authErr = requireAdmin(req);
      if (authErr) return json(res, authErr, 401);
      const id = pathname.split("/").pop();
      const { error } = await getSupabaseAdmin().from("notices").delete().eq("id", id);
      if (error) throw error;
      return json(res, { ok: true, notices: await listNotices() });
    }

    return json(res, { error: "Not found" }, 404);

  } catch (err) {
    console.error("[API ERROR]", err.message, err.stack);
    return json(res, { error: err.message }, 500);
  }
}
