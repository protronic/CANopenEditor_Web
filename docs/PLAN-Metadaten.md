# Plan: Metadaten (mehrsprachige Texte) im Editor und im C-Generator

| | |
|---|---|
| **Stand** | Entwurf 3, 26.11.2026 |
| **Betrifft** | `protronic/CANopenEditor_Web` (Oberfläche) und `protronic/CANopenEditor` (libEDSsharp, EDSSharp, C-Generator) |
| **Noch nichts umgesetzt** | Dieses Dokument ist nur der Plan. Die getroffenen Entscheidungen stehen in Abschnitt 10. |

**Geändert gegenüber Entwurf 2:** Die Entscheidungen vom 26.11. sind eingearbeitet: drei Textarten (16 / 128 / unbegrenzt), Deutsch und Englisch mit Rückfall auf Deutsch, Einheiten und Wertetexte von Anfang an, LVGL 9, Umsetzung zuerst im Fork.

---

## 1. Ziel in Kurzform

Zu jedem Objekt im Object Dictionary (OD) sollen Texte gepflegt werden können: eine Bezeichnung für die Touch-Oberfläche, Tooltip und Beschreibung für die Weboberfläche, dazu Einheit und Wertetexte, alles in mehreren Sprachen.

1. Aus einem bestehenden OD entsteht ein **Meta-Projekt** (ein „Meta-Clone“) mit derselben Adressstruktur, im selben Dateiformat wie das OD.
2. Der Editor bekommt einen **Meta-Editor**, dessen Auswahl mit dem OD gekoppelt ist.
3. Der C-Export erzeugt für ein Meta-Projekt **`meta.c` / `meta.h`** statt `OD.c` / `OD.h`: ein platzsparendes Sprach-Wörterbuch für C und LVGL.
4. Der **JSON-Export bleibt der vorhandene** und enthält die Texte automatisch.
5. Die Lösung bleibt **upstream-tauglich** (Projekt CANopenNode): kein eigenes Dateiformat, nur zusätzliche Angaben im vorhandenen.

## 2. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Projektformat** | Das Format von CANopenNode/CANopenEditor: XDD 1.1 mit `CO_*`-Eigenschaften, intern als Protobuf (`CanOpenDevice`), exportierbar als JSON. |
| **Meta-Projekt** | Eine normale Projektdatei in diesem Format, die zusätzlich Texte enthält. Entsteht als Kopie des OD. |
| **Meta-Eintrag** | Die Texte zu einer Adresse (Index + Subindex) im Meta-Projekt. |
| **Meta-Adresse** | Angabe an einem OD-Objekt, welcher Meta-Eintrag gilt. Standard: die eigene Adresse. |
| **Textart** | Eine Sorte Text, z. B. „Bezeichnung“ oder „Tooltip“. |
| **Wertetext** | Text zu einem bestimmten Wert eines Objekts, z. B. 0 = Aus, 1 = Ein. |

## 3. Ausgangslage

- **Formatkette in libEDSsharp:** XDD 1.1 ↔ Protobuf (`CanOpen.proto`) ↔ JSON. Der Export „CanOpenNode Protobuf (json)“ schreibt das gesamte Protobuf-Modell. Neue Felder im Modell erscheinen dort von selbst.
- **Erweiterungen** macht Upstream über `property`-Elemente an den XDD-Parametern (`CO_countLabel`, `CO_storageGroup` …) und über zusätzliche Protobuf-Felder, die ältere Leser ignorieren.
- **Sprachen:** Heute wird je Objekt genau ein Name und eine Beschreibung geführt, fest mit `lang="en"`.
- **Exporter** melden sich in libEDSsharp über `ExporterDescriptor` an und stehen damit automatisch in der CLI (`--type`) und in den Oberflächen zur Auswahl.
- Der **Web-Editor** (Angular) liest und schreibt nur XDD. Für C und JSON ruft er EDSSharp auf; auch der Firmware-Build nutzt EDSSharp.
- Die Auswahl im OD (Index, Subindex) merkt sich der Web-Editor schon je Gerät. Daran lässt sich die Kopplung zum Meta-Editor anhängen.

## 4. Leitlinien für die Upstream-Tauglichkeit

1. **Kein neues Dateiformat.** Nur zusätzliche, optionale Angaben im vorhandenen Format. Dateien ohne Texte werden unverändert gelesen und geschrieben.
2. **Die Erweiterungswege von Upstream nutzen:** `CO_*`-Eigenschaften in der XDD, additive Protobuf-Felder, Anmeldung des neuen Exporters über `ExporterDescriptor`.
3. **Bestehendes Verhalten bleibt gleich.** `OD.c` / `OD.h` und alle vorhandenen Exporte ändern sich nicht; das sichern Regressionstests.
4. **Allgemein halten.** Der Generator erzeugt reines C99 ohne Abhängigkeit von LVGL oder von protronic. Die LVGL-Anbindung ist ein Beispiel außerhalb des Generators.
5. **Englisch** für Code, Kommentare, Bezeichner, Oberflächentexte und die Formatbeschreibung.
6. **Kleine, getrennte Schritte** mit Tests, die sich einzeln als Pull Request bei Upstream einreichen lassen (Abschnitt 9).
7. **Erst im Fork umsetzen, dann einreichen.** Die Namen der Eigenschaften stehen im Code an genau einer Stelle. Verlangt Upstream beim Einreichen andere Namen, liest der Code danach alte und neue.

## 5. Konzept

### 5.1 Meta-Projekt als Clone des OD

- Aktion **„Create meta project from OD“**: kopiert die gewählten Objekte in eine zweite Projektdatei, z. B. `geraet.xdd` → `geraet_meta.xdd`. Adressen (Index, Subindex) bleiben gleich.
- Das Meta-Projekt ist eine **gültige XDD**. Jedes Werkzeug, das XDD liest, kann es öffnen; die Struktur (Namen, Typen) stammt aus dem OD und dient als Orientierung.
- Im Dialog **vorausgewählt sind die Objekte ab 0x2000**. Kommunikationsobjekte (0x1000–0x1FFF) lassen sich dazunehmen.
- Vorbelegung: Der OD-Name wird zur Bezeichnung, die OD-Beschreibung zur Beschreibung. Im Dialog gibt man an, in welcher Sprache das OD geschrieben ist.
- Die Adressen werden **vorerst** 1:1 übernommen. Im C-Code arbeitet die Firmware mit fortlaufenden Meta-IDs (Abschnitt 7). Eine spätere Entkopplung von den OD-Adressen ändert deshalb die Firmware-Schnittstelle nicht.
- Weil es dasselbe Format ist, könnten die Texte auch direkt in der OD-Datei stehen. Der Clone bleibt trotzdem der vorgesehene Weg: Die Gerätedatei bleibt schlank, und Texte lassen sich von mehreren OD-Objekten gemeinsam nutzen.

### 5.2 Meta-Adresse im OD

Manche Texte passen zu mehreren OD-Objekten, z. B. bei PDOs: Die Kommunikationsparameter 0x1400, 0x1401, 0x1402 … brauchen alle dieselben Texte.

- Jedes OD-Objekt und jeder Subindex bekommt ein optionales Feld **Meta-Adresse**, gespeichert im Original-OD als Eigenschaft `CO_metaRef` (Wert z. B. `0x1400` oder `0x1400:01`).

**Auflösung für einen OD-Eintrag (Index, Sub):**

1. Hat der Subindex selbst eine Meta-Adresse → diese gilt.
2. Sonst: Hat das Objekt eine Meta-Adresse → deren Index mit demselben Subindex.
3. Sonst: die eigene Adresse.

Beispiel: Am Objekt 0x1401 wird die Meta-Adresse `0x1400` eingetragen. Dann zeigen 0x1401:01, 0x1401:02 … automatisch auf die Meta-Einträge 0x1400:01, 0x1400:02 …

### 5.3 Textarten, Einheiten, Wertetexte und Sprachen

| Textart | Kennung | Länge | Ziel | In `meta.c` |
|---|---|---|---|---|
| Bezeichnung | `label` | 16 Zeichen | Touch und Web | alle Einträge |
| Tooltip | `tooltip` | 128 Zeichen | Web, bei Bedarf Touch | nur ausgewählte Einträge |
| Beschreibung | `description` | unbegrenzt | Web | nein |
| Einheit | `unit` | Richtwert 8 Zeichen | Touch und Web | alle Einträge |
| Wertetext | `value.<Wert>` | 16 Zeichen | Touch und Web | alle Einträge |

- Die Längen sind Grenzen für die Warnung im Editor und je Projekt änderbar.
- **Sprachen zum Start:** Deutsch (`de`) und Englisch (`en`). Weitere lassen sich jederzeit ergänzen.
- **Rückfallsprache ist Deutsch.** Fehlt eine Übersetzung, liefert die Firmware den deutschen Text.
- **Einheit** (z. B. `°C`): wird meist nur einmal in der Rückfallsprache eingetragen und gilt dann über den Rückfall für alle Sprachen. Abweichungen je Sprache sind möglich (z. B. `Std.` / `h`).
- **Wertetexte** für Aufzählungen: je Wert ein Text je Sprache (0 = Aus, 1 = Ein, 2 = Auto). Texte für einzelne Bits sind nicht nötig, weil Bits im OD eigene Adressen haben und damit eigene Bezeichnungen bekommen.
- **Tooltip in der Firmware:** je Meta-Eintrag ein Häkchen, damit nur die wichtigsten Flash belegen.

### 5.4 Ablage im vorhandenen Format

Der technische Name und die Beschreibung eines Objekts (`<label lang="en">`, `<description lang="en">`) bleiben, wie sie sind. Aus dem Namen entstehen die C-Bezeichner, deshalb wird er nicht übersetzt.

| Angabe | XDD 1.1 | Protobuf (additiv) |
|---|---|---|
| Text je Textart und Sprache | Eigenschaft `CO_text:<Textart>:<Sprache>` am Parameter | `map<string, string> texts`, Schlüssel `<Textart>:<Sprache>` |
| Meta-Adresse | Eigenschaft `CO_metaRef` | `string metaRef` |
| Tooltip in die Firmware | Eigenschaft `CO_textExport` (Wert `tooltip`) | `repeated string textExport` |
| Projektangaben: Sprachen, Rückfallsprache, Längen, Quelle des Clones | `characteristic` unter `DeviceFunction/capabilities` (dort steht heute schon „SW library“) | Nachricht `textInfo` im Gerät |

Beispiel XDD (vereinfacht), ein Messwert und ein Objekt mit Wertetexten:

```xml
<parameter uniqueID="UID_PARAM_2100" access="read">
  <label lang="en">Boiler temperature</label>
  <property name="CO_text:label:de" value="Kesseltemp." />
  <property name="CO_text:label:en" value="Boiler temp." />
  <property name="CO_text:tooltip:de" value="Aktuelle Temperatur im Kessel" />
  <property name="CO_text:unit:de" value="°C" />
  <property name="CO_textExport" value="tooltip" />
</parameter>

<parameter uniqueID="UID_PARAM_2200" access="readWrite">
  <label lang="en">Operating mode</label>
  <property name="CO_text:label:de" value="Betriebsart" />
  <property name="CO_text:value.0:de" value="Aus" />
  <property name="CO_text:value.1:de" value="Ein" />
  <property name="CO_text:value.2:de" value="Auto" />
</parameter>
```

Dasselbe im vorhandenen JSON-Export (neu ist nur `texts`):

```json
"2100": {
  "name": "Boiler temperature",
  "objectType": "OBJECT_TYPE_VAR",
  "subObjects": {
    "00": {
      "dataType": "INTEGER16",
      "texts": {
        "label:de": "Kesseltemp.",
        "label:en": "Boiler temp.",
        "tooltip:de": "Aktuelle Temperatur im Kessel",
        "unit:de": "°C"
      },
      "textExport": ["tooltip"]
    }
  }
}
```

- **EDS** kennt keine Sprachen. Beim EDS-Export entfallen die Texte; die EDS bleibt gültig.
- Die mehrsprachigen Standard-Elemente der XDD (`<label lang="de">`) werden nicht benutzt, weil das erste `label` der technische Name ist und es dort nur eine Bezeichnung je Sprache gibt.

## 6. Oberfläche (Web-Editor)

### 6.1 Meta-Editor als neuer Reiter „Meta“

- Neben *Device Info / Object Dictionary / TX / RX* kommt der Reiter **Meta**. Er zeigt die Texte des zum Gerät gehörenden Meta-Projekts; gibt es noch keines, bietet er „Create meta project from OD“ an.
- **Links** die Liste der Meta-Einträge, aufgebaut wie im OD (Objekte, darunter Subindizes).
- **Rechts** der gewählte Eintrag:
  - Bezeichnung, Tooltip und Beschreibung: je Textart eine Zeile, je Sprache eine Spalte, mit Zeichenzähler und Markierung bei Überlänge;
  - Einheit;
  - Tabelle der Wertetexte (Wert, Deutsch, Englisch) mit Zeilen hinzufügen und löschen;
  - Häkchen „Tooltip in firmware“.
- Wertelisten lassen sich **kopieren und auf mehrere markierte Einträge anwenden**, damit „Aus / Ein“ nicht zwanzigmal getippt wird. In `meta.c` werden gleiche Listen ohnehin nur einmal abgelegt.
- Zusätzlich eine **Tabellenansicht** (alle Einträge × Sprachen für eine Textart) zum zügigen Übersetzen, mit Filter „fehlende Übersetzungen“.
- Unter den Texten steht **„used by“**: alle OD-Objekte, die auf diesen Eintrag zeigen. Ein Klick springt ins OD.
- Einstellungen des Meta-Projekts: Sprachen, Rückfallsprache, Längen.

### 6.2 Kopplung der Auswahl

- Wählt man im OD einen Subindex, ist beim Wechsel in den Meta-Reiter der **zugehörige Meta-Eintrag** ausgewählt: der mit derselben Adresse oder, falls im OD eine Meta-Adresse gesetzt ist, der dort eingetragene (Regel aus 5.2).
- Umgekehrt führt die Auswahl im Meta-Editor zurück zum (ersten) verwendenden OD-Objekt.
- Im OD zeigt der Detailbereich eine Vorschau der Bezeichnung und einen Knopf „Open in meta editor“.

### 6.3 Meta-Adresse im OD wählen

- Im Detailbereich des OD kommt das Feld **Meta address** dazu: Auswahl aus den vorhandenen Meta-Einträgen, Standard „eigene Adresse“.
- Gilt auch für Mehrfachauswahl (z. B. alle RPDO-Parameter markieren und einmal 0x1400 zuweisen) und beim Klonen von Objekten (Klone zeigen auf das Original).

### 6.4 Abgleich mit dem OD

- Aktion **„Sync with OD“**: Neue OD-Objekte bekommen Meta-Einträge, geänderte Namen und Typen werden nachgezogen, für gelöschte OD-Objekte werden die Meta-Einträge als *verwaist* markiert (nicht gelöscht).
- Laufende Prüfungen: Meta-Adresse zeigt ins Leere, Meta-Eintrag wird von niemandem verwendet, Übersetzung fehlt, Text zu lang.

### 6.5 Laden und Speichern

- Das Meta-Projekt ist eine normale XDD und lässt sich auch allein öffnen. Es merkt sich, aus welchem OD es entstanden ist.
- Beim Öffnen von `geraet.xdd` wird das zugehörige Meta-Projekt mitgeladen, wenn es daneben liegt (Electron). Im Browser öffnet man es zusätzlich von Hand.
- „Save“ schreibt beide Dateien; der Änderungsstatus wird je Datei geführt.
- GUI 1 und GUI 2 bekommen vorerst keinen Meta-Editor. Sie müssen die neuen Angaben aber beim Speichern erhalten (Paket 2).

## 7. C-Export: `meta.c` / `meta.h`

### 7.1 Aufruf

Der Generator ist ein neuer Exporter „CanOpenNode Meta“ in libEDSsharp, angemeldet wie die vorhandenen.

```bash
# gezielt
EDSSharp --infile geraet_meta.xdd --outfile out/meta.c --type CanOpenNodeMeta

# wie bisher für Projekte: bei einem Meta-Projekt entstehen meta.c/.h statt OD.c/.h,
# das JSON kommt unverändert aus dem vorhandenen Export
EDSSharp --export-project --infile geraet_meta.xdd --outdir ./out
```

- Das zugehörige OD wird über die im Meta-Projekt gemerkte Quelle gefunden (oder per Option). Der Generator braucht es für die Zuordnung OD-Adresse → Meta-Eintrag (`CO_metaRef`).
- Fehlt das OD, gilt jede Adresse für sich. Der Exporter funktioniert damit auch allein, was ihn für Upstream einfacher macht.
- Optionen schränken die Sprachen zusätzlich ein, ohne das Projekt zu ändern.

### 7.2 Was in die Firmware kommt

| Inhalt | Umfang |
|---|---|
| Bezeichnung (16) | alle Einträge, alle Sprachen |
| Einheit | alle Einträge |
| Wertetexte | alle Einträge |
| Tooltip (128) | nur Einträge mit Häkchen |
| Beschreibung | nie; sie steht nur im JSON für die Weboberfläche |

### 7.3 Datenstruktur

Ziel: wenig Flash, kein RAM, kein Kopieren, schneller Zugriff.

| Baustein | Aufbau | Zweck |
|---|---|---|
| **Meta-ID** | fortlaufende Nummer 0 … N−1 je Meta-Eintrag | direkter Tabellenzugriff ohne Suche |
| **OD-Zuordnung** | sortierte Tabelle (Index, Sub) → Meta-ID, 5 Byte je OD-Adresse | Suche per Halbierung; mehrere OD-Adressen dürfen dieselbe ID haben |
| **String-Pool** je Sprache | ein zusammenhängender UTF-8-Block, jeder Text nur einmal | gleiche Texte (Einheiten, „Aus“, „Ein“) kosten nur einmal Platz |
| **Offset-Tabelle** je Sprache und Textart | 16-Bit-Offset in den Pool, Position = Meta-ID | 2 statt 4 Byte je Text gegenüber Zeigern |
| **dünn besetzte Tabelle** | sortierte Paare (Meta-ID, Offset) | für Textarten mit wenigen Einträgen: Tooltip, Einheit |
| **Wertelisten** | je Liste sortierte Werte und je Sprache die Offsets; je Meta-Eintrag die Nummer seiner Liste | gleiche Listen werden zusammengelegt und nur einmal abgelegt |

- Offset 0 bedeutet „kein Text“. Dann greift die Rückfallsprache Deutsch.
- Der Generator wählt selbst zwischen dichter und dünner Tabelle und wechselt auf 32-Bit-Offsets, falls ein Pool größer als 64 KiB wird.
- Alles ist `const` und liegt im Flash. RAM-Bedarf: nur die aktuelle Sprache (1 Byte).
- Weil mit Offsets statt Zeigern gearbeitet wird, ist ein Sprachblock verschiebbar. Sprachen später aus externem Flash nachzuladen bleibt damit möglich.

Skizze der erzeugten Dateien:

```c
/* meta.h */
typedef enum { META_LANG_DE, META_LANG_EN, META_LANG_COUNT } meta_lang_t;
typedef enum { META_TEXT_LABEL, META_TEXT_TOOLTIP, META_TEXT_UNIT, META_TEXT_COUNT } meta_text_t;
typedef uint16_t meta_id_t;
#define META_ID_NONE      0xFFFFu
#define META_ENTRY_COUNT  187u

#define META_H2100        12u            /* Boiler temperature, Namen wie OD_ENTRY_H2100 */

meta_id_t   meta_find(uint16_t index, uint8_t subIndex);       /* OD-Adresse -> Meta-ID */
const char *meta_text(meta_id_t id, meta_text_t text);         /* aktuelle Sprache, mit Rückfall */
const char *meta_value_text(meta_id_t id, int32_t value);      /* NULL, wenn es zum Wert keinen Text gibt */
void        meta_set_language(meta_lang_t lang);
```

```c
/* meta.c (Ausschnitt) */
static const uint16_t od_index[] = { 0x1400, 0x1400, 0x1401, 0x1401, /* ... */ };
static const uint8_t  od_sub[]   = {      1,      2,      1,      2, /* ... */ };
static const uint16_t od_id[]    = {      0,      1,      0,      1, /* ... */ };  /* 0x1401 nutzt 0x1400 */

static const char pool_de[] =
    "\0"                 /*  0: kein Text */
    "Kesseltemp.\0"      /*  1            */
    "Aus\0"              /* 13            */
    "Ein\0";             /* 17            */

static const uint16_t de_label[META_ENTRY_COUNT] = { /* ... */ 1, /* ... */ };

/* Werteliste 0 (Aus/Ein), von mehreren Einträgen gemeinsam genutzt */
static const int32_t  vl0_value[] = {  0,  1 };
static const uint16_t vl0_de[]    = { 13, 17 };
```

Rechenbeispiel (Annahme: 200 Meta-Einträge, 250 OD-Adressen, 2 Sprachen): Tabelle der Bezeichnungen 200 × 2 × 2 Byte = 0,8 kB, OD-Zuordnung 250 × 5 Byte ≈ 1,3 kB, die Bezeichnungen selbst höchstens 200 × 17 Byte × 2 Sprachen = 6,8 kB. Dazu kommen Einheiten, Wertetexte und die ausgewählten Tooltips.

### 7.4 Verwendung mit LVGL 9

```c
lv_label_set_text_static(label, meta_text(META_H2100, META_TEXT_LABEL));
lv_label_set_text_static(unit,  meta_text(META_H2100, META_TEXT_UNIT));
/* aus der OD-Adresse, mit Wertetext: */
const char *mode = meta_value_text(meta_find(0x2200, 0), value);
```

- `lv_label_set_text_static` kopiert nicht. Die Texte bleiben im Flash, es wird kein Heap gebraucht.
- Nach `meta_set_language()` müssen sichtbare Labels neu gesetzt werden. Dafür ist eine kleine, handgeschriebene Hilfsdatei `meta_lvgl.c` für LVGL 9 vorgesehen: Labels melden sich mit ID und Textart an und aktualisieren sich beim Sprachwechsel selbst. Sie gehört zum Beispiel bzw. zur Firmware, nicht zum Generator.
- Auf Wunsch (Option) schreibt der Generator zusätzlich **`meta_glyphs.txt`**: alle in den exportierten Texten vorkommenden Zeichen. Damit lassen sich die LVGL-Schriften mit `lv_font_conv` auf die wirklich benötigten Zeichen beschränken. Das spart meist mehr Flash als jede Optimierung an den Texten.

### 7.5 Bewusst nicht im ersten Schritt

- **Kompression** der Texte. Sie bräuchte einen RAM-Puffer und würde `set_text_static` verhindern. Erst sinnvoll, wenn die Messung zeigt, dass der Platz nicht reicht.
- **Zusammenlegen gemeinsamer Wortenden** (z. B. „Temperatur“ in „Übertemperatur“). Als spätere, rein generatorseitige Optimierung möglich, ohne Änderung an der Firmware.

## 8. JSON für die Weboberfläche

- Es gibt **keinen neuen JSON-Exporter**. Der vorhandene Export „CanOpenNode Protobuf (json)“ wird auf das Meta-Projekt angewendet und enthält alle Textarten und Sprachen, auch die Beschreibung (Beispiel in 5.4).
- Das JSON des Geräts enthält zusätzlich `metaRef`. Die Weboberfläche löst die Zuordnung nach der Regel aus 5.2 auf.
- Der vorhandene CouchDB-Upload arbeitet mit demselben Modell und überträgt die Texte damit ebenfalls.

## 9. Arbeitspakete

| # | Paket | Repo | Umfang | Für Upstream geeignet |
|---|---|---|---|---|
| 1 | Formatbeschreibung (englisch) im Repo: Eigenschaften, Protobuf-Felder, Textarten, Wertetexte | CANopenEditor | klein | ja, als Grundlage der PRs |
| 2 | Texte, Einheiten, Wertetexte, `CO_metaRef` und Projektangaben durch alle Modelle führen (XDD 1.1, Protobuf, JSON); GUI 1 und GUI 2 erhalten sie beim Speichern | CANopenEditor | mittel | ja, eigener PR |
| 3 | Dasselbe im XDD-Codec des Web-Editors, Meta-Modell, „Create meta project“, „Sync with OD“ | Web | mittel | nein (eigener Editor) |
| 4 | Meta-Reiter: Texte, Einheit, Wertetexte, Tabellenansicht, Prüfungen | Web | groß | nein |
| 5 | Meta-Adresse im OD, Kopplung der Auswahl in beide Richtungen | Web | mittel | nein |
| 6 | Exporter „CanOpenNode Meta“ (`meta.c` / `meta.h`) mit Wertelisten, Anbindung an `--export-project` | CANopenEditor | groß | ja, eigener PR |
| 7 | Option für `meta_glyphs.txt` | CANopenEditor | klein | ja, optional |
| 8 | Export-Menü in der Electron-App, neues EDSSharp-Release | Web, CANopenEditor | klein | nein |
| 9 | Beispiel im Demo-Netzwerk mit Hilfsdatei für LVGL 9 | CANopenEditor | klein | als Beispiel |
| 10 | Einreichen bei Upstream (Pakete 1, 2, 6, 7), wenn es im Fork läuft | CANopenEditor | klein | – |

**Reihenfolge:** 1 → 2 → 3 → (4, 5 und 6 parallel) → 7 → 8 → 9 → 10. Nach Paket 3 und 6 gibt es schon einen durchgehenden Weg von der Datei bis zum C-Code, auch wenn die Oberfläche noch einfach ist.

Die Pakete 2, 6 und 7 werden im Fork als saubere, getrennte Commits geführt, damit sie sich ohne Nacharbeit bei Upstream einreichen lassen.

**Später, nach Bedarf:** CSV/Excel-Austausch für Übersetzer, Größenanzeige je Sprache im Editor, Platzhalter in Texten (z. B. „Kanal %d“ für Arrays), Meta-Editor in GUI 2.

### Tests

- **libEDSsharp:** Rundlauf XDD → Protobuf → JSON → XDD ohne Verlust der Texte; Dateien ohne Texte bleiben unverändert; `OD.c` / `OD.h` bleiben gleich.
- **Generator:** Unit-Tests für Pool, Tabellen, Wertelisten und Rückfall. Zusätzlich wird der erzeugte C-Code im CI mit `gcc -Wall -Wextra -Werror` gebaut, und ein kleines Testprogramm liest jeden Text über `meta_find` / `meta_text` / `meta_value_text` zurück und vergleicht ihn mit der Quelle.
- **Web:** Unit-Tests (vitest) für Codec, Auflösung der Meta-Adresse, Abgleich. Der Meta-Editor wird vor dem Commit im Browser geprüft (Regel aus `AGENTS.md`).

## 10. Entscheidungen

Entschieden am 26.11.2026:

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Dateiformat | Das vorhandene Projektformat von CANopenNode, kein eigenes. |
| 2 | Abstimmung mit Upstream | Erst im Fork umsetzen, danach mit lauffähigem Code einreichen. |
| 3 | Textarten | Drei: Bezeichnung (16), Tooltip (128), Beschreibung (unbegrenzt). |
| 4 | Was geht in die Firmware? | Bezeichnung immer, Tooltip nur für ausgewählte Einträge, Beschreibung nie. |
| 5 | Sprachen | Deutsch und Englisch, Rückfallsprache Deutsch. |
| 6 | Einheiten und Wertetexte | Von Anfang an dabei. Wertetexte nur für Aufzählungen; Bits haben eigene OD-Adressen. |
| 7 | LVGL-Version | LVGL 9. |
| 8 | Umfang des Clones | Objekte ab 0x2000 vorausgewählt. |

Annahmen, die ich ohne Rückfrage getroffen habe (bitte widersprechen, falls falsch):

| # | Annahme |
|---|---|
| A | Wertetexte dürfen 16 Zeichen lang sein (wie die Bezeichnung) und gehen alle in die Firmware. |
| B | Werte von Aufzählungen passen in 32 Bit (`int32_t`). |
| C | Die Einheit ist eine eigene Textart und darf je Sprache abweichen. |
| D | Die Standard-Elemente `<label lang="…">` der XDD werden nicht benutzt (Begründung in 5.4). |
| E | Das Meta-Projekt heißt wie das OD mit dem Zusatz `_meta`, z. B. `geraet_meta.xdd`. |

## 11. Risiken

- **Upstream möchte beim Einreichen andere Namen oder lehnt ab.** Die Erweiterung ist additiv und bleibt im Fork auch allein lauffähig; bei einer Umbenennung liest der Code alte und neue Namen (Leitlinie 7).
- **Feldnummern im Protobuf kollidieren mit späteren Upstream-Feldern.** Gegenmittel: eigenen, hohen Nummernbereich wählen.
- **OD und Meta laufen auseinander** (Objekt gelöscht oder umnummeriert). Gegenmittel: „Sync with OD“ im Editor, Warnungen im Generator, auf Wunsch Abbruch im strengen Modus.
- **Werkzeuge ohne die Erweiterung verwerfen die neuen Eigenschaften** beim Speichern (z. B. der unveränderte Upstream-Editor, solange die Erweiterung dort nicht aufgenommen ist). Die eigenen Werkzeuge erhalten sie nach Paket 2 und 3.
- **Die XDD wird größer**, weil jeder Text eine eigene Eigenschaft ist, vor allem durch die unbegrenzte Beschreibung. Für die Firmware ohne Belang; die Datei bleibt lesbar und in Git vergleichbar.
- **Flash-Bedarf** wächst mit jeder Sprache und jedem Tooltip. Gegenmittel: Häkchen je Eintrag, Sprachen beim Export abwählbar, Größenangabe im Generator-Protokoll.
- **Zeichen fehlen in der LVGL-Schrift.** Gegenmittel: `meta_glyphs.txt` im Schrift-Build verwenden.
