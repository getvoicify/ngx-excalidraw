import { NgZone, provideZoneChangeDetection, ɵNoopNgZone as NoopNgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExcalidrawComponent } from './excalidraw.component';
import { EXCALIDRAW_RENDERER_LOADER } from './renderer-loader';

describe('ExcalidrawComponent in a zone.js application', () => {
  it('starts loading once the zone settles, well before the stability fallback', async () => {
    const loader = vi.fn(() => new Promise<never>(() => undefined));
    TestBed.configureTestingModule({
      providers: [
        provideZoneChangeDetection(),
        { provide: EXCALIDRAW_RENDERER_LOADER, useValue: loader },
      ],
    });
    const zone = TestBed.inject(NgZone);
    expect(zone).not.toBeInstanceOf(NoopNgZone);
    zone.run(() => TestBed.createComponent(ExcalidrawComponent).autoDetectChanges());

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(loader).toHaveBeenCalledTimes(1);
  });
});
