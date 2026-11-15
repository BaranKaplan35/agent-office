import type { PublicAgent } from '@agent-office/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { Vector3 } from 'three';
import type { AgentActivity } from '../../state/selectors';
import { calmGoalFor, goalFor, isDeskWork } from '../characters/activities';
import { appearanceFor, hashString } from '../characters/appearance';
import { CharacterBrain } from '../characters/brain';
import { Character } from '../characters/Character';
import { Confetti } from '../characters/Confetti';
import { temperamentFor } from '../characters/personality';
import { ambientBubble, SocialDirector, type SocialMember } from '../characters/social';
import { SpotRegistry } from '../characters/spotRegistry';
import type { FlightBoard } from '../effects/flights';
import { HUB_POSITION, type DeskSlot, type OfficeLayout } from '../layout';
import {
  buildOfficeGrid,
  celebrateSpots,
  idleSpots,
  meetPlaces,
  seatFor,
  type Seat,
} from '../navigation/office';
import { seeded } from '../random';
import type { ScenePalette } from './palette';

export interface CastEntry {
  slot: DeskSlot;
  agent: PublicAgent;
  index: number;
  activity: AgentActivity;
  /** Present when the agent has something to open. */
  open?: () => void;
}

interface Props {
  layout: OfficeLayout;
  entries: ReadonlyArray<CastEntry>;
  palette: ScenePalette;
  /** The whole task is approved: everybody cheers and confetti falls. */
  celebrating: boolean;
  /** Changes when the team does, so the characters start afresh. */
  teamKey: string;
  /** Envelopes on their way: a worker only heads for the desk once its envelope lands. */
  board: FlightBoard;
  /** Reduced motion: no wandering or chats, still poses, no confetti, instant moves. */
  reduced: boolean;
  /** DOM speech bubbles by agent id; the cast fills and places them every frame. */
  speech: RefObject<Map<string, HTMLElement>>;
  /** Agents that have work but haven't sat down yet (their desk shows "on the way"). */
  onArrivingChange: (arriving: ReadonlySet<string>) => void;
}

/** Angle (relative to the seat's heading, + = left) towards the nearest other worker. */
function askYawFor(seat: Seat, others: ReadonlyArray<Seat>): number | undefined {
  let best: Seat | undefined;
  for (const o of others) {
    if (
      !best ||
      Math.hypot(o.x - seat.x, o.z - seat.z) < Math.hypot(best.x - seat.x, best.z - seat.z)
    ) {
      best = o;
    }
  }
  if (!best) return undefined;
  const angle = Math.atan2(best.x - seat.x, best.z - seat.z) - seat.heading;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Height of a speech bubble's anchor above a character (standing → seated). */
const SPEECH_Y_STANDING = 1.62;
const SPEECH_Y_SEATED = 1.28;

/** All the characters of the team, their small talk, and the confetti. */
export function Cast({
  layout,
  entries,
  palette,
  celebrating,
  teamKey,
  board,
  reduced,
  speech,
  onArrivingChange,
}: Props) {
  const grid = useMemo(() => buildOfficeGrid(layout), [layout]);
  const celebrate = useMemo(() => celebrateSpots(layout), [layout]);

  // One brain per agent, created when the team or layout changes. Their starting
  // goals come from the activities at that moment (so a page reload mid-task
  // finds everyone already at their desks).
  const world = useMemo(() => {
    const spots = new SpotRegistry(idleSpots(layout));
    const rand = seeded(hashString(teamKey));
    const workerSeats = layout.desks.map(seatFor);
    const members: SocialMember[] = [];
    const brains = new Map<string, CharacterBrain>();
    const askYaw = new Map<string, number | undefined>();
    for (const slot of [layout.hub, ...layout.desks]) {
      const entry = entries.find((e) => e.agent.id === slot.agentId);
      const temperament = entry ? temperamentFor(entry.agent) : undefined;
      const seat = seatFor(slot);
      const worker = slot.type === 'worker';
      const neighbours = workerSeats.filter((s) => s !== workerSeats[layout.desks.indexOf(slot)]);
      const brain = new CharacterBrain(
        {
          id: slot.agentId,
          seat,
          grid,
          spots,
          celebrate: celebrate.get(slot.agentId) as NonNullable<ReturnType<typeof celebrate.get>>,
          rand,
          speed: 1.5 * (temperament?.pace ?? 1),
          idleWeights: temperament?.idleWeights,
          breakEvery: temperament?.breakEvery,
          canAsk: worker && neighbours.length > 0,
        },
        (reduced ? calmGoalFor : goalFor)(entry?.activity ?? 'idle'),
      );
      brains.set(slot.agentId, brain);
      askYaw.set(slot.agentId, worker ? askYawFor(seat, neighbours) : undefined);
      members.push({ id: slot.agentId, brain, sociability: temperament?.sociability ?? 0.5 });
    }
    const director = new SocialDirector({ places: meetPlaces(layout, grid), grid, spots, rand });
    return { brains, members, director, askYaw };
    // `entries` and `reduced` are deliberately not dependencies: only their first
    // values matter here; later changes are applied every frame below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, grid, celebrate, teamKey]);
  const { brains, members, director, askYaw } = world;

  const latest = useRef(entries);
  useLayoutEffect(() => {
    latest.current = entries;
  });

  // An agent whose work was just approved looks for someone to high-five.
  const lastActivity = useRef(new Map<string, AgentActivity>());
  useEffect(() => {
    for (const entry of entries) {
      const before = lastActivity.current.get(entry.agent.id);
      if (entry.activity === 'approved' && before !== undefined && before !== 'approved') {
        director.requestHighFive(entry.agent.id);
      }
      lastActivity.current.set(entry.agent.id, entry.activity);
    }
  }, [entries, director]);

  useEffect(() => {
    if (reduced) director.clear(members);
  }, [reduced, director, members]);

  const arrivingKey = useRef('');
  const point = useMemo(() => new Vector3(), []);

  // Goals are applied every frame, because an envelope landing (not a React
  // render) is what releases a worker to go to the desk.
  useFrame(({ camera, size }, delta) => {
    const now = performance.now() / 1000;
    const arriving: string[] = [];
    for (const entry of latest.current) {
      const id = entry.agent.id;
      const brain = brains.get(id);
      if (!brain) continue;
      brain.setCalm(reduced);
      const held = board.holding(id, now, reduced);
      if (!held) {
        brain.setGoal(reduced ? calmGoalFor(entry.activity) : goalFor(entry.activity));
        if (reduced) brain.settle();
      }
      const snap = brain.snapshot();
      if (
        isDeskWork(entry.activity) &&
        (held || snap.phase !== 'seated' || snap.action === 'lounge')
      ) {
        arriving.push(id);
      }
    }
    if (!reduced) director.update(delta, members);

    const key = arriving.sort().join(',');
    if (key !== arrivingKey.current) {
      arrivingKey.current = key;
      onArrivingChange(new Set(arriving));
    }

    // speech bubbles: emoji or "…" above the heads, written straight to the DOM
    const bubbles = speech.current;
    for (const [id, brain] of brains) {
      const el = bubbles.get(id);
      if (!el) continue;
      const snap = brain.snapshot();
      const text = reduced ? null : (director.bubbleFor(id) ?? ambientBubble(snap));
      if (!text) {
        if (el.dataset.text) {
          el.dataset.text = '';
          el.style.visibility = 'hidden';
        }
        continue;
      }
      if (el.dataset.text !== text) {
        el.dataset.text = text;
        // restart the pop-in animation
        el.classList.remove('is-new');
        void el.offsetWidth;
        el.classList.add('is-new');
      }
      const y = SPEECH_Y_STANDING + (SPEECH_Y_SEATED - SPEECH_Y_STANDING) * snap.sitBlend;
      point.set(snap.x, y, snap.z).project(camera);
      const sx = (point.x * 0.5 + 0.5) * size.width;
      const sy = (-point.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      el.style.visibility = point.z > 1 ? 'hidden' : 'visible';
    }
  });

  const confettiColors = useMemo(
    () => [
      palette.primary,
      palette.accent,
      palette.success,
      palette.warning,
      palette.danger,
      '#ffffff',
    ],
    [palette],
  );

  return (
    <group>
      {entries.map(({ slot, agent, index, open }) => {
        const brain = brains.get(agent.id);
        if (!brain) return null;
        return (
          <Character
            key={`${teamKey}:${agent.id}`}
            brain={brain}
            look={appearanceFor(agent, index)}
            ctx={{
              lookYaw: -slot.monitorSide * 0.45,
              seed: (hashString(agent.id) % 628) / 100,
              hub: slot.type === 'coordinator',
              still: reduced,
              askYaw: askYaw.get(agent.id),
            }}
            accent={agent.deskColor}
            onOpen={open}
          />
        );
      })}
      <Confetti
        active={celebrating && !reduced}
        x={HUB_POSITION.x}
        z={HUB_POSITION.z}
        colors={confettiColors}
      />
    </group>
  );
}
