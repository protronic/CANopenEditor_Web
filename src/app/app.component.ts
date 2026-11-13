import { Component, computed, signal, OnInit, OnDestroy, effect, HostListener } from '@angular/core';
import { DeviceInfoComponent } from './device-info.component';
import { DialogHostComponent } from './dialog-host.component';
import { InsertProfileComponent } from './insert-profile.component';
import { ObjectDictionaryComponent } from './object-dictionary.component';
import { PdoViewComponent } from './pdo-view.component';
import { DialogService } from './state/dialog.service';
import { OpenDevice, ProjectStore } from './state/project.store';
import { ConverterService, LoadConvertedFileEvent, ExportFileEvent } from './services/converter.service';
import { Subscription } from 'rxjs';

type EditorTab = 'info' | 'od' | 'rx' | 'tx';

interface SaveFileHandle {
  readonly name: string;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<SaveFileHandle>;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DialogHostComponent, DeviceInfoComponent, InsertProfileComponent, ObjectDictionaryComponent, PdoViewComponent],
  template: `
    <div class="shell">
      @if (!converter.isElectron) {
      <header class="top">
        <div class="brand">
          <span class="mark">OD</span>
          <div>
            <strong>Object Dictionary Editor</strong>
            <small>XDD</small>
          </div>
        </div>
        <div class="actions">
          <button type="button" (click)="store.newDevice()">New</button>
          <button type="button" (click)="openFile()">Open</button>
          <button type="button" (click)="save()" [disabled]="!store.selected()">Save</button>
          <button type="button" (click)="saveAs()" [disabled]="!store.selected()">Save as</button>
          <span style="width: 16px; display: inline-block;"></span>
          <button type="button" class="quiet" (click)="loadExample()">Example</button>
          <button type="button" (click)="profileOpen.set(true)" [disabled]="!store.selected()">Insert Profile</button>
          <input #picker hidden type="file" accept=".xdd,application/xml" (change)="openFileFromInput($event)" />
        </div>
      </header>
      }

      <div class="workspace">
        <aside>
          <h2>Devices</h2>
          @for (device of store.devices(); track device.id) {
            <div class="device" [class.active]="device.id === store.selectedId()" [class.dirty]="device.dirty" (click)="store.select(device.id)">
              <div>
                <strong>{{ device.document.productName || 'Unnamed' }}</strong>
                <small>{{ device.fileName }}{{ device.dirty ? ' · modified' : '' }}</small>
              </div>
              <button type="button" (click)="close(device, $event)" aria-label="Close file">×</button>
            </div>
          } @empty {
            <p class="hint">No device open.</p>
          }
        </aside>

        <main>
          @if (store.selected(); as device) {
            <div class="main-head">
              <div class="tabs">
                <button type="button" [class.active]="tab() === 'info'" (click)="setTab('info')">Device Info</button>
                <button type="button" [class.active]="tab() === 'od'" (click)="setTab('od')">Object Dictionary</button>
                <button type="button" [class.active]="tab() === 'tx'" (click)="setTab('tx')">TX PDO Mapping</button>
                <button type="button" [class.active]="tab() === 'rx'" (click)="setTab('rx')">RX PDO Mapping</button>
              </div>
              <span class="schema">Opened as XDD {{ device.document.schemaVersion }}. Save writes XDD 1.1</span>
            </div>
            <div class="pane" [hidden]="tab() !== 'info'">
              <app-device-info [document]="device.document" (changed)="store.touch(device.id)" />
            </div>
            <div class="pane" [hidden]="tab() !== 'od'">
              <app-object-dictionary [document]="device.document" [revision]="device.revision" (changed)="store.touch(device.id)" />
            </div>
            <div class="pane" [hidden]="tab() !== 'rx'">
              <app-pdo-view direction="rx" [document]="device.document" [revision]="device.revision" (changed)="store.touch(device.id)" />
            </div>
            <div class="pane" [hidden]="tab() !== 'tx'">
              <app-pdo-view direction="tx" [document]="device.document" [revision]="device.revision" (changed)="store.touch(device.id)" />
            </div>
          } @else {
            <section class="empty">
              <h2>Object Dictionary Editor</h2>
              <p>Edit device information, the object dictionary, and PDO mapping.</p>
              <p>Only the <strong>XDD</strong> file format is natively read and written.</p>
              <p class="hint">Tip: Drag &amp; drop an XDD, XPD, EDS, DCF or XDC file onto the window to import it.</p>
              <div class="actions">
                <button type="button" (click)="store.newDevice()">New</button>
                <button type="button" (click)="openFile()">Open</button>
                <button type="button" (click)="loadExample()">Open example XDD</button>
              </div>
            </section>
          }
        </main>
      </div>
      @if (profileOpen()) {
        <app-insert-profile (closed)="profileOpen.set(false)" (inserted)="setTab('od')" />
      }
      <app-dialog-host />
      @if (dragActive()) {
        <div class="drop-overlay"><div class="drop-hint">Drop XDD / XPD / EDS / DCF / XDC to import</div></div>
      }
    </div>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly tabs = signal<Record<string, EditorTab>>({});
  readonly tab = computed<EditorTab>(() => {
    const id = this.store.selectedId();
    return (id && this.tabs()[id]) || 'info';
  });
  readonly profileOpen = signal(false);
  readonly dragActive = signal(false);

  private subscriptions = new Subscription();

  constructor(
    readonly store: ProjectStore,
    private readonly dialogs: DialogService,
    readonly converter: ConverterService
  ) {
    this.setupConverterEvents();
    
    // Notify main process when file open state changes
    effect(() => {
      const hasFile = !!this.store.selected();
      if ((window as any).electronAPI) {
        (window as any).electronAPI.setFileOpenState(hasFile);
      }
    });
  }

  ngOnInit(): void {
    (window as any).getCurrentXddContent = () => {
      const device = this.store.selected();
      if (device) {
        return this.store.serialize(device, 'device.xdd').xml;
      }
      return null;
    };
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    (window as any).getCurrentXddContent = null;
  }

  private setupConverterEvents(): void {
    this.subscriptions.add(
      this.converter.loadConvertedFile$.subscribe((event: LoadConvertedFileEvent) => {
        this.loadConvertedFile(event.path);
      })
    );

    // Handle menu actions from Electron main process
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.onMenuAction) {
      electronAPI.onMenuAction((action: string) => {
        switch (action) {
          case 'new':
            this.store.newDevice();
            break;
          case 'open':
            void this.openFile();
            break;
          case 'save':
            void this.save();
            break;
          case 'saveAs':
            void this.saveAs();
            break;
          case 'insertProfile':
            this.profileOpen.set(true);
            break;
        }
      });
    }
  }

  async saveAs(): Promise<void> {
    const device = this.store.selected();
    if (!device) return;
    
    if (this.converter.isElectron) {
      const filePath = await (window as any).electronAPI.saveFileDialog({
        title: 'Save as XDD file',
        format: 'xdd',
        defaultFilename: this.store.saveName(device)
      });
      if (filePath) {
        await this.saveToPath(device, filePath);
      }
    }
  }

  private async loadConvertedFile(filePath: string): Promise<void> {
    try {
      const content = await (window as any).electronAPI.readFile(filePath);
      const fileName = filePath.split('/').pop() || 'converted.xdd';
      // Imported from a non-XDD format: no file on disk, Save shows a dialog and Close always asks
      this.store.openImported(fileName, content);
    } catch (error) {
      console.error('Error loading converted file:', error);
      void this.dialogs.error('The converted file could not be loaded.');
    }
  }

  setTab(tab: EditorTab): void {
    const id = this.store.selectedId();
    if (id) {
      this.tabs.update((tabs) => ({ ...tabs, [id]: tab }));
    }
  }

  async openFile(): Promise<void> {
    // In Electron, use custom HTML file browser
    if (this.converter.isElectron) {
      const filePath = await (window as any).electronAPI.openFileDialog({
        title: 'Open XDD file',
        format: 'xdd'
      });
      if (filePath) {
        await this.loadFileFromPath(filePath);
      }
      return;
    }

    // Browser fallback: trigger hidden file input
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    picker?.click();
  }

  openFileFromInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith('.xdd')) {
      void this.dialogs.error('Only XDD files are read. Other formats are not imported or exported.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.store.openXml(file.name, String(reader.result ?? ''));
    };
    reader.onerror = () => {
      void this.dialogs.error('The file could not be read.');
    };
    reader.readAsText(file);
  }

  private async loadFileFromPath(filePath: string): Promise<void> {
    try {
      // In Electron, read file via IPC
      const content = await (window as any).electronAPI.readFile(filePath);
      const fileName = filePath.split('/').pop() || 'file.xdd';
      this.store.openXml(fileName, content, filePath);
    } catch (error) {
      console.error('Error loading file:', error);
      void this.dialogs.error('The file could not be loaded.');
    }
  }

  async save(): Promise<void> {
    const device = this.store.selected();
    if (!device) {
      return;
    }
    
    // If file was opened from disk or already saved, save directly without dialog
    if (this.converter.isElectron && device.filePath) {
      await this.saveToPath(device, device.filePath);
      return;
    }
    
    // Otherwise show save dialog (new or imported file)
    if (this.converter.isElectron) {
      const filePath = await (window as any).electronAPI.saveFileDialog({
        title: 'Save XDD file',
        format: 'xdd',
        defaultFilename: this.store.saveName(device)
      });
      if (filePath) {
        await this.saveToPath(device, filePath);
      }
      return;
    }
    
    // Browser fallback
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
    let handle: SaveFileHandle | null = null;
    if (picker) {
      try {
        handle = await picker.call(window, {
          suggestedName: this.store.saveName(device),
          types: [{ description: 'XDD file', accept: { 'application/xml': ['.xdd'] } }],
        });
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') {
          return;
        }
      }
    }
    if (handle) {
      const xml = this.store.serialize(device, handle.name).xml;
      try {
        const writable = await handle.createWritable();
        await writable.write(xml);
        await writable.close();
      } catch {
        void this.dialogs.error(`"${handle.name}" could not be written.`);
        return;
      }
      this.store.markSaved(device.id, handle.name);
      return;
    }
    this.download(device);
  }

  private download(device: OpenDevice): void {
    const result = this.store.serialize(device);
    const blob = new Blob([result.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    this.store.markSaved(device.id, result.fileName);
  }

  private async saveToPath(device: OpenDevice, filePath: string): Promise<void> {
    const fileName = filePath.split('/').pop() || 'device.xdd';
    const xml = this.store.serialize(device, fileName).xml;
    try {
      await (window as any).electronAPI.writeFile(filePath, xml);
      this.store.markSaved(device.id, fileName, filePath);
    } catch (error) {
      console.error('Error saving file:', error);
      void this.dialogs.error('The file could not be saved.');
    }
  }

  async close(device: OpenDevice, event: Event): Promise<void> {
    event.stopPropagation();
    const name = device.document.productName || device.fileName;
    if (device.dirty && !(await this.dialogs.choose(`"${name}" has unsaved changes. Close file?`, ['Close without saving']))) {
      return;
    }
    this.store.close(device.id);
    this.tabs.update(({ [device.id]: _, ...rest }) => rest);
  }

  @HostListener('window:dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.dragActive.set(true);
  }

  @HostListener('window:dragleave', ['$event'])
  onDragLeave(event: DragEvent): void {
    if (!event.relatedTarget) {
      this.dragActive.set(false);
    }
  }

  @HostListener('window:drop', ['$event'])
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    void this.onDropFiles(event);
  }

  private async onDropFiles(event: DragEvent): Promise<void> {
    const files = Array.from(event.dataTransfer?.files ?? []);
    for (const file of files) {
      await this.importDroppedFile(file);
    }
  }

  private async importDroppedFile(file: File): Promise<void> {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const electronAPI = (window as any).electronAPI;

    if (ext === 'xdd' || ext === 'xml') {
      const content = await file.text();
      let filePath: string | null = null;
      if (this.converter.isElectron && electronAPI?.getPathForFile) {
        try {
          filePath = await electronAPI.getPathForFile(file);
        } catch {
          filePath = null;
        }
      }
      // Dropped from disk: keep path so Save writes back directly
      this.store.openXml(file.name, content, filePath);
      return;
    }

    if (ext === 'xpd') {
      // XPD is handled internally like XDD (path kept), but starts dirty so Close always asks
      const content = await file.text();
      let filePath: string | null = null;
      if (this.converter.isElectron && electronAPI?.getPathForFile) {
        try {
          filePath = await electronAPI.getPathForFile(file);
        } catch {
          filePath = null;
        }
      }
      this.store.openImported(file.name, content, filePath);
      return;
    }

    if (ext === 'eds' || ext === 'dcf' || ext === 'xdc') {
      if (!this.converter.isElectron || !electronAPI?.importDroppedFile) {
        void this.dialogs.error('EDS/DCF/XDC import is only available in the desktop app.');
        return;
      }
      try {
        const filePath = await electronAPI.getPathForFile(file);
        if (!filePath) {
          throw new Error('The file path could not be determined.');
        }
        const result = await electronAPI.importDroppedFile({ filePath, format: ext });
        // Imported from a non-XDD format: no file on disk, Save shows a dialog and Close always asks
        this.store.openImported(file.name, result.content);
      } catch (error: any) {
        console.error('Import failed:', error);
        void this.dialogs.error(`"${file.name}" could not be imported: ${error?.message || String(error)}`);
      }
      return;
    }

    void this.dialogs.error(`"${file.name}" is not a supported file (XDD, XPD, EDS, DCF, XDC).`);
  }

  async loadExample(): Promise<void> {
    try {
      const response = await fetch('demo_io.xdd');
      if (!response.ok) {
        throw new Error('Example not found');
      }
      this.store.openXml('demo_io.xdd', await response.text());
    } catch {
      void this.dialogs.error('The example XDD could not be loaded.');
    }
  }
}
