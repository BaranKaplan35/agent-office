/**
 * Office small talk (pure, no Three.js). The director looks at who is idle and
 * now and then gathers two or three of them for a chat at the coffee counter, the
 * water cooler, a window, the lounge, the open floor or beside a desk. It also
 * pairs an agent whose work was just approved with a teammate for a high-five.
 *
 * It only steers brains through `joinMeet` / `leaveMeet` / `setSpeaking`; the
 * brains still walk, turn and gesture on their own. Speech bubbles show emoji or
 * "…", never words.
 */
import { isWalkable, type Grid, type Vec2 } from '../navigation/grid';
import type { MeetKind, MeetPlace, MeetSlot } from '../navigation/office';
import type { CharacterBrain, CharacterSnapshot } from './brain';
import type { SpotRegistry } from './spotRegistry';

export interface SocialMember {
  id: string;
  brain: CharacterBrain;
  /** 0…1, from the personality. */
  sociability: number;
}

/** What each kind of chat is about, in emoji. */
export const CHAT_EMOJI: Record<MeetKind, ReadonlyArray<string>> = {
  coffee: ['☕', '😄', '…', '🍪', '😂'],
  cooler: ['💧', '🙂', '…', '😄', '🤔'],
  window: ['☀️', '🌿', '…', '🐦', '😌'],
  lounge: ['😂', '🎮', '📚', '…', '😴'],
  floor: ['💬', '👍', '…', '😄', '🤔'],
  desk: ['💡', '🤔', '💻', '👀', '…'],
};
export const HIGH_FIVE_EMOJI = '🙌';

/** How often (seconds) the director considers starting something. */
const CHECK_EVERY = 1.5;
/** Chance per check that an idle agent with sociability 1 starts a chat. */
const CHAT_CHANCE = 0.12;
const MAX_GROUPS = 2;
/** Give up on a meeting when not everybody got there in time. */
const GATHER_TIMEOUT = 14;
const HIGH_FIVE_SECONDS = 2.4;
/** A high-five request waits this long for a free teammate. */
const HIGH_FIVE_PATIENCE = 10;

const PLACE_WEIGHT: Record<MeetKind, number> = {
  coffee: 3,
  cooler: 2,
  floor: 2,
  lounge: 1.5,
  window: 1.5,
  desk: 1,
};

interface Group {
  id: string;
  kind: MeetKind | 'highfive';
  placeId: string | null;
  members: string[];
  startedAt: number;
  /** When everybody arrived (null while gathering). */
  talkStart: number | null;
  /** How long the chat (or high-five) lasts once everybody is there. */
  duration: number;
  endsAt: number;
  speaker: string | null;
  nextSwitch: number;
  bubble: string | null;
  bubbleUntil: number;
  /** Idle spots reserved for the chat (the coffee counter). */
  reserved: boolean;
}

export interface GroupView {
  id: string;
  kind: Group['kind'];
  members: ReadonlyArray<string>;
  talking: boolean;
}

export class SocialDirector {
  private time = 0;
  private nextCheck = CHECK_EVERY;
  private groups: Group[] = [];
  private counter = 0;
  private readonly cooldown = new Map<string, number>();
  private readonly highFives = new Map<string, number>();

  constructor(
    private readonly opts: {
      places: ReadonlyArray<MeetPlace>;
      grid: Grid;
      spots: SpotRegistry;
      rand: () => number;
    },
  ) {}

  /** Ask for a high-five for this agent (its work was just approved). */
  requestHighFive(agentId: string): void {
    this.highFives.set(agentId, this.time + HIGH_FIVE_PATIENCE);
  }

  update(dt: number, members: ReadonlyArray<SocialMember>): void {
    this.time += Math.max(0, Math.min(dt, 0.1));
    const byId = new Map(members.map((m) => [m.id, m]));

    for (const group of [...this.groups]) this.tend(group, byId);

    if (this.time >= this.nextCheck) {
      this.nextCheck = this.time + CHECK_EVERY;
      for (const [id, until] of this.highFives) if (until < this.time) this.highFives.delete(id);
      this.startHighFives(members);
      this.maybeStartChat(members);
    }

    for (const group of this.groups) {
      for (const id of group.members) {
        const speaking =
          group.talkStart !== null && group.speaker === id && this.time < group.bubbleUntil;
        byId.get(id)?.brain.setSpeaking(speaking);
      }
    }
  }

  /** The emoji (or "…") above this agent's head right now, if any. */
  bubbleFor(agentId: string): string | null {
    for (const g of this.groups) {
      if (g.talkStart === null || !g.members.includes(agentId)) continue;
      if (g.kind === 'highfive') return HIGH_FIVE_EMOJI;
      if (g.speaker === agentId && this.time < g.bubbleUntil) return g.bubble;
    }
    return null;
  }

  active(): ReadonlyArray<GroupView> {
    return this.groups.map((g) => ({
      id: g.id,
      kind: g.kind,
      members: g.members,
      talking: g.talkStart !== null,
    }));
  }

  /** Reduced motion or a new team: everybody goes their own way. */
  clear(members: ReadonlyArray<SocialMember>): void {
    const byId = new Map(members.map((m) => [m.id, m]));
    for (const g of [...this.groups]) this.end(g, byId);
    this.highFives.clear();
  }

  // ---------------------------------------------------------------- groups

  private tend(group: Group, byId: Map<string, SocialMember>): void {
    // members who walked off (work arrived) have left the group
    group.members = group.members.filter(
      (id) => byId.get(id)?.brain.snapshot().meetId === group.id,
    );
    if (group.members.length < 2) {
      this.end(group, byId);
      return;
    }

    if (group.talkStart === null) {
      if (group.members.every((id) => byId.get(id)?.brain.atMeet())) {
        group.talkStart = this.time;
        group.endsAt = this.time + group.duration;
        group.nextSwitch = this.time;
        if (group.kind === 'highfive') {
          for (const id of group.members) byId.get(id)?.brain.cue();
        }
      } else if (this.time - group.startedAt > GATHER_TIMEOUT) {
        this.end(group, byId);
      }
      return;
    }

    if (this.time >= group.endsAt) {
      this.end(group, byId);
      return;
    }
    if (group.kind !== 'highfive' && this.time >= group.nextSwitch) {
      const others = group.members.filter((id) => id !== group.speaker);
      group.speaker = this.pick(others);
      const turn = 1.6 + this.opts.rand() * 1.4;
      group.nextSwitch = this.time + turn;
      group.bubbleUntil = this.time + turn * 0.72;
      group.bubble = this.pick(CHAT_EMOJI[group.kind]);
    }
  }

  private end(group: Group, byId: Map<string, SocialMember>): void {
    this.groups = this.groups.filter((g) => g !== group);
    // free reserved spots first: leaving the meeting claims a new spot right away
    if (group.reserved) for (const id of group.members) this.opts.spots.release(id);
    for (const id of group.members) {
      const member = byId.get(id);
      if (!member) continue;
      member.brain.setSpeaking(false);
      member.brain.leaveMeet();
      const rest = group.kind === 'highfive' ? 6 : 14 + this.opts.rand() * 20;
      this.cooldown.set(id, this.time + rest * (1.4 - member.sociability));
    }
  }

  private free(members: ReadonlyArray<SocialMember>): SocialMember[] {
    const busy = new Set(this.groups.flatMap((g) => g.members));
    return members.filter(
      (m) => !busy.has(m.id) && (this.cooldown.get(m.id) ?? -1) <= this.time && m.brain.canMeet(),
    );
  }

  private startHighFives(members: ReadonlyArray<SocialMember>): void {
    for (const [requester] of this.highFives) {
      const free = this.free(members);
      const me = free.find((m) => m.id === requester);
      if (!me) continue;
      const here = me.brain.snapshot();
      const partners = free
        .filter((m) => m.id !== requester)
        .map((m) => ({ m, s: m.brain.snapshot() }))
        .sort((a, b) => dist(a.s, here) - dist(b.s, here));
      const partner = partners[0];
      if (!partner) continue;

      const slots = highFiveSlots(here, partner.s, this.opts.grid);
      if (!slots) continue;
      this.highFives.delete(requester);
      this.form('highfive', null, [me, partner.m], slots, false, HIGH_FIVE_SECONDS);
    }
  }

  private maybeStartChat(members: ReadonlyArray<SocialMember>): void {
    if (this.groups.filter((g) => g.kind !== 'highfive').length >= MAX_GROUPS) return;
    const free = this.free(members);
    if (free.length < 2) return;

    const initiator = this.weighted(free, (m) => m.sociability);
    if (this.opts.rand() >= CHAT_CHANCE * initiator.sociability * Math.min(free.length - 1, 3)) {
      return;
    }
    const size = free.length >= 3 && this.opts.rand() < 0.3 ? 3 : 2;
    const used = new Set(this.groups.map((g) => g.placeId));
    const places = this.opts.places.filter(
      (p) =>
        !used.has(p.id) &&
        p.slots.length >= size &&
        p.slots.every((s) => !s.spotId || this.opts.spots.ownerOf(s.spotId) === undefined),
    );
    if (places.length === 0) return;
    const place = this.weighted(places, (p) => PLACE_WEIGHT[p.kind]);

    const group = [initiator];
    while (group.length < size) {
      const rest = free.filter((m) => !group.includes(m));
      if (rest.length === 0) break;
      group.push(this.weighted(rest, (m) => 0.2 + m.sociability));
    }
    const talk = 7 + this.opts.rand() * 7 + (group.length - 2) * 3;
    this.form(place.kind, place.id, group, place.slots.slice(0, group.length), true, talk);
  }

  private form(
    kind: Group['kind'],
    placeId: string | null,
    members: ReadonlyArray<SocialMember>,
    slots: ReadonlyArray<MeetSlot>,
    chat: boolean,
    seconds: number,
  ): void {
    const id = `meet-${++this.counter}`;
    const joined: SocialMember[] = [];
    let reserved = false;
    members.forEach((m, i) => {
      const slot = slots[i] as MeetSlot;
      const ok = m.brain.joinMeet({
        id,
        x: slot.x,
        z: slot.z,
        heading: slot.heading,
        gesture: chat ? 'chat' : 'highfive',
      });
      if (!ok) return;
      joined.push(m);
      if (slot.spotId && this.opts.spots.reserve(slot.spotId, m.id)) reserved = true;
    });
    if (joined.length < 2) {
      for (const m of joined) m.brain.leaveMeet();
      return;
    }
    this.groups.push({
      id,
      kind,
      placeId,
      members: joined.map((m) => m.id),
      startedAt: this.time,
      talkStart: null,
      duration: seconds,
      endsAt: Infinity,
      speaker: null,
      nextSwitch: 0,
      bubble: null,
      bubbleUntil: 0,
      reserved,
    });
  }

  private pick<T>(list: ReadonlyArray<T>): T {
    return list[Math.min(list.length - 1, Math.floor(this.opts.rand() * list.length))] as T;
  }

  private weighted<T>(list: ReadonlyArray<T>, weight: (item: T) => number): T {
    const total = list.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
    let roll = this.opts.rand() * total;
    for (const item of list) {
      roll -= Math.max(0, weight(item));
      if (roll < 0) return item;
    }
    return list[list.length - 1] as T;
  }
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const headingToward = (dx: number, dz: number) => Math.atan2(dx, dz);

/**
 * Two spots 0.7 m apart, facing each other: the requester stays where it is, the
 * partner comes over from its side (or the nearest free direction).
 */
export function highFiveSlots(here: Vec2, partner: Vec2, grid: Grid): [MeetSlot, MeetSlot] | null {
  const base = Math.atan2(partner.z - here.z, partner.x - here.x);
  for (const turn of [0, 0.6, -0.6, 1.2, -1.2, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const a = base + turn;
    const p = { x: here.x + 0.7 * Math.cos(a), z: here.z + 0.7 * Math.sin(a) };
    if (!isWalkable(grid, p)) continue;
    return [
      { ...here, heading: headingToward(p.x - here.x, p.z - here.z) },
      { ...p, heading: headingToward(here.x - p.x, here.z - p.z) },
    ];
  }
  return null;
}

/**
 * Bubbles that don't need the director: "?" when turning to ask a neighbour,
 * "…" now and then during a phone call, "!" on a lightbulb moment at the
 * whiteboard, a cheer while celebrating.
 */
export function ambientBubble(
  snap: Pick<CharacterSnapshot, 'action' | 'actionTime'>,
): string | null {
  const t = snap.actionTime;
  switch (snap.action) {
    case 'ask':
      return t > 0.5 && t < 2.6 ? '?' : null;
    case 'phone':
      return t % 4 > 1 && t % 4 < 3 ? '…' : null;
    case 'whiteboard':
      return t % 6 > 3.5 && t % 6 < 5 ? '💡' : null;
    case 'celebrate':
      return t % 5 < 1.6 ? '🎉' : null;
    default:
      return null;
  }
}
