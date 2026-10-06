import { PlatformLocation } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
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
      <label>
        <input
          type="checkbox"
          data-testid="main-menu"
          [checked]="mainMenu()"
          (change)="mainMenu.set($any($event.target).checked)"
        />
        Main menu
      </label>
      <button type="button" data-testid="remove-editor" (click)="editorShown.set(false)">
        Remove editor
      </button>
      <button type="button" data-testid="export-svg" [disabled]="!ready()" (click)="exportSvg()">
        Export SVG
      </button>
      @if (exportedSvgUrl(); as url) {
        <img data-testid="exported-svg" [src]="url" alt="The drawing exported as SVG" />
      }
      <p data-testid="scene-elements">elements: {{ elementCount() }}</p>
      <p data-testid="library-items">library: {{ libraryItemCount() }}</p>
      @if (editorShown()) {
        <ngx-excalidraw
          [theme]="theme()"
          [viewModeEnabled]="viewMode()"
          [mainMenu]="mainMenu()"
          (editorError)="onEditorError($event)"
          (sceneChange)="elementCount.set($event.nonDeletedElements.length)"
          (libraryChange)="libraryItemCount.set($event.length)"
        />
      }
    </main>
  `,
})
export class App {
  protected readonly dark = signal(false);
  protected readonly viewMode = signal(false);
  protected readonly mainMenu = signal(
    new URLSearchParams(inject(PlatformLocation).search).get('mainMenu') !== 'false',
  );
  protected readonly elementCount = signal(0);
  protected readonly libraryItemCount = signal(0);
  protected readonly editorShown = signal(true);
  protected readonly exportedSvgUrl = signal<string | undefined>(undefined);
  protected readonly theme = computed(() => (this.dark() ? 'dark' : 'light'));
  private readonly editor = viewChild(ExcalidrawComponent);
  protected readonly ready = computed(() => this.editor()?.ready() ?? false);

  protected async exportSvg(): Promise<void> {
    const svg = await this.editor()!.exportToSvg();
    this.exportedSvgUrl.set(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`,
    );
  }

  protected onEditorError(error: unknown): void {
    console.error('Excalidraw failed', error);
  }
}
