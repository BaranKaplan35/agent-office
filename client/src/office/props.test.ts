import { describe, expect, it } from 'vitest';
import { buildLayout, type AgentRef } from './layout';
import { CEILING_Y, LAMP_Y, LAMPS } from './props';
import { cameraBasis, isoDirection, type Vec3 } from './scene/camera';

const team = (workers: number): AgentRef[] => [
  { id: 'lead', type: 'coordinator' },
  ...Array.from({ length: workers }, (_, i): AgentRef => ({ id: `w${i + 1}`, type: 'worker' })),
];

const { right, up } = cameraBasis(isoDirection());
const project = (p: Vec3) => ({
  x: p[0] * right[0] + p[1] * right[1] + p[2] * right[2],
  y: p[0] * up[0] + p[1] * up[1] + p[2] * up[2],
});

/**
 * A desk bubble at a typical desktop zoom (~45 px per world unit) is about 110 px
 * wide and 40 px tall, hanging above its anchor. In world units on screen:
 */
const BUBBLE_HALF_W = 1.25;
const BUBBLE_H = 1.0;
const TAG_HEIGHT = { coordinator: 3.1, worker: 2.9 } as const;

describe.each([2, 3, 4, 5])('pendant lamps with %i workers', (n) => {
  const layout = buildLayout(team(n));

  it('never hang (shade or cord) inside a desk bubble at the default view', () => {
    for (const slot of [layout.hub, ...layout.desks]) {
      const anchor = project([slot.x, TAG_HEIGHT[slot.type], slot.z]);
      const bubble = {
        minX: anchor.x - BUBBLE_HALF_W,
        maxX: anchor.x + BUBBLE_HALF_W,
        minY: anchor.y,
        maxY: anchor.y + BUBBLE_H,
      };
      for (const lamp of LAMPS) {
        const bottom = project([lamp.x, LAMP_Y - 0.2, lamp.z]);
        const top = project([lamp.x, CEILING_Y, lamp.z]);
        const lampBox = {
          minX: bottom.x - 0.45,
          maxX: bottom.x + 0.45,
          minY: bottom.y,
          maxY: top.y,
        };
        const overlaps =
          lampBox.minX < bubble.maxX &&
          lampBox.maxX > bubble.minX &&
          lampBox.minY < bubble.maxY &&
          lampBox.maxY > bubble.minY;
        expect(overlaps, `lamp (${lamp.x}, ${lamp.z}) vs bubble of ${slot.agentId}`).toBe(false);
      }
    }
  });
});
