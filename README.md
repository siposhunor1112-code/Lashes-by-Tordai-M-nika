# Lashes by Tordai Mónika – weboldal online időpontfoglalással

Prémium, letisztult egyoldalas weboldal szempilla-stúdiónak, **saját online foglalórendszerrel**: a vendég élőben látja,
melyik napon hány szabad időpont van, mi foglalt, mi zárva – és pár kattintással foglal. Mónika egy jelszóval védett
admin oldalon látja a foglalásokat, felvehet telefonos foglalást, és letilthat napokat (szabadság, továbbképzés).

Cloudflare Workers-en fut: a `public/` a weboldal, a `src/` a foglalási rendszer. Külön adatbázist nem kell létrehozni.

## Fájlok

- `public/` – a weboldal
  - `index.html` – az oldal szerkezete és szövegei
  - `styles.css` – megjelenés (színek a `:root` változókban)
  - `script.js` – szem-animáció, árlista, naptár, időpontválasztó, foglalás, „saját foglalásaim”
  - `lemondas.html` + `lemondas.js` – a vendég itt nézheti meg / mondhatja le a foglalását (a foglaláskor kapott linkkel)
  - `admin.html` + `admin.js` + `admin.css` – Mónika felülete (`/admin`)
  - `adatvedelem.html` – adatkezelési tájékoztató
  - `404.html`, `robots.txt`, `_headers` (biztonsági fejlécek), `assets/` (ikonok, megosztási kép, betűtípusok)
- `src/config.js` – **minden beállítás egy helyen**: szolgáltatások, árak, időtartamok, nyitvatartás, foglalási szabályok
- `src/schedule.js` – szabad időpontok kiszámítása (nyitvatartás, ünnepnapok, szünetek, letiltások)
- `src/worker.js` – az API (`/api/...`) és a foglalásokat tároló `Naptar` Durable Object (SQLite)
- `tests/` – a naptár-logika tesztjei (`npm test`)
- `tools/images.js` – újragyártja a megosztási képet és az iPhone-ikont (`node tools/images.js`, Playwright kell hozzá)
- `wrangler.jsonc` – Cloudflare-beállítás

## Így működik a foglalás

1. **Szolgáltatás** – csoportosítva (szempilla-építés, töltés, lifting & szemöldök, egyéb), idővel és árral.
2. **Időpont** – havi naptár; minden napon látszik, hány szabad időpont van („14 szabad”, „még 2”, „betelt”,
   „zárva”, „ünnep”). A nap kiválasztása után az összes kezdési időpont látszik: **szabad**, **foglalt** (áthúzva,
   csíkozva) vagy **már nem foglalható**. Betelt napnál egy gomb a következő szabad napra ugrik.
   A rendszer automatikusan az első szabad napot nyitja meg. A naptár percenként frissül, ha nyitva van.
3. **Adatok** – név, telefon, e-mail (nem kötelező), megjegyzés, „most jövök először”, feltételek elfogadása;
   mellette „jegy” az összegzéssel és az árral.
4. **Kész** – foglalási kód, **naptárba mentés (.ics, egy nappal előtte emlékeztetővel)**, lemondási link másolása.
   A foglalást a böngésző megjegyzi: visszatéréskor a foglalási rész tetején ott a „Foglalásod … · Lemondás”.

Szabályok (`src/config.js`, `SALON`):
- 30 percenként lehet kezdeni, két vendég között 15 perc szünet
- a kezelésnek zárásig be kell fejeződnie
- legalább 3 órával előre, legfeljebb 60 napra előre lehet online foglalni
- online lemondás az időpont előtt 24 óráig, utána csak telefonon
- egy telefonszámhoz legfeljebb 2 jövőbeli foglalás
- magyar munkaszüneti napokon (a húsvéti és pünkösdi napokat is beleértve) zárva
- két ember **nem foglalhatja le ugyanazt az időpontot**: minden foglalás egyetlen Durable Objecten megy át
  (6 párhuzamos kérésből pontosan 1 megy át – kipróbálva)
- védelem: csak a saját oldalról lehet írni, robotcsapda-mező, IP-nkénti korlát, a régi (1 évnél régebbi)
  foglalások automatikusan törlődnek

## Admin felület – `/admin`

- belépés jelszóval (`ADMIN_PASSWORD`)
- foglalások napokra bontva (7 / 30 / 60 nap, elmúlt 30 nap), telefonszám egy koppintással hívható, megjegyzés,
  „első alkalom” és „telefonos” címkék, várható bevétel; foglalás lemondása
- **telefonos foglalás felvétele** – ütközésnél rákérdez, hogy mégis rögzítse-e
- **szabadnap / zárt sáv** – egy nap, több nap, vagy csak pár óra (pl. ebédszünet), megjegyzéssel;
  a vendégek „zárva”-ként látják

## Élesítés (Cloudflare)

1. Cloudflare → Workers & Pages → Create → Import a repository → ez a repó. A build parancs üres maradhat,
   a deploy parancs: `npx wrangler deploy`.
2. Settings → Variables and Secrets → **Secret**: `ADMIN_PASSWORD` = Mónika jelszava. Enélkül az admin nem működik.
3. Nem kötelező értesítések:
   - `NTFY_TOPIC` – értesítés Mónika telefonjára minden új foglalásról és lemondásról. Telepítsd az ingyenes
     **ntfy** appot, iratkozz fel egy hosszú, kitalálhatatlan témanévre (pl. `lashes-tm-8f3k2q9x`), és ugyanezt
     írd be ide.
   - `RESEND_API_KEY` + `MAIL_FROM` (+ `SALON_EMAIL`) – visszaigazoló e-mail a vendégnek (resend.com, saját
     domain kell hozzá), és másolat Mónikának.

Helyben: `npm install`, majd `.dev.vars` fájlba `ADMIN_PASSWORD=valami`, és `npm run dev` → http://localhost:8787.

## Megjelenés

- Paletta: elefántcsont papír, púder- és homoktónusok, eszpresszó tinta, egyetlen bronz-nude kiemelőszín;
  egy sötét szekció (Rólam) és sötét lábléc
- Betűk saját tárhelyről (SIL Open Font License): **Cormorant** (címek, dőlt kiemelések) és **Manrope** (szöveg)
- Nyitókép: boltíves „tükör”, benne csukott szem – a pillák betöltéskor egyenként kerülnek fel a belső saroktól
  kifelé, a külső felén volume-legyezőkkel, mint egy valódi szettnél. Mellette élő **„Legközelebbi szabad
  időpont”** jelzés
- Szekciók: Szolgáltatások & árak (étlapszerű) · Az élmény (4 lépés) · Rólam · Online foglalás · Tudnivalók (GYIK) ·
  Kapcsolat (nyitvatartás a mai nap kiemelésével, „Most nyitva / zárva”)
- Telefonra optimalizálva (390 és 320 px-en is): nincs vízszintes görgetés, legalább 44 px-es érintési felületek,
  alul lebegő „Szabad időpontok” gomb, amely elbújik, ha a foglalás vagy a lábléc látszik
- Aki kikapcsolta az animációkat, annak minden azonnal kész

## ⚠️ Élesítés előtt kötelező kicserélni

Tordai Mónikáról nincs nyilvános adat a neten, ezért ezek **helyőrzők**:

| Mi | Hol |
| --- | --- |
| Telefonszám (`+36 30 000 0000`) | `public/index.html` (3 helyen + strukturált adat), `public/lemondas.js` (`PHONE`), `public/adatvedelem.html` |
| Cím (`Budapest, Példa utca 1.`) | `public/index.html` (kapcsolat + strukturált adat + térképlink), `public/adatvedelem.html` |
| Instagram (`@lashesbytordaimonika`) | `public/index.html` (2 helyen) |
| Árak, időtartamok, szolgáltatások | `src/config.js` (`SERVICES`) |
| Nyitvatartás | `src/config.js` (`SALON.hours`) és a strukturált adat az `index.html` fejében |
| „Rólam” szöveg, a „TM” monogram helyére fotó | `public/index.html` (`#monika`) |
| Szabályok (lemondás, késés, töltés feltétele) | `public/index.html` (`#tudnivalok`), `src/config.js` |
| Tények a nyitóképen (1:1, 0 Ft eltávolítás) | `public/index.html` (`.facts`) |

A `styles.css` és a `script.js` hivatkozásában verziószám van (`?v=1`): módosítás után érdemes növelni.
