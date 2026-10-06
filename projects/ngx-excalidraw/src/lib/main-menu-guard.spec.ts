import { guardMainMenuActions, isPlainImage } from './main-menu-guard';

function keydown(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function drop(target: EventTarget, files: File[]): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  target.dispatchEvent(event);
  return event;
}

describe('guardMainMenuActions', () => {
  let host: HTMLElement;
  let editor: HTMLElement;
  let outside: HTMLElement;
  let reachedEditor: string[];
  let release: () => void;

  beforeEach(() => {
    host = document.createElement('div');
    editor = document.createElement('div');
    outside = document.createElement('div');
    host.append(editor);
    document.body.append(host, outside);
    reachedEditor = [];
    editor.addEventListener('keydown', (event) => reachedEditor.push(event.key));
    editor.addEventListener('drop', () => reachedEditor.push('drop'));
    release = guardMainMenuActions(host, { keyboardGlobally: false });
  });

  afterEach(() => {
    release();
    host.remove();
    outside.remove();
  });

  it.each([
    ['open', { key: 'o', metaKey: true }],
    ['save', { key: 's', ctrlKey: true }],
    ['export image', { key: 'E', ctrlKey: true, shiftKey: true }],
    ['reset canvas with Backspace', { key: 'Backspace', metaKey: true }],
    ['reset canvas with Delete', { key: 'Delete', ctrlKey: true }],
    ['help', { key: '?', shiftKey: true }],
  ])('keeps the %s shortcut away from the editor', (_, init) => {
    const event = keydown(editor, init);
    expect(reachedEditor).toEqual([]);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    ['plain keys', { key: 's' }],
    ['deleting a selection', { key: 'Backspace' }],
    ['copying', { key: 'c', metaKey: true }],
    ['an unshifted E with the modifier', { key: 'e', ctrlKey: true }],
  ])('lets %s through to the editor', (_, init) => {
    keydown(editor, init);
    expect(reachedEditor).toEqual([init.key]);
  });

  it.each([
    ['a textarea', () => document.createElement('textarea')],
    ['a text input', () => document.createElement('input')],
    [
      'a contenteditable element',
      () => {
        const element = document.createElement('div');
        element.setAttribute('contenteditable', 'true');
        return element;
      },
    ],
  ])('lets shortcuts typed into %s through', (_, create) => {
    const field = create();
    editor.append(field);
    keydown(field, { key: '?', shiftKey: true });
    expect(reachedEditor).toEqual(['?']);
  });

  it('blocks a shortcut aimed at a checkbox inside the editor, as Excalidraw would act on it', () => {
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    editor.append(checkbox);
    keydown(checkbox, { key: '?', shiftKey: true });
    expect(reachedEditor).toEqual([]);
  });

  it('leaves shortcuts pressed elsewhere on the page alone', () => {
    expect(keydown(outside, { key: 's', metaKey: true }).defaultPrevented).toBe(false);
  });

  it('guards shortcuts pressed anywhere on the page when Excalidraw handles the keyboard globally', () => {
    release();
    release = guardMainMenuActions(host, { keyboardGlobally: true });
    expect(keydown(outside, { key: 's', metaKey: true }).defaultPrevented).toBe(true);
  });

  it('holds back a dropped file until it is known to be a plain image', () => {
    const event = drop(editor, [new File(['{}'], 'scene.excalidraw')]);
    expect(reachedEditor).toEqual([]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets drops that carry no files through, such as library items and links', () => {
    drop(editor, []);
    expect(reachedEditor).toEqual(['drop']);
  });

  it('stops guarding once released', () => {
    release();
    keydown(editor, { key: '?', shiftKey: true });
    drop(editor, [new File(['{}'], 'scene.excalidraw')]);
    expect(reachedEditor).toEqual(['?', 'drop']);
  });
});

describe('isPlainImage', () => {
  it('accepts an image without an embedded scene', async () => {
    expect(await isPlainImage(new File(['\x89PNG plain'], 'a.png', { type: 'image/png' }))).toBe(
      true,
    );
  });

  it.each([
    ['a PNG', 'image/png', '\x89PNG tEXtapplication/vnd.excalidraw+json\0{}'],
    ['an SVG', 'image/svg+xml', '<svg><!-- payload-type:application/vnd.excalidraw+json --></svg>'],
  ])('rejects %s that embeds a scene', async (_, type, contents) => {
    expect(await isPlainImage(new File([contents], 'scene', { type }))).toBe(false);
  });

  it.each([
    ['a scene file', new File(['{"type":"excalidraw"}'], 'a.excalidraw')],
    ['a library file', new File(['{"type":"excalidrawlib"}'], 'a.excalidrawlib')],
    ['JSON', new File(['{}'], 'a.json', { type: 'application/json' })],
  ])('rejects %s', async (_, file) => {
    expect(await isPlainImage(file)).toBe(false);
  });
});
