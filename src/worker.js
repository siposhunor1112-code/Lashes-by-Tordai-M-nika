// A weboldal „szerver” része (Cloudflare Worker). A public/ mappa fájljait a Cloudflare magától kiszolgálja,
// ide csak a /api/... kérések jutnak el. A foglalásokat egyetlen Durable Object (Naptar) tárolja SQLite-ban –
// mivel minden foglalás ugyanazon az egy példányon megy át, ugyanarra az időpontra két ember nem foglalhat.
//
// Titkok / változók (Cloudflare → Workers → Settings → Variables and Secrets):
//   ADMIN_PASSWORD   kötelező az /admin oldalhoz (Secret)
//   NTFY_TOPIC       nem kötelező: értesítés telefonra minden új foglalásról és lemondásról (ntfy.sh)
//   RESEND_API_KEY + MAIL_FROM   nem kötelező: visszaigazoló e-mail a vendégnek (resend.com)
//   SALON_EMAIL      nem kötelező: ide is megy másolat minden foglalásról (RESEND_API_KEY kell hozzá)

import { DurableObject } from "cloudflare:workers";
import { SALON, SERVICES } from "./config.js";
import { addDays, daySlots, isDate, isTime, nowLocal, openingHours, toHHMM, toMin, weekday } from "./schedule.js";

const serviceById = (id) => SERVICES.find((s) => s.id === id);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
const fail = (status, message, extra = {}) => json({ error: message, ...extra }, status);

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const clean = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const cleanNote = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const phoneDigits = (p) => p.replace(/\D/g, "").replace(/^06/, "36");

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = () => {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return "TM-" + [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
};
const randomToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}

// A Durable Object a hibát értékként adja vissza (RPC-n át az osztály elveszne), a Worker pedig újra eldobja
const guard = (fn) => {
  try {
    return { ok: fn() };
  } catch (e) {
    if (e instanceof HttpError) return { err: { status: e.status, message: e.message, extra: e.extra } };
    throw e;
  }
};
const unwrap = async (p) => {
  const r = await p;
  if (r.err) throw new HttpError(r.err.status, r.err.message, r.err.extra);
  return r.ok;
};

const HU_DATE = (date) =>
  new Intl.DateTimeFormat("hu-HU", { timeZone: "UTC", month: "long", day: "numeric", weekday: "long" }).format(new Date(date + "T00:00:00Z"));

// ---------------------------------------------------------------------------------------------------------------
// A naptár: egyetlen példány, minden foglalás ezen megy át

export class Naptar extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        token TEXT NOT NULL,
        service TEXT NOT NULL,
        date TEXT NOT NULL,
        start INTEGER NOT NULL,
        end INTEGER NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        first_visit INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'web',
        status TEXT NOT NULL DEFAULT 'aktiv',
        created_at TEXT NOT NULL,
        cancelled_at TEXT
      );
      CREATE INDEX IF NOT EXISTS bookings_date ON bookings(date, status);
      CREATE TABLE IF NOT EXISTS blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        start INTEGER NOT NULL,
        end INTEGER NOT NULL,
        reason TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS blocks_date ON blocks(date);
    `);
    this.hits = new Map(); // egyszerű védelem a tömeges foglalás ellen (IP → időbélyegek)
  }

  dayData(from, to) {
    const bookings = this.sql.exec(`SELECT date, start, end FROM bookings WHERE status = 'aktiv' AND date BETWEEN ? AND ?`, from, to).toArray();
    const blocks = this.sql.exec(`SELECT date, start, end, reason FROM blocks WHERE date BETWEEN ? AND ?`, from, to).toArray();
    const by = (list, date) => list.filter((x) => x.date === date);
    return (date) => ({ bookings: by(bookings, date), blocks: by(blocks, date) });
  }

  availability(serviceId, from, to) {
    const service = serviceById(serviceId);
    const now = nowLocal();
    const get = this.dayData(from, to);
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const { bookings, blocks } = get(d);
      const r = daySlots(d, service.duration, bookings, blocks, now);
      days.push({
        date: d,
        state: r.state,
        reason: r.reason || null,
        free: r.slots.filter((s) => s.status === "szabad").length,
        total: r.slots.length,
      });
    }
    return days;
  }

  slots(serviceId, date) {
    const service = serviceById(serviceId);
    const { bookings, blocks } = this.dayData(date, date)(date);
    const r = daySlots(date, service.duration, bookings, blocks);
    const hours = openingHours(date);
    return { date, ...r, open: hours ? toHHMM(hours.open) : null, close: hours ? toHHMM(hours.close) : null };
  }

  // Legközelebbi szabad időpont bármelyik (vagy a megadott) szolgáltatáshoz – a nyitókép élő jelzéséhez
  nextFree(serviceId) {
    const service = serviceById(serviceId) || SERVICES.reduce((a, b) => (a.duration <= b.duration ? a : b));
    const now = nowLocal();
    const to = addDays(now.date, SALON.horizonDays);
    const get = this.dayData(now.date, to);
    for (let d = now.date; d <= to; d = addDays(d, 1)) {
      const { bookings, blocks } = get(d);
      const slot = daySlots(d, service.duration, bookings, blocks, now).slots.find((s) => s.status === "szabad");
      if (slot) return { date: d, time: slot.time, service: service.id };
    }
    return null;
  }

  rateLimited(ip) {
    const now = Date.now();
    const list = (this.hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    list.push(now);
    this.hits.set(ip, list);
    if (this.hits.size > 5000) this.hits.clear();
    return list.length > 6;
  }

  create(input, opts) {
    return guard(() => this.createInner(input, opts || {}));
  }

  createInner(input, { admin = false, ip = "" }) {
    if (!admin && ip && this.rateLimited(ip)) throw new HttpError(429, "Túl sok próbálkozás. Kérlek, próbáld újra pár perc múlva, vagy hívj telefonon.");
    const service = serviceById(input.service);
    const start = toMin(input.time);
    const end = start + service.duration;
    const now = nowLocal();

    const { bookings, blocks } = this.dayData(input.date, input.date)(input.date);
    if (admin) {
      const clash = bookings.find((b) => start < b.end && end > b.start);
      if (clash && !input.force) throw new HttpError(409, `Ütközik egy másik foglalással (${toHHMM(clash.start)}–${toHHMM(clash.end)}).`, { clash: true });
    } else {
      const slot = daySlots(input.date, service.duration, bookings, blocks, now).slots.find((s) => s.time === input.time);
      if (!slot || slot.status !== "szabad")
        throw new HttpError(409, "Ezt az időpontot közben sajnos lefoglalták. Válassz egy másikat!", { taken: true });
      const digits = phoneDigits(input.phone);
      const active = this.sql
        .exec(`SELECT phone FROM bookings WHERE status = 'aktiv' AND date >= ?`, now.date)
        .toArray()
        .filter((b) => phoneDigits(b.phone) === digits).length;
      if (active >= SALON.maxActivePerPhone)
        throw new HttpError(409, `Ehhez a telefonszámhoz már ${active} jövőbeli foglalás tartozik. Újabbat telefonon tudsz egyeztetni.`);
    }

    let code;
    do code = randomCode();
    while (this.sql.exec(`SELECT 1 FROM bookings WHERE code = ?`, code).toArray().length);
    const token = randomToken();
    this.sql.exec(
      `INSERT INTO bookings (code, token, service, date, start, end, name, phone, email, note, first_visit, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code, token, service.id, input.date, start, end, input.name, input.phone, input.email, input.note,
      input.firstVisit ? 1 : 0, admin ? "admin" : "web", new Date().toISOString(),
    );
    // Adattakarékosság: az egy évnél régebbi foglalások törlődnek
    this.sql.exec(`DELETE FROM bookings WHERE date < ?`, addDays(now.date, -365));
    this.sql.exec(`DELETE FROM blocks WHERE date < ?`, addDays(now.date, -30));
    return this.publicBooking(this.find(code));
  }

  find(code) {
    return this.sql.exec(`SELECT * FROM bookings WHERE code = ?`, code).toArray()[0] || null;
  }

  publicBooking(b) {
    const service = serviceById(b.service);
    return {
      code: b.code,
      token: b.token,
      service: b.service,
      serviceName: service ? service.name : b.service,
      price: service ? service.price : null,
      date: b.date,
      time: toHHMM(b.start),
      end: toHHMM(b.end),
      name: b.name,
      status: b.status,
    };
  }

  lookup(code, token) {
    const b = this.find(code);
    if (!b || b.token !== token) return null;
    return { ...this.publicBooking(b), cancellable: this.cancellable(b) };
  }

  cancellable(b) {
    if (b.status !== "aktiv") return false;
    const now = nowLocal();
    const dayDiff = (Date.parse(b.date) - Date.parse(now.date)) / 86400000;
    return dayDiff * 1440 + b.start - now.min >= SALON.cancelHours * 60;
  }

  cancelByGuest(code, token) {
    return guard(() => this.cancelByGuestInner(code, token));
  }

  cancelByGuestInner(code, token) {
    const b = this.find(code);
    if (!b || b.token !== token) throw new HttpError(404, "Nem található ilyen foglalás.");
    if (b.status !== "aktiv") throw new HttpError(409, "Ezt a foglalást már lemondták.");
    if (!this.cancellable(b))
      throw new HttpError(409, `Az időpont előtt ${SALON.cancelHours} órán belül már csak telefonon lehet lemondani.`);
    this.sql.exec(`UPDATE bookings SET status = 'lemondva', cancelled_at = ? WHERE id = ?`, new Date().toISOString(), b.id);
    return this.publicBooking(this.find(code));
  }

  // --- admin ---

  adminList(from, to) {
    const bookings = this.sql
      .exec(`SELECT * FROM bookings WHERE date BETWEEN ? AND ? ORDER BY date, start`, from, to)
      .toArray()
      .map((b) => ({
        ...this.publicBooking(b),
        id: b.id, phone: b.phone, email: b.email, note: b.note, firstVisit: !!b.first_visit, source: b.source,
        createdAt: b.created_at, cancelledAt: b.cancelled_at, token: undefined,
      }));
    const blocks = this.sql
      .exec(`SELECT * FROM blocks WHERE date BETWEEN ? AND ? ORDER BY date, start`, from, to)
      .toArray()
      .map((b) => ({ id: b.id, date: b.date, start: toHHMM(b.start), end: b.end >= 1440 ? "24:00" : toHHMM(b.end), reason: b.reason }));
    return { bookings, blocks };
  }

  adminCancel(id) {
    return guard(() => this.adminCancelInner(id));
  }

  adminCancelInner(id) {
    const b = this.sql.exec(`SELECT * FROM bookings WHERE id = ?`, id).toArray()[0];
    if (!b) throw new HttpError(404, "Nincs ilyen foglalás.");
    if (b.status === "aktiv") this.sql.exec(`UPDATE bookings SET status = 'lemondva', cancelled_at = ? WHERE id = ?`, new Date().toISOString(), id);
    return this.publicBooking(this.find(b.code));
  }

  adminBlock({ date, start, end, reason }) {
    this.sql.exec(`INSERT INTO blocks (date, start, end, reason) VALUES (?, ?, ?, ?)`, date, start, end, reason);
    return { ok: true };
  }

  adminUnblock(id) {
    this.sql.exec(`DELETE FROM blocks WHERE id = ?`, id);
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Értesítések (mind opcionális – ha nincs beállítva, egyszerűen kimarad)

async function notify(env, title, lines) {
  const jobs = [];
  if (env.NTFY_TOPIC) {
    jobs.push(
      fetch(`https://ntfy.sh/${encodeURIComponent(env.NTFY_TOPIC)}`, {
        method: "POST",
        headers: { Title: encodeURIComponent(title), Tags: "calendar", "Content-Type": "text/plain; charset=utf-8" },
        body: lines.join("\n"),
      }),
    );
  }
  if (env.RESEND_API_KEY && env.MAIL_FROM && env.SALON_EMAIL) {
    jobs.push(sendMail(env, env.SALON_EMAIL, title, lines.map(esc).join("<br>")));
  }
  await Promise.allSettled(jobs);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function sendMail(env, to, subject, html) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html }),
  });
}

function guestMail(env, b, origin) {
  const link = `${origin}/lemondas?kod=${encodeURIComponent(b.code)}&t=${encodeURIComponent(b.token)}`;
  const html = `
    <div style="font-family:Georgia,serif;max-width:520px;margin:auto;color:#231d19;line-height:1.6">
      <p style="letter-spacing:.2em;text-transform:uppercase;font:600 11px Arial,sans-serif;color:#8a7260">Lashes by Tordai Mónika</p>
      <h1 style="font-weight:400;font-size:30px;margin:8px 0 20px">Várlak szeretettel, ${esc(b.name.split(" ").slice(-1)[0])}!</h1>
      <p style="font:15px/1.7 Arial,sans-serif">
        <b>${esc(b.serviceName)}</b><br>
        ${esc(HU_DATE(b.date))}, ${esc(b.time)}–${esc(b.end)}<br>
        Foglalási kód: <b>${esc(b.code)}</b>
      </p>
      <p style="font:14px/1.7 Arial,sans-serif;color:#5d534b">Kérlek, smink nélkül, tiszta pillákkal érkezz. Ha mégsem jó az időpont,
        ${SALON.cancelHours} órával előtte még itt lemondhatod:<br><a href="${esc(link)}" style="color:#8a6a52">${esc(link)}</a></p>
    </div>`;
  return sendMail(env, b.email, `Időpontod: ${HU_DATE(b.date)}, ${b.time}`, html);
}

// ---------------------------------------------------------------------------------------------------------------
// Bemenet-ellenőrzés

function validateBooking(body, { admin = false } = {}) {
  if (!body || typeof body !== "object") throw new HttpError(400, "Hibás kérés.");
  const service = serviceById(body.service);
  if (!service) throw new HttpError(400, "Válassz szolgáltatást!");
  if (!isDate(body.date) || !isTime(body.time)) throw new HttpError(400, "Válassz napot és időpontot!");
  const name = clean(body.name, 80);
  const phone = clean(body.phone, 30);
  const email = clean(body.email, 120).toLowerCase();
  const note = cleanNote(body.note, 600);
  if (name.length < 2) throw new HttpError(400, "Kérlek, add meg a neved!", { field: "name" });
  if (phoneDigits(phone).length < 9 || !/^[+\d\s()\/-]+$/.test(phone)) throw new HttpError(400, "Kérlek, adj meg egy érvényes telefonszámot!", { field: "phone" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, "Ez az e-mail-cím nem tűnik érvényesnek.", { field: "email" });
  if (!admin && body.consent !== true) throw new HttpError(400, "A foglaláshoz el kell fogadnod a feltételeket.", { field: "consent" });
  return { service: service.id, date: body.date, time: body.time, name, phone, email, note, firstVisit: !!body.firstVisit, force: admin && !!body.force };
}

// ---------------------------------------------------------------------------------------------------------------
// Útvonalak

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;
  const cal = env.NAPTAR.get(env.NAPTAR.idFromName("naptar"));
  const q = (k) => url.searchParams.get(k);
  const readJson = async () => {
    if (!(request.headers.get("content-type") || "").includes("application/json")) throw new HttpError(415, "JSON kérés kell.");
    const text = await request.text();
    if (text.length > 8000) throw new HttpError(413, "Túl nagy kérés.");
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(400, "Hibás kérés.");
    }
  };
  // Csak a saját oldalunkról lehet írni (CSRF ellen)
  if (method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) throw new HttpError(403, "Tiltott kérés.");
  }

  if (method === "GET" && path === "/api/config") {
    const now = nowLocal();
    const th = openingHours(now.date);
    return json({
      todayHours: th ? { open: toHHMM(th.open), close: toHHMM(th.close) } : null,
      salon: {
        name: SALON.name, hours: SALON.hours, slotStep: SALON.slotStep, horizonDays: SALON.horizonDays,
        cancelHours: SALON.cancelHours, minLeadMinutes: SALON.minLeadMinutes, timezone: SALON.timezone,
      },
      services: SERVICES,
      today: now.date,
      nowMin: now.min,
    });
  }

  if (method === "GET" && path === "/api/next") {
    return json({ next: await cal.nextFree(q("service")) });
  }

  if (method === "GET" && path === "/api/availability") {
    const service = serviceById(q("service"));
    const from = q("from"), to = q("to");
    if (!service) throw new HttpError(400, "Ismeretlen szolgáltatás.");
    if (!isDate(from) || !isDate(to) || to < from || Date.parse(to) - Date.parse(from) > 62 * 86400000) throw new HttpError(400, "Hibás időszak.");
    return json({ service: service.id, days: await cal.availability(service.id, from, to), today: nowLocal().date });
  }

  if (method === "GET" && path === "/api/slots") {
    const service = serviceById(q("service"));
    if (!service) throw new HttpError(400, "Ismeretlen szolgáltatás.");
    if (!isDate(q("date"))) throw new HttpError(400, "Hibás dátum.");
    return json(await cal.slots(service.id, q("date")));
  }

  if (method === "POST" && path === "/api/bookings") {
    const body = await readJson();
    if (body.website) throw new HttpError(400, "Hibás kérés."); // csapda a robotoknak
    const input = validateBooking(body);
    const booking = await unwrap(cal.create(input, { ip: request.headers.get("cf-connecting-ip") || "" }));
    ctx.waitUntil(
      Promise.allSettled([
        notify(env, `Új foglalás: ${HU_DATE(booking.date)} ${booking.time}`, [
          `${booking.serviceName} (${booking.time}–${booking.end})`,
          `${input.name} · ${input.phone}${input.email ? " · " + input.email : ""}`,
          input.firstVisit ? "Első alkalom" : "",
          input.note ? `Megjegyzés: ${input.note}` : "",
          `Kód: ${booking.code}`,
        ].filter(Boolean)),
        input.email && env.RESEND_API_KEY && env.MAIL_FROM ? guestMail(env, { ...booking, email: input.email }, url.origin) : null,
      ]),
    );
    return json({ booking }, 201);
  }

  const m = path.match(/^\/api\/bookings\/(TM-[A-Z0-9]{6})(\/cancel)?$/);
  if (m) {
    const code = m[1];
    if (method === "GET" && !m[2]) {
      const b = await cal.lookup(code, q("t") || "");
      return b ? json({ booking: b }) : fail(404, "Nem található ilyen foglalás.");
    }
    if (method === "POST" && m[2]) {
      const body = await readJson();
      const b = await unwrap(cal.cancelByGuest(code, String(body.token || "")));
      ctx.waitUntil(notify(env, `Lemondás: ${HU_DATE(b.date)} ${b.time}`, [`${b.serviceName}`, `${b.name}`, `Kód: ${b.code}`]));
      return json({ booking: b });
    }
  }

  if (path.startsWith("/api/admin/")) {
    if (!env.ADMIN_PASSWORD) throw new HttpError(503, "Az admin felület nincs bekapcsolva: állíts be ADMIN_PASSWORD titkot a Cloudflare-ben.");
    const auth = request.headers.get("authorization") || "";
    const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!given || !(await sameSecret(given, env.ADMIN_PASSWORD))) {
      await new Promise((r) => setTimeout(r, 600));
      throw new HttpError(401, "Hibás jelszó.");
    }

    if (method === "GET" && path === "/api/admin/overview") {
      const from = isDate(q("from")) ? q("from") : nowLocal().date;
      const to = isDate(q("to")) ? q("to") : addDays(from, 30);
      if (to < from || Date.parse(to) - Date.parse(from) > 400 * 86400000) throw new HttpError(400, "Hibás időszak.");
      return json(await cal.adminList(from, to));
    }
    if (method === "POST" && path === "/api/admin/bookings") {
      const input = validateBooking(await readJson(), { admin: true });
      return json({ booking: await unwrap(cal.create(input, { admin: true })) }, 201);
    }
    const c = path.match(/^\/api\/admin\/bookings\/(\d+)\/cancel$/);
    if (method === "POST" && c) return json({ booking: await unwrap(cal.adminCancel(Number(c[1]))) });

    if (method === "POST" && path === "/api/admin/blocks") {
      const body = await readJson();
      if (!isDate(body.date)) throw new HttpError(400, "Hibás dátum.");
      const until = body.until && isDate(body.until) ? body.until : body.date;
      if (until < body.date || Date.parse(until) - Date.parse(body.date) > 120 * 86400000) throw new HttpError(400, "Hibás időszak.");
      const whole = !body.start && !body.end;
      if (!whole && (!isTime(body.start) || !isTime(body.end) || toMin(body.end) <= toMin(body.start)))
        throw new HttpError(400, "Hibás időtartam.");
      const reason = clean(body.reason, 80);
      for (let d = body.date; d <= until; d = addDays(d, 1)) {
        await cal.adminBlock({ date: d, start: whole ? 0 : toMin(body.start), end: whole ? 1440 : toMin(body.end), reason });
      }
      return json({ ok: true }, 201);
    }
    const u = path.match(/^\/api\/admin\/blocks\/(\d+)$/);
    if (method === "DELETE" && u) return json(await cal.adminUnblock(Number(u[1])));
  }

  return fail(404, "Nincs ilyen cím.");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, ctx);
      } catch (e) {
        if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
        console.error(e);
        return fail(500, "Váratlan hiba történt. Kérlek, próbáld újra, vagy hívj telefonon.");
      }
    }
    return env.ASSETS.fetch(request);
  },
};
