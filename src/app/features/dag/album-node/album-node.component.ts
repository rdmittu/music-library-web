import { Component, input, output, computed, inject, signal, effect, OnDestroy } from '@angular/core';
import { DagNode } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-album-node',
  standalone: true,
  template: `
    <div class="node" (click)="nodeClick.emit(node().albumId)" [title]="tooltip()">
      @if (blobUrl()) {
        <img class="node__cover" [src]="blobUrl()!" [alt]="node().album.title" />
      } @else if (node().album.cover_art_file_id) {
        <div class="node__cover node__cover--placeholder">⌛</div>
      } @else {
        <div class="node__cover node__cover--placeholder">🎵</div>
      }
      @if (node().album.genres.length) {
        <div class="node__genre-dot" [style.background]="node().album.genres[0].color_hex"></div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }

    .node {
      width: 100%;
      height: 100%;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      cursor: pointer;
      position: relative;
      overflow: hidden;
      transition: border-color 150ms, box-shadow 150ms;
      box-sizing: border-box;
      &:hover {
        border-color: var(--color-accent);
        box-shadow: 0 0 0 2px rgba(124,106,247,.25);
      }
    }

    .node__cover {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background: var(--color-surface-2);
      &--placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        background: var(--color-surface);
      }
    }

    .node__genre-dot {
      position: absolute;
      bottom: 4px;
      right: 4px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(0,0,0,.4);
    }
  `],
})
export class AlbumNodeComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly node = input.required<DagNode>();
  readonly nodeClick = output<string>();

  readonly blobUrl = signal<string | null>(null);

  constructor() {
    effect(async () => {
      const a = this.node().album;
      const token = this.auth.accessToken();
      if (!a.cover_art_file_id || !token) {
        this.clearBlobUrl();
        return;
      }

      try {
        const blob = await firstValueFrom(this.api.getThumbBlob(a.cover_art_file_id, 80));
        const url = URL.createObjectURL(blob);
        this.clearBlobUrl();
        this.blobUrl.set(url);
      } catch (e) {
        console.error('Failed to load thumb', e);
        this.clearBlobUrl();
      }
    });
  }

  ngOnDestroy(): void {
    this.clearBlobUrl();
  }

  private clearBlobUrl(): void {
    const current = this.blobUrl();
    if (current) {
      URL.revokeObjectURL(current);
      this.blobUrl.set(null);
    }
  }

  readonly tooltip = computed(() => {
    const a = this.node().album;
    const artists = a.artists.map((x) => x.name).join(', ') || 'Unknown';
    const year = (() => {
      const d = a.recorded_start ?? a.recorded_end ?? a.release_date;
      return d ? new Date(d).getFullYear() : null;
    })();
    return year ? `${a.title} · ${artists} (${year})` : `${a.title} · ${artists}`;
  });
}
