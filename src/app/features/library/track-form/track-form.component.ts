import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { Artist, Track, TrackCredit, CreditRole, CREDIT_ROLE_LABELS, COMMON_INSTRUMENTS } from '../../../core/models/api.models';

@Component({
  selector: 'app-track-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="form-page">
      <div class="form-page__header">
        @if (track()) {
          <a [routerLink]="['/library/album', track()!.album_id, 'edit']" class="btn btn--ghost">← Back to Album</a>
        } @else {
          <a routerLink="/dag" class="btn btn--ghost">← Back</a>
        }
        <h2>Edit Track</h2>
      </div>

      @if (loading()) {
        <div class="empty-state">Loading…</div>
      } @else if (track()) {
        <!-- Basic info card -->
        <div class="form-card">
          <div class="form-grid">
            <div class="form-group form-group--full">
              <label>Title *</label>
              <input type="text" [(ngModel)]="editTitle" placeholder="Track title" />
            </div>
            <div class="form-group">
              <label>Disc</label>
              <input type="number" [(ngModel)]="editDisc" min="1" placeholder="1" />
            </div>
            <div class="form-group">
              <label>Track #</label>
              <input type="number" [(ngModel)]="editTrackNum" min="1" placeholder="—" />
            </div>
            @if (track()!.duration_seconds) {
              <div class="form-group">
                <label>Duration</label>
                <input type="text" [value]="formatDuration(track()!.duration_seconds!)" disabled />
              </div>
            }
          </div>
          @if (saveError()) { <p class="form-error">{{ saveError() }}</p> }
          <div class="form-actions">
            <a [routerLink]="['/library/album', track()!.album_id, 'edit']" class="btn btn--ghost">Cancel</a>
            <button type="button" class="btn btn--primary" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Saving…' : 'Save Changes' }}
            </button>
          </div>
        </div>

        <!-- Credits card -->
        <div class="form-card" style="margin-top: 20px">
          <h3 class="section-title">Track Credits</h3>
          <p class="hint-text">Artists credited specifically on this track (e.g. featured vocalists, session musicians)</p>

          @if (credits().length) {
            <div class="credit-list">
              @for (c of credits(); track c.id) {
                <div class="credit-row">
                  <span class="credit-row__name">{{ c.name }}</span>
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

          <!-- Add credit form -->
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
                  <div class="selected-artist">{{ pendingCreditArtist()!.name }}</div>
                }
              </div>
              <select [(ngModel)]="pendingRole" class="credit-role-select">
                @for (entry of creditRoleEntries; track entry.value) {
                  <option [value]="entry.value">{{ entry.label }}</option>
                }
              </select>
            </div>
            @if (pendingRole === 'session' || pendingRole === 'featured') {
              <div class="add-credit__instruments">
                <div class="tag-list">
                  @for (inst of pendingInstruments(); track inst) {
                    <div class="tag">{{ inst }} <button type="button" class="tag__remove" (click)="removePendingInstrument(inst)">✕</button></div>
                  }
                </div>
                <select (change)="addPendingInstrument($any($event.target).value); $any($event.target).value = ''">
                  <option value="">Add instrument…</option>
                  @for (i of COMMON_INSTRUMENTS; track i) {
                    <option [value]="i">{{ i }}</option>
                  }
                </select>
              </div>
            }
            <div class="add-credit__footer">
              <input type="text" [(ngModel)]="pendingNotes" placeholder="Notes (optional)" style="flex:1" />
              <button type="button" class="btn btn--ghost btn--sm" [disabled]="!pendingCreditArtist()" (click)="addCredit()">
                Add Credit
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .form-page { max-width: 680px; margin: 0 auto; padding: 24px; height: 100%; overflow-y: auto; }
    .form-page__header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; h2 { font-size: 18px; font-weight: 600; } }
    .form-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 24px; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .form-group--full { grid-column: 1 / -1; }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; }
    .section-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
    .hint-text { font-size: 12px; color: var(--color-text-muted); margin-bottom: 12px; }
    .empty-state { padding: 48px 0; text-align: center; color: var(--color-text-muted); font-size: 14px; }
    .dim { color: var(--color-text-muted); font-size: 12px; }

    .badge { font-size: 11px; padding: 2px 7px; border-radius: var(--radius-sm); background: var(--color-surface-2); border: 1px solid var(--color-border); color: var(--color-text-muted); }
    .tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .tag { display: flex; align-items: center; gap: 6px; background: var(--color-surface-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 4px 8px; font-size: 12px; }
    .tag__remove { color: var(--color-text-muted); font-size: 10px; &:hover { color: var(--color-danger); } }

    .credit-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .credit-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--color-surface-2); border-radius: var(--radius-sm); font-size: 12px; }
    .credit-row__name { font-weight: 600; font-size: 13px; }
    .credit-row__role { }
    .credit-row__instruments { flex: 1; }

    .search-row { position: relative; }
    .dropdown { position: absolute; top: 100%; left: 0; right: 0; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); z-index: 50; max-height: 200px; overflow-y: auto; }
    .dropdown__item { display: block; width: 100%; padding: 8px 12px; text-align: left; font-size: 13px; &:hover { background: var(--color-surface-2); } }
    .selected-artist { margin-top: 6px; padding: 5px 10px; background: rgba(124,106,247,.1); border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; color: var(--color-accent); }

    .add-credit { border: 1px dashed var(--color-border); border-radius: var(--radius-md); padding: 12px; display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
    .add-credit__row { display: flex; gap: 8px; align-items: flex-start; }
    .add-credit__instruments { display: flex; flex-direction: column; gap: 6px; }
    .add-credit__footer { display: flex; gap: 8px; align-items: center; }
    .credit-role-select { width: auto; flex-shrink: 0; }
    .btn--sm { padding: 5px 10px; font-size: 12px; }
    :host { display: block; height: 100%; }
  `],
})
export class TrackFormComponent implements OnInit {
  private readonly api   = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);

  readonly COMMON_INSTRUMENTS = COMMON_INSTRUMENTS;
  readonly creditRoleEntries = Object.entries(CREDIT_ROLE_LABELS).map(([value, label]) => ({ value: value as CreditRole, label }));
  roleLabel = (role: CreditRole) => CREDIT_ROLE_LABELS[role];

  readonly loading = signal(true);
  readonly saving  = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly track   = signal<Track | null>(null);
  readonly credits = signal<TrackCredit[]>([]);

  // Edit fields
  editTitle    = '';
  editDisc     = '';
  editTrackNum = '';

  // Credit form
  readonly creditSearch       = signal('');
  readonly creditResults      = signal<Artist[]>([]);
  readonly pendingCreditArtist = signal<Artist | null>(null);
  readonly pendingInstruments  = signal<string[]>([]);
  pendingRole: CreditRole = 'composer';
  pendingNotes = '';

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.params['id'];
    try {
      const [track, credits] = await Promise.all([
        firstValueFrom(this.api.getTrack(id)),
        firstValueFrom(this.api.getTrackCredits(id)),
      ]);
      this.track.set(track);
      this.credits.set(credits);
      this.editTitle    = track.title;
      this.editDisc     = track.disc_number.toString();
      this.editTrackNum = track.track_number?.toString() ?? '';
    } finally {
      this.loading.set(false);
    }
  }

  formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async save(): Promise<void> {
    const t = this.track();
    if (!t) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const updated = await firstValueFrom(this.api.updateTrack(t.id, {
        title:        this.editTitle || t.title,
        disc_number:  this.editDisc     ? parseInt(this.editDisc,     10) : 1,
        track_number: this.editTrackNum ? parseInt(this.editTrackNum, 10) : null,
      }));
      this.track.set({ ...t, ...updated });
      this.toast.success('Track saved');
      await this.router.navigate(['/library/album', t.album_id, 'edit']);
    } catch {
      this.saveError.set('Failed to save track');
    } finally {
      this.saving.set(false);
    }
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
    if (artist.instruments.length) this.pendingInstruments.set([...artist.instruments]);
  }

  addPendingInstrument(inst: string): void {
    if (!inst || this.pendingInstruments().includes(inst)) return;
    this.pendingInstruments.update((i) => [...i, inst]);
  }

  removePendingInstrument(inst: string): void {
    this.pendingInstruments.update((i) => i.filter((x) => x !== inst));
  }

  async addCredit(): Promise<void> {
    const artist = this.pendingCreditArtist();
    const t = this.track();
    if (!artist || !t) return;
    try {
      const credit = await firstValueFrom(this.api.addTrackCredit(t.id, {
        artist_id:    artist.id,
        role:         this.pendingRole,
        instruments:  [...this.pendingInstruments()],
        notes:        this.pendingNotes || null,
        billing_order: this.credits().length,
      }));
      this.credits.update((list) => [...list, credit]);
      this.pendingCreditArtist.set(null);
      this.pendingInstruments.set([]);
      this.pendingNotes = '';
    } catch {
      this.toast.error('Failed to add credit');
    }
  }

  async removeCredit(credit: TrackCredit): Promise<void> {
    const t = this.track();
    if (!t) return;
    await firstValueFrom(this.api.removeTrackCredit(t.id, credit.id));
    this.credits.update((list) => list.filter((c) => c.id !== credit.id));
  }
}
