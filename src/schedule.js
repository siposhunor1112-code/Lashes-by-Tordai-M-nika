// Naptár-számítások: nyitvatartás, ünnepnapok, szabad kezdési időpontok.
// Minden dátum "ÉÉÉÉ-HH-NN" szöveg, minden időpont éjfél óta eltelt perc, budapesti idő szerint.

import { SALON } from "./config.js";

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const asUTC = (date) => new Date(date + "T00:00:00Z");
const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (date, n) => {
  const d = asUTC(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
export const weekday = (date) => asUTC(date).getUTCDay();
export const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(asUTC(s)) === s;
export const isTime = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

// A mostani budapesti dátum és idő
export function nowLocal(tz = SALON.timezone, at = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

// Magyar munkaszüneti napok (a húsvéthoz kötötteket is kiszámolja)
const holidayCache = new Map();
export function holidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  // húsvétvasárnap (Meeus/Jones/Butcher)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const map = new Map([
    [`${year}-01-01`, "Újév"],
    [`${year}-03-15`, "Nemzeti ünnep"],
    [addDays(easter, -2), "Nagypéntek"],
    [easter, "Húsvét"],
    [addDays(easter, 1), "Húsvéthétfő"],
    [`${year}-05-01`, "A munka ünnepe"],
    [addDays(easter, 49), "Pünkösd"],
    [addDays(easter, 50), "Pünkösdhétfő"],
    [`${year}-08-20`, "Államalapítás ünnepe"],
    [`${year}-10-23`, "Nemzeti ünnep"],
    [`${year}-11-01`, "Mindenszentek"],
    [`${year}-12-24`, "Szenteste"],
    [`${year}-12-25`, "Karácsony"],
    [`${year}-12-26`, "Karácsony"],
  ]);
  holidayCache.set(year, map);
  return map;
}

export function holidayName(date) {
  return SALON.closedOnHolidays ? holidays(Number(date.slice(0, 4))).get(date) || null : null;
}

export function openingHours(date) {
  if (holidayName(date)) return null;
  const h = SALON.hours[weekday(date)];
  return h ? { open: toMin(h[0]), close: toMin(h[1]) } : null;
}

/**
 * Egy nap összes lehetséges kezdési időpontja egy adott szolgáltatáshoz, állapottal együtt.
 * bookings: [{start, end}] az aznapi aktív foglalások (a szünetet a függvény teszi hozzá)
 * blocks:   [{start, end}] az aznapi letiltott sávok (pl. szabadság, ebéd)
 * Visszaad: { state, reason?, slots: [{ time, status: "szabad" | "foglalt" | "elmult" }] }
 */
export function daySlots(date, duration, bookings, blocks, now = nowLocal()) {
  const horizon = addDays(now.date, SALON.horizonDays);
  if (date < now.date) return { state: "elmult", slots: [] };
  if (date > horizon) return { state: "tavoli", slots: [] };
  const holiday = holidayName(date);
  if (holiday) return { state: "unnep", reason: holiday, slots: [] };
  const hours = openingHours(date);
  if (!hours) return { state: "zarva", slots: [] };
  if (blocks.some((b) => b.start <= hours.open && b.end >= hours.close)) {
    const reason = blocks.find((b) => b.start <= hours.open && b.end >= hours.close).reason;
    return { state: "szabadnap", reason: reason || null, slots: [] };
  }

  const earliest = date === now.date ? now.min + SALON.minLeadMinutes : -1;
  const slots = [];
  for (let s = hours.open; s + duration <= hours.close; s += SALON.slotStep) {
    let status = "szabad";
    if (s < earliest) status = "elmult";
    else if (
      bookings.some((b) => s < b.end + SALON.buffer && s + duration + SALON.buffer > b.start) ||
      blocks.some((b) => s < b.end && s + duration > b.start)
    ) status = "foglalt";
    slots.push({ time: toHHMM(s), status });
  }
  const free = slots.filter((x) => x.status === "szabad").length;
  const state = free ? "nyitva" : slots.some((x) => x.status === "foglalt") ? "betelt" : "elmult";
  return { state, slots };
}
