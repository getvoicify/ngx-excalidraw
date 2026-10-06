import { ApplicationRef, inject, InjectionToken, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, race, take, timer } from 'rxjs';

const STABILITY_FALLBACK_MS = 3000;

export const APP_FIRST_SETTLED = new InjectionToken<Signal<boolean>>('APP_FIRST_SETTLED', {
  providedIn: 'root',
  factory: () =>
    toSignal(
      race(
        inject(ApplicationRef).isStable.pipe(filter(Boolean)),
        timer(STABILITY_FALLBACK_MS),
      ).pipe(
        take(1),
        map(() => true),
      ),
      { initialValue: false },
    ),
});
