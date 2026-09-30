// Újragyártja a megosztási képet (public/assets/og.jpg) és az iPhone-ikont (public/assets/apple-touch-icon.png).
// Futtatás: node tools/images.js   (Playwright kell hozzá: npm i -D playwright)
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const font = (f) => "data:font/woff2;base64," + fs.readFileSync(path.join(ROOT, "assets", "fonts", f)).toString("base64");

const base = `
  @font-face { font-family: CG; font-weight: 300 700; src: url(${font("cormorant-latin-wght-normal.woff2")}); }
  @font-face { font-family: CG; font-weight: 300 700; src: url(${font("cormorant-latin-ext-wght-normal.woff2")}); unicode-range: U+0100-02BA; }
  @font-face { font-family: CG; font-style: italic; font-weight: 300 700; src: url(${font("cormorant-latin-wght-italic.woff2")}); }
  @font-face { font-family: CG; font-style: italic; font-weight: 300 700; src: url(${font("cormorant-latin-ext-wght-italic.woff2")}); unicode-range: U+0100-02BA; }
  @font-face { font-family: MR; font-weight: 200 800; src: url(${font("manrope-latin-wght-normal.woff2")}); }
  @font-face { font-family: MR; font-weight: 200 800; src: url(${font("manrope-latin-ext-wght-normal.woff2")}); unicode-range: U+0100-02BA; }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  body { background: #f6f1eb; color: #221b17; font-family: MR; overflow: hidden; position: relative; font-variant-numeric: lining-nums; }
  em { font-style: italic; color: #7c5c46; }
`;

// csukott szem pillákkal (ugyanaz a forma, mint a logóban)
const EYE = (w, sw = 1.5, stroke = "#221b17") => `<svg width="${w}" viewBox="0 0 40 40"><path d="M6 17c4.2 5.6 9 8.4 14 8.4s9.8-2.8 14-8.4" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/><g fill="none" stroke="${stroke}" stroke-width="${sw * 0.8}" stroke-linecap="round"><path d="M11.2 21.6l-2 3.8"/><path d="M15.4 24l-1.1 4.3"/><path d="M20 25l0 4.6"/><path d="M24.6 24l1.3 4.4"/><path d="M28.8 21.6l2.4 3.9"/><path d="M32 19l3 3"/></g></svg>`;

const og = `<style>${base}
  body { background: radial-gradient(60% 80% at 85% 20%, #ead9ce, transparent 70%), #f6f1eb; }
  .wrap { position: absolute; left: 80px; top: 70px; bottom: 64px; width: 620px; display: flex; flex-direction: column; }
  .brand { font: 600 13px/1 MR; letter-spacing: .3em; text-transform: uppercase; color: #7c5c46; }
  h1 { margin-top: auto; font: 300 112px/.92 CG; letter-spacing: -.035em; }
  p { margin-top: 30px; font: 500 21px/1.4 MR; color: #5b5048; }
  .arch { position: absolute; right: 80px; top: 60px; bottom: 60px; width: 380px; border-radius: 999px 999px 22px 22px;
    background: linear-gradient(170deg, #f3e7de, #e8d6ca 55%, #dcc3b3); box-shadow: 0 50px 80px -50px rgba(90,55,35,.6);
    display: grid; place-items: center; }
  .arch::before { content: ""; position: absolute; inset: 12px; border-radius: inherit; border: 1px solid rgba(255,255,255,.6); }
  .arch span { position: absolute; bottom: 44px; font: italic 300 76px/1 CG; color: rgba(255,255,255,.8); }
</style>
<div class="wrap">
  <div class="brand">Lashes by Tordai Mónika</div>
  <h1>Pillantás,<br>ami <em>megmarad.</em></h1>
  <p>UV szempilla-építés · lifting · oktatás<br>Füllyukasztás · svédmasszázs · online foglalás</p>
</div>
<div class="arch">${EYE(250, 0.6)}<span>Lashes</span></div>`;

const icon = `<style>${base} body { display: grid; place-items: center; background: linear-gradient(170deg, #f3e7de, #e2cbbd); }</style>${EYE(140, 1.1)}`;

const browser = await chromium.launch();
const shot = async (html, w, h, file, type) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(ROOT, "assets", file), type, ...(type === "jpeg" ? { quality: 88 } : {}) });
  await page.close();
  console.log("kész:", file);
};
await shot(og, 1200, 630, "og.jpg", "jpeg");
await shot(icon, 180, 180, "apple-touch-icon.png", "png");
await browser.close();
