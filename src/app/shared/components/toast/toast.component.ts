import { Component, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [NgClass],
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [ngClass]="'toast--' + toast.type">
          <span class="toast__icon">{{ icons[toast.type] }}</span>
          <span class="toast__message">{{ toast.message }}</span>
          <button class="toast__close" (click)="toastService.dismiss(toast.id)">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: calc(var(--player-height) + 12px);
      right: 16px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: var(--radius-md);
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      font-size: 13px;
      pointer-events: all;
      animation: slide-in 200ms ease;
      min-width: 260px;
      max-width: 400px;
      &--success { border-left: 3px solid var(--color-success); }
      &--error   { border-left: 3px solid var(--color-danger); }
      &--info    { border-left: 3px solid var(--color-accent); }
    }
    .toast__icon { font-size: 16px; flex-shrink: 0; }
    .toast__message { flex: 1; }
    .toast__close { margin-left: 8px; opacity: 0.5; font-size: 11px; &:hover { opacity: 1; } }
    @keyframes slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
  `],
})
export class ToastComponent {
  readonly toastService = inject(ToastService);
  readonly icons = { success: '✓', error: '✕', info: 'ℹ' };
}
