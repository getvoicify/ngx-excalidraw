import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  NgZone,
  output,
  PLATFORM_ID,
  Renderer2,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { EXCALIDRAW_CONFIG } from './provide-excalidraw';
import type { ExcalidrawRenderer } from './renderer';
import { EXCALIDRAW_RENDERER_LOADER } from './renderer-loader';
import { loadStylesheetOnce } from './stylesheet';

@Component({
  selector: 'ngx-excalidraw',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      position: relative;
    }
    .ngx-excalidraw-placeholder {
      position: absolute;
      inset: 0;
    }
  `,
  template: `
    @if (!mounted()) {
      <ng-content select="[placeholder]">
        <div class="ngx-excalidraw-placeholder" aria-busy="true"></div>
      </ng-content>
    }
  `,
})
export class ExcalidrawComponent {
  readonly api = output<ExcalidrawImperativeAPI>();
  readonly loadError = output<unknown>();

  protected readonly mounted = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly dom = inject(Renderer2);
  private readonly zone = inject(NgZone);
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(EXCALIDRAW_CONFIG);
  private readonly loadRenderer = inject(EXCALIDRAW_RENDERER_LOADER);
  private renderer?: ExcalidrawRenderer;
  private destroyed = false;
  private apiEmitted = false;

  constructor() {
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    afterNextRender(() => {
      if (isBrowser) void this.mount();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.renderer?.destroy();
      this.renderer = undefined;
    });
  }

  private async mount(): Promise<void> {
    try {
      if (this.config.styleUrl) await loadStylesheetOnce(this.document, this.config.styleUrl);
      if (this.destroyed) return;
      if (this.config.assetPath) {
        (
          this.document.defaultView as Window & { EXCALIDRAW_ASSET_PATH?: string }
        ).EXCALIDRAW_ASSET_PATH = this.config.assetPath;
      }
      const createRenderer = await this.loadRenderer();
      if (this.destroyed) return;
      this.zone.runOutsideAngular(() => {
        const mountElement: HTMLElement = this.dom.createElement('div');
        this.dom.addClass(mountElement, 'ngx-excalidraw-mount');
        this.dom.setStyle(mountElement, 'position', 'absolute');
        this.dom.setStyle(mountElement, 'inset', '0');
        this.dom.appendChild(this.host, mountElement);
        this.renderer = createRenderer(mountElement, { onApi: (api) => this.emitApi(api) });
        this.renderer.render({});
      });
      this.mounted.set(true);
    } catch (error) {
      if (!this.destroyed) this.loadError.emit(error);
    }
  }

  private emitApi(api: ExcalidrawImperativeAPI): void {
    if (this.apiEmitted || this.destroyed) return;
    this.apiEmitted = true;
    this.zone.run(() => this.api.emit(api));
  }
}
