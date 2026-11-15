import type { PublicAgent } from '@agent-office/shared';
import { useLayoutEffect, useMemo } from 'react';
import type { AgentActivity } from '../../state/selectors';
import { goalFor } from '../characters/activities';
import { appearanceFor, hashString } from '../characters/appearance';
import { CharacterBrain } from '../characters/brain';
import { Character } from '../characters/Character';
import { Confetti } from '../characters/Confetti';
import { SpotRegistry } from '../characters/spotRegistry';
import { HUB_POSITION, type DeskSlot, type OfficeLayout } from '../layout';
import { buildOfficeGrid, celebrateSpots, idleSpots, seatFor } from '../navigation/office';
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
}

/** All the characters of the team, plus the confetti. */
export function Cast({ layout, entries, palette, celebrating, teamKey }: Props) {
  const grid = useMemo(() => buildOfficeGrid(layout), [layout]);
  const celebrate = useMemo(() => celebrateSpots(layout), [layout]);

  // One brain per agent, created when the team or layout changes. Their starting
  // goals come from the activities at that moment (so a page reload mid-task
  // finds everyone already at their desks).
  const brains = useMemo(() => {
    const spots = new SpotRegistry(idleSpots());
    const rand = seeded(hashString(teamKey));
    const map = new Map<string, CharacterBrain>();
    for (const slot of [layout.hub, ...layout.desks]) {
      const entry = entries.find((e) => e.agent.id === slot.agentId);
      map.set(
        slot.agentId,
        new CharacterBrain(
          {
            id: slot.agentId,
            seat: seatFor(slot),
            grid,
            spots,
            celebrate: celebrate.get(slot.agentId) as NonNullable<ReturnType<typeof celebrate.get>>,
            rand,
          },
          goalFor(entry?.activity ?? 'idle'),
        ),
      );
    }
    return map;
    // `entries` is deliberately not a dependency: it changes every render and only
    // the first value matters here; later changes go through setGoal below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, grid, celebrate, teamKey]);

  useLayoutEffect(() => {
    for (const entry of entries) brains.get(entry.agent.id)?.setGoal(goalFor(entry.activity));
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
            }}
            accent={agent.deskColor}
            onOpen={open}
          />
        );
      })}
      <Confetti
        active={celebrating}
        x={HUB_POSITION.x}
        z={HUB_POSITION.z}
        colors={confettiColors}
      />
    </group>
  );
}
