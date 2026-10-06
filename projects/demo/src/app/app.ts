import { PlatformLocation } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { ExcalidrawComponent, ExcalidrawData, type ExcalidrawSceneChange } from 'ngx-excalidraw';

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
      <button type="button" data-testid="export-svg" [disabled]="!api()" (click)="exportSvg()">
        Export SVG
      </button>
      <div data-testid="exported-svg" #exportedSvgTarget></div>
      <p data-testid="scene-elements">elements: {{ elementCount() }}</p>
      <p data-testid="library-items">library: {{ libraryItemCount() }}</p>
      @if (editorShown()) {
        <ngx-excalidraw
          [theme]="theme()"
          [viewModeEnabled]="viewMode()"
          [mainMenu]="mainMenu()"
          (api)="onApi($event)"
          (editorError)="onEditorError($event)"
          (sceneChange)="onSceneChange($event)"
          (libraryChange)="libraryItemCount.set($event.length)"
        />
      }
    </main>
  `,
})
export class App {
  protected readonly ready = signal(false);
  protected readonly dark = signal(false);
  protected readonly viewMode = signal(false);
  protected readonly mainMenu = signal(
    new URLSearchParams(inject(PlatformLocation).search).get('mainMenu') !== 'false',
  );
  protected readonly elementCount = signal(0);
  protected readonly libraryItemCount = signal(0);
  protected readonly editorShown = signal(true);
  protected readonly theme = computed(() => (this.dark() ? 'dark' : 'light'));
  protected readonly api = signal<ExcalidrawImperativeAPI | undefined>(undefined);
  private readonly exportedSvg = signal<SVGSVGElement | undefined>(undefined);
  private readonly exportedSvgTarget =
    viewChild.required<ElementRef<HTMLElement>>('exportedSvgTarget');
  private readonly excalidrawData = inject(ExcalidrawData);

  constructor() {
    effect(() => {
      const svg = this.exportedSvg();
      if (svg) this.exportedSvgTarget().nativeElement.replaceChildren(svg);
    });
  }

  protected onApi(api: ExcalidrawImperativeAPI): void {
    this.api.set(api);
    this.ready.set(true);
  }

  protected async exportSvg(): Promise<void> {
    const api = this.api()!;
    this.exportedSvg.set(
      await this.excalidrawData.exportToSvg({
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
      }),
    );
  }

  protected onSceneChange({ elements }: ExcalidrawSceneChange): void {
    this.elementCount.set(elements.filter(({ isDeleted }) => !isDeleted).length);
  }

  protected onEditorError(error: unknown): void {
    console.error('Excalidraw failed', error);
  }
}
