import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/dag', pathMatch: 'full' },
  {
    path: 'dag',
    loadComponent: () => import('./features/dag/dag-view/dag-view.component').then((m) => m.DagViewComponent),
    canActivate: [authGuard],
  },
  {
    path: 'library',
    canActivate: [authGuard],
    children: [
      {
        path: 'album/new',
        loadComponent: () => import('./features/library/album-form/album-form.component').then((m) => m.AlbumFormComponent),
      },
      {
        path: 'album/:id/edit',
        loadComponent: () => import('./features/library/album-form/album-form.component').then((m) => m.AlbumFormComponent),
      },
      {
        path: 'artist/new',
        loadComponent: () => import('./features/library/artist-form/artist-form.component').then((m) => m.ArtistFormComponent),
      },
      {
        path: 'artist/:id/edit',
        loadComponent: () => import('./features/library/artist-form/artist-form.component').then((m) => m.ArtistFormComponent),
      },
      {
        path: 'edge/new',
        loadComponent: () => import('./features/library/edge-form/edge-form.component').then((m) => m.EdgeFormComponent),
      },
      {
        path: 'artists',
        loadComponent: () => import('./features/library/artists-list/artists-list.component').then((m) => m.ArtistsListComponent),
      },
      {
        path: 'files',
        loadComponent: () => import('./features/library/file-upload/file-upload.component').then((m) => m.FileUploadComponent),
      },
      {
        path: 'genres',
        loadComponent: () => import('./features/library/genres/genres.component').then((m) => m.GenresComponent),
      },
      {
        path: 'ingest',
        loadComponent: () => import('./features/library/ingest-queue/ingest-queue.component').then((m) => m.IngestQueueComponent),
      },
      {
        path: 'track/:id/edit',
        loadComponent: () => import('./features/library/track-form/track-form.component').then((m) => m.TrackFormComponent),
      },
    ],
  },
  { path: '**', redirectTo: '/dag' },
];
