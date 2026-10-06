import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import { coalesceSceneChanges, type FrameScheduler } from './scene-change';

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

const element = (id: string, versionNonce: number) =>
  ({ id, versionNonce }) as unknown as ExcalidrawElement;
const appState = (scrollX: number) => ({ scrollX }) as unknown as AppState;
const noFiles = {} as BinaryFiles;
const sumOfNonces = (elements: readonly ExcalidrawElement[]) =>
  elements.reduce((sum, { versionNonce }) => sum + versionNonce, 0);

describe('coalesceSceneChanges', () => {
  function setUp() {
    const { frames, runFrame, pendingCount } = fakeFrames();
    const emit = vi.fn();
    const scene = coalesceSceneChanges({ frames, sceneVersion: sumOfNonces, emit });
    return { scene, emit, runFrame, pendingCount };
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
      [{ elements: latest, appState: appState(5), files: noFiles, version: 3 }],
    ]);
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
      [{ elements: last, appState: appState(0), files: noFiles, version: 1 }],
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
});
