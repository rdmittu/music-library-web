import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { Genre } from '../../../core/models/api.models';

interface GenreRow {
  genre: Genre;
  depth: number;
}

function flattenTree(roots: Genre[], depth = 0): GenreRow[] {
  const rows: GenreRow[] = [];
  for (const g of roots) {
    rows.push({ genre: g, depth });
    if (g.children?.length) rows.push(...flattenTree(g.children, depth + 1));
  }
  return rows;
}

@Component({
  selector: 'app-genres',
  standalone: true,
  imports: [RouterLink, FormsModule, NgTemplateOutlet],
  template: `
    <div class="page">
      <div class="page-header">
        <a routerLink="/dag" class="btn btn--ghost">← Back to DAG</a>
        <h2>Genres</h2>
        @if (auth.isContributor()) {
          <button class="btn btn--primary btn--sm" style="margin-left:auto"
            (click)="startAdd(null)">+ Root Genre</button>
        }
      </div>

      <p class="hint">Root genres (no parent) define the DAG lanes. Drag a genre onto another to nest it.</p>

      @if (loading()) {
        <div class="empty-state">Loading…</div>
      } @else if (rows().length === 0 && !isAdding()) {
        <div class="empty-state">No genres yet.</div>
      }

      <div class="genre-tree">
        <!-- Drop zone: make root -->
        <div class="drop-root"
          [class.drop-root--active]="dragOverRoot()"
          (dragover)="onDragOverRoot($event)"
          (dragleave)="dragOverRoot.set(false)"
          (drop)="onDropRoot($event)">
          ↑ Drop here to make root genre
        </div>

        <!-- Add-root form -->
        @if (isAdding() && addingParentId() === null) {
          <div class="genre-add-form">
            <ng-container *ngTemplateOutlet="addForm" />
          </div>
        }

        @for (row of rows(); track row.genre.id) {
          <div class="genre-row" [style.padding-left.px]="row.depth * 24 + 8"
            [class.genre-row--dragging]="draggingId() === row.genre.id">

            @if (editingId() === row.genre.id) {
              <!-- Inline edit form -->
              <div class="genre-edit">
                <input [(ngModel)]="editName" [ngModelOptions]="{standalone:true}" placeholder="Name" class="edit-name" />
                <input type="color" [(ngModel)]="editColor" [ngModelOptions]="{standalone:true}" class="color-pick" />
                <select [(ngModel)]="editParentId" [ngModelOptions]="{standalone:true}" class="parent-select">
                  <option [ngValue]="null">— Root (no parent) —</option>
                  @for (opt of parentOptions(row.genre.id); track opt.id) {
                    <option [value]="opt.id">{{ opt.label }}</option>
                  }
                </select>
                <div class="edit-actions">
                  <button class="btn btn--ghost btn--sm" (click)="cancelEdit()">Cancel</button>
                  <button class="btn btn--primary btn--sm" [disabled]="saving()" (click)="saveEdit(row.genre)">
                    {{ saving() ? '…' : 'Save' }}
                  </button>
                </div>
              </div>
            } @else {
              <!-- Display row -->
              <div class="genre-display"
                [class.genre-display--drop-target]="dragOverId() === row.genre.id"
                [class.genre-display--invalid]="isDragInvalid(row.genre.id)"
                draggable="true"
                (dragstart)="onDragStart($event, row.genre)"
                (dragend)="onDragEnd()"
                (dragover)="onDragOver($event, row.genre.id)"
                (dragleave)="onDragLeave(row.genre.id)"
                (drop)="onDrop($event, row.genre)">
                <span class="drag-handle">⠿</span>
                <span class="color-dot" [style.background]="row.genre.color_hex"></span>
                <span class="genre-name">{{ row.genre.name }}</span>
                @if (!row.genre.parent_id) {
                  <span class="lane-badge">lane</span>
                }
                <div class="genre-actions">
                  @if (auth.isContributor()) {
                    <button class="btn btn--ghost btn--xs" (click)="startAdd(row.genre.id); $event.stopPropagation()">+ Sub</button>
                    <button class="btn btn--ghost btn--xs" (click)="startEdit(row.genre); $event.stopPropagation()">Edit</button>
                  }
                  @if (auth.isAdmin()) {
                    <button class="btn btn--danger btn--xs"
                      [disabled]="deleting() === row.genre.id"
                      (click)="deleteGenre(row.genre); $event.stopPropagation()">
                      {{ deleting() === row.genre.id ? '…' : 'Delete' }}
                    </button>
                  }
                </div>
              </div>
            }

            <!-- Add-child form (shown right after parent) -->
            @if (isAdding() && addingParentId() === row.genre.id) {
              <div class="genre-add-form" [style.margin-left.px]="24">
                <ng-container *ngTemplateOutlet="addForm" />
              </div>
            }
          </div>
        }
      </div>
    </div>

    <ng-template #addForm>
      <div class="genre-edit">
        <input [(ngModel)]="newName" [ngModelOptions]="{standalone:true}" placeholder="Genre name" class="edit-name" />
        <input type="color" [(ngModel)]="newColor" [ngModelOptions]="{standalone:true}" class="color-pick" />
        <div class="edit-actions">
          <button class="btn btn--ghost btn--sm" (click)="cancelAdd()">Cancel</button>
          <button class="btn btn--primary btn--sm" [disabled]="saving() || !newName.trim()" (click)="saveAdd()">
            {{ saving() ? '…' : 'Add' }}
          </button>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    .page { max-width: 700px; margin: 0 auto; padding: 24px; height: 100%; overflow-y: auto; }
    .page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; h2 { font-size: 18px; font-weight: 600; } }
    .hint { font-size: 12px; color: var(--color-text-muted); margin-bottom: 16px; }
    .empty-state { padding: 48px 0; text-align: center; color: var(--color-text-muted); font-size: 14px; }

    .drop-root {
      font-size: 11px; color: var(--color-text-muted);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-sm);
      padding: 6px 12px;
      margin-bottom: 6px;
      text-align: center;
      transition: all 150ms;
      &--active {
        border-color: var(--color-accent);
        background: rgba(124,106,247,.08);
        color: var(--color-accent);
      }
    }

    .genre-tree { display: flex; flex-direction: column; gap: 2px; }
    .genre-row { border-radius: var(--radius-sm); &--dragging { opacity: 0.4; } }

    .genre-display {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      cursor: grab;
      user-select: none;
      transition: border-color 100ms, background 100ms;
      &:hover { background: var(--color-surface-2); }
      &--drop-target {
        border-color: var(--color-accent);
        background: rgba(124,106,247,.1);
      }
      &--invalid { cursor: not-allowed; opacity: 0.5; }
    }

    .drag-handle { color: var(--color-text-muted); font-size: 14px; cursor: grab; flex-shrink: 0; }
    .color-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 1px rgba(255,255,255,.15); }
    .genre-name { font-size: 13px; font-weight: 500; flex: 1; }
    .lane-badge {
      font-size: 10px; padding: 1px 6px; border-radius: 10px;
      background: rgba(124,106,247,.15); color: var(--color-accent);
      border: 1px solid var(--color-accent); font-weight: 600;
    }
    .genre-actions { display: flex; gap: 4px; margin-left: auto; }

    .genre-edit {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      padding: 10px 12px;
      background: var(--color-surface);
      border: 1px solid var(--color-accent);
      border-radius: var(--radius-sm);
      margin: 2px 0;
    }
    .edit-name { flex: 1; min-width: 160px; }
    .color-pick { width: 40px; height: 32px; padding: 2px 4px; border-radius: var(--radius-sm); cursor: pointer; border: 1px solid var(--color-border); }
    .parent-select { flex: 1; min-width: 160px; }
    .edit-actions { display: flex; gap: 6px; }
    .genre-add-form { margin-top: 2px; margin-bottom: 4px; }

    .btn--xs { padding: 3px 8px; font-size: 11px; }
    .btn--sm { padding: 5px 10px; font-size: 12px; }
    .btn--danger { border-color: var(--color-danger); color: var(--color-danger); &:hover { background: var(--color-danger); color: #fff; } }
  `],
})
export class GenresComponent implements OnInit {
  private readonly api   = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly auth          = inject(AuthService);

  readonly loading  = signal(true);
  readonly saving   = signal(false);
  readonly deleting = signal<string | null>(null);

  private readonly tree = signal<Genre[]>([]);
  private readonly flat = signal<Genre[]>([]);

  readonly rows = computed(() => flattenTree(this.tree()));

  // Edit state
  readonly editingId  = signal<string | null>(null);
  editName    = '';
  editColor   = '#888888';
  editParentId: string | null = null;

  // Add state
  readonly isAdding       = signal(false);
  readonly addingParentId = signal<string | null>(null);
  newName  = '';
  newColor = '#888888';

  // Drag state
  readonly draggingId  = signal<string | null>(null);
  readonly dragOverId  = signal<string | null>(null);
  readonly dragOverRoot = signal(false);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [tree, flat] = await Promise.all([
        firstValueFrom(this.api.getGenreTree()),
        firstValueFrom(this.api.getGenres()),
      ]);
      this.tree.set(tree);
      this.flat.set(flat);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Drag helpers ────────────────────────────────────────────────────────────

  /** Returns true if dragging genre cannot be dropped onto targetId (would create cycle or drop on self). */
  isDragInvalid(targetId: string): boolean {
    const dragId = this.draggingId();
    if (!dragId) return false;
    if (dragId === targetId) return true;
    // Invalid if target is a descendant of the dragged genre
    return this.isDescendant(targetId, dragId);
  }

  private isDescendant(candidateId: string, ancestorId: string): boolean {
    let current = candidateId;
    const visited = new Set<string>();
    while (true) {
      const parent = this.flat().find((g) => g.id === current)?.parent_id;
      if (!parent) return false;
      if (visited.has(parent)) return false; // cycle guard
      if (parent === ancestorId) return true;
      visited.add(current);
      current = parent;
    }
  }

  onDragStart(event: DragEvent, genre: Genre): void {
    this.draggingId.set(genre.id);
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', genre.id);
  }

  onDragEnd(): void {
    this.draggingId.set(null);
    this.dragOverId.set(null);
    this.dragOverRoot.set(false);
  }

  onDragOver(event: DragEvent, targetId: string): void {
    if (this.isDragInvalid(targetId)) return; // don't allow drop
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    this.dragOverId.set(targetId);
    this.dragOverRoot.set(false);
  }

  onDragLeave(targetId: string): void {
    if (this.dragOverId() === targetId) this.dragOverId.set(null);
  }

  onDragOverRoot(event: DragEvent): void {
    const dragId = this.draggingId();
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    this.dragOverRoot.set(true);
    this.dragOverId.set(null);
  }

  async onDrop(event: DragEvent, target: Genre): Promise<void> {
    event.preventDefault();
    const dragId = this.draggingId();
    this.onDragEnd();
    if (!dragId || dragId === target.id || this.isDragInvalid(target.id)) return;

    const dragged = this.flat().find((g) => g.id === dragId);
    if (!dragged) return;
    // Already a child of this target — no-op
    if (dragged.parent_id === target.id) return;

    await this.reparent(dragged, target.id);
  }

  async onDropRoot(event: DragEvent): Promise<void> {
    event.preventDefault();
    const dragId = this.draggingId();
    this.onDragEnd();
    if (!dragId) return;

    const dragged = this.flat().find((g) => g.id === dragId);
    if (!dragged || dragged.parent_id === null) return; // already root

    await this.reparent(dragged, null);
  }

  private async reparent(genre: Genre, newParentId: string | null): Promise<void> {
    try {
      await firstValueFrom(this.api.updateGenre(genre.id, {
        name:      genre.name,
        color_hex: genre.color_hex,
        parent_id: newParentId,
      }));
      await this.load();
    } catch {
      this.toast.error('Failed to move genre');
    }
  }

  // ── Parent dropdown ─────────────────────────────────────────────────────────

  parentOptions(excludeId: string): { id: string; label: string }[] {
    const descendants = new Set<string>();
    const collect = (id: string) => {
      for (const g of this.flat()) {
        if (g.parent_id === id) { descendants.add(g.id); collect(g.id); }
      }
    };
    descendants.add(excludeId);
    collect(excludeId);

    return this.flat()
      .filter((g) => !descendants.has(g.id))
      .map((g) => ({
        id: g.id,
        label: g.parent_id
          ? `${this.flat().find((p) => p.id === g.parent_id)?.name ?? ''} › ${g.name}`
          : g.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // ── Edit ────────────────────────────────────────────────────────────────────

  startEdit(genre: Genre): void {
    this.isAdding.set(false);
    this.editingId.set(genre.id);
    this.editName     = genre.name;
    this.editColor    = genre.color_hex;
    this.editParentId = genre.parent_id;
  }

  cancelEdit(): void { this.editingId.set(null); }

  async saveEdit(genre: Genre): Promise<void> {
    if (!this.editName.trim()) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.updateGenre(genre.id, {
        name:      this.editName.trim(),
        color_hex: this.editColor,
        parent_id: this.editParentId ?? null,
      }));
      this.editingId.set(null);
      this.toast.success('Genre updated');
      await this.load();
    } catch {
      this.toast.error('Failed to update genre');
    } finally {
      this.saving.set(false);
    }
  }

  // ── Add ─────────────────────────────────────────────────────────────────────

  startAdd(parentId: string | null): void {
    this.editingId.set(null);
    this.addingParentId.set(parentId);
    this.isAdding.set(true);
    this.newName  = '';
    this.newColor = '#888888';
  }

  cancelAdd(): void { this.isAdding.set(false); }

  async saveAdd(): Promise<void> {
    if (!this.newName.trim()) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.createGenre({
        name:      this.newName.trim(),
        color_hex: this.newColor,
        parent_id: this.addingParentId() ?? null,
      }));
      this.isAdding.set(false);
      this.toast.success('Genre created');
      await this.load();
    } catch {
      this.toast.error('Failed to create genre');
    } finally {
      this.saving.set(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async deleteGenre(genre: Genre): Promise<void> {
    const msg = genre.parent_id
      ? `Delete "${genre.name}"? Albums with this genre will be reassigned to its parent, and sub-genres will be promoted up.`
      : `Delete "${genre.name}"? Albums with this genre will lose it entirely, and sub-genres will become root lanes.`;
    if (!confirm(msg)) return;
    this.deleting.set(genre.id);
    try {
      await firstValueFrom(this.api.deleteGenre(genre.id));
      this.toast.success(`"${genre.name}" deleted`);
      await this.load();
    } catch {
      this.toast.error('Failed to delete genre');
    } finally {
      this.deleting.set(null);
    }
  }
}
