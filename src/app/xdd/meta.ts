/*
    CANopen Editor Web
    Copyright (C) 2026

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
*/

/**
 * Display texts (meta texts) of object dictionary entries, see docs/meta-texts.md in CANopenEditor:
 * meta addresses, meta projects (copies of an object dictionary holding the texts), sync and checks.
 */

import { DeviceDocument, OdEntry, TextInfo, emptyTextInfo, hex2, hex4, sortDocument } from '../model/device';

/** Text kinds edited as text, in display order. Value texts ("value.<n>") are handled separately. */
export const TEXT_KINDS = ['label', 'tooltip', 'description', 'unit'] as const;
export type TextKind = (typeof TEXT_KINDS)[number];

export const TEXT_KIND_LABELS: Record<TextKind, string> = {
  label: 'Label',
  tooltip: 'Tooltip',
  description: 'Description',
  unit: 'Unit',
};

/** Default maximum lengths in characters (0: unlimited). */
export const DEFAULT_MAX_LENGTH: Record<string, number> = {
  label: 16,
  tooltip: 128,
  description: 0,
  unit: 8,
  value: 16,
};

export const VALUE_PREFIX = 'value.';

/** Address of a meta entry: VAR (sub 0), the ARRAY/RECORD object itself (sub null) or a sub entry. */
export interface MetaAddress {
  index: number;
  sub: number | null;
}

export function textKey(kind: string, language: string): string {
  return `${kind}:${language}`;
}

export function splitTextKey(key: string): { kind: string; language: string } | null {
  const pos = key.lastIndexOf(':');
  if (pos <= 0 || pos === key.length - 1) {
    return null;
  }
  return { kind: key.slice(0, pos), language: key.slice(pos + 1) };
}

export function parseMetaAddress(text: string): MetaAddress | null {
  const match = /^\s*(?:0x)?([0-9a-f]{1,4})\s*(?::\s*(?:0x)?([0-9a-f]{1,2}))?\s*$/i.exec(text ?? '');
  if (!match) {
    return null;
  }
  return {
    index: Number.parseInt(match[1], 16),
    sub: match[2] != null ? Number.parseInt(match[2], 16) : null,
  };
}

export function formatMetaAddress(address: MetaAddress): string {
  return address.sub == null ? `0x${hex4(address.index)}` : `0x${hex4(address.index)}:${hex2(address.sub)}`;
}

export function sameAddress(a: MetaAddress | null, b: MetaAddress | null): boolean {
  return !!a && !!b && a.index === b.index && a.sub === b.sub;
}

export function isComplex(object: OdEntry): boolean {
  return (object.objectType === 'ARRAY' || object.objectType === 'RECORD') && object.subObjects.length > 0;
}

/** Own address of an object (VAR: sub 0, ARRAY/RECORD: the object itself) or of a sub entry. */
export function ownAddress(object: OdEntry, sub: OdEntry | null): MetaAddress {
  if (sub) {
    return { index: object.index, sub: sub.subIndex };
  }
  return { index: object.index, sub: isComplex(object) ? null : 0 };
}

/** Entry of a document at an address; a reference to a VAR without sub-index means the VAR. */
export function entryAt(document: DeviceDocument, address: MetaAddress): OdEntry | null {
  const object = document.objects.find((entry) => entry.index === address.index);
  if (!object) {
    return null;
  }
  if (!isComplex(object)) {
    return address.sub == null || address.sub === 0 ? object : null;
  }
  if (address.sub == null) {
    return object;
  }
  return object.subObjects.find((sub) => sub.subIndex === address.sub) ?? null;
}

/**
 * Meta address of an object dictionary entry, following CO_metaRef:
 * a sub entry's own reference, else the object's reference with the own sub-index, else the own address.
 */
export function resolveMetaAddress(object: OdEntry, sub: OdEntry | null): MetaAddress {
  const own = ownAddress(object, sub);
  const objectRef = object.metaRef ? parseMetaAddress(object.metaRef) : null;
  if (sub) {
    const subRef = sub.metaRef ? parseMetaAddress(sub.metaRef) : null;
    if (subRef) {
      return subRef.sub == null ? { index: subRef.index, sub: sub.subIndex } : subRef;
    }
    if (objectRef) {
      return { index: objectRef.index, sub: sub.subIndex };
    }
    return own;
  }
  if (objectRef) {
    return objectRef.sub != null ? objectRef : { index: objectRef.index, sub: own.sub };
  }
  return own;
}

/** All meta entries of a document: VARs, ARRAY/RECORD objects and their sub entries, in address order. */
export function metaEntries(document: DeviceDocument): { address: MetaAddress; object: OdEntry; sub: OdEntry | null }[] {
  const result: { address: MetaAddress; object: OdEntry; sub: OdEntry | null }[] = [];
  for (const object of [...document.objects].sort((a, b) => a.index - b.index)) {
    result.push({ address: ownAddress(object, null), object, sub: null });
    if (isComplex(object)) {
      for (const sub of [...object.subObjects].sort((a, b) => a.subIndex - b.subIndex)) {
        result.push({ address: ownAddress(object, sub), object, sub });
      }
    }
  }
  return result;
}

/** Object dictionary entries whose texts come from the given meta address of the meta project. */
export function usedBy(od: DeviceDocument, meta: DeviceDocument, address: MetaAddress): { object: OdEntry; sub: OdEntry | null }[] {
  const result: { object: OdEntry; sub: OdEntry | null }[] = [];
  for (const { object, sub } of metaEntries(od)) {
    if (!object.disabled && sameAddress(metaAddressIn(meta, object, sub), address)) {
      result.push({ object, sub });
    }
  }
  return result;
}

/** A reference without sub-index to a VAR means sub 0. */
function normalize(document: DeviceDocument, address: MetaAddress): MetaAddress {
  if (address.sub == null) {
    const object = document.objects.find((entry) => entry.index === address.index);
    if (object && !isComplex(object)) {
      return { index: address.index, sub: 0 };
    }
  }
  return address;
}

/** Meta address in the meta project for an object dictionary entry (normalized against the meta project). */
export function metaAddressIn(meta: DeviceDocument, object: OdEntry, sub: OdEntry | null): MetaAddress {
  return normalize(meta, resolveMetaAddress(object, sub));
}

// ---------------------------------------------------------------------------------------------
// texts

export function getText(entry: OdEntry, kind: string, language: string): string {
  return entry.texts[textKey(kind, language)] ?? '';
}

export function setText(entry: OdEntry, kind: string, language: string, value: string): void {
  const key = textKey(kind, language);
  if (value) {
    entry.texts[key] = value;
  } else {
    delete entry.texts[key];
  }
}

/** Text in the language, else in the fallback language. */
export function displayText(entry: OdEntry | null, kind: string, language: string, fallback: string): string {
  if (!entry) {
    return '';
  }
  return getText(entry, kind, language) || getText(entry, kind, fallback);
}

export function hasTexts(entry: OdEntry): boolean {
  return Object.keys(entry.texts).length > 0 || !!entry.multiplier;
}

/** Number of characters as seen by the user (code points). */
export function textLength(text: string): number {
  return Array.from(text).length;
}

export function maxLength(info: TextInfo, kind: string): number {
  const key = kind.startsWith(VALUE_PREFIX) ? 'value' : kind;
  return info.maxLength[key] ?? DEFAULT_MAX_LENGTH[key] ?? 0;
}

/** Languages of a document: configured, else the ones used in texts (fallback first). */
export function languagesOf(document: DeviceDocument): string[] {
  if (document.textInfo.languages.length) {
    return [...document.textInfo.languages];
  }
  const found = new Set<string>();
  for (const { object, sub } of metaEntries(document)) {
    for (const key of Object.keys((sub ?? object).texts)) {
      const parts = splitTextKey(key);
      if (parts) {
        found.add(parts.language);
      }
    }
  }
  const list = [...found].sort();
  const fallback = document.textInfo.fallbackLanguage;
  return fallback ? [fallback, ...list.filter((language) => language !== fallback)] : list;
}

export function fallbackOf(document: DeviceDocument): string {
  const languages = languagesOf(document);
  return languages.includes(document.textInfo.fallbackLanguage) ? document.textInfo.fallbackLanguage : (languages[0] ?? '');
}

/** Value texts of an entry, sorted by value: value -> language -> text. */
export function valueTexts(entry: OdEntry): { value: number; texts: Record<string, string> }[] {
  const byValue = new Map<number, Record<string, string>>();
  for (const [key, text] of Object.entries(entry.texts)) {
    const parts = splitTextKey(key);
    if (!parts || !parts.kind.startsWith(VALUE_PREFIX)) {
      continue;
    }
    const value = parseValue(parts.kind.slice(VALUE_PREFIX.length));
    if (value == null) {
      continue;
    }
    const texts = byValue.get(value) ?? {};
    texts[parts.language] = text;
    byValue.set(value, texts);
  }
  return [...byValue.entries()].sort((a, b) => a[0] - b[0]).map(([value, texts]) => ({ value, texts }));
}

export function parseValue(text: string): number | null {
  const trimmed = (text ?? '').trim();
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  let value: number;
  if (/^0x[0-9a-f]+$/i.test(body)) {
    value = Number.parseInt(body.slice(2), 16);
  } else if (/^\d+$/.test(body)) {
    value = Number.parseInt(body, 10);
  } else {
    return null;
  }
  value = negative ? -value : value;
  return value >= -2147483648 && value <= 2147483647 ? value : null;
}

/** Replaces all value texts of an entry. */
export function setValueTexts(entry: OdEntry, rows: { value: number; texts: Record<string, string> }[]): void {
  for (const key of Object.keys(entry.texts)) {
    if (splitTextKey(key)?.kind.startsWith(VALUE_PREFIX)) {
      delete entry.texts[key];
    }
  }
  for (const row of rows) {
    for (const [language, text] of Object.entries(row.texts)) {
      if (text) {
        entry.texts[textKey(`${VALUE_PREFIX}${row.value}`, language)] = text;
      }
    }
  }
}

export function isValidMultiplier(text: string): boolean {
  return text === '' || /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text.trim());
}

// ---------------------------------------------------------------------------------------------
// meta project

export interface CreateMetaOptions {
  /** Objects from this index on are copied (e.g. 0x2000); 0 copies all. */
  fromIndex: number;
  languages: string[];
  fallbackLanguage: string;
  /** Language of the names and descriptions in the object dictionary; they prefill label and description. */
  sourceLanguage: string;
  /** File name of the object dictionary, stored as CO_metaSource. */
  sourceFileName: string;
}

/** File name of the meta project of an object dictionary: "device.xdd" -> "device_meta.xdd". */
export function metaFileName(odFileName: string): string {
  const base = odFileName.replace(/^.*[\\/]/, '').replace(/\.(xdd|xml|xdc|xpd)$/i, '') || 'device';
  return `${base}_meta.xdd`;
}

/** Copies the object dictionary into a new meta project; names and descriptions prefill the texts. */
export function createMetaProject(od: DeviceDocument, options: CreateMetaOptions): DeviceDocument {
  const meta = structuredClone(od);
  meta.objects = meta.objects.filter((object) => object.index >= options.fromIndex);
  meta.fileName = metaFileName(options.sourceFileName || od.fileName);
  meta.fileCreationDate = '';
  meta.fileCreationTime = '';
  meta.description = `Meta project (display texts) for ${od.productName || options.sourceFileName}`;
  meta.textInfo = {
    ...emptyTextInfo(),
    languages: [...options.languages],
    fallbackLanguage: options.fallbackLanguage,
    maxLength: { label: DEFAULT_MAX_LENGTH['label'], tooltip: DEFAULT_MAX_LENGTH['tooltip'], unit: DEFAULT_MAX_LENGTH['unit'], value: DEFAULT_MAX_LENGTH['value'] },
    metaProject: true,
    metaSource: (options.sourceFileName || od.fileName).replace(/^.*[\\/]/, ''),
  };
  for (const { object, sub } of metaEntries(meta)) {
    if (sub?.subIndex === 0) {
      sub.metaRef = '';
      continue; // "Highest sub-index supported" rarely needs a display text
    }
    prefill(sub ?? object, options.sourceLanguage);
  }
  sortDocument(meta);
  return meta;
}

function prefill(entry: OdEntry, language: string): void {
  entry.metaRef = '';
  if (!language) {
    return;
  }
  if (entry.name && !getText(entry, 'label', language)) {
    setText(entry, 'label', language, entry.name);
  }
  if (entry.description && !getText(entry, 'description', language)) {
    setText(entry, 'description', language, entry.description);
  }
}

export interface SyncResult {
  added: MetaAddress[];
  updated: MetaAddress[];
  /** Meta entries without object dictionary entry; they are kept. */
  orphaned: MetaAddress[];
}

/**
 * Brings the meta project in line with the object dictionary: missing objects and sub entries are added
 * (with prefilled label), names, types and structure data are updated, texts are kept. Objects below
 * fromIndex are only updated, not added.
 */
export function syncWithOd(meta: DeviceDocument, od: DeviceDocument, fromIndex: number, sourceLanguage: string): SyncResult {
  const result: SyncResult = { added: [], updated: [], orphaned: [] };
  for (const odObject of od.objects) {
    let metaObject = meta.objects.find((object) => object.index === odObject.index);
    if (!metaObject) {
      if (odObject.index < fromIndex) {
        continue;
      }
      metaObject = structuredClone(odObject);
      for (const { object, sub } of metaEntries({ ...meta, objects: [metaObject] })) {
        (sub ?? object).texts = {};
        (sub ?? object).textExport = [];
        (sub ?? object).multiplier = '';
        if (sub?.subIndex !== 0) {
          prefill(sub ?? object, sourceLanguage);
        }
        result.added.push(ownAddress(object, sub));
      }
      meta.objects.push(metaObject);
      continue;
    }
    if (updateStructure(metaObject, odObject)) {
      result.updated.push(ownAddress(metaObject, null));
    }
    for (const odSub of odObject.subObjects) {
      const metaSub = metaObject.subObjects.find((sub) => sub.subIndex === odSub.subIndex);
      if (!metaSub) {
        const copy = structuredClone(odSub);
        copy.texts = {};
        copy.textExport = [];
        copy.multiplier = '';
        if (copy.subIndex !== 0) {
          prefill(copy, sourceLanguage);
        }
        metaObject.subObjects.push(copy);
        result.added.push({ index: odObject.index, sub: odSub.subIndex });
      } else if (updateStructure(metaSub, odSub)) {
        result.updated.push({ index: odObject.index, sub: odSub.subIndex });
      }
    }
  }
  for (const { address } of metaEntries(meta)) {
    if (!entryAt(od, address)) {
      result.orphaned.push(address);
    }
  }
  sortDocument(meta);
  return result;
}

/** Copies name and structure data (not the texts) from the object dictionary; true if something changed. */
function updateStructure(target: OdEntry, source: OdEntry): boolean {
  let changed = false;
  for (const key of ['name', 'objectType', 'dataType', 'access', 'pdoMapping', 'lowLimit', 'highLimit', 'defaultValue', 'disabled'] as const) {
    if (target[key] !== source[key]) {
      (target as unknown as Record<string, unknown>)[key] = source[key];
      changed = true;
    }
  }
  return changed;
}

/** Removes a meta entry: a VAR or an ARRAY/RECORD object with its sub entries, or one sub entry. */
export function removeMetaEntry(meta: DeviceDocument, address: MetaAddress): boolean {
  const object = meta.objects.find((entry) => entry.index === address.index);
  if (!object) {
    return false;
  }
  if (address.sub == null || !isComplex(object)) {
    meta.objects = meta.objects.filter((entry) => entry !== object);
    return true;
  }
  const before = object.subObjects.length;
  object.subObjects = object.subObjects.filter((sub) => sub.subIndex !== address.sub);
  return object.subObjects.length !== before;
}

// ---------------------------------------------------------------------------------------------
// checks

export type MetaIssueKind = 'missing-translation' | 'too-long' | 'dangling-ref' | 'unused' | 'orphaned' | 'invalid';

export interface MetaIssue {
  kind: MetaIssueKind;
  address: MetaAddress;
  message: string;
}

/** Checks the texts of a meta project; with the object dictionary also the meta addresses. */
export function checkMeta(meta: DeviceDocument, od: DeviceDocument | null): MetaIssue[] {
  const issues: MetaIssue[] = [];
  const languages = languagesOf(meta);
  for (const { address, object, sub } of metaEntries(meta)) {
    const entry = sub ?? object;
    const where = formatMetaAddress(address);
    const kinds = new Set<string>();
    for (const [key, text] of Object.entries(entry.texts)) {
      const parts = splitTextKey(key);
      if (!parts) {
        continue;
      }
      kinds.add(parts.kind);
      const max = maxLength(meta.textInfo, parts.kind);
      if (max > 0 && textLength(text) > max) {
        issues.push({ kind: 'too-long', address, message: `${where} ${parts.kind} (${parts.language}): ${textLength(text)} characters, maximum ${max}` });
      }
    }
    for (const kind of kinds) {
      const missing = languages.filter((language) => !getText(entry, kind, language));
      if (missing.length && kind !== 'unit') {
        issues.push({ kind: 'missing-translation', address, message: `${where} ${kind}: missing ${missing.join(', ')}` });
      }
    }
    if (!isValidMultiplier(entry.multiplier)) {
      issues.push({ kind: 'invalid', address, message: `${where}: multiplier "${entry.multiplier}" is not a number` });
    }
    const odObject = od?.objects.find((candidate) => candidate.index === address.index);
    if (od && hasTexts(entry) && !odObject?.disabled && usedBy(od, meta, address).length === 0) {
      const inOd = !!entryAt(od, address);
      issues.push({
        kind: inOd ? 'unused' : 'orphaned',
        address,
        message: inOd ? `${where}: not used, the object dictionary refers to other meta entries`
          : `${where}: not in the object dictionary`,
      });
    }
  }
  if (od) {
    for (const { address, object, sub } of metaEntries(od)) {
      const ref = (sub ?? object).metaRef;
      if (!ref) {
        continue;
      }
      if (!parseMetaAddress(ref)) {
        issues.push({ kind: 'invalid', address, message: `${formatMetaAddress(address)}: invalid meta address "${ref}"` });
        continue;
      }
      const target = metaAddressIn(meta, object, sub);
      if (!entryAt(meta, target)) {
        issues.push({ kind: 'dangling-ref', address, message: `${formatMetaAddress(address)}: meta address ${formatMetaAddress(target)} does not exist` });
      }
    }
  }
  return issues;
}
