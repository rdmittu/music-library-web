import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Album, Artist, ArtistMember, Genre, Track, TrackCredit, Edge, MusicFile, DagLayout, CreditRole,
  IngestItem, StreamingServer
} from '../models/api.models';
import { AuthService } from './auth.service';

interface AlbumPayload {
  title?: string | null;
  album_type?: string | null;
  release_date?: string | null;
  recorded_start?: string | null;
  recorded_end?: string | null;
  cover_art_file_id?: string | null;
  notes?: string | null;
  artists?: { id: string; billing_order?: number }[];
  credits?: { artist_id: string; role: CreditRole; instruments?: string[]; notes?: string | null; billing_order?: number }[];
  genres?: { id: string; is_primary: boolean }[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = environment.apiUrl;

  // ── DAG ──────────────────────────────────────────────────────────────────
  getDag(nodeSize = 200, xScale = 1): Observable<DagLayout> {
    const params = new HttpParams()
      .set('nodeSize', nodeSize)
      .set('xScale',   xScale);
    return this.http.get<DagLayout>(`${this.base}/dag`, { params });
  }

  // ── Albums ────────────────────────────────────────────────────────────────
  getAlbums(params?: { search?: string; genre_id?: string; artist_id?: string }): Observable<Album[]> {
    let httpParams = new HttpParams();
    if (params?.search) httpParams = httpParams.set('search', params.search);
    if (params?.genre_id) httpParams = httpParams.set('genre_id', params.genre_id);
    if (params?.artist_id) httpParams = httpParams.set('artist_id', params.artist_id);
    return this.http.get<Album[]>(`${this.base}/albums`, { params: httpParams });
  }

  getAlbum(id: string): Observable<Album> {
    return this.http.get<Album>(`${this.base}/albums/${id}`);
  }

  createAlbum(data: AlbumPayload): Observable<Album> {
    return this.http.post<Album>(`${this.base}/albums`, data);
  }

  updateAlbum(id: string, data: AlbumPayload): Observable<Album> {
    return this.http.put<Album>(`${this.base}/albums/${id}`, data);
  }

  deleteAlbum(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/albums/${id}`);
  }

  // ── Artists ───────────────────────────────────────────────────────────────
  getArtists(search?: string): Observable<Artist[]> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<Artist[]>(`${this.base}/artists`, { params });
  }

  createArtist(data: Partial<Artist>): Observable<Artist> {
    return this.http.post<Artist>(`${this.base}/artists`, data);
  }

  updateArtist(id: string, data: Partial<Artist>): Observable<Artist> {
    return this.http.put<Artist>(`${this.base}/artists/${id}`, data);
  }

  deleteArtist(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/artists/${id}`);
  }

  // ── Artist members ────────────────────────────────────────────────────────
  getMembers(groupId: string): Observable<ArtistMember[]> {
    return this.http.get<ArtistMember[]>(`${this.base}/artists/${groupId}/members`);
  }

  addMember(groupId: string, data: Partial<ArtistMember>): Observable<ArtistMember> {
    return this.http.post<ArtistMember>(`${this.base}/artists/${groupId}/members`, data);
  }

  updateMember(groupId: string, memberId: string, data: Partial<ArtistMember>): Observable<ArtistMember> {
    return this.http.put<ArtistMember>(`${this.base}/artists/${groupId}/members/${memberId}`, data);
  }

  removeMember(groupId: string, memberId: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/artists/${groupId}/members/${memberId}`);
  }

  // ── Genres ────────────────────────────────────────────────────────────────
  getGenres(): Observable<Genre[]> {
    return this.http.get<Genre[]>(`${this.base}/genres`);
  }

  getGenreTree(): Observable<Genre[]> {
    return this.http.get<Genre[]>(`${this.base}/genres/tree`);
  }

  createGenre(data: { name: string; color_hex?: string; parent_id?: string | null }): Observable<Genre> {
    return this.http.post<Genre>(`${this.base}/genres`, data);
  }

  updateGenre(id: string, data: { name: string; color_hex?: string; parent_id?: string | null }): Observable<Genre> {
    return this.http.put<Genre>(`${this.base}/genres/${id}`, data);
  }

  deleteGenre(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/genres/${id}`);
  }

  // ── Tracks ────────────────────────────────────────────────────────────────
  getTracks(albumId: string): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.base}/tracks`, { params: new HttpParams().set('album_id', albumId) });
  }

  createTrack(data: Partial<Track>): Observable<Track> {
    return this.http.post<Track>(`${this.base}/tracks`, data);
  }

  updateTrack(id: string, data: Partial<Track>): Observable<Track> {
    return this.http.put<Track>(`${this.base}/tracks/${id}`, data);
  }

  deleteTrack(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/tracks/${id}`);
  }

  getTrack(id: string): Observable<Track> {
    return this.http.get<Track>(`${this.base}/tracks/${id}`);
  }

  getTrackCredits(trackId: string): Observable<TrackCredit[]> {
    return this.http.get<TrackCredit[]>(`${this.base}/tracks/${trackId}/credits`);
  }

  addTrackCredit(trackId: string, data: Partial<TrackCredit>): Observable<TrackCredit> {
    return this.http.post<TrackCredit>(`${this.base}/tracks/${trackId}/credits`, data);
  }

  removeTrackCredit(trackId: string, creditId: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/tracks/${trackId}/credits/${creditId}`);
  }

  // ── Edges ─────────────────────────────────────────────────────────────────
  getEdges(albumId?: string): Observable<Edge[]> {
    const params = albumId ? new HttpParams().set('album_id', albumId) : undefined;
    return this.http.get<Edge[]>(`${this.base}/edges`, { params });
  }

  createEdge(data: Partial<Edge>): Observable<Edge> {
    return this.http.post<Edge>(`${this.base}/edges`, data);
  }

  deleteEdge(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/edges/${id}`);
  }

  // ── Files ─────────────────────────────────────────────────────────────────
  getFiles(): Observable<MusicFile[]> {
    return this.http.get<MusicFile[]>(`${this.base}/files`);
  }

  private xhrUpload(file: File, onProgress?: (pct: number) => void): Observable<MusicFile> {
    const formData = new FormData();
    formData.append('file', file);
    return new Observable((observer) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.base}/files`);

      const token = this.auth.accessToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          observer.next(JSON.parse(xhr.responseText));
          observer.complete();
        } else {
          observer.error(new Error(xhr.responseText));
        }
      };
      xhr.onerror = () => observer.error(new Error('Upload failed'));
      xhr.send(formData);
    });
  }

  uploadFile(file: File, onProgress?: (pct: number) => void): Observable<MusicFile> {
    return this.xhrUpload(file, onProgress);
  }

  uploadImage(file: File): Observable<MusicFile> {
    return new Observable((observer) => {
      // Step 1: get a presigned S3 PUT URL from the backend
      this.http.post<{ uploadUrl: string; file: MusicFile }>(
        `${this.base}/images/presign`,
        { filename: file.name, contentType: file.type, size: file.size }
      ).subscribe({
        next: ({ uploadUrl, file: dbFile }) => {
          // Step 2: PUT the binary directly to S3 (no Lambda involved)
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              observer.next(dbFile);
              observer.complete();
            } else {
              observer.error(new Error(`S3 upload failed: ${xhr.status}`));
            }
          };
          xhr.onerror = () => observer.error(new Error('S3 upload failed'));
          xhr.send(file);
        },
        error: (err) => observer.error(err),
      });
    });
  }

  getStreamUrl(fileId: string): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.base}/stream/${fileId}`);
  }

  getThumbBlob(fileId: string, w = 300): Observable<Blob> {
    const params = new HttpParams().set('w', w.toString());
    return this.http.get(`${this.base}/stream/${fileId}/thumb`, {
      params,
      responseType: 'blob'
    });
  }

  // ── Ingest queue ──────────────────────────────────────────────────────────
  getIngestQueue(): Observable<IngestItem[]> {
    return this.http.get<IngestItem[]>(`${this.base}/ingest/queue`);
  }

  getIngestCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.base}/ingest/queue/count`);
  }

  matchIngestItems(items: { ingest_id: string; track_id: string }[]): Observable<{ matched: number }> {
    return this.http.post<{ matched: number }>(`${this.base}/ingest/match`, { items });
  }

  rejectIngestItem(id: string): Observable<{ rejected: boolean }> {
    return this.http.post<{ rejected: boolean }>(`${this.base}/ingest/reject/${id}`, {});
  }

  linkIngestItems(
    albumId: string,
    items: { ingest_id: string; track_id?: string | null }[],
  ): Observable<{ linked: number }> {
    return this.http.post<{ linked: number }>(`${this.base}/ingest/link`, { album_id: albumId, items });
  }

  autoLinkMatched(): Observable<{ linked: number }> {
    return this.http.post<{ linked: number }>(`${this.base}/ingest/auto-link-matched`, {});
  }

  // ── Streaming servers ──────────────────────────────────────────────────────
  registerStreamingServer(data: { name: string; base_url: string }): Observable<StreamingServer & { api_key: string }> {
    return this.http.post<StreamingServer & { api_key: string }>(`${this.base}/streaming-servers`, data);
  }

  getStreamingServers(): Observable<StreamingServer[]> {
    return this.http.get<StreamingServer[]>(`${this.base}/streaming-servers`);
  }
}
