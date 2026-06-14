import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";

// ─── Configuration ────────────────────────────────────────────────────────────
const ADMIN_USER     = process.env.ADMIN_USER     || "yogisahilprusty@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "yogadham123";
const ADMIN_SECRET   = process.env.ADMIN_SECRET   || "yogadham-secret-fallback";

// ─── Lazy Supabase clients (avoid module-level crash if env vars missing) ─────
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error(`SUPABASE_URL or SUPABASE_ANON_KEY is not set. URL=${url} KEY=${key ? "set" : "missing"}`);
  return createClient(url, key);
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error(`SUPABASE_URL or SUPABASE_SERVICE_KEY is not set. URL=${url} KEY=${key ? "set" : "missing"}`);
  return createClient(url, key);
}

// ─── HMAC Token Auth (stateless — works across Vercel serverless instances) ───
function hmac(value) {
  return createHmac("sha256", ADMIN_SECRET).update(value).digest("hex");
}

function makeToken(username) {
  const payload = `${username}.${Date.now()}`;
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

// ─── Helper functions ─────────────────────────────────────────────────────────
function cookieValue(req, name) {
  const cookie = req.headers["cookie"] || "";
  return cookie
    .split(";")
    .map((item) => item.trim().split("="))
    .find(([key]) => key === name)?.[1] || "";
}

function requireAdmin(req) {
  const token = cookieValue(req, "yd_admin");
  return token && verifyToken(token);
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

// ─── Helper: read body from Node req ─────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { resolve({}); } });
    req.on("error", reject);
  });
}

function json(res, data, status = 200, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extraHeaders });
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
        pathname,
        url: req.url,
        ADMIN_USER,
        ADMIN_PASSWORD,
        SUPABASE_URL_SET: !!process.env.SUPABASE_URL,
        env: Object.keys(process.env).filter(k => k.startsWith("ADMIN") || k.startsWith("SUPA"))
      });
    }

    // Admin login — no Supabase needed
    if (req.method === "POST" && pathname === "/api/admin/login") {
      const data = await readBody(req);
      console.log("[LOGIN] received:", JSON.stringify({ u: data.username }));
      console.log("[LOGIN] ADMIN_USER env:", ADMIN_USER);
      if (data.username === ADMIN_USER && data.password === ADMIN_PASSWORD) {
        const token = makeToken(ADMIN_USER);
        return json(res, { ok: true, user: ADMIN_USER }, 200, {
          "Set-Cookie": `yd_admin=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
        });
      }
      return json(res, { error: "Invalid admin username or password" }, 401);
    }

    // Admin logout
    if (req.method === "POST" && pathname === "/api/admin/logout") {
      return json(res, { ok: true }, 200, { "Set-Cookie": "yd_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
    }

    // Admin dashboard
    if (req.method === "GET" && pathname === "/api/dashboard") {
      const authErr = requireAdmin(req);
      if (authErr) return json(res, { error: "Admin login required" }, 401);
      const [events, notices, settings] = await Promise.all([listEvents(), listNotices(), getSettings()]);
      return json(res, { events, notices, settings, stats: { events: events.length, notices: notices.length } });
    }

    // Add event
    if (req.method === "POST" && pathname === "/api/events") {
      const authErr = requireAdmin(req);
      if (authErr) return json(res, { error: "Admin login required" }, 401);
      const data = await readBody(req);
      await getSupabaseAdmin().from("events").insert({
        title: data.title, teacher: data.teacher,
        category: data.category || "Yoga Session",
        date: data.date, time: data.time, location: data.location,
        fee: data.fee || "Free", description: data.description,
        image_url: data.image_url || "", pdf_url: data.pdf_url || "",
        whatsapp: data.whatsapp || "919999999999"
      });
      return json(res, { ok: true, events: await listEvents() }, 201);
    }

    // Add notice
    if (req.method === "POST" && pathname === "/api/notices") {
      const authErr = requireAdmin(req);
      if (authErr) return json(res, { error: "Admin login required" }, 401);
      const data = await readBody(req);
      await getSupabaseAdmin().from("notices").insert({
        title: data.title, type: data.type || "Notice",
        published_on: data.published_on, summary: data.summary,
        pdf_url: data.pdf_url || ""
      });
      return json(res, { ok: true, notices: await listNotices() }, 201);
    }

    // Update settings
    if (req.method === "POST" && pathname === "/api/settings") {
      const authErr = requireAdmin(req);
      if (authErr) return json(res, { error: "Admin login required" }, 401);
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
      if (authErr) return json(res, { error: "Admin login required" }, 401);
      const id = pathname.split("/").pop();
      await getSupabaseAdmin().from("events").delete().eq("id", id);
      return json(res, { ok: true, events: await listEvents() });
    }

    // Delete notice
    if (req.method === "DELETE" && pathname.startsWith("/api/notices/")) {
      const authErr = requireAdmin(req);
      if (authErr) return json(res, { error: "Admin login required" }, 401);
      const id = pathname.split("/").pop();
      await getSupabaseAdmin().from("notices").delete().eq("id", id);
      return json(res, { ok: true, notices: await listNotices() });
    }

    return json(res, { error: "Not found" }, 404);

  } catch (err) {
    console.error("[API ERROR]", err.message, err.stack);
    return json(res, { error: err.message }, 500);
  }
}
