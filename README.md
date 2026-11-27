# CANopenEditor_Web

Angular-based user interface for the CANopen object dictionary. It is a reimplementation of the desktop application CANopenEditor (https://github.com/CANopenNode/CANopenEditor).

Only the XDD file format (CiA 311) is natively supported for reading and writing. XDD 1.0 files can be opened. When saved, the file is converted into a normalized XDD 1.1 format containing the device identity, file information, object dictionary, baud rates, and network features. Any other XML fragments are not preserved.

Importing from and exporting to other formats is possible using the command-line tool EDSSharp; see the releases at https://github.com/protronic/CANopenEditor/releases.

An Electron app with import and export functionality can be created; see [ELECTRON.md](ELECTRON.md)

## User interface (display texts)

The tab **User Interface** maintains translatable texts for the entries of the object dictionary: a short
label for touch displays, tooltip and description for web pages, unit, value texts (e.g. 0 = Off, 1 = On)
and a multiplier for the displayed value. The texts are kept in a **user interface file** `<name>.xui`,
a copy of the object dictionary in XDD 1.1 with the texts as `CO_text:*` properties (format:
[docs/meta-texts.md](https://github.com/protronic/CANopenEditor/blob/main/docs/meta-texts.md) in
CANopenEditor, where it is called meta project).

- *Create user interface from OD* copies the objects (by default from 0x2000) and prefills the labels with
  the names. *Sync with OD* adds new objects later; texts are kept. *Max. label* (32 characters by
  default, also under *Settings*) is the length from which a label is reported as too long.
- In the list, every object starts with a line; ARRAYs and RECORDs have a darker row and their sub
  entries a coloured guide. The arrow in front of an object folds its sub entries away (*Collapse all* /
  *Expand all* for the whole list; a filter text lists its matches anyway).
- Entries the display does not show can be switched off with *On display* in the entry: they leave the
  list and the checks and are not exported to the firmware, their texts are kept. Switching off an
  ARRAY or RECORD includes its sub entries; with several entries selected (Ctrl / Shift + click) it
  applies to all of them. *Hidden (n)* above the list shows them again, greyed. Sub-index 0 (*Highest
  sub-index supported*) starts switched off.
- The field *UI address* in the object dictionary lets several entries share texts, e.g. all RPDO
  communication parameters use the texts of 0x1400 (context menu *UI address...* for several objects).
  Below the field, entries with a similar name or label are offered (*Similar:*, the bars show how
  similar the name is, the tooltip which texts the entry would get); while typing, the field lists them
  first, followed by all entries with texts. The tag next to the field shows whose texts apply: green for
  the texts of another entry, red if the user interface has no such entry.
- An open user interface is listed below its object dictionary as *User interface*. It only has the
  *User Interface* view; Save and Close apply to the selected file.
- The entry view shows a preview in the selected language (with fallback), marks missing translations
  and too long texts, and offers the fallback text as a start (`= de`). `Alt+↓` / `Alt+↑` move to the
  next or previous entry while the cursor stays in the same field, which is quick for translating.
- Value texts of another entry (e.g. Off / On) can be taken over with *Use the value texts of…*.
- The selection follows between *Object Dictionary* and *User Interface*: the tab *User Interface* (or
  *Texts...* next to the field) shows the entry at the UI address of the selected object dictionary
  entry, also while the address is only typed and not applied yet. *Used by* jumps back.
- Entries that are no longer in the object dictionary can be removed with *Remove entry*.
- *Checks* lists missing translations, too long texts and unknown UI addresses.
- In the desktop app a `<name>.xui` (or an older `<name>_meta.xdd`) next to an opened file is opened with
  it, and exporting a user interface to C writes `meta.c` / `meta.h` (EDSSharp exporter `CanOpenNodeMeta`).
  A `.xui` file opened on its own is always treated as user interface.

