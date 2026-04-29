import { Component, HostListener, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './shared/components/toast/toast.component';
import { PlayerBarComponent } from './features/player/player-bar/player-bar.component';
import { PlayerService } from './core/services/player.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastComponent, PlayerBarComponent],
  template: `
    <div class="app-root">
      <div class="main-content">
        <router-outlet />
      </div>
      <app-player-bar />
      <app-toast />
    </div>
  `,
  styleUrl: './app.scss',
})
export class App {
  private readonly player = inject(PlayerService);

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      const active = document.activeElement?.tagName.toLowerCase();
      // Don't toggle playback if typing or interacting with buttons
      if (active === 'input' || active === 'textarea' || active === 'select' || active === 'button') {
        return;
      }

      event.preventDefault();
      this.player.togglePlay();
    }
  }
}
