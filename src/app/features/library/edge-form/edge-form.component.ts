import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { Album, EdgeType } from '../../../core/models/api.models';

const EDGE_TYPES: { value: EdgeType; label: string; description: string; color: string }[] = [
  { value: 'cover',             label: 'Cover',             description: 'One album covers material from another',      color: '#4A9EF5' },
  { value: 'influence',         label: 'Influence',         description: 'Stylistic or creative influence',             color: '#9B59B6' },
  { value: 'sample',            label: 'Sample',            description: 'Contains a sample from another album',         color: '#E67E22' },
  { value: 'collaboration',     label: 'Collaboration',     description: 'Joint project or shared artists',             color: '#1ABC9C' },
  { value: 'other',             label: 'Other',             description: 'Custom relationship',                         color: '#aaa' },
];

@Component({
  selector: 'app-edge-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="form-page">
      <div class="form-page__header">
        <a routerLink="/dag" class="btn btn--ghost">← Back to DAG</a>
        <h2>Add Edge</h2>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="form-card">

        <!-- Edge type selector -->
        <div class="form-group" style="margin-bottom:20px">
          <label>Relationship Type *</label>
          <div class="type-chips">
            @for (et of edgeTypes; track et.value) {
              <button
                type="button"
                class="type-chip"
                [class.type-chip--active]="form.value.type === et.value"
                [style.--chip-color]="et.color"
                (click)="form.controls.type.setValue(et.value)"
              >
                <span class="type-chip__label">{{ et.label }}</span>
                <span class="type-chip__desc">{{ et.description }}</span>
              </button>
            }
          </div>
        </div>

        <!-- Source album -->
        <div class="form-group">
          <label>Source Album *</label>
          <div class="album-search">
            <input type="text" [value]="sourceSearch()" placeholder="Search albums…"
              (input)="searchSource($any($event.target).value)" />
            @if (sourceResults().length) {
              <div class="dropdown">
                @for (a of sourceResults(); track a.id) {
                  <button type="button" class="dropdown__item" (click)="selectSource(a)">
                    {{ a.title }} <span class="dim">{{ a.artists[0]?.name }}</span>
                  </button>
                }
              </div>
            }
            @if (selectedSource()) {
              <div class="selected-album">{{ selectedSource()!.title }}</div>
            }
          </div>
        </div>

        <!-- Target album -->
        <div class="form-group">
          <label>Target Album *</label>
          <div class="album-search">
            <input type="text" [value]="targetSearch()" placeholder="Search albums…"
              (input)="searchTarget($any($event.target).value)" />
            @if (targetResults().length) {
              <div class="dropdown">
                @for (a of targetResults(); track a.id) {
                  <button type="button" class="dropdown__item" (click)="selectTarget(a)">
                    {{ a.title }} <span class="dim">{{ a.artists[0]?.name }}</span>
                  </button>
                }
              </div>
            }
            @if (selectedTarget()) {
              <div class="selected-album">{{ selectedTarget()!.title }}</div>
            }
          </div>
        </div>

        <div class="form-group">
          <label>Label <span class="dim">(optional)</span></label>
          <input type="text" formControlName="label" placeholder='e.g. "samples the intro of"' />
        </div>

        <div class="form-group">
          <label>Notes <span class="dim">(optional)</span></label>
          <textarea formControlName="notes" rows="3" placeholder="Additional context…"></textarea>
        </div>

        @if (error()) { <p class="form-error">{{ error() }}</p> }

        <div class="form-actions">
          <a routerLink="/dag" class="btn btn--ghost">Cancel</a>
          <button type="submit" class="btn btn--primary" [disabled]="!canSubmit() || loading()">
            {{ loading() ? 'Adding…' : 'Add Edge' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .form-page { max-width: 600px; margin: 0 auto; padding: 24px; height: 100%; overflow-y: auto; }
    .form-page__header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; h2 { font-size: 18px; font-weight: 600; } }
    .form-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px; display: flex; flex-direction: column; gap: 16px; }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; }
    textarea { resize: vertical; }
    .dim { color: var(--color-text-muted); font-size: 12px; }

    .type-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .type-chip {
      display: flex; flex-direction: column; align-items: flex-start;
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      border-left: 3px solid var(--chip-color, var(--color-border));
      text-align: left;
      transition: background var(--transition);
      &:hover { background: var(--color-surface-2); }
      &--active { background: var(--color-surface-2); border-color: var(--chip-color); }
    }
    .type-chip__label { font-size: 13px; font-weight: 600; }
    .type-chip__desc { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }

    .album-search { position: relative; }
    .dropdown {
      position: absolute; top: 100%; left: 0; right: 0;
      background: var(--color-surface); border: 1px solid var(--color-border);
      border-radius: var(--radius-sm); z-index: 50; max-height: 200px; overflow-y: auto;
    }
    .dropdown__item { display: block; width: 100%; padding: 8px 12px; text-align: left; font-size: 13px; &:hover { background: var(--color-surface-2); } }
    .selected-album { margin-top: 6px; padding: 6px 10px; background: var(--color-surface-2); border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; }
  `],
})
export class EdgeFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly edgeTypes = EDGE_TYPES;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly sourceSearch = signal('');
  readonly targetSearch = signal('');
  readonly sourceResults = signal<Album[]>([]);
  readonly targetResults = signal<Album[]>([]);
  readonly selectedSource = signal<Album | null>(null);
  readonly selectedTarget = signal<Album | null>(null);

  form = this.fb.group({
    type: ['cover' as EdgeType, Validators.required],
    label: [''],
    notes: [''],
  });

  canSubmit = () => this.selectedSource() && this.selectedTarget() && this.form.valid;

  ngOnInit(): void {
    const sourceId = this.route.snapshot.queryParams['source'];
    const targetId = this.route.snapshot.queryParams['target'];
    if (sourceId) firstValueFrom(this.api.getAlbum(sourceId)).then((a) => this.selectedSource.set(a));
    if (targetId) firstValueFrom(this.api.getAlbum(targetId)).then((a) => this.selectedTarget.set(a));
  }

  async searchSource(q: string): Promise<void> {
    this.sourceSearch.set(q);
    if (!q.trim()) { this.sourceResults.set([]); return; }
    this.sourceResults.set(await firstValueFrom(this.api.getAlbums({ search: q })));
  }

  async searchTarget(q: string): Promise<void> {
    this.targetSearch.set(q);
    if (!q.trim()) { this.targetResults.set([]); return; }
    this.targetResults.set(await firstValueFrom(this.api.getAlbums({ search: q })));
  }

  selectSource(album: Album): void { this.selectedSource.set(album); this.sourceSearch.set(''); this.sourceResults.set([]); }
  selectTarget(album: Album): void { this.selectedTarget.set(album); this.targetSearch.set(''); this.targetResults.set([]); }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.loading.set(true);
    try {
      await firstValueFrom(this.api.createEdge({
        source_album_id: this.selectedSource()!.id,
        target_album_id: this.selectedTarget()!.id,
        type: this.form.value.type as EdgeType,
        label: this.form.value.label || null,
        notes: this.form.value.notes || null,
      }));
      this.toast.success('Edge added');
      await this.router.navigate(['/dag']);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to add edge');
    } finally {
      this.loading.set(false);
    }
  }
}
