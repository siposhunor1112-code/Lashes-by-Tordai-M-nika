/* Foglalás megtekintése és lemondása a foglaláskor kapott linkkel (/lemondas?kod=…&t=…) */
(() => {
  "use strict";
  const PHONE = { href: "tel:+36300000000", text: "+36 30 000 0000" };
  const $ = (s) => document.querySelector(s);
  const q = new URLSearchParams(location.search);
  const code = q.get("kod") || "", token = q.get("t") || "";
  const title = $("[data-title]"), body = $("[data-body]");
  const fmt = (d, o) => new Intl.DateTimeFormat("hu-HU", { timeZone: "UTC", ...o }).format(new Date(d + "T12:00:00Z"));
  const longDate = (d) => fmt(d, { year: "numeric", month: "long", day: "numeric" }) + ", " + fmt(d, { weekday: "long" });
  const hm = (t) => t.replace(/^0/, "");
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const phoneLink = () => { const a = el("a", null, PHONE.text); a.href = PHONE.href; return a; };

  const forget = () => {
    try {
      const list = JSON.parse(localStorage.getItem("ltm-foglalasok") || "[]").filter((b) => b.code !== code);
      localStorage.setItem("ltm-foglalasok", JSON.stringify(list));
    } catch { /* nincs tároló */ }
  };

  function details(b) {
    const dl = el("dl", "card__dl");
    for (const [k, v] of [["Szolgáltatás", b.serviceName], ["Nap", longDate(b.date)], ["Időpont", `${hm(b.time)} – ${hm(b.end)}`], ["Foglalási kód", b.code]]) {
      const row = el("div");
      row.append(el("dt", null, k), el("dd", null, v));
      dl.append(row);
    }
    return dl;
  }

  function show(b) {
    body.replaceChildren(details(b));
    if (b.status !== "aktiv") {
      title.textContent = "Ezt a foglalást lemondtad.";
      forget();
      const p = el("p", "card__text", "Köszönöm, hogy szóltál! Ha új időpontot szeretnél, foglalj bátran.");
      const a = el("a", "btn btn--ink", "Új időpont foglalása");
      a.href = "/#foglalas";
      body.append(p, a);
      return;
    }
    title.textContent = "Várlak szeretettel!";
    if (b.cancellable) {
      const p = el("p", "card__text", "Ha mégsem jó az időpont, itt egy kattintással lemondhatod – így más vendég kaphatja meg.");
      const btn = el("button", "btn btn--ghost btn--block", "Időpont lemondása");
      btn.type = "button";
      btn.addEventListener("click", async () => {
        if (btn.dataset.confirm !== "1") {
          btn.dataset.confirm = "1";
          btn.textContent = "Biztosan lemondod? Kattints újra";
          btn.classList.replace("btn--ghost", "btn--ink");
          return;
        }
        btn.disabled = true;
        btn.textContent = "Lemondás…";
        try {
          const res = await fetch(`/api/bookings/${encodeURIComponent(code)}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          show(data.booking);
        } catch (e) {
          btn.disabled = false;
          btn.textContent = "Időpont lemondása";
          btn.dataset.confirm = "";
          const err = el("p", "form__error", e.message || "Nem sikerült. Kérlek, hívj telefonon.");
          body.append(err);
        }
      });
      body.append(p, btn);
    } else {
      const p = el("p", "card__text", "Az időponthoz már túl közel vagyunk ahhoz, hogy online lemondd. Ha nem tudsz jönni, kérlek, mielőbb hívj: ");
      p.append(phoneLink());
      body.append(p);
    }
  }

  if (!code || !token) {
    title.textContent = "Hiányos link";
    body.replaceChildren(el("p", "card__text", "A lemondási link nem teljes. Nyisd meg újra a foglaláskor kapott linket, vagy hívj telefonon."));
    return;
  }
  fetch(`/api/bookings/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}`)
    .then(async (r) => ({ ok: r.ok, data: await r.json() }))
    .then(({ ok, data }) => {
      if (!ok) throw new Error(data.error);
      show(data.booking);
    })
    .catch((e) => {
      title.textContent = "Nem található a foglalás";
      const p = el("p", "card__text", (e.message || "Hiba történt.") + " Ha kérdésed van, hívj: ");
      p.append(phoneLink());
      body.replaceChildren(p);
    });
})();
