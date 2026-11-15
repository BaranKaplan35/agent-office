/**
 * Personalities (pure): how an agent spends its free time in the office and how
 * often it takes a short break while working. Set per agent in the team YAML
 * (`personality`); without it, a stable one is derived from the agent's name.
 * Purely visual: it never changes what the agent writes.
 */
import { PERSONALITIES, type Personality, type PublicAgent } from '@agent-office/shared';
import type { SpotAction } from '../navigation/office';
import { hashString } from './appearance';

export interface Temperament {
  /** Relative chance of each idle activity (missing = 1, 0 = never). */
  idleWeights: Partial<Record<SpotAction, number>>;
  /** Seconds of typing between two short breaks at the desk: [min, max]. */
  breakEvery: [number, number];
  /** 0…1: how keen the agent is to chat with teammates. */
  sociability: number;
  /** Walking speed multiplier. */
  pace: number;
}

export const TEMPERAMENTS: Record<Personality, Temperament> = {
  social: {
    idleWeights: {
      visit: 3,
      coffee: 2,
      water: 2,
      phone: 2,
      lounge: 1,
      browse: 0.5,
    },
    breakEvery: [10, 18],
    sociability: 0.9,
    pace: 1,
  },
  diligent: {
    idleWeights: {
      whiteboard: 3,
      browse: 3,
      printer: 2,
      visit: 2,
      coffee: 0.5,
      lounge: 0.3,
      window: 0.5,
    },
    breakEvery: [25, 40],
    sociability: 0.3,
    pace: 1.1,
  },
  coffee: {
    idleWeights: {
      coffee: 6,
      lounge: 1,
      phone: 0.5,
      stretch: 0.5,
      printer: 0.5,
      browse: 0.5,
      whiteboard: 0.5,
    },
    breakEvery: [12, 22],
    sociability: 0.6,
    pace: 1,
  },
  calm: {
    idleWeights: {
      lounge: 4,
      window: 4,
      browse: 2,
      stretch: 2,
      phone: 0.5,
      visit: 0.5,
      printer: 0.3,
      whiteboard: 0.5,
    },
    breakEvery: [18, 30],
    sociability: 0.4,
    pace: 0.85,
  },
  curious: {
    idleWeights: {
      whiteboard: 3,
      browse: 3,
      visit: 3,
      window: 2,
      phone: 0.5,
      lounge: 0.5,
      stretch: 0.5,
    },
    breakEvery: [14, 24],
    sociability: 0.6,
    pace: 1.05,
  },
};

type AgentLike = Pick<PublicAgent, 'id' | 'name' | 'personality'>;

/** The agent's personality: from the team file, or derived from its name (stable). */
export function personalityFor(agent: AgentLike): Personality {
  if (agent.personality) return agent.personality;
  const index = hashString(`${agent.name.en}:${agent.id}`) % PERSONALITIES.length;
  return PERSONALITIES[index] as Personality;
}

export function temperamentFor(agent: AgentLike): Temperament {
  return TEMPERAMENTS[personalityFor(agent)];
}
