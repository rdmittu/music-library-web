import { Component, inject, signal, OnInit, computed } from '@angular/core';

import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { Artist, ArtistMember, COMMON_INSTRUMENTS } from '../../../core/models/api.models';

@Component({
  selector: 'app-artist-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FormsModule],
  template: `
    <div class="form-page">
      <div class="form-page__header">
        <a routerLink="/library/artists" class="btn btn--ghost">← Back to Artists</a>
        <h2>{{ isEdit() ? 'Edit Artist' : 'Add Artist' }}</h2>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="form-card">

        <!-- Type toggle -->
        <div class="form-group">
          <label>Type</label>
          <div class="type-toggle">
            <button type="button"
              class="type-toggle__btn"
              [class.type-toggle__btn--active]="form.value.artist_type === 'person'"
              (click)="form.controls.artist_type.setValue('person')">
              👤 Person
            </button>
            <button type="button"
              class="type-toggle__btn"
              [class.type-toggle__btn--active]="form.value.artist_type === 'group'"
              (click)="form.controls.artist_type.setValue('group')">
              👥 Group / Band / Ensemble
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>Name *</label>
          <input type="text" formControlName="name"
            [placeholder]="form.value.artist_type === 'group' ? 'Band or ensemble name' : 'Artist name'" />
        </div>

        <!-- Instruments (persons only) -->
        @if (form.value.artist_type === 'person') {
          <div class="form-group">
            <label>Instruments / Roles</label>
            <div class="tag-list">
              @for (inst of selectedInstruments(); track inst) {
                <div class="tag">
                  {{ inst }}
                  <button type="button" class="tag__remove" (click)="removeInstrument(inst)">✕</button>
                </div>
              }
            </div>
            <div class="instrument-row">
              <select (change)="addInstrument($any($event.target).value); $any($event.target).value = ''">
                <option value="">Add instrument / role…</option>
                @for (i of availableInstruments(); track i) {
                  <option [value]="i">{{ i }}</option>
                }
              </select>
              <input type="text" class="instrument-custom" #customInst
                placeholder="Or type custom…"
                (keydown.enter)="$event.preventDefault(); addInstrument(customInst.value); customInst.value = ''" />
            </div>
          </div>
        }

        <div class="form-group">
          <label>Bio</label>
          <textarea formControlName="bio" rows="3"
            [placeholder]="form.value.artist_type === 'group' ? 'Group history and description…' : 'Short biography…'">
          </textarea>
        </div>

        <div class="form-group">
          <label>Image URL</label>
          <input type="url" formControlName="image_url" placeholder="https://…" />
        </div>

        @if (error()) { <p class="form-error">{{ error() }}</p> }

        <div class="form-actions">
          <a routerLink="/library/artists" class="btn btn--ghost">Cancel</a>
          <button type="submit" class="btn btn--primary" [disabled]="form.invalid || loading()">
            {{ loading() ? 'Saving…' : (isEdit() ? 'Save Changes' : (form.value.artist_type === 'group' ? 'Add Group' : 'Add Artist')) }}
          </button>
        </div>
      </form>

      <!-- Members section (groups only) -->
      @if (form.value.artist_type === 'group') {
        <div class="members-card">
          <div class="members-card__header">
            <h3>Members</h3>
          </div>

          <div class="member-list">
            @for (member of (isEdit() ? members() : pendingMembers()); track member.id) {
              @if (isEdit() && editingMemberId() === member.id) {
                <div class="member-edit">
                  <div class="member-edit__name">{{ member.name }}</div>
                  <div class="member-edit__fields">
                    <input [(ngModel)]="editRoleLabel" [ngModelOptions]="{standalone:true}"
                      placeholder="Role in group (e.g. lead vocalist)" />
                    <input [(ngModel)]="editYearsStart" [ngModelOptions]="{standalone:true}"
                      placeholder="Active from (year)" />
                    <input [(ngModel)]="editYearsEnd" [ngModelOptions]="{standalone:true}"
                      placeholder="Until (year, blank = present)" />
                  </div>
                  <div>
                    <div class="tag-list">
                      @for (inst of editInstruments(); track inst) {
                        <div class="tag">{{ inst }}
                          <button type="button" class="tag__remove" (click)="removeEditInstrument(inst)">✕</button>
                        </div>
                      }
                    </div>
                    <select (change)="addEditInstrument($any($event.target).value); $any($event.target).value = ''">
                      <option value="">Add instrument…</option>
                      @for (i of availableInstruments(); track i) {
                        <option [value]="i">{{ i }}</option>
                      }
                    </select>
                  </div>
                  <div class="member-edit__actions">
                    <button type="button" class="btn btn--ghost btn--sm" (click)="cancelEditMember()">Cancel</button>
                    <button type="button" class="btn btn--primary btn--sm" (click)="saveEditMember(member)">Save</button>
                  </div>
                </div>
              } @else {
                <div class="member-row">
                  <div class="member-row__info">
                    <span class="member-row__name">{{ member.name }}</span>
                    @if (member.role_label) {
                      <span class="member-row__role">{{ member.role_label }}</span>
                    }
                    @if (member.instruments.length) {
                      <span class="member-row__instruments dim">{{ member.instruments.join(', ') }}</span>
                    }
                    @if (member.years_start) {
                      <span class="dim">
                        {{ member.years_start }}{{ member.years_end ? '–' + member.years_end : '–present' }}
                      </span>
                    }
                  </div>
                  <div class="member-row__actions">
                    @if (isEdit()) {
                      <button class="btn btn--ghost btn--sm" (click)="startEditMember(member)">Edit</button>
                    }
                    <button class="btn btn--ghost btn--sm" (click)="removeMember(member.id, member.member_id)">Remove</button>
                  </div>
                </div>
              }
            } @empty {
              <p class="dim" style="padding: 12px 0">No members added yet</p>
            }
          </div>

          <!-- Add member form -->
          <div class="add-member">
            <h4>Add Member</h4>
            <div class="add-member__search">
              <input type="text" placeholder="Search artists by name…"
                [value]="memberSearch()"
                (input)="searchMembers($any($event.target).value)" />
              @if (memberResults().length || (memberSearch().trim() && !memberResults().some(a => a.name.toLowerCase() === memberSearch().trim().toLowerCase()))) {
                <div class="dropdown">
                  @for (a of memberResults(); track a.id) {
                    <button type="button" class="dropdown__item" (click)="selectMemberArtist(a)">
                      {{ a.name }}
                      @if (a.instruments.length) { <span class="dim"> · {{ a.instruments.slice(0,2).join(', ') }}</span> }
                    </button>
                  }
                  @if (memberSearch().trim() && !memberResults().some(a => a.name.toLowerCase() === memberSearch().trim().toLowerCase())) {
                    <button type="button" class="dropdown__item dropdown__item--create" (click)="createAndSelectMember(memberSearch().trim())">
                      + Create "{{ memberSearch().trim() }}"
                    </button>
                  }
                </div>
              }
            </div>
            @if (pendingMember()) {
              <div class="selected-member">
                <span>Selected: <strong>{{ pendingMember()!.name }}</strong></span>
                <button type="button" class="tag__remove" (click)="pendingMember.set(null)">✕</button>
              </div>
            } @else {
              <p class="add-member__hint">Search for an artist above and click their name to select them.</p>
            }
            <div class="add-member__fields">
              <input type="text" [(ngModel)]="pendingRoleLabel" [ngModelOptions]="{standalone:true}"
                placeholder="Role in group (e.g. lead vocalist)" />
              <input type="text" [(ngModel)]="pendingYearsStart" [ngModelOptions]="{standalone:true}"
                placeholder="Active from (year)" />
              <input type="text" [(ngModel)]="pendingYearsEnd" [ngModelOptions]="{standalone:true}"
                placeholder="Until (year, blank = present)" />
            </div>
            <button type="button" class="btn btn--primary btn--sm" (click)="addMember()">
              Add Member
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .form-page { max-width: 640px; margin: 0 auto; padding: 24px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; }
    .form-page__header { display: flex; align-items: center; gap: 16px; h2 { font-size: 18px; font-weight: 600; } }
    .form-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px; display: flex; flex-direction: column; gap: 16px; }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; }
    textarea { resize: vertical; min-height: 80px; }
    .dim { color: var(--color-text-muted); font-size: 12px; }

    .type-toggle { display: flex; gap: 8px; }
    .type-toggle__btn {
      flex: 1; padding: 10px; border: 1px solid var(--color-border); border-radius: var(--radius-md);
      font-size: 13px; transition: all var(--transition);
      &:hover { background: var(--color-surface-2); }
      &--active { background: rgba(124,106,247,.15); border-color: var(--color-accent); color: var(--color-accent); font-weight: 600; }
    }

    .tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .tag { display: flex; align-items: center; gap: 6px; background: var(--color-surface-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 4px 8px; font-size: 12px; }
    .tag__remove { color: var(--color-text-muted); font-size: 10px; &:hover { color: var(--color-danger); } }

    .instrument-row { display: flex; gap: 8px; }
    .instrument-custom { flex: 1; }

    .members-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .members-card__header { display: flex; align-items: center; justify-content: space-between; h3 { font-size: 15px; font-weight: 600; } }
    .member-list { display: flex; flex-direction: column; gap: 4px; }
    .member-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--color-surface-2); border-radius: var(--radius-sm); }
    .member-row__info { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; flex: 1; }
    .member-row__name { font-weight: 600; font-size: 13px; }
    .member-row__role { font-size: 12px; color: var(--color-accent); }
    .member-row__instruments { font-size: 11px; }
    .member-row__actions { display: flex; gap: 6px; flex-shrink: 0; }

    .member-edit { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--color-surface-2); border: 1px solid var(--color-accent); border-radius: var(--radius-sm); }
    .member-edit__name { font-weight: 600; font-size: 13px; }
    .member-edit__fields { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; }
    .member-edit__actions { display: flex; justify-content: flex-end; gap: 8px; }

    .add-member { border-top: 1px solid var(--color-border); padding-top: 16px; display: flex; flex-direction: column; gap: 10px; h4 { font-size: 13px; font-weight: 600; color: var(--color-text-muted); } }
    .add-member__search { position: relative; }
    .add-member__fields { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; }
    .dropdown { position: absolute; top: 100%; left: 0; right: 0; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); z-index: 50; max-height: 180px; overflow-y: auto; }
    .dropdown__item { display: block; width: 100%; padding: 8px 12px; text-align: left; font-size: 13px; &:hover { background: var(--color-surface-2); } }
    .dropdown__item--create { color: var(--color-accent); font-style: italic; }
    .selected-album { margin-top: 6px; padding: 6px 10px; background: rgba(124,106,247,.1); border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; color: var(--color-accent); }
    .btn--sm { padding: 5px 10px; font-size: 12px; }
  `],
})
export class ArtistFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = signal(false);
  readonly members = signal<ArtistMember[]>([]);
  readonly pendingMembers = signal<ArtistMember[]>([]); // queued locally for new groups
  readonly memberSearch = signal('');
  readonly memberResults = signal<Artist[]>([]);
  readonly pendingMember = signal<Artist | null>(null);

  pendingRoleLabel = '';
  pendingYearsStart = '';
  pendingYearsEnd = '';

  // Inline member editing
  readonly editingMemberId = signal<string | null>(null);
  editRoleLabel  = '';
  editYearsStart = '';
  editYearsEnd   = '';
  readonly editInstruments = signal<string[]>([]);

  private editId: string | null = null;
  private _instruments = signal<string[]>([]);
  readonly selectedInstruments = this._instruments.asReadonly();
  readonly availableInstruments = computed(() =>
    COMMON_INSTRUMENTS.filter((i) => !this._instruments().includes(i))
  );

  form = this.fb.group({
    name:        ['', Validators.required],
    artist_type: ['person'],
    bio:         [''],
    image_url:   [''],
  });

  async ngOnInit(): Promise<void> {
    this.editId = this.route.snapshot.params['id'] ?? null;
    if (this.editId) {
      this.isEdit.set(true);
      const artist = await firstValueFrom(this.api.getArtists());
      const found = artist.find((a) => a.id === this.editId);
      if (found) {
        this.form.patchValue({
          name: found.name,
          artist_type: found.artist_type,
          bio: found.bio ?? '',
          image_url: found.image_url ?? '',
        });
        this._instruments.set([...found.instruments]);
      }
      const membersData = await firstValueFrom(this.api.getMembers(this.editId));
      this.members.set(membersData);
    }
  }

  addInstrument(value: string): void {
    const v = value.trim();
    if (!v || this._instruments().includes(v)) return;
    this._instruments.update((i) => [...i, v]);
  }

  removeInstrument(inst: string): void {
    this._instruments.update((i) => i.filter((x) => x !== inst));
  }

  async searchMembers(q: string): Promise<void> {
    this.memberSearch.set(q);
    if (!q.trim()) { this.memberResults.set([]); return; }
    const results = await firstValueFrom(this.api.getArtists(q));
    this.memberResults.set(results.filter((a) =>
      a.id !== this.editId &&
      !this.members().some((m) => m.member_id === a.id) &&
      !this.pendingMembers().some((m) => m.member_id === a.id)
    ));
  }

  selectMemberArtist(artist: Artist): void {
    this.pendingMember.set(artist);
    this.memberSearch.set('');
    this.memberResults.set([]);
  }

  async createAndSelectMember(name: string): Promise<void> {
    try {
      const created = await firstValueFrom(this.api.createArtist({ name, artist_type: 'person', instruments: [], bio: null, image_url: null }));
      this.selectMemberArtist(created);
      this.toast.success(`Artist "${name}" created`);
    } catch {
      this.toast.error(`Failed to create artist "${name}"`);
    }
  }

  async addMember(): Promise<void> {
    const pending = this.pendingMember();
    if (!pending) return;

    if (!this.editId) {
      // New group — queue locally, will be submitted after group is created
      this.pendingMembers.update((m) => [...m, {
        id:          pending.id, // temp local key
        member_id:   pending.id,
        name:        pending.name,
        artist_type: pending.artist_type,
        role_label:  this.pendingRoleLabel || null,
        instruments: [],
        years_start: this.pendingYearsStart ? parseInt(this.pendingYearsStart, 10) : null,
        years_end:   this.pendingYearsEnd   ? parseInt(this.pendingYearsEnd,   10) : null,
      }]);
      this.pendingMember.set(null);
      this.pendingRoleLabel = '';
      this.pendingYearsStart = '';
      this.pendingYearsEnd = '';
      return;
    }

    try {
      const payload = {
        member_id:   pending.id,
        role_label:  this.pendingRoleLabel || null,
        instruments: pending.instruments ?? [],
        years_start: this.pendingYearsStart ? parseInt(this.pendingYearsStart, 10) : null,
        years_end:   this.pendingYearsEnd   ? parseInt(this.pendingYearsEnd,   10) : null,
      };
      const member = await firstValueFrom(this.api.addMember(this.editId, payload));
      this.members.update((m) => [...m, { ...member, name: pending.name, artist_type: pending.artist_type }]);
      this.pendingMember.set(null);
      this.pendingRoleLabel = '';
      this.pendingYearsStart = '';
      this.pendingYearsEnd = '';
      this.toast.success(`${pending.name} added to group`);
    } catch (err: unknown) {
      console.error('addMember error:', err);
      const msg = (err as { error?: { error?: string } })?.error?.error;
      this.toast.error(msg ? `Failed: ${msg}` : 'Failed to add member');
    }
  }

  startEditMember(member: ArtistMember): void {
    this.editingMemberId.set(member.id);
    this.editRoleLabel  = member.role_label ?? '';
    this.editYearsStart = member.years_start?.toString() ?? '';
    this.editYearsEnd   = member.years_end?.toString()   ?? '';
    this.editInstruments.set([...member.instruments]);
  }

  cancelEditMember(): void {
    this.editingMemberId.set(null);
  }

  addEditInstrument(v: string): void {
    const t = v.trim();
    if (!t || this.editInstruments().includes(t)) return;
    this.editInstruments.update((i) => [...i, t]);
  }

  removeEditInstrument(inst: string): void {
    this.editInstruments.update((i) => i.filter((x) => x !== inst));
  }

  async saveEditMember(member: ArtistMember): Promise<void> {
    if (!this.editId) return;
    try {
      const updated = await firstValueFrom(this.api.updateMember(this.editId, member.member_id, {
        role_label:  this.editRoleLabel  || null,
        instruments: this.editInstruments(),
        years_start: this.editYearsStart ? parseInt(this.editYearsStart) : null,
        years_end:   this.editYearsEnd   ? parseInt(this.editYearsEnd)   : null,
      }));
      this.members.update((m) => m.map((x) =>
        x.id === member.id ? { ...updated, name: member.name, artist_type: member.artist_type } : x
      ));
      this.editingMemberId.set(null);
      this.toast.success('Member updated');
    } catch {
      this.toast.error('Failed to update member');
    }
  }

  async removeMember(membershipId: string, memberId: string): Promise<void> {
    if (!this.editId) {
      this.pendingMembers.update((m) => m.filter((x) => x.id !== membershipId));
      return;
    }
    await firstValueFrom(this.api.removeMember(this.editId, memberId));
    this.members.update((m) => m.filter((x) => x.id !== membershipId));
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const data = {
      name: this.form.value.name!,
      artist_type: this.form.value.artist_type as 'person' | 'group',
      instruments: this._instruments(),
      bio: this.form.value.bio || null,
      image_url: this.form.value.image_url || null,
    };
    try {
      if (this.editId) {
        await firstValueFrom(this.api.updateArtist(this.editId, data));
        this.toast.success('Artist updated');
      } else {
        const created = await firstValueFrom(this.api.createArtist(data));
        for (const pm of this.pendingMembers()) {
          await firstValueFrom(this.api.addMember(created.id, {
            member_id:   pm.member_id,
            role_label:  pm.role_label,
            instruments: pm.instruments,
            years_start: pm.years_start,
            years_end:   pm.years_end,
          }));
        }
        this.toast.success(`${data.artist_type === 'group' ? 'Group' : 'Artist'} added`);
      }
      await this.router.navigate(['/library/artists']);
    } catch {
      this.error.set('Failed to save');
    } finally {
      this.loading.set(false);
    }
  }
}
