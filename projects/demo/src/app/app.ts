import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>ngx-excalidraw demo</h1>
    </main>
  `,
})
export class App {}
