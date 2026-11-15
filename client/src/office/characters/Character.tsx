import { useCursor } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import type { Group, Mesh } from 'three';
import { StaticBatch } from '../models/StaticBatch';
import { mixHex } from '../scene/daylight';
import type { Appearance } from './appearance';
import type { CharacterBrain } from './brain';
import { DIM } from './dimensions';
import {
  computePose,
  NEUTRAL_POSE,
  smoothPose,
  type Held,
  type Pose,
  type PoseContext,
} from './pose';

const INK = '#1b1f27';
const MOUTH = '#5a1f2a';

/** A limb: a capsule hanging down from its joint (the group origin). */
function Limb({
  radius,
  length,
  color,
  flat,
}: {
  radius: number;
  length: number;
  color: string;
  flat?: boolean;
}) {
  const body = Math.max(length - radius * 2, 0.001);
  return (
    <mesh position={[0, -length / 2, 0]} castShadow>
      <capsuleGeometry args={[radius, body, 4, 8]} />
      <meshStandardMaterial color={color} roughness={0.75} flatShading={flat} />
    </mesh>
  );
}

function Hair({ style, color }: { style: Appearance['hairStyle']; color: string }) {
  const mat = <meshStandardMaterial color={color} roughness={0.85} flatShading />;
  return (
    <group>
      {/* cap covering the top and back of the head */}
      <mesh position={[0, 0.1, -0.03]} scale={[1, 0.62, 1.04]} castShadow>
        <icosahedronGeometry args={[0.3, 1]} />
        {mat}
      </mesh>
      {/* fringe */}
      <mesh position={[0, 0.2, 0.19]} scale={[1.7, 0.5, 0.7]} castShadow>
        <icosahedronGeometry args={[0.12, 1]} />
        {mat}
      </mesh>
      {style === 'bun' && (
        <mesh position={[0, 0.34, -0.08]} castShadow>
          <icosahedronGeometry args={[0.1, 1]} />
          {mat}
        </mesh>
      )}
      {style === 'spiky' &&
        [0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.sin(a) * 0.17, 0.3, Math.cos(a) * 0.17 - 0.04]}
              rotation={[Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5]}
              castShadow
            >
              <coneGeometry args={[0.07, 0.2, 5]} />
              {mat}
            </mesh>
          );
        })}
      {style === 'long' && (
        <mesh position={[0, -0.08, -0.17]} scale={[1.05, 1.25, 0.7]} castShadow>
          <icosahedronGeometry args={[0.3, 1]} />
          {mat}
        </mesh>
      )}
    </group>
  );
}

function Accessory({ kind, color }: { kind: Appearance['accessory']; color: string }) {
  switch (kind) {
    case 'headset':
      return (
        <group>
          <mesh rotation={[0, 0, 0]} castShadow>
            <torusGeometry args={[0.31, 0.02, 6, 20, Math.PI]} />
            <meshStandardMaterial color={INK} roughness={0.5} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.08, 0.08, 0.06, 12]} />
              <meshStandardMaterial color={color} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0.26, -0.1, 0.13]} rotation={[0.6, -0.3, 0]} castShadow>
            <cylinderGeometry args={[0.009, 0.009, 0.24, 6]} />
            <meshStandardMaterial color={INK} />
          </mesh>
          <mesh position={[0.2, -0.17, 0.23]} castShadow>
            <icosahedronGeometry args={[0.025, 1]} />
            <meshStandardMaterial color={INK} />
          </mesh>
        </group>
      );
    case 'glasses':
      return (
        <group position={[0, 0.045, 0.268]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.105, 0, 0]}>
              <torusGeometry args={[0.058, 0.012, 6, 14]} />
              <meshStandardMaterial color={INK} roughness={0.4} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[0.06, 0.012, 0.012]} />
            <meshStandardMaterial color={INK} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.19, 0, -0.1]}>
              <boxGeometry args={[0.012, 0.012, 0.2]} />
              <meshStandardMaterial color={INK} />
            </mesh>
          ))}
        </group>
      );
    case 'cap':
      return (
        <group position={[0, 0.1, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.31, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.02, 0.3]} castShadow>
            <boxGeometry args={[0.3, 0.025, 0.2]} />
            <meshStandardMaterial color={mixHex(color, '#000000', 0.25)} roughness={0.7} />
          </mesh>
        </group>
      );
    case 'headband':
      return (
        <mesh position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.285, 0.03, 6, 20]} />
          <meshStandardMaterial color="#f4f1ea" roughness={0.7} />
        </mesh>
      );
    case 'goggles':
      return (
        <group>
          <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.295, 0.02, 6, 20]} />
            <meshStandardMaterial color={INK} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.12, 0.27]} castShadow>
            <boxGeometry args={[0.34, 0.1, 0.05]} />
            <meshStandardMaterial color="#9fd8e8" roughness={0.2} metalness={0.1} />
          </mesh>
        </group>
      );
  }
}

/** Things a character can hold in its right hand; only the current one is shown. */
function HandProps({
  accent,
  register,
}: {
  accent: string;
  register: (item: Held, node: Group | null) => void;
}) {
  const at: [number, number, number] = [0, -DIM.armFore, 0.08];
  const ref = (item: Held) => (node: Group | null) => register(item, node);
  return (
    <group position={at}>
      <group ref={ref('mug')} visible={false}>
        <mesh castShadow>
          <cylinderGeometry args={[0.045, 0.04, 0.09, 10]} />
          <meshStandardMaterial color={accent} roughness={0.5} />
        </mesh>
        <mesh position={[0.055, 0, 0]} castShadow>
          <boxGeometry args={[0.03, 0.05, 0.015]} />
          <meshStandardMaterial color={accent} roughness={0.5} />
        </mesh>
      </group>
      <group ref={ref('cup')} visible={false}>
        <mesh castShadow>
          <cylinderGeometry args={[0.035, 0.028, 0.08, 10]} />
          <meshStandardMaterial color="#f4f1ea" roughness={0.6} />
        </mesh>
      </group>
      <group ref={ref('phone')} visible={false} position={[0, 0.02, -0.04]}>
        <mesh rotation={[0.2, 0, 0]} castShadow>
          <boxGeometry args={[0.055, 0.11, 0.012]} />
          <meshStandardMaterial color={INK} roughness={0.35} />
        </mesh>
      </group>
      <group ref={ref('paper')} visible={false} position={[0, -0.02, 0.04]}>
        <mesh rotation={[-1.1, 0, 0]} castShadow>
          <boxGeometry args={[0.16, 0.21, 0.004]} />
          <meshStandardMaterial color="#fbfaf6" roughness={0.9} />
        </mesh>
      </group>
      <group ref={ref('marker')} visible={false}>
        <mesh rotation={[1.2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.11, 8]} />
          <meshStandardMaterial color={accent} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

interface Rig {
  root: Group | null;
  body: Group | null;
  head: Group | null;
  armL: Group | null;
  foreL: Group | null;
  armR: Group | null;
  foreR: Group | null;
  legL: Group | null;
  shinL: Group | null;
  legR: Group | null;
  shinR: Group | null;
  eyeL: Mesh | null;
  eyeR: Mesh | null;
  smile: Mesh | null;
  openMouth: Mesh | null;
  /** Props for the right hand, one group per item. */
  held: Partial<Record<Held, Group | null>>;
}

const EMPTY_RIG: Rig = {
  root: null,
  body: null,
  head: null,
  armL: null,
  foreL: null,
  armR: null,
  foreR: null,
  legL: null,
  shinL: null,
  legR: null,
  shinR: null,
  eyeL: null,
  eyeR: null,
  smile: null,
  openMouth: null,
  held: {},
};

interface Props {
  brain: CharacterBrain;
  look: Appearance;
  ctx: PoseContext;
  /** Present when there is something to open (a report or the final output). */
  onOpen?: () => void;
  accent: string;
}

/**
 * A chunky low-poly character. It owns no logic: every frame it asks its brain
 * where it is and what it is doing, turns that into a pose, and applies the joint
 * angles to the rig.
 */
export function Character({ brain, look, ctx, onOpen, accent }: Props) {
  const rig = useRef<Rig>({ ...EMPTY_RIG });
  const pose = useRef<Pose>({ ...NEUTRAL_POSE });
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && !!onOpen);

  const set =
    <K extends keyof Rig>(key: K) =>
    (node: Rig[K]) => {
      rig.current[key] = node;
    };
  const registerHeld = (item: Held, node: Group | null) => {
    rig.current.held[item] = node;
  };

  useFrame(({ clock }, delta) => {
    const r = rig.current;
    if (!r.root || !r.body || !r.head) return;
    const snap = brain.update(delta);
    pose.current = smoothPose(pose.current, computePose(snap, clock.elapsedTime, ctx), delta);
    const p = pose.current;

    r.root.position.set(snap.x, 0, snap.z);
    r.root.rotation.y = snap.heading;
    r.body.position.y = DIM.hipY + p.bodyY;
    r.body.rotation.set(p.bodyPitch, p.bodyYaw, p.bodyRoll);
    r.head.rotation.set(p.headPitch, p.headYaw, p.headRoll);

    r.armL?.rotation.set(-p.armLX, 0, p.armLZ);
    r.foreL?.rotation.set(-p.foreL, 0, 0);
    r.armR?.rotation.set(-p.armRX, 0, -p.armRZ);
    r.foreR?.rotation.set(-p.foreR, 0, 0);
    r.legL?.rotation.set(-p.hipL, 0, 0);
    r.shinL?.rotation.set(p.kneeL, 0, 0);
    r.legR?.rotation.set(-p.hipR, 0, 0);
    r.shinR?.rotation.set(p.kneeR, 0, 0);

    const eye = Math.max(p.eyeOpen, 0.08);
    r.eyeL?.scale.set(1, eye, 1);
    r.eyeR?.scale.set(1, eye, 1);
    const open = p.mouth > 0.12;
    if (r.openMouth) {
      r.openMouth.visible = open;
      r.openMouth.scale.set(1, Math.max(0.2, p.mouth * 1.5), 0.6);
    }
    if (r.smile) {
      r.smile.visible = !open;
      r.smile.scale.y = Math.abs(p.smile) < 0.05 ? 0.05 : p.smile;
    }
    for (const [item, node] of Object.entries(r.held)) {
      if (node) node.visible = item === p.held;
    }
  });

  const handlers = onOpen
    ? {
        onClick: (e: { stopPropagation: () => void; delta: number }) => {
          e.stopPropagation();
          // a drag that turned the camera is not a click
          if (e.delta > 6) return;
          onOpen();
        },
        onPointerOver: (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          setHovered(true);
        },
        onPointerOut: () => setHovered(false),
      }
    : {};

  const R = DIM.headR;
  // The head and torso are rigid: each is merged into a few meshes. A string,
  // so a re-render with the same looks doesn't trigger a re-merge.
  const batchVersion = JSON.stringify([look, accent]);
  const DYNAMIC = { dynamic: true };
  return (
    <group ref={set('root')} {...handlers}>
      <group ref={set('body')} position={[0, DIM.hipY, 0]}>
        {/* torso and hips */}
        <StaticBatch version={batchVersion}>
          <mesh position={[0, 0.03, 0]} castShadow>
            <boxGeometry args={[0.3, 0.14, 0.22]} />
            <meshStandardMaterial color={look.pants} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.2, 0]} castShadow>
            <capsuleGeometry args={[0.17, 0.12, 4, 10]} />
            <meshStandardMaterial color={look.outfit} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.37, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.06, 0.08, 8]} />
            <meshStandardMaterial color={look.skin} roughness={0.8} />
          </mesh>
        </StaticBatch>

        {/* head */}
        <group ref={set('head')} position={[0, DIM.headY, 0]}>
          <StaticBatch version={batchVersion}>
            <mesh castShadow>
              <icosahedronGeometry args={[R, 2]} />
              <meshStandardMaterial color={look.skin} roughness={0.7} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * (R - 0.01), -0.01, 0]} castShadow>
                <icosahedronGeometry args={[0.05, 1]} />
                <meshStandardMaterial color={look.skin} roughness={0.8} flatShading />
              </mesh>
            ))}
            {/* face */}
            <mesh ref={set('eyeL')} userData={DYNAMIC} position={[0.105, 0.04, 0.262]}>
              <icosahedronGeometry args={[0.042, 1]} />
              <meshStandardMaterial color={INK} roughness={0.3} />
            </mesh>
            <mesh ref={set('eyeR')} userData={DYNAMIC} position={[-0.105, 0.04, 0.262]}>
              <icosahedronGeometry args={[0.042, 1]} />
              <meshStandardMaterial color={INK} roughness={0.3} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.175, -0.05, 0.225]} rotation={[0, s * 0.7, 0]}>
                <circleGeometry args={[0.048, 12]} />
                <meshBasicMaterial
                  color={look.cheek}
                  transparent
                  opacity={0.65}
                  toneMapped={false}
                />
              </mesh>
            ))}
            <mesh
              ref={set('smile')}
              userData={DYNAMIC}
              position={[0, -0.075, 0.272]}
              rotation={[0, 0, Math.PI]}
            >
              <torusGeometry args={[0.05, 0.011, 6, 12, Math.PI]} />
              <meshStandardMaterial color={MOUTH} side={2} />
            </mesh>
            <mesh
              ref={set('openMouth')}
              userData={DYNAMIC}
              position={[0, -0.115, 0.262]}
              visible={false}
            >
              <icosahedronGeometry args={[0.04, 1]} />
              <meshStandardMaterial color={MOUTH} />
            </mesh>
            <Hair style={look.hairStyle} color={look.hair} />
            <Accessory kind={look.accessory} color={accent} />
          </StaticBatch>
        </group>

        {/* arms */}
        {([1, -1] as const).map((side) => (
          <group
            key={side}
            ref={set(side === 1 ? 'armL' : 'armR')}
            position={[side * DIM.shoulderX, DIM.shoulderY, 0]}
          >
            <Limb radius={0.06} length={DIM.armUpper} color={look.outfit} />
            <group ref={set(side === 1 ? 'foreL' : 'foreR')} position={[0, -DIM.armUpper, 0]}>
              {/* forearm and hand share a material: one mesh */}
              <StaticBatch version={batchVersion}>
                <Limb radius={0.05} length={DIM.armFore} color={look.skin} />
                <mesh position={[0, -DIM.armFore, 0]} castShadow>
                  <icosahedronGeometry args={[0.058, 1]} />
                  <meshStandardMaterial color={look.skin} roughness={0.75} />
                </mesh>
              </StaticBatch>
              {side === -1 && <HandProps accent={accent} register={registerHeld} />}
            </group>
          </group>
        ))}

        {/* legs */}
        {([1, -1] as const).map((side) => (
          <group
            key={side}
            ref={set(side === 1 ? 'legL' : 'legR')}
            position={[side * 0.095, -0.02, 0]}
          >
            <Limb radius={0.07} length={DIM.thigh} color={look.pants} />
            <group ref={set(side === 1 ? 'shinL' : 'shinR')} position={[0, -DIM.thigh, 0]}>
              <Limb radius={0.06} length={DIM.shin} color={look.pants} />
              <mesh position={[0, -DIM.shin + 0.01, 0.04]} castShadow>
                <boxGeometry args={[0.13, 0.075, 0.21]} />
                <meshStandardMaterial color={look.shoes} roughness={0.6} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}
