import type { PublicAgent } from '@agent-office/shared';
import { useCursor } from '@react-three/drei';
import { useState } from 'react';
import type { ActivityTone } from '../../state/selectors';
import type { DeskSlot } from '../layout';
import { Desk, HubDesk } from '../models/Furniture';
import type { ScenePalette } from './palette';

interface Props {
  slot: DeskSlot;
  agent: PublicAgent;
  palette: ScenePalette;
  tone: ActivityTone;
  selected: boolean;
  withPlant?: boolean;
  seed?: number;
  /** Present when the agent has something to open (a report or the final output). */
  onOpen?: () => void;
}

/** One agent's workstation: furniture, selection ring and click handling. */
export function Station({ slot, agent, palette, tone, selected, withPlant, seed, onOpen }: Props) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && !!onOpen);

  const hub = agent.type === 'coordinator';
  const ring: [number, number] = hub ? [2.0, 2.12] : [1.45, 1.56];

  return (
    <group
      position={[slot.x, 0, slot.z]}
      rotation={[0, slot.rotationY, 0]}
      onClick={(e) => {
        if (!onOpen) return;
        e.stopPropagation();
        onOpen();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {hub ? (
        <HubDesk palette={palette} agentColor={agent.deskColor} tone={tone} seed={seed} />
      ) : (
        <Desk
          palette={palette}
          agentColor={agent.deskColor}
          tone={tone}
          monitorSide={slot.monitorSide}
          withPlant={withPlant}
          seed={seed}
        />
      )}

      {(selected || (hovered && !!onOpen)) && (
        <mesh position={[0, 0.02, hub ? 0.5 : 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[ring[0], ring[1], 56]} />
          <meshBasicMaterial
            color={agent.deskColor}
            transparent
            opacity={selected ? 0.9 : 0.4}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}
