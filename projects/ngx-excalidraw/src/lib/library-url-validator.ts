export interface LibraryUrlValidatorOptions {
  origins?: readonly string[];
  allowOwnOrigin?: boolean;
}

const officialLibrarySites = ['https://libraries.excalidraw.com'];
const officialLibraryRepositories = [
  'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/',
];

export function libraryUrlValidator({
  origins = [],
  allowOwnOrigin = true,
}: LibraryUrlValidatorOptions = {}): (libraryUrl: string) => boolean {
  const allowedOrigins = () => [
    ...officialLibrarySites,
    ...origins,
    ...(allowOwnOrigin && globalThis.location ? [globalThis.location.origin] : []),
  ];

  return (libraryUrl) => {
    const url = parsedUrl(libraryUrl);
    if (url === null || url.username !== '' || url.password !== '') return false;
    const location = `${url.origin}${url.pathname}`;
    return (
      allowedOrigins().includes(url.origin) ||
      officialLibraryRepositories.some((repository) => location.startsWith(repository))
    );
  };
}

function parsedUrl(candidate: string): URL | null {
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}
