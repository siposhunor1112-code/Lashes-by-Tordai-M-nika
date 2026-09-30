// A naptár-számítások tesztjei: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { daySlots, holidays, nowLocal, addDays, isDate } from "../src/schedule.js";

const now = { date: "2026-09-30", min: 8 * 60 }; // szerda reggel 8:00

test("ünnepnapok: húsvét és pünkösd 2026-ban", () => {
  const h = holidays(2026);
  assert.equal(h.get("2026-04-05"), "Húsvét");
  assert.equal(h.get("2026-04-06"), "Húsvéthétfő");
  assert.equal(h.get("2026-04-03"), "Nagypéntek");
  assert.equal(h.get("2026-05-25"), "Pünkösdhétfő");
  assert.equal(h.get("2026-10-23"), "Nemzeti ünnep");
});

test("zárt nap és ünnep", () => {
  assert.equal(daySlots("2026-10-05", 120, [], [], now).state, "zarva"); // hétfő
  assert.equal(daySlots("2026-10-23", 120, [], [], now).state, "unnep");
});

test("a szolgáltatásnak zárásig be kell fejeződnie", () => {
  // péntek 9–17, 150 perc → utolsó kezdés 14:30
  const r = daySlots("2026-10-02", 150, [], [], now);
  assert.equal(r.slots.at(-1).time, "14:30");
  assert.equal(r.slots.length, 12);
});

test("foglalás + 15 perc szünet kizárja az átfedő kezdéseket", () => {
  const b = [{ start: 10 * 60, end: 12 * 60 }]; // 10:00–12:00
  const r = daySlots("2026-10-02", 60, b, [], now);
  const st = Object.fromEntries(r.slots.map((s) => [s.time, s.status]));
  assert.equal(st["08:30"], undefined);
  assert.equal(st["09:00"], "foglalt"); // 9:00–10:00 + 15 perc szünet belelógna
  assert.equal(st["12:00"], "foglalt"); // az előző után még kell a 15 perc
  assert.equal(st["12:30"], "szabad");
});

test("egész napos letiltás = szabadnap", () => {
  const r = daySlots("2026-10-02", 60, [], [{ start: 0, end: 1440, reason: "Szabadság" }], now);
  assert.equal(r.state, "szabadnap");
  assert.equal(r.reason, "Szabadság");
});

test("mára csak legalább 3 órával előre lehet foglalni", () => {
  const r = daySlots("2026-09-30", 60, [], [], { date: "2026-09-30", min: 11 * 60 });
  const first = r.slots.find((s) => s.status === "szabad");
  assert.equal(first.time, "14:00");
});

test("múlt és túl távoli nap", () => {
  assert.equal(daySlots("2026-09-29", 60, [], [], now).state, "elmult");
  assert.equal(daySlots(addDays(now.date, 61), 60, [], [], now).state, "tavoli");
});

test("segédfüggvények", () => {
  assert.ok(isDate("2026-02-28"));
  assert.ok(!isDate("2026-02-30"));
  assert.match(nowLocal().date, /^\d{4}-\d{2}-\d{2}$/);
});
