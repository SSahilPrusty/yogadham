import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const ADMIN_USER = process.env.ADMIN_USER || "yogisahilprusty@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "yogadham123";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-this-secret";

// Public client — respects RLS
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Admin client — bypasses RLS for writes
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function hmac(value) {
  return createHmac("sha256", ADMIN_SECRET).update(value).digest("hex");
}

function makeToken(username) {
  const payload = `${username}.${Date.now()}`;
  return `${payload}.${hmac(payload)}`;
}

function getCookie(req, name) {
  const cookie = req.headers.get?.("cookie") || req.headers["cookie"] || "";
  return cookie
    .split(";")
    .map((item) => item.trim().split("="))
    .find(([key]) => key === name)?.[1] || "";
}

function isAdmin(req) {
  const token = getCookie(req, "yd_admin");
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const age = Date.now() - Number(parts[1]);
  if (!Number.isFinite(age) || age > 8 * 60 * 60 * 1000) return false;
  const expected = Buffer.from(hmac(payload));
  const actual = Buffer.from(parts[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function requireAdmin(req) {
  if (isAdmin(req)) return null;
  return Response.json({ error: "Admin login required" }, { status: 401 });
}

// ─── Data helpers ──────────────────────────────────────────────────────────────

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
    const { data, error } = await supabaseAdmin.from("site_settings").select("key, value");
    const settings = {};
    for (const row of data || []) settings[row.key] = row.value;
    if (!settings.hero_image_url) {
      settings.hero_image_url =
        "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1800&q=85";
    }
    return settings;
  } catch {
    return {
      logo_url: "",
      hero_image_url:
        "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1800&q=85"
    };
  }
}

// ─── Multipart parser ─────────────────────────────────────────────────────────
// Parses multipart/form-data from a Fetch Request object.
async function parseMultipart(req) {
  const contentType = req.headers.get("content-type") || "";
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) return { fields: {}, files: {} };

  const arrayBuffer = await req.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fields = {};
  const files = {};

  const sep = Buffer.from(`--${boundary}`);
  let pos = 0;

  while (pos < buffer.length) {
    // Find next boundary
    const boundaryIdx = buffer.indexOf(sep, pos);
    if (boundaryIdx === -1) break;
    pos = boundaryIdx + sep.length;

    // Check for final boundary (--)
    if (buffer[pos] === 0x2d && buffer[pos + 1] === 0x2d) break;

    // Skip CRLF after boundary
    if (buffer[pos] === 0x0d && buffer[pos + 1] === 0x0a) pos += 2;

    // Find header/body separator \r\n\r\n
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), pos);
    if (headerEnd === -1) break;

    const rawHeaders = buffer.slice(pos, headerEnd).toString("utf8");
    pos = headerEnd + 4;

    // Find next boundary to get body length
    const nextBoundary = buffer.indexOf(sep, pos);
    const bodyEnd = nextBoundary === -1 ? buffer.length : nextBoundary - 2; // -2 for trailing \r\n
    const body = buffer.slice(pos, bodyEnd);
    pos = nextBoundary === -1 ? buffer.length : nextBoundary;

    const name = rawHeaders.match(/name="([^"]+)"/)?.[1];
    const filename = rawHeaders.match(/filename="([^"]*)"/)?.[1];
    if (!name) continue;

    if (filename && filename.trim()) {
      files[name] = { filename, data: body, contentType: rawHeaders.match(/Content-Type:\s*(.+)/i)?.[1]?.trim() || "application/octet-stream" };
    } else {
      fields[name] = body.toString("utf8");
    }
  }

  return { fields, files };
}

// ─── File upload via Supabase Storage ────────────────────────────────────────
async function uploadToSupabase(file) {
  const ext = file.filename.split(".").pop().toLowerCase();
  const filename = `${Date.now()}-${randomUUID()}.${ext}`;
  const bucket = "uploads";

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(filename, file.data, {
      contentType: file.contentType,
      upsert: false
    });

  if (error) throw error;

  const { data: urlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(filename);
  return urlData.publicUrl;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  try {
    // Public endpoints
    if (req.method === "GET" && pathname === "/api/site") {
      const [events, notices, settings] = await Promise.all([listEvents(), listNotices(), getSettings()]);
      return Response.json({ events, notices, settings, stats: { events: events.length, notices: notices.length } });
    }
    if (req.method === "GET" && pathname === "/api/events") return Response.json(await listEvents());
    if (req.method === "GET" && pathname === "/api/notices") return Response.json(await listNotices());
    if (req.method === "GET" && pathname === "/api/settings") return Response.json(await getSettings());

    // Auth
    if (req.method === "POST" && pathname === "/api/admin/login") {
      const { username, password } = await req.json();
      if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
        return Response.json(
          { ok: true, user: ADMIN_USER },
          { status: 200, headers: { "Set-Cookie": `yd_admin=${makeToken(ADMIN_USER)}; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=28800` } }
        );
      }
      return Response.json({ error: "Invalid admin username or password" }, { status: 401 });
    }

    if (req.method === "POST" && pathname === "/api/admin/logout") {
      return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": "yd_admin=; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=0" } });
    }

    // Admin dashboard
    if (req.method === "GET" && pathname === "/api/dashboard") {
      const blocked = requireAdmin(req);
      if (blocked) return blocked;
      const [events, notices, settings] = await Promise.all([listEvents(), listNotices(), getSettings()]);
      return Response.json({ events, notices, settings, stats: { events: events.length, notices: notices.length } });
    }

    // Upload file (uses Supabase Storage)
    if (req.method === "POST" && pathname === "/api/upload") {
      const blocked = requireAdmin(req);
      if (blocked) return blocked;
      const { files } = await parseMultipart(req);
      const result = {};
      for (const [key, file] of Object.entries(files)) {
        result[key] = await uploadToSupabase(file);
      }
      return Response.json({ ok: true, files: result }, { status: 201 });
    }

    // Add event
    if (req.method === "POST" && pathname === "/api/events") {
      const blocked = requireAdmin(req);
      if (blocked) return blocked;
      const data = await req.json();
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
      return Response.json({ ok: true, events: await listEvents() }, { status: 201 });
    }

    // Add notice
    if (req.method === "POST" && pathname === "/api/notices") {
      const blocked = requireAdmin(req);
      if (blocked) return blocked;
      const data = await req.json();
      const { error } = await supabaseAdmin.from("notices").insert({
        title: data.title,
        type: data.type || "Notice",
        published_on: data.published_on,
        summary: data.summary,
        pdf_url: data.pdf_url || ""
      });
      return Response.json({ ok: true, notices: await listNotices() }, { status: 201 });
    }

    // Update settings
    if (req.method === "POST" && pathname === "/api/settings") {
      const blocked = requireAdmin(req);
      if (blocked) return blocked;
      const data = await req.json();
      const updates = [];
      for (const [key, value] of Object.entries(data)) {
        updates.push(supabaseAdmin.from("site_settings").upsert({ key, value }, { onConflict: "key" }));
      }
      const results = await Promise.all(updates);
      for (const { error } of results) if (error) throw error;
      return Response.json({ ok: true, settings: await getSettings() });
    }

    // Delete event
    if (req.method === "DELETE" && pathname.startsWith("/api/events/")) {
      const blocked = requireAdmin(req);
      if (blocked) return blocked;
      const id = pathname.split("/").pop();
      const { error } = await supabaseAdmin.from("events").delete().eq("id", id);
      return Response.json({ ok: true, events: await listEvents() });
    }

    // Delete notice
    if (req.method === "DELETE" && pathname.startsWith("/api/notices/")) {
      const blocked = requireAdmin(req);
      if (blocked) return blocked;
      const id = pathname.split("/").pop();
      const { error } = await supabaseAdmin.from("notices").delete().eq("id", id);
      return Response.json({ ok: true, notices: await listNotices() });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
