import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  provideZonelessChangeDetection,
  signal,
  ɵNoopNgZone as NoopNgZone,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { ExcalidrawComponent } from './excalidraw.component';
import { EXCALIDRAW_RENDERER_LOADER } from './renderer-loader';
import type { ExcalidrawRendererCallbacks, ExcalidrawRendererFactory } from './renderer';
import type { ExcalidrawSceneChange } from './scene-change';

@Component({
  imports: [ExcalidrawComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>{{ status() }}</p>
    <ngx-excalidraw (api)="status.set('ready')" />`,
})
class OnPushHost {
  readonly status = signal('loading');
}

@Component({
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw [theme]="theme()" />`,
})
class ThemedHost {
  readonly theme = signal<'light' | 'dark'>('light');
}

class RecordingZone extends NoopNgZone {
  inside = true;

  override run<T>(fn: (...args: unknown[]) => T): T {
    return this.within(true, fn);
  }

  override runOutsideAngular<T>(fn: (...args: unknown[]) => T): T {
    return this.within(false, fn);
  }

  private within<T>(inside: boolean, fn: () => T): T {
    const previous = this.inside;
    this.inside = inside;
    try {
      return fn();
    } finally {
      this.inside = previous;
    }
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

function rendererHandingOverApi() {
  const handed: { callbacks?: ExcalidrawRendererCallbacks; zoneInsideAtRender?: boolean } = {};
  const factory =
    (zone?: RecordingZone): ExcalidrawRendererFactory =>
    (_host, callbacks) => {
      handed.callbacks = callbacks;
      return {
        render: () => {
          handed.zoneInsideAtRender = zone?.inside;
        },
        destroy: () => undefined,
      };
    };
  return { handed, factory };
}

describe('ExcalidrawComponent change detection', () => {
  it('updates an OnPush parent when the API arrives from a React callback without zone.js', async () => {
    const { handed, factory } = rendererHandingOverApi();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: EXCALIDRAW_RENDERER_LOADER, useValue: () => Promise.resolve(factory()) },
      ],
    });
    const fixture = TestBed.createComponent(OnPushHost);
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();

    setTimeout(() => handed.callbacks!.onApi({} as ExcalidrawImperativeAPI));
    await flush();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('p')!.textContent).toBe('ready');
  });

  it('runs React work outside the Angular zone and emits the API inside it', async () => {
    const zone = new RecordingZone();
    const { handed, factory } = rendererHandingOverApi();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: NgZone, useValue: zone },
        { provide: EXCALIDRAW_RENDERER_LOADER, useValue: () => Promise.resolve(factory(zone)) },
      ],
    });
    const fixture = TestBed.createComponent(ExcalidrawComponent);
    let zoneInsideAtEmit: boolean | undefined;
    fixture.componentInstance.api.subscribe(() => (zoneInsideAtEmit = zone.inside));
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();

    zone.runOutsideAngular(() => handed.callbacks!.onApi({} as ExcalidrawImperativeAPI));

    expect(handed.zoneInsideAtRender).toBe(false);
    expect(zoneInsideAtEmit).toBe(true);
  });

  it('emits scene changes inside the Angular zone', async () => {
    const zone = new RecordingZone();
    const { handed, factory } = rendererHandingOverApi();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: NgZone, useValue: zone },
        { provide: EXCALIDRAW_RENDERER_LOADER, useValue: () => Promise.resolve(factory(zone)) },
      ],
    });
    const fixture = TestBed.createComponent(ExcalidrawComponent);
    let zoneInsideAtEmit: boolean | undefined;
    fixture.componentInstance.sceneChange.subscribe(() => (zoneInsideAtEmit = zone.inside));
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();

    zone.runOutsideAngular(() =>
      handed.callbacks!.onSceneChange({ version: 1 } as unknown as ExcalidrawSceneChange),
    );

    expect(zoneInsideAtEmit).toBe(true);
  });

  it('emits library changes inside the Angular zone', async () => {
    const zone = new RecordingZone();
    const { handed, factory } = rendererHandingOverApi();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: NgZone, useValue: zone },
        { provide: EXCALIDRAW_RENDERER_LOADER, useValue: () => Promise.resolve(factory(zone)) },
      ],
    });
    const fixture = TestBed.createComponent(ExcalidrawComponent);
    let zoneInsideAtEmit: boolean | undefined;
    fixture.componentInstance.libraryChange.subscribe(() => (zoneInsideAtEmit = zone.inside));
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();

    zone.runOutsideAngular(() => handed.callbacks!.onLibraryChange([]));

    expect(zoneInsideAtEmit).toBe(true);
  });

  it('pushes input changes into React outside the Angular zone', async () => {
    const zone = new RecordingZone();
    const { handed, factory } = rendererHandingOverApi();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: NgZone, useValue: zone },
        { provide: EXCALIDRAW_RENDERER_LOADER, useValue: () => Promise.resolve(factory(zone)) },
      ],
    });
    const fixture = TestBed.createComponent(ThemedHost);
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();
    handed.zoneInsideAtRender = undefined;

    fixture.componentInstance.theme.set('dark');
    await fixture.whenStable();

    expect(handed.zoneInsideAtRender).toBe(false);
  });
});
