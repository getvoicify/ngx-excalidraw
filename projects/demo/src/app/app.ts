import { isPlatformBrowser } from '@angular/common';
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
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
      <ngx-excalidraw (api)="onApi($event)" (loadError)="onLoadError($event)" />
    </main>
  `,
})
export class App {
  protected readonly ready = signal(false);

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
    (window as unknown as { __excalidrawApi?: ExcalidrawImperativeAPI }).__excalidrawApi = api;
    this.ready.set(true);
  }

  protected onLoadError(error: unknown): void {
    console.error('Excalidraw failed to load', error);
  }
}
