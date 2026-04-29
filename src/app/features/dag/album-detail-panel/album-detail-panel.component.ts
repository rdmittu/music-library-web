import { Component, input, output, inject, OnChanges, signal, computed, OnDestroy, effect } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RouterLink } from '@angular/router';
import { Album, Track } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { PlayerService } from '../../../core/services/player.service';
import { AuthService } from '../../../core/services/auth.service';
import { UpperCasePipe } from '@angular/common';
import { DurationPipe } from '../../../shared/pipes/duration.pipe';

@Component({
  selector: 'app-album-detail-panel',
  standalone: true,
  imports: [DurationPipe, RouterLink, UpperCasePipe],
  template: `
    <div class="panel" [class.panel--open]="albumId()">
      <div class="panel__header">
        <button class="panel__close" (click)="close.emit()">✕</button>
        @if (album(); as a) {
          <div class="panel__cover-wrap">
            @if (blobUrl()) {
              <img [src]="blobUrl()!" [alt]="a.title" class="panel__cover" />
            } @else if (a.cover_art_file_id) {
              <div class="panel__cover panel__cover--placeholder">⌛</div>
            } @else {
              <div class="panel__cover panel__cover--placeholder">🎵</div>
            }
          </div>
          <div class="panel__meta">
            <h2 class="panel__title">{{ a.title }}</h2>
            <p class="panel__artists">{{ artistNames(a) }}</p>
            @if (dateLabel(a)) { <p class="panel__date">{{ dateLabel(a) }}</p> }
            @if (a.album_type !== 'studio') {
              <span class="badge badge--type">{{ a.album_type | uppercase }}</span>
            }
            @if (a.genres.length) {
              <div class="panel__genres">
                @for (g of a.genres; track g.id) {
                  <span class="badge" [style.background]="g.color_hex + '33'" [style.color]="g.color_hex">{{ g.name }}</span>
                }
              </div>
            }
          </div>
        }
      </div>

      @if (album()?.notes) {
        <p class="panel__notes">{{ album()!.notes }}</p>
      }

      <div class="panel__actions">
        <button class="btn btn--primary" (click)="playAll()" [disabled]="!hasTracks()">▶ Play All</button>
        @if (auth.isContributor()) {
          <a class="btn btn--ghost" [routerLink]="['/library/album', albumId(), 'edit']">Edit</a>
          <a class="btn btn--ghost" [routerLink]="['/library/edge/new']" [queryParams]="{ source: albumId() }">Add Edge</a>
        }
        @if (auth.isAdmin()) {
          <button class="btn btn--danger" [disabled]="deleting()" (click)="deleteAlbum()">
            {{ deleting() ? 'Deleting…' : 'Delete' }}
          </button>
        }
      </div>

      <div class="panel__tracks">
        @if (loading()) {
          <div class="panel__loading">Loading tracks…</div>
        } @else if (tracks().length === 0) {
          <div class="panel__empty">No tracks added yet</div>
        } @else {
          @for (track of tracks(); track track.id; let i = $index) {
            <div class="track" [class.track--active]="isActive(track)" 
              [class.track--disabled]="!track.file_id"
              (click)="playTrack(i)">
              <div class="track__icon-wrap">
                @if (isActive(track) && player.isPlaying()) {
                  <span class="track__playing-anim"></span>
                } @else {
                  <span class="track__num">{{ track.track_number ?? i + 1 }}</span>
                  @if (track.file_id) { <span class="track__play-icon">▶</span> }
                }
              </div>
              <span class="track__title">{{ track.title }}</span>
              @if (!track.file_id) { <span class="track__no-file" title="No audio file">○</span> }
              <span class="track__duration">{{ track.duration_seconds | duration }}</span>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .panel {
      position: absolute;
      top: 48px; right: 0;
      width: var(--sidebar-width);
      height: calc(100% - 48px);
      background: var(--color-surface);
      border-left: 1px solid var(--color-border);
      transform: translateX(100%);
      transition: transform 250ms ease;
      display: flex;
      flex-direction: column;
      z-index: 10;
      overflow-y: auto;
      &--open { transform: translateX(0); }
    }

    .panel__header {
      padding: 20px 20px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      border-bottom: 1px solid var(--color-border);
      position: relative;
    }

    .panel__close {
      position: absolute; top: 14px; right: 14px;
      width: 28px; height: 28px;
      border-radius: 50%;
      background: var(--color-surface-2);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px;
      color: var(--color-text-muted);
      &:hover { color: var(--color-text); }
    }

    .panel__cover-wrap { width: 100%; }
    .panel__cover {
      width: 100%; aspect-ratio: 1;
      border-radius: var(--radius-md);
      object-fit: cover;
      background: var(--color-surface-2);
      display: block;
      &--placeholder {
        display: flex; align-items: center; justify-content: center;
        font-size: 48px;
        height: 200px;
      }
    }

    .panel__meta { padding-right: 32px; }
    .panel__title { font-size: 16px; font-weight: 700; line-height: 1.3; }
    .panel__artists { color: var(--color-text-muted); font-size: 13px; margin-top: 4px; }
    .panel__date { color: var(--color-text-muted); font-size: 12px; margin-top: 2px; }
    .panel__genres { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
    .badge--type { background: rgba(255,200,0,.15); color: #ffc800; border: 1px solid rgba(255,200,0,.3); font-size: 10px; font-weight: 700; letter-spacing: .06em; padding: 2px 6px; border-radius: 4px; }

    .panel__notes {
      padding: 12px 20px;
      font-size: 12px;
      color: var(--color-text-muted);
      border-bottom: 1px solid var(--color-border);
      white-space: pre-wrap;
    }

    .btn--danger { background: var(--color-danger, #e53e3e); color: #fff; border-color: transparent; &:hover { opacity: .88; } }
    .panel__actions {
      display: flex;
      gap: 8px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--color-border);
      flex-wrap: wrap;
    }

    .panel__tracks { padding: 8px 0; }
    .panel__loading, .panel__empty { padding: 24px 20px; color: var(--color-text-muted); font-size: 13px; }

    .track {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 20px;
      cursor: pointer;
      transition: background var(--transition);
      &:hover { background: var(--color-surface-2); }
      &--active { background: rgba(124,106,247,.12); color: var(--color-accent); .track__num { color: var(--color-accent); } }
      &--disabled { cursor: default; opacity: 0.6; &:hover { background: transparent; } }
    }
    
    .track__icon-wrap { position: relative; width: 24px; display: flex; align-items: center; justify-content: flex-end; }
    .track__num { font-size: 11px; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
    .track__play-icon { 
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      font-size: 10px; color: var(--color-accent); opacity: 0;
    }
    .track:hover:not(.track--disabled) { .track__num { opacity: 0; } .track__play-icon { opacity: 1; } }

    .track__playing-anim {
      width: 12px; height: 12px;
      background: var(--color-accent);
      mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="20" height="100"><animate attributeName="height" values="30;100;30" dur="0.6s" repeatCount="indefinite" /></rect><rect x="40" y="0" width="20" height="100"><animate attributeName="height" values="100;30;100" dur="0.6s" repeatCount="indefinite" /></rect><rect x="80" y="0" width="20" height="100"><animate attributeName="height" values="50;100;50" dur="0.6s" repeatCount="indefinite" /></rect></svg>');
      -webkit-mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="20" height="100"><animate attributeName="height" values="30;100;30" dur="0.6s" repeatCount="indefinite" /></rect><rect x="40" y="0" width="20" height="100"><animate attributeName="height" values="100;30;100" dur="0.6s" repeatCount="indefinite" /></rect><rect x="80" y="0" width="20" height="100"><animate attributeName="height" values="50;100;50" dur="0.6s" repeatCount="indefinite" /></rect></svg>');
      mask-repeat: no-repeat;
      mask-position: bottom;
    }

    .track__title { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .track__no-file { color: var(--color-text-muted); font-size: 10px; flex-shrink: 0; }
    .track__duration { font-size: 12px; color: var(--color-text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
  `],
})
export class AlbumDetailPanelComponent implements OnChanges, OnDestroy {
  private readonly api = inject(ApiService);
  readonly player = inject(PlayerService);
  readonly auth = inject(AuthService);

  readonly albumId = input<string | null>(null);
  readonly close = output<void>();
  readonly deleted = output<string>();

  readonly album = signal<Album | null>(null);
  readonly tracks = signal<Track[]>([]);
  readonly loading = signal(false);
  readonly deleting = signal(false);
  readonly blobUrl = signal<string | null>(null);

  constructor() {
    // Watch album changes to update cover art blob
    effect(async () => {
      const a = this.album();
      const token = this.auth.accessToken();
      if (!a?.cover_art_file_id || !token) {
        this.clearBlobUrl();
        return;
      }

      try {
        const blob = await firstValueFrom(this.api.getThumbBlob(a.cover_art_file_id, 400));
        const url = URL.createObjectURL(blob);
        this.clearBlobUrl();
        this.blobUrl.set(url);
      } catch (e) {
        console.error('Failed to load detail panel thumb', e);
        this.clearBlobUrl();
      }
    });
  }

  hasTracks = () => this.tracks().some((t) => t.file_id);

  async ngOnChanges(): Promise<void> {
    const id = this.albumId();
    if (!id) { this.album.set(null); this.tracks.set([]); return; }
    this.loading.set(true);
    try {
      const album = await firstValueFrom(this.api.getAlbum(id));
      this.album.set(album);
      this.tracks.set(album.tracks ?? []);
    } finally {
      this.loading.set(false);
    }
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

  artistNames(a: Album): string {
    return a.artists.map((ar) => ar.name).join(', ') || 'Unknown';
  }

  dateLabel(a: Album): string | null {
    if (a.recorded_start) {
      const y1 = new Date(a.recorded_start).getFullYear();
      const y2 = a.recorded_end ? new Date(a.recorded_end).getFullYear() : null;
      return y2 && y2 !== y1 ? `Recorded ${y1}–${y2}` : `Recorded ${y1}`;
    }
    if (a.release_date) return new Date(a.release_date).getFullYear().toString();
    return null;
  }

  playAll(): void {
    const playable = this.tracks().filter((t) => t.file_id);
    if (playable.length) this.player.play(playable, 0);
  }

  playTrack(index: number): void {
    const allTracks = this.tracks().filter(t => t.file_id);
    const track = this.tracks()[index];
    if (!track.file_id) return;
    
    // Find index in the filtered playable list
    const playableIndex = allTracks.findIndex(t => t.id === track.id);
    this.player.play(allTracks, playableIndex);
  }

  isActive(track: Track): boolean {
    return this.player.currentTrack()?.id === track.id;
  }

  async deleteAlbum(): Promise<void> {
    const album = this.album();
    if (!album) return;
    if (!confirm(`Delete "${album.title}"? This cannot be undone.`)) return;
    this.deleting.set(true);
    try {
      await firstValueFrom(this.api.deleteAlbum(album.id));
      this.deleted.emit(album.id);
      this.close.emit();
    } finally {
      this.deleting.set(false);
    }
  }
}
