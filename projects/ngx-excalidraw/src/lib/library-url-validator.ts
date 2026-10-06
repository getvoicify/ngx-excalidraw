export interface LibraryUrlValidatorOptions {
  origins?: readonly string[];
  allowOwnOrigin?: boolean;
}

const officialLibrarySites = ['https://libraries.excalidraw.com'];
const officialLibraryRepositories = [
  'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/',
];

export function libraryUrlValidator({
  origins = [],
  allowOwnOrigin = true,
}: LibraryUrlValidatorOptions = {}): (libraryUrl: string) => boolean {
  const configuredOrigins = origins.map(canonicalOrigin);
  const allowedOrigins = () => [
    ...officialLibrarySites,
    ...configuredOrigins,
    ...(allowOwnOrigin && globalThis.location ? [globalThis.location.origin] : []),
  ];

  return (libraryUrl) => {
    const url = parsedUrl(libraryUrl);
    if (url === null || !isTrustworthyShape(url)) return false;
    const location = `${url.origin}${url.pathname}`;
    return (
      allowedOrigins().includes(url.origin) ||
      officialLibraryRepositories.some((repository) => location.startsWith(repository))
    );
  };
}

const webProtocols = ['http:', 'https:'];

function isTrustworthyShape(url: URL): boolean {
  return webProtocols.includes(url.protocol) && url.username === '' && url.password === '';
}

function canonicalOrigin(entry: string): string {
  const url = parsedUrl(entry);
  if (url === null || url.href !== `${url.origin}/`) {
    throw new Error(`libraryUrlValidator: "${entry}" is not an origin`);
  }
  return url.origin;
}

function parsedUrl(candidate: string): URL | null {
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}
