import { isPlatformBrowser } from '@angular/common';
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { filter, take } from 'rxjs';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { ExcalidrawComponent } from 'ngx-excalidraw';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ExcalidrawComponent],
  styles: `
    ngx-excalidraw {
      height: 80vh;
    }
  `,
  template: `
    <main>
      <h1>ngx-excalidraw demo</h1>
      <p data-testid="excalidraw-status">
        {{ ready() ? 'Excalidraw ready' : 'Loading Excalidraw' }}
      </p>
      <label>
        <input
          type="checkbox"
          data-testid="dark-theme"
          [checked]="dark()"
          (change)="dark.set($any($event.target).checked)"
        />
        Dark theme
      </label>
      <label>
        <input
          type="checkbox"
          data-testid="view-mode"
          [checked]="viewMode()"
          (change)="viewMode.set($any($event.target).checked)"
        />
        View mode
      </label>
      <ngx-excalidraw
        [theme]="theme()"
        [viewModeEnabled]="viewMode()"
        (api)="onApi($event)"
        (editorError)="onEditorError($event)"
      />
    </main>
  `,
})
export class App {
  protected readonly ready = signal(false);
  protected readonly dark = signal(false);
  protected readonly viewMode = signal(false);
  protected readonly theme = computed(() => (this.dark() ? 'dark' : 'light'));

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    inject(ApplicationRef)
      .isStable.pipe(filter(Boolean), take(1))
      .subscribe(() => {
        (window as unknown as { __appFirstStableAt?: number }).__appFirstStableAt =
          performance.now();
      });
  }

  protected onApi(api: ExcalidrawImperativeAPI): void {
    const demoWindow = window as unknown as {
      __excalidrawApi?: ExcalidrawImperativeAPI;
      __excalidrawApiEmissions?: number;
    };
    demoWindow.__excalidrawApi = api;
    demoWindow.__excalidrawApiEmissions = (demoWindow.__excalidrawApiEmissions ?? 0) + 1;
    this.ready.set(true);
  }

  protected onEditorError(error: unknown): void {
    console.error('Excalidraw failed', error);
  }
}
