import { Injectable, signal } from '@angular/core';
import { DeviceDocument } from '../model/device';

export interface OdSelection {
  index: number | null;
  subIndex: number | null;
  /** Meta address typed into the field of the selected entry, not yet applied; undefined: none. */
  metaRef?: string;
}

/**
 * Couples the selection of the object dictionary view and the meta editor:
 * the OD view publishes its selection, the meta editor can ask the OD view to select an entry.
 */
@Injectable({ providedIn: 'root' })
export class MetaLinkService {
  private readonly selections = new WeakMap<DeviceDocument, OdSelection>();
  /** Counts selection changes, so views can react to them. */
  readonly selectionRevision = signal(0);
  /** Request to the OD view to select an entry of the document. */
  readonly odRequest = signal<{ document: DeviceDocument; index: number; subIndex: number | null; nonce: number } | null>(null);
  private nonce = 0;

  setOdSelection(document: DeviceDocument, selection: OdSelection): void {
    const old = this.selections.get(document);
    if (old?.index === selection.index && old?.subIndex === selection.subIndex && old?.metaRef === selection.metaRef) {
      return;
    }
    this.selections.set(document, selection);
    this.selectionRevision.update((value) => value + 1);
  }

  odSelection(document: DeviceDocument): OdSelection | null {
    return this.selections.get(document) ?? null;
  }

  requestOdSelection(document: DeviceDocument, index: number, subIndex: number | null): void {
    this.nonce += 1;
    this.odRequest.set({ document, index, subIndex, nonce: this.nonce });
  }
}
