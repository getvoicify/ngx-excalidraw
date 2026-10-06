import {
  Component,
  PendingTasks,
  PLATFORM_ID,
  provideZonelessChangeDetection,
  signal,
  Type,
  WritableSignal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  LibraryItems,
} from '@excalidraw/excalidraw/types';
import { EXCALIDRAW_MODULE_LOADER, type ExcalidrawDataModule } from './excalidraw-data';
import { ExcalidrawComponent } from './excalidraw.component';
import { provideExcalidrawLibrary } from './library';
import { provideExcalidraw } from './provide-excalidraw';
import { EXCALIDRAW_RENDERER_LOADER } from './renderer-loader';
import type {
  ExcalidrawRenderer,
  ExcalidrawRendererCallbacks,
  ExcalidrawRendererFactory,
} from './renderer';
import type { ExcalidrawSceneChange } from './scene-change';

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

const isDestroyedOutputWarning = (message: string) =>
  message.includes('Unexpected emit for destroyed');

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
  template: `<ngx-excalidraw [viewModeEnabled]="viewModeEnabled()" />`,
})
class OptionalBooleanHost {
  readonly viewModeEnabled = signal<boolean | undefined>(true);
}

@Component({
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw
    [handleKeyboardGlobally]="handleKeyboardGlobally()"
    [objectsSnapModeEnabled]="objectsSnapModeEnabled()"
    [name]="name()"
    [autoFocus]="autoFocus()"
    [detectScroll]="detectScroll()"
  />`,
})
class MountOnlyInputsHost {
  readonly handleKeyboardGlobally = signal(false);
  readonly objectsSnapModeEnabled = signal(false);
  readonly name = signal('first');
  readonly autoFocus = signal(false);
  readonly detectScroll = signal(false);
}

@Component({
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw (sceneChange)="received.push($event)" />`,
})
class SceneChangeHost {
  readonly received: ExcalidrawSceneChange[] = [];
}

@Component({
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw [libraryReturnUrl]="libraryReturnUrl()" />`,
})
class LibraryReturnUrlHost {
  readonly libraryReturnUrl = signal('https://app.test/first');
}

@Component({
  imports: [ExcalidrawComponent],
  template: `@for (id of shown(); track id) {
    <ngx-excalidraw [id]="id" />
  }`,
})
class TwoLibraryEditorsHost {
  readonly shown = signal(['a', 'b']);
}

@Component({
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw [mainMenu]="mainMenu()" />`,
})
class MainMenuHost {
  readonly mainMenu = signal(true);
}

@Component({
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw mainMenu="false" /><ngx-excalidraw mainMenu />`,
})
class MainMenuAttributesHost {}

@Component({
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw mainMenu="false" handleKeyboardGlobally />`,
})
class GlobalKeyboardWithoutMainMenuHost {}

const pressHelp = (target: EventTarget) => {
  const event = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
};

function apiWithOpenMenu(openMenu: string | null) {
  return {
    getAppState: () => ({ openMenu }),
    updateScene: vi.fn(),
  } as unknown as ExcalidrawImperativeAPI & { updateScene: ReturnType<typeof vi.fn> };
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

  it('emits the scene changes the renderer reports through sceneChange', async () => {
    configure();
    const fixture = await mount();
    const emitted: ExcalidrawSceneChange[] = [];
    fixture.componentInstance.sceneChange.subscribe((change) => emitted.push(change));
    const change = {
      elements: [],
      appState: {},
      files: {},
      version: 7,
    } as unknown as ExcalidrawSceneChange;

    fake.created[0].callbacks.onSceneChange(change);

    expect(emitted).toEqual([change]);
  });

  describe('ready', () => {
    const handedOverApi = { getAppState: () => ({}) } as unknown as ExcalidrawImperativeAPI;

    it('is false while the editor has mounted but not handed over its API', async () => {
      configure();
      const fixture = await mount();

      expect(fixture.componentInstance.ready()).toBe(false);
    });

    it('is true once the editor has handed over its API', async () => {
      configure();
      const fixture = await mount();

      fake.created[0].callbacks.onApi(handedOverApi);

      expect(fixture.componentInstance.ready()).toBe(true);
    });

    it('is false again once the component is destroyed', async () => {
      configure();
      const fixture = await mount();
      fake.created[0].callbacks.onApi(handedOverApi);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      onTestFinished(() => warn.mockRestore());

      fixture.destroy();

      expect(fixture.componentInstance.ready()).toBe(false);
    });

    it('is false again once a crashed editor has been torn down', async () => {
      configure();
      const fixture = await mount();
      fake.created[0].callbacks.onApi(handedOverApi);

      fake.created[0].callbacks.onError(new Error('Excalidraw crashed'));
      await fixture.whenStable();

      expect(fixture.componentInstance.ready()).toBe(false);
    });
  });

  it('holds no scene until the renderer reports the first one', async () => {
    configure();
    const fixture = await mount();

    expect(fixture.componentInstance.scene()).toBeUndefined();
  });

  it('holds the latest scene change the renderer reported in its scene signal', async () => {
    configure();
    const fixture = await mount();
    const first = { version: 1 } as unknown as ExcalidrawSceneChange;
    const latest = { version: 2 } as unknown as ExcalidrawSceneChange;

    fake.created[0].callbacks.onSceneChange(first);
    fake.created[0].callbacks.onSceneChange(latest);

    expect(fixture.componentInstance.scene()).toBe(latest);
  });

  it('drops the scene once a crashed editor has been torn down', async () => {
    configure();
    const fixture = await mount();
    const [{ callbacks }] = fake.created;
    callbacks.onSceneChange({ version: 1 } as unknown as ExcalidrawSceneChange);

    callbacks.onError(new Error('Excalidraw crashed'));
    await fixture.whenStable();

    expect(fixture.componentInstance.scene()).toBeUndefined();
  });

  it('takes no scene the renderer reports after the component is destroyed', async () => {
    configure();
    const fixture = await mount();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    onTestFinished(() => warn.mockRestore());
    fixture.destroy();

    fake.created[0].callbacks.onSceneChange({ version: 2 } as unknown as ExcalidrawSceneChange);

    expect(fixture.componentInstance.scene()).toBeUndefined();
  });

  it('delivers the last scene change the renderer flushes while being destroyed', async () => {
    configure();
    const fixture = TestBed.createComponent(SceneChangeHost);
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();
    const [{ callbacks, renderer }] = fake.created;
    const last = { version: 9 } as unknown as ExcalidrawSceneChange;
    vi.mocked(renderer.destroy).mockImplementation(() => callbacks.onSceneChange(last));
    const received = fixture.componentInstance.received;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    onTestFinished(() => warn.mockRestore());

    fixture.destroy();

    expect(received).toEqual([last]);
    expect(warn.mock.calls.map(String).filter(isDestroyedOutputWarning)).toEqual([]);
  });

  it('emits no scene change the renderer reports after the component is destroyed', async () => {
    configure();
    const fixture = await mount();
    const emitted: ExcalidrawSceneChange[] = [];
    fixture.componentInstance.sceneChange.subscribe((change) => emitted.push(change));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    onTestFinished(() => warn.mockRestore());
    fixture.destroy();

    fake.created[0].callbacks.onSceneChange({ version: 1 } as unknown as ExcalidrawSceneChange);

    expect(emitted).toEqual([]);
    expect(warn.mock.calls.map(String).filter(isDestroyedOutputWarning)).toEqual([]);
  });

  it('emits the library items the renderer reports through libraryChange', async () => {
    configure();
    const fixture = await mount();
    const emitted: LibraryItems[] = [];
    fixture.componentInstance.libraryChange.subscribe((items) => emitted.push(items));
    const items = [{ id: 'box' }] as unknown as LibraryItems;

    fake.created[0].callbacks.onLibraryChange(items);

    expect(emitted).toEqual([items]);
  });

  it('emits no library change the renderer reports after the component is destroyed', async () => {
    configure();
    const fixture = await mount();
    const emitted: LibraryItems[] = [];
    fixture.componentInstance.libraryChange.subscribe((items) => emitted.push(items));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    onTestFinished(() => warn.mockRestore());
    fixture.destroy();

    fake.created[0].callbacks.onLibraryChange([]);

    expect(emitted).toEqual([]);
    expect(warn.mock.calls.map(String).filter(isDestroyedOutputWarning)).toEqual([]);
  });

  it('hands the provided library adapter and URL validator to the renderer', async () => {
    const adapter = { load: () => null, save: () => undefined };
    const validateLibraryUrl = () => true;
    configure([provideExcalidrawLibrary({ adapter, validateLibraryUrl })]);

    await mount();

    expect(vi.mocked(fake.created[0].renderer.render).mock.lastCall?.[1]).toEqual({
      adapter,
      validateLibraryUrl,
    });
  });

  it('leaves library handling off unless a library is provided', async () => {
    configure();
    await mount();
    expect(vi.mocked(fake.created[0].renderer.render).mock.lastCall?.[1]).toBeUndefined();
  });

  describe('with two editors on one page', () => {
    const liveEditors = () =>
      fake.created.filter(({ renderer }) => !vi.mocked(renderer.destroy).mock.calls.length);
    const idOf = ({ host }: { host: HTMLElement }) => host.closest('ngx-excalidraw')!.id;
    const editorsHandlingTheLibrary = () =>
      liveEditors()
        .filter(({ renderer }) => vi.mocked(renderer.render).mock.lastCall?.[1] !== undefined)
        .map(idOf);

    async function mountTwoEditors() {
      configure([provideExcalidrawLibrary({})]);
      const fixture = await startLoading(TwoLibraryEditorsHost);
      await fixture.whenStable();
      return fixture;
    }

    it('runs library handling in only one of them', async () => {
      await mountTwoEditors();

      expect(editorsHandlingTheLibrary()).toHaveLength(1);
    });

    it('hands library handling to the remaining editor when the owner is destroyed', async () => {
      const fixture = await mountTwoEditors();
      const [owner] = editorsHandlingTheLibrary();

      fixture.componentInstance.shown.update((ids) => ids.filter((id) => id !== owner));
      await fixture.whenStable();

      expect(liveEditors().map(idOf)).toEqual(fixture.componentInstance.shown());
      expect(editorsHandlingTheLibrary()).toEqual(fixture.componentInstance.shown());
    });
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
    fixture.componentInstance.editorError.subscribe((error) => errors.push(error));
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(errors).toEqual([failure]);
    expect(host.querySelector('.ngx-excalidraw-placeholder')).not.toBeNull();
    expect(host.querySelector('.ngx-excalidraw-mount')).toBeNull();
  });

  it('tears down the editor and reports a crash Excalidraw raises while running', async () => {
    configure();
    const fixture = await mount();
    const errors: unknown[] = [];
    fixture.componentInstance.editorError.subscribe((error) => errors.push(error));
    const [{ callbacks, renderer }] = fake.created;
    const crash = new Error('Excalidraw crashed');

    callbacks.onError(crash);
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(errors).toEqual([crash]);
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.ngx-excalidraw-placeholder')).not.toBeNull();
    expect(host.querySelector('.ngx-excalidraw-mount')).toBeNull();
  });

  it('emits editorError and keeps the placeholder when the bundle fails to load', async () => {
    const failure = new Error('chunk failed');
    loader.mockImplementation(() => Promise.reject(failure));
    configure();
    const fixture = TestBed.createComponent(ExcalidrawComponent);
    const errors: unknown[] = [];
    fixture.componentInstance.editorError.subscribe((error) => errors.push(error));
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();
    expect(errors).toEqual([failure]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.ngx-excalidraw-placeholder'),
    ).not.toBeNull();
  });

  describe('Excalidraw props', () => {
    const renderCalls = () =>
      vi.mocked(fake.created[0].renderer.render).mock.calls.map(([props]) => [props]);

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

    it.each([
      ['handleKeyboardGlobally', true],
      ['objectsSnapModeEnabled', true],
      ['name', 'renamed'],
      ['autoFocus', true],
      ['detectScroll', true],
    ] as const)(
      'never re-renders for a %s change, since Excalidraw reads it only at mount',
      async (input, changed) => {
        configure();
        const fixture = await startLoading(MountOnlyInputsHost);
        await fixture.whenStable();
        const rendersAfterMount = renderCalls().length;

        (fixture.componentInstance[input] as WritableSignal<unknown>).set(changed);
        await fixture.whenStable();

        expect(renderCalls()).toHaveLength(rendersAfterMount);
      },
    );

    it('pushes a changed libraryReturnUrl into the mounted editor', async () => {
      configure();
      const fixture = await startLoading(LibraryReturnUrlHost);
      await fixture.whenStable();
      expect(renderCalls().at(-1)).toStrictEqual([{ libraryReturnUrl: 'https://app.test/first' }]);

      fixture.componentInstance.libraryReturnUrl.set('https://app.test/second');
      await fixture.whenStable();

      expect(fake.created).toHaveLength(1);
      expect(renderCalls().at(-1)).toStrictEqual([{ libraryReturnUrl: 'https://app.test/second' }]);
    });

    it("falls back to Excalidraw's default when a boolean input is bound to undefined", async () => {
      configure();
      const fixture = await startLoading(OptionalBooleanHost);
      await fixture.whenStable();
      expect(renderCalls().at(-1)).toStrictEqual([{ viewModeEnabled: true }]);

      fixture.componentInstance.viewModeEnabled.set(undefined);
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

  describe('scene actions', () => {
    const elements = [{ id: 'rect', type: 'rectangle' }];
    const appState = { viewBackgroundColor: '#ffc9c9' };
    const files = { image: { id: 'image' } };
    const editorApi = {
      getSceneElements: () => elements,
      getAppState: () => appState,
      getFiles: () => files,
    } as unknown as ExcalidrawImperativeAPI;
    let excalidraw: Record<keyof ExcalidrawDataModule, ReturnType<typeof vi.fn>>;

    beforeEach(() => {
      excalidraw = {
        exportToSvg: vi.fn(() => Promise.resolve('svg')),
        exportToBlob: vi.fn(() => Promise.resolve('blob')),
        serializeAsJSON: vi.fn(() => 'json'),
        loadFromBlob: vi.fn(),
        loadLibraryFromBlob: vi.fn(),
      };
      configure([
        { provide: EXCALIDRAW_MODULE_LOADER, useValue: () => Promise.resolve(excalidraw) },
      ]);
    });

    async function mountWithEditor() {
      const fixture = await mount();
      fake.created[0].callbacks.onApi(editorApi);
      return fixture.componentInstance;
    }

    it("exports the editor's current scene as SVG with the given options", async () => {
      const editor = await mountWithEditor();

      await expect(editor.exportToSvg({ exportPadding: 8 })).resolves.toBe('svg');

      expect(excalidraw.exportToSvg.mock.calls).toEqual([
        [{ elements, appState, files, exportPadding: 8 }],
      ]);
    });

    it("exports the editor's current scene as a blob with the given options", async () => {
      const editor = await mountWithEditor();

      await expect(editor.exportToBlob({ mimeType: 'image/jpeg' })).resolves.toBe('blob');

      expect(excalidraw.exportToBlob.mock.calls).toEqual([
        [{ elements, appState, files, mimeType: 'image/jpeg' }],
      ]);
    });

    it("serializes the editor's current scene as a local file unless told otherwise", async () => {
      const editor = await mountWithEditor();

      await expect(editor.serializeAsJSON()).resolves.toBe('json');
      await editor.serializeAsJSON('database');

      expect(excalidraw.serializeAsJSON.mock.calls).toEqual([
        [elements, appState, files, 'local'],
        [elements, appState, files, 'database'],
      ]);
    });

    it('rejects every action while no editor is mounted', async () => {
      const editor = (await mount()).componentInstance;

      await expect(editor.exportToSvg()).rejects.toThrow(/no editor is mounted/);
      await expect(editor.exportToBlob()).rejects.toThrow(/no editor is mounted/);
      await expect(editor.serializeAsJSON()).rejects.toThrow(/no editor is mounted/);
      expect(excalidraw.exportToSvg).not.toHaveBeenCalled();
    });

    it('rejects once the editor has been torn down', async () => {
      const fixture = await mount();
      fake.created[0].callbacks.onApi(editorApi);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      onTestFinished(() => warn.mockRestore());
      fixture.destroy();

      await expect(fixture.componentInstance.exportToSvg()).rejects.toThrow(/no editor is mounted/);
    });
  });

  describe('main menu', () => {
    const hidesMainMenu = (element: Element) =>
      element.classList.contains('ngx-excalidraw--no-main-menu');
    const editorHost = (fixture: ComponentFixture<unknown>, index = 0) =>
      (fixture.nativeElement as HTMLElement).querySelectorAll('ngx-excalidraw')[index];

    it('shows the main menu unless told otherwise', async () => {
      configure();
      const fixture = await mount();
      expect(hidesMainMenu(fixture.nativeElement)).toBe(false);
    });

    it('marks the host to hide the main menu while the input is false, and unmarks it again', async () => {
      configure();
      const fixture = await startLoading(MainMenuHost);
      await fixture.whenStable();

      fixture.componentInstance.mainMenu.set(false);
      await fixture.whenStable();
      expect(hidesMainMenu(editorHost(fixture))).toBe(true);

      fixture.componentInstance.mainMenu.set(true);
      await fixture.whenStable();
      expect(hidesMainMenu(editorHost(fixture))).toBe(false);
    });

    it('marks the host before anything loads, so the server render already hides the menu', async () => {
      configure([{ provide: PLATFORM_ID, useValue: 'server' }]);
      const fixture = TestBed.createComponent(MainMenuHost);
      fixture.componentInstance.mainMenu.set(false);
      await fixture.whenStable();
      expect(hidesMainMenu(editorHost(fixture))).toBe(true);
      expect(loader).not.toHaveBeenCalled();
    });

    it('accepts the main menu flag as a plain attribute', async () => {
      configure();
      const fixture = await startLoading(MainMenuAttributesHost);
      await fixture.whenStable();
      expect(hidesMainMenu(editorHost(fixture, 0))).toBe(true);
      expect(hidesMainMenu(editorHost(fixture, 1))).toBe(false);
    });

    it('never re-renders the editor for a main menu change', async () => {
      configure();
      const fixture = await startLoading(MainMenuHost);
      await fixture.whenStable();
      const rendersAfterMount = vi.mocked(fake.created[0].renderer.render).mock.calls.length;

      fixture.componentInstance.mainMenu.set(false);
      await fixture.whenStable();

      expect(fake.created).toHaveLength(1);
      expect(fake.created[0].renderer.render).toHaveBeenCalledTimes(rendersAfterMount);
    });

    it('closes the main menu when it is open as it gets hidden', async () => {
      configure();
      const fixture = await startLoading(MainMenuHost);
      await fixture.whenStable();
      const api = apiWithOpenMenu('canvas');
      fake.created[0].callbacks.onApi(api);
      await fixture.whenStable();

      fixture.componentInstance.mainMenu.set(false);
      await fixture.whenStable();

      expect(api.updateScene).toHaveBeenCalledExactlyOnceWith({ appState: { openMenu: null } });
    });

    it.each([null, 'shape'])(
      'leaves the editor alone when hiding the main menu while openMenu is %s',
      async (openMenu) => {
        configure();
        const fixture = await startLoading(MainMenuHost);
        await fixture.whenStable();
        const api = apiWithOpenMenu(openMenu);
        fake.created[0].callbacks.onApi(api);
        await fixture.whenStable();

        fixture.componentInstance.mainMenu.set(false);
        await fixture.whenStable();

        expect(api.updateScene).not.toHaveBeenCalled();
      },
    );

    it('never reaches into an editor that crashed and was torn down', async () => {
      configure();
      const fixture = await startLoading(MainMenuHost);
      await fixture.whenStable();
      const api = apiWithOpenMenu('canvas');
      fake.created[0].callbacks.onApi(api);
      fake.created[0].callbacks.onError(new Error('crashed'));
      await fixture.whenStable();

      fixture.componentInstance.mainMenu.set(false);
      await fixture.whenStable();

      expect(api.updateScene).not.toHaveBeenCalled();
    });

    it('keeps main menu shortcuts from the editor only while the menu is hidden', async () => {
      configure();
      const fixture = await startLoading(MainMenuHost);
      await fixture.whenStable();
      const [{ host: mountElement }] = fake.created;
      expect(pressHelp(mountElement)).toBe(false);

      fixture.componentInstance.mainMenu.set(false);
      await fixture.whenStable();
      expect(pressHelp(mountElement)).toBe(true);

      fixture.componentInstance.mainMenu.set(true);
      await fixture.whenStable();
      expect(pressHelp(mountElement)).toBe(false);
    });

    it('stops guarding shortcuts once the component is destroyed', async () => {
      configure();
      const fixture = await startLoading(MainMenuHost);
      fixture.componentInstance.mainMenu.set(false);
      await fixture.whenStable();
      const [{ host: mountElement }] = fake.created;

      fixture.destroy();

      expect(pressHelp(mountElement)).toBe(false);
    });

    it('guards shortcuts pressed anywhere on the page when Excalidraw handles the keyboard globally', async () => {
      configure();
      const fixture = await startLoading(GlobalKeyboardWithoutMainMenuHost);
      await fixture.whenStable();
      try {
        expect(pressHelp(document.body)).toBe(true);
      } finally {
        fixture.destroy();
      }
    });

    it('leaves an open main menu alone while it stays shown', async () => {
      configure();
      const fixture = await startLoading(MainMenuHost);
      await fixture.whenStable();
      const api = apiWithOpenMenu('canvas');
      fake.created[0].callbacks.onApi(api);
      await fixture.whenStable();

      expect(api.updateScene).not.toHaveBeenCalled();
    });
  });
});
