import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { MusicFile } from '../../../core/models/api.models';
import { DurationPipe } from '../../../shared/pipes/duration.pipe';

interface UploadItem {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  result?: MusicFile;
}

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="form-page">
      <div class="form-page__header">
        <a routerLink="/dag" class="btn btn--ghost">← Back to DAG</a>
        <h2>Music Files</h2>
      </div>

      <!-- Drop zone -->
      <div
        class="drop-zone"
        [class.drop-zone--active]="isDragging()"
        (dragover)="$event.preventDefault(); isDragging.set(true)"
        (dragleave)="isDragging.set(false)"
        (drop)="onDrop($event)"
        (click)="fileInput.click()"
      >
        <input #fileInput type="file" multiple accept="audio/*" style="display:none" (change)="onFileSelect($event)" />
        <div class="drop-zone__icon">🎵</div>
        <p class="drop-zone__text">Drop audio files here or click to browse</p>
        <p class="drop-zone__sub">MP3, FLAC, AAC, OGG, WAV — up to 500 MB each</p>
      </div>

      <!-- Upload queue -->
      @if (uploads().length) {
        <div class="upload-list">
          <h3>Uploading</h3>
          @for (item of uploads(); track item.file.name) {
            <div class="upload-item" [class.upload-item--done]="item.status === 'done'" [class.upload-item--error]="item.status === 'error'">
              <div class="upload-item__name">{{ item.file.name }}</div>
              <div class="upload-item__bar">
                <div class="upload-item__fill" [style.width.%]="item.progress"></div>
              </div>
              <div class="upload-item__status">
                @if (item.status === 'done') { ✓ Uploaded }
                @else if (item.status === 'error') { ✕ {{ item.error }} }
                @else { {{ item.progress }}% }
              </div>
            </div>
          }
        </div>
      }

      <!-- Existing files -->
      <div class="file-list">
        <h3>Library Files <span class="dim">({{ files().length }})</span></h3>
        @for (file of files(); track file.id) {
          <div class="file-row">
            <span class="file-row__name">{{ file.original_filename }}</span>
            <span class="file-row__format badge">{{ file.format }}</span>
            <span class="file-row__size dim">{{ formatBytes(file.size_bytes) }}</span>
            @if (!file.is_browser_streamable) {
              <span class="badge" style="background:#E67E2222;color:#E67E22">Not streamable in browser</span>
            }
          </div>
        } @empty {
          <p class="dim" style="padding:16px 0">No files uploaded yet</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .form-page { max-width: 700px; margin: 0 auto; padding: 24px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; }
    .form-page__header { display: flex; align-items: center; gap: 16px; h2 { font-size: 18px; font-weight: 600; } }

    .drop-zone {
      border: 2px dashed var(--color-border);
      border-radius: var(--radius-lg);
      padding: 48px;
      text-align: center;
      cursor: pointer;
      transition: border-color var(--transition), background var(--transition);
      &:hover, &--active { border-color: var(--color-accent); background: rgba(124,106,247,.05); }
    }
    .drop-zone__icon { font-size: 40px; margin-bottom: 12px; }
    .drop-zone__text { font-weight: 500; margin-bottom: 4px; }
    .drop-zone__sub { color: var(--color-text-muted); font-size: 12px; }

    .upload-list { display: flex; flex-direction: column; gap: 8px; }
    .upload-item {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 12px 16px;
      &--done { border-color: var(--color-success); }
      &--error { border-color: var(--color-danger); }
    }
    .upload-item__name { font-size: 13px; margin-bottom: 6px; }
    .upload-item__bar { height: 4px; background: var(--color-border); border-radius: 2px; overflow: hidden; margin-bottom: 4px; }
    .upload-item__fill { height: 100%; background: var(--color-accent); transition: width 100ms; }
    .upload-item__status { font-size: 12px; color: var(--color-text-muted); }

    .file-list { display: flex; flex-direction: column; gap: 4px; h3 { margin-bottom: 12px; font-size: 14px; font-weight: 600; } }
    .file-row {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      font-size: 13px;
    }
    .file-row__name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-row__format { background: var(--color-surface-2); color: var(--color-text-muted); }
    .file-row__size { font-size: 12px; }
    .dim { color: var(--color-text-muted); }
  `],
})
export class FileUploadComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly files = signal<MusicFile[]>([]);
  readonly uploads = signal<UploadItem[]>([]);
  readonly isDragging = signal(false);

  async ngOnInit(): Promise<void> {
    this.files.set(await firstValueFrom(this.api.getFiles()));
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('audio/'));
    this.uploadFiles(files);
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.uploadFiles(files);
    input.value = '';
  }

  private uploadFiles(files: File[]): void {
    const items: UploadItem[] = files.map((f) => ({ file: f, progress: 0, status: 'pending' }));
    this.uploads.update((u) => [...u, ...items]);

    items.forEach((item) => {
      item.status = 'uploading';
      this.api.uploadFile(item.file, (pct) => {
        item.progress = pct;
        this.uploads.update((u) => [...u]); // trigger signal update
      }).subscribe({
        next: (result) => {
          item.status = 'done';
          item.progress = 100;
          item.result = result;
          this.files.update((f) => [result, ...f]);
          this.uploads.update((u) => [...u]);
        },
        error: () => {
          item.status = 'error';
          item.error = 'Upload failed';
          this.uploads.update((u) => [...u]);
          this.toast.error(`Failed to upload ${item.file.name}`);
        },
      });
    });
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
