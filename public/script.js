/* Lashes by Tordai Mónika – az oldal működése
   - nyitókép: a pillák egyenként „kerülnek fel” a csukott szemre
   - árlista és nyitvatartás a /api/config alapján (egy helyen, a src/config.js-ben kell szerkeszteni)
   - online foglalás: szolgáltatás → naptár (hány szabad időpont van naponta) → időpontok (szabad / foglalt) → adatok
   - „Saját foglalásaim”: a foglalásokat ezen az eszközön megjegyzi, hogy le lehessen mondani őket */

(() => {
  "use strict";
  document.documentElement.classList.add("js");

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TZ = "Europe/Budapest";
  const STORE = "ltm-foglalasok";

  // ---------- formázás ----------
  const price = (n) => n.toLocaleString("hu-HU").replace(/\s/g, " ") + " Ft";
  const dur = (m) => {
    const hh = Math.floor(m / 60), mm = m % 60;
    return hh ? `${hh} óra${mm ? ` ${mm} perc` : ""}` : `${mm} perc`;
  };
  const asDate = (d) => new Date(d + "T12:00:00Z");
  const fmt = (d, o) => new Intl.DateTimeFormat("hu-HU", { timeZone: "UTC", ...o }).format(asDate(d));
  const longDate = (d) => fmt(d, { month: "long", day: "numeric" }) + ", " + fmt(d, { weekday: "long" });
  const shortDate = (d) => fmt(d, { month: "short", day: "numeric" });
  const monthTitle = (ym) => fmt(ym + "-01", { year: "numeric", month: "long" });
  const addDays = (d, n) => {
    const x = asDate(d);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  };
  const addMonths = (ym, n) => {
    const [y, m] = ym.split("-").map(Number);
    const x = new Date(Date.UTC(y, m - 1 + n, 1));
    return x.toISOString().slice(0, 7);
  };
  const lastOfMonth = (ym) => addDays(addMonths(ym, 1) + "-01", -1);
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const hm = (t) => t.replace(/^0/, "");
  const budapestNow = () => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
        .formatToParts(new Date()).map((x) => [x.type, x.value]),
    );
    return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
  };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { ...(opts.body ? { "content-type": "application/json" } : {}), ...(opts.headers || {}) },
    });
    let data = null;
    try { data = await res.json(); } catch { /* üres válasz */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || "A kapcsolat megszakadt. Kérlek, próbáld újra.");
      Object.assign(err, { status: res.status, data: data || {} });
      throw err;
    }
    return data;
  }

  // ---------- fejléc, menü, beúszás ----------
  const top = $(".top");
  const onScroll = () => top.classList.toggle("is-scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const burger = $(".burger"), menu = $("#menu");
  const setMenu = (open) => {
    burger.setAttribute("aria-expanded", open);
    burger.setAttribute("aria-label", open ? "Menü bezárása" : "Menü megnyitása");
    menu.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
  };
  burger.addEventListener("click", () => setMenu(burger.getAttribute("aria-expanded") !== "true"));
  $$("a", menu).forEach((a) => a.addEventListener("click", () => setMenu(false)));
  addEventListener("keydown", (e) => e.key === "Escape" && !menu.hidden && setMenu(false));
  matchMedia("(min-width: 1081px)").addEventListener("change", (e) => e.matches && setMenu(false));

  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px" });
  $$(".reveal").forEach((el, i) => {
    if (el.closest(".hero")) el.style.transitionDelay = `${i * 90}ms`;
    io.observe(el);
  });
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  // ---------- nyitókép: szem, a pillák egyenként kerülnek fel ----------
  (function eye() {
    const svg = $("#eye");
    if (!svg) return;
    const NS = "http://www.w3.org/2000/svg";
    const el = (tag, attrs) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    };
    // szemhéj-vonal: köbös Bézier
    const P = [[34, 118], [122, 204], [284, 206], [368, 104]];
    const at = (t) => {
      const u = 1 - t;
      const x = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0];
      const y = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1];
      const dx = 3 * u * u * (P[1][0] - P[0][0]) + 6 * u * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0]);
      const dy = 3 * u * u * (P[1][1] - P[0][1]) + 6 * u * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1]);
      const l = Math.hypot(dx, dy);
      return { x, y, tx: dx / l, ty: dy / l };
    };
    const crease = el("path", { class: "crease", d: "M86 92 C 160 138, 262 142, 330 84", pathLength: 1 });
    const lid = el("path", { class: "lid", d: `M${P[0]} C ${P[1]}, ${P[2]}, ${P[3]}`, pathLength: 1 });
    const lashes = el("g", {});
    const N = 38;
    const list = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const t = 0.07 + (i / (N - 1)) * 0.9;
      const p = at(t);
      // lefelé mutató normális, a külső sarok felé egyre jobban kifelé dől (macskaszem)
      const nx = -p.ty, ny = p.tx;
      const lean = (-0.35 + t * 1.15) * 0.9;
      const dx = nx * Math.cos(lean) - ny * Math.sin(lean);
      const dy = nx * Math.sin(lean) + ny * Math.cos(lean);
      const prof = 18 + 44 * Math.pow(t, 1.35) - (t > 0.9 ? (t - 0.9) * 180 : 0);
      const len = prof * (i % 2 ? 0.86 : 1) * (0.94 + rnd() * 0.12);
      const curl = len * 0.28;
      const ex = p.x + dx * len + dy * -curl * 0.1, ey = p.y + dy * len;
      const cx = p.x + dx * len * 0.55 - dy * curl * (t > 0.5 ? -1 : 1) * 0.3, cy = p.y + dy * len * 0.55 + curl * 0.35;
      const path = el("path", { class: "lash", d: `M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${(ey - curl * 0.6).toFixed(1)}`, "stroke-width": (1.25 + (1 - Math.abs(t - 0.6)) * 0.55).toFixed(2), pathLength: 1 });
      lashes.append(path);
      list.push(path);
      // volume-legyező a külső felén: két vékonyabb szál
      if (t > 0.45) {
        for (const s of [-1, 1]) {
          const a = s * 0.13;
          const fx = dx * Math.cos(a) - dy * Math.sin(a), fy = dx * Math.sin(a) + dy * Math.cos(a);
          const l2 = len * 0.9;
          const f = el("path", { class: "lash", d: `M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q ${(p.x + fx * l2 * 0.55).toFixed(1)} ${(p.y + fy * l2 * 0.55 + curl * 0.3).toFixed(1)} ${(p.x + fx * l2).toFixed(1)} ${(p.y + fy * l2 - curl * 0.5).toFixed(1)}`, "stroke-width": "0.7", opacity: ".55", pathLength: 1 });
          lashes.append(f);
          list.push(f);
        }
      }
    }
    const sparks = el("g", {});
    const star = (x, y, r) => el("path", { class: "spark", d: `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z` });
    const sp = [star(356, 58, 9), star(330, 30, 5), star(58, 70, 5)];
    sparks.append(...sp);
    svg.append(crease, lashes, lid, sparks);

    if (reduced || !svg.animate) return;
    const draw = (e, delay, duration) => {
      e.style.strokeDasharray = "1";
      e.style.strokeDashoffset = "1";
      e.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration, delay, easing: "cubic-bezier(.2,.7,.1,1)", fill: "forwards" });
    };
    draw(lid, 250, 1400);
    draw(crease, 700, 1400);
    // belső saroktól kifelé, ahogy egy szett is készül
    list.forEach((e, i) => draw(e, 1200 + i * 32, 700));
    sp.forEach((s, i) => {
      s.style.transformOrigin = "center";
      s.style.transformBox = "fill-box";
      s.animate([{ opacity: 0, transform: "scale(.2) rotate(0)" }, { opacity: 1, transform: "scale(1) rotate(45deg)" }, { opacity: 0, transform: "scale(.2) rotate(90deg)" }],
        { duration: 2600, delay: 3400 + i * 700, iterations: Infinity, easing: "ease-in-out" });
    });
  })();

  // ---------- adatok a szervertől ----------
  const state = {
    salon: null, services: [], today: budapestNow().date,
    service: null, month: null, date: null, time: null,
    days: new Map(), // "szolg|hónap" → napok
    step: 1, maxStep: 1, slotsData: null,
  };
  const svcById = (id) => state.services.find((s) => s.id === id);

  const configReady = api("/api/config").then((c) => {
    state.salon = c.salon;
    state.services = c.services;
    state.today = c.today;
    state.todayHours = c.todayHours;
    renderMenu();
    renderServicePicker();
    renderCourses();
    renderHours();
    return c;
  }).catch(() => {
    $("[data-services]").innerHTML = "";
    $("[data-services]").append(h("p", { class: "muted", text: "Az árlista most nem tölthető be. Kérlek, frissítsd az oldalt, vagy hívj telefonon." }));
    $("[data-bk-services]").append(h("p", { class: "muted", text: "Az online foglalás most nem elérhető. Kérlek, hívj telefonon!" }));
    $("[data-courses]").replaceChildren(h("p", { class: "muted", text: "Hívj, és elmondom a részleteket!" }));
  });

  // online foglalható szolgáltatások csoportonként (az oktatás külön szekcióban, telefonos jelentkezéssel)
  const groups = () => {
    const map = new Map();
    for (const s of state.services.filter((x) => x.bookable !== false)) (map.get(s.group) || map.set(s.group, []).get(s.group)).push(s);
    return [...map];
  };

  function renderCourses() {
    const box = $("[data-courses]");
    const list = state.services.filter((x) => x.bookable === false);
    box.replaceChildren(...list.map((c) => h("article", { class: "course" },
      h("h3", { text: c.name }),
      h("p", { text: c.desc }),
      h("span", { class: "course__price", text: c.price ? price(c.price) : "Ár egyeztetés alapján" }))));
  }

  function renderMenu() {
    const box = $("[data-services]");
    box.innerHTML = "";
    for (const [g, items] of groups()) {
      box.append(h("div", { class: "menu-group" },
        h("p", { class: "menu-group__title", text: g }),
        items.map((s) => h("article", { class: "menu-item" },
          h("h3", { text: s.name }),
          h("span", { class: "menu-item__price", text: price(s.price) }),
          h("p", { text: s.desc }),
          h("div", { class: "menu-item__meta" },
            h("span", { class: "menu-item__dur", text: dur(s.duration) }),
            h("button", { type: "button", class: "menu-item__book", onclick: () => { pickService(s.id); $("#foglalas").scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); } }, "Erre foglalok ", h("span", { "aria-hidden": "true", text: "→" }))),
        ))));
    }
  }

  function renderHours() {
    const names = ["Vasárnap", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat"];
    const table = $("[data-hours]");
    table.innerHTML = "";
    const now = budapestNow();
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
      const hrs = state.salon.hours[d];
      table.append(h("tr", { class: d === now.dow ? "is-today" : null }, h("th", { text: names[d] }), h("td", { text: hrs ? `${hm(hrs[0])} – ${hm(hrs[1])}` : "zárva" })));
    }
    const status = $("[data-open-status]");
    const th = state.todayHours;
    if (th && now.min >= toMin(th.open) && now.min < toMin(th.close)) {
      status.textContent = `Most nyitva · ${hm(th.close)}-ig`;
      status.classList.add("is-open");
      return;
    }
    const on = ["vasárnap", "hétfőn", "kedden", "szerdán", "csütörtökön", "pénteken", "szombaton"];
    status.textContent = "Most zárva";
    for (let i = 0; i < 8; i++) {
      const d = (now.dow + i) % 7, hrs = state.salon.hours[d];
      if (!hrs || (i === 0 && (!th || now.min >= toMin(hrs[0])))) continue;
      status.textContent = `Zárva · ${i === 0 ? "ma" : i === 1 ? "holnap" : on[d]} ${hm(hrs[0])}-kor nyitok`;
      break;
    }
  }

  // ---------- legközelebbi szabad időpont a nyitóképen ----------
  const nextLink = $("[data-next]");
  const relDay = (d) => (d === state.today ? "ma" : d === addDays(state.today, 1) ? "holnap" : null);
  function loadNext() {
    api("/api/next").then(({ next }) => {
      if (!next) return;
      const rel = relDay(next.date);
      $("[data-next-text]").textContent = `${rel ? rel + ", " : ""}${longDate(next.date)} · ${hm(next.time)}`;
      nextLink.hidden = false;
      requestAnimationFrame(() => nextLink.classList.add("is-in"));
    }).catch(() => {});
  }
  loadNext();

  // ---------- FOGLALÁS ----------
  const bk = $("[data-bk]");
  const panels = $$("[data-panel]", bk);
  const stepItems = $$(".bk__steps li", bk);

  function go(step, { focus = true } = {}) {
    state.step = step;
    state.maxStep = Math.max(state.maxStep, Math.min(step, 3));
    panels.forEach((p) => (p.hidden = Number(p.dataset.panel) !== step));
    stepItems.forEach((li) => {
      const n = Number(li.dataset.go);
      li.classList.toggle("is-active", n === step);
      li.classList.toggle("is-done", n < step || step === 4);
      li.querySelector("button").disabled = step === 4 || n > state.maxStep;
      if (n === step) li.querySelector("button").setAttribute("aria-current", "step");
      else li.querySelector("button").removeAttribute("aria-current");
    });
    if (focus) {
      const r = bk.getBoundingClientRect();
      if (r.top < 60 || r.top > innerHeight * 0.4) bk.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      if (step === 4) $("[data-panel='4']").focus({ preventScroll: true });
    }
  }
  stepItems.forEach((li) => li.querySelector("button").addEventListener("click", () => go(Number(li.dataset.go))));

  // 1. szolgáltatás
  function renderServicePicker() {
    const box = $("[data-bk-services]");
    box.innerHTML = "";
    const all = groups();
    // telefonon kategória-gombok: egyszerre csak egy csoport látszik, hogy ne kelljen hosszan görgetni
    const cats = h("div", { class: "bk-cats", role: "tablist", "aria-label": "Kategória" });
    const setCat = (i) => {
      $$(".bk-cats button", box).forEach((b, j) => b.setAttribute("aria-selected", String(i === j)));
      $$(".bk-group", box).forEach((g, j) => g.classList.toggle("is-cat", i === j));
    };
    all.forEach(([g], i) => cats.append(h("button", { type: "button", role: "tab", "aria-selected": "false", onclick: (e) => {
      setCat(i);
      e.currentTarget.scrollIntoView({ block: "nearest", inline: "center", behavior: reduced ? "auto" : "smooth" });
    } }, g.replace(" · UV technológia", ""))));
    box.append(cats);
    for (const [g, items] of all) {
      box.append(h("div", { class: "bk-group" },
        h("p", { class: "bk-group__title", text: g }),
        items.map((s) => h("button", {
          type: "button", class: "svc", role: "radio", "aria-checked": "false", "data-id": s.id,
          onclick: () => pickService(s.id),
        }, h("b", { text: s.name }), h("small", { text: dur(s.duration) }), h("span", { class: "svc__price", text: price(s.price) })))));
    }
    setCat(0);
    state.setCat = (id) => setCat(all.findIndex(([, items]) => items.some((x) => x.id === id)));
  }


  async function pickService(id) {
    await configReady;
    const s = svcById(id);
    if (!s) return;
    state.service = id;
    state.time = null;
    $$(".svc").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === id)));
    if (state.setCat) state.setCat(id);
    $("[data-sum-service]").textContent = s.name;
    $("[data-sum-when]").textContent = "—";
    state.maxStep = 2;
    go(2, { focus: false });
    // az első szabad napra ugrunk
    let target = state.date && state.date >= state.today ? state.date : null;
    if (!target) {
      try {
        const { next } = await api(`/api/next?service=${encodeURIComponent(id)}`);
        target = next ? next.date : state.today;
      } catch { target = state.today; }
    }
    state.month = target.slice(0, 7);
    await renderCalendar();
    const day = dayInfo(target);
    selectDay(day && day.free ? target : firstFreeInMonth() || target, { scroll: false });
    const r = bk.getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight * 0.5) bk.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  // 2. naptár
  const grid = $("[data-cal-grid]");
  const horizonEnd = () => addDays(state.today, state.salon.horizonDays);
  const key = (m = state.month) => `${state.service}|${m}`;
  const dayInfo = (d) => (state.days.get(key(d.slice(0, 7))) || []).find((x) => x.date === d);
  const firstFreeInMonth = () => ((state.days.get(key()) || []).find((x) => x.free > 0) || {}).date;

  async function loadMonth(month, force = false) {
    const k = key(month);
    if (state.days.has(k) && !force) return state.days.get(k);
    const from = month + "-01" < state.today ? state.today : month + "-01";
    const to = lastOfMonth(month) > horizonEnd() ? horizonEnd() : lastOfMonth(month);
    if (to < from) { state.days.set(k, []); return []; }
    const { days, today } = await api(`/api/availability?service=${encodeURIComponent(state.service)}&from=${from}&to=${to}`);
    state.today = today;
    state.days.set(k, days);
    return days;
  }

  async function renderCalendar(force = false) {
    const month = state.month;
    $("[data-cal-month]").textContent = monthTitle(month);
    $("[data-cal-prev]").disabled = month <= state.today.slice(0, 7);
    $("[data-cal-next]").disabled = month >= horizonEnd().slice(0, 7);
    grid.classList.add("is-loading");
    if (!state.days.has(key(month)) || force) {
      if (!grid.children.length) drawGrid(month, []);
      try { await loadMonth(month, force); }
      catch (e) { grid.classList.remove("is-loading"); $("[data-slots-sub]").textContent = e.message; return; }
    }
    if (month !== state.month) return; // közben lapoztak
    drawGrid(month, state.days.get(key(month)));
    grid.classList.remove("is-loading");
  }

  function drawGrid(month, days) {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const first = month + "-01";
    const pad = (asDate(first).getUTCDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < pad; i++) cells.push(h("span", { class: "day day--pad", "aria-hidden": "true" }));
    for (let d = first; d <= lastOfMonth(month); d = addDays(d, 1)) {
      const info = byDate.get(d);
      const num = h("span", { text: String(Number(d.slice(8))) });
      let cls = "day", label = "", small = "", clickable = false;
      if (!info) {
        cls += d < state.today ? " day--past" : " day--closed";
        label = d < state.today ? "elmúlt" : "még nem foglalható";
      } else if (info.state === "nyitva") {
        clickable = true;
        cls += " day--open" + (info.free <= 2 ? " day--few" : "");
        small = info.free <= 2 ? [`még ${info.free}`] : [String(info.free), h("i", { text: " szabad" })];
        label = `${info.free} szabad időpont`;
      } else if (info.state === "betelt") {
        clickable = true;
        cls += " day--full";
        small = "betelt";
        label = "minden időpont foglalt";
      } else if (info.state === "zarva") {
        cls += " day--closed";
        label = "zárva";
      } else if (info.state === "unnep") {
        cls += " day--closed";
        small = "ünnep";
        label = `ünnepnap (${info.reason}), zárva`;
      } else if (info.state === "szabadnap") {
        cls += " day--closed";
        small = "zárva";
        label = `szabadnap${info.reason ? " (" + info.reason + ")" : ""}, zárva`;
      } else {
        cls += " day--past";
        label = "ma már nem foglalható";
      }
      if (d === state.today) cls += " day--today";
      const el = clickable
        ? h("button", { type: "button", class: cls, role: "gridcell", "aria-selected": String(d === state.date), "aria-label": `${longDate(d)}: ${label}`, "data-date": d, onclick: () => selectDay(d) }, num, small && h("small", {}, small))
        : h("span", { class: cls, role: "gridcell", "aria-disabled": "true", "aria-label": `${longDate(d)}: ${label}`, title: label }, num, small && h("small", {}, small));
      cells.push(el);
    }
    grid.replaceChildren(...cells);
  }

  $("[data-cal-prev]").addEventListener("click", () => { state.month = addMonths(state.month, -1); renderCalendar(); });
  $("[data-cal-next]").addEventListener("click", () => { state.month = addMonths(state.month, 1); renderCalendar(); });

  // időpontok
  const slotsGrid = $("[data-slots-grid]");
  async function selectDay(date, { scroll = true, notice = "" } = {}) {
    state.date = date;
    state.time = null;
    $$(".day[aria-selected]", grid).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.date === date)));
    $("[data-slots-title]").textContent = longDate(date);
    $("[data-slots-sub]").textContent = "Időpontok betöltése…";
    slotsGrid.replaceChildren(...Array.from({ length: 8 }, () => h("span", { class: "skeleton" })));
    let data;
    try {
      data = await api(`/api/slots?service=${encodeURIComponent(state.service)}&date=${date}`);
    } catch (e) {
      $("[data-slots-sub]").textContent = e.message;
      slotsGrid.replaceChildren();
      return;
    }
    if (state.date !== date) return;
    state.slotsData = data;
    renderSlots(data, notice);
    if (scroll && matchMedia("(max-width: 900px)").matches) {
      $("[data-slots]").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
  }

  function renderSlots(data, notice) {
    const sub = $("[data-slots-sub]");
    const free = data.slots.filter((s) => s.status === "szabad").length;
    sub.replaceChildren();
    if (notice) sub.append(h("span", { class: "slots__notice", text: notice }));
    if (data.slots.length) {
      sub.append(free ? h("b", { text: `${free} szabad` }) : h("span", { text: "Nincs szabad" }), ` időpont a ${data.slots.length}-ből`);
      if (data.open) sub.append(` · nyitva ${hm(data.open)}–${hm(data.close)}`);
    }
    const empty = (title, text, withNext = true) => {
      const box = h("div", { class: "slots__empty" }, h("b", { text: title }), text || null);
      if (withNext) box.append(h("button", { type: "button", class: "link", onclick: jumpToNextFree }, "Következő szabad nap →"));
      return box;
    };
    if (data.state === "zarva") return slotsGrid.replaceChildren(empty("Ezen a napon zárva vagyok.", ""));
    if (data.state === "unnep") return slotsGrid.replaceChildren(empty(`${data.reason} – zárva`, "Ünnepnapokon nem dolgozom."));
    if (data.state === "szabadnap") return slotsGrid.replaceChildren(empty("Ezen a napon nem dolgozom.", data.reason ? `(${data.reason})` : ""));
    if (data.state === "tavoli" || data.state === "elmult" && !data.slots.length) return slotsGrid.replaceChildren(empty("Erre a napra nem lehet foglalni.", ""));

    const buttons = data.slots.map((s) => {
      const label = s.status === "szabad" ? "szabad" : s.status === "foglalt" ? "foglalt" : "már nem foglalható";
      return h("button", {
        type: "button",
        class: `slot slot--${s.status === "szabad" ? "free" : s.status === "foglalt" ? "taken" : "past"}`,
        disabled: s.status !== "szabad",
        "aria-pressed": "false",
        "aria-label": `${hm(s.time)}, ${label}`,
        onclick: (e) => pickTime(s.time, e.currentTarget),
      }, h("span", { text: hm(s.time) }), s.status === "foglalt" && h("small", { text: "foglalt" }));
    });
    slotsGrid.replaceChildren(...buttons);
    if (!free) slotsGrid.append(empty(data.state === "betelt" ? "Erre a napra minden időpont elkelt." : "Mára már nem lehet foglalni.", "", true));
  }

  async function jumpToNextFree() {
    let m = state.month;
    for (let i = 0; i < 4; i++) {
      await loadMonth(m).catch(() => []);
      const next = (state.days.get(key(m)) || []).find((d) => d.free > 0 && d.date > state.date);
      if (next) {
        if (m !== state.month) { state.month = m; await renderCalendar(); }
        return selectDay(next.date);
      }
      m = addMonths(m, 1);
      if (m > horizonEnd().slice(0, 7)) break;
    }
    $("[data-slots-sub]").textContent = "A következő hetekben sajnos nincs szabad időpont. Hívj bátran, hátha be tudlak szorítani!";
  }

  function pickTime(time, btn) {
    state.time = time;
    $$(".slot", slotsGrid).forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    const s = svcById(state.service);
    const end = toMin(time) + s.duration;
    $("[data-sum-when]").textContent = `${shortDate(state.date)} · ${hm(time)}`;
    $("[data-t-service]").textContent = s.name;
    $("[data-t-date]").textContent = longDate(state.date);
    $("[data-t-time]").textContent = `${hm(time)} – ${Math.floor(end / 60)}:${String(end % 60).padStart(2, "0")}`;
    $("[data-t-dur]").textContent = dur(s.duration);
    $("[data-t-price]").textContent = price(s.price);
    $("[data-form-error]").hidden = true;
    state.maxStep = 3;
    setTimeout(() => {
      go(3);
      const first = $("#f-name");
      if (!first.value && matchMedia("(hover: hover)").matches) first.focus({ preventScroll: true });
    }, reduced ? 0 : 180);
  }
  $("[data-back-2]").addEventListener("click", () => go(2));

  // időnként frissítjük, hogy mások foglalásai is látszódjanak
  let lastRefresh = Date.now();
  const refresh = async () => {
    if (state.step !== 2 || !state.service || document.hidden || Date.now() - lastRefresh < 20000) return;
    lastRefresh = Date.now();
    await renderCalendar(true);
    if (state.date) {
      const data = await api(`/api/slots?service=${encodeURIComponent(state.service)}&date=${state.date}`).catch(() => null);
      if (data && state.step === 2) { state.slotsData = data; renderSlots(data); }
    }
  };
  document.addEventListener("visibilitychange", refresh);
  setInterval(refresh, 60000);

  // 3. adatok és foglalás
  const form = $("[data-form]");
  const formError = $("[data-form-error]");
  const submitBtn = $("[data-submit]");
  const invalid = (name, on) => {
    const input = form.elements[name];
    (input.closest(".field") || input.closest(".check")).classList.toggle("is-invalid", on);
    if (on) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  };
  form.addEventListener("input", (e) => e.target.name && invalid(e.target.name, false));
  $("[data-open-faq]").addEventListener("click", () => { const d = $("#lemondas"); if (d) d.open = true; });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements;
    const body = {
      service: state.service, date: state.date, time: state.time,
      name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), note: f.note.value.trim(),
      firstVisit: f.firstVisit.checked, consent: f.consent.checked, website: f.website.value,
    };
    const errs = [];
    if (body.name.length < 2) errs.push(["name", "Kérlek, add meg a neved!"]);
    if (body.phone.replace(/\D/g, "").length < 9) errs.push(["phone", "Kérlek, adj meg egy érvényes telefonszámot!"]);
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) errs.push(["email", "Ez az e-mail-cím nem tűnik érvényesnek."]);
    if (!body.consent) errs.push(["consent", "A foglaláshoz fogadd el a feltételeket."]);
    ["name", "phone", "email", "consent"].forEach((n) => invalid(n, errs.some((x) => x[0] === n)));
    if (errs.length) {
      formError.textContent = errs[0][1];
      formError.hidden = false;
      f[errs[0][0]].focus();
      return;
    }
    formError.hidden = true;
    submitBtn.dataset.loading = "";
    submitBtn.textContent = "Foglalás folyamatban";
    try {
      const { booking } = await api("/api/bookings", { method: "POST", body: JSON.stringify(body) });
      done(booking);
    } catch (err) {
      if (err.data && err.data.taken) {
        state.days.delete(key());
        go(2);
        await renderCalendar(true);
        selectDay(state.date, { scroll: false, notice: err.message });
      } else {
        formError.textContent = err.message;
        formError.hidden = false;
        if (err.data && err.data.field && f[err.data.field]) { invalid(err.data.field, true); f[err.data.field].focus(); }
      }
    } finally {
      delete submitBtn.dataset.loading;
      submitBtn.textContent = "Időpont lefoglalása";
    }
  });

  // 4. kész
  let last = null;
  const cancelUrl = (b) => `${location.origin}/lemondas?kod=${encodeURIComponent(b.code)}&t=${encodeURIComponent(b.token)}`;
  function done(b) {
    last = b;
    $("[data-d-name]").textContent = b.name.split(/\s+/).slice(-1)[0] + "!";
    $("[data-d-when]").textContent = `${longDate(b.date)}, ${hm(b.time)}–${hm(b.end)} · ${b.serviceName}`;
    $("[data-d-code]").textContent = b.code;
    $("[data-d-cancelhours]").textContent = state.salon.cancelHours;
    remember(b);
    state.days.clear();
    go(4);
    loadNext();
  }
  $("[data-restart]").addEventListener("click", () => {
    form.reset();
    state.service = state.date = state.time = null;
    state.maxStep = 1;
    $$(".svc").forEach((b) => b.setAttribute("aria-checked", "false"));
    $("[data-sum-service]").textContent = "Válassz";
    $("[data-sum-when]").textContent = "—";
    renderMine();
    go(1);
  });
  $("[data-copy-link]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(cancelUrl(last));
      btn.textContent = "Link kimásolva ✓";
    } catch {
      prompt("A lemondási link:", cancelUrl(last));
    }
    setTimeout(() => (btn.textContent = "Lemondási link másolása"), 2500);
  });

  // naptárfájl (.ics)
  const utcStamp = (date, time) => {
    // budapesti helyi idő → UTC
    const guess = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), +time.slice(0, 2), +time.slice(3, 5));
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess;
    return new Date(guess - offset).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };
  $("[data-ics]").addEventListener("click", () => {
    const b = last;
    const esc = (s) => s.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lashes by Tordai Monika//Foglalas//HU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${b.code}@lashes-by-tordai-monika`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `DTSTART:${utcStamp(b.date, b.time)}`,
      `DTEND:${utcStamp(b.date, b.end)}`,
      `SUMMARY:${esc(`${b.serviceName} – Lashes by Tordai Mónika`)}`,
      `LOCATION:${esc($(".contact__addr").firstChild.textContent.trim())}`,
      `DESCRIPTION:${esc(`Foglalási kód: ${b.code}\nSmink nélkül, tiszta pillákkal érkezz!\nLemondás (${state.salon.cancelHours} órával előtte): ${cancelUrl(b)}`)}`,
      "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Holnap pillaépítés", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = h("a", { href: url, download: `pilla-${b.date}.ics` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  // ---------- saját foglalások ezen az eszközön ----------
  const readMine = () => {
    try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; }
  };
  const writeMine = (list) => {
    try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* privát mód */ }
  };
  function remember(b) {
    const list = readMine().filter((x) => x.code !== b.code);
    list.push({ code: b.code, token: b.token, date: b.date, time: b.time, end: b.end, serviceName: b.serviceName });
    writeMine(list);
  }
  async function renderMine(verify = false) {
    const box = $("[data-mine]");
    let list = readMine().filter((b) => b.date >= budapestNow().date);
    if (verify && list.length) {
      const checked = await Promise.all(list.map((b) =>
        api(`/api/bookings/${encodeURIComponent(b.code)}?t=${encodeURIComponent(b.token)}`).then((r) => (r.booking.status === "aktiv" ? b : null)).catch((e) => (e.status === 404 ? null : b))));
      list = checked.filter(Boolean);
    }
    writeMine(list);
    box.replaceChildren(...list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map((b) =>
      h("div", { class: "mine__item" },
        h("span", { class: "mine__label", text: "Foglalásod" }),
        h("b", { text: `${longDate(b.date)}, ${hm(b.time)}` }),
        h("span", { class: "muted", text: b.serviceName }),
        h("a", { class: "link", href: `/lemondas?kod=${encodeURIComponent(b.code)}&t=${encodeURIComponent(b.token)}` }, "Részletek, lemondás"))));
    box.hidden = !list.length;
  }
  renderMine(true);

  // ---------- telefonon alsó foglalás-gomb ----------
  const dock = $("[data-dock]");
  const seen = new Map();
  const dockIo = new IntersectionObserver((es) => {
    es.forEach((e) => seen.set(e.target, e.isIntersecting));
    const hide = [...seen.values()].some(Boolean);
    dock.classList.toggle("is-shown", !hide);
  });
  [$(".hero__actions"), $("#foglalas"), $(".foot")].forEach((el) => el && dockIo.observe(el));
  $(".dock__book", dock).addEventListener("click", () => {
    if (!state.service) setTimeout(() => $(".svc") && $(".svc").focus({ preventScroll: true }), 600);
  });
})();
