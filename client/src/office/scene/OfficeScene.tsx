import type { Lang, PublicTeam, Task } from '@agent-office/shared';
import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import {
  activityTone,
  agentActivity,
  sameSelection,
  selectionForAgent,
  type AgentActivity,
  type Selection,
} from '../../state/selectors';
import { Envelopes } from '../effects/Envelopes';
import { FlightBoard, flightsFor, MessageWatcher } from '../effects/flights';
import { buildLayout, HUB_POSITION } from '../layout';
import { BushPlant, PendantLamp, TallPlant, WallClock } from '../models/Decor';
import { Bookshelf, CoffeeCorner, Rug } from '../models/Furniture';
import { Outside } from '../models/Outside';
import { LAMP_Y, LAMPS, PLANTS } from '../props';
import { Room } from '../models/Room';
import { StaticBatch } from '../models/StaticBatch';
import { profileFor, useQuality, useQualityLevel } from '../quality';
import { FOCUS_HEIGHT } from './camera';
import { CameraRig, type CameraHandle } from './CameraRig';
import { daylight } from './daylight';
import { Lighting } from './Lighting';
import { useScenePalette } from './palette';
import { Cast, type CastEntry } from './Cast';
import { DeskTag } from './DeskTag';
import { Station } from './Station';
import { TagProjector, type TagAnchor } from './TagProjector';
import { ToneMapping } from './ToneMapping';
import { PerfProbe } from './PerfProbe';
import { useSceneHour } from './useSceneHour';

export interface OfficeSceneProps {
  team: PublicTeam;
  task: Task | null;
  lang: Lang;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  /** Reduced motion: no wandering or loops, fades instead of flights, instant camera. */
  reduced: boolean;
  /** Lets the stage reset the camera (button, Esc). */
  cameraRef?: Ref<CameraHandle>;
  /** Called when the camera leaves or returns to the overview. */
  onViewMoved?: (moved: boolean) => void;
  /** All visible text is passed in already translated: the scene never reads React context. */
  texts: {
    canvas: string;
    status: (activity: AgentActivity) => string;
    open: (agentName: string) => string;
  };
}

export default function OfficeScene({
  team,
  task,
  lang,
  selection,
  onSelect,
  reduced,
  cameraRef,
  onViewMoved,
  texts,
}: OfficeSceneProps) {
  const level = useQualityLevel();
  const profile = profileFor(level);
  const autoMode = useQuality((s) => s.setting === 'auto');
  const lowerAutoLevel = useQuality((s) => s.lowerAutoLevel);
  const palette = useScenePalette();
  const hour = useSceneHour();
  const light = useMemo(() => daylight(hour), [hour]);
  const layout = useMemo(() => buildLayout(team.agents), [team.agents]);

  // The stage's handle and the scene's own focus calls share one camera rig.
  const camera = useRef<CameraHandle>(null);
  const setCamera = useCallback(
    (handle: CameraHandle | null) => {
      camera.current = handle;
      if (typeof cameraRef === 'function') cameraRef(handle);
      else if (cameraRef) cameraRef.current = handle;
    },
    [cameraRef],
  );

  // New assignment messages become envelopes flying from the hub to the desks.
  const [watcher] = useState(() => new MessageWatcher());
  const [board] = useState(() => new FlightBoard());
  const lastTaskId = useRef<string | null>(null);
  useEffect(() => {
    if ((task?.id ?? null) !== lastTaskId.current) {
      lastTaskId.current = task?.id ?? null;
      board.clear();
    }
    const fresh = watcher.take(task);
    if (fresh.length === 0) return;
    const colorOf = (id: string) => team.agents.find((a) => a.id === id)?.deskColor ?? '#ffffff';
    board.add(flightsFor(fresh, layout, colorOf, performance.now() / 1000));
  }, [task, layout, team.agents, watcher, board]);

  // Name tags are plain DOM; the projector keeps them glued to these 3D points.
  const tagRegistry = useRef(new Map<string, HTMLElement>());

  const entries = [layout.hub, ...layout.desks].flatMap((slot, index) => {
    const agent = team.agents.find((a) => a.id === slot.agentId);
    if (!agent) return [];
    const activity = agentActivity(task, agent);
    const target = selectionForAgent(task, agent);
    return [
      {
        slot,
        agent,
        index,
        activity,
        tone: activityTone(activity),
        target,
        selected: !!target && sameSelection(target, selection),
        open: target
          ? () => {
              onSelect(target);
              camera.current?.focus([slot.x, FOCUS_HEIGHT, slot.z]);
            }
          : undefined,
      },
    ];
  });
  const castEntries: CastEntry[] = entries.map(({ slot, agent, index, activity, open }) => ({
    slot,
    agent,
    index,
    activity,
    open,
  }));
  const celebrating = entries.length > 0 && entries.every((e) => e.activity === 'done');
  const anchors = entries.map(({ slot, agent }): TagAnchor => ({
    id: agent.id,
    position: [slot.x, agent.type === 'coordinator' ? 3.1 : 2.9, slot.z],
  }));

  return (
    <div className="office-canvas" role="group" aria-label={texts.canvas}>
      <Canvas
        // A different quality level needs a fresh renderer (shadows can't be toggled live).
        key={level}
        orthographic
        shadows={profile.shadows ? 'percentage' : false}
        dpr={profile.dpr}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [40, 40, 40], zoom: 40, near: 0.1, far: 180 }}
      >
        {autoMode && <PerformanceMonitor onDecline={lowerAutoLevel} />}
        <ToneMapping />
        <CameraRig
          handle={setCamera}
          reduced={reduced}
          onMovedChange={onViewMoved}
          resetKey={team.id}
        />
        <PerfProbe />
        <Lighting light={light} profile={profile} />

        {/* Everything that never moves is drawn as a few merged meshes. */}
        <StaticBatch version={palette}>
          <Room palette={palette} />
          <Rug palette={palette} x={HUB_POSITION.x} z={HUB_POSITION.z} />
          <Bookshelf palette={palette} />
          <CoffeeCorner palette={palette} />
          <WallClock palette={palette} hour={light.hour} />
          {PLANTS.map((plant, i) =>
            plant.kind === 'tall' ? (
              <TallPlant
                key={i}
                palette={palette}
                position={[plant.x, 0, plant.z]}
                scale={plant.scale}
              />
            ) : (
              <BushPlant
                key={i}
                palette={palette}
                position={[plant.x, 0, plant.z]}
                scale={plant.scale}
              />
            ),
          )}
        </StaticBatch>
        <Outside palette={palette} light={light} />

        {LAMPS.map((lamp, i) => (
          <PendantLamp
            key={i}
            palette={palette}
            position={[lamp.x, LAMP_Y, lamp.z]}
            glow={light.lamps}
            light={i < profile.lampLights}
          />
        ))}

        {entries.map(({ slot, agent, index, tone, selected, open }) => (
          <Station
            key={agent.id}
            slot={slot}
            agent={agent}
            palette={palette}
            tone={tone}
            selected={selected}
            withPlant={index % 2 === 1}
            seed={index + 1}
            still={reduced}
            onOpen={open}
          />
        ))}
        <Cast
          layout={layout}
          entries={castEntries}
          palette={palette}
          celebrating={celebrating}
          teamKey={team.id}
          board={board}
          reduced={reduced}
        />
        <Envelopes board={board} reduced={reduced} shadows={profile.shadows} />
        <TagProjector anchors={anchors} registry={tagRegistry} />
      </Canvas>

      <div className="desk-tags">
        {entries.map(({ agent, activity, tone, selected, open }) => (
          <DeskTag
            key={agent.id}
            agent={agent}
            lang={lang}
            activity={activity}
            tone={tone}
            status={texts.status(activity)}
            openLabel={texts.open(agent.name[lang])}
            selected={selected}
            onOpen={open}
            register={(el) => {
              if (el) tagRegistry.current.set(agent.id, el);
              else tagRegistry.current.delete(agent.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}
