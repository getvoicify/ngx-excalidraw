import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  it('renders the demo heading', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const heading = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(heading?.textContent).toBe('ngx-excalidraw demo');
  });
});
