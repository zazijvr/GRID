# GRID – texty pro Google Play

## Název aplikace (max. 30 znaků)

```
GRID – neonový přehrávač
```

## Stručný popis (max. 80 znaků)

```
Hudba z telefonu s neonovou vizualizací, ekvalizérem a vlastními playlisty.
```

## Úplný popis (max. 4000 znaků)

```
GRID je hudební přehrávač od Zažij VR, ve kterém hudbu nejen slyšíš, ale i vidíš. Pusť si skladby uložené v telefonu a sleduj, jak se na obrazovce rozzáří neonová vizualizace, která pulzuje přesně do rytmu.

🎆 NEONOVÁ VIZUALIZACE
Šest efektů, které reagují na basy, výšky i každý úder bubnu:
• Neon Ring – zářící kruh spektra
• Neon Wave – vlnící se neonové vlny
• Neon Equalizer – svítící sloupce ekvalizéru
• Neon Hex – tunel z šestiúhelníků
• Neon Lasers – laserová show jako na párty
• Neon Galaxy – spirálová galaxie částic
Efekty přepneš jedním ťuknutím, nebo je nech střídat automaticky.

🎚️ 10PÁSMOVÝ EKVALIZÉR
Doladíš zvuk přesně podle sebe, nebo si vybereš předvolbu: Dance, Energy, Vocal, Epic, Relax a vlastní nastavení.

📂 TVOJE HUDBA, TVOJE PLAYLISTY
• Přidej skladby z telefonu (MP3, FLAC, WAV, OGG, Opus, M4A/AAC)
• Ulož si výběr jako playlist – „Na cestu“, „Party mix“, „Večerní chill“…
• Náhodné pořadí a opakování skladby i celého playlistu
• Playlist zůstane uložený i po zavření aplikace

🎧 HRAJE I NA POZADÍ
• Hudba hraje dál se zhasnutou obrazovkou i v jiné aplikaci
• Ovládání v oznámení a na zamykací obrazovce
• Funguje s tlačítky na sluchátkách, Bluetooth a hodinkách
• Po vytažení sluchátek se přehrávání samo pozastaví

🔒 BEZ REKLAM A BEZ SLEDOVÁNÍ
GRID nepotřebuje účet ani internet. Nesbírá žádná data, neobsahuje reklamy a tvoje hudba nikam neodchází – zůstává jen v telefonu.

Vytvořilo Zažij VR – pojízdná virtuální realita.
```

## Co je nového ve verzi 1.2.1 (max. 500 znaků)

```
• Neonová záře visualizeru už nezmizí po přepnutí aplikace nebo skladby
• Hlasitost se ovládá tlačítky telefonu (sdílená se systémem)
• Po přerušení hovorem se správně zobrazí pauza
• Nápověda k výběru více skladeb najednou
• Drobné opravy a vylepšení
```

---

## Grafika (složka `store/`)

| Položka v Play Console     | Soubor                          | Rozměr        |
|----------------------------|---------------------------------|---------------|
| Ikona aplikace             | `icon-512.png`                  | 512 × 512     |
| Hlavní grafika             | `feature-graphic.png`           | 1024 × 500    |
| Snímky obrazovky – telefon | `screenshots/01–09-*.png`       | 1080 × 1920   |

Snímky jsou ze skutečné aplikace s ukázkovými (syntetickými, autorsky volnými) skladbami.
Play Console přijme 2–8 snímků. Doporučené pořadí, když vybíráš 8:
02-ring, 03-galaxy, 06-equalizer, 05-hex, 07-seznam, 08-ekvalizer, 09-playlisty, 01-start.

Ikonu a hlavní grafiku lze přegenerovat: `python3 scripts/gen-store-assets.py`

## Bezpečnost dat (formulář „Data safety“)

- Shromažďuje aplikace data? **Ne**
- Sdílí data s třetími stranami? **Ne**
- (Aplikace nemá síťovou komunikaci; skladby a playlisty jsou uložené jen v telefonu,
  zálohování do cloudu je vypnuté.)

## Skládací telefony a tablety (`store/screenshots-skladaci/`)

Play Console chce u skládacích zařízení aspoň 1 snímek rozloženého displeje v poměru 1:1 a 4:3
a 1 snímek složeného telefonu na výšku v poměru 10:16:

| Poměr | Soubory | Rozměr |
|-------|---------|--------|
| 1:1 (rozložený) | `1x1-*.png` | 1760 × 1760 |
| 4:3 (rozložený) | `4x3-*.png` | 2048 × 1536 |
| 10:16 (složený, na výšku) | `10x16-*.png` | 1080 × 1728 |
