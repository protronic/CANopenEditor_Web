# Plan: Metadaten (mehrsprachige Texte) im Editor und im C-Generator

| | |
|---|---|
| **Stand** | Entwurf 2 zur Abstimmung, 26.11.2026 |
| **Betrifft** | `protronic/CANopenEditor_Web` (Oberfläche) und `protronic/CANopenEditor` (libEDSsharp, EDSSharp, C-Generator) |
| **Noch nichts umgesetzt** | Dieses Dokument ist nur der Plan. Offene Entscheidungen stehen in Abschnitt 10. |

**Geändert gegenüber Entwurf 1:** Die Lösung soll upstream-tauglich bleiben (Projekt CANopenNode). Deshalb gibt es **kein eigenes Dateiformat** mehr. Die Texte liegen im vorhandenen Projektformat (XDD und Protobuf), und der vorhandene JSON-Export liefert sie ohne neuen Exporter mit.

---

## 1. Ziel in Kurzform

Zu jedem Objekt im Object Dictionary (OD) sollen Texte gepflegt werden können: kurze und lange Bezeichnungen für die Touch-Oberfläche, Tooltips und Beschreibungen für die Weboberfläche, alles in mehreren Sprachen.

1. Aus einem bestehenden OD entsteht ein **Meta-Projekt** (ein „Meta-Clone“) mit derselben Adressstruktur, im selben Dateiformat wie das OD.
2. Der Editor bekommt einen **Meta-Editor**, dessen Auswahl mit dem OD gekoppelt ist.
3. Der C-Export erzeugt für ein Meta-Projekt **`meta.c` / `meta.h`** statt `OD.c` / `OD.h`: ein platzsparendes Sprach-Wörterbuch für C und LVGL.
4. Der **JSON-Export bleibt der vorhandene** und enthält die Texte automatisch.

## 2. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Projektformat** | Das Format von CANopenNode/CANopenEditor: XDD 1.1 mit `CO_*`-Eigenschaften, intern als Protobuf (`CanOpenDevice`), exportierbar als JSON. |
| **Meta-Projekt** | Eine normale Projektdatei in diesem Format, die zusätzlich Texte enthält. Entsteht als Kopie des OD. |
| **Meta-Eintrag** | Die Texte zu einer Adresse (Index + Subindex) im Meta-Projekt. |
| **Meta-Adresse** | Angabe an einem OD-Objekt, welcher Meta-Eintrag gilt. Standard: die eigene Adresse. |
| **Textart** | Eine Sorte Text mit eigener Länge, z. B. „Bezeichnung kurz“ oder „Tooltip“. |

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
7. **Früh abstimmen.** Namen der Eigenschaften und Feldnummern vor der Umsetzung bei Upstream als Vorschlag einstellen (Issue), damit sie später nicht umbenannt werden müssen.

## 5. Konzept

### 5.1 Meta-Projekt als Clone des OD

- Aktion **„Create meta project from OD“**: kopiert die gewählten Objekte in eine zweite Projektdatei, z. B. `geraet.xdd` → `geraet_meta.xdd`. Adressen (Index, Subindex) bleiben gleich.
- Das Meta-Projekt ist eine **gültige XDD**. Jedes Werkzeug, das XDD liest, kann es öffnen; die Struktur (Namen, Typen) stammt aus dem OD und dient als Orientierung.
- Im Dialog wählbar: Adressbereiche (Vorschlag: ab 0x2000 vorausgewählt, Kommunikationsobjekte optional), Sprachen und die Ausgangssprache.
- Vorbelegung: Der OD-Name wird zur mittleren Bezeichnung, die OD-Beschreibung zum Tooltip (jeweils in der Ausgangssprache).
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

### 5.3 Textarten und Sprachen

Feste Kennungen, damit alle Werkzeuge dasselbe verstehen. Die Längen sind Richtwerte und je Projekt einstellbar:

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

### 5.4 Ablage im vorhandenen Format

Der technische Name und die Beschreibung eines Objekts (`<label lang="en">`, `<description lang="en">`) bleiben, wie sie sind. Aus dem Namen entstehen die C-Bezeichner, deshalb wird er nicht übersetzt.

| Angabe | XDD 1.1 | Protobuf (additiv) |
|---|---|---|
| Text je Textart und Sprache | Eigenschaft `CO_text:<Textart>:<Sprache>` am Parameter | `map<string, string> texts`, Schlüssel `<Textart>:<Sprache>` |
| Meta-Adresse | Eigenschaft `CO_metaRef` | `string metaRef` |
| Auswahl für den C-Export je Eintrag | Eigenschaft `CO_textExport` (z. B. `tooltip`) | `repeated string textExport` |
| Projektangaben: Sprachen, Rückfallsprache, Textarten mit Länge, Quelle des Clones | `characteristic` unter `DeviceFunction/capabilities` (dort steht heute schon „SW library“) | Nachricht `textInfo` im Gerät |

Beispiel XDD (vereinfacht):

```xml
<parameter uniqueID="UID_PARAM_2100" access="readWrite">
  <label lang="en">Temperature</label>
  <property name="CO_text:label_s:de" value="Temp." />
  <property name="CO_text:label_m:de" value="Temperatur" />
  <property name="CO_text:label_m:en" value="Temperature" />
  <property name="CO_text:tooltip:de" value="Aktuelle Kesseltemperatur" />
  <property name="CO_textExport" value="tooltip" />
</parameter>
```

Dasselbe Objekt im vorhandenen JSON-Export (neu ist nur `texts`):

```json
"2100": {
  "name": "Temperature",
  "objectType": "OBJECT_TYPE_VAR",
  "subObjects": {
    "00": {
      "dataType": "INTEGER16",
      "texts": {
        "label_s:de": "Temp.",
        "label_m:de": "Temperatur",
        "label_m:en": "Temperature",
        "tooltip:de": "Aktuelle Kesseltemperatur"
      }
    }
  }
}
```

- **EDS** kennt keine Sprachen. Beim EDS-Export entfallen die Texte; die EDS bleibt gültig.
- Die mehrsprachigen Standard-Elemente der XDD (`<label lang="de">`) werden vorerst nicht benutzt, weil das erste `label` der technische Name ist und es dort nur eine Bezeichnung je Sprache gibt. Siehe offene Entscheidung 3.

## 6. Oberfläche (Web-Editor)

### 6.1 Meta-Editor als neuer Reiter „Meta“

- Neben *Device Info / Object Dictionary / TX / RX* kommt der Reiter **Meta**. Er zeigt die Texte des zum Gerät gehörenden Meta-Projekts; gibt es noch keines, bietet er „Create meta project from OD“ an.
- **Links** die Liste der Meta-Einträge, aufgebaut wie im OD (Objekte, darunter Subindizes).
- **Rechts** die Texte des gewählten Eintrags: je Textart eine Zeile, je Sprache eine Spalte, mit Zeichenzähler und Markierung bei Überlänge.
- Zusätzlich eine **Tabellenansicht** (alle Einträge × Sprachen für eine Textart) zum zügigen Übersetzen, mit Filter „fehlende Übersetzungen“.
- Unter den Texten steht **„used by“**: alle OD-Objekte, die auf diesen Eintrag zeigen. Ein Klick springt ins OD.
- Einstellungen des Meta-Projekts: Sprachen, Rückfallsprache, Textarten mit Länge und C-Export.

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
- Optionen schränken Sprachen und Textarten zusätzlich ein, ohne das Projekt zu ändern.

### 7.2 Datenstruktur

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

### 7.3 Verwendung mit LVGL

```c
lv_label_set_text_static(label, meta_text(META_H2100, META_TEXT_LABEL_M));
/* oder aus der OD-Adresse: */
lv_label_set_text_static(label, meta_text(meta_find(0x2100, 0), META_TEXT_LABEL_S));
```

- `lv_label_set_text_static` kopiert nicht. Die Texte bleiben im Flash, es wird kein Heap gebraucht.
- Nach `meta_set_language()` müssen sichtbare Labels neu gesetzt werden. Dafür ist eine kleine, handgeschriebene Hilfsdatei `meta_lvgl.c` vorgesehen. Sie gehört zum Beispiel bzw. zur Firmware, nicht zum Generator.
- Auf Wunsch (Option) schreibt der Generator zusätzlich **`meta_glyphs.txt`**: alle in den exportierten Texten vorkommenden Zeichen. Damit lassen sich die LVGL-Schriften mit `lv_font_conv` auf die wirklich benötigten Zeichen beschränken. Das spart meist mehr Flash als jede Optimierung an den Texten.

### 7.4 Bewusst nicht im ersten Schritt

- **Kompression** der Texte. Sie bräuchte einen RAM-Puffer und würde `set_text_static` verhindern. Erst sinnvoll, wenn die Messung zeigt, dass der Platz nicht reicht.
- **Zusammenlegen gemeinsamer Wortenden** (z. B. „Temperatur“ in „Übertemperatur“). Als spätere, rein generatorseitige Optimierung möglich, ohne Änderung an der Firmware.

## 8. JSON für die Weboberfläche

- Es gibt **keinen neuen JSON-Exporter**. Der vorhandene Export „CanOpenNode Protobuf (json)“ wird auf das Meta-Projekt angewendet und enthält alle Textarten und Sprachen (Beispiel in 5.4).
- Das JSON des Geräts enthält zusätzlich `metaRef`. Die Weboberfläche löst die Zuordnung nach der Regel aus 5.2 auf.
- Der vorhandene CouchDB-Upload arbeitet mit demselben Modell und überträgt die Texte damit ebenfalls.

## 9. Arbeitspakete

| # | Paket | Repo | Umfang | Für Upstream geeignet |
|---|---|---|---|---|
| 1 | Formatbeschreibung (englisch): Eigenschaften, Protobuf-Felder, Textarten; als Vorschlag bei Upstream einstellen | CANopenEditor | klein | ja, als Issue |
| 2 | Texte, `CO_metaRef` und Projektangaben durch alle Modelle führen (XDD 1.1, Protobuf, JSON); GUI 1 und GUI 2 erhalten sie beim Speichern | CANopenEditor | mittel | ja, eigener PR |
| 3 | Dasselbe im XDD-Codec des Web-Editors, Meta-Modell, „Create meta project“, „Sync with OD“ | Web | mittel | nein (eigener Editor) |
| 4 | Meta-Reiter mit Detail- und Tabellenansicht, Prüfungen | Web | groß | nein |
| 5 | Meta-Adresse im OD, Kopplung der Auswahl in beide Richtungen | Web | mittel | nein |
| 6 | Exporter „CanOpenNode Meta“ (`meta.c` / `meta.h`), Anbindung an `--export-project` | CANopenEditor | groß | ja, eigener PR |
| 7 | Option für `meta_glyphs.txt` | CANopenEditor | klein | ja, optional |
| 8 | Export-Menü in der Electron-App, neues EDSSharp-Release | Web, CANopenEditor | klein | nein |
| 9 | Beispiel im Demo-Netzwerk mit LVGL-Hilfsdatei | CANopenEditor | klein | als Beispiel |

**Reihenfolge:** 1 → 2 → 3 → (4, 5 und 6 parallel) → 7 → 8 → 9. Nach Paket 3 und 6 gibt es schon einen durchgehenden Weg von der Datei bis zum C-Code, auch wenn die Oberfläche noch einfach ist.

Die Pakete 2, 6 und 7 werden im Fork als saubere, getrennte Commits geführt, damit sie sich ohne Nacharbeit bei Upstream einreichen lassen.

**Später, nach Bedarf:** CSV/Excel-Austausch für Übersetzer, Größenanzeige je Sprache im Editor, Einheiten und Wertetexte (z. B. 0 = Aus, 1 = Ein), Platzhalter in Texten (z. B. „Kanal %d“ für Arrays), Meta-Editor in GUI 2.

### Tests

- **libEDSsharp:** Rundlauf XDD → Protobuf → JSON → XDD ohne Verlust der Texte; Dateien ohne Texte bleiben unverändert; `OD.c` / `OD.h` bleiben gleich.
- **Generator:** Unit-Tests für Pool, Tabellen und Rückfall. Zusätzlich wird der erzeugte C-Code im CI mit `gcc -Wall -Wextra -Werror` gebaut, und ein kleines Testprogramm liest jeden Text über `meta_find` / `meta_text` zurück und vergleicht ihn mit der Quelle.
- **Web:** Unit-Tests (vitest) für Codec, Auflösung der Meta-Adresse, Abgleich. Der Meta-Editor wird vor dem Commit im Browser geprüft (Regel aus `AGENTS.md`).

## 10. Empfehlungen und offene Entscheidungen

| # | Frage | Empfehlung |
|---|---|---|
| 1 | Namen der Eigenschaften und Felder (`CO_text:<Textart>:<Sprache>`, `CO_metaRef`, `texts`) | So vorschlagen und vor der Umsetzung mit Upstream abstimmen. |
| 2 | Wann geht der Vorschlag an Upstream? | Gleich nach Paket 1, noch vor dem Programmieren. Das Issue müsstet ihr selbst einstellen; ich kann den Text liefern. |
| 3 | Standard-Elemente `<label lang="…">` der XDD zusätzlich nutzen? | Vorerst nein. Sie decken nur eine Bezeichnung je Sprache ab und kollidieren mit dem technischen Namen. Später als Ergänzung möglich. |
| 4 | Textarten und Längen | Vorschlag aus 5.3, bitte Längen für eure Displays bestätigen. |
| 5 | Sprachen zum Start, Rückfallsprache | offen |
| 6 | LVGL-Version (8 oder 9) | Entscheidet nur über die Hilfsdatei `meta_lvgl.c`. LVGL 9.3 bringt ein eigenes Übersetzungsmodul mit Text-Schlüsseln mit; ein Adapter dafür wäre möglich, ist aber langsamer als der Zugriff über IDs. |
| 7 | Welche Objekte kommen in den Clone? | Vorschlag: ab 0x2000 vorausgewählt, Kommunikationsobjekte nur auf Wunsch. |
| 8 | Einheiten und Wertetexte gleich mit vorsehen? | Im Format als weitere Textarten möglich, Umsetzung später. |

## 11. Risiken

- **Upstream möchte andere Namen oder lehnt ab.** Gegenmittel: früh abstimmen (Entscheidung 2); die Erweiterung ist additiv und bleibt im Fork auch allein lauffähig.
- **Feldnummern im Protobuf kollidieren mit späteren Upstream-Feldern.** Gegenmittel: eigenen Nummernbereich wählen und abstimmen.
- **OD und Meta laufen auseinander** (Objekt gelöscht oder umnummeriert). Gegenmittel: „Sync with OD“ im Editor, Warnungen im Generator, auf Wunsch Abbruch im strengen Modus.
- **Werkzeuge ohne die Erweiterung verwerfen die neuen Eigenschaften** beim Speichern (z. B. der unveränderte Upstream-Editor, solange die Erweiterung dort nicht aufgenommen ist). Die eigenen Werkzeuge erhalten sie nach Paket 2 und 3.
- **Die XDD wird größer**, weil jeder Text eine eigene Eigenschaft ist. Für die Firmware ohne Belang; die Datei bleibt lesbar und in Git vergleichbar.
- **Flash-Bedarf** wächst mit jeder Sprache. Gegenmittel: Auswahl je Textart und Eintrag, Sprachen beim Export abwählbar, Größenangabe im Generator-Protokoll.
- **Zeichen fehlen in der LVGL-Schrift.** Gegenmittel: `meta_glyphs.txt` im Schrift-Build verwenden.
