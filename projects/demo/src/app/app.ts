import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
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

  protected onApi(api: ExcalidrawImperativeAPI): void {
    (window as unknown as { __excalidrawApi?: ExcalidrawImperativeAPI }).__excalidrawApi = api;
    this.ready.set(true);
  }

  protected onLoadError(error: unknown): void {
    console.error('Excalidraw failed to load', error);
  }
}
