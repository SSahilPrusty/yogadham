import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";

const ADMIN_USER = process.env.ADMIN_USER || "yogisahilprusty@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "yogadham123";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-this-secret-on-netlify";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

function response(payload, status = 200, headers = {}) {
  return Response.json(payload, { status, headers });
}

function hmac(value) {
  return createHmac("sha256", ADMIN_SECRET).update(value).digest("hex");
}

function makeToken(username) {
  const payload = `${username}.${Date.now()}`;
  return `${payload}.${hmac(payload)}`;
}

function getCookie(req, name) {
  const cookie = req.headers.get("cookie") || "";
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
  return response({ error: "Admin login required" }, 401);
}

async function siteData() {
  const { data: events } = await supabaseAdmin
    .from("events")
    .select("*")
    .order("date", { ascending: true })
    .order("id", { ascending: false });
  
  const { data: notices } = await supabaseAdmin
    .from("notices")
    .select("*")
    .order("published_on", { ascending: false })
    .order("id", { ascending: false });

  return {
    events: events || [],
    notices: notices || [],
    stats: { events: (events || []).length, notices: (notices || []).length }
  };
}

export default async function handler(req) {
  const url = new URL(req.url);
  const pathname = url.pathname.replace("/.netlify/functions/api", "/api");

  try {
    if (req.method === "GET" && pathname === "/api/site") return response(await siteData());
    if (req.method === "GET" && pathname === "/api/events") return response((await siteData()).events);
    if (req.method === "GET" && pathname === "/api/notices") return response((await siteData()).notices);

    if (req.method === "POST" && pathname === "/api/admin/login") {
      const { username, password } = await req.json();
      if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
        return response(
          { ok: true, user: ADMIN_USER },
          200,
          { "Set-Cookie": `yd_admin=${makeToken(ADMIN_USER)}; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=28800` }
        );
      }
      return response({ error: "Invalid admin username or password" }, 401);
    }

    if (req.method === "POST" && pathname === "/api/admin/logout") {
      return response({ ok: true }, 200, { "Set-Cookie": "yd_admin=; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=0" });
    }

    if (req.method === "GET" && pathname === "/api/dashboard") {
      const blocked = requireAdmin(req);
      if (blocked) return blocked;
      return response(await siteData());
    }

    if (req.method === "POST" && pathname === "/api/events") {
      const blocked = requireAdmin(req);
      if (blocked) return blocked;
      const data = await req.json();
      const { error } = await supabaseAdmin.from("events").insert({
        title: data.title,
        teacher: data.teacher,
        category: data.category || "Session",
        date: data.date,
        time: data.time,
        location: data.location,
        fee: data.fee || "Free",
        description: data.description,
        image_url: data.image_url || "",
        pdf_url: data.pdf_url || "",
        whatsapp: data.whatsapp || "919999999999"
      });
      if (error) throw error;
      return response({ ok: true }, 201);
    }

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
      if (error) throw error;
      return response({ ok: true }, 201);
    }

    if (req.method === "DELETE" && pathname.startsWith("/api/events/")) {
      const blocked = requireAdmin(req);
      if (blocked) return blocked;
      const id = pathname.split("/").pop();
      const { error } = await supabaseAdmin.from("events").delete().eq("id", id);
      if (error) throw error;
      return response({ ok: true });
    }

    if (req.method === "DELETE" && pathname.startsWith("/api/notices/")) {
      const blocked = requireAdmin(req);
      if (blocked) return blocked;
      const id = pathname.split("/").pop();
      const { error } = await supabaseAdmin.from("notices").delete().eq("id", id);
      if (error) throw error;
      return response({ ok: true });
    }

    return response({ error: "Not found" }, 404);
  } catch (err) {
    console.error(err);
    return response({ error: err.message }, 500);
  }
}
