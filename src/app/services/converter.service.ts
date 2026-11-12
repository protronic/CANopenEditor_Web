import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

export type ConversionFormat = 'eds' | 'dcf' | 'xdd' | 'xdc' | 'c' | 'json';

export interface ConvertFileOptions {
  inputPath: string;
  outputPath: string;
  format?: ConversionFormat;
}

export interface ConvertFileResult {
  success: boolean;
  output?: string;
  outputPath?: string;
  error?: string;
}

export interface LoadConvertedFileEvent {
  path: string;
}

export interface ExportFileEvent {
  path: string;
  format: ConversionFormat;
}

@Injectable({
  providedIn: 'root'
})
export class ConverterService implements OnDestroy {
  readonly loadConvertedFile$ = new Subject<LoadConvertedFileEvent>();
  readonly exportFile$ = new Subject<ExportFileEvent>();

  private get electronAPI(): any {
    return (window as any).electronAPI;
  }

  get isElectron(): boolean {
    return !!(window as any).electronAPI?.openFileDialog || /Electron/.test(navigator.userAgent);
  }

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.isElectron) return;
    this.electronAPI.onLoadConvertedFile?.((event: LoadConvertedFileEvent) => {
      this.loadConvertedFile$.next(event);
    });
    this.electronAPI.onExportFile?.((event: ExportFileEvent) => {
      this.exportFile$.next(event);
    });
  }

  async checkConverterAvailable() {
    if (!this.isElectron) {
      return { available: false, reason: 'Not running in Electron' };
    }
    try {
      return await this.electronAPI.checkConverterAvailable();
    } catch (error) {
      return { available: false, reason: 'Error checking converter' };
    }
  }

  async convertFile(options: ConvertFileOptions): Promise<ConvertFileResult> {
    if (!this.isElectron) {
      return { success: false, error: 'Converter is only available in the Electron desktop app' };
    }
    try {
      const result = await this.electronAPI.convertFile(options);
      return { success: true, output: result.output, outputPath: result.outputPath };
    } catch (error: any) {
      console.error('Conversion failed:', error);
      return { success: false, error: error.error || error.message || 'Unknown error during conversion' };
    }
  }

  getFileExtension(format: ConversionFormat): string {
    const extensions: Record<ConversionFormat, string> = {
      eds: 'eds',
      dcf: 'dcf',
      xdd: 'xdd',
      xdc: 'xdc',
      c: 'c',
      json: 'json'
    };
    return extensions[format] || 'bin';
  }

  ngOnDestroy(): void {
    this.loadConvertedFile$.complete();
    this.exportFile$.complete();
  }
}
