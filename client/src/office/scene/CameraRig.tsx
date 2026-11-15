import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type Ref,
} from 'react';
import { Vector3 } from 'three';
import { roomCorners } from '../layout';
import { fitCamera, focusZoom, isOverview, isoDirection, orbitLimits, type Vec3 } from './camera';

const DISTANCE = 60;
const { ACTION } = CameraControlsImpl;

/** What the rest of the office can ask the camera to do. */
export interface CameraHandle {
  /** Glide to a point (a desk) and zoom in a little. */
  focus: (point: Vec3) => void;
  /** Back to the overview of the whole room. */
  reset: () => void;
}

interface Props {
  handle?: Ref<CameraHandle>;
  /** Reduced motion: every camera move is instant. */
  reduced: boolean;
  /** Called when the view leaves or returns to the overview. */
  onMovedChange?: (moved: boolean) => void;
  /** Changing it snaps back to the overview (e.g. another team). */
  resetKey?: string;
}

/**
 * Isometric orthographic camera the viewer can turn and zoom within limits (no
 * free panning). It re-fits the room whenever the canvas is resized, and glides
 * to a desk when one is opened from the scene.
 */
export function CameraRig({ handle, reduced, onMovedChange, resetKey }: Props) {
  const controls = useRef<CameraControlsImpl>(null);
  const size = useThree((s) => s.size);
  const moved = useRef(false);
  const target = useMemo(() => new Vector3(), []);

  const fit = useMemo(
    () =>
      fitCamera({
        corners: roomCorners(),
        direction: isoDirection(),
        viewport: { width: size.width, height: size.height },
        margin: 0.03,
      }),
    [size.width, size.height],
  );

  const overview = useCallback(
    (animate: boolean) => {
      const c = controls.current;
      if (!c) return;
      const d = isoDirection();
      const [tx, ty, tz] = fit.target;
      void c.setLookAt(
        tx + d[0] * DISTANCE,
        ty + d[1] * DISTANCE,
        tz + d[2] * DISTANCE,
        tx,
        ty,
        tz,
        animate,
      );
      void c.zoomTo(fit.zoom, animate);
    },
    [fit],
  );

  // Limits follow the fitted zoom; an untouched view is re-fitted on every resize.
  useLayoutEffect(() => {
    const c = controls.current;
    if (!c) return;
    const l = orbitLimits(fit.zoom);
    c.minAzimuthAngle = l.minAzimuth;
    c.maxAzimuthAngle = l.maxAzimuth;
    c.minPolarAngle = l.minPolar;
    c.maxPolarAngle = l.maxPolar;
    c.minZoom = l.minZoom;
    c.maxZoom = l.maxZoom;
    c.camera.near = 0.1;
    c.camera.far = DISTANCE * 3;
    c.camera.updateProjectionMatrix();
    if (!moved.current) overview(false);
  }, [fit, overview]);

  // A new canvas (e.g. another quality level) starts at the overview: tell the stage.
  const movedChange = useRef(onMovedChange);
  useEffect(() => {
    movedChange.current = onMovedChange;
  });
  useEffect(() => () => movedChange.current?.(false), []);

  // Another team: start from the overview again.
  const firstKey = useRef(resetKey);
  useEffect(() => {
    if (resetKey === firstKey.current) return;
    firstKey.current = resetKey;
    overview(false);
  }, [resetKey, overview]);

  useImperativeHandle(
    handle,
    () => ({
      focus: ([x, y, z]) => {
        const c = controls.current;
        if (!c) return;
        void c.moveTo(x, y, z, !reduced);
        void c.zoomTo(focusZoom(fit.zoom, c.camera.zoom), !reduced);
      },
      reset: () => overview(!reduced),
    }),
    [fit, overview, reduced],
  );

  const onChange = () => {
    const c = controls.current;
    if (!c) return;
    c.getTarget(target);
    const atOverview = isOverview(
      {
        azimuth: c.azimuthAngle,
        polar: c.polarAngle,
        zoom: c.camera.zoom,
        target: [target.x, target.y, target.z],
      },
      fit,
    );
    if (moved.current === !atOverview) return;
    moved.current = !atOverview;
    onMovedChange?.(moved.current);
  };

  return (
    <CameraControls
      ref={controls}
      makeDefault
      smoothTime={reduced ? 0 : 0.35}
      draggingSmoothTime={reduced ? 0 : 0.1}
      // Turn with the left button / one finger, zoom with the wheel / pinch; no panning.
      mouseButtons={{
        left: ACTION.ROTATE,
        middle: ACTION.NONE,
        right: ACTION.NONE,
        wheel: ACTION.ZOOM,
      }}
      touches={{ one: ACTION.TOUCH_ROTATE, two: ACTION.TOUCH_ZOOM, three: ACTION.NONE }}
      // Turning: half the library default feels right for a small diorama.
      azimuthRotateSpeed={0.5}
      polarRotateSpeed={0.5}
      onChange={onChange}
      // the last 'update' can come just before the camera settles
      onRest={onChange}
      onSleep={onChange}
    />
  );
}
