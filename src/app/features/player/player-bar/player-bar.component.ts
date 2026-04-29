import { Component, inject, computed, signal, effect, OnDestroy } from '@angular/core';
import { PlayerService } from '../../../core/services/player.service';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { DurationPipe } from '../../../shared/pipes/duration.pipe';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-player-bar',
  standalone: true,
  imports: [DurationPipe],
  template: `
    <div class="player-bar" [class.player-bar--open]="player.currentTrack()">
      @if (player.currentTrack(); as track) {
        <!-- Track Info -->
        <div class="player-bar__info">
          @if (blobUrl()) {
            <img [src]="blobUrl()!" class="player-bar__thumb" alt="Cover art" />
          } @else if (track.cover_art_file_id) {
            <div class="player-bar__thumb player-bar__thumb--placeholder">⌛</div>
          } @else {
            <div class="player-bar__thumb player-bar__thumb--placeholder">🎵</div>
          }
          <div class="player-bar__metadata">
            <span class="player-bar__title">{{ track.title }}</span>
            <span class="player-bar__artist">{{ track.artist_names || 'Unknown Artist' }}</span>
          </div>
        </div>

        <!-- Controls -->
        <div class="player-bar__controls">
          <button class="ctrl-btn" (click)="player.playPrev()" [disabled]="!player.hasPrev()" title="Previous">⏮</button>
          <button class="ctrl-btn ctrl-btn--play" (click)="player.togglePlay()" title="{{ player.isPlaying() ? 'Pause' : 'Play' }}">
            @if (player.isLoading()) { <span class="loader">⟳</span> }
            @else if (player.isPlaying()) { ⏸ }
            @else { ▶ }
          </button>
          <button class="ctrl-btn" (click)="player.playNext()" [disabled]="!player.hasNext()" title="Next">⏭</button>
        </div>

        <!-- Progress -->
        <div class="player-bar__progress">
          <span class="player-bar__time">{{ player.currentTime() | duration }}</span>
          <input
            type="range"
            class="seek-bar"
            [min]="0"
            [max]="player.duration() || 0"
            [value]="player.currentTime()"
            (mousedown)="player.beginSeeking()"
            (change)="player.endSeeking(+$any($event.target).value)"
            (input)="onSeekInput(+$any($event.target).value)"
          />
          <span class="player-bar__time">{{ player.duration() | duration }}</span>
        </div>

        <!-- Volume -->
        <div class="player-bar__volume">
          <span class="volume-icon">{{ player.volume() === 0 ? '🔇' : player.volume() < 0.5 ? '🔉' : '🔊' }}</span>
          <input
            type="range"
            class="volume-bar"
            min="0" max="1" step="0.01"
            [value]="player.volume()"
            (input)="player.setVolume(+$any($event.target).value)"
          />
        </div>

        <!-- Error -->
        @if (player.error()) {
          <div class="player-bar__error">{{ player.error() }}</div>
        }
      }
    </div>
  `,
  styles: [`
    .player-bar {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      height: var(--player-height);
      background: var(--color-surface);
      border-top: 1px solid var(--color-border);
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 0 24px;
      z-index: 100;
      transform: translateY(100%);
      transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 -4px 12px rgba(0,0,0,0.2);
      &--open { transform: translateY(0); }
    }

    .player-bar__info {
      flex: 0 0 280px;
      display: flex;
      align-items: center;
      gap: 12px;
      overflow: hidden;
    }
    .player-bar__thumb {
      width: 48px; height: 48px;
      border-radius: var(--radius-sm);
      object-fit: cover;
      flex-shrink: 0;
      background: var(--color-surface-2);
      &--placeholder { display: flex; align-items: center; justify-content: center; font-size: 20px; }
    }
    .player-bar__metadata { display: flex; flex-direction: column; overflow: hidden; }
    .player-bar__title {
      font-size: 13px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .player-bar__artist {
      font-size: 11px; color: var(--color-text-muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      margin-top: 2px;
    }

    .player-bar__controls { display: flex; align-items: center; gap: 12px; }
    .ctrl-btn {
      width: 32px; height: 32px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; color: var(--color-text-muted);
      transition: color var(--transition);
      &:hover:not(:disabled) { color: var(--color-text); }
      &:disabled { opacity: 0.3; cursor: not-allowed; }
      &--play {
        width: 40px; height: 40px;
        background: var(--color-accent); color: #fff; font-size: 16px;
        &:hover { background: var(--color-accent-hover); }
      }
    }
    .loader { display: inline-block; animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    .player-bar__progress { flex: 1; display: flex; align-items: center; gap: 12px; }
    .player-bar__time { font-size: 11px; color: var(--color-text-muted); font-variant-numeric: tabular-nums; width: 36px; text-align: center; }

    .seek-bar, .volume-bar {
      -webkit-appearance: none; appearance: none;
      background: var(--color-surface-2); border: none; border-radius: 2px;
      height: 4px; outline: none; cursor: pointer; padding: 0;
      &::-webkit-slider-thumb {
        -webkit-appearance: none; width: 12px; height: 12px;
        border-radius: 50%; background: var(--color-accent); cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      }
    }
    .seek-bar { flex: 1; }
    .player-bar__volume { display: flex; align-items: center; gap: 10px; }
    .volume-icon { font-size: 14px; color: var(--color-text-muted); }
    .volume-bar { width: 100px; }

    .player-bar__error {
      position: absolute; top: -32px; left: 50%; transform: translateX(-50%);
      background: var(--color-danger); color: #fff; font-size: 12px; font-weight: 500;
      padding: 6px 16px; border-radius: var(--radius-md) var(--radius-md) 0 0;
      box-shadow: 0 -2px 8px rgba(0,0,0,0.2);
    }
  `],
})
export class PlayerBarComponent implements OnDestroy {
  readonly player = inject(PlayerService);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly blobUrl = signal<string | null>(null);

  constructor() {
    effect(async () => {
      const track = this.player.currentTrack();
      const token = this.auth.accessToken();
      
      if (!track?.cover_art_file_id || !token) {
        this.clearBlobUrl();
        return;
      }

      try {
        const blob = await firstValueFrom(this.api.getThumbBlob(track.cover_art_file_id, 100));
        const url = URL.createObjectURL(blob);
        this.clearBlobUrl();
        this.blobUrl.set(url);
      } catch (e) {
        console.error('Failed to load player thumb', e);
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

  onSeekInput(value: number): void {
    if (this.player.isSeeking()) {
      this.player.currentTime.set(value);
    }
  }
}
