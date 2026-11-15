import type { IdleSpot, SpotAction } from '../navigation/office';

/** Hands out idle spots so two characters never stand in the same place. */
export class SpotRegistry {
  private readonly claimed = new Map<string, string>();

  constructor(private readonly spots: ReadonlyArray<IdleSpot>) {}

  /**
   * Reserve a free spot for `owner` (releasing any spot it held). `avoid` is the
   * spot it just left, so it moves somewhere new when possible. With `weights`, an
   * activity is picked first (weight per action, missing = 1, 0 = never), then a
   * free spot for it. A teammate's desk is never visited by its own agent.
   */
  claim(
    owner: string,
    rand: () => number,
    avoid?: string,
    weights?: Partial<Record<SpotAction, number>>,
  ): IdleSpot | null {
    this.release(owner);
    const free = this.spots.filter((s) => !this.claimed.has(s.id) && s.owner !== owner);
    const fresh = free.filter((s) => s.id !== avoid);
    const choices = fresh.length > 0 ? fresh : free;
    if (choices.length === 0) return null;

    const pick = <T>(list: ReadonlyArray<T>): T =>
      list[Math.min(list.length - 1, Math.floor(rand() * list.length))] as T;

    let spot: IdleSpot;
    if (weights) {
      const actions = [...new Set(choices.map((s) => s.action))];
      const weightOf = (a: SpotAction) => Math.max(0, weights[a] ?? 1);
      const total = actions.reduce((sum, a) => sum + weightOf(a), 0);
      if (total > 0) {
        let roll = rand() * total;
        let action = actions[actions.length - 1] as SpotAction;
        for (const a of actions) {
          roll -= weightOf(a);
          if (roll < 0) {
            action = a;
            break;
          }
        }
        spot = pick(choices.filter((s) => s.action === action));
      } else {
        spot = pick(choices);
      }
    } else {
      spot = pick(choices);
    }
    this.claimed.set(spot.id, owner);
    return spot;
  }

  /** Reserve one particular spot (e.g. the coffee counter for a chat). False if taken. */
  reserve(spotId: string, owner: string): boolean {
    const who = this.claimed.get(spotId);
    if (who !== undefined && who !== owner) return false;
    this.release(owner);
    this.claimed.set(spotId, owner);
    return true;
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
