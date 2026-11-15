import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import type { OrthographicCamera } from 'three';
import { roomCorners } from '../layout';
import { fitCamera, isoDirection } from './camera';

const DISTANCE = 60;

/** Isometric camera, re-fitted whenever the canvas is resized so the whole room stays in view. */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    const direction = isoDirection();
    const { zoom, target } = fitCamera({
      corners: roomCorners(),
      direction,
      viewport: { width: size.width, height: size.height },
      margin: 0.03,
    });
    camera.position.set(
      target[0] + direction[0] * DISTANCE,
      target[1] + direction[1] * DISTANCE,
      target[2] + direction[2] * DISTANCE,
    );
    camera.zoom = zoom;
    camera.near = 0.1;
    camera.far = DISTANCE * 3;
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);

  return null;
}
