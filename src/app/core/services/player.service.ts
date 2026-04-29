import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Track } from '../models/api.models';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly audio = new Audio();

  readonly queue = signal<Track[]>([]);
  readonly currentIndex = signal<number>(-1);
  readonly isPlaying = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly volume = signal(0.8);
  readonly isSeeking = signal(false);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly currentTrack = computed(() => {
    const idx = this.currentIndex();
    const q = this.queue();
    return idx >= 0 && idx < q.length ? q[idx] : null;
  });

  readonly hasPrev = computed(() => this.currentIndex() > 0);
  readonly hasNext = computed(() => this.currentIndex() < this.queue().length - 1);

  constructor() {
    this.audio.volume = this.volume();

    this.audio.addEventListener('timeupdate', () => {
      if (!this.isSeeking()) this.currentTime.set(this.audio.currentTime);
    });
    this.audio.addEventListener('durationchange', () => {
      this.duration.set(isFinite(this.audio.duration) ? this.audio.duration : 0);
    });
    this.audio.addEventListener('play', () => this.isPlaying.set(true));
    this.audio.addEventListener('pause', () => this.isPlaying.set(false));
    this.audio.addEventListener('ended', () => this.playNext());
    this.audio.addEventListener('waiting', () => this.isLoading.set(true));
    this.audio.addEventListener('canplay', () => this.isLoading.set(false));
    this.audio.addEventListener('error', () => {
      this.isLoading.set(false);
      const code = this.audio.error?.code;
      const msg = this.audio.error?.message;
      console.error('Audio error:', this.audio.error);
      this.error.set(`Playback error (${code}${msg ? ': ' + msg : ''}) — file may not be streamable in this browser`);
    });

    // Keep volume in sync
    effect(() => { this.audio.volume = this.volume(); });
  }

  play(tracks: Track[], startIndex = 0): void {
    this.queue.set(tracks);
    this.currentIndex.set(startIndex);
    this.loadAndPlay(tracks[startIndex]);
  }

  playTrack(track: Track): void {
    const q = this.queue();
    const existing = q.findIndex((t) => t.id === track.id);
    if (existing >= 0) {
      this.currentIndex.set(existing);
      this.loadAndPlay(track);
    } else {
      this.queue.update((q) => [...q, track]);
      this.currentIndex.set(this.queue().length - 1);
      this.loadAndPlay(track);
    }
  }

  togglePlay(): void {
    if (this.isPlaying()) {
      this.audio.pause();
    } else if (this.currentTrack()) {
      this.audio.play().catch(() => this.error.set('Playback blocked'));
    }
  }

  playNext(): void {
    if (this.hasNext()) {
      const nextIdx = this.currentIndex() + 1;
      this.currentIndex.set(nextIdx);
      this.loadAndPlay(this.queue()[nextIdx]);
    }
  }

  playPrev(): void {
    // If more than 3 seconds in, restart current track
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    if (this.hasPrev()) {
      const prevIdx = this.currentIndex() - 1;
      this.currentIndex.set(prevIdx);
      this.loadAndPlay(this.queue()[prevIdx]);
    }
  }

  seek(seconds: number): void {
    this.audio.currentTime = seconds;
    this.currentTime.set(seconds);
  }

  beginSeeking(): void { this.isSeeking.set(true); }
  endSeeking(seconds: number): void {
    this.isSeeking.set(false);
    this.seek(seconds);
  }

  setVolume(level: number): void {
    this.volume.set(Math.max(0, Math.min(1, level)));
  }

  enqueue(track: Track): void {
    this.queue.update((q) => [...q, track]);
  }

  clearQueue(): void {
    this.audio.pause();
    this.queue.set([]);
    this.currentIndex.set(-1);
    this.currentTime.set(0);
    this.duration.set(0);
    this.isPlaying.set(false);
  }

  private async loadAndPlay(track: Track): Promise<void> {
    this.error.set(null);
    this.isLoading.set(true);
    this.currentTime.set(0);
    this.duration.set(0);

    if (!track.file_id) {
      this.error.set('No audio file attached to this track');
      this.isLoading.set(false);
      return;
    }

    if (!this.auth.accessToken()) {
      this.error.set('Not authenticated');
      this.isLoading.set(false);
      return;
    }

    try {
      const { url } = await firstValueFrom(this.api.getStreamUrl(track.file_id));
      this.audio.src = url;
      this.audio.load();
      await this.audio.play();
      this.isPlaying.set(true);
      this.isLoading.set(false);
    } catch (e) {
      console.error('Playback setup error:', e);
      this.error.set('Failed to initialize playback');
      this.isLoading.set(false);
      this.isPlaying.set(false);
    }
  }
}
