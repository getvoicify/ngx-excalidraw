import packageJson from '../package.json';
import { NGX_EXCALIDRAW_VERSION } from './public-api';

describe('ngx-excalidraw public API', () => {
  it('exposes the version declared in the library package.json', () => {
    expect(NGX_EXCALIDRAW_VERSION).toBe(packageJson.version);
  });
});
