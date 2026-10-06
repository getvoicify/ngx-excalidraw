import { libraryUrlValidator } from './library-url-validator';

const officialSiteFile =
  'https://libraries.excalidraw.com/libraries/youritjang/software-architecture.excalidrawlib';
const officialRepoFile =
  'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/libraries/youritjang/software-architecture.excalidrawlib';

describe('libraryUrlValidator', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('with defaults', () => {
    const isAllowed = libraryUrlValidator();

    it('accepts a library file on the official libraries site', () => {
      expect(isAllowed(officialSiteFile)).toBe(true);
    });

    it('accepts a library file in the official excalidraw-libraries repository', () => {
      expect(isAllowed(officialRepoFile)).toBe(true);
    });

    it("accepts a library hosted on the page's own origin", () => {
      expect(isAllowed(new URL('/sample.excalidrawlib', location.origin).href)).toBe(true);
    });

    it('resolves the own origin when validating, not when constructed', () => {
      vi.stubGlobal('location', { origin: 'https://draw.example.com' });

      expect(isAllowed('https://draw.example.com/team.excalidrawlib')).toBe(true);
    });

    it.each([
      [
        'a lookalike host that only starts with the official hostname',
        'https://libraries.excalidraw.com.evil.com/x.excalidrawlib',
      ],
      [
        'a foreign host carrying the official hostname in its path',
        'https://evil.com/libraries.excalidraw.com/x.excalidrawlib',
      ],
      [
        'the official site over plain http',
        'http://libraries.excalidraw.com/libraries/x.excalidrawlib',
      ],
      [
        'the official site on a non-default port',
        'https://libraries.excalidraw.com:8443/x.excalidrawlib',
      ],
      ['another excalidraw.com subdomain', 'https://excalidraw.com/x.excalidrawlib'],
      [
        'a userinfo trick naming the official host',
        'https://libraries.excalidraw.com@evil.com/x.excalidrawlib',
      ],
      [
        'credentials in front of the official host',
        'https://user:pass@libraries.excalidraw.com/x.excalidrawlib',
      ],
      [
        'another account’s excalidraw-libraries fork',
        'https://raw.githubusercontent.com/evil/excalidraw-libraries/main/x.excalidrawlib',
      ],
      [
        'a repository that merely shares the official prefix',
        'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries-evil/main/x.excalidrawlib',
      ],
      [
        'the official repository over plain http',
        'http://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/x.excalidrawlib',
      ],
      [
        'a path that climbs out of the official repository',
        'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/../../evil/x/main/x.excalidrawlib',
      ],
      [
        'an encoded path that climbs out of the official repository',
        'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/%2e%2e/%2e%2e/evil/x.excalidrawlib',
      ],
      [
        'a pull request ref in the official repository',
        'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/refs/pull/2000/head/libraries/x.excalidrawlib',
      ],
      [
        'a branch ref path in the official repository',
        'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/refs/heads/main/libraries/x.excalidrawlib',
      ],
      [
        'a commit SHA in the official repository',
        'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/0123456789abcdef0123456789abcdef01234567/libraries/x.excalidrawlib',
      ],
      [
        'another branch of the official repository',
        'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/feature-x/libraries/x.excalidrawlib',
      ],
      ['an unparseable URL', 'not a url'],
      ['an empty string', ''],
    ])('rejects %s', (_case, url) => {
      expect(isAllowed(url)).toBe(false);
    });
  });

  it("rejects the page's own origin when allowOwnOrigin is false", () => {
    const isAllowed = libraryUrlValidator({ allowOwnOrigin: false });

    expect(isAllowed(new URL('/sample.excalidrawlib', location.origin).href)).toBe(false);
    expect(isAllowed(officialSiteFile)).toBe(true);
  });

  it('accepts extra origins exactly and nothing that merely resembles them', () => {
    const isAllowed = libraryUrlValidator({ origins: ['https://libraries.example.com'] });

    expect(isAllowed('https://libraries.example.com/team/shapes.excalidrawlib')).toBe(true);
    expect(isAllowed('https://libraries.example.com.evil.com/shapes.excalidrawlib')).toBe(false);
    expect(isAllowed('http://libraries.example.com/shapes.excalidrawlib')).toBe(false);
  });

  it('rejects everything but the official sources when no own origin is available', () => {
    vi.stubGlobal('location', undefined);
    const isAllowed = libraryUrlValidator();

    expect(isAllowed('https://draw.example.com/team.excalidrawlib')).toBe(false);
    expect(isAllowed(officialSiteFile)).toBe(true);
  });
});
