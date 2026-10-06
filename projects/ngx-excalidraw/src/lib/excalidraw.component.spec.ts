import {
  Component,
  PendingTasks,
  PLATFORM_ID,
  provideZonelessChangeDetection,
  signal,
  Type,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import { ExcalidrawComponent } from './excalidraw.component';
import { provideExcalidraw } from './provide-excalidraw';
import { EXCALIDRAW_RENDERER_LOADER } from './renderer-loader';
import type {
  ExcalidrawRenderer,
  ExcalidrawRendererCallbacks,
  ExcalidrawRendererFactory,
} from './renderer';

interface FakeRendererHandle {
  factory: ExcalidrawRendererFactory;
  created: {
    host: HTMLElement;
    callbacks: ExcalidrawRendererCallbacks;
    renderer: ExcalidrawRenderer;
  }[];
}

function fakeRenderer(): FakeRendererHandle {
  const handle: FakeRendererHandle = {
    created: [],
    factory: (host, callbacks) => {
      const renderer: ExcalidrawRenderer = { render: vi.fn(), destroy: vi.fn() };
      handle.created.push({ host, callbacks, renderer });
      return renderer;
    },
  };
  return handle;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

@Component({
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw><p placeholder class="custom">Loading the board</p></ngx-excalidraw>`,
})
class ProjectedPlaceholderHost {}

@Component({
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw /><ngx-excalidraw />`,
})
class TwoInstancesHost {}

@Component({
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw
    [theme]="theme()"
    [viewModeEnabled]="viewMode()"
    [initialData]="initialData()"
  />`,
})
class BoundInputsHost {
  readonly theme = signal<'light' | 'dark'>('light');
  readonly viewMode = signal(false);
  readonly initialData = signal<ExcalidrawInitialDataState | null>({ elements: [] });
}

@Component({
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw viewModeEnabled="" zenModeEnabled="false" gridModeEnabled />`,
})
class AttributeBooleansHost {}

@Component({
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw [detectScroll]="detectScroll()" />`,
})
class OptionalBooleanHost {
  readonly detectScroll = signal<boolean | undefined>(true);
}

describe('ExcalidrawComponent', () => {
  let loader: ReturnType<typeof vi.fn>;
  let fake: FakeRendererHandle;

  function configure(extraProviders: unknown[] = []) {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: EXCALIDRAW_RENDERER_LOADER, useValue: loader },
        ...(extraProviders as never[]),
      ],
    });
  }

  async function mount(): Promise<ComponentFixture<ExcalidrawComponent>> {
    const fixture = TestBed.createComponent(ExcalidrawComponent);
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();
    return fixture;
  }

  async function startLoading<T>(component: Type<T>): Promise<ComponentFixture<T>> {
    const fixture = TestBed.createComponent(component);
    TestBed.tick();
    await flush();
    TestBed.tick();
    return fixture;
  }

  beforeEach(() => {
    fake = fakeRenderer();
    loader = vi.fn(() => Promise.resolve(fake.factory));
  });

  afterEach(() => {
    document.head.querySelectorAll('link[data-ngx-excalidraw]').forEach((link) => link.remove());
  });

  it('shows a busy default placeholder before Excalidraw has mounted', () => {
    loader.mockReturnValue(new Promise(() => undefined));
    configure();
    const fixture = TestBed.createComponent(ExcalidrawComponent);
    fixture.detectChanges();
    const placeholder = (fixture.nativeElement as HTMLElement).querySelector(
      '.ngx-excalidraw-placeholder',
    );
    expect(placeholder?.getAttribute('aria-busy')).toBe('true');
  });

  it('shows projected placeholder content instead of the default one', () => {
    loader.mockReturnValue(new Promise(() => undefined));
    configure();
    const fixture = TestBed.createComponent(ProjectedPlaceholderHost);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.custom')?.textContent).toBe('Loading the board');
    expect(host.querySelector('.ngx-excalidraw-placeholder')).toBeNull();
  });

  it('never loads the renderer when rendering on the server', async () => {
    configure([{ provide: PLATFORM_ID, useValue: 'server' }]);
    const fixture = await mount();
    expect(loader).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.ngx-excalidraw-placeholder'),
    ).not.toBeNull();
  });

  it('waits for the application to become stable before loading the bundle', async () => {
    configure();
    const done = TestBed.inject(PendingTasks).add();
    TestBed.createComponent(ExcalidrawComponent);
    TestBed.tick();
    await flush();
    expect(loader).not.toHaveBeenCalled();
    done();
    await flush();
    TestBed.tick();
    await flush();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('loads anyway after the stability fallback when the app never settles', async () => {
    vi.useFakeTimers();
    try {
      configure();
      TestBed.inject(PendingTasks).add();
      TestBed.createComponent(ExcalidrawComponent);
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(1000);
      expect(loader).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5000);
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(0);
      expect(loader).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('creates the renderer on a mount element inside the component and renders it', async () => {
    configure();
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(fake.created).toHaveLength(1);
    const [{ host: mountElement, renderer }] = fake.created;
    expect(host.contains(mountElement)).toBe(true);
    expect(mountElement).not.toBe(host);
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it('removes the placeholder once Excalidraw has mounted', async () => {
    const pending = deferred<ExcalidrawRendererFactory>();
    loader.mockReturnValue(pending.promise);
    configure();
    const fixture = await startLoading(ExcalidrawComponent);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.ngx-excalidraw-placeholder')).not.toBeNull();
    pending.resolve(fake.factory);
    await flush();
    await fixture.whenStable();
    expect(host.querySelector('.ngx-excalidraw-placeholder')).toBeNull();
  });

  it('emits the imperative API that the renderer hands over', async () => {
    configure();
    const fixture = await mount();
    const emitted: ExcalidrawImperativeAPI[] = [];
    fixture.componentInstance.api.subscribe((api) => emitted.push(api));
    const api = { getSceneElements: () => [] } as unknown as ExcalidrawImperativeAPI;
    fake.created[0].callbacks.onApi(api);
    expect(emitted).toEqual([api]);
  });

  it('never creates the renderer when destroyed before the bundle finishes loading', async () => {
    const pending = deferred<ExcalidrawRendererFactory>();
    loader.mockReturnValue(pending.promise);
    configure();
    const fixture = await startLoading(ExcalidrawComponent);
    expect(loader).toHaveBeenCalledTimes(1);
    fixture.destroy();
    pending.resolve(fake.factory);
    await flush();
    expect(fake.created).toHaveLength(0);
  });

  it('destroys the renderer exactly once when the component is destroyed after mounting', async () => {
    configure();
    const fixture = await mount();
    fixture.destroy();
    expect(fake.created[0].renderer.destroy).toHaveBeenCalledTimes(1);
  });

  it('injects the configured stylesheet once for several instances and mounts after it loads', async () => {
    configure([provideExcalidraw({ styleUrl: 'excalidraw.css' })]);
    const fixture = await startLoading(TwoInstancesHost);
    const links = document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"][href="excalidraw.css"]',
    );
    expect(links).toHaveLength(1);
    expect(fake.created).toHaveLength(0);
    links[0].dispatchEvent(new Event('load'));
    await flush();
    await fixture.whenStable();
    expect(fake.created).toHaveLength(2);
  });

  it('skips the bundle import when destroyed while the stylesheet is loading', async () => {
    configure([provideExcalidraw({ styleUrl: 'slow.css' })]);
    const fixture = await startLoading(ExcalidrawComponent);
    fixture.destroy();
    document.head.querySelector('link[href="slow.css"]')!.dispatchEvent(new Event('load'));
    await flush();
    expect(loader).not.toHaveBeenCalled();
  });

  it('still mounts when the configured stylesheet fails to load', async () => {
    configure([provideExcalidraw({ styleUrl: 'missing.css' })]);
    const fixture = TestBed.createComponent(ExcalidrawComponent);
    await flush();
    document.head.querySelector('link[href="missing.css"]')!.dispatchEvent(new Event('error'));
    await flush();
    await fixture.whenStable();
    expect(fake.created).toHaveLength(1);
  });

  it('points Excalidraw at the configured asset path before loading it', async () => {
    let assetPathAtLoad: unknown;
    loader.mockImplementation(() => {
      assetPathAtLoad = (window as unknown as { EXCALIDRAW_ASSET_PATH?: string })
        .EXCALIDRAW_ASSET_PATH;
      return Promise.resolve(fake.factory);
    });
    configure([provideExcalidraw({ assetPath: '/excalidraw-assets/' })]);
    await mount();
    expect(assetPathAtLoad).toBe('/excalidraw-assets/');
    delete (window as unknown as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH;
  });

  it('reports a renderer that fails to mount and leaves no half-mounted editor', async () => {
    const failure = new Error('createRoot failed');
    loader.mockImplementation(() =>
      Promise.resolve(() => {
        throw failure;
      }),
    );
    configure();
    const fixture = TestBed.createComponent(ExcalidrawComponent);
    const errors: unknown[] = [];
    fixture.componentInstance.loadError.subscribe((error) => errors.push(error));
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(errors).toEqual([failure]);
    expect(host.querySelector('.ngx-excalidraw-placeholder')).not.toBeNull();
    expect(host.querySelector('.ngx-excalidraw-mount')).toBeNull();
  });

  it('tears down a renderer whose first render throws and reports it', async () => {
    const failure = new Error('render failed');
    const destroy = vi.fn();
    loader.mockImplementation(() =>
      Promise.resolve(() => ({
        render: () => {
          throw failure;
        },
        destroy,
      })),
    );
    configure();
    const fixture = TestBed.createComponent(ExcalidrawComponent);
    const errors: unknown[] = [];
    fixture.componentInstance.loadError.subscribe((error) => errors.push(error));
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(errors).toEqual([failure]);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.ngx-excalidraw-placeholder')).not.toBeNull();
    expect(host.querySelector('.ngx-excalidraw-mount')).toBeNull();
  });

  it('emits loadError and keeps the placeholder when the bundle fails to load', async () => {
    const failure = new Error('chunk failed');
    loader.mockImplementation(() => Promise.reject(failure));
    configure();
    const fixture = TestBed.createComponent(ExcalidrawComponent);
    const errors: unknown[] = [];
    fixture.componentInstance.loadError.subscribe((error) => errors.push(error));
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();
    expect(errors).toEqual([failure]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.ngx-excalidraw-placeholder'),
    ).not.toBeNull();
  });

  describe('Excalidraw props', () => {
    const renderCalls = () => vi.mocked(fake.created[0].renderer.render).mock.calls;

    it('renders with no props when no input is set, leaving Excalidraw its own defaults', async () => {
      configure();
      await mount();
      expect(renderCalls()).toStrictEqual([[{}]]);
    });

    it('renders with exactly the inputs that are set', async () => {
      configure();
      const fixture = await startLoading(BoundInputsHost);
      await fixture.whenStable();
      expect(renderCalls().at(-1)).toStrictEqual([
        { theme: 'light', viewModeEnabled: false, initialData: { elements: [] } },
      ]);
    });

    it('pushes changed inputs into the same mounted editor instead of remounting', async () => {
      configure();
      const fixture = await startLoading(BoundInputsHost);
      await fixture.whenStable();
      const [{ renderer }] = fake.created;

      fixture.componentInstance.theme.set('dark');
      fixture.componentInstance.viewMode.set(true);
      await fixture.whenStable();

      expect(fake.created).toHaveLength(1);
      expect(renderer.destroy).not.toHaveBeenCalled();
      expect(renderCalls().at(-1)?.[0]).toMatchObject({ theme: 'dark', viewModeEnabled: true });
    });

    it('never re-renders for an initialData change, since Excalidraw reads it only at mount', async () => {
      configure();
      const fixture = await startLoading(BoundInputsHost);
      await fixture.whenStable();
      const rendersAfterMount = renderCalls().length;

      fixture.componentInstance.initialData.set({ elements: [], appState: { name: 'later' } });
      await fixture.whenStable();
      fixture.componentInstance.theme.set('dark');
      await fixture.whenStable();

      expect(renderCalls()).toHaveLength(rendersAfterMount + 1);
    });

    it("falls back to Excalidraw's default when a boolean input is bound to undefined", async () => {
      configure();
      const fixture = await startLoading(OptionalBooleanHost);
      await fixture.whenStable();
      expect(renderCalls().at(-1)).toStrictEqual([{ detectScroll: true }]);

      fixture.componentInstance.detectScroll.set(undefined);
      await fixture.whenStable();

      expect(renderCalls().at(-1)).toStrictEqual([{}]);
    });

    it('accepts boolean inputs as plain attributes', async () => {
      configure();
      const fixture = await startLoading(AttributeBooleansHost);
      await fixture.whenStable();
      expect(renderCalls().at(-1)).toStrictEqual([
        { viewModeEnabled: true, zenModeEnabled: false, gridModeEnabled: true },
      ]);
    });
  });
});
