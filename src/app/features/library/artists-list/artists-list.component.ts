import { Component, inject, signal, computed, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Artist } from '../../../core/models/api.models';

@Component({
  selector: 'app-artists-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="page" #scrollContainer>
      <div class="page-header">
        <a routerLink="/dag" class="btn btn--ghost">← Back to DAG</a>
        <h2>Artists</h2>
        @if (auth.isContributor()) {
          <a routerLink="/library/artist/new" class="btn btn--primary btn--sm" style="margin-left:auto">+ Add Artist</a>
        }
</div>

      <!-- Filters -->
      <div class="filters">
        <input type="text" class="search-input" placeholder="Search artists…"
          [(ngModel)]="searchQuery" (ngModelChange)="onSearch()" />
        <div class="type-tabs">
          @for (tab of typeTabs; track tab.value) {
            <button class="type-tab" [class.type-tab--active]="typeFilter() === tab.value"
              (click)="setTypeFilter(tab.value)">
              {{ tab.label }}
            </button>
          }
        </div>
      </div>

      <!-- List -->
      @if (loading()) {
        <div class="empty-state">Loading…</div>
      } @else if (filtered().length === 0) {
        <div class="empty-state">No artists found.</div>
      } @else {
        <div class="artist-list">
          @for (artist of filtered(); track artist.id) {
            <div class="artist-row">
              <div class="artist-row__main">
                <div class="artist-row__name">{{ artist.name }}</div>
                <span class="badge" [class.badge--group]="artist.artist_type === 'group'">
                  {{ artist.artist_type === 'group' ? 'Group' : 'Person' }}
                </span>
                @if (artist.artist_type === 'person' && artist.instruments.length) {
                  <span class="artist-row__meta">{{ artist.instruments.join(', ') }}</span>
                }
                @if (artist.artist_type === 'group' && artist.members) {
                  <span class="artist-row__meta">
                    {{ artist.members.length }} {{ artist.members.length === 1 ? 'member' : 'members' }}
                    @if (artist.members.length) {
                      · {{ artist.members.slice(0, 3).map(m => m.name).join(', ') }}{{ artist.members.length > 3 ? '…' : '' }}
                    }
                  </span>
                }
                @if (artist.bio) {
                  <span class="artist-row__bio">{{ artist.bio }}</span>
                }
              </div>
              <div class="artist-row__actions">
                @if (auth.isContributor()) {
                  <a [routerLink]="['/library/artist', artist.id, 'edit']"
                     class="btn btn--ghost btn--sm">Edit</a>
                }
                @if (auth.isAdmin()) {
                  <button class="btn btn--danger btn--sm"
                    [disabled]="deleting() === artist.id"
                    (click)="deleteArtist(artist)">
                    {{ deleting() === artist.id ? '…' : 'Delete' }}
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { max-width: 820px; margin: 0 auto; padding: 24px; height: 100%; overflow-y: auto; }

    .page-header {
      display: flex; align-items: center; gap: 16px; margin-bottom: 24px;
      h2 { font-size: 18px; font-weight: 600; }
    }

    .filters { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
    .search-input { flex: 1; min-width: 200px; }

    .type-tabs { display: flex; gap: 4px; }
    .type-tab {
      padding: 6px 14px; font-size: 12px; border-radius: var(--radius-sm);
      border: 1px solid var(--color-border); color: var(--color-text-muted);
      &:hover { background: var(--color-surface-2); }
      &--active { background: rgba(124,106,247,.15); border-color: var(--color-accent); color: var(--color-accent); font-weight: 600; }
    }

    .empty-state { padding: 48px 0; text-align: center; color: var(--color-text-muted); font-size: 14px; }

    .artist-list { display: flex; flex-direction: column; gap: 4px; }

    .artist-row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 16px;
      background: var(--color-surface); border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      &:hover { border-color: var(--color-accent); }
    }
    .artist-row__main { display: flex; align-items: baseline; gap: 10px; flex: 1; flex-wrap: wrap; min-width: 0; }
    .artist-row__name { font-weight: 600; font-size: 14px; }
    .artist-row__meta { font-size: 12px; color: var(--color-text-muted); }
    .artist-row__bio { font-size: 12px; color: var(--color-text-muted); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
    .artist-row__actions { display: flex; gap: 6px; flex-shrink: 0; }

    .badge {
      font-size: 11px; padding: 2px 7px; border-radius: var(--radius-sm);
      background: var(--color-surface-2); border: 1px solid var(--color-border);
      color: var(--color-text-muted);
      &--group { background: rgba(124,106,247,.1); border-color: var(--color-accent); color: var(--color-accent); }
    }

    .btn--danger { border-color: var(--color-danger); color: var(--color-danger); &:hover { background: var(--color-danger); color: #fff; } }
    .btn--sm { padding: 5px 10px; font-size: 12px; }
    :host { display: block; height: 100%; }
  `],
})
export class ArtistsListComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly api   = inject(ApiService);
  readonly auth          = inject(AuthService);
  private readonly toast = inject(ToastService);

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLElement>;
  private static savedScrollTop = 0;

  readonly loading  = signal(true);
  readonly deleting = signal<string | null>(null);
  readonly typeFilter = signal<'all' | 'person' | 'group'>('all');

  private readonly all = signal<Artist[]>([]);
  searchQuery = '';

  readonly typeTabs = [
    { label: 'All',    value: 'all'    as const },
    { label: 'People', value: 'person' as const },
    { label: 'Groups', value: 'group'  as const },
  ];

  readonly filtered = computed(() => {
    const type = this.typeFilter();
    return this.all().filter((a) => type === 'all' || a.artist_type === type);
  });

  async ngOnInit(): Promise<void> {
    await this.load();
    const saved = ArtistsListComponent.savedScrollTop;
    if (saved > 0) {
      setTimeout(() => { this.scrollContainer.nativeElement.scrollTop = saved; }, 0);
    }
  }

  ngAfterViewInit(): void {
    this.scrollContainer.nativeElement.addEventListener('scroll', () => {
      ArtistsListComponent.savedScrollTop = this.scrollContainer.nativeElement.scrollTop;
    }, { passive: true });
  }

  ngOnDestroy(): void {}

  private async load(search?: string): Promise<void> {
    this.loading.set(true);
    try {
      const artists = await firstValueFrom(this.api.getArtists(search));
      this.all.set(artists);
    } finally {
      this.loading.set(false);
    }
  }

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  onSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(this.searchQuery || undefined), 250);
  }

  setTypeFilter(value: 'all' | 'person' | 'group'): void {
    this.typeFilter.set(value);
  }

  async deleteArtist(artist: Artist): Promise<void> {
    if (!confirm(`Delete "${artist.name}"? This cannot be undone.`)) return;
    this.deleting.set(artist.id);
    try {
      await firstValueFrom(this.api.deleteArtist(artist.id));
      this.all.update((list) => list.filter((a) => a.id !== artist.id));
      this.toast.success(`${artist.name} deleted`);
    } catch {
      this.toast.error('Failed to delete artist');
    } finally {
      this.deleting.set(null);
    }
  }
}
