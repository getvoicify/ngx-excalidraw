import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import {
  coalesceSceneChanges,
  pageHiddenEvents,
  type FrameScheduler,
  type PageHiddenSource,
} from './scene-change';

function fakeFrames() {
  const pending = new Map<number, () => void>();
  let nextHandle = 1;
  const frames: FrameScheduler = {
    request: (callback) => {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      pending.delete(handle);
    },
  };
  const runFrame = () => {
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach((callback) => callback());
  };
  return { frames, runFrame, pendingCount: () => pending.size };
}

function fakePage() {
  const listeners = new Set<() => void>();
  const source: PageHiddenSource = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    hide: () => listeners.forEach((listener) => listener()),
    listenerCount: () => listeners.size,
  };
}

const element = (id: string, versionNonce: number) =>
  ({ id, versionNonce }) as unknown as ExcalidrawElement;
const appState = (scrollX: number, settings: Partial<AppState> = {}) =>
  ({ scrollX, ...settings }) as unknown as AppState;
const noFiles = {} as BinaryFiles;
const sumOfNonces = (elements: readonly ExcalidrawElement[]) =>
  elements.reduce((sum, { versionNonce }) => sum + versionNonce, 0);

describe('coalesceSceneChanges', () => {
  function setUp() {
    const { frames, runFrame, pendingCount } = fakeFrames();
    const page = fakePage();
    const emit = vi.fn();
    const scene = coalesceSceneChanges({
      frames,
      pageHidden: page.source,
      sceneVersion: sumOfNonces,
      emit,
    });
    return { scene, emit, runFrame, pendingCount, page };
  }

  it('emits once per frame with the latest scene when many changes arrive within it', () => {
    const { scene, emit, runFrame } = setUp();
    const latest = [element('a', 3)];

    scene.onChange([element('a', 1)], appState(0), noFiles);
    scene.onChange([element('a', 2)], appState(0), noFiles);
    scene.onChange(latest, appState(5), noFiles);
    expect(emit).not.toHaveBeenCalled();
    runFrame();

    expect(emit.mock.calls).toEqual([
      [
        {
          elements: latest,
          nonDeletedElements: latest,
          appState: appState(5),
          files: noFiles,
          version: 3,
        },
      ],
    ]);
  });

  it('reports the elements left after deletions apart from the tombstones it keeps in elements', () => {
    const { scene, emit, runFrame } = setUp();
    const kept = element('kept', 1);
    const deleted = { ...element('deleted', 2), isDeleted: true } as ExcalidrawElement;

    scene.onChange([kept, deleted], appState(0), noFiles);
    runFrame();

    const [{ elements, nonDeletedElements }] = emit.mock.lastCall!;
    expect(elements).toEqual([kept, deleted]);
    expect(nonDeletedElements).toEqual([kept]);
  });

  it('requests a single frame however many changes arrive before it runs', () => {
    const { scene, pendingCount } = setUp();

    scene.onChange([element('a', 1)], appState(0), noFiles);
    scene.onChange([element('a', 2)], appState(0), noFiles);

    expect(pendingCount()).toBe(1);
  });

  it('skips a frame whose scene version and files are unchanged since the last emission', () => {
    const { scene, emit, runFrame } = setUp();
    scene.onChange([element('a', 1)], appState(0), noFiles);
    runFrame();

    scene.onChange([element('a', 1)], appState(300), noFiles);
    runFrame();

    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('emits again when only the files change', () => {
    const { scene, emit, runFrame } = setUp();
    scene.onChange([element('a', 1)], appState(0), noFiles);
    runFrame();

    const files = { image: { id: 'image' } } as unknown as BinaryFiles;
    scene.onChange([element('a', 1)], appState(0), files);
    runFrame();

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.lastCall?.[0].files).toBe(files);
  });

  it.each<[string, Partial<AppState>]>([
    ['viewBackgroundColor', { viewBackgroundColor: '#ffc9c9' }],
    ['gridModeEnabled', { gridModeEnabled: true }],
    ['gridSize', { gridSize: 40 }],
    ['gridStep', { gridStep: 10 }],
  ])('emits again when only the persisted canvas setting %s changes', (_key, changed) => {
    const { scene, emit, runFrame } = setUp();
    scene.onChange([element('a', 1)], appState(0), noFiles);
    runFrame();

    scene.onChange([element('a', 1)], appState(0, changed), noFiles);
    runFrame();

    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('emits nothing when only view state such as zoom or selection changes', () => {
    const { scene, emit, runFrame } = setUp();
    scene.onChange([element('a', 1)], appState(0), noFiles);
    runFrame();

    scene.onChange(
      [element('a', 1)],
      appState(0, {
        zoom: { value: 2 },
        selectedElementIds: { a: true },
      } as unknown as Partial<AppState>),
      noFiles,
    );
    runFrame();

    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('emits a fresh elements array each time even when Excalidraw reuses its live array', () => {
    const { scene, emit, runFrame } = setUp();
    const live = [element('a', 1)];
    scene.onChange(live, appState(0), noFiles);
    runFrame();

    live[0] = element('a', 2);
    scene.onChange(live, appState(0), noFiles);
    runFrame();

    const [[first], [second]] = emit.mock.calls;
    expect(first.elements).not.toBe(second.elements);
    expect(first.elements).not.toBe(live);
    expect(second.elements).toEqual(live);
  });

  it('emits the first scene it sees', () => {
    const { scene, emit, runFrame } = setUp();

    scene.onChange([], appState(0), noFiles);
    runFrame();

    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('emits the pending change synchronously on destroy and nothing afterwards', () => {
    const { scene, emit, runFrame, pendingCount } = setUp();
    const last = [element('a', 1)];
    scene.onChange(last, appState(0), noFiles);

    scene.destroy();
    expect(emit.mock.calls).toEqual([
      [
        {
          elements: last,
          nonDeletedElements: last,
          appState: appState(0),
          files: noFiles,
          version: 1,
        },
      ],
    ]);
    expect(pendingCount()).toBe(0);

    scene.onChange([element('a', 2)], appState(0), noFiles);
    expect(pendingCount()).toBe(0);
    runFrame();
    scene.destroy();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('emits nothing on destroy when the pending change leaves the scene unchanged', () => {
    const { scene, emit, runFrame } = setUp();
    scene.onChange([element('a', 1)], appState(0), noFiles);
    runFrame();
    scene.onChange([element('a', 1)], appState(300), noFiles);

    scene.destroy();

    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('emits nothing on destroy when no change is pending', () => {
    const { scene, emit } = setUp();

    scene.destroy();

    expect(emit).not.toHaveBeenCalled();
  });

  it('emits the pending change synchronously when the page is hidden', () => {
    const { scene, emit, runFrame, page, pendingCount } = setUp();
    scene.onChange([element('a', 1)], appState(0), noFiles);

    page.hide();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(pendingCount()).toBe(0);
    runFrame();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('keeps coalescing changes that arrive after the page was hidden', () => {
    const { scene, emit, runFrame, page } = setUp();
    page.hide();

    scene.onChange([element('a', 1)], appState(0), noFiles);
    runFrame();

    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('stops listening for the page being hidden once destroyed', () => {
    const { scene, page } = setUp();
    expect(page.listenerCount()).toBe(1);

    scene.destroy();

    expect(page.listenerCount()).toBe(0);
  });
});

describe('pageHiddenEvents', () => {
  const setVisibility = (state: DocumentVisibilityState) =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });

  afterEach(() => delete (document as { visibilityState?: unknown }).visibilityState);

  it('reports the document becoming hidden and the page being hidden', () => {
    const listener = vi.fn();
    const stop = pageHiddenEvents(window).subscribe(listener);

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));

    expect(listener).toHaveBeenCalledTimes(2);
    stop();
  });

  it('ignores the document becoming visible again', () => {
    const listener = vi.fn();
    const stop = pageHiddenEvents(window).subscribe(listener);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it('reports nothing once unsubscribed', () => {
    const listener = vi.fn();
    pageHiddenEvents(window).subscribe(listener)();

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));

    expect(listener).not.toHaveBeenCalled();
  });
});
