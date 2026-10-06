import { Component, PLATFORM_ID, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
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
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.ngx-excalidraw-placeholder')).not.toBeNull();
    pending.resolve(fake.factory);
    await flush();
    await fixture.whenStable();
    expect(host.querySelector('.ngx-excalidraw-placeholder')).toBeNull();
  });

  it('emits the imperative API only once even if Excalidraw hands it over again', async () => {
    configure();
    const fixture = await mount();
    const emitted: ExcalidrawImperativeAPI[] = [];
    fixture.componentInstance.api.subscribe((api) => emitted.push(api));
    const api = {} as ExcalidrawImperativeAPI;
    fake.created[0].callbacks.onApi(api);
    fake.created[0].callbacks.onApi({} as ExcalidrawImperativeAPI);
    expect(emitted).toEqual([api]);
  });

  it('never creates the renderer when destroyed before the bundle finishes loading', async () => {
    const pending = deferred<ExcalidrawRendererFactory>();
    loader.mockReturnValue(pending.promise);
    configure();
    const fixture = await mount();
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
    const fixture = TestBed.createComponent(TwoInstancesHost);
    await fixture.whenStable();
    const links = document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"][href="excalidraw.css"]',
    );
    expect(links).toHaveLength(1);
    expect(fake.created).toHaveLength(0);
    links[0].dispatchEvent(new Event('load'));
    await flush();
    expect(fake.created).toHaveLength(2);
  });

  it('still mounts when the configured stylesheet fails to load', async () => {
    configure([provideExcalidraw({ styleUrl: 'missing.css' })]);
    TestBed.createComponent(ExcalidrawComponent);
    await flush();
    document.head.querySelector('link[href="missing.css"]')!.dispatchEvent(new Event('error'));
    await flush();
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
});
