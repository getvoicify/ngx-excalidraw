import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LibraryOwnership {
  private readonly claimants = signal<readonly object[]>([]);
  readonly owner = computed(() => this.claimants()[0]);

  claim(claimant: object): () => void {
    this.claimants.update((claimants) => [...claimants, claimant]);
    return () => this.claimants.update((claimants) => claimants.filter((c) => c !== claimant));
  }
}
