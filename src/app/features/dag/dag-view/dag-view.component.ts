import {
  Component, ElementRef, ViewChild, AfterViewInit, OnDestroy,
  inject, signal, computed, NgZone, effect, HostListener,
} from '@angular/core';
import * as d3 from 'd3';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { DagStateService } from '../../../core/services/dag-state.service';
import { DagLayout, DagEdge, DagNode } from '../../../core/models/api.models';
import { AlbumDetailPanelComponent } from '../album-detail-panel/album-detail-panel.component';

// ── Edge styling ─────────────────────────────────────────────────────────────

const EDGE_COLORS: Record<string, string> = {
  artist_continuity: '#888888',
  cover:             '#4A9EF5',
  influence:         '#9B59B6',
  sample:            '#E67E22',
  collaboration:     '#1ABC9C',
  other:             '#aaaaaa',
};

const EDGE_DASH: Record<string, string> = {
  artist_continuity: 'none',
  cover:             '6,3',
  influence:         '2,4',
  sample:            '8,3,2,3',
  collaboration:     'none',
  other:             '4,4',
};

// ── Path helpers (module-level for speed) ────────────────────────────────────

// Path formats from dagLayout: "M x,y C cx1,cy1 cx2,cy2 x2,y2" or "M x,y L x2,y2"
const RE_BEZIER = /^M ([-\d.]+),([-\d.]+) C ([-\d.]+),([-\d.]+) ([-\d.]+),([-\d.]+) ([-\d.]+),([-\d.]+)$/;
const RE_LINE   = /^M ([-\d.]+),([-\d.]+) L ([-\d.]+),([-\d.]+)$/;

// Returns the endpoint and the incoming direction vector (in world space)
function getArrowEnd(d: string): { x: number; y: number; dx: number; dy: number } | null {
  let m = d.match(RE_BEZIER);
  if (m) {
    const [cx2, cy2, ex, ey] = [+m[5], +m[6], +m[7], +m[8]];
    return { x: ex, y: ey, dx: ex - cx2, dy: ey - cy2 };
  }
  m = d.match(RE_LINE);
  if (m) {
    const [x1, y1, x2, y2] = [+m[1], +m[2], +m[3], +m[4]];
    return { x: x2, y: y2, dx: x2 - x1, dy: y2 - y1 };
  }
  return null;
}

function getPathMid(d: string): { x: number; y: number } | null {
  let m = d.match(RE_BEZIER);
  if (m) {
    const [x1, y1, cx1, cy1, cx2, cy2, x2, y2] =
      [+m[1], +m[2], +m[3], +m[4], +m[5], +m[6], +m[7], +m[8]];
    const t = 0.5, u = 0.5;
    return {
      x: u*u*u*x1 + 3*u*u*t*cx1 + 3*u*t*t*cx2 + t*t*t*x2,
      y: u*u*u*y1 + 3*u*u*t*cy1 + 3*u*t*t*cy2 + t*t*t*y2,
    };
  }
  m = d.match(RE_LINE);
  if (m) return { x: (+m[1] + +m[3]) / 2, y: (+m[2] + +m[4]) / 2 };
  return null;
}

// Draw arrowhead at screen coordinates sx,sy pointing in direction given by angle.
// Must be called with an identity (or dpr-only) transform so the shape isn't distorted.
function drawArrowhead(
  ctx: CanvasRenderingContext2D, sx: number, sy: number, angle: number
): void {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-9, -3.5);
  ctx.lineTo(-9,  3.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function parseDash(s: string): number[] {
  return s === 'none' ? [] : s.split(',').map(Number);
}

// ── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-dag-view',
  standalone: true,
  imports: [RouterLink, AlbumDetailPanelComponent],
  template: `
    <div #containerEl class="dag-container">

      <!-- Toolbar -->
      <div class="dag-toolbar">
        <span class="dag-toolbar__title">Music Library</span>
        <div class="dag-toolbar__actions">
          <button class="btn btn--ghost btn--sm" (click)="resetZoom()">Reset Zoom</button>
          <a routerLink="/library/album/new" class="btn btn--ghost btn--sm">+ Album</a>
          <a routerLink="/library/artists" class="btn btn--ghost btn--sm">Artists</a>
          <a routerLink="/library/genres" class="btn btn--ghost btn--sm">Genres</a>
          <a routerLink="/library/files" class="btn btn--ghost btn--sm">Files</a>
          @if (auth.isContributor()) {
            <a routerLink="/library/ingest" class="btn btn--ghost btn--sm ingest-btn">
              Ingest
              @if (pendingIngestCount() > 0) {
                <span class="ingest-badge">{{ pendingIngestCount() }}</span>
              }
            </a>
          }
          <button class="btn btn--ghost btn--sm" (click)="reload()">↺ Refresh</button>
        </div>
        <div class="search-wrap">
          <input class="search-input" type="search" placeholder="Search albums…"
            [value]="searchQuery()"
            (input)="onSearchInput($any($event.target).value)" />
          @if (searchQuery()) {
            <button class="search-clear" (click)="onSearchInput('')">×</button>
          }
        </div>
      </div>

      <!-- Edge legend -->
      <div class="dag-legend">
        @for (entry of legendEntries; track entry.type) {
          <div class="legend-item">
            <svg width="32" height="10">
              <line x1="0" y1="5" x2="32" y2="5"
                [attr.stroke]="entry.color"
                [attr.stroke-dasharray]="entry.dash === 'none' ? '' : entry.dash"
                stroke-width="2" />
            </svg>
            <span>{{ entry.label }}</span>
          </div>
        }
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="dag-loading">Loading graph…</div>
      }

      <!-- Empty state -->
      @if (!loading() && (layout()?.nodes?.length ?? 0) === 0) {
        <div class="dag-empty">
          <p>No albums yet.</p>
          <a routerLink="/library/album/new" class="btn btn--primary">Add your first album</a>
        </div>
      }

      <!-- SVG: lanes + labels + time axis only -->
      <svg #svgEl class="dag-svg">
        <g #mainGroup>
          <g #laneLayer></g>
        </g>
        <!-- Labels outside zoom group so we control position + font-size imperatively -->
        <g #labelLayer>
          @if (layout(); as l) {
            @for (lane of l.genres; track lane.id) {
              <text class="lane-label" [attr.fill]="lane.color_hex"
                dominant-baseline="middle">{{ lane.name }}</text>
            }
          }
        </g>
        <!-- Time axis sits at vertical center, outside the zoom group so it stays fixed -->
        <g #timeAxisEl class="time-axis"></g>
        <!-- Hairline across full width -->
        <line #timeAxisLine class="time-axis-line" x1="0" x2="100%" y1="0" y2="0"></line>
      </svg>

      <!-- Canvas: edges (drawn imperatively, no SVG path overhead) -->
      <canvas #edgeCanvas class="dag-edge-canvas"></canvas>

      <!-- HTML overlay: album nodes (imperatively managed, viewport-culled) -->
      <div #nodeOverlay class="dag-node-overlay"></div>

      <!-- Album detail panel -->
      <app-album-detail-panel
        [albumId]="selectedAlbumId()"
        (close)="selectedAlbumId.set(null)"
        (deleted)="onAlbumDeleted($event)"
      />
    </div>
  `,
  styles: [`
    .dag-container {
      position: relative; width: 100%; height: 100%;
      overflow: hidden; background: var(--color-bg);
    }

    .dag-toolbar {
      position: absolute; top: 0; left: 0; right: 0; height: 48px;
      background: var(--color-surface); border-bottom: 1px solid var(--color-border);
      display: flex; align-items: center; gap: 12px; padding: 0 16px; z-index: 20;
    }
    .dag-toolbar__title { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; margin-right: 8px; }
    .dag-toolbar__actions { display: flex; gap: 6px; }
    .dag-toolbar__sliders { display: flex; gap: 16px; align-items: center; }
    .btn--sm { padding: 5px 10px; font-size: 12px; }
    .ingest-btn { display: inline-flex; align-items: center; gap: 5px; }
    .ingest-badge { background: var(--color-accent); color: #fff; border-radius: 10px; font-size: 10px; font-weight: 700; padding: 1px 5px; line-height: 1.4; }

    .slider-ctrl {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; color: var(--color-text-muted); white-space: nowrap;
      input[type=range] { width: 80px; accent-color: var(--color-accent); cursor: pointer; }
    }

    .dag-legend {
      position: absolute; bottom: calc(var(--player-height) + 8px); left: 12px;
      display: flex; flex-direction: column; gap: 4px;
      background: rgba(24,24,28,.85); border: 1px solid var(--color-border);
      border-radius: var(--radius-md); padding: 10px 14px; z-index: 20;
      backdrop-filter: blur(4px);
    }
    .legend-item { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--color-text-muted); }

    .dag-loading {
      position: absolute; inset: 0; display: flex; align-items: center;
      justify-content: center; font-size: 14px; color: var(--color-text-muted); z-index: 5;
    }
    .dag-empty {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 16px;
      color: var(--color-text-muted); z-index: 5;
    }

    .dag-svg {
      position: absolute; top: 48px; left: 0; right: 0;
      bottom: var(--player-height); width: 100%;
      height: calc(100% - 48px - var(--player-height));
    }

    /* Canvas covers same area as SVG, sits above it, below nodes */
    .dag-edge-canvas {
      position: absolute; top: 48px; left: 0; right: 0;
      bottom: var(--player-height); width: 100%;
      height: calc(100% - 48px - var(--player-height));
      pointer-events: none; z-index: 1;
    }

    .dag-node-overlay {
      position: absolute; top: 48px; left: 0;
      width: 0; height: 0; transform-origin: 0 0;
      pointer-events: none; z-index: 2;
    }

    /* Node styles injected into overlay children imperatively */
    :global(.dag-node-wrapper) {
      position: absolute; pointer-events: all;
      border: 1px solid var(--color-border); border-radius: var(--radius-md);
      overflow: hidden; cursor: pointer; box-sizing: border-box;
      transition: opacity 150ms, border-color 150ms, box-shadow 150ms;
      background: var(--color-surface-2);
    }
    :global(.dag-node-wrapper:hover) {
      border-color: var(--color-accent);
      box-shadow: 0 0 0 2px rgba(124,106,247,.25);
    }
    :global(.dag-node-wrapper img) {
      width: 100%; height: 100%; object-fit: cover; display: block;
    }
    :global(.dag-node-genre-dot) {
      position: absolute; bottom: 4px; right: 4px;
      width: 7px; height: 7px; border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(0,0,0,.4); pointer-events: none;
    }

    .search-wrap { position: relative; display: flex; align-items: center; margin-left: auto; }
    .search-input {
      width: 180px; padding: 4px 26px 4px 10px; font-size: 12px;
      background: var(--color-surface-2); border: 1px solid var(--color-border);
      border-radius: var(--radius-sm); color: var(--color-text); outline: none;
      &:focus { border-color: var(--color-accent); }
    }
    .search-clear {
      position: absolute; right: 6px; background: none; border: none;
      color: var(--color-text-muted); cursor: pointer; font-size: 16px; padding: 0; line-height: 1;
      &:hover { color: var(--color-text); }
    }

    .lane-label {
      font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; opacity: 0.6; pointer-events: none;
    }
    .time-axis-line {
      stroke: var(--color-border); stroke-width: 1px; pointer-events: none;
    }
    .time-axis { font-size: 11px; pointer-events: none; }
    :global(.time-axis .domain) { display: none; }
    :global(.time-axis .tick line) { stroke: var(--color-border); stroke-width: 1px; }
    :global(.time-axis .tick text) {
      fill: var(--color-text-muted); font-size: 11px;
      transform: translateY(14px);  /* push labels below the tick marks */
    }
  `],
})
export class DagViewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('containerEl',  { static: true }) containerEl!: ElementRef<HTMLDivElement>;
  @ViewChild('svgEl',        { static: true }) svgEl!:        ElementRef<SVGSVGElement>;
  @ViewChild('mainGroup',    { static: true }) mainGroup!:    ElementRef<SVGGElement>;
  @ViewChild('laneLayer',    { static: true }) laneLayer!:    ElementRef<SVGGElement>;
  @ViewChild('labelLayer',   { static: true }) labelLayer!:   ElementRef<SVGGElement>;
  @ViewChild('timeAxisEl',   { static: true }) timeAxisEl!:   ElementRef<SVGGElement>;
  @ViewChild('timeAxisLine', { static: true }) timeAxisLine!: ElementRef<SVGLineElement>;
  @ViewChild('nodeOverlay',  { static: true }) nodeOverlay!:  ElementRef<HTMLDivElement>;
  @ViewChild('edgeCanvas',   { static: true }) edgeCanvas!:   ElementRef<HTMLCanvasElement>;

  private readonly api      = inject(ApiService);
  private readonly zone     = inject(NgZone);
  private readonly dagState = inject(DagStateService);
  readonly auth             = inject(AuthService);

  readonly layout              = signal<DagLayout | null>(null);
  readonly nodeMap             = computed(() => {
    const l = this.layout();
    const map = new Map<string, DagNode>();
    if (l) for (const n of l.nodes) map.set(n.albumId, n);
    return map;
  });
  readonly loading             = signal(true);
  readonly selectedAlbumId     = signal<string | null>(this.dagState.selectedAlbumId);
  readonly pendingIngestCount  = signal(0);
  readonly searchQuery         = signal(this.dagState.searchQuery);
  private readonly NODE_SIZE = 200; // fixed — use d3 zoom to enlarge albums

  readonly matchingIds = computed<Set<string> | null>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return null;
    const nodes = this.layout()?.nodes ?? [];
    return new Set(
      nodes
        .filter((n) => {
          const a = n.album;
          return (
            a.title.toLowerCase().includes(q) ||
            a.artists.some((ar) => ar.name.toLowerCase().includes(q)) ||
            a.genres.some((g) => g.name.toLowerCase().includes(q)) ||
            (a.release_date ?? '').startsWith(q) ||
            a.member_names?.toLowerCase().includes(q) ||
            a.credits?.some((c) => c.name.toLowerCase().includes(q))
          );
        })        .map((n) => n.albumId)
    );
  });

  private kx = this.dagState.transform?.kx ?? 1;
  private ky = this.dagState.transform?.ky ?? 1;
  private tx = this.dagState.transform?.tx ?? 0;
  private ty = this.dagState.transform?.ty ?? 0;

  // Throttled image loader to avoid RDS exhaustion
  private imageQueue: { img: HTMLImageElement, fileId: string, width: number }[] = [];
  private activeImageRequests = 0;
  private readonly MAX_PARALLEL_IMAGES = 32; // Increased for smoother loading

  private processImageQueue() {
    while (this.activeImageRequests < this.MAX_PARALLEL_IMAGES && this.imageQueue.length > 0) {
      const item = this.imageQueue.shift();
      if (!item) break;
      const { img, fileId, width } = item;
      
      const onDone = () => {
        this.activeImageRequests--;
        this.processImageQueue();
      };

      this.activeImageRequests++;
      firstValueFrom(this.api.getThumbBlob(fileId, width))
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          this.blobUrls.set(fileId, url);
          img.src = url;
          img.style.opacity = '1';
          onDone();
        })
        .catch(() => {
          onDone();
        });
    }
  }
  private minKx = 0.001;
  private abortController = new AbortController();
  private wheelHandler: EventListener | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private searchTimer:     ReturnType<typeof setTimeout> | null = null;
  private visibilityRafId: number | null = null;
  private nodeElements = new Map<string, HTMLDivElement>();
  private blobUrls = new Map<string, string>(); // fileId -> blobUrl
  private dpr = window.devicePixelRatio || 1;

  readonly legendEntries = Object.entries(EDGE_COLORS).map(([type, color]) => ({
    type, color,
    dash: EDGE_DASH[type],
    label: type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  }));

  constructor() {
    // Sync state to service
    effect(() => {
      this.dagState.selectedAlbumId = this.selectedAlbumId();
    });

    // Only update non-transform-dependent layers here.
    // Nodes + edges are rendered from the zoom handler or explicitly by loadDag()
    // to avoid drawing with identity transform before fitWidth/restoreTransform runs.
    effect(() => {
      const l = this.layout();
      if (l) {
        this.zone.runOutsideAngular(() => {
          this.drawLanes(l);
          this.drawTimeAxis(l);
          this.updateLabelPositions();
        });
      }
    });

    // Re-render nodes if token becomes available later
    effect(() => {
      if (this.auth.accessToken()) {
        this.zone.runOutsideAngular(() => {
          this.clearNodeElements();
          this.scheduleVisibilityUpdate();
        });
      }
    });
  }

  async ngAfterViewInit(): Promise<void> {
    this.zone.runOutsideAngular(() => this.initZoom());
    const hasSaved = !!this.dagState.transform;
    await this.loadDag(!hasSaved);
    if (hasSaved) this.zone.runOutsideAngular(() => this.restoreTransform());
    if (this.auth.isContributor()) {
      firstValueFrom(this.api.getIngestCount())
        .then((r) => this.pendingIngestCount.set(r.count))
        .catch(() => {});
    }
  }

  ngOnDestroy(): void {
    this.abortController.abort();
    if (this.wheelHandler && this.containerEl) {
      EventTarget.prototype.removeEventListener.call(this.containerEl.nativeElement, 'wheel', this.wheelHandler);
      this.wheelHandler = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.searchTimer)     clearTimeout(this.searchTimer);
    if (this.visibilityRafId) cancelAnimationFrame(this.visibilityRafId);
    this.clearNodeElements();
    this.clearBlobUrls();
  }

  private clearBlobUrls(): void {
    for (const url of this.blobUrls.values()) URL.revokeObjectURL(url);
    this.blobUrls.clear();
  }

  // ── Transform ─────────────────────────────────────────────────────────────

  /** Apply current kx/ky/tx/ty to all layers and save state. */
  private applyTransform(): void {
    const g = d3.select(this.mainGroup.nativeElement);
    g.attr('transform', `matrix(${this.kx},0,0,${this.ky},${this.tx},${this.ty})`);
    this.updateNodePositions();
    this.updateTimeAxis();
    this.updateLabelPositions();
    this.dagState.transform = { kx: this.kx, ky: this.ky, tx: this.tx, ty: this.ty };
    this.redrawEdgesCanvas();
    this.scheduleVisibilityUpdate();
  }

  /**
   * Position each node element in screen space.
   * The node's canvas center maps to screen via the canvas transform:
   *   screen_x = tx + (node.x + node.width/2) * kx
   *   screen_y = ty + (node.y + node.height/2) * ky
   * This keeps edge endpoints (drawn with the canvas transform) always landing
   * on the visual center of each node, regardless of kx vs ky.
   * Node size uses ky only, so nodes stay square.
   */
  private updateNodePositions(): void {
    const l = this.layout();
    if (!l) return;
    for (const node of l.nodes) {
      const el = this.nodeElements.get(node.albumId);
      if (!el) continue;
      const size = node.width * this.ky; // square: both dimensions follow ky
      const cx = this.tx + (node.x + node.width  / 2) * this.kx;
      const cy = this.ty + (node.y + node.height / 2) * this.ky;
      el.style.left   = `${cx - size / 2}px`;
      el.style.top    = `${cy - size / 2}px`;
      el.style.width  = `${size}px`;
      el.style.height = `${size}px`;
    }
  }

  private animateTransform(
    targetKx: number, targetKy: number, targetTx: number, targetTy: number,
    duration = 500,
  ): void {
    const startKx = this.kx, startKy = this.ky;
    const startTx = this.tx, startTy = this.ty;
    const start = performance.now();
    const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const frame = (now: number) => {
      const raw = Math.min((now - start) / duration, 1);
      const e   = ease(raw);
      this.kx = startKx + (targetKx - startKx) * e;
      this.ky = startKy + (targetKy - startKy) * e;
      this.tx = startTx + (targetTx - startTx) * e;
      this.ty = startTy + (targetTy - startTy) * e;
      this.applyTransform();
      if (raw < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────

  private initZoom(): void {
    this.resizeCanvas();
    const container = this.containerEl.nativeElement;
    const sig       = this.abortController.signal;

    // Track Shift key state manually — some OS/browser combos don't set e.shiftKey on wheel events.
    let shiftDown = false;
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftDown = true;
    }, { signal: sig } as AddEventListenerOptions);
    window.addEventListener('keyup',   (e: KeyboardEvent) => { if (e.key === 'Shift') shiftDown = false; }, { signal: sig } as AddEventListenerOptions);
    window.addEventListener('blur',    ()                  => { shiftDown = false; }, { signal: sig } as AddEventListenerOptions);

    // ── Wheel ──
    // Use stored reference instead of AbortController signal — zone.js may not forward signal correctly.
    this.wheelHandler = ((e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const my   = e.clientY - rect.top;

      // 1. Normalize deltas
      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.deltaMode === 1) { dx *= 20; dy *= 20; }
      else if (e.deltaMode === 2) { dx *= 400; dy *= 400; }

      // 2. Detect intent
      const isCtrl  = e.ctrlKey || e.metaKey;
      const isShift = shiftDown || e.shiftKey;
      const isDominantlyHorizontal = Math.abs(dx) > Math.abs(dy);

      if (isCtrl) {
        // Ctrl+scroll → horizontal zoom (timeline scale)
        const delta = Math.abs(dy) > Math.abs(dx) ? dy : dx;
        const factor = Math.pow(0.998, delta);
        const oldKx = this.kx;
        this.kx = Math.max(this.minKx, Math.min(20, this.kx * factor));
        this.tx = mx - (mx - this.tx) * (this.kx / oldKx);
      } else if (isShift) {
        // Shift+scroll (any direction) → resize album nodes (ky)
        const delta = Math.abs(dy) > Math.abs(dx) ? dy : dx;
        const factor = Math.pow(0.998, delta);
        const oldKy = this.ky;
        this.ky = Math.max(0.05, Math.min(10, this.ky * factor));
        this.ty = my - (my - this.ty) * (this.ky / oldKy);
      } else if (isDominantlyHorizontal) {
        // Trackpad horizontal swipe → pan horizontally
        this.tx -= dx;
      } else {
        // Plain scroll → pan
        this.tx -= dx;
        this.ty -= dy;
      }

      this.applyTransform();
    }) as EventListener;
    // Use native addEventListener to bypass zone.js patching (which can swallow passive/signal options).
    EventTarget.prototype.addEventListener.call(container, 'wheel', this.wheelHandler, { passive: false });

    const svgEl = this.svgEl.nativeElement;
    // ── Pointer drag: pan ──
    let dragging = false;
    let didDrag  = false;
    let dragStartClientX = 0, dragStartClientY = 0;
    let dragStartTx = 0, dragStartTy = 0;

    svgEl.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging        = true;
      didDrag         = false;
      dragStartClientX = e.clientX;
      dragStartClientY = e.clientY;
      dragStartTx     = this.tx;
      dragStartTy     = this.ty;
      svgEl.setPointerCapture(e.pointerId);
    }, { signal: sig } as AddEventListenerOptions);

    svgEl.addEventListener('pointermove', (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - dragStartClientX;
      const dy = e.clientY - dragStartClientY;
      if (!didDrag && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) didDrag = true;
      if (!didDrag) return;
      this.tx = dragStartTx + dx;
      this.ty = dragStartTy + dy;
      this.applyTransform();
    }, { signal: sig } as AddEventListenerOptions);

    svgEl.addEventListener('pointerup', () => { dragging = false; }, { signal: sig } as AddEventListenerOptions);
    svgEl.addEventListener('pointercancel', () => { dragging = false; }, { signal: sig } as AddEventListenerOptions);

    // ── Hit detection ──
    let lastHoveredId: string | null = null;

    const nodeAt = (clientX: number, clientY: number): DagNode | null => {
      const r  = svgEl.getBoundingClientRect();
      const wx = (clientX - r.left - this.tx) / this.kx;
      const wy = (clientY - r.top  - this.ty) / this.ky;
      for (const n of (this.layout()?.nodes ?? [])) {
        // Visual width in world units: width * (ky / kx)
        const visualWidth = n.width * (this.ky / this.kx);
        const visualX     = n.x + (n.width / 2) - (visualWidth / 2);
        if (wx >= visualX && wx <= visualX + visualWidth && wy >= n.y && wy <= n.y + n.height) {
          return n;
        }
      }
      return null;
    };

    svgEl.addEventListener('click', (e: MouseEvent) => {
      if (didDrag) return;
      const n = nodeAt(e.clientX, e.clientY);
      if (n) this.zone.run(() => this.selectedAlbumId.set(n.albumId));
    }, { signal: sig } as AddEventListenerOptions);

    svgEl.addEventListener('mousemove', (e: MouseEvent) => {
      const n  = nodeAt(e.clientX, e.clientY);
      const id = n?.albumId ?? null;
      if (id === lastHoveredId) return;
      if (lastHoveredId) {
        const el = this.nodeElements.get(lastHoveredId);
        if (el) { el.style.borderColor = 'rgba(255,255,255,0.1)'; el.style.boxShadow = ''; }
      }
      if (id) {
        const el = this.nodeElements.get(id);
        if (el) { el.style.borderColor = 'rgba(124,106,247,0.8)'; el.style.boxShadow = '0 0 0 2px rgba(124,106,247,.25)'; }
      }
      lastHoveredId = id;
      svgEl.style.cursor = id ? 'pointer' : '';
    }, { signal: sig } as AddEventListenerOptions);

    svgEl.addEventListener('mouseleave', () => {
      if (lastHoveredId) {
        const el = this.nodeElements.get(lastHoveredId);
        if (el) { el.style.borderColor = 'rgba(255,255,255,0.1)'; el.style.boxShadow = ''; }
        lastHoveredId = null;
      }
      svgEl.style.cursor = '';
    }, { signal: sig } as AddEventListenerOptions);

    // Redraw edges + labels whenever the container is resized (e.g. window resize, panel open)
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
      this.redrawEdgesCanvas();
      this.updateTimeAxis();
      this.updateLabelPositions();
    });
    this.resizeObserver.observe(this.svgEl.nativeElement);
  }

  private updateLabelPositions(): void {
    const l = this.layout();
    if (!l) return;
    const fontSize = Math.max(9, Math.min(28, Math.round(13 * this.ky)));
    const texts = this.labelLayer.nativeElement.querySelectorAll('text');
    texts.forEach((el, i) => {
      const lane = l.genres[i];
      if (!lane) return;
      const screenY = this.ty + (lane.laneY + lane.laneHeight / 2) * this.ky;
      el.setAttribute('x', '8');
      el.setAttribute('y', String(Math.round(screenY)));
      el.setAttribute('font-size', `${fontSize}px`);
    });
  }

  private restoreTransform(): void {
    const s = this.dagState.transform;
    if (!s) return;
    this.kx = s.kx; this.ky = s.ky;
    this.tx = s.tx; this.ty = s.ty;
    this.applyTransform();
  }

  resetZoom(): void {
    this.zone.runOutsideAngular(() => this.fitWidth(true));
  }

  /** Fit all content edge-to-edge horizontally, centered vertically. */
  private fitWidth(animate = false): void {
    const l = this.layout();
    if (!l || l.canvasBounds.width === 0) return;
    const sv = this.svgEl.nativeElement;
    const sw = sv.clientWidth, sh = sv.clientHeight;
    if (!sw) return;
    const k  = sw / l.canvasBounds.width;
    this.minKx = k * 0.5;
    const targetTy = (sh - l.canvasBounds.height * k) / 2;
    if (animate) {
      this.animateTransform(k, k, 0, targetTy);
    } else {
      this.kx = k; this.ky = k;
      this.tx = 0; this.ty = targetTy;
      this.applyTransform();
    }
  }

  // ── Canvas edge rendering ─────────────────────────────────────────────────

  private resizeCanvas(): void {
    const canvas = this.edgeCanvas.nativeElement;
    const sv = this.svgEl.nativeElement;
    this.dpr = window.devicePixelRatio || 1;
    const w = sv.clientWidth  || canvas.clientWidth;
    const h = sv.clientHeight || canvas.clientHeight;
    if (!w || !h) return;
    canvas.width  = Math.round(w * this.dpr);
    canvas.height = Math.round(h * this.dpr);
  }

  private redrawEdgesCanvas(): void {
    const l = this.layout();
    if (!l) return;
    const canvas = this.edgeCanvas.nativeElement;
    if (canvas.width === 0) return;
    const ctx = canvas.getContext('2d')!;
    const ids = this.matchingIds();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.transform(this.kx, 0, 0, this.ky, this.tx, this.ty);

    for (const edge of l.edges) {
      if (!edge.path) continue;
      const color  = EDGE_COLORS[edge.type] ?? '#888';
      const width  = edge.type === 'collaboration' ? 2.5 : 1.5;
      const dim    = ids !== null && !ids.has(edge.sourceAlbumId) && !ids.has(edge.targetAlbumId);

      ctx.save();
      ctx.globalAlpha  = dim ? 0.08 : 0.7;
      ctx.strokeStyle  = color;
      ctx.fillStyle    = color;
      ctx.lineWidth    = width;
      ctx.setLineDash(parseDash(EDGE_DASH[edge.type] ?? 'none'));

      ctx.stroke(new Path2D(edge.path));

      const arrow = getArrowEnd(edge.path);
      if (arrow) {
        ctx.setLineDash([]);
        const tgtNode = this.nodeMap().get(edge.targetAlbumId);

        // Compute arrowhead world X: pull back to the visual left edge of the target node.
        // Node center is at arrow.x (world); visual half-width in world units = (node.width/2) * (ky/kx)
        const worldAx = tgtNode
          ? arrow.x - (tgtNode.width / 2) * (this.ky / this.kx)
          : arrow.x;

        // Convert world → screen
        const screenAx = this.tx + worldAx * this.kx;
        const screenAy = this.ty + arrow.y  * this.ky;

        // Visual angle in screen space accounts for non-uniform scale
        const visualAngle = Math.atan2(arrow.dy * this.ky, arrow.dx * this.kx);

        // Draw in screen space (undo the world transform so the triangle isn't stretched)
        ctx.save();
        ctx.resetTransform();
        ctx.scale(this.dpr, this.dpr);
        ctx.fillStyle = EDGE_COLORS[edge.type] ?? '#888';
        ctx.globalAlpha = dim ? 0.08 : 0.7;
        drawArrowhead(ctx, screenAx, screenAy, visualAngle);
        ctx.restore();
      }

      if (edge.label && this.kx > 0.45) {
        const mid = getPathMid(edge.path);
        if (mid) {
          ctx.save();
          // Undo the non-uniform zoom for the text so it doesn't stretch
          ctx.translate(mid.x, mid.y);
          ctx.scale(1 / this.kx, 1 / this.ky);
          ctx.setLineDash([]);
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.globalAlpha = dim ? 0.08 : 0.8;
          ctx.fillText(edge.label, 0, -6);
          ctx.restore();
        }
      }

      ctx.restore();
    }

    ctx.restore();
  }

  // ── Viewport-culled node management ──────────────────────────────────────

  private clearNodeElements(): void {
    for (const el of this.nodeElements.values()) el.remove();
    this.nodeElements.clear();
  }

  private scheduleVisibilityUpdate(): void {
    if (this.visibilityRafId !== null) return;
    this.visibilityRafId = requestAnimationFrame(() => {
      this.visibilityRafId = null;
      this.updateVisibleNodes();
    });
  }

  private updateVisibleNodes(): void {
    const l = this.layout();
    if (!l) return;

    const sv  = this.svgEl.nativeElement;
    const vw  = sv.clientWidth;
    const vh  = sv.clientHeight;
    const buf = 120; // px buffer to pre-load just-off-screen nodes
    const ids = this.matchingIds();
    const token = this.auth.accessToken();

    const visibleIds = new Set<string>();
    for (const node of l.nodes) {
      // Node screen position: x uses kx, y uses ky; size is square (ky)
      // Visual center in canvas space is node.x + node.width/2
      // Visual width in canvas space is node.width * (ky / kx)
      const visualWidth = node.width * (this.ky / this.kx);
      const visualX = node.x + (node.width / 2) - (visualWidth / 2);

      const sx = this.tx + visualX * this.kx;
      const sy = this.ty + node.y * this.ky;
      const sw = visualWidth * this.kx;
      const sh = node.height * this.ky;

      if (sx + sw + buf > 0 && sx - buf < vw && sy + sh + buf > 0 && sy - buf < vh) {
        visibleIds.add(node.albumId);
      }
    }

    // Remove nodes that scrolled off
    for (const [albumId, el] of this.nodeElements) {
      if (!visibleIds.has(albumId)) {
        el.remove();
        this.nodeElements.delete(albumId);
      }
    }

    // Add newly visible nodes; update dim on existing
    const overlay = this.nodeOverlay.nativeElement;
    for (const node of l.nodes) {
      if (!visibleIds.has(node.albumId)) continue;
      const dim = ids !== null && !ids.has(node.albumId);

      const existing = this.nodeElements.get(node.albumId);
      if (existing) {
        existing.style.opacity       = dim ? '0.1' : '';
        existing.style.pointerEvents = dim ? 'none' : '';
        continue;
      }

      const el = this.createNodeElement(node, token, dim);
      overlay.appendChild(el);
      this.nodeElements.set(node.albumId, el);
    }

    // Position all visible nodes now (including newly created ones)
    this.updateNodePositions();
  }

  private createNodeElement(
    node: DagNode, token: string | null, dim: boolean
  ): HTMLDivElement {
    const a = node.album;

    const wrapper = document.createElement('div');
    // Position and size are set by updateNodePositions(); initial values don't matter.
    wrapper.style.cssText =
      `position:absolute;left:0;top:0;width:0;height:0;` +
      `overflow:hidden;box-sizing:border-box;` +
      `border:1px solid rgba(255,255,255,0.1);border-radius:6px;` +
      `background:#1e1e24;pointer-events:none;transition:opacity 150ms,border-color 150ms,box-shadow 150ms;`;
    if (dim) { wrapper.style.opacity = '0.1'; wrapper.style.pointerEvents = 'none'; }

    // Tooltip
    const year = (() => {
      const d = a.release_date ?? (a as any).recorded_start ?? (a as any).recorded_end;
      return d ? new Date(d).getFullYear() : null;
    })();
    const artistNames = a.artists.map((x) => x.name).join(', ') || 'Unknown';
    wrapper.title = year ? `${a.title} · ${artistNames} (${year})` : `${a.title} · ${artistNames}`;

    if (a.cover_art_file_id) {
      const img = document.createElement('img');
      img.alt     = a.title;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity 200ms;';
      wrapper.appendChild(img);

      const fileId = a.cover_art_file_id;
      const existingBlobUrl = this.blobUrls.get(fileId);
      if (existingBlobUrl) {
        img.src = existingBlobUrl;
        img.style.opacity = '1';
      } else {
        // Fetch via queue
        this.imageQueue.push({ img, fileId, width: node.width * 2 });
        this.processImageQueue();
      }
    } else {
      const ph = document.createElement('div');
      ph.textContent = '🎵';
      ph.style.cssText =
        'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;';
      wrapper.appendChild(ph);
    }

    if (a.album_type && a.album_type !== 'studio') {
      const badge = document.createElement('div');
      badge.textContent = a.album_type.toUpperCase();
      badge.style.cssText =
        `position:absolute;top:4px;left:4px;` +
        `background:rgba(255,200,0,.85);color:#000;` +
        `font-size:8px;font-weight:700;letter-spacing:.04em;` +
        `padding:1px 4px;border-radius:3px;pointer-events:none;line-height:1.4;`;
      wrapper.appendChild(badge);
    }

    if (a.genres.length > 0) {
      const dot = document.createElement('div');
      dot.style.cssText =
        `position:absolute;bottom:4px;right:4px;width:7px;height:7px;border-radius:50%;` +
        `background:${a.genres[0].color_hex};box-shadow:0 0 0 1px rgba(0,0,0,.4);pointer-events:none;`;
      wrapper.appendChild(dot);
    }

    return wrapper;
  }

  // ── Search ────────────────────────────────────────────────────────────────

  onSearchInput(q: string): void {
    this.searchQuery.set(q);
    this.dagState.searchQuery = q;
    this.zone.runOutsideAngular(() => this.applySearchDim());
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.zone.runOutsideAngular(() => { if (q.trim()) this.fitToMatchingNodes(); });
    }, 400);
  }

  private applySearchDim(): void {
    // Update existing node element opacities
    const ids = this.matchingIds();
    for (const [albumId, el] of this.nodeElements) {
      const dim = ids !== null && !ids.has(albumId);
      el.style.opacity       = dim ? '0.1' : '';
      el.style.pointerEvents = dim ? 'none' : '';
    }
    // Redraw canvas with new dim state
    this.redrawEdgesCanvas();
  }

  private fitToMatchingNodes(): void {
    const ids   = this.matchingIds();
    const nodes = this.layout()?.nodes.filter((n) => ids?.has(n.albumId)) ?? [];
    if (nodes.length === 0) return;

    const sv  = this.svgEl.nativeElement;
    const sw  = sv.clientWidth, sh = sv.clientHeight, pad = 80;
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.width));
    const maxY = Math.max(...nodes.map((n) => n.y + n.height));
    const bw = maxX - minX || 1, bh = maxY - minY || 1;
    const scale  = Math.min((sw - pad * 2) / bw, (sh - pad * 2) / bh, 2);
    const targetTx = (sw - bw * scale) / 2 - minX * scale;
    const targetTy = (sh - bh * scale) / 2 - minY * scale;
    this.animateTransform(scale, scale, targetTx, targetTy, 400);
  }

  // ── D3 drawing: lanes + time axis ────────────────────────────────────────

  private drawLanes(l: DagLayout): void {
    const sel = d3.select(this.laneLayer.nativeElement);
    sel.selectAll('rect').remove();
    l.genres.forEach((lane, i) => {
      sel.append('rect')
        .attr('x', 0).attr('y', lane.laneY)
        .attr('width', l.canvasBounds.width).attr('height', lane.laneHeight)
        .attr('fill', i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.03)');
    });
  }

  private updateTimeAxis(): void {
    const l = this.layout();
    if (!l?.timeRange.minDate) return;
    const svgEl   = this.svgEl.nativeElement;
    const centerY = Math.round(svgEl.clientHeight / 2);

    // Position the hairline
    const line = this.timeAxisLine.nativeElement;
    line.setAttribute('y1', String(centerY));
    line.setAttribute('y2', String(centerY));

    // Build a time scale in canvas coordinates, then manually rescale to
    // screen coords using kx/tx (horizontal only — ky doesn't affect the timeline).
    // Range matches dagLayout.ts:  x = ((date - min) / range) * (CANVAS_W - NODE_SIZE - 40) + 20
    // The date maps to the left edge of the node; its visual centre = x + NODE_SIZE/2.
    const half = this.NODE_SIZE / 2;
    const r0   = 20 + half;
    const r1   = l.canvasBounds.width - this.NODE_SIZE - 20 + half;
    const rescaled = d3.scaleTime()
      .domain([new Date(l.timeRange.minDate!), new Date(l.timeRange.maxDate!)])
      .range([this.tx + r0 * this.kx, this.tx + r1 * this.kx]);

    // Adaptive tick density based on pixels per year in screen space
    const pxPerYear = Math.abs(rescaled(new Date(2001, 0, 1)) - rescaled(new Date(2000, 0, 1)));

    let tickInterval: d3.TimeInterval;
    let fmt: string;
    if      (pxPerYear > 800) { tickInterval = d3.timeMonth.every(1)!;  fmt = '%b %Y'; }
    else if (pxPerYear > 300) { tickInterval = d3.timeMonth.every(3)!;  fmt = '%b %Y'; }
    else if (pxPerYear > 100) { tickInterval = d3.timeYear.every(1)!;   fmt = '%Y';    }
    else if (pxPerYear > 40)  { tickInterval = d3.timeYear.every(2)!;   fmt = '%Y';    }
    else if (pxPerYear > 15)  { tickInterval = d3.timeYear.every(5)!;   fmt = '%Y';    }
    else                      { tickInterval = d3.timeYear.every(10)!;  fmt = '%Y';    }

    const axis = d3.axisBottom(rescaled)
      .ticks(tickInterval)
      .tickFormat(d3.timeFormat(fmt) as (v: Date | d3.NumberValue) => string)
      .tickSizeInner(-8)
      .tickSizeOuter(0);

    d3.select(this.timeAxisEl.nativeElement)
      .attr('transform', `translate(0, ${centerY})`)
      .call(axis);
  }

  private drawTimeAxis(_l: DagLayout): void { this.updateTimeAxis(); }

  // ── Data loading ──────────────────────────────────────────────────────────

  async loadDag(fitView = true): Promise<void> {
    this.loading.set(true);
    try {
      const l = await firstValueFrom(this.api.getDag(this.NODE_SIZE, 1));
      this.zone.run(() => this.layout.set(l));
      
      const hasSaved = !!this.dagState.transform;
      if (fitView && !hasSaved) {
        setTimeout(() => this.zone.runOutsideAngular(() => this.fitWidth()), 100);
      } else {
        // Transform already set (or we want to keep current) — render immediately
        this.zone.runOutsideAngular(() => {
          this.resizeCanvas();
          this.clearNodeElements();
          this.applyTransform();
        });
      }
    } finally {
      this.loading.set(false);
    }
  }

  async reload(): Promise<void> { await this.loadDag(false); }

  // ── Interaction ───────────────────────────────────────────────────────────

  selectAlbum(albumId: string): void { this.zone.run(() => this.selectedAlbumId.set(albumId)); }

  onAlbumDeleted(albumId: string): void {
    const el = this.nodeElements.get(albumId);
    if (el) { el.remove(); this.nodeElements.delete(albumId); }
    this.layout.update((l) => l ? { ...l, nodes: l.nodes.filter((n) => n.albumId !== albumId) } : l);
    this.zone.runOutsideAngular(() => this.redrawEdgesCanvas());
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    this.zone.runOutsideAngular(() => {
      const factor = e.key === 'ArrowUp' ? 1.1 : (1 / 1.1);
      const svgH = this.svgEl.nativeElement.clientHeight;
      const cy   = svgH / 2;
      const oldKy = this.ky;
      this.ky = Math.max(0.05, Math.min(10, this.ky * factor));
      this.ty = cy - (cy - this.ty) * (this.ky / oldKy);
      this.applyTransform();
    });
  }
}
