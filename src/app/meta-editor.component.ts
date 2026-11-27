/*
    CANopen Editor Web
    Copyright (C) 2026

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
*/

import { Component, ElementRef, computed, effect, inject, input, output, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeviceDocument, OdEntry } from './model/device';
import { DraggableDirective } from './draggable.directive';
import { DialogService } from './state/dialog.service';
import { MetaLinkService, OdSelection } from './state/meta-link.service';
import { OpenDevice, ProjectStore } from './state/project.store';
import {
  DEFAULT_MAX_LENGTH,
  MetaAddress,
  MetaIssue,
  TEXT_KINDS,
  TEXT_KIND_LABELS,
  TextKind,
  checkMeta,
  displayText,
  entryAt,
  fallbackOf,
  formatMetaAddress,
  getText,
  isComplex,
  isExportOff,
  isHidden,
  isValidMultiplier,
  languagesOf,
  maxLength,
  metaAddressIn,
  metaEntries,
  parseMetaAddress,
  parseValue,
  removeMetaEntry,
  sameAddress,
  setExportOff,
  setText,
  setValueTexts,
  syncWithOd,
  textLength,
  usedBy,
  valueTexts,
} from './xdd/meta';

interface ListRow {
  key: string;
  address: MetaAddress;
  entry: OdEntry;
  isSub: boolean;
  /** ARRAY/RECORD object: its sub entries follow and can be folded away. */
  isHead: boolean;
  /** Not shown on the display (not exported). */
  hidden: boolean;
  /** Hidden by its own mark, not only because its object is hidden. */
  hiddenOwn: boolean;
  addressText: string;
  name: string;
  text: string;
  issue: boolean;
  /** Head rows: number of listed sub entries and whether one of them has a finding. */
  subCount: number;
  subIssue: boolean;
}

interface ValueRow {
  value: string;
  texts: Record<string, string>;
}

/** Display texts (meta texts) of the object dictionary entries, see docs/meta-texts.md in CANopenEditor. */
@Component({
  selector: 'app-meta-editor',
  standalone: true,
  imports: [FormsModule, DraggableDirective],
  template: `
    @if (meta(); as meta) {
      <div class="meta">
        <div class="meta-toolbar">
          <span class="meta-title">
            User interface <strong>{{ meta.fileName }}</strong>
            @if (od(); as od) {
              @if (od !== meta) { for {{ od.fileName }} }
            } @else {
              <span class="hint">(object dictionary {{ meta.document.textInfo.metaSource || '?' }} not open)</span>
            }
          </span>
          <span class="meta-spacer"></span>
          <label class="meta-inline">Show
            <select [ngModel]="language" (ngModelChange)="language = $event">
              @for (l of languages(); track l) { <option [value]="l">{{ l }}</option> }
            </select>
          </label>
          <button type="button" [class.active]="view === 'entry'" (click)="view = 'entry'">Entry</button>
          <button type="button" [class.active]="view === 'table'" (click)="view = 'table'">Table</button>
          <button type="button" class="quiet" (click)="showIssues = !showIssues" [class.warn]="issues().length > 0">
            Checks ({{ issues().length }})
          </button>
          <button type="button" class="quiet" (click)="openSettings()">Settings</button>
          @if (od() && od() !== meta) {
            <button type="button" class="quiet" (click)="sync()">Sync with OD</button>
          }
        </div>

        @if (showIssues) {
          <div class="meta-issues">
            @for (issue of issues(); track $index) {
              <button type="button" class="meta-issue" (click)="selectAddress(issue.address, true)">{{ issue.message }}</button>
            } @empty {
              <span class="hint">No findings.</span>
            }
          </div>
        }

        @if (view === 'entry') {
          <div class="meta-body">
            <div class="meta-list">
              <input class="meta-filter" placeholder="Filter (address, name, text)" [(ngModel)]="filter" />
              <div class="list-tools">
                <button type="button" class="quiet" (click)="collapseAll()" [disabled]="filtering() || !canCollapse()"
                        title="Show the objects without their sub entries">Collapse all</button>
                <button type="button" class="quiet" (click)="expandAll()" [disabled]="filtering() || !collapsed.size"
                        title="Show all sub entries">Expand all</button>
                <span class="meta-spacer"></span>
                <label class="inline-check" title="Also list the entries that are not shown on the display (see 'On display' of an entry)">
                  <input type="checkbox" [(ngModel)]="showHidden" />Hidden ({{ hiddenCount() }})
                </label>
              </div>
              <div class="meta-scroll">
                <table>
                  <thead><tr><th>Address</th><th>Name</th><th>{{ language }}</th></tr></thead>
                  <tbody>
                    @for (row of rows(); track row.key) {
                      <tr [class.selected]="isSelected(row.address)" [class.extra]="extra.has(row.key)" [class.sub]="row.isSub"
                          [class.object]="!row.isSub" [class.head]="row.isHead" [class.off]="row.hidden"
                          (click)="clickRow($event, row)">
                        <td>
                          @if (row.isHead) {
                            <button type="button" class="twisty" (click)="toggle($event, row)" [disabled]="filtering()"
                                    [attr.aria-expanded]="!isCollapsed(row)"
                                    [title]="isCollapsed(row) ? 'Show the sub entries' : 'Hide the sub entries'">{{ isCollapsed(row) ? '▸' : '▾' }}</button>
                          }{{ row.addressText }}@if (row.issue || (row.subIssue && isCollapsed(row))) {<span class="dot" title="See checks">●</span>}
                        </td>
                        <td>{{ row.name }}@if (row.isHead && isCollapsed(row)) {<small class="sub-count" title="Sub entries">{{ row.subCount }}</small>}@if (row.hiddenOwn) {<small class="off-tag">hidden</small>}</td>
                        <td>{{ row.text }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <div class="meta-detail" (keydown)="onDetailKey($event)">
              @if (entry(); as entry) {
                @let pv = preview(entry);
                <div class="entry-head">
                  <div class="entry-title">
                    <h3>{{ addressText() }} · {{ entry.name }}</h3>
                    <small>{{ structureInfo(entry) }}</small>
                  </div>
                  <div class="entry-actions">
                    @let shown = visibility();
                    <label class="inline-check on-display" [title]="shown.hint">
                      <input type="checkbox" [ngModel]="!shown.hidden" (ngModelChange)="setOnDisplay($event)" [disabled]="shown.inherited" />On display@if (extra.size) {<small>&nbsp;({{ extra.size + 1 }} entries)</small>}
                    </label>
                    <button type="button" class="quiet" (click)="step(-1)" [disabled]="!canStep(-1)" title="Previous entry (Alt+↑)" aria-label="Previous entry">‹</button>
                    <button type="button" class="quiet" (click)="step(1)" [disabled]="!canStep(1)" title="Next entry (Alt+↓)" aria-label="Next entry">›</button>
                    @if (canRemove()) {
                      <button type="button" class="quiet" (click)="removeSelected()" title="This entry is not in the object dictionary">Remove entry</button>
                    }
                  </div>
                </div>

                @if (visibility().hidden) {
                  <p class="off-note">{{ visibility().note }}</p>
                }

                <div class="preview" [class.off]="visibility().hidden" [title]="'How the texts are shown in ' + language">
                  <span class="preview-tag">Preview · {{ language }}</span>
                  <div class="preview-row">
                    @if (pv.label) {
                      <strong [class.borrowed]="pv.labelFromFallback">{{ pv.label }}@if (pv.labelOverflow) {<span class="overflow" title="Longer than the maximum length">{{ pv.labelOverflow }}</span>}</strong>
                    } @else {
                      <em>no label</em>
                    }
                    @if (pv.labelFromFallback) { <small class="borrowed-note">from {{ fallback() }}</small> }
                    <span class="preview-value">{{ pv.value }}</span>
                  </div>
                  @if (pv.tooltip) { <p>{{ pv.tooltip }}</p> }
                </div>

                @for (kind of kinds; track kind) {
                  <section class="text-group">
                    <header>
                      <h4>{{ kindLabels[kind] }}</h4>
                      @if (maxOf(kind)) { <small>max. {{ maxOf(kind) }} characters</small> }
                      @if (kind === 'tooltip') {
                        <label class="inline-check">
                          <input type="checkbox" [ngModel]="entry.textExport.includes('tooltip')" (ngModelChange)="setTooltipExport(entry, $event)" />
                          <span>also in firmware (meta.c)</span>
                        </label>
                      }
                      @if (kind === 'description') { <small>for web pages, not in firmware</small> }
                      @if (kind === 'unit') {
                        <label class="inline-field">Multiplier
                          <input class="short" [ngModel]="entry.multiplier" (ngModelChange)="setMultiplier(entry, $event)" placeholder="1"
                                 [class.long]="!multiplierValid(entry)" />
                        </label>
                        <small>{{ valueHint(entry) }}</small>
                      }
                    </header>
                    <div class="lang-grid">
                      @for (l of languages(); track l) {
                        <div class="lang-field" [class.multiline]="isMultiline(kind)" [class.long]="tooLong(entry, kind, l)"
                             [class.missing]="isMissing(entry, kind, l)">
                          <span class="lang-tag" [class.fallback]="l === fallback()" [title]="l === fallback() ? 'Fallback language' : ''">{{ l }}</span>
                          @if (isMultiline(kind)) {
                            <textarea [rows]="rowsFor(entry, kind, l)" [ngModel]="text(entry, kind, l)" (ngModelChange)="setEntryText(entry, kind, l, $event)"
                                      [placeholder]="placeholderFor(entry, kind, l)" [attr.aria-label]="kindLabels[kind] + ' ' + l"></textarea>
                          } @else {
                            <input [ngModel]="text(entry, kind, l)" (ngModelChange)="setEntryText(entry, kind, l, $event)"
                                   [placeholder]="placeholderFor(entry, kind, l)" [attr.aria-label]="kindLabels[kind] + ' ' + l" />
                          }
                          @if (canCopyFallback(entry, kind, l)) {
                            <button type="button" class="copy" (click)="copyFallback(entry, kind, l)" [title]="'Start with the ' + fallback() + ' text'">= {{ fallback() }}</button>
                          } @else if (maxOf(kind) && length(entry, kind, l) > 0) {
                            <small class="count">{{ length(entry, kind, l) }}/{{ maxOf(kind) }}</small>
                          }
                        </div>
                      }
                    </div>
                  </section>
                }

                <section class="text-group">
                  <header>
                    <h4>Value texts</h4>
                    <small>for values with a meaning, e.g. 0 = Off, 1 = On</small>
                  </header>
                  @if (valueRows.length) {
                    <table class="meta-texts">
                      <thead>
                        <tr>
                          <th>Value</th>
                          @for (l of languages(); track l) { <th>{{ l }}</th> }
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (row of valueRows; track $index; let i = $index) {
                          <tr>
                            <td><input class="short" [ngModel]="row.value" (ngModelChange)="setRowValue(entry, i, $event)" [class.long]="!validValue(i)" aria-label="Value" /></td>
                            @for (l of languages(); track l) {
                              <td>
                                <input [ngModel]="row.texts[l] || ''" (ngModelChange)="setRowText(entry, i, l, $event)"
                                       [placeholder]="l !== fallback() ? (row.texts[fallback()] || '') : ''"
                                       [class.long]="rowTooLong(row, l)" [attr.aria-label]="'Text ' + l" />
                              </td>
                            }
                            <td><button type="button" class="quiet" (click)="removeRow(entry, i)" title="Remove" aria-label="Remove value">×</button></td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                  <div class="row-actions">
                    <button type="button" class="quiet" (click)="addRow(entry)">Add value</button>
                    @if (valueLists().length) {
                      <select class="use-list" (change)="useValueList(entry, $event)" aria-label="Use the value texts of another entry">
                        <option value="">Use the value texts of…</option>
                        @for (list of valueLists(); track $index; let i = $index) {
                          <option [value]="i">{{ list.label }}</option>
                        }
                      </select>
                    }
                    @if (extra.size && valueRows.length) {
                      <button type="button" class="quiet" (click)="copyValuesToSelection(entry)">Copy to {{ extra.size }} selected</button>
                    }
                  </div>
                </section>

                <section class="text-group">
                  <header>
                    <h4>Used by</h4>
                  </header>
                  <div class="meta-used">
                    @if (od(); as od) {
                      @for (user of users(); track $index) {
                        <button type="button" class="quiet" (click)="showInOd(user.object, user.sub)" title="Show in the object dictionary">
                          {{ userAddress(user.object, user.sub) }} {{ (user.sub ?? user.object).name }}
                        </button>
                      } @empty {
                        <span class="hint">No entry of {{ od.fileName }} uses these texts.</span>
                      }
                    } @else {
                      <span class="hint">Open the object dictionary to see where the texts are used.</span>
                    }
                  </div>
                </section>
              } @else {
                <p class="hint">Select an entry.</p>
              }
            </div>
          </div>
        } @else {
          <div class="meta-table">
            <div class="meta-toolbar">
              <label class="meta-inline">Text
                <select [(ngModel)]="tableKind">
                  @for (kind of kinds; track kind) { <option [value]="kind">{{ kindLabels[kind] }}</option> }
                </select>
              </label>
              <label class="od-check"><input type="checkbox" [(ngModel)]="onlyMissing" /><span>Only missing translations</span></label>
              <label class="od-check" title="Also list the entries that are not shown on the display">
                <input type="checkbox" [(ngModel)]="showHidden" /><span>Hidden ({{ hiddenCount() }})</span>
              </label>
              <input class="meta-filter" placeholder="Filter" [(ngModel)]="filter" />
            </div>
            <div class="meta-scroll">
              <table class="meta-texts">
                <thead>
                  <tr>
                    <th>Address</th><th>Name</th>
                    @for (l of languages(); track l) { <th>{{ l }}</th> }
                  </tr>
                </thead>
                <tbody>
                  @for (row of tableRows(); track row.key) {
                    <tr [class.sub]="row.isSub" [class.object]="!row.isSub" [class.head]="row.isHead" [class.off]="row.hidden">
                      <td>{{ row.addressText }}</td>
                      <td>{{ row.name }}@if (row.hiddenOwn) {<small class="off-tag">hidden</small>}</td>
                      @for (l of languages(); track l) {
                        <td>
                          <input [ngModel]="text(row.entry, tableKind, l)" (ngModelChange)="setEntryText(row.entry, tableKind, l, $event)"
                                 [class.long]="tooLong(row.entry, tableKind, l)" />
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </div>
    } @else {
      <section class="empty meta-empty">
        <h2>User interface</h2>
        <p>Labels for touch displays, tooltips and descriptions for web pages, units, value texts and multipliers,
           in several languages. They are kept in a <strong>user interface file</strong> ({{ metaFileHint() }}): a copy of
           this object dictionary that holds the texts. The firmware gets them as <code>meta.c</code> / <code>meta.h</code>.</p>
        <div class="actions">
          <button type="button" (click)="openCreate()">Create user interface from OD</button>
          <button type="button" class="quiet" (click)="openMetaFile()">Open user interface...</button>
        </div>
        <input #metaPicker hidden type="file" accept=".xui,.xdd,application/xml" (change)="openMetaFromInput($event)" />
      </section>
    }

    @if (createOpen) {
      <div class="modal-back">
        <form class="modal" appDraggable (submit)="create($event)">
          <h3>Create user interface</h3>
          <label class="od-line"><span>Objects</span>
            <select [(ngModel)]="createFrom" name="from">
              <option [ngValue]="fromManufacturer">From 0x2000 (manufacturer and profile)</option>
              <option [ngValue]="0">All objects</option>
            </select>
          </label>
          <label class="od-line"><span>Languages</span><input [(ngModel)]="createLanguages" name="languages" placeholder="de, en" /></label>
          <label class="od-line"><span>Fallback</span><input [(ngModel)]="createFallback" name="fallback" placeholder="de" /></label>
          <label class="od-line"><span>OD language</span><input [(ngModel)]="createSource" name="source" placeholder="en" /></label>
          <label class="od-line"><span>Max. label</span><input type="number" min="0" [(ngModel)]="createLabelLength" name="labelLength" /></label>
          <p class="hint">Names and descriptions of the object dictionary prefill label and description in the OD language.
            Labels longer than the maximum are reported in the checks (0: any length); change it later in Settings.</p>
          <div class="modal-actions">
            <button type="submit">Create</button>
            <span class="modal-spacer"></span>
            <button type="button" class="quiet" (click)="createOpen = false">Cancel</button>
          </div>
        </form>
      </div>
    }

    @if (settingsOpen) {
      <div class="modal-back">
        <form class="modal" appDraggable (submit)="saveSettings($event)">
          <h3>User interface settings</h3>
          <label class="od-line"><span>Languages</span><input [(ngModel)]="settingsLanguages" name="languages" placeholder="de, en" /></label>
          <label class="od-line"><span>Fallback</span><input [(ngModel)]="settingsFallback" name="fallback" /></label>
          @for (kind of lengthKinds; track kind) {
            <label class="od-line"><span>Max. {{ kind }}</span><input type="number" min="0" [(ngModel)]="settingsLengths[kind]" [name]="'len-' + kind" /></label>
          }
          <label class="od-line"><span>OD file</span><input [(ngModel)]="settingsSource" name="source" placeholder="device.xdd" /></label>
          <p class="hint">Maximum lengths are used for warnings, 0 means unlimited.</p>
          <div class="modal-actions">
            <button type="submit">OK</button>
            <span class="modal-spacer"></span>
            <button type="button" class="quiet" (click)="settingsOpen = false">Cancel</button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [`
    :host { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .meta { flex: 1; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--line); background: white; }
    .meta-toolbar { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--line); background: #f7f4ee; font-size: 0.82rem; }
    .meta-title strong { font-weight: 700; }
    .meta-spacer { flex: 1; }
    .meta-inline { display: inline-flex; flex-direction: row; align-items: center; gap: 0.35rem; font-size: 0.82rem; color: var(--ink); }
    .meta-inline select, .meta-inline input { width: auto; padding: 0.2rem 0.4rem; }
    .meta-toolbar button { padding: 0.25rem 0.6rem; font-size: 0.82rem; }
    button.warn { color: #a86200; font-weight: 600; }
    .meta-issues { max-height: 9rem; overflow: auto; display: flex; flex-direction: column; border-bottom: 1px solid var(--line); padding: 0.25rem 0.6rem; }
    .meta-issue { text-align: left; background: transparent; color: var(--ink); border: 0; padding: 0.15rem 0; font-size: 0.8rem; }
    .meta-issue:hover { text-decoration: underline; }
    .meta-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(260px, 36%) minmax(0, 1fr); }
    .meta-list { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line); background: #f7f4ee; }
    .meta-filter { margin: 0.4rem; width: auto; font-size: 0.8rem; padding: 0.2rem 0.4rem; }
    .meta-toolbar .meta-filter { width: 14rem; }
    .meta-toolbar .od-check { display: inline-flex; flex-direction: row; align-items: center; gap: 0.35rem; color: var(--ink); }
    .meta-toolbar .od-check input { width: auto; }
    .meta-scroll { flex: 1; min-height: 0; overflow: auto; }
    table { border-collapse: collapse; width: 100%; font-size: 0.8rem; margin-top: 0; }
    .meta-list th:first-child { width: 6.6rem; }
    th, td { border-bottom: 1px solid #ece6db; padding: 0.18rem 0.4rem; text-align: left; vertical-align: top; }
    thead th { position: sticky; top: 0; background: #efe9de; z-index: 1; }
    .list-tools { display: flex; align-items: center; gap: 0.3rem; padding: 0 0.4rem 0.4rem; font-size: 0.76rem; }
    .list-tools button { font-size: 0.74rem; padding: 0.1rem 0.5rem; }
    .list-tools .inline-check { font-size: 0.76rem; }
    .meta-list tr { cursor: pointer; }
    /* Objects stand out from each other: a line above every object, a band for ARRAY/RECORD, a guide along their sub entries. */
    .meta-list tr.object td, .meta-table tr.object td { border-top: 1px solid #cdc2ae; }
    .meta-list tr.head td, .meta-table tr.head td { background: #e9e2d3; font-weight: 600; }
    .meta-list tr.head td:nth-child(3) { font-weight: 400; }
    .meta-list tr.sub td { background: #fcfaf6; }
    .meta-list tr.object td:first-child { position: relative; padding-left: 1.5rem; white-space: nowrap; }
    .meta-list tr.sub td:first-child { padding-left: 2.2rem; box-shadow: inset 4px 0 0 #b9d6d3; white-space: nowrap; }
    .meta-table tr.sub td:first-child { padding-left: 1.2rem; box-shadow: inset 4px 0 0 #b9d6d3; }
    .twisty { position: absolute; left: 0.1rem; top: 0; bottom: 0; width: 1.3rem; padding: 0; background: transparent; color: var(--muted); border: 0; border-radius: 3px; font-size: 0.85rem; line-height: 1; }
    .twisty:hover:not(:disabled) { color: var(--teal); background: rgb(15 110 107 / 12%); }
    .twisty:disabled { opacity: 0.4; cursor: default; }
    .sub-count { margin-left: 0.4rem; padding: 0 0.4rem; border-radius: 999px; background: #d6cdbb; color: var(--ink); font-size: 0.68rem; font-weight: 400; }
    .meta-list tr.off td, .meta-table tr.off td { color: #9b9588; font-style: italic; }
    .off-tag { margin-left: 0.4rem; padding: 0 0.35rem; border: 1px solid #cfc7b7; border-radius: 3px; font-size: 0.66rem; font-style: normal; font-weight: 400; color: #8a8478; }
    .meta-list tr.selected td { background: #0a64c8; color: white; }
    .meta-list tr.selected .twisty { color: white; }
    .meta-list tr.selected .off-tag { color: white; border-color: rgb(255 255 255 / 60%); }
    .meta-list tr.selected .sub-count { background: rgb(255 255 255 / 25%); color: white; }
    .meta-list tr.extra td { background: #e4eef8; }
    .meta-list td:nth-child(3) { color: var(--muted); }
    .meta-list tr.selected td:nth-child(3) { color: white; }
    .dot { color: #d27a00; margin-left: 0.25rem; font-size: 0.7rem; }
    .meta-detail { min-height: 0; overflow: auto; padding: 0.7rem 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.85rem; }
    .entry-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.6rem; }
    .entry-title { min-width: 0; }
    .entry-title h3 { font-size: 1rem; margin: 0; overflow-wrap: anywhere; }
    .entry-title small { color: var(--muted); font-size: 0.76rem; }
    .entry-actions { display: flex; align-items: center; gap: 0.3rem; flex: none; }
    .on-display { margin-right: 0.4rem; white-space: nowrap; }
    .on-display small { color: var(--muted); }
    .off-note { margin: -0.4rem 0 0; padding: 0.35rem 0.6rem; border: 1px solid #e3c79a; border-radius: 4px; background: #fff6e3; color: #7a4a00; font-size: 0.8rem; }
    .preview.off { opacity: 0.55; }
    .entry-actions button { font-size: 0.85rem; padding: 0.1rem 0.55rem; line-height: 1.4; }

    .preview { border: 1px solid var(--line); border-radius: 6px; background: var(--panel); padding: 0.45rem 0.7rem 0.55rem; display: flex; flex-direction: column; gap: 0.15rem; }
    .preview-tag { font-size: 0.64rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
    .preview-row { display: flex; align-items: baseline; gap: 0.5rem; min-width: 0; }
    .preview-row strong { font-size: 1.05rem; overflow-wrap: anywhere; }
    .preview-row strong.borrowed { color: var(--muted); font-weight: 600; }
    .preview-row .overflow { color: #b8341c; text-decoration: line-through; text-decoration-thickness: 1px; font-weight: 400; }
    .preview-row em { color: var(--muted); }
    .borrowed-note { color: #a86200; font-size: 0.7rem; white-space: nowrap; }
    .preview-value { margin-left: auto; font-size: 1.05rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .preview p { margin: 0; color: var(--muted); font-size: 0.8rem; overflow-wrap: anywhere; }

    .text-group { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
    .text-group > header { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.2rem 0.7rem; }
    .text-group h4 { margin: 0; font-size: 0.84rem; }
    .text-group > header small { color: var(--muted); font-size: 0.74rem; }
    .inline-check, .inline-field { display: inline-flex; flex-direction: row; align-items: center; gap: 0.3rem; font-size: 0.78rem; color: var(--ink); }
    .inline-check input { width: auto; }
    .lang-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.4rem; }
    .lang-field { position: relative; display: flex; min-width: 0; border: 1px solid var(--line); border-radius: 4px; background: white; }
    .lang-field:focus-within { border-color: var(--teal); box-shadow: 0 0 0 2px rgb(15 110 107 / 18%); }
    .lang-tag { flex: none; width: 2.1rem; display: flex; justify-content: center; align-items: center; font-size: 0.7rem; font-weight: 600; color: var(--muted); background: #f3efe6; border-right: 1px solid var(--line); border-radius: 3px 0 0 3px; }
    .lang-tag.fallback { color: var(--teal); }
    .lang-field.multiline .lang-tag { align-items: flex-start; padding-top: 0.35rem; }
    .lang-field input, .lang-field textarea { flex: 1; min-width: 0; width: auto; border: 0; border-radius: 0 3px 3px 0; background: transparent; padding: 0.3rem 0.45rem; font-size: 0.86rem; outline: none; }
    .lang-field input { padding-right: 3.1rem; }
    .lang-field textarea { resize: vertical; min-height: 2.9rem; max-height: 16rem; field-sizing: content; padding-bottom: 1rem; line-height: 1.35; }
    .lang-field ::placeholder { color: #a9a294; font-style: italic; }
    .count { position: absolute; right: 0.4rem; bottom: 0.2rem; color: var(--muted); font-size: 0.68rem; font-variant-numeric: tabular-nums; pointer-events: none; }
    .lang-field:not(.multiline) .count { top: 50%; bottom: auto; transform: translateY(-50%); }
    .lang-field.long { border-color: #d4503a; background: #fde4dc; }
    .lang-field.long .count { color: #b8341c; font-weight: 600; }
    .lang-field.missing { border-style: dashed; border-color: #d27a00; }
    .copy { position: absolute; right: 0.25rem; top: 0.2rem; padding: 0.05rem 0.35rem; font-size: 0.68rem; background: transparent; color: #a86200; border: 1px solid #e3c79a; border-radius: 3px; }
    .copy:hover { background: #fff3dd; }
    input.long { border-color: #d4503a; background: #fde4dc; }

    .meta-texts th small { color: var(--muted); font-weight: normal; margin-left: 0.25rem; }
    .meta-texts input { width: 100%; font-size: 0.84rem; padding: 0.24rem 0.4rem; }
    input.short { width: 6rem; flex: none; padding: 0.2rem 0.35rem; font-size: 0.82rem; }
    .meta-texts td:first-child input.short { width: 5rem; }
    .text-group .row-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
    .text-group .row-actions button, .use-list { font-size: 0.8rem; padding: 0.2rem 0.55rem; }
    .use-list { width: auto; max-width: 18rem; }
    .meta-used { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; font-size: 0.82rem; }
    .meta-used button { font-size: 0.8rem; padding: 0.15rem 0.5rem; }
    .meta-table { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .meta-table .meta-texts input.long { border-color: #d4503a; background: #fde4dc; }
    .meta-table .meta-toolbar { background: white; }
    .meta-table .meta-filter { margin: 0; }
    .meta-empty p { max-width: 46rem; }
  `],
})
export class MetaEditorComponent {
  /** Device whose tab shows the editor: an object dictionary or a meta project. */
  readonly device = input.required<OpenDevice>();
  /** True while the tab is visible. */
  readonly active = input(false);
  /** Asks the app to show the object dictionary tab of a device. */
  readonly showOd = output<OpenDevice>();

  readonly kinds = TEXT_KINDS;
  readonly kindLabels = TEXT_KIND_LABELS;
  readonly lengthKinds = ['label', 'tooltip', 'unit', 'value'];
  readonly fromManufacturer = 0x2000;

  private readonly store = inject(ProjectStore);
  private readonly link = inject(MetaLinkService);
  private readonly dialogs = inject(DialogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly meta = computed(() => this.store.metaOf(this.device()));
  readonly od = computed(() => {
    const meta = this.meta();
    return meta ? this.store.odOf(meta) : this.device();
  });
  /** Changes whenever the meta project or the object dictionary changes. */
  private readonly revision = computed(() => `${this.meta()?.revision ?? 0}/${this.od()?.revision ?? 0}`);

  readonly languages = computed(() => {
    this.revision();
    const meta = this.meta();
    const list = meta ? languagesOf(meta.document) : [];
    return list.length ? list : ['en'];
  });
  readonly fallback = computed(() => {
    this.revision();
    const meta = this.meta();
    return meta ? fallbackOf(meta.document) || this.languages()[0] : 'en';
  });
  readonly issues = computed<MetaIssue[]>(() => {
    this.revision();
    const meta = this.meta();
    const od = this.od();
    return meta ? checkMeta(meta.document, od && od !== meta ? od.document : null) : [];
  });

  view: 'entry' | 'table' = 'entry';
  language = '';
  filter = '';
  /** Also list the entries that are not shown on the display. */
  showHidden = false;
  /** Indexes of the ARRAY/RECORD objects whose sub entries are folded away. */
  collapsed = new Set<number>();
  showIssues = false;
  selected: MetaAddress | null = null;
  extra = new Set<string>();
  tableKind: TextKind = 'label';
  onlyMissing = false;
  valueRows: ValueRow[] = [];

  createOpen = false;
  createFrom = 0x2000;
  createLanguages = 'de, en';
  createFallback = 'de';
  createSource = 'en';
  createLabelLength = DEFAULT_MAX_LENGTH['label'];

  settingsOpen = false;
  settingsLanguages = '';
  settingsFallback = '';
  settingsLengths: Record<string, number> = {};
  settingsSource = '';

  /** The user changed the selection in this editor since it was opened. */
  private userSelected = false;
  private wasActive = false;
  private seenMeta: DeviceDocument | null = null;

  constructor() {
    effect(() => {
      const active = this.active();
      const meta = this.meta();
      untracked(() => {
        if (meta?.document !== this.seenMeta) {
          this.seenMeta = meta?.document ?? null;
          this.selected = null;
          this.extra.clear();
          this.collapsed = new Set<number>();
          this.language = this.fallback();
          if (active && this.wasActive) {
            this.followOd(); // e.g. a meta project was just created or opened
          }
        }
        if (!this.languages().includes(this.language)) {
          this.language = this.fallback();
        }
        if (active && !this.wasActive) {
          this.followOd();
        } else if (!active && this.wasActive) {
          this.leave();
        }
        this.wasActive = active;
      });
    });
  }

  // -------------------------------------------------------------------------------- list

  private rowCache: { key: string; rows: ListRow[]; hidden: number } = { key: '', rows: [], hidden: 0 };

  /**
   * All entries that pass the filter text and the "Hidden" switch, in address order. An object is listed with
   * its matching sub entries even if it does not match itself; the selected entry stays listed while it is hidden.
   */
  private allRows(): ListRow[] {
    return this.listed().rows;
  }

  private listed(): { rows: ListRow[]; hidden: number } {
    const meta = this.meta();
    if (!meta) {
      return { rows: [], hidden: 0 };
    }
    const selectedKey = this.selected ? formatMetaAddress(this.selected) : '';
    const filter = this.filter.trim().toLowerCase();
    const key = [meta.id, this.revision(), filter, this.language, this.fallback(), this.showHidden, selectedKey].join('|');
    if (this.rowCache.key === key) {
      return this.rowCache;
    }
    const issueKeys = new Set(this.issues().map((issue) => formatMetaAddress(issue.address)));
    const rows: ListRow[] = [];
    let hiddenCount = 0;
    let head: ListRow | null = null;
    let headListed = false;
    for (const { address, object, sub } of metaEntries(meta.document)) {
      const entry = sub ?? object;
      const addressText = formatMetaAddress(address);
      const hidden = isHidden(object, sub);
      if (hidden) {
        hiddenCount++;
      }
      const row: ListRow = {
        key: addressText,
        address,
        entry,
        isSub: sub != null,
        isHead: sub == null && isComplex(object),
        hidden,
        hiddenOwn: isExportOff(entry) || (!sub && object.disabled),
        addressText: sub ? `:${addressText.slice(-2)}` : addressText.replace(/:00$/, ''),
        name: entry.name,
        text: displayText(entry, 'label', this.language, this.fallback()),
        issue: issueKeys.has(addressText),
        subCount: 0,
        subIssue: false,
      };
      if (!sub) {
        head = row;
        headListed = false;
      }
      if (hidden && !this.showHidden && addressText !== selectedKey) {
        continue;
      }
      if (sub && head) {
        head.subCount++;
        head.subIssue = head.subIssue || row.issue;
      }
      if (filter && !(row.addressText.toLowerCase().includes(filter) || row.key.toLowerCase().includes(filter)
        || row.name.toLowerCase().includes(filter) || Object.values(entry.texts).some((text) => text.toLowerCase().includes(filter)))) {
        continue;
      }
      if (sub && head && !headListed) {
        rows.push(head);
      }
      headListed = true;
      rows.push(row);
    }
    this.rowCache = { key, rows, hidden: hiddenCount };
    return this.rowCache;
  }

  /** Rows of the list: without the sub entries of collapsed objects. A filter text lists its matches anyway. */
  rows(): ListRow[] {
    const all = this.allRows();
    if (this.filtering() || !this.collapsed.size) {
      return all;
    }
    return all.filter((row) => !row.isSub || !this.collapsed.has(row.address.index));
  }

  tableRows(): ListRow[] {
    const languages = this.languages();
    return this.allRows().filter((row) => !this.onlyMissing
      || (languages.some((l) => getText(row.entry, this.tableKind, l)) && languages.some((l) => !getText(row.entry, this.tableKind, l))));
  }

  /** Number of entries that are not shown on the display. */
  hiddenCount(): number {
    return this.listed().hidden;
  }

  filtering(): boolean {
    return this.filter.trim() !== '';
  }

  // -------------------------------------------------------------------------------- folding

  isCollapsed(row: ListRow): boolean {
    return !this.filtering() && this.collapsed.has(row.address.index);
  }

  canCollapse(): boolean {
    return this.allRows().some((row) => row.isHead && !this.collapsed.has(row.address.index));
  }

  toggle(event: Event, row: ListRow): void {
    event.stopPropagation();
    if (this.collapsed.delete(row.address.index)) {
      return;
    }
    this.collapsed.add(row.address.index);
    this.selectHeadOfFolded();
  }

  collapseAll(): void {
    this.collapsed = new Set(this.allRows().filter((row) => row.isHead).map((row) => row.address.index));
    this.selectHeadOfFolded();
  }

  expandAll(): void {
    this.collapsed = new Set<number>();
  }

  /** A selected sub entry that was just folded away hands the selection to its object. */
  private selectHeadOfFolded(): void {
    const selected = this.selected;
    if (selected && this.collapsed.has(selected.index) && this.allRows().some((row) => row.isSub && sameAddress(row.address, selected))) {
      this.extra.clear();
      this.selected = { index: selected.index, sub: null };
      this.loadValueRows();
    }
  }

  isSelected(address: MetaAddress): boolean {
    return sameAddress(this.selected, address);
  }

  clickRow(event: MouseEvent, row: ListRow): void {
    if ((event.ctrlKey || event.metaKey) && this.selected) {
      if (!this.extra.delete(row.key) && !this.isSelected(row.address)) {
        this.extra.add(row.key);
      }
      return;
    }
    if (event.shiftKey && this.selected) {
      const rows = this.rows();
      const from = rows.findIndex((r) => this.isSelected(r.address));
      const to = rows.indexOf(row);
      if (from >= 0 && to >= 0) {
        this.extra = new Set(rows.slice(Math.min(from, to), Math.max(from, to) + 1).map((r) => r.key).filter((key) => key !== rows[from].key));
        return;
      }
    }
    this.extra.clear();
    this.selectAddress(row.address, true);
  }

  selectAddress(address: MetaAddress, byUser: boolean): void {
    if (address.sub != null) {
      this.collapsed.delete(address.index); // a selected sub entry is always listed
    }
    this.selected = address;
    this.userSelected = this.userSelected || byUser;
    this.loadValueRows();
    if (byUser) {
      this.view = 'entry';
    }
  }

  entry(): OdEntry | null {
    this.revision();
    const meta = this.meta();
    return meta && this.selected ? entryAt(meta.document, this.selected) : null;
  }

  addressText(): string {
    return this.selected ? formatMetaAddress(this.selected) : '';
  }

  // -------------------------------------------------------------------------------- texts

  text(entry: OdEntry, kind: string, language: string): string {
    return getText(entry, kind, language);
  }

  setEntryText(entry: OdEntry, kind: string, language: string, value: string): void {
    setText(entry, kind, language, value);
    this.touch();
  }

  maxOf(kind: string): number {
    const meta = this.meta();
    return meta ? maxLength(meta.document.textInfo, kind) : DEFAULT_MAX_LENGTH[kind] ?? 0;
  }

  length(entry: OdEntry, kind: string, language: string): number {
    return textLength(getText(entry, kind, language));
  }

  tooLong(entry: OdEntry, kind: string, language: string): boolean {
    const max = this.maxOf(kind);
    return max > 0 && this.length(entry, kind, language) > max;
  }

  /** Whether the selected entry is shown on the display, and if not, why. */
  visibility(): { hidden: boolean; inherited: boolean; hint: string; note: string } {
    this.revision();
    const meta = this.meta();
    const selected = this.selected;
    const object = meta && selected ? meta.document.objects.find((entry) => entry.index === selected.index) : undefined;
    const shownHint = 'Shown on the display: its texts are exported to the firmware. Untick to hide the entry here and leave it out of the export.';
    if (!object || !selected) {
      return { hidden: false, inherited: false, hint: shownHint, note: '' };
    }
    const sub = isComplex(object) && selected.sub != null ? object.subObjects.find((entry) => entry.subIndex === selected.sub) ?? null : null;
    const where = formatMetaAddress({ index: object.index, sub: null }).replace(/:00$/, '');
    if (object.disabled) {
      const note = `Object ${where} is disabled: it is not part of the firmware and its texts are not exported.`;
      return { hidden: true, inherited: true, hint: note, note };
    }
    if (sub && isExportOff(object)) {
      const note = `Object ${where} is not shown on the display, so its sub entries are not either. Tick "On display" at the object to change that.`;
      return { hidden: true, inherited: true, hint: note, note };
    }
    if (isHidden(object, sub)) {
      return {
        hidden: true,
        inherited: false,
        hint: 'Not shown on the display. Tick to show it again.',
        note: !sub && isComplex(object)
          ? 'Not shown on the display: this object and its sub entries are left out of the firmware export. The texts are kept.'
          : 'Not shown on the display: the entry is left out of the firmware export. The texts are kept.',
      };
    }
    return { hidden: false, inherited: false, hint: shownHint, note: '' };
  }

  /** Shows or hides the selected entry, and the entries selected with it, on the display. */
  setOnDisplay(on: boolean): void {
    const entry = this.entry();
    if (!entry) {
      return;
    }
    const targets = [entry, ...this.allRows().filter((row) => this.extra.has(row.key)).map((row) => row.entry)];
    targets.forEach((target) => setExportOff(target, !on));
    if (!on && !this.showHidden) {
      this.extra.clear(); // they leave the list
    }
    this.touch();
  }

  setTooltipExport(entry: OdEntry, on: boolean): void {
    entry.textExport = on
      ? [...entry.textExport.filter((kind) => kind !== 'tooltip'), 'tooltip']
      : entry.textExport.filter((kind) => kind !== 'tooltip');
    this.touch();
  }

  setMultiplier(entry: OdEntry, value: string): void {
    entry.multiplier = value.trim();
    this.touch();
  }

  multiplierValid(entry: OdEntry): boolean {
    return isValidMultiplier(entry.multiplier);
  }

  /** What the multiplier does to the limits of the entry, or to a sample raw value. */
  valueHint(entry: OdEntry): string {
    if (!entry.multiplier || !this.multiplierValid(entry)) {
      return 'Displayed value = raw value × multiplier';
    }
    const unit = displayText(entry, 'unit', this.language, this.fallback());
    const suffix = unit ? ' ' + unit : '';
    const low = numberOf(entry.lowLimit);
    const high = numberOf(entry.highLimit);
    if (low != null && high != null) {
      return `Raw ${entry.lowLimit} … ${entry.highLimit} is shown as ${this.formatRaw(entry, low)} … ${this.formatRaw(entry, high)}${suffix}`;
    }
    return `Raw 100 is shown as ${this.formatRaw(entry, 100)}${suffix}`;
  }

  private formatRaw(entry: OdEntry, raw: number): string {
    const valid = !!entry.multiplier && this.multiplierValid(entry);
    const decimals = valid ? Math.min(9, (entry.multiplier.split(/e/i)[0].split('.')[1] ?? '').length) : 0;
    return (raw * (valid ? Number(entry.multiplier) : 1)).toFixed(decimals);
  }

  isMultiline(kind: string): boolean {
    return kind === 'tooltip' || kind === 'description';
  }

  /** Rows of a text area for browsers that do not size it by its content. */
  rowsFor(entry: OdEntry, kind: string, language: string): number {
    const text = getText(entry, kind, language);
    const lines = text.split('\n').reduce((sum, line) => sum + 1 + Math.floor(line.length / 48), 0);
    return Math.max(kind === 'description' ? 3 : 2, Math.min(12, lines));
  }

  /** A text that exists in another language but not in this one; units fall back by design. */
  isMissing(entry: OdEntry, kind: string, language: string): boolean {
    return kind !== 'unit' && !getText(entry, kind, language)
      && this.languages().some((other) => other !== language && !!getText(entry, kind, other));
  }

  placeholderFor(entry: OdEntry, kind: string, language: string): string {
    return language !== this.fallback() ? getText(entry, kind, this.fallback()) : '';
  }

  canCopyFallback(entry: OdEntry, kind: string, language: string): boolean {
    return kind !== 'unit' && language !== this.fallback() && !getText(entry, kind, language) && !!getText(entry, kind, this.fallback());
  }

  copyFallback(entry: OdEntry, kind: string, language: string): void {
    this.setEntryText(entry, kind, language, getText(entry, kind, this.fallback()));
  }

  /** Object type, data type, access and limits of the entry, as copied from the object dictionary. */
  structureInfo(entry: OdEntry): string {
    if (entry.subObjects.length && (entry.objectType === 'ARRAY' || entry.objectType === 'RECORD')) {
      return `${entry.objectType} · ${entry.subObjects.length} sub entries`;
    }
    const parts: string[] = [entry.dataType === 'UNKNOWN' ? entry.objectType : entry.dataType];
    const access: Record<string, string> = { const: 'const', read: 'ro', write: 'wo', readWrite: 'rw', readWriteInput: 'rw', readWriteOutput: 'rw' };
    if (access[entry.access]) {
      parts.push(access[entry.access]);
    }
    if (entry.lowLimit || entry.highLimit) {
      parts.push(`${entry.lowLimit || '…'} … ${entry.highLimit || '…'}`);
    }
    return parts.join(' · ');
  }

  /** The texts as a display would show them in the selected language, with fallback. */
  preview(entry: OdEntry): { label: string; labelOverflow: string; labelFromFallback: boolean; value: string; tooltip: string } {
    const language = this.language;
    const fallback = this.fallback();
    const own = getText(entry, 'label', language);
    const full = Array.from(own || getText(entry, 'label', fallback));
    const max = this.maxOf('label');
    const label = (max > 0 ? full.slice(0, max) : full).join('');
    const labelOverflow = max > 0 ? full.slice(max).join('') : '';
    const unit = displayText(entry, 'unit', language, fallback);
    let value = unit;
    const complex = entry.subObjects.length > 0 && (entry.objectType === 'ARRAY' || entry.objectType === 'RECORD');
    const first = valueTexts(entry)[0];
    if (first) {
      value = first.texts[language] || first.texts[fallback] || String(first.value);
    } else if (!complex && /^(INTEGER|UNSIGNED|REAL)/.test(entry.dataType)) {
      const sample = numberOf(entry.highLimit) ?? (numberOf(entry.defaultValue) || 100);
      value = this.formatRaw(entry, sample) + (unit ? ' ' + unit : '');
    }
    return { label, labelOverflow, labelFromFallback: !own && !!label, value, tooltip: displayText(entry, 'tooltip', language, fallback) };
  }

  // -------------------------------------------------------------------------------- stepping through the entries

  canStep(delta: number): boolean {
    const rows = this.rows();
    const at = rows.findIndex((row) => this.isSelected(row.address));
    return at >= 0 && at + delta >= 0 && at + delta < rows.length;
  }

  /** Selects the previous or next entry of the list; the focused field stays the same. */
  step(delta: number): void {
    const rows = this.rows();
    const at = rows.findIndex((row) => this.isSelected(row.address));
    const next = at >= 0 ? rows[at + delta] : undefined;
    if (!next) {
      return;
    }
    this.extra.clear();
    this.selectAddress(next.address, true);
    setTimeout(() => this.host.nativeElement.querySelector('.meta-list tr.selected')?.scrollIntoView({ block: 'nearest' }));
  }

  onDetailKey(event: KeyboardEvent): void {
    if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      this.step(event.key === 'ArrowDown' ? 1 : -1);
    }
  }

  // -------------------------------------------------------------------------------- value texts

  private loadValueRows(): void {
    const entry = this.entry();
    this.valueRows = entry ? valueTexts(entry).map((row) => ({ value: String(row.value), texts: { ...row.texts } })) : [];
  }

  private writeValueRows(entry: OdEntry): void {
    const rows = this.valueRows
      .map((row) => ({ value: parseValue(row.value), texts: row.texts }))
      .filter((row): row is { value: number; texts: Record<string, string> } => row.value != null);
    setValueTexts(entry, rows);
    this.touch();
  }

  validValue(i: number): boolean {
    const row = this.valueRows[i];
    const value = parseValue(row.value);
    return value != null && this.valueRows.filter((other) => parseValue(other.value) === value).length === 1;
  }

  rowTooLong(row: ValueRow, language: string): boolean {
    const max = this.maxOf('value.0');
    return max > 0 && textLength(row.texts[language] ?? '') > max;
  }

  setRowValue(entry: OdEntry, i: number, value: string): void {
    this.valueRows[i].value = value;
    this.writeValueRows(entry);
  }

  setRowText(entry: OdEntry, i: number, language: string, text: string): void {
    this.valueRows[i].texts = { ...this.valueRows[i].texts, [language]: text };
    this.writeValueRows(entry);
  }

  addRow(entry: OdEntry): void {
    const used = this.valueRows.map((row) => parseValue(row.value)).filter((value): value is number => value != null);
    const next = used.length ? Math.max(...used) + 1 : 0;
    this.valueRows = [...this.valueRows, { value: String(next), texts: {} }];
    this.writeValueRows(entry);
  }

  removeRow(entry: OdEntry, i: number): void {
    this.valueRows = this.valueRows.filter((_, index) => index !== i);
    this.writeValueRows(entry);
  }

  /** Distinct value text lists of the meta project, most used first. */
  private readonly allValueLists = computed(() => {
    this.revision();
    const meta = this.meta();
    const lists = new Map<string, { rows: { value: number; texts: Record<string, string> }[]; count: number }>();
    for (const { object, sub } of meta ? metaEntries(meta.document) : []) {
      const rows = valueTexts(sub ?? object);
      if (!rows.length) {
        continue;
      }
      const signature = valueSignature(rows);
      const known = lists.get(signature);
      if (known) {
        known.count += 1;
      } else {
        lists.set(signature, { rows, count: 1 });
      }
    }
    return [...lists.entries()].map(([signature, list]) => ({ signature, ...list })).sort((a, b) => b.count - a.count);
  });

  /** Value text lists of other entries that can be taken over, e.g. "Aus / Ein (8×)". */
  valueLists(): { label: string; rows: { value: number; texts: Record<string, string> }[] }[] {
    const entry = this.entry();
    const own = entry ? valueSignature(valueTexts(entry)) : '';
    const fallback = this.fallback();
    return this.allValueLists()
      .filter((list) => list.signature !== own)
      .map((list) => ({
        label: `${list.rows.map((row) => row.texts[this.language] || row.texts[fallback] || String(row.value)).join(' / ')} (${list.count}×)`,
        rows: list.rows,
      }));
  }

  async useValueList(entry: OdEntry, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const list = this.valueLists()[Number(select.value)];
    select.value = '';
    if (!list) {
      return;
    }
    if (this.valueRows.length && !(await this.dialogs.confirm(`Replace the ${this.valueRows.length} value texts of this entry?`))) {
      return;
    }
    setValueTexts(entry, list.rows);
    this.loadValueRows();
    this.touch();
  }

  async copyValuesToSelection(entry: OdEntry): Promise<void> {
    const meta = this.meta();
    if (!meta) {
      return;
    }
    const targets = this.allRows().filter((row) => this.extra.has(row.key)).map((row) => row.entry);
    if (!(await this.dialogs.confirm(`Replace the value texts of ${targets.length} selected entries with these ${this.valueRows.length} value texts?`))) {
      return;
    }
    const rows = valueTexts(entry);
    for (const target of targets) {
      setValueTexts(target, rows);
    }
    this.touch();
  }

  // -------------------------------------------------------------------------------- object dictionary

  users(): { object: OdEntry; sub: OdEntry | null }[] {
    this.revision();
    const meta = this.meta();
    const od = this.od();
    if (!meta || !od || !this.selected) {
      return [];
    }
    return usedBy(od.document, meta.document, this.selected);
  }

  userAddress(object: OdEntry, sub: OdEntry | null): string {
    return sub ? `0x${object.index.toString(16).toUpperCase().padStart(4, '0')}:${sub.subIndex.toString(16).toUpperCase().padStart(2, '0')}`
      : `0x${object.index.toString(16).toUpperCase().padStart(4, '0')}`;
  }

  showInOd(object: OdEntry, sub: OdEntry | null): void {
    const od = this.od();
    if (!od) {
      return;
    }
    this.userSelected = false;
    this.link.requestOdSelection(od.document, object.index, sub ? sub.subIndex : null);
    this.showOd.emit(od);
  }

  /** Entries can be removed if they are not in the object dictionary (which would add them again on sync). */
  canRemove(): boolean {
    const meta = this.meta();
    const od = this.od();
    if (!meta || !this.selected) {
      return false;
    }
    return !od || od === meta || !entryAt(od.document, this.selected);
  }

  async removeSelected(): Promise<void> {
    const meta = this.meta();
    if (!meta || !this.selected) {
      return;
    }
    if (!(await this.dialogs.confirm(`Remove ${formatMetaAddress(this.selected)} and its texts from ${meta.fileName}?`))) {
      return;
    }
    removeMetaEntry(meta.document, this.selected);
    this.selected = null;
    this.extra.clear();
    this.valueRows = [];
    this.touch();
  }

  /** Object dictionary whose selection is coupled with this editor, if it is open. */
  private coupledOd(): OpenDevice | null {
    const meta = this.meta();
    const od = this.od();
    return meta && od && od !== meta ? od : null;
  }

  /** On entering the tab: select the meta entry of the entry selected in the object dictionary view. */
  private followOd(): void {
    this.userSelected = false;
    const meta = this.meta();
    const device = this.coupledOd();
    const selection = device ? this.link.odSelection(device.document) : null;
    if (!meta || !device || !selection || selection.index == null) {
      if (meta && !this.selected) {
        const first = metaEntries(meta.document)[0];
        if (first) {
          this.selectAddress(first.address, false);
        }
      }
      return;
    }
    const found = this.odEntries(device.document, selection);
    if (!found) {
      return;
    }
    const { object, sub } = found;
    const address = metaAddressIn(meta.document, object, sub);
    if (entryAt(meta.document, address)) {
      this.selectAddress(address, false);
    } else if (!this.selected || !entryAt(meta.document, this.selected)) {
      // the selected OD entry has no texts (e.g. a communication object): start with the first entry
      const first = metaEntries(meta.document)[0];
      if (first) {
        this.selectAddress(first.address, false);
      }
    } else {
      this.loadValueRows();
    }
  }

  /**
   * Entry selected in the object dictionary view. A meta address typed into its field but not applied yet
   * replaces the stored one, so the texts of the chosen meta address are shown.
   */
  private odEntries(document: DeviceDocument, selection: OdSelection): { object: OdEntry; sub: OdEntry | null } | null {
    const object = selection.index != null ? document.objects.find((entry) => entry.index === selection.index) : undefined;
    if (!object) {
      return null;
    }
    const sub = selection.subIndex != null ? object.subObjects.find((entry) => entry.subIndex === selection.subIndex) ?? null : null;
    const typed = selection.metaRef;
    if (typed === undefined || (typed !== '' && !parseMetaAddress(typed))) {
      return { object, sub };
    }
    return sub ? { object, sub: { ...sub, metaRef: typed } } : { object: { ...object, metaRef: typed }, sub: null };
  }

  /** On leaving the tab: let the object dictionary view follow a selection made here. */
  private leave(): void {
    const meta = this.meta();
    const device = this.coupledOd();
    if (!this.userSelected || !meta || !device || !this.selected) {
      return;
    }
    this.userSelected = false;
    const selection = this.link.odSelection(device.document);
    const current = selection ? this.odEntries(device.document, selection) : null;
    if (current && sameAddress(metaAddressIn(meta.document, current.object, current.sub), this.selected)) {
      return;
    }
    const user = usedBy(device.document, meta.document, this.selected)[0];
    if (user) {
      this.link.requestOdSelection(device.document, user.object.index, user.sub ? user.sub.subIndex : null);
    }
  }

  // -------------------------------------------------------------------------------- meta project

  metaFileHint(): string {
    const name = this.device().fileName.replace(/\.(xdd|xml)$/i, '');
    return `${name}.xui`;
  }

  openCreate(): void {
    this.createOpen = true;
  }

  create(event: Event): void {
    event.preventDefault();
    const languages = splitList(this.createLanguages);
    if (!languages.length) {
      void this.dialogs.warning('Enter at least one language, e.g. "de, en".');
      return;
    }
    const fallback = this.createFallback.trim() || languages[0];
    if (!languages.includes(fallback)) {
      void this.dialogs.warning('The fallback language must be one of the languages.');
      return;
    }
    this.createOpen = false;
    this.store.createMeta(this.device().id, {
      fromIndex: this.createFrom,
      languages,
      fallbackLanguage: fallback,
      sourceLanguage: this.createSource.trim(),
      sourceFileName: this.device().fileName,
      maxLabelLength: Math.max(0, Math.floor(Number(this.createLabelLength)) || 0),
    });
  }

  async openMetaFile(): Promise<void> {
    const api = (window as any).electronAPI;
    if (api?.openFileDialog) {
      const filePath = await api.openFileDialog({ title: 'Open user interface', format: 'xui' });
      if (!filePath) {
        return;
      }
      try {
        const xml = await api.readFile(filePath);
        this.openMetaXml(filePath.split(/[\\/]/).pop() || 'ui.xui', xml, filePath);
      } catch {
        void this.dialogs.error('The file could not be loaded.');
      }
      return;
    }
    (document.querySelector('app-meta-editor input[type="file"]') as HTMLInputElement | null)?.click();
  }

  openMetaFromInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    void file.text().then((xml) => this.openMetaXml(file.name, xml, null));
  }

  private openMetaXml(fileName: string, xml: string, filePath: string | null): void {
    const error = this.store.openMetaXml(this.device().id, fileName, xml, filePath);
    if (error) {
      void this.dialogs.error(error);
    }
  }

  async sync(): Promise<void> {
    const meta = this.meta();
    const od = this.od();
    if (!meta || !od || od === meta) {
      return;
    }
    const fromIndex = meta.document.objects.some((object) => object.index < 0x2000) ? 0 : 0x2000;
    const result = syncWithOd(meta.document, od.document, fromIndex, this.fallback());
    this.touch();
    const items = [
      ...result.added.map((address) => `added ${formatMetaAddress(address)}`),
      ...result.updated.map((address) => `updated ${formatMetaAddress(address)}`),
      ...result.orphaned.map((address) => `not in the object dictionary (kept): ${formatMetaAddress(address)}`),
    ];
    void this.dialogs.warning(items.length
      ? { text: `${od.fileName} → ${meta.fileName}:`, items }
      : `${meta.fileName} is in line with ${od.fileName}.`, 'Sync with OD');
  }

  openSettings(): void {
    const meta = this.meta();
    if (!meta) {
      return;
    }
    const info = meta.document.textInfo;
    this.settingsLanguages = this.languages().join(', ');
    this.settingsFallback = this.fallback();
    this.settingsLengths = Object.fromEntries(this.lengthKinds.map((kind) => [kind, maxLength(info, kind === 'value' ? 'value.0' : kind)]));
    this.settingsSource = info.metaSource;
    this.settingsOpen = true;
  }

  saveSettings(event: Event): void {
    event.preventDefault();
    const meta = this.meta();
    if (!meta) {
      return;
    }
    const languages = splitList(this.settingsLanguages);
    const fallback = this.settingsFallback.trim() || languages[0] || '';
    if (languages.length && !languages.includes(fallback)) {
      void this.dialogs.warning('The fallback language must be one of the languages.');
      return;
    }
    const info = meta.document.textInfo;
    info.languages = languages;
    info.fallbackLanguage = fallback;
    info.maxLength = Object.fromEntries(this.lengthKinds.map((kind) => [kind, Math.max(0, Number(this.settingsLengths[kind]) || 0)]));
    info.metaSource = this.settingsSource.trim();
    info.metaProject = info.metaProject || meta !== this.od();
    this.settingsOpen = false;
    this.touch();
  }

  private touch(): void {
    const meta = this.meta();
    if (meta) {
      this.store.touch(meta.id);
    }
  }
}

function splitList(text: string): string[] {
  return [...new Set(text.split(',').map((part) => part.trim()).filter((part) => part))];
}

function numberOf(text: string): number | null {
  const value = (text ?? '').trim() === '' ? Number.NaN : Number(text);
  return Number.isFinite(value) ? value : null;
}

function valueSignature(rows: { value: number; texts: Record<string, string> }[]): string {
  return JSON.stringify(rows.map((row) => [row.value, Object.keys(row.texts).sort().map((language) => [language, row.texts[language]])]));
}
