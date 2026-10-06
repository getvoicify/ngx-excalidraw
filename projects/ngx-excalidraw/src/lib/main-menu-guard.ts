const embeddedSceneMarker = 'application/vnd.excalidraw+json';

const imageTypes = new Set([
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-icon',
  'image/avif',
  'image/jfif',
]);

const textInputTypes = new Set(['text', 'number', 'password']);

const editableContent =
  '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

export function guardMainMenuActions(
  host: HTMLElement,
  { keyboardGlobally }: { keyboardGlobally: boolean },
): () => void {
  const document = host.ownerDocument;
  const replayed = new WeakSet<Event>();

  const onKeyDown = (event: KeyboardEvent) => {
    const aimedAtEditor = keyboardGlobally || host.contains(event.target as Node | null);
    if (aimedAtEditor && !isTextEntry(event.target) && isMainMenuShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onDrop = (event: DragEvent) => {
    const file = event.dataTransfer?.files[0];
    if (!file || replayed.has(event)) return;
    event.preventDefault();
    event.stopPropagation();
    void isPlainImage(file).then((plain) => {
      if (plain && event.target instanceof Node && event.target.isConnected) {
        event.target.dispatchEvent(replayOf(event, file));
      }
    });
  };

  const replayOf = (event: DragEvent, file: File) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const replay = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      dataTransfer,
    });
    replayed.add(replay);
    return replay;
  };

  document.addEventListener('keydown', onKeyDown, true);
  host.addEventListener('drop', onDrop, true);
  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    host.removeEventListener('drop', onDrop, true);
  };
}

export async function isPlainImage(file: File): Promise<boolean> {
  if (!imageTypes.has(file.type)) return false;
  const contents = new TextDecoder('latin1').decode(await file.arrayBuffer());
  return !contents.includes(embeddedSceneMarker);
}

function isMainMenuShortcut(event: KeyboardEvent): boolean {
  if (event.key === '?') return true;
  if (!event.ctrlKey && !event.metaKey) return false;
  const key = event.key.toLowerCase();
  return (
    key === 'o' ||
    key === 's' ||
    key === 'backspace' ||
    key === 'delete' ||
    (key === 'e' && event.shiftKey)
  );
}

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && textInputTypes.has(target.type)) ||
    (target instanceof HTMLElement && target.closest(editableContent) !== null)
  );
}
