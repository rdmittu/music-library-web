import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { Artist, Genre, AlbumType, CreditRole, CREDIT_ROLE_LABELS, COMMON_INSTRUMENTS, Track } from '../../../core/models/api.models';

interface PendingCredit {
  artist: Artist;
  role: CreditRole;
  instruments: string[];
  notes: string;
}

@Component({
  selector: 'app-album-form',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, RouterLink],
  template: `
    <div class="form-page">
      <div class="form-page__header">
        <a routerLink="/dag" class="btn btn--ghost">← Back to DAG</a>
        <h2>{{ isEdit() ? 'Edit Album' : 'Add Album' }}</h2>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="form-card">
        <div class="form-grid">

          <div class="form-group form-group--full">
            <label>Title *</label>
            <input type="text" formControlName="title" placeholder="Album title" />
          </div>

          <div class="form-group">
            <label>Type</label>
            <select formControlName="album_type">
              <option value="studio">Studio</option>
              <option value="live">Live</option>
              <option value="compilation">Compilation</option>
              <option value="ep">EP</option>
            </select>
          </div>

          <div class="form-group">
            <label>Release Date</label>
            <input type="date" formControlName="release_date" />
          </div>

          <div class="form-group">
            <label>Recorded Start</label>
            <input type="date" formControlName="recorded_start" />
          </div>

          <div class="form-group">
            <label>Recorded End</label>
            <input type="date" formControlName="recorded_end" />
          </div>

          <div class="form-group">
            <label>Cover Art</label>
            <div class="cover-upload"
                 (click)="coverInput.click()"
                 (dragover)="$event.preventDefault()"
                 (drop)="onCoverDrop($event)">
              <input #coverInput type="file" accept="image/jpeg,image/png,image/webp"
                     style="display:none" (change)="onCoverSelect($event)" />
              @if (coverArtPreviewUrl()) {
                <img [src]="coverArtPreviewUrl()!" class="cover-upload__preview" alt="Cover preview" />
                <button type="button" class="cover-upload__remove" (click)="$event.stopPropagation(); removeCover()">✕</button>
              } @else if (coverArtUploading()) {
                <span class="cover-upload__hint">Uploading…</span>
              } @else {
                <span class="cover-upload__hint">Click or drop image</span>
              }
            </div>
            @if (coverArtError()) { <p class="form-error" style="margin-top:4px">{{ coverArtError() }}</p> }
          </div>

          <div class="form-group form-group--full">
            <label>Notes</label>
            <textarea formControlName="notes" rows="3" placeholder="Any notes about this album…"></textarea>
          </div>

          <!-- ── Primary / Lead Artists ─────────────────────────────────── -->
          <div class="form-group form-group--full">
            <label>Primary Artists <span class="hint">Credited on the cover</span></label>
            <div class="tag-list">
              @for (artist of selectedArtists(); track artist.id) {
                <div class="tag">
                  <span>{{ artist.name }}</span>
                  <span class="dim">#{{ artistOrders.get(artist.id) ?? 0 }}</span>
                  <button type="button" class="tag__remove" (click)="removeArtist(artist.id)">✕</button>
                </div>
              }
            </div>
            <div class="search-row">
              <div class="artist-search-wrap"
                   [class.artist-search-wrap--matched]="artistMatchStatus() === 'matched'"
                   [class.artist-search-wrap--new]="artistMatchStatus() === 'new'">
                <input type="text" placeholder="Search artists or groups…"
                  [value]="artistSearch()"
                  (input)="onArtistSearch($any($event.target).value)" />
                @if (artistMatchStatus() !== 'none' && artistSearch().trim()) {
                  <span class="artist-status-badge"
                        [class.artist-status-badge--matched]="artistMatchStatus() === 'matched'"
                        [class.artist-status-badge--new]="artistMatchStatus() === 'new'">
                    {{ artistMatchStatus() === 'matched' ? '✓ exists' : '+ new' }}
                  </span>
                }
              </div>
              @if (artistResults().length) {
                <div class="dropdown">
                  @for (a of artistResults(); track a.id) {
                    <button type="button" class="dropdown__item" (click)="addArtist(a)">
                      {{ a.name }}
                      <span class="dim">{{ a.artist_type === 'group' ? '(group)' : '' }}</span>
                    </button>
                  }
                </div>
              }
            </div>
          </div>

          <!-- ── Genres ──────────────────────────────────────────────────── -->
          <div class="form-group form-group--full">
            <label>Genres</label>
            <div class="tag-list">
              @for (genre of selectedGenres(); track genre.id) {
                <div class="tag" [style.border-color]="genre.color_hex">
                  <span>{{ genre.name }}</span>
                  <label class="tag__primary">
                    <input type="radio" name="primary_genre" [value]="genre.id"
                      [checked]="genre.is_primary" (change)="setPrimaryGenre(genre.id)" />
                    Primary
                  </label>
                  <button type="button" class="tag__remove" (click)="removeGenre(genre.id)">✕</button>
                </div>
              }
            </div>
            <select (change)="addGenre($any($event.target).value); $any($event.target).value = ''">
              <option value="">Add genre…</option>
              @for (g of availableGenres(); track g.id) {
                <option [value]="g.id">
                  {{ g.parent_name ? g.parent_name + ' › ' : '' }}{{ g.name }}
                </option>
              }
            </select>
          </div>

          <!-- ── Credits ─────────────────────────────────────────────────── -->
          <div class="form-group form-group--full">
            <label>Credits <span class="hint">Featured artists, session musicians, composers, producers, etc.</span></label>

            <!-- Existing credits -->
            @if (credits().length) {
              <div class="credit-list">
                @for (c of credits(); track c.artist.id + c.role) {
                  <div class="credit-row">
                    <span class="credit-row__name">{{ c.artist.name }}</span>
                    <span class="credit-row__role badge">{{ roleLabel(c.role) }}</span>
                    @if (c.instruments.length) {
                      <span class="credit-row__instruments dim">{{ c.instruments.join(', ') }}</span>
                    }
                    @if (c.notes) { <span class="dim">{{ c.notes }}</span> }
                    <button type="button" class="tag__remove" (click)="removeCredit(c)">✕</button>
                  </div>
                }
              </div>
            }

            <!-- Add credit -->
            <div class="add-credit">
              <div class="add-credit__row">
                <div class="search-row" style="flex:1">
                  <input type="text" placeholder="Search artist…"
                    [value]="creditSearch()"
                    (input)="onCreditSearch($any($event.target).value)" />
                  @if (creditResults().length) {
                    <div class="dropdown">
                      @for (a of creditResults(); track a.id) {
                        <button type="button" class="dropdown__item" (click)="selectCreditArtist(a)">{{ a.name }}</button>
                      }
                    </div>
                  }
                  @if (pendingCreditArtist()) {
                    <div class="selected-album">{{ pendingCreditArtist()!.name }}</div>
                  }
                </div>
                <select [(ngModel)]="pendingCreditRole" [ngModelOptions]="{standalone:true}" class="credit-role-select">
                  @for (entry of creditRoleEntries; track entry.value) {
                    <option [value]="entry.value">{{ entry.label }}</option>
                  }
                </select>
              </div>
              <div class="add-credit__instruments">
                <div class="tag-list">
                  @for (inst of pendingInstruments(); track inst) {
                    <div class="tag">{{ inst }} <button type="button" class="tag__remove" (click)="removePendingInstrument(inst)">✕</button></div>
                  }
                </div>
                @if (pendingCreditRole === 'session' || pendingCreditRole === 'featured') {
                  <select (change)="addPendingInstrument($any($event.target).value); $any($event.target).value = ''">
                    <option value="">Add instrument…</option>
                    @for (i of COMMON_INSTRUMENTS; track i) {
                      <option [value]="i">{{ i }}</option>
                    }
                  </select>
                }
              </div>
              <div class="add-credit__footer">
                <input type="text" [(ngModel)]="pendingCreditNotes" [ngModelOptions]="{standalone:true}"
                  placeholder="Notes (optional)" style="flex:1" />
                <button type="button" class="btn btn--ghost btn--sm" [disabled]="!pendingCreditArtist()" (click)="addCredit()">
                  Add Credit
                </button>
              </div>
            </div>
          </div>

        </div>

        @if (error()) { <p class="form-error">{{ error() }}</p> }
        <div class="form-actions">
          <a routerLink="/dag" class="btn btn--ghost">Cancel</a>
          <button type="submit" class="btn btn--primary" [disabled]="form.invalid || loading()">
            {{ loading() ? 'Saving…' : (isEdit() ? 'Save Changes' : 'Add Album') }}
          </button>
        </div>
      </form>

      <!-- ── Tracks ──────────────────────────────────────────────────────── -->
      @if (isEdit()) {
        <div class="tracks-card">
          <div class="tracks-card__header">
            <h3>Tracks</h3>
            <button type="button" class="btn btn--ghost btn--sm" (click)="addTrack()">+ Add Track</button>
          </div>
          <div class="track-list">
            @for (track of tracks(); track track.id) {
              @if (editingTrackId() === track.id) {
                <div class="track-edit">
                  <input type="number" [(ngModel)]="editDiscNumber" [ngModelOptions]="{standalone:true}"
                    placeholder="Disc" class="track-edit__disc" min="1" />
                  <input type="number" [(ngModel)]="editTrackNumber" [ngModelOptions]="{standalone:true}"
                    placeholder="#" class="track-edit__num" min="1" />
                  <input type="text" [(ngModel)]="editTrackTitle" [ngModelOptions]="{standalone:true}"
                    placeholder="Title" class="track-edit__title" />
                  <button type="button" class="btn btn--primary btn--sm" (click)="saveTrack(track)">Save</button>
                  <button type="button" class="btn btn--ghost btn--sm" (click)="cancelTrackEdit()">Cancel</button>
                </div>
              } @else {
                <div class="track-row">
                  <span class="track-row__pos dim">{{ track.disc_number }}.{{ track.track_number ?? '?' }}</span>
                  <span class="track-row__title">{{ track.title }}</span>
                  @if (track.duration_seconds) {
                    <span class="track-row__dur dim">{{ formatDuration(track.duration_seconds) }}</span>
                  }
                  <div class="track-row__actions">
                    <button type="button" class="btn btn--ghost btn--sm" (click)="startTrackEdit(track)">Edit</button>
                    <a [routerLink]="['/library/track', track.id, 'edit']" class="btn btn--ghost btn--sm" title="Track details">⇥</a>
                    <button type="button" class="btn btn--ghost btn--sm btn--danger-hover" (click)="deleteTrack(track)">✕</button>
                  </div>
                </div>
              }
            } @empty {
              <p class="dim" style="padding: 12px 0; text-align:center; font-size:13px">No tracks yet — click "+ Add Track" to add one.</p>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .form-page { max-width: 760px; margin: 0 auto; padding: 24px; height: 100%; overflow-y: auto; }
    .form-page__header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; h2 { font-size: 18px; font-weight: 600; } }
    .form-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .form-group--full { grid-column: 1 / -1; }
    textarea { resize: vertical; min-height: 80px; }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; }
    .hint { font-size: 11px; font-weight: 400; color: var(--color-text-muted); margin-left: 6px; text-transform: none; letter-spacing: 0; }
    .dim { color: var(--color-text-muted); font-size: 12px; }

    .tag-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
    .tag { display: flex; align-items: center; gap: 6px; background: var(--color-surface-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 4px 8px; font-size: 12px; }
    .tag__primary { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--color-text-muted); }
    .tag__remove { color: var(--color-text-muted); font-size: 10px; &:hover { color: var(--color-danger); } }

    .cover-upload {
      position: relative; width: 160px; height: 160px;
      border: 2px dashed var(--color-border); border-radius: var(--radius-md);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; overflow: hidden;
      &:hover { border-color: var(--color-accent); }
    }
    .cover-upload__preview { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover-upload__hint { font-size: 12px; color: var(--color-text-muted); text-align: center; padding: 8px; }
    .cover-upload__remove {
      position: absolute; top: 4px; right: 4px;
      width: 22px; height: 22px; border-radius: 50%;
      background: rgba(0,0,0,.6); color: #fff; font-size: 10px;
      display: flex; align-items: center; justify-content: center;
      &:hover { background: var(--color-danger); }
    }

    .search-row { position: relative; }
    .dropdown { position: absolute; top: 100%; left: 0; right: 0; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); z-index: 50; max-height: 200px; overflow-y: auto; }
    .dropdown__item { display: block; width: 100%; padding: 8px 12px; text-align: left; font-size: 13px; &:hover { background: var(--color-surface-2); } }
    .artist-search-wrap { position: relative; display: flex; align-items: center;
      input { width: 100%; padding-right: 76px; }
      &.artist-search-wrap--matched input { border-color: #4d9ef5; background: rgba(77,158,245,.06); }
      &.artist-search-wrap--new input { border-color: #4caf87; background: rgba(76,175,135,.06); }
    }
    .artist-status-badge { position: absolute; right: 8px; font-size: 11px; font-weight: 600; border-radius: var(--radius-sm); padding: 2px 6px; pointer-events: none; white-space: nowrap;
      &.artist-status-badge--matched { color: #4d9ef5; background: rgba(77,158,245,.15); }
      &.artist-status-badge--new { color: #4caf87; background: rgba(76,175,135,.15); }
    }
    .selected-album { margin-top: 6px; padding: 5px 10px; background: rgba(124,106,247,.1); border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; color: var(--color-accent); }

    .credit-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .credit-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--color-surface-2); border-radius: var(--radius-sm); font-size: 12px; }
    .credit-row__name { font-weight: 600; font-size: 13px; }
    .credit-row__role { background: var(--color-surface); }
    .credit-row__instruments { flex: 1; }

    .add-credit { border: 1px dashed var(--color-border); border-radius: var(--radius-md); padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .add-credit__row { display: flex; gap: 8px; align-items: flex-start; }
    .add-credit__instruments { display: flex; flex-direction: column; gap: 6px; }
    .add-credit__footer { display: flex; gap: 8px; align-items: center; }
    .credit-role-select { width: auto; flex-shrink: 0; }
    .btn--sm { padding: 5px 10px; font-size: 12px; }
    .btn--danger-hover { &:hover { border-color: var(--color-danger); color: var(--color-danger); } }

    .tracks-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 24px; margin-top: 20px; }
    .tracks-card__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; h3 { font-size: 15px; font-weight: 600; } }
    .track-list { display: flex; flex-direction: column; gap: 2px; }
    .track-row {
      display: flex; align-items: center; gap: 10px; padding: 8px 10px;
      border-radius: var(--radius-sm); border: 1px solid transparent;
      &:hover { background: var(--color-surface-2); border-color: var(--color-border); }
    }
    .track-row__pos { font-size: 11px; min-width: 32px; text-align: right; flex-shrink: 0; }
    .track-row__title { flex: 1; font-size: 13px; font-weight: 500; }
    .track-row__dur { font-size: 11px; flex-shrink: 0; }
    .track-row__actions { display: flex; gap: 4px; flex-shrink: 0; opacity: 0; .track-row:hover & { opacity: 1; } }
    .track-edit { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--color-surface-2); border: 1px solid var(--color-accent); border-radius: var(--radius-sm); }
    .track-edit__disc { width: 56px; flex-shrink: 0; }
    .track-edit__num { width: 56px; flex-shrink: 0; }
    .track-edit__title { flex: 1; }
  `],
})
export class AlbumFormComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly COMMON_INSTRUMENTS = COMMON_INSTRUMENTS;
  readonly creditRoleEntries = Object.entries(CREDIT_ROLE_LABELS).map(([value, label]) => ({ value: value as CreditRole, label }));
  roleLabel = (role: CreditRole) => CREDIT_ROLE_LABELS[role];

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = signal(false);

  // Artists
  readonly artistSearch = signal('');
  readonly artistMatchStatus = signal<'matched' | 'new' | 'none'>('none');
  readonly artistResults = signal<Artist[]>([]);
  readonly selectedArtists = signal<Artist[]>([]);
  artistOrders = new Map<string, number>();

  // Genres
  readonly allGenres = signal<Genre[]>([]);
  readonly selectedGenres = signal<(Genre & { is_primary: boolean })[]>([]);
  readonly availableGenres = signal<Genre[]>([]);

  // Credits
  readonly credits = signal<PendingCredit[]>([]);
  readonly creditSearch = signal('');
  readonly creditResults = signal<Artist[]>([]);
  readonly pendingCreditArtist = signal<Artist | null>(null);
  readonly pendingInstruments = signal<string[]>([]);
  pendingCreditRole: CreditRole = 'composer';
  pendingCreditNotes = '';

  // Cover art
  readonly coverArtFileId = signal<string | null>(null);
  readonly coverArtPreviewUrl = signal<string | null>(null);
  readonly coverArtUploading = signal(false);
  readonly coverArtError = signal<string | null>(null);
  private coverObjectUrl: string | null = null;

  // Tracks
  readonly tracks = signal<Track[]>([]);
  readonly editingTrackId = signal<string | null>(null);
  editTrackTitle = '';
  editTrackNumber = '';
  editDiscNumber = '';

  private editId: string | null = null;

  form = this.fb.group({
    title:          ['', Validators.required],
    album_type:     ['studio' as AlbumType],
    release_date:   [null as string | null],
    recorded_start: [null as string | null],
    recorded_end:   [null as string | null],
    notes:          [null as string | null],
  });

  async ngOnInit(): Promise<void> {
    const genres = await firstValueFrom(this.api.getGenres());
    this.allGenres.set(genres);
    this.availableGenres.set(genres);

    this.editId = this.route.snapshot.params['id'] ?? null;

    // Prefill from query params (e.g. when navigating from ingest queue)
    const qp = this.route.snapshot.queryParams;
    if (!this.editId && (qp['title'] || qp['year'] || qp['artist'])) {
      if (qp['title']) this.form.patchValue({ title: qp['title'] });
      if (qp['year'])  this.form.patchValue({ release_date: `${qp['year']}-01-01` });
      if (qp['artist']) {
        const results = await firstValueFrom(this.api.getArtists(qp['artist']));
        if (results.length) this.selectedArtists.set([results[0]]);
      }
    }

    if (this.editId) {
      this.isEdit.set(true);
      const album = await firstValueFrom(this.api.getAlbum(this.editId));
      const toDateStr = (v: string | null): string | null => (v ? v.slice(0, 10) : null);
      this.form.patchValue({
        title:          album.title,
        album_type:     album.album_type ?? 'studio',
        release_date:   toDateStr(album.release_date),
        recorded_start: toDateStr(album.recorded_start),
        recorded_end:   toDateStr(album.recorded_end),
        notes:          album.notes,
      });
      if (album.cover_art_file_id) {
        this.coverArtFileId.set(album.cover_art_file_id);
        this.api.thumbBlob(album.cover_art_file_id).subscribe(blob => {
          if (this.coverObjectUrl) URL.revokeObjectURL(this.coverObjectUrl);
          this.coverObjectUrl = URL.createObjectURL(blob);
          this.coverArtPreviewUrl.set(this.coverObjectUrl);
        });
      }
      this.selectedArtists.set(
        album.artists.map((a) => {
          this.artistOrders.set(a.id, a.billing_order);
          return { id: a.id, name: a.name, artist_type: a.artist_type, instruments: [], members: [], created_at: '' };
        })
      );
      this.selectedGenres.set(album.genres.map((g) => ({ ...g })));
      this.credits.set(
        album.credits.map((c) => ({
          artist: { id: c.artist_id, name: c.name, artist_type: c.artist_type, instruments: [], created_at: '' },
          role: c.role,
          instruments: c.instruments,
          notes: c.notes ?? '',
        }))
      );
      this.updateAvailableGenres();
      const tracks = await firstValueFrom(this.api.getTracks(this.editId));
      this.tracks.set(tracks.sort((a, b) =>
        (a.disc_number - b.disc_number) || ((a.track_number ?? 0) - (b.track_number ?? 0))
      ));
    }
  }

  ngOnDestroy(): void {
    if (this.coverObjectUrl) URL.revokeObjectURL(this.coverObjectUrl);
  }

  onCoverSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.uploadCover(file);
  }

  onCoverDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) this.uploadCover(file);
  }

  private uploadCover(file: File): void {
    if (this.coverObjectUrl) URL.revokeObjectURL(this.coverObjectUrl);
    this.coverObjectUrl = URL.createObjectURL(file);
    this.coverArtPreviewUrl.set(this.coverObjectUrl);
    this.coverArtUploading.set(true);
    this.coverArtError.set(null);
    firstValueFrom(this.api.uploadImage(file)).then((result) => {
      this.coverArtFileId.set(result.id);
    }).catch(() => {
      this.coverArtError.set('Image upload failed');
      this.coverArtPreviewUrl.set(null);
      if (this.coverObjectUrl) { URL.revokeObjectURL(this.coverObjectUrl); this.coverObjectUrl = null; }
    }).finally(() => {
      this.coverArtUploading.set(false);
    });
  }

  removeCover(): void {
    this.coverArtFileId.set(null);
    this.coverArtPreviewUrl.set(null);
    if (this.coverObjectUrl) { URL.revokeObjectURL(this.coverObjectUrl); this.coverObjectUrl = null; }
  }

  async onArtistSearch(q: string): Promise<void> {
    this.artistSearch.set(q);
    if (!q.trim()) { this.artistResults.set([]); this.artistMatchStatus.set('none'); return; }
    const results = await firstValueFrom(this.api.getArtists(q));
    const exactMatch = results.some((a) => a.name.toLowerCase() === q.trim().toLowerCase());
    this.artistMatchStatus.set(exactMatch ? 'matched' : 'new');
    this.artistResults.set(results.filter((a) => !this.selectedArtists().some((s) => s.id === a.id)));
  }

  addArtist(artist: Artist): void {
    this.artistOrders.set(artist.id, this.selectedArtists().length);
    this.selectedArtists.update((list) => [...list, artist]);
    this.artistResults.set([]);
    this.artistSearch.set('');
    this.artistMatchStatus.set('none');
  }

  removeArtist(id: string): void {
    this.selectedArtists.update((list) => list.filter((a) => a.id !== id));
    this.artistOrders.delete(id);
  }

  addGenre(genreId: string): void {
    if (!genreId) return;
    const genre = this.allGenres().find((g) => g.id === genreId);
    if (!genre || this.selectedGenres().some((g) => g.id === genreId)) return;
    this.selectedGenres.update((list) => [...list, { ...genre, is_primary: list.length === 0 }]);
    this.updateAvailableGenres();
  }

  removeGenre(id: string): void {
    this.selectedGenres.update((list) => {
      const filtered = list.filter((g) => g.id !== id);
      if (filtered.length && !filtered.some((g) => g.is_primary)) filtered[0].is_primary = true;
      return filtered;
    });
    this.updateAvailableGenres();
  }

  setPrimaryGenre(id: string): void {
    this.selectedGenres.update((list) => list.map((g) => ({ ...g, is_primary: g.id === id })));
  }

  private updateAvailableGenres(): void {
    const selected = new Set(this.selectedGenres().map((g) => g.id));
    this.availableGenres.set(this.allGenres().filter((g) => !selected.has(g.id)));
  }

  // Credits
  async onCreditSearch(q: string): Promise<void> {
    this.creditSearch.set(q);
    if (!q.trim()) { this.creditResults.set([]); return; }
    this.creditResults.set(await firstValueFrom(this.api.getArtists(q)));
  }

  selectCreditArtist(artist: Artist): void {
    this.pendingCreditArtist.set(artist);
    this.creditSearch.set('');
    this.creditResults.set([]);
    // Pre-fill instruments from artist profile
    if (artist.instruments.length) this.pendingInstruments.set([...artist.instruments]);
  }

  addPendingInstrument(inst: string): void {
    if (!inst || this.pendingInstruments().includes(inst)) return;
    this.pendingInstruments.update((i) => [...i, inst]);
  }

  removePendingInstrument(inst: string): void {
    this.pendingInstruments.update((i) => i.filter((x) => x !== inst));
  }

  addCredit(): void {
    const artist = this.pendingCreditArtist();
    if (!artist) return;
    this.credits.update((list) => [...list, {
      artist,
      role: this.pendingCreditRole,
      instruments: [...this.pendingInstruments()],
      notes: this.pendingCreditNotes,
    }]);
    this.pendingCreditArtist.set(null);
    this.pendingInstruments.set([]);
    this.pendingCreditNotes = '';
  }

  removeCredit(c: PendingCredit): void {
    this.credits.update((list) => list.filter((x) => x !== c));
  }

  // ── Track list management ──────────────────────────────────────────────────

  formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  startTrackEdit(track: Track): void {
    this.editingTrackId.set(track.id);
    this.editTrackTitle  = track.title;
    this.editTrackNumber = track.track_number?.toString() ?? '';
    this.editDiscNumber  = track.disc_number.toString();
  }

  cancelTrackEdit(): void {
    this.editingTrackId.set(null);
  }

  async saveTrack(track: Track): Promise<void> {
    const updated = await firstValueFrom(this.api.updateTrack(track.id, {
      title:        this.editTrackTitle || track.title,
      track_number: this.editTrackNumber ? parseInt(this.editTrackNumber, 10) : null,
      disc_number:  this.editDiscNumber  ? parseInt(this.editDiscNumber,  10) : 1,
    }));
    this.tracks.update((list) => {
      const next = list.map((t) => t.id === track.id ? { ...t, ...updated } : t);
      return next.sort((a, b) =>
        (a.disc_number - b.disc_number) || ((a.track_number ?? 0) - (b.track_number ?? 0))
      );
    });
    this.editingTrackId.set(null);
  }

  async addTrack(): Promise<void> {
    if (!this.editId) return;
    const maxTrack = this.tracks().reduce((m, t) => Math.max(m, t.track_number ?? 0), 0);
    const created = await firstValueFrom(this.api.createTrack({
      album_id:     this.editId,
      title:        'New Track',
      disc_number:  1,
      track_number: maxTrack + 1,
    }));
    this.tracks.update((list) => [...list, created]);
    // Open it for editing immediately
    this.startTrackEdit(created);
  }

  async deleteTrack(track: Track): Promise<void> {
    if (!confirm(`Delete "${track.title}"? This cannot be undone.`)) return;
    await firstValueFrom(this.api.deleteTrack(track.id));
    this.tracks.update((list) => list.filter((t) => t.id !== track.id));
    if (this.editingTrackId() === track.id) this.editingTrackId.set(null);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const v = this.form.value;
    const data = {
      title: v.title,
      album_type:     v.album_type     || 'studio',
      release_date:   v.release_date   || null,
      recorded_start: v.recorded_start || null,
      recorded_end:   v.recorded_end   || null,
      notes:          v.notes          || null,
      cover_art_file_id: this.coverArtFileId(),
      artists: this.selectedArtists().map((a, i) => ({ id: a.id, billing_order: this.artistOrders.get(a.id) ?? i })),
      credits: this.credits().map((c, i) => ({
        artist_id: c.artist.id, role: c.role, instruments: c.instruments, notes: c.notes || null, billing_order: i,
      })),
      genres: this.selectedGenres().map((g) => ({ id: g.id, is_primary: g.is_primary })),
    };
    try {
      if (this.editId) {
        await firstValueFrom(this.api.updateAlbum(this.editId, data));
        this.toast.success('Album updated');
      } else {
        await firstValueFrom(this.api.createAlbum(data));
        this.toast.success('Album added');
      }
      const returnTo = this.route.snapshot.queryParams['returnTo'] ?? '/dag';
      await this.router.navigateByUrl(returnTo);
    } catch (err: unknown) {
      console.error('Save album error:', err);
      const httpErr = err as { error?: { error?: unknown }; status?: number; message?: string };
      const detail = httpErr?.error?.error ? JSON.stringify(httpErr.error.error) : httpErr?.message;
      this.error.set(`Failed to save album${detail ? ': ' + detail : ''}`);
    } finally {
      this.loading.set(false);
    }
  }
}
