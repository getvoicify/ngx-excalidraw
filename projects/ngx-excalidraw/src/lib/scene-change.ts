import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';

export interface ExcalidrawSceneChange {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
  version: number;
}

export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export interface PageHiddenSource {
  subscribe(listener: () => void): () => void;
}

export interface SceneChangeTriggers {
  frames: FrameScheduler;
  pageHidden: PageHiddenSource;
}

type SceneChangeListener = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
) => void;

const persistedCanvasSettings = [
  'viewBackgroundColor',
  'gridModeEnabled',
  'gridSize',
  'gridStep',
] as const satisfies readonly (keyof AppState)[];

export function animationFrames(view: Window): FrameScheduler {
  return {
    request: (callback) => view.requestAnimationFrame(callback),
    cancel: (handle) => view.cancelAnimationFrame(handle),
  };
}

export function pageHiddenEvents(view: Window): PageHiddenSource {
  return {
    subscribe: (listener) => {
      const onVisibilityChange = () => {
        if (view.document.visibilityState === 'hidden') listener();
      };
      view.document.addEventListener('visibilitychange', onVisibilityChange);
      view.addEventListener('pagehide', listener);
      return () => {
        view.document.removeEventListener('visibilitychange', onVisibilityChange);
        view.removeEventListener('pagehide', listener);
      };
    },
  };
}

export function coalesceSceneChanges({
  frames,
  pageHidden,
  sceneVersion,
  emit,
}: SceneChangeTriggers & {
  sceneVersion: (elements: readonly ExcalidrawElement[]) => number;
  emit: (change: ExcalidrawSceneChange) => void;
}): { onChange: SceneChangeListener; destroy(): void } {
  let latest: Omit<ExcalidrawSceneChange, 'version'> | null = null;
  let scheduled: number | null = null;
  let emittedSignature: string | null = null;
  let destroyed = false;

  const flush = () => {
    scheduled = null;
    if (!latest) return;
    const { elements, appState, files } = latest;
    latest = null;
    const version = sceneVersion(elements);
    const signature = JSON.stringify([
      version,
      Object.keys(files),
      persistedCanvasSettings.map((key) => appState[key]),
    ]);
    if (signature === emittedSignature) return;
    emittedSignature = signature;
    emit({ elements: [...elements], appState, files, version });
  };

  const flushNow = () => {
    if (scheduled !== null) frames.cancel(scheduled);
    flush();
  };
  const stopWatchingPage = pageHidden.subscribe(flushNow);

  return {
    onChange: (elements, appState, files) => {
      if (destroyed) return;
      latest = { elements, appState, files };
      scheduled ??= frames.request(flush);
    },
    destroy: () => {
      destroyed = true;
      stopWatchingPage();
      flushNow();
    },
  };
}
