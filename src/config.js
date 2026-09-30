// A szalon minden beállítása egy helyen. Az oldal (public/) is innen kapja meg az árlistát és a nyitvatartást
// a /api/config címen keresztül, így árat, időtartamot vagy nyitvatartást csak itt kell átírni.

export const SALON = {
  name: "Lashes by Tordai Mónika",
  timezone: "Europe/Budapest",

  // Heti nyitvatartás (0 = vasárnap … 6 = szombat). null = zárva.
  hours: {
    0: null,
    1: null,
    2: ["09:00", "18:00"],
    3: ["10:00", "19:00"],
    4: ["09:00", "18:00"],
    5: ["09:00", "17:00"],
    6: ["09:00", "14:00"],
  },
  closedOnHolidays: true, // magyar munkaszüneti napokon zárva

  slotStep: 30, // ennyi percenként lehet kezdeni
  buffer: 15, // két vendég között (rendrakás, fertőtlenítés), perc
  minLeadMinutes: 180, // legalább ennyivel előre lehet online foglalni
  horizonDays: 60, // legfeljebb ennyi napra előre
  cancelHours: 24, // eddig lehet online lemondani
  maxActivePerPhone: 2, // ennyi jövőbeli foglalása lehet egy telefonszámnak
};

// Szolgáltatások. Az "id" soha ne változzon (a foglalások erre hivatkoznak), a többi szabadon átírható.
// bookable: false → az árlistában szerepel, de online nem foglalható (pl. oktatás: telefonon egyeztetve)
export const SERVICES = [
  { id: "klasszikus", group: "Szempilla-építés · UV technológia", name: "Klasszikus 1:1", duration: 120, price: 16000,
    desc: "Minden saját pillára egy műpilla. Természetes, mégis hangsúlyos, mintha csak a saját pilláid lennének — a legjobb napodon." },
  { id: "light-volume", group: "Szempilla-építés · UV technológia", name: "Light volume 2–3D", duration: 150, price: 18500,
    desc: "Könnyed legyezők, puhább, teltebb hatás. A klasszikus és a volume közötti arany középút." },
  { id: "volume", group: "Szempilla-építés · UV technológia", name: "Volume 4–6D", duration: 150, price: 21000,
    desc: "Kézzel formázott, pehelykönnyű legyezők. Dús, bársonyos keret, ami nappal és este is megállja a helyét." },
  { id: "mega-volume", group: "Szempilla-építés · UV technológia", name: "Mega volume", duration: 180, price: 24000,
    desc: "A legdúsabb, legsötétebb vonal — drámai, de a vékony pillák miatt továbbra is könnyű viselet." },
  { id: "eltavolitas", group: "Szempilla-építés · UV technológia", name: "Műszempilla eltávolítás", duration: 30, price: 4000,
    desc: "Kíméletes, a saját pillákat védő eltávolítás." },

  { id: "toltes-klasszikus", group: "Töltés", name: "Klasszikus töltés", duration: 90, price: 11000,
    desc: "2–3 héten belül, ha a pillák legalább 40%-a megvan. Kinőtt pillák cseréje, hézagok pótlása." },
  { id: "toltes-volume", group: "Töltés", name: "Volume töltés", duration: 105, price: 13500,
    desc: "Light volume, volume vagy mega volume szett frissítése 2–3 héten belül." },

  { id: "lifting", group: "Lifting", name: "Pillalifting festéssel", duration: 60, price: 12000,
    desc: "A saját pillák ívének emelése és festése. 6–8 hétig tart, semmi karbantartást nem igényel." },

  { id: "fullyukasztas", group: "Füllyukasztás", name: "Füllyukasztás", duration: 30, price: 6000,
    desc: "Gyors, kíméletes füllyukasztás steril eszközökkel, ápolási tanácsokkal." },

  { id: "masszazs-30", group: "Svédmasszázs", name: "Hát–váll–nyak masszázs", duration: 30, price: 6000,
    desc: "Célzott svédmasszázs a leggyakrabban feszülő területekre — ülőmunka után kész felüdülés." },
  { id: "masszazs-60", group: "Svédmasszázs", name: "Svédmasszázs, teljes test", duration: 60, price: 11000,
    desc: "Klasszikus, lazító teljes testes svédmasszázs a keringésért és a mély ellazulásért." },
  { id: "masszazs-90", group: "Svédmasszázs", name: "Svédmasszázs, 90 perc", duration: 90, price: 15000,
    desc: "Ráérős, teljes testes kezelés extra figyelemmel a hátra és a vállakra." },

  { id: "oktatas-alap", group: "Szempilla-oktatás", name: "Klasszikus alaptanfolyam", duration: 480, price: null, bookable: false,
    desc: "Kezdőknek: elmélet, higiénia, izolálás, felhelyezés UV technológiával, gyakorlás modellen. Kis létszámban vagy egyénileg." },
  { id: "oktatas-volume", group: "Szempilla-oktatás", name: "Volume továbbképzés", duration: 480, price: null, bookable: false,
    desc: "Már dolgozó stylistoknak: legyezőkészítés, pillatérképek, a volume szettek titkai." },
];
