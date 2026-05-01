import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  IngestItem, Album, Track, Artist, Genre, AlbumType,
  CreditRole, CREDIT_ROLE_LABELS, COMMON_INSTRUMENTS,
} from '../../../core/models/api.models';

interface PendingCredit {
  artist: Artist;
  role: CreditRole;
  instruments: string[];
  notes: string;
}

interface NewAlbumState {
  title: string;
  albumType: AlbumType;
  releaseDate: string;
  recordedStart: string;
  recordedEnd: string;
  notes: string;
  // Artists
  artistSearch: string;
  artistResults: Artist[];
  selectedArtists: Artist[];
  artistOrders: Map<string, number>;
  // Genres
  selectedGenres: (Genre & { is_primary: boolean })[];
  genreSearch: string;
  genreResults: Genre[];
  // Credits
  credits: PendingCredit[];
  creditSearch: string;
  creditResults: Artist[];
  pendingCreditArtist: Artist | null;
  pendingCreditRole: CreditRole;
  pendingInstruments: string[];
  pendingCreditNotes: string;
  // Cover art
  coverArtFileId: string | null;
  coverArtPreviewUrl: string | null;
  coverArtUploading: boolean;
  coverArtError: string | null;
  _coverObjectUrl: string | null;
}

interface AlbumGroup {
  key: string;
  tag_album_artist: string | null;
  tag_album: string | null;
  tag_year: number | null;
  items: IngestItemVM[];
  mode: 'select' | 'new';
  // ── Match existing ──
  albumSearchQuery: string;
  albumSearchResults: Album[];
  albumSearchOpen: boolean;
  selectedAlbum: Album | null;
  albumTracks: Track[];
  // ── Create new ──
  newAlbum: NewAlbumState;
  // ── Shared ──
  confirming: boolean;
  // ── Auto-match ──
  matchedAlbumId: string | null;
}

interface IngestItemVM extends IngestItem {
  matchedTrackId: string | null;
}

function makeNewAlbumState(tag_album: string | null, tag_album_artist: string | null, tag_year: number | null): NewAlbumState {
  return {
    title: tag_album ?? '',
    albumType: 'studio',
    releaseDate: tag_year ? `${tag_year}-01-01` : '',
    recordedStart: '',
    recordedEnd: '',
    notes: '',
    artistSearch: tag_album_artist ?? '',
    artistResults: [],
    selectedArtists: [],
    artistOrders: new Map(),
    selectedGenres: [],
    genreSearch: '',
    genreResults: [],
    credits: [],
    creditSearch: '',
    creditResults: [],
    pendingCreditArtist: null,
    pendingCreditRole: 'composer',
    pendingInstruments: [],
    pendingCreditNotes: '',
    coverArtFileId: null,
    coverArtPreviewUrl: null,
    coverArtUploading: false,
    coverArtError: null,
    _coverObjectUrl: null,
  };
}

@Component({
  selector: 'app-ingest-queue',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="page">
      <header class="page__header">
        <a class="back-link" routerLink="/dag">← Back to DAG</a>
        <h1 class="page__title">Ingest Queue</h1>
        @if (loading()) {
          <span class="status">Loading…</span>
        } @else {
          <span class="status">{{ groups().length }} album group(s) · {{ totalItems() }} file(s) pending</span>
          @if (matchedGroupCount() > 0) {
            <button class="btn btn--matched" [disabled]="autoLinking()" (click)="autoLinkAllMatched()">
              {{ autoLinking() ? 'Linking…' : 'Link All Matched (' + matchedGroupCount() + ')' }}
            </button>
          }
        }
      </header>

      <div class="page__body">
        @if (!loading() && groups().length === 0) {
          <div class="empty">No files waiting to be matched. 🎉</div>
        }

        @for (group of groups(); track group.key) {
          <div class="group" [class.group--matched]="group.matchedAlbumId != null">

            <!-- Group header -->
            <div class="group__header">
              <div class="group__info">
                <strong>{{ group.tag_album_artist ?? 'Unknown Artist' }}</strong>
                —
                <em>{{ group.tag_album ?? 'Unknown Album' }}</em>
                @if (group.tag_year) { <span class="year">({{ group.tag_year }})</span> }
                <span class="count">{{ group.items.length }} track(s)</span>
                @if (group.matchedAlbumId) { <span class="badge badge--matched">matched</span> }
              </div>
              @if (!group.matchedAlbumId) {
                <div class="mode-toggle">
                  <button class="mode-btn" [class.mode-btn--active]="group.mode === 'select'"
                    (click)="setMode(group, 'select')">Match existing album</button>
                  <button class="mode-btn" [class.mode-btn--active]="group.mode === 'new'"
                    (click)="setMode(group, 'new')">Create new album</button>
                </div>
              }
            </div>

            <div class="group__body">

              <!-- ── AUTO-MATCHED: album found automatically ── -->
              @if (group.matchedAlbumId) {
                <div class="auto-match-info">
                  <span class="auto-match-label">Will link to existing album in library.</span>
                  <span class="muted small">{{ group.items.length }} file(s) will be matched by track number. Use "Link All Matched" above to confirm.</span>
                </div>
                <div class="preview-rows">
                  @for (item of group.items; track item.id) {
                    <div class="preview-row">
                      <span class="num-cell muted">{{ item.tag_disc_num > 1 ? item.tag_disc_num + '-' : '' }}{{ item.tag_track_num ?? '?' }}</span>
                      <span>{{ item.tag_title ?? item.original_filename }}</span>
                    </div>
                  }
                </div>
                <div class="group__actions">
                  <button class="btn btn--primary btn--matched-link" [disabled]="group.confirming" (click)="linkSingleMatched(group)">
                    {{ group.confirming ? 'Linking…' : 'Link This Album' }}
                  </button>
                  <button class="btn btn--ghost" (click)="rejectGroup(group)">Reject all</button>
                </div>
              }

              <!-- ── MATCH EXISTING (manual) ── -->
              @if (!group.matchedAlbumId && group.mode === 'select') {
                <div class="album-match">
                  <label class="field-label">Album:</label>
                  @if (group.selectedAlbum) {
                    <div class="selected-album">
                      <span>{{ group.selectedAlbum.title }}</span>
                      <span class="muted small">{{ group.selectedAlbum.artists[0]?.name }}</span>
                      <button class="btn btn--ghost btn--sm" (click)="clearAlbum(group)">Change</button>
                    </div>
                  } @else {
                    <div class="search-wrap">
                      <input class="input" placeholder="Search existing albums…"
                        [(ngModel)]="group.albumSearchQuery"
                        (input)="searchAlbums(group)"
                        (focus)="group.albumSearchOpen = true" />
                      @if (group.albumSearchOpen && group.albumSearchResults.length) {
                        <div class="dropdown">
                          @for (album of group.albumSearchResults; track album.id) {
                            <button class="dropdown-item" (click)="selectAlbum(group, album)">
                              {{ album.title }}
                              <span class="muted">{{ album.artists[0]?.name }}</span>
                            </button>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>

                @if (group.selectedAlbum) {
                  <table class="track-table">
                    <thead>
                      <tr><th>#</th><th>Detected title</th><th>Action</th><th></th></tr>
                    </thead>
                    <tbody>
                      @for (item of group.items; track item.id) {
                        <tr>
                          <td class="num-cell">{{ item.tag_disc_num > 1 ? item.tag_disc_num + '-' : '' }}{{ item.tag_track_num ?? '?' }}</td>
                          <td>{{ item.tag_title ?? item.original_filename }}</td>
                          <td>
                            <select class="select" [(ngModel)]="item.matchedTrackId">
                              <option [ngValue]="null">+ create new track</option>
                              @for (track of group.albumTracks; track track.id) {
                                <option [ngValue]="track.id">
                                  {{ track.track_number ? track.track_number + '. ' : '' }}{{ track.title }}{{ track.file_id ? ' (has file)' : '' }}
                                </option>
                              }
                            </select>
                          </td>
                          <td>
                            @if (item.matchedTrackId) {
                              <span class="badge badge--ok">✓ link</span>
                            } @else {
                              <span class="badge badge--new">+ new</span>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>

                  <div class="group__actions">
                    <button class="btn btn--primary" [disabled]="group.confirming" (click)="confirmMatchGroup(group)">
                      {{ group.confirming ? 'Saving…' : 'Confirm & Link' }}
                    </button>
                    <button class="btn btn--ghost" (click)="rejectGroup(group)">Reject all</button>
                  </div>
                }
              }

              <!-- ── CREATE NEW ALBUM ── -->
              @if (group.mode === 'new') {
                <div class="new-album-form">

                  <div class="form-grid">

                    <!-- Title -->
                    <div class="form-group form-group--full">
                      <label>Title *</label>
                      <input class="input" type="text" [(ngModel)]="group.newAlbum.title" placeholder="Album title" />
                    </div>

                    <!-- Type -->
                    <div class="form-group">
                      <label>Type</label>
                      <select class="select" [(ngModel)]="group.newAlbum.albumType">
                        <option value="studio">Studio</option>
                        <option value="live">Live</option>
                        <option value="compilation">Compilation</option>
                        <option value="ep">EP</option>
                      </select>
                    </div>

                    <!-- Release Date -->
                    <div class="form-group">
                      <label>Release Date</label>
                      <input class="input" type="date" [(ngModel)]="group.newAlbum.releaseDate" />
                    </div>

                    <!-- Recorded Start -->
                    <div class="form-group">
                      <label>Recorded Start</label>
                      <input class="input" type="date" [(ngModel)]="group.newAlbum.recordedStart" />
                    </div>

                    <!-- Recorded End -->
                    <div class="form-group">
                      <label>Recorded End</label>
                      <input class="input" type="date" [(ngModel)]="group.newAlbum.recordedEnd" />
                    </div>

                    <!-- Cover Art -->
                    <div class="form-group">
                      <label>Cover Art</label>
                      <div class="cover-upload"
                           (click)="coverInput.click()"
                           (dragover)="$event.preventDefault()"
                           (drop)="onCoverDrop($event, group)">
                        <input #coverInput type="file" accept="image/jpeg,image/png,image/webp"
                               style="display:none" (change)="onCoverSelect($event, group)" />
                        @if (group.newAlbum.coverArtPreviewUrl) {
                          <img [src]="group.newAlbum.coverArtPreviewUrl" class="cover-preview" alt="Cover" />
                          <button type="button" class="cover-remove"
                            (click)="$event.stopPropagation(); removeCover(group)">✕</button>
                        } @else if (group.newAlbum.coverArtUploading) {
                          <span class="cover-hint">Uploading…</span>
                        } @else {
                          <span class="cover-hint">Click or drop image</span>
                        }
                      </div>
                      @if (group.newAlbum.coverArtError) {
                        <p class="form-error">{{ group.newAlbum.coverArtError }}</p>
                      }
                    </div>

                    <!-- Notes -->
                    <div class="form-group form-group--full">
                      <label>Notes</label>
                      <textarea class="input" [(ngModel)]="group.newAlbum.notes" rows="2"
                        placeholder="Any notes about this album…"></textarea>
                    </div>

                    <!-- Artists -->
                    <div class="form-group form-group--full">
                      <label>Primary Artists <span class="hint">Credited on the cover</span></label>
                      <div class="tag-list">
                        @for (artist of group.newAlbum.selectedArtists; track artist.id) {
                          <div class="tag">
                            <span>{{ artist.name }}</span>
                            <span class="dim">#{{ group.newAlbum.artistOrders.get(artist.id) ?? 0 }}</span>
                            <button type="button" class="tag__remove"
                              (click)="removeNewArtist(group, artist.id)">✕</button>
                          </div>
                        }
                      </div>
                      <div class="search-wrap">
                        <input class="input" type="text" placeholder="Search artists…"
                          [(ngModel)]="group.newAlbum.artistSearch"
                          (input)="searchNewArtists(group)"
                          (focus)="searchNewArtists(group)" />
                        @if (group.newAlbum.artistResults.length || group.newAlbum.artistSearch.trim()) {
                          <div class="dropdown">
                            @for (a of group.newAlbum.artistResults; track a.id) {
                              <button type="button" class="dropdown-item"
                                (click)="addNewArtist(group, a)">
                                {{ a.name }}
                                <span class="dim">{{ a.artist_type === 'group' ? '(group)' : '' }}</span>
                              </button>
                            }
                            @if (group.newAlbum.artistSearch.trim() && !group.newAlbum.artistResults.some(a => a.name.toLowerCase() === group.newAlbum.artistSearch.trim().toLowerCase())) {
                              <button type="button" class="dropdown-item dropdown-item--create"
                                (click)="createAndAddArtist(group)">
                                + Create "{{ group.newAlbum.artistSearch.trim() }}"
                              </button>
                            }
                          </div>
                        }
                      </div>
                    </div>

                    <!-- Genres -->
                    <div class="form-group form-group--full">
                      <label>Genres</label>
                      <div class="tag-list">
                        @for (genre of group.newAlbum.selectedGenres; track genre.id) {
                          <div class="tag" [style.border-color]="genre.color_hex">
                            <span>{{ genre.name }}</span>
                            <label class="tag__primary">
                              <input type="radio" [name]="'primary_genre_' + group.key" [value]="genre.id"
                                [checked]="genre.is_primary"
                                (change)="setPrimaryGenre(group, genre.id)" />
                              Primary
                            </label>
                            <button type="button" class="tag__remove"
                              (click)="removeGenre(group, genre.id)">✕</button>
                          </div>
                        }
                      </div>
                      <div class="search-wrap">
                        <input class="input" type="text" placeholder="Search genres…"
                          [(ngModel)]="group.newAlbum.genreSearch"
                          (input)="searchGenres(group)"
                          (focus)="searchGenres(group)" />
                        @if (group.newAlbum.genreResults.length || group.newAlbum.genreSearch.trim()) {
                          <div class="dropdown">
                            @for (g of group.newAlbum.genreResults; track g.id) {
                              <button type="button" class="dropdown-item"
                                (click)="addGenreFromSearch(group, g)">
                                {{ g.parent_name ? g.parent_name + ' › ' : '' }}{{ g.name }}
                              </button>
                            }
                            @if (group.newAlbum.genreSearch.trim() && !group.newAlbum.genreResults.some(g => g.name.toLowerCase() === group.newAlbum.genreSearch.trim().toLowerCase())) {
                              <button type="button" class="dropdown-item dropdown-item--create"
                                (click)="createAndAddGenre(group)">
                                + Create "{{ group.newAlbum.genreSearch.trim() }}"
                              </button>
                            }
                          </div>
                        }
                      </div>
                    </div>

                    <!-- Credits -->
                    <div class="form-group form-group--full">
                      <label>Credits <span class="hint">Featured artists, session musicians, composers, etc.</span></label>
                      @if (group.newAlbum.credits.length) {
                        <div class="credit-list">
                          @for (c of group.newAlbum.credits; track c.artist.id + c.role) {
                            <div class="credit-row">
                              <span class="credit-name">{{ c.artist.name }}</span>
                              <span class="badge dim">{{ roleLabel(c.role) }}</span>
                              @if (c.instruments.length) {
                                <span class="dim small">{{ c.instruments.join(', ') }}</span>
                              }
                              @if (c.notes) { <span class="dim small">{{ c.notes }}</span> }
                              <button type="button" class="tag__remove"
                                (click)="removeCredit(group, c)">✕</button>
                            </div>
                          }
                        </div>
                      }
                      <div class="add-credit">
                        <div class="add-credit__row">
                          <div class="search-wrap" style="flex:1">
                            <input class="input" type="text" placeholder="Search artist…"
                              [(ngModel)]="group.newAlbum.creditSearch"
                              (input)="searchCreditArtist(group)" />
                            @if (group.newAlbum.creditResults.length) {
                              <div class="dropdown">
                                @for (a of group.newAlbum.creditResults; track a.id) {
                                  <button type="button" class="dropdown-item"
                                    (click)="selectCreditArtist(group, a)">{{ a.name }}</button>
                                }
                              </div>
                            }
                            @if (group.newAlbum.pendingCreditArtist) {
                              <div class="selected-artist">{{ group.newAlbum.pendingCreditArtist.name }}</div>
                            }
                          </div>
                          <select class="select select--role" [(ngModel)]="group.newAlbum.pendingCreditRole">
                            @for (entry of creditRoleEntries; track entry.value) {
                              <option [value]="entry.value">{{ entry.label }}</option>
                            }
                          </select>
                        </div>
                        <div class="add-credit__instruments">
                          <div class="tag-list">
                            @for (inst of group.newAlbum.pendingInstruments; track inst) {
                              <div class="tag">{{ inst }}
                                <button type="button" class="tag__remove"
                                  (click)="removePendingInstrument(group, inst)">✕</button>
                              </div>
                            }
                          </div>
                          @if (group.newAlbum.pendingCreditRole === 'session' || group.newAlbum.pendingCreditRole === 'featured') {
                            <select class="select" (change)="addPendingInstrument(group, $any($event.target).value); $any($event.target).value = ''">
                              <option value="">Add instrument…</option>
                              @for (i of COMMON_INSTRUMENTS; track i) {
                                <option [value]="i">{{ i }}</option>
                              }
                            </select>
                          }
                        </div>
                        <div class="add-credit__footer">
                          <input class="input" type="text" [(ngModel)]="group.newAlbum.pendingCreditNotes"
                            placeholder="Notes (optional)" style="flex:1" />
                          <button type="button" class="btn btn--ghost btn--sm"
                            [disabled]="!group.newAlbum.pendingCreditArtist"
                            (click)="addCredit(group)">Add Credit</button>
                        </div>
                      </div>
                    </div>

                  </div><!-- /form-grid -->

                  <!-- Tracks preview -->
                  <div class="new-tracks-preview">
                    <div class="field-label" style="margin-bottom:6px">
                      Tracks to create ({{ group.items.length }})
                    </div>
                    @for (item of group.items; track item.id) {
                      <div class="preview-row">
                        <span class="num-cell muted">{{ item.tag_disc_num > 1 ? item.tag_disc_num + '-' : '' }}{{ item.tag_track_num ?? '?' }}</span>
                        <span>{{ item.tag_title ?? item.original_filename }}</span>
                        <span class="badge badge--new">+ new</span>
                      </div>
                    }
                  </div>

                  <div class="group__actions">
                    <button class="btn btn--primary"
                      [disabled]="group.confirming || !group.newAlbum.title.trim()"
                      (click)="confirmNewAlbumGroup(group)">
                      {{ group.confirming ? 'Creating…' : 'Create Album & Link Files' }}
                    </button>
                    <button class="btn btn--ghost" (click)="rejectGroup(group)">Reject all</button>
                  </div>
                </div>
              }

            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
    .page__header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .page__title { font-size: 22px; font-weight: 700; }
    .back-link { color: var(--color-text-muted); font-size: 13px; }
    .status { color: var(--color-text-muted); font-size: 13px; margin-left: auto; }
    .page__body { overflow-y: auto; max-height: calc(100vh - 120px); }
    .empty { text-align: center; padding: 64px; color: var(--color-text-muted); font-size: 15px; }

    .group {
      background: var(--color-surface); border: 1px solid var(--color-border);
      border-radius: var(--radius-md); margin-bottom: 16px; overflow: visible;
    }
    .group--matched { border-color: rgba(72,199,120,.5); }
    .group--matched .group__header { background: rgba(72,199,120,.07); }
    .group__header {
      padding: 12px 16px; background: var(--color-surface-2);
      border-bottom: 1px solid var(--color-border);
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    }
    .group__info { font-size: 14px; }
    .year { color: var(--color-text-muted); margin-left: 4px; font-size: 13px; }
    .count { margin-left: 8px; color: var(--color-accent); font-size: 12px; font-weight: 600; }
    .group__body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .group__actions { display: flex; gap: 8px; margin-top: 4px; }

    .mode-toggle { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow: hidden; }
    .mode-btn { padding: 5px 12px; font-size: 12px; background: none; border: none; color: var(--color-text-muted); cursor: pointer; }
    .mode-btn--active { background: var(--color-accent); color: #fff; }
    .mode-btn:not(.mode-btn--active):hover { background: var(--color-surface); }

    .album-match { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .selected-album { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; }

    .search-wrap { position: relative; flex: 1; min-width: 200px; }
    .dropdown {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50;
      background: var(--color-surface-2); border: 1px solid var(--color-border);
      border-radius: var(--radius-sm); max-height: 200px; overflow-y: auto;
    }
    .dropdown-item {
      display: flex; align-items: center; justify-content: space-between;
      width: 100%; padding: 8px 12px; font-size: 13px; text-align: left;
      background: none; border: none; color: var(--color-text); cursor: pointer;
      &:hover { background: var(--color-surface); }
    }
    .dropdown-item--create { color: var(--color-accent); font-style: italic; }

    .track-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .track-table th { text-align: left; padding: 6px 8px; color: var(--color-text-muted); font-weight: 500; border-bottom: 1px solid var(--color-border); }
    .track-table td { padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,.05); vertical-align: middle; }
    .num-cell { color: var(--color-text-muted); width: 40px; }
    .select { background: var(--color-surface-2); border: 1px solid var(--color-border); color: var(--color-text); border-radius: 4px; padding: 4px 8px; font-size: 13px; width: 100%; }
    .select--role { width: auto; flex-shrink: 0; }

    .badge--ok      { background: rgba(72,199,120,.2);  color: #48c778; padding: 2px 7px; border-radius: 4px; font-size: 11px; white-space: nowrap; }
    .badge--new     { background: rgba(96,165,250,.2);  color: #60a5fa; padding: 2px 7px; border-radius: 4px; font-size: 11px; white-space: nowrap; }
    .badge--matched { background: rgba(72,199,120,.25); color: #48c778; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap; }
    .btn--matched { background: rgba(72,199,120,.2); border: 1px solid rgba(72,199,120,.5); color: #48c778; padding: 6px 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; &:hover:not(:disabled) { background: rgba(72,199,120,.35); } &:disabled { opacity: .6; cursor: not-allowed; } }

    /* ── New album form ── */
    .new-album-form { display: flex; flex-direction: column; gap: 16px; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-group { display: flex; flex-direction: column; gap: 4px; }
    .form-group--full { grid-column: 1 / -1; }
    .form-group label { font-size: 12px; font-weight: 500; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .04em; }
    .hint { font-size: 11px; font-weight: 400; color: var(--color-text-muted); margin-left: 6px; text-transform: none; letter-spacing: 0; }
    .input { background: var(--color-surface-2); border: 1px solid var(--color-border); color: var(--color-text); border-radius: var(--radius-sm); padding: 5px 10px; font-size: 13px; width: 100%; box-sizing: border-box; }
    textarea.input { resize: vertical; min-height: 60px; }

    .cover-upload {
      position: relative; width: 120px; height: 120px;
      border: 2px dashed var(--color-border); border-radius: var(--radius-md);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; overflow: hidden;
      &:hover { border-color: var(--color-accent); }
    }
    .cover-preview { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover-hint { font-size: 11px; color: var(--color-text-muted); text-align: center; padding: 8px; }
    .cover-remove {
      position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%;
      background: rgba(0,0,0,.6); color: #fff; font-size: 10px;
      display: flex; align-items: center; justify-content: center;
      &:hover { background: var(--color-danger); }
    }
    .form-error { color: var(--color-danger); font-size: 12px; margin-top: 2px; }

    .tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
    .tag { display: flex; align-items: center; gap: 5px; background: var(--color-surface-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 3px 8px; font-size: 12px; }
    .tag__primary { display: flex; align-items: center; gap: 3px; font-size: 11px; color: var(--color-text-muted); }
    .tag__remove { color: var(--color-text-muted); font-size: 10px; background: none; border: none; cursor: pointer; padding: 0; line-height: 1; &:hover { color: var(--color-danger); } }
    .dim { color: var(--color-text-muted); font-size: 12px; }
    .small { font-size: 11px; }

    .credit-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
    .credit-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--color-surface-2); border-radius: var(--radius-sm); font-size: 12px; }
    .credit-name { font-weight: 600; font-size: 13px; }
    .badge { background: var(--color-surface); padding: 1px 6px; border-radius: 3px; font-size: 11px; }

    .add-credit { border: 1px dashed var(--color-border); border-radius: var(--radius-md); padding: 10px; display: flex; flex-direction: column; gap: 8px; }
    .add-credit__row { display: flex; gap: 8px; align-items: flex-start; }
    .add-credit__instruments { display: flex; flex-direction: column; gap: 6px; }
    .add-credit__footer { display: flex; gap: 8px; align-items: center; }
    .selected-artist { margin-top: 4px; padding: 4px 8px; background: rgba(124,106,247,.1); border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; color: var(--color-accent); }

    .auto-match-info { display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; background: rgba(72,199,120,.08); border: 1px solid rgba(72,199,120,.25); border-radius: var(--radius-sm); }
    .auto-match-label { font-size: 13px; font-weight: 600; color: #48c778; }
    .preview-rows { background: var(--color-surface-2); border-radius: var(--radius-sm); padding: 6px 12px; }
    .btn--matched-link { background: rgba(72,199,120,.2); border: 1px solid rgba(72,199,120,.4); color: #48c778; &:hover:not(:disabled) { background: rgba(72,199,120,.35); } }
    .new-tracks-preview { background: var(--color-surface-2); border-radius: var(--radius-sm); padding: 10px 12px; }
    .preview-row { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 3px 0; }

    .muted { color: var(--color-text-muted); }
    .btn--sm { padding: 4px 10px; font-size: 12px; }
    .field-label { font-size: 13px; color: var(--color-text-muted); flex-shrink: 0; }
  `],
})
export class IngestQueueComponent implements OnInit, OnDestroy {
  private readonly api  = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly COMMON_INSTRUMENTS = COMMON_INSTRUMENTS;
  readonly creditRoleEntries = Object.entries(CREDIT_ROLE_LABELS).map(([v, l]) => ({ value: v as CreditRole, label: l }));
  readonly roleLabel = (r: CreditRole) => CREDIT_ROLE_LABELS[r];

  readonly loading         = signal(true);
  readonly autoLinking     = signal(false);
  readonly groups          = signal<AlbumGroup[]>([]);
  readonly allGenres       = signal<Genre[]>([]);
  readonly totalItems      = computed(() => this.groups().reduce((acc, g) => acc + g.items.length, 0));
  readonly matchedGroupCount = computed(() => this.groups().filter((g) => g.matchedAlbumId != null).length);

  async ngOnInit(): Promise<void> {
    const [items, genres] = await Promise.all([
      firstValueFrom(this.api.getIngestQueue()),
      firstValueFrom(this.api.getGenres()),
    ]);
    this.allGenres.set(genres);
    const groups = this.buildGroups(items);
    this.groups.set(groups);
    this.loading.set(false);
    // Load cover thumbnails for groups that have a cover_art_file_id
    for (const group of groups) {
      const coverFileId = group.items[0]?.cover_art_file_id;
      if (coverFileId) {
        this.api.getThumbBlob(coverFileId).subscribe((blob: Blob) => {
          const url = URL.createObjectURL(blob);
          group.newAlbum._coverObjectUrl    = url;
          group.newAlbum.coverArtPreviewUrl = url;
          group.newAlbum.coverArtFileId     = coverFileId;
          this.groups.update((g) => [...g]);
        });
      }
    }
  }

  ngOnDestroy(): void {
    // Revoke any object URLs created for cover art previews
    for (const g of this.groups()) {
      if (g.newAlbum._coverObjectUrl) URL.revokeObjectURL(g.newAlbum._coverObjectUrl);
    }
  }

  private buildGroups(items: IngestItem[]): AlbumGroup[] {
    const map = new Map<string, AlbumGroup>();
    for (const item of items) {
      const key = `${item.tag_album_artist ?? ''}::${item.tag_album ?? ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          tag_album_artist:  item.tag_album_artist,
          tag_album:         item.tag_album,
          tag_year:          item.tag_year,
          items:             [],
          mode:              'select',
          albumSearchQuery:  item.tag_album ?? '',
          albumSearchResults: [],
          albumSearchOpen:   false,
          selectedAlbum:     null,
          albumTracks:       [],
          newAlbum:          makeNewAlbumState(item.tag_album, item.tag_album_artist, item.tag_year),
          confirming:        false,
          matchedAlbumId:    item.matched_album_id ?? null,
        });
      }
      map.get(key)!.items.push({ ...item, matchedTrackId: null });
    }
    return [...map.values()];
  }

  // ── Mode ──────────────────────────────────────────────────────────────────

  setMode(group: AlbumGroup, mode: 'select' | 'new'): void {
    group.mode = mode;
    if (mode === 'new' && group.newAlbum.artistSearch.trim()) {
      this.searchNewArtists(group);
    }
    this.groups.update((g) => [...g]);
  }

  // ── Match existing ────────────────────────────────────────────────────────

  async searchAlbums(group: AlbumGroup): Promise<void> {
    const q = group.albumSearchQuery.trim();
    if (!q) { group.albumSearchResults = []; return; }
    const results = await firstValueFrom(this.api.getAlbums({ search: q }));
    group.albumSearchResults = results.slice(0, 8);
    group.albumSearchOpen = true;
    this.groups.update((g) => [...g]);
  }

  async selectAlbum(group: AlbumGroup, album: Album): Promise<void> {
    group.selectedAlbum     = album;
    group.albumSearchOpen   = false;
    group.albumSearchResults = [];
    const tracks = await firstValueFrom(this.api.getTracks(album.id));
    group.albumTracks = tracks;
    for (const item of group.items) {
      const noFile   = tracks.find((t) => t.track_number === item.tag_track_num && (t.disc_number ?? 1) === item.tag_disc_num && !t.file_id);
      const withFile = tracks.find((t) => t.track_number === item.tag_track_num && (t.disc_number ?? 1) === item.tag_disc_num);
      item.matchedTrackId = (noFile ?? withFile)?.id ?? null;
    }
    this.groups.update((g) => [...g]);
  }

  clearAlbum(group: AlbumGroup): void {
    group.selectedAlbum = null;
    group.albumTracks   = [];
    for (const item of group.items) item.matchedTrackId = null;
    this.groups.update((g) => [...g]);
  }

  async confirmMatchGroup(group: AlbumGroup): Promise<void> {
    if (!group.selectedAlbum) return;
    group.confirming = true;
    this.groups.update((g) => [...g]);
    try {
      await firstValueFrom(this.api.linkIngestItems(
        group.selectedAlbum.id,
        group.items.map((i) => ({ ingest_id: i.id, track_id: i.matchedTrackId })),
      ));
      this.removeGroup(group.key);
    } finally {
      group.confirming = false;
    }
  }

  // ── New album — artists ────────────────────────────────────────────────────

  async searchNewArtists(group: AlbumGroup): Promise<void> {
    const q = group.newAlbum.artistSearch.trim();
    if (!q) { group.newAlbum.artistResults = []; return; }
    const results = await firstValueFrom(this.api.getArtists(q));
    const selected = new Set(group.newAlbum.selectedArtists.map((a) => a.id));
    group.newAlbum.artistResults = results.filter((a) => !selected.has(a.id));
    this.groups.update((g) => [...g]);
  }

  addNewArtist(group: AlbumGroup, artist: Artist): void {
    const na = group.newAlbum;
    na.artistOrders.set(artist.id, na.selectedArtists.length);
    na.selectedArtists = [...na.selectedArtists, artist];
    na.artistSearch  = '';
    na.artistResults = [];
    this.groups.update((g) => [...g]);
  }

  async createAndAddArtist(group: AlbumGroup): Promise<void> {
    const name = group.newAlbum.artistSearch.trim();
    if (!name) return;
    const artist = await firstValueFrom(this.api.createArtist({ name }));
    this.addNewArtist(group, artist);
  }

  removeNewArtist(group: AlbumGroup, id: string): void {
    group.newAlbum.selectedArtists = group.newAlbum.selectedArtists.filter((a) => a.id !== id);
    group.newAlbum.artistOrders.delete(id);
    this.groups.update((g) => [...g]);
  }

  // ── New album — genres ─────────────────────────────────────────────────────

  searchGenres(group: AlbumGroup): void {
    const q = group.newAlbum.genreSearch.trim().toLowerCase();
    const selected = new Set(group.newAlbum.selectedGenres.map((g) => g.id));
    group.newAlbum.genreResults = this.allGenres()
      .filter((g) => !selected.has(g.id) && (!q || g.name.toLowerCase().includes(q)))
      .slice(0, 10);
    this.groups.update((g) => [...g]);
  }

  addGenreFromSearch(group: AlbumGroup, genre: Genre): void {
    const na = group.newAlbum;
    if (na.selectedGenres.some((g) => g.id === genre.id)) return;
    const isPrimary = na.selectedGenres.length === 0;
    na.selectedGenres = [...na.selectedGenres, { ...genre, is_primary: isPrimary }];
    na.genreSearch  = '';
    na.genreResults = [];
    this.groups.update((g) => [...g]);
  }

  async createAndAddGenre(group: AlbumGroup): Promise<void> {
    const name = group.newAlbum.genreSearch.trim();
    if (!name) return;
    const genre = await firstValueFrom(this.api.createGenre({ name }));
    this.allGenres.update((gs) => [...gs, genre]);
    this.addGenreFromSearch(group, genre);
  }

  addGenre(group: AlbumGroup, genreId: string): void {
    if (!genreId) return;
    const genre = this.allGenres().find((g) => g.id === genreId);
    if (!genre || group.newAlbum.selectedGenres.some((g) => g.id === genreId)) return;
    const isPrimary = group.newAlbum.selectedGenres.length === 0;
    group.newAlbum.selectedGenres = [...group.newAlbum.selectedGenres, { ...genre, is_primary: isPrimary }];
    this.groups.update((g) => [...g]);
  }

  removeGenre(group: AlbumGroup, id: string): void {
    const list = group.newAlbum.selectedGenres.filter((g) => g.id !== id);
    if (list.length && !list.some((g) => g.is_primary)) list[0].is_primary = true;
    group.newAlbum.selectedGenres = list;
    this.groups.update((g) => [...g]);
  }

  setPrimaryGenre(group: AlbumGroup, id: string): void {
    group.newAlbum.selectedGenres = group.newAlbum.selectedGenres.map((g) => ({ ...g, is_primary: g.id === id }));
    this.groups.update((g) => [...g]);
  }

  // ── New album — credits ────────────────────────────────────────────────────

  async searchCreditArtist(group: AlbumGroup): Promise<void> {
    const q = group.newAlbum.creditSearch.trim();
    if (!q) { group.newAlbum.creditResults = []; return; }
    group.newAlbum.creditResults = await firstValueFrom(this.api.getArtists(q));
    this.groups.update((g) => [...g]);
  }

  selectCreditArtist(group: AlbumGroup, artist: Artist): void {
    const na = group.newAlbum;
    na.pendingCreditArtist = artist;
    na.creditSearch  = '';
    na.creditResults = [];
    if (artist.instruments.length) na.pendingInstruments = [...artist.instruments];
    this.groups.update((g) => [...g]);
  }

  addPendingInstrument(group: AlbumGroup, inst: string): void {
    if (!inst || group.newAlbum.pendingInstruments.includes(inst)) return;
    group.newAlbum.pendingInstruments = [...group.newAlbum.pendingInstruments, inst];
    this.groups.update((g) => [...g]);
  }

  removePendingInstrument(group: AlbumGroup, inst: string): void {
    group.newAlbum.pendingInstruments = group.newAlbum.pendingInstruments.filter((i) => i !== inst);
    this.groups.update((g) => [...g]);
  }

  addCredit(group: AlbumGroup): void {
    const na = group.newAlbum;
    if (!na.pendingCreditArtist) return;
    na.credits = [...na.credits, {
      artist: na.pendingCreditArtist,
      role: na.pendingCreditRole,
      instruments: [...na.pendingInstruments],
      notes: na.pendingCreditNotes,
    }];
    na.pendingCreditArtist = null;
    na.pendingInstruments  = [];
    na.pendingCreditNotes  = '';
    this.groups.update((g) => [...g]);
  }

  removeCredit(group: AlbumGroup, credit: PendingCredit): void {
    group.newAlbum.credits = group.newAlbum.credits.filter((c) => c !== credit);
    this.groups.update((g) => [...g]);
  }

  // ── New album — cover art ──────────────────────────────────────────────────

  onCoverSelect(event: Event, group: AlbumGroup): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.uploadCover(group, file);
  }

  onCoverDrop(event: DragEvent, group: AlbumGroup): void {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) this.uploadCover(group, file);
  }

  private uploadCover(group: AlbumGroup, file: File): void {
    const na = group.newAlbum;
    if (na._coverObjectUrl) URL.revokeObjectURL(na._coverObjectUrl);
    na._coverObjectUrl    = URL.createObjectURL(file);
    na.coverArtPreviewUrl = na._coverObjectUrl;
    na.coverArtUploading  = true;
    na.coverArtError      = null;
    this.groups.update((g) => [...g]);
    firstValueFrom(this.api.uploadImage(file))
      .then((result) => { na.coverArtFileId = result.id; })
      .catch(() => {
        na.coverArtError      = 'Image upload failed';
        na.coverArtPreviewUrl = null;
        if (na._coverObjectUrl) { URL.revokeObjectURL(na._coverObjectUrl); na._coverObjectUrl = null; }
      })
      .finally(() => { na.coverArtUploading = false; this.groups.update((g) => [...g]); });
  }

  removeCover(group: AlbumGroup): void {
    const na = group.newAlbum;
    na.coverArtFileId    = null;
    na.coverArtPreviewUrl = null;
    if (na._coverObjectUrl) { URL.revokeObjectURL(na._coverObjectUrl); na._coverObjectUrl = null; }
    this.groups.update((g) => [...g]);
  }

  // ── Confirm new album ──────────────────────────────────────────────────────

  async confirmNewAlbumGroup(group: AlbumGroup): Promise<void> {
    const na = group.newAlbum;
    if (!na.title.trim()) return;
    group.confirming = true;
    this.groups.update((g) => [...g]);
    try {
      const album = await firstValueFrom(this.api.createAlbum({
        title:             na.title.trim(),
        album_type:        na.albumType,
        release_date:      na.releaseDate  || null,
        recorded_start:    na.recordedStart || null,
        recorded_end:      na.recordedEnd   || null,
        notes:             na.notes         || null,
        cover_art_file_id: na.coverArtFileId,
        artists:  na.selectedArtists.map((a, i) => ({ id: a.id, billing_order: na.artistOrders.get(a.id) ?? i })),
        credits:  na.credits.map((c, i) => ({ artist_id: c.artist.id, role: c.role, instruments: c.instruments, notes: c.notes || null, billing_order: i })),
        genres:   na.selectedGenres.map((g) => ({ id: g.id, is_primary: g.is_primary })),
      }));
      await firstValueFrom(this.api.linkIngestItems(
        album.id,
        group.items.map((i) => ({ ingest_id: i.id })),
      ));
      this.removeGroup(group.key);
    } finally {
      group.confirming = false;
    }
  }

  // ── Single matched group link ─────────────────────────────────────────────

  async linkSingleMatched(group: AlbumGroup): Promise<void> {
    if (!group.matchedAlbumId) return;
    group.confirming = true;
    this.groups.update((g) => [...g]);
    try {
      await firstValueFrom(this.api.linkIngestItems(
        group.matchedAlbumId,
        group.items.map((i) => ({ ingest_id: i.id, track_id: null })),
      ));
      this.removeGroup(group.key);
    } finally {
      group.confirming = false;
    }
  }

  // ── Bulk auto-link ────────────────────────────────────────────────────────

  async autoLinkAllMatched(): Promise<void> {
    this.autoLinking.set(true);
    try {
      const result = await firstValueFrom(this.api.autoLinkMatched());
      // Remove all groups that had a matchedAlbumId (they are now processed)
      this.groups.update((gs) => gs.filter((g) => g.matchedAlbumId == null));
      if (result.linked === 0) alert('No matched items found to link.');
    } finally {
      this.autoLinking.set(false);
    }
  }

  // ── Reject ────────────────────────────────────────────────────────────────

  async rejectGroup(group: AlbumGroup): Promise<void> {
    if (!confirm(`Reject all ${group.items.length} item(s) from "${group.tag_album ?? 'Unknown Album'}"?`)) return;
    for (const item of group.items) {
      await firstValueFrom(this.api.rejectIngestItem(item.id));
    }
    this.removeGroup(group.key);
  }

  private removeGroup(key: string): void {
    this.groups.update((g) => g.filter((x) => x.key !== key));
  }
}
