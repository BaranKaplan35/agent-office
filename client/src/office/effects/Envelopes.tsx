import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SpriteMaterial,
  type Group,
  type Mesh,
  type Sprite,
} from 'three';
import { envelopeFrame, type FlightBoard } from './flights';

/** Envelopes drawn at the same time; more than this simply wait their turn. */
const POOL = 6;
const W = 0.6;
const H = 0.42;

let glow: CanvasTexture | null = null;
/** A soft round glow, painted once in code (no image files). */
function glowTexture(): CanvasTexture {
  if (glow) return glow;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  glow = new CanvasTexture(canvas);
  return glow;
}

const PAPER = '#fffaf0';

/** One reusable envelope: its nodes and its own materials (recoloured per flight). */
interface Slot {
  root: Group | null;
  body: Group | null;
  halo: Sprite | null;
  ring: Mesh | null;
  paper: MeshStandardMaterial;
  accent: MeshStandardMaterial;
  haloMat: SpriteMaterial | null;
  ringMat: MeshBasicMaterial;
  flightId: string | null;
}

function makeSlot(): Slot {
  const texture = typeof document !== 'undefined' ? glowTexture() : null;
  return {
    root: null,
    body: null,
    halo: null,
    ring: null,
    paper: new MeshStandardMaterial({
      color: PAPER,
      emissive: new Color('#fff1d6'),
      emissiveIntensity: 0.55,
      roughness: 0.6,
      transparent: true,
    }),
    accent: new MeshStandardMaterial({ emissiveIntensity: 0.6, roughness: 0.5, transparent: true }),
    haloMat: texture
      ? new SpriteMaterial({
          map: texture,
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
          toneMapped: false,
        })
      : null,
    ringMat: new MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    }),
    flightId: null,
  };
}

function disposeSlot(slot: Slot): void {
  slot.paper.dispose();
  slot.accent.dispose();
  slot.haloMat?.dispose();
  slot.ringMat.dispose();
}

interface Props {
  board: FlightBoard;
  reduced: boolean;
  /** Cast a shadow on the floor while flying (High quality). */
  shadows: boolean;
}

/**
 * The glowing envelopes that carry assignments from the hub to the desks. A
 * fixed pool of meshes is reused; every frame reads the flight board and places
 * them, without any React state.
 */
export function Envelopes({ board, reduced, shadows }: Props) {
  const slots = useMemo(() => Array.from({ length: POOL }, makeSlot), []);
  useEffect(() => () => slots.forEach(disposeSlot), [slots]);

  useFrame(() => {
    const now = performance.now() / 1000;
    const flights = board.active(now, reduced);
    slots.forEach((slot, i) => {
      const flight = flights[i];
      if (!slot.root) return;
      if (!flight) {
        slot.root.visible = false;
        slot.flightId = null;
        return;
      }
      const elapsed = now - flight.start;
      const f = envelopeFrame(flight.from, flight.to, elapsed, reduced);
      slot.root.visible = f.opacity > 0.001 && !f.done;
      if (!slot.root.visible) return;

      if (slot.flightId !== flight.id) {
        slot.flightId = flight.id;
        slot.accent.color.set(flight.color);
        slot.accent.emissive.set(flight.color);
        slot.haloMat?.color.set(flight.color);
        slot.ringMat.color.set(flight.color);
      }

      slot.root.position.set(...f.position);
      if (slot.body) {
        const [tx, ty, tz] = f.tangent;
        const moving = tx !== 0 || ty !== 0 || tz !== 0;
        // Lie flat, nose along the direction of travel, with a little flutter.
        const yaw = moving ? Math.atan2(tx, tz) : Math.PI / 4;
        const pitch = moving ? -Math.asin(Math.max(-1, Math.min(1, ty))) * 0.8 : 0;
        const roll = moving ? Math.sin(elapsed * 9) * 0.18 : 0;
        slot.body.rotation.set(pitch, yaw, roll, 'YXZ');
        slot.body.scale.setScalar(Math.max(f.scale, 0.001));
        slot.body.position.y = moving ? 0 : 0.08 + (reduced ? 0 : 0.04 * Math.sin(elapsed * 6));
      }
      slot.paper.opacity = f.opacity;
      slot.accent.opacity = f.opacity;
      if (slot.halo && slot.haloMat) {
        slot.haloMat.opacity = 0.75 * f.opacity;
        slot.halo.scale.setScalar(1.5 * Math.max(f.scale, 0.2));
      }
      if (slot.ring) {
        slot.ring.visible = f.ring !== null;
        if (f.ring !== null) {
          slot.ring.scale.setScalar(0.3 + f.ring * 1.4);
          slot.ringMat.opacity = 0.8 * (1 - f.ring);
        }
      }
    });
  });

  return (
    <group>
      {slots.map((slot, i) => (
        <group
          key={i}
          visible={false}
          ref={(node) => {
            slot.root = node;
          }}
        >
          <group
            ref={(node) => {
              slot.body = node;
            }}
          >
            {/* paper */}
            <mesh castShadow={shadows} material={slot.paper}>
              <boxGeometry args={[W, 0.03, H]} />
            </mesh>
            {/* the flap: two strips meeting in a V, and a round seal */}
            {[-1, 1].map((s) => (
              <mesh
                key={s}
                position={[s * W * 0.24, 0.018, -H * 0.12]}
                rotation={[0, s * 0.62, 0]}
                material={slot.accent}
              >
                <boxGeometry args={[W * 0.56, 0.01, 0.04]} />
              </mesh>
            ))}
            <mesh position={[0, 0.022, 0.03]} material={slot.accent}>
              <cylinderGeometry args={[0.06, 0.06, 0.014, 14]} />
            </mesh>
          </group>
          {slot.haloMat && (
            <sprite
              ref={(node) => {
                slot.halo = node;
              }}
              position={[0, 0.06, 0]}
              material={slot.haloMat}
            />
          )}
          <mesh
            ref={(node) => {
              slot.ring = node;
            }}
            position={[0, -0.2, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={false}
            material={slot.ringMat}
          >
            <ringGeometry args={[0.42, 0.52, 40]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
