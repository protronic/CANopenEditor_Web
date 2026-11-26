# Plan: Metadaten (mehrsprachige Texte) im Editor und im C-Generator

| | |
|---|---|
| **Stand** | Entwurf zur Abstimmung, 26.11.2026 |
| **Betrifft** | `protronic/CANopenEditor_Web` (Oberfläche) und `protronic/CANopenEditor` (EDSSharp, C-Generator) |
| **Noch nichts umgesetzt** | Dieses Dokument ist nur der Plan. Offene Entscheidungen stehen in Abschnitt 9. |

---

## 1. Ziel in Kurzform

Zu jedem Objekt im Object Dictionary (OD) sollen Texte gepflegt werden können: kurze und lange Bezeichnungen für die Touch-Oberfläche, Tooltips und Beschreibungen für die Weboberfläche, alles in mehreren Sprachen.

1. Aus einem bestehenden OD entsteht ein **Meta-Projekt** (ein „Meta-Clone“) mit derselben Adressstruktur.
2. Der Editor bekommt einen **Meta-Editor**, dessen Auswahl mit dem OD gekoppelt ist.
3. Der C-Export erzeugt für ein Meta-Projekt **`meta.c` / `meta.h`** statt `OD.c` / `OD.h`: ein platzsparendes Sprach-Wörterbuch, das sich direkt in C und LVGL verwenden lässt.

## 2. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Meta-Projekt** | Eigene Datei neben dem OD. Enthält nur Texte, keine Datentypen oder Werte. |
| **Meta-Eintrag** | Die Texte zu einer Adresse (Index + Subindex) im Meta-Projekt. |
| **Meta-Adresse** | Angabe an einem OD-Objekt, welcher Meta-Eintrag gilt. Standard: die eigene Adresse. |
| **Textart** | Eine Sorte Text mit eigener Länge, z. B. „Bezeichnung kurz“ oder „Tooltip“. |

## 3. Ausgangslage

- Der **Web-Editor** (Angular) liest und schreibt nur XDD. Jedes Objekt hat genau einen Namen, eine Beschreibung und eine Denotation, alles einsprachig (`lang="en"`).
- Eigene Zusatzangaben stehen in der XDD als `CO_*`-Eigenschaften (z. B. `CO_countLabel`, `CO_storageGroup`). Diesen Weg kennen Web-Editor und libEDSsharp bereits.
- Den **C-Export** macht der Web-Editor nicht selbst. Er ruft dafür EDSSharp auf (Electron-App), und auch der Firmware-Build nutzt EDSSharp über die `latest`-URL.
- Die Auswahl im OD (Index, Subindex) merkt sich der Web-Editor schon je Gerät (`ViewStateService`). Daran lässt sich die Kopplung zum Meta-Editor anhängen.

## 4. Konzept

### 4.1 Meta-Projekt als Clone des OD

- Aktion **„Meta-Projekt aus OD erzeugen“**: legt für die gewählten Objekte je einen Meta-Eintrag mit **derselben Adresse** (Index, Subindex) an.
- Im Dialog wählbar: Adressbereiche (Vorschlag: Hersteller- und Profilbereich ab 0x2000 vorausgewählt, Kommunikationsobjekte optional), Sprachen und die Ausgangssprache.
- Vorbelegung: Der OD-Name wird zur langen Bezeichnung, die OD-Beschreibung zum Tooltip (jeweils in der Ausgangssprache). So startet niemand mit leeren Feldern.
- Die Adressen werden **vorerst** 1:1 übernommen. Im C-Code arbeitet die Firmware aber mit fortlaufenden Meta-IDs (Abschnitt 6). Eine spätere Entkopplung von den OD-Adressen ändert deshalb die Firmware-Schnittstelle nicht.

### 4.2 Meta-Adresse im OD

Manche Texte passen zu mehreren OD-Objekten, z. B. bei PDOs: Die Kommunikationsparameter 0x1400, 0x1401, 0x1402 … brauchen alle dieselben Texte.

- Jedes OD-Objekt und jeder Subindex bekommt ein optionales Feld **Meta-Adresse**.
- Gespeichert wird es in der XDD als Eigenschaft `CO_metaRef` (Wert z. B. `0x1400` oder `0x1400:01`).

**Auflösung für einen OD-Eintrag (Index, Sub):**

1. Hat der Subindex selbst eine Meta-Adresse → diese gilt.
2. Sonst: Hat das Objekt eine Meta-Adresse → deren Index mit demselben Subindex.
3. Sonst: die eigene Adresse.

Beispiel: Am Objekt 0x1401 wird die Meta-Adresse `0x1400` eingetragen. Dann zeigen 0x1401:01, 0x1401:02 … automatisch auf die Meta-Einträge 0x1400:01, 0x1400:02 …

### 4.3 Textarten und Sprachen

Vorschlag für die Textarten (Namen und Längen sind je Projekt einstellbar):

| Textart | Ziel | Richtwert Länge | Im C-Export |
|---|---|---|---|
| `label_s` Bezeichnung kurz | Touch | 10 Zeichen | ja |
| `label_m` Bezeichnung mittel | Touch | 20 Zeichen | ja |
| `label_l` Bezeichnung lang | Touch | 40 Zeichen | ja |
| `tooltip` | Web, optional Touch | 120 Zeichen | nur ausgewählte Einträge |
| `description` Beschreibung | Web | ein Absatz | nein |
| `details` | Web | frei | nein |

- **Sprachen:** Liste je Projekt (z. B. `de`, `en`), eine davon ist die Rückfallsprache.
- **Fehlt eine Übersetzung**, liefert die Firmware den Text der Rückfallsprache.
- **Auswahl für den C-Export** auf zwei Ebenen, damit es nicht zu viel wird:
  - je Textart: `alle` / `nur ausgewählte` / `nicht`,
  - je Meta-Eintrag ein Häkchen „Tooltip in die Firmware“.

### 4.4 Dateiformat

Vorschlag: eigene JSON-Datei neben der XDD, z. B. `geraet.xdd` + `geraet.meta.json`. Gründe: gut in Git vergleichbar, einfach für Web-Editor und EDSSharp, und die XDD bleibt eine normale XDD.

```json
{
  "format": "canopen-meta",
  "version": 1,
  "source": "geraet.xdd",
  "languages": ["de", "en"],
  "fallback": "de",
  "texts": [
    { "id": "label_s", "target": "touch", "maxLength": 10,  "cExport": "all" },
    { "id": "label_m", "target": "touch", "maxLength": 20,  "cExport": "all" },
    { "id": "tooltip", "target": "web",   "maxLength": 120, "cExport": "selected" }
  ],
  "entries": [
    {
      "index": "2100", "sub": "00", "ref": "Temperature",
      "cExport": ["tooltip"],
      "label_s": { "de": "Temp.",      "en": "Temp." },
      "label_m": { "de": "Temperatur", "en": "Temperature" },
      "tooltip": { "de": "Aktuelle Kesseltemperatur", "en": "Current boiler temperature" }
    }
  ]
}
```

`ref` ist der OD-Name zum Zeitpunkt des Abgleichs, nur als Orientierung für Menschen. Einträge sind nach Adresse sortiert, damit Git-Diffs klein bleiben.

Die mehrsprachigen `label`/`description`-Elemente der XDD (CiA 311) reichen hierfür nicht: Sie kennen nur eine Bezeichnung und eine Beschreibung je Sprache, und andere Werkzeuge verwerfen fremde Sprachen beim Speichern.

## 5. Oberfläche (Web-Editor)

### 5.1 Meta-Editor als neuer Reiter „Meta“

- Neben *Device Info / Object Dictionary / TX / RX* kommt der Reiter **Meta**. Er ist nur aktiv, wenn zum Gerät ein Meta-Projekt geladen ist; sonst bietet er „Meta-Projekt aus OD erzeugen“ an.
- **Links** die Liste der Meta-Einträge, aufgebaut wie im OD (Objekte, darunter Subindizes).
- **Rechts** die Texte des gewählten Eintrags: je Textart eine Zeile, je Sprache eine Spalte, mit Zeichenzähler und Markierung bei Überlänge.
- Zusätzlich eine **Tabellenansicht** (alle Einträge × Sprachen für eine Textart) zum zügigen Übersetzen, mit Filter „fehlende Übersetzungen“.
- Unter den Texten steht **„verwendet von“**: alle OD-Objekte, die auf diesen Eintrag zeigen. Ein Klick springt ins OD.
- Einstellungen des Meta-Projekts: Sprachen, Rückfallsprache, Textarten mit Länge und C-Export.

### 5.2 Kopplung der Auswahl

- Wählt man im OD einen Subindex, ist beim Wechsel in den Meta-Reiter der **zugehörige Meta-Eintrag** ausgewählt: der mit derselben Adresse oder, falls im OD eine Meta-Adresse gesetzt ist, der dort eingetragene (Regel aus 4.2).
- Umgekehrt führt die Auswahl im Meta-Editor zurück zum (ersten) verwendenden OD-Objekt.
- Im OD zeigt der Detailbereich eine Vorschau der Bezeichnung und einen Knopf „im Meta-Editor öffnen“.

### 5.3 Meta-Adresse im OD wählen

- Im Detailbereich des OD kommt das Feld **Meta-Adresse** dazu: Auswahl aus den vorhandenen Meta-Einträgen, Standard „eigene Adresse“.
- Gilt auch für Mehrfachauswahl (z. B. alle RPDO-Parameter markieren und einmal 0x1400 zuweisen) und beim Klonen von Objekten (Klone zeigen auf das Original).

### 5.4 Abgleich mit dem OD

- Aktion **„Mit OD abgleichen“**: neue OD-Objekte bekommen Meta-Einträge, für gelöschte OD-Objekte werden die Meta-Einträge als *verwaist* markiert (nicht gelöscht).
- Laufende Prüfungen: Meta-Adresse zeigt ins Leere, Meta-Eintrag wird von niemandem verwendet, Übersetzung fehlt, Text zu lang.

### 5.5 Laden und Speichern

- Beim Öffnen von `geraet.xdd` wird `geraet.meta.json` mitgeladen, wenn sie daneben liegt (Electron). Im Browser öffnet man die Meta-Datei zusätzlich von Hand.
- „Speichern“ schreibt beide Dateien; der Änderungsstatus wird je Datei geführt.

## 6. C-Export: `meta.c` / `meta.h`

### 6.1 Aufruf

Der Generator kommt in libEDSsharp und EDSSharp, weil Firmware-Build und Electron-App den C-Export schon dort holen.

```bash
EDSSharp --export-project --infile geraet.meta.json --outdir ./out
         [--od geraet.xdd] [--langs de,en] [--texts label_s,label_m,tooltip]
```

- Ist die Eingabe ein Meta-Projekt, entstehen `meta.c` / `meta.h` statt `OD.c` / `OD.h`.
- Das zugehörige OD wird über `source` gefunden (oder `--od`). Der Generator braucht es für die Zuordnung OD-Adresse → Meta-Eintrag und um deaktivierte Objekte wegzulassen.
- `--langs` und `--texts` schränken die Ausgabe zusätzlich ein, ohne das Projekt zu ändern.

### 6.2 Datenstruktur

Ziel: wenig Flash, kein RAM, kein Kopieren, schneller Zugriff.

| Baustein | Aufbau | Zweck |
|---|---|---|
| **Meta-ID** | fortlaufende Nummer 0 … N−1 je Meta-Eintrag | direkter Tabellenzugriff ohne Suche |
| **OD-Zuordnung** | sortierte Tabelle (Index, Sub) → Meta-ID, 5 Byte je OD-Adresse | Suche per Halbierung; mehrere OD-Adressen dürfen dieselbe ID haben |
| **String-Pool** je Sprache | ein zusammenhängender UTF-8-Block, jeder Text nur einmal | gleiche Texte (z. B. kurz = mittel, Einheiten) kosten nur einmal Platz |
| **Offset-Tabelle** je Sprache und Textart | 16-Bit-Offset in den Pool, Position = Meta-ID | 2 statt 4 Byte je Text gegenüber Zeigern |
| **dünn besetzte Tabelle** | sortierte Paare (Meta-ID, Offset) | für Textarten mit wenigen Einträgen, z. B. Tooltips |

- Offset 0 bedeutet „kein Text“. Dann greift die Rückfallsprache.
- Der Generator wählt selbst zwischen dichter und dünner Tabelle und wechselt auf 32-Bit-Offsets, falls ein Pool größer als 64 KiB wird.
- Alles ist `const` und liegt im Flash. RAM-Bedarf: nur die aktuelle Sprache (1 Byte).
- Weil mit Offsets statt Zeigern gearbeitet wird, ist ein Sprachblock verschiebbar. Sprachen später aus externem Flash nachzuladen bleibt damit möglich.

Skizze der erzeugten Dateien:

```c
/* meta.h */
typedef enum { META_LANG_DE, META_LANG_EN, META_LANG_COUNT } meta_lang_t;
typedef enum { META_TEXT_LABEL_S, META_TEXT_LABEL_M, META_TEXT_TOOLTIP, META_TEXT_COUNT } meta_text_t;
typedef uint16_t meta_id_t;
#define META_ID_NONE      0xFFFFu
#define META_ENTRY_COUNT  187u

#define META_H2100        12u            /* Temperature, Namen wie OD_ENTRY_H2100 */

meta_id_t   meta_find(uint16_t index, uint8_t subIndex);   /* OD-Adresse -> Meta-ID */
const char *meta_text(meta_id_t id, meta_text_t text);     /* aktuelle Sprache, mit Rückfall */
void        meta_set_language(meta_lang_t lang);
```

```c
/* meta.c (Ausschnitt) */
static const uint16_t od_index[] = { 0x1400, 0x1400, 0x1401, 0x1401, /* ... */ };
static const uint8_t  od_sub[]   = {      1,      2,      1,      2, /* ... */ };
static const uint16_t od_id[]    = {      0,      1,      0,      1, /* ... */ };  /* 0x1401 nutzt 0x1400 */

static const char pool_de[] =
    "\0"                 /*  0: kein Text   */
    "Temp.\0"            /*  1              */
    "Temperatur\0";      /*  7              */

static const uint16_t de_label_s[META_ENTRY_COUNT] = { /* ... */ 1, /* ... */ };
static const uint16_t de_label_m[META_ENTRY_COUNT] = { /* ... */ 7, /* ... */ };
```

Rechenbeispiel (Annahme: 200 Meta-Einträge, 250 OD-Adressen, 3 Bezeichnungslängen, 2 Sprachen): Tabellen 200 × 3 × 2 × 2 Byte = 2,4 kB, OD-Zuordnung 250 × 5 Byte ≈ 1,3 kB, dazu die Texte selbst. Mit Zeigern wären allein die Tabellen 4,8 kB.

### 6.3 Verwendung mit LVGL

```c
lv_label_set_text_static(label, meta_text(META_H2100, META_TEXT_LABEL_M));
/* oder aus der OD-Adresse: */
lv_label_set_text_static(label, meta_text(meta_find(0x2100, 0), META_TEXT_LABEL_S));
```

- `lv_label_set_text_static` kopiert nicht. Die Texte bleiben im Flash, es wird kein Heap gebraucht.
- Nach `meta_set_language()` müssen sichtbare Labels neu gesetzt werden. Dafür ist eine kleine, handgeschriebene Hilfsdatei `meta_lvgl.c` vorgesehen (Label merkt sich ID und Textart und aktualisiert sich bei Sprachwechsel).
- Zusätzlich erzeugt der Generator **`meta_glyphs.txt`**: alle in den exportierten Texten vorkommenden Zeichen. Damit lassen sich die LVGL-Schriften mit `lv_font_conv` auf die wirklich benötigten Zeichen beschränken. Das spart meist mehr Flash als jede Optimierung an den Texten.

### 6.4 Bewusst nicht im ersten Schritt

- **Kompression** der Texte. Sie bräuchte einen RAM-Puffer und würde `set_text_static` verhindern. Erst sinnvoll, wenn die Messung zeigt, dass der Platz nicht reicht.
- **Zusammenlegen gemeinsamer Wortenden** (z. B. „Temperatur“ in „Übertemperatur“). Als spätere, rein generatorseitige Optimierung möglich, ohne Änderung an der Firmware.

## 7. Export für die Weboberfläche

- Aus demselben Meta-Projekt entsteht je Sprache eine JSON-Datei mit **allen** Textarten (`meta.de.json`, `meta.en.json`), Schlüssel ist die OD-Adresse (`"2100:00"`). Die Zuordnung über Meta-Adressen ist darin schon aufgelöst.
- Optional später: Ablage in CouchDB zusammen mit dem bestehenden Geräte-Dokument.

## 8. Arbeitspakete

| # | Paket | Repo | Umfang | Ergebnis |
|---|---|---|---|---|
| 1 | Formatbeschreibung `*.meta.json` (mit Schema und Beispiel) | beide | klein | verbindliche Grundlage für Editor und Generator |
| 2 | `CO_metaRef` lesen/schreiben | Web (XDD-Codec), libEDSsharp (XDD 1.1, Protobuf, EDS-Kommentar) | klein | Meta-Adresse geht bei keiner Konvertierung verloren, auch nicht in GUI 1 |
| 3 | Meta-Modell, Laden/Speichern, „aus OD erzeugen“, „abgleichen“ | Web | mittel | Meta-Projekt lässt sich anlegen und speichern |
| 4 | Meta-Reiter mit Detail- und Tabellenansicht, Prüfungen | Web | groß | Texte pflegen in allen Sprachen |
| 5 | Meta-Adresse im OD, Kopplung der Auswahl in beide Richtungen | Web | mittel | Ziel aus 5.2 und 5.3 |
| 6 | Generator `meta.c` / `meta.h` + `meta_glyphs.txt`, CLI-Anbindung | libEDSsharp, EDSSharp | groß | Abschnitt 6 |
| 7 | JSON-Export für die Weboberfläche | libEDSsharp, EDSSharp | klein | Abschnitt 7 |
| 8 | Export-Menü in der Electron-App, neues EDSSharp-Release | Web, CANopenEditor | klein | Export aus der Oberfläche |
| 9 | Beispiel im Demo-Netzwerk (`demo/`) mit LVGL-Hilfsdatei | CANopenEditor | klein | Vorlage für die Firmware |

**Reihenfolge:** 1 → 2 → 3 → (4, 5 und 6 parallel) → 7 → 8 → 9. Nach Paket 3 und 6 gibt es schon einen durchgehenden Weg von der Datei bis zum C-Code, auch wenn die Oberfläche noch einfach ist.

**Später, nach Bedarf:** CSV/Excel-Austausch für Übersetzer, Größenanzeige je Sprache im Editor, Einheiten und Wertetexte (z. B. 0 = Aus, 1 = Ein), Platzhalter in Texten (z. B. „Kanal %d“ für Arrays), ein Meta-Projekt für mehrere Geräte.

### Tests

- **Web:** Unit-Tests (vitest) für Codec, Auflösung der Meta-Adresse, Abgleich; der Meta-Editor wird vor dem Commit im Browser geprüft (Regel aus `AGENTS.md`).
- **Generator:** Unit-Tests für Pool, Tabellen und Rückfall; zusätzlich wird der erzeugte C-Code im CI mit `gcc -Wall -Wextra -Werror` gebaut und ein kleines Testprogramm liest jeden Text über `meta_find` / `meta_text` zurück und vergleicht ihn mit der Quelle.

## 9. Empfehlungen und offene Entscheidungen

| # | Frage | Empfehlung |
|---|---|---|
| 1 | Wo liegen die Texte? | Eigene Datei `*.meta.json` neben der XDD (statt in der XDD). |
| 2 | Wo liegt die Meta-Adresse? | Als `CO_metaRef` im OD (XDD), wie gewünscht „im Original-OD wählbar“. Alternative: Zuordnungstabelle in der Meta-Datei; dann bliebe die XDD unverändert, die Zuordnung ginge aber bei Indexänderungen außerhalb des Web-Editors verloren. |
| 3 | Wo läuft der Generator? | In EDSSharp (wie `OD.c`), nicht im Web-Editor. Dann nutzt der Firmware-Build dasselbe Werkzeug. |
| 4 | Welche Textarten und Längen? | Vorschlag aus 4.3, bitte Längen für eure Displays bestätigen. |
| 5 | Welche Sprachen zum Start, welche Rückfallsprache? | offen |
| 6 | Welche LVGL-Version (8 oder 9)? | Entscheidet nur über die Hilfsdatei `meta_lvgl.c`. LVGL 9.3 bringt ein eigenes Übersetzungsmodul mit Text-Schlüsseln mit; ein Adapter dafür wäre möglich, ist aber langsamer als der Zugriff über IDs. |
| 7 | Welche Objekte kommen in den Clone? | Vorschlag: ab 0x2000 vorausgewählt, Kommunikationsobjekte nur auf Wunsch. |
| 8 | Sollen Einheiten und Wertetexte gleich mit hinein? | Empfehlung: im Format vorsehen, Umsetzung später. |
| 9 | Welches Format erwartet die Weboberfläche? | Vorschlag: JSON je Sprache (Abschnitt 7). |

## 10. Risiken

- **OD und Meta laufen auseinander** (Objekt gelöscht oder umnummeriert). Gegenmittel: Abgleich im Editor, Warnungen im Generator, auf Wunsch Abbruch mit `--strict`.
- **Fremde Werkzeuge verwerfen `CO_metaRef`** (z. B. der unveränderte Upstream-Editor). Betrifft nur die Zuordnung, nicht die Texte. Die eigenen Werkzeuge erhalten sie nach Paket 2.
- **Flash-Bedarf** wächst mit jeder Sprache. Gegenmittel: Auswahl je Textart und Eintrag, Sprachen beim Export abwählbar, Größenangabe im Generator-Protokoll.
- **Zeichen fehlen in der LVGL-Schrift.** Gegenmittel: `meta_glyphs.txt` im Schrift-Build verwenden.
