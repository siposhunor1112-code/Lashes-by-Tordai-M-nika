/* Admin felület: foglalások listája, lemondás, telefonos foglalás felvétele, szabadnapok.
   A jelszót a Cloudflare-ben kell beállítani (ADMIN_PASSWORD titok); a böngésző csak erre a fülre jegyzi meg. */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const KEY = "ltm-admin";
  const TZ = "Europe/Budapest";
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c);
    return el;
  };
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const addDays = (d, n) => {
    const x = new Date(d + "T12:00:00Z");
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  };
  const fmt = (d, o) => new Intl.DateTimeFormat("hu-HU", { timeZone: "UTC", ...o }).format(new Date(d + "T12:00:00Z"));
  const dayTitle = (d) => fmt(d, { weekday: "long" }) + ", " + fmt(d, { month: "long", day: "numeric" });
  const hm = (t) => t.replace(/^0/, "");
  const price = (n) => n.toLocaleString("hu-HU") + " Ft";
  const toast = (msg) => {
    const t = h("div", { class: "toast", role: "status", text: msg });
    document.body.append(t);
    setTimeout(() => t.remove(), 2600);
  };

  let password = "";
  try { password = sessionStorage.getItem(KEY) || ""; } catch { /* privát mód */ }
  let range = 7;
  let services = [];

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { authorization: `Bearer ${password}`, ...(opts.body ? { "content-type": "application/json" } : {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { logout(); throw new Error(data.error || "Hibás jelszó."); }
    if (!res.ok) { const e = new Error(data.error || "Hiba történt."); e.data = data; throw e; }
    return data;
  }

  // ---------- belépés ----------
  const loginView = $("[data-login-view]"), app = $("[data-app]"), logoutBtn = $("[data-logout]");
  $("[data-login]").addEventListener("submit", async (e) => {
    e.preventDefault();
    password = e.target.pw.value;
    const err = $("[data-login-error]");
    err.hidden = true;
    try {
      await api(`/api/admin/overview?from=${today()}&to=${today()}`);
      try { sessionStorage.setItem(KEY, password); } catch { /* */ }
      start();
    } catch (x) {
      err.textContent = x.message;
      err.hidden = false;
    }
  });
  function logout() {
    password = "";
    try { sessionStorage.removeItem(KEY); } catch { /* */ }
    app.hidden = true;
    logoutBtn.hidden = true;
    loginView.hidden = false;
  }
  logoutBtn.addEventListener("click", logout);

  async function start() {
    loginView.hidden = true;
    app.hidden = false;
    logoutBtn.hidden = false;
    if (!services.length) {
      const c = await fetch("/api/config").then((r) => r.json());
      services = c.services.filter((s) => s.bookable !== false);
      $("#n-service").replaceChildren(...services.map((s) => h("option", { value: s.id, text: `${s.name} (${s.duration} perc)` })));
    }
    $("#n-date").value = $("#n-date").value || today();
    $("#b-date").value = $("#b-date").value || today();
    load();
  }

  // ---------- lista ----------
  $$("[data-range]").forEach((b) => b.addEventListener("click", () => {
    range = Number(b.dataset.range);
    $$("[data-range]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    load();
  }));
  $("[data-show-cancelled]").addEventListener("change", () => load());

  async function load() {
    const t = today();
    const from = range < 0 ? addDays(t, range) : t;
    const to = range < 0 ? addDays(t, -1) : addDays(t, range - 1);
    let data;
    try {
      data = await api(`/api/admin/overview?from=${from}&to=${to}`);
    } catch (e) {
      $("[data-agenda]").replaceChildren(h("p", { class: "empty", text: e.message }));
      return;
    }
    const showCancelled = $("[data-show-cancelled]").checked;
    const active = data.bookings.filter((b) => b.status === "aktiv");
    const sum = active.reduce((a, b) => a + (b.price || 0), 0);
    $("[data-stats]").replaceChildren(h("b", { text: `${active.length} foglalás` }), ` · várható bevétel ${price(sum)}`,
      data.bookings.length - active.length ? ` · ${data.bookings.length - active.length} lemondva` : "");

    const shown = data.bookings.filter((b) => showCancelled || b.status === "aktiv");
    const days = [...new Set([...shown.map((b) => b.date), ...data.blocks.map((b) => b.date)])].sort();
    if (range < 0) days.reverse();
    const box = $("[data-agenda]");
    if (!days.length) {
      box.replaceChildren(h("p", { class: "empty", text: "Ebben az időszakban nincs foglalás." }));
    } else {
      box.replaceChildren(...days.map((d) => {
        const items = shown.filter((b) => b.date === d);
        const blocks = data.blocks.filter((b) => b.date === d);
        return h("section", { class: "aday" },
          h("div", { class: "aday__title" + (d === t ? " is-today" : "") }, h("h2", { text: dayTitle(d) }), h("span", { text: `${items.filter((b) => b.status === "aktiv").length} vendég` })),
          blocks.map((b) => h("div", { class: "appt" },
            h("div", { class: "appt__time", text: b.start === "00:00" && b.end === "24:00" ? "egész nap" : `${hm(b.start)}` }, b.start === "00:00" && b.end === "24:00" ? null : h("small", { text: `– ${hm(b.end)}` })),
            h("div", { class: "appt__block", text: `Letiltva${b.reason ? " – " + b.reason : ""}` }))),
          items.map(appt));
      }));
    }
    renderBlocks(data.blocks.filter((b) => b.date >= t));
  }

  function appt(b) {
    const cancelled = b.status !== "aktiv";
    const tel = b.phone.replace(/[^\d+]/g, "");
    return h("article", { class: "appt" + (cancelled ? " is-cancelled" : "") },
      h("div", { class: "appt__time", text: hm(b.time) }, h("small", { text: `– ${hm(b.end)}` })),
      h("div", {},
        h("div", { class: "appt__who" }, h("b", { text: b.name }),
          b.firstVisit ? h("span", { class: "tag", text: "első alkalom" }) : null,
          b.source === "admin" ? h("span", { class: "tag tag--phone", text: "telefonos" }) : null,
          cancelled ? h("span", { class: "tag tag--phone", text: "lemondva" }) : null),
        h("div", { class: "appt__svc", text: `${b.serviceName} · ${price(b.price || 0)} · ${b.code}` }),
        h("div", { class: "appt__contact" },
          h("a", { href: `tel:${tel}`, text: b.phone }),
          b.email ? h("a", { href: `mailto:${b.email}`, text: b.email }) : null),
        b.note ? h("p", { class: "appt__note", text: b.note }) : null),
      cancelled ? null : h("button", {
        type: "button", class: "link",
        onclick: async (e) => {
          const btn = e.currentTarget;
          if (btn.dataset.confirm !== "1") { btn.dataset.confirm = "1"; btn.textContent = "Biztosan?"; return; }
          try { await api(`/api/admin/bookings/${b.id}/cancel`, { method: "POST", body: "{}" }); toast("Foglalás lemondva"); load(); }
          catch (x) { toast(x.message); }
        },
      }, "Lemondás"));
  }

  function renderBlocks(blocks) {
    $("[data-blocks]").replaceChildren(...blocks.map((b) => h("li", {},
      h("span", {}, dayTitle(b.date), h("small", { text: `${b.start === "00:00" && b.end === "24:00" ? "egész nap" : `${hm(b.start)}–${hm(b.end)}`}${b.reason ? " · " + b.reason : ""}` })),
      h("button", { type: "button", class: "link", onclick: async () => {
        try { await api(`/api/admin/blocks/${b.id}`, { method: "DELETE" }); toast("Feloldva"); load(); } catch (x) { toast(x.message); }
      } }, "Feloldás"))));
  }

  // ---------- új telefonos foglalás ----------
  $("[data-new]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, err = $("[data-new-error]");
    err.hidden = true;
    const body = { service: f.service.value, date: f.date.value, time: f.time.value, name: f.name.value, phone: f.phone.value, note: f.note.value };
    const send = async (force) => {
      try {
        await api("/api/admin/bookings", { method: "POST", body: JSON.stringify({ ...body, force }) });
        toast("Foglalás rögzítve");
        f.name.value = f.phone.value = f.note.value = f.time.value = "";
        load();
      } catch (x) {
        if (x.data && x.data.clash && !force && confirm(`${x.message}\nMégis rögzíted?`)) return send(true);
        err.textContent = x.message;
        err.hidden = false;
      }
    };
    send(false);
  });

  // ---------- szabadnap ----------
  const whole = $("[data-whole]");
  whole.addEventListener("change", () => ($("[data-times]").hidden = whole.checked));
  $("[data-block]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, err = $("[data-block-error]");
    err.hidden = true;
    const body = { date: f.date.value, until: f.until.value || f.date.value, reason: f.reason.value };
    if (!whole.checked) Object.assign(body, { start: f.start.value, end: f.end.value });
    try {
      await api("/api/admin/blocks", { method: "POST", body: JSON.stringify(body) });
      toast("Letiltva");
      f.reason.value = f.until.value = "";
      load();
    } catch (x) {
      err.textContent = x.message;
      err.hidden = false;
    }
  });

  if (password) start();
})();
