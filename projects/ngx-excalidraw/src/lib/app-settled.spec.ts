import { ApplicationRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { APP_FIRST_SETTLED } from './app-settled';

describe('APP_FIRST_SETTLED', () => {
  afterEach(() => vi.useRealTimers());

  it('never settles, schedules no timers and ignores stability on the server', () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    let stabilityObserved = false;
    Object.defineProperty(TestBed.inject(ApplicationRef), 'isStable', {
      value: new Observable<boolean>(() => {
        stabilityObserved = true;
      }),
    });

    const settled = TestBed.inject(APP_FIRST_SETTLED);

    expect(settled()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(stabilityObserved).toBe(false);
  });
});
