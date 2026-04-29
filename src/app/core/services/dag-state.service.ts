import { Injectable } from '@angular/core';

export interface SavedDagTransform {
  tx: number;
  ty: number;
  kx: number;
  ky: number;
}

@Injectable({ providedIn: 'root' })
export class DagStateService {
  transform: SavedDagTransform | null = null;
  searchQuery = '';
  selectedAlbumId: string | null = null;
}
