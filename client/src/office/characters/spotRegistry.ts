import type { IdleSpot } from '../navigation/office';

/** Hands out idle spots so two characters never stand in the same place. */
export class SpotRegistry {
  private readonly claimed = new Map<string, string>();

  constructor(private readonly spots: ReadonlyArray<IdleSpot>) {}

  /**
   * Reserve a random free spot for `owner` (releasing any spot it held).
   * `avoid` is the spot it just left, so it moves somewhere new when possible.
   */
  claim(owner: string, rand: () => number, avoid?: string): IdleSpot | null {
    this.release(owner);
    const free = this.spots.filter((s) => !this.claimed.has(s.id));
    const fresh = free.filter((s) => s.id !== avoid);
    const choices = fresh.length > 0 ? fresh : free;
    if (choices.length === 0) return null;
    const spot = choices[
      Math.min(choices.length - 1, Math.floor(rand() * choices.length))
    ] as IdleSpot;
    this.claimed.set(spot.id, owner);
    return spot;
  }

  release(owner: string): void {
    for (const [spotId, who] of this.claimed) {
      if (who === owner) this.claimed.delete(spotId);
    }
  }

  ownerOf(spotId: string): string | undefined {
    return this.claimed.get(spotId);
  }
}
