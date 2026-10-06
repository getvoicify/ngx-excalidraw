import { isPlatformBrowser } from '@angular/common';
import {
  ApplicationRef,
  inject,
  InjectionToken,
  NgZone,
  PLATFORM_ID,
  Signal,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, Observable, race, take, timer } from 'rxjs';

const STABILITY_FALLBACK_MS = 3000;

function outsideAngular<T>(zone: NgZone, source: Observable<T>): Observable<T> {
  return new Observable<T>((subscriber) =>
    zone.runOutsideAngular(() => source.subscribe(subscriber)),
  );
}

export const APP_FIRST_SETTLED = new InjectionToken<Signal<boolean>>('APP_FIRST_SETTLED', {
  providedIn: 'root',
  factory: () => {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return signal(false).asReadonly();
    const firstSettled = race(
      inject(ApplicationRef).isStable.pipe(filter(Boolean)),
      timer(STABILITY_FALLBACK_MS),
    ).pipe(
      take(1),
      map(() => true),
    );
    return toSignal(outsideAngular(inject(NgZone), firstSettled), { initialValue: false });
  },
});
