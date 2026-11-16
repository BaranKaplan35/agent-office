import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { advanceCaptureClock, CAPTURE_FPS, captureHooks, stepCssAnimations } from '../capture';

/** Let React commit what the last frame changed (bubbles, arriving state …). */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Capture mode only (`?capture=1`): the Canvas runs with `frameloop="never"` and
 * this component lets a recorder step it, one fixed 1/15 s frame at a time.
 */
export function CaptureDriver() {
  const advance = useThree((s) => s.advance);

  useEffect(() => {
    captureHooks.step = async (frames = 1) => {
      for (let i = 0; i < frames; i++) {
        const t = advanceCaptureClock(1 / CAPTURE_FPS);
        stepCssAnimations(document, 1000 / CAPTURE_FPS);
        advance(t);
        await settle();
      }
    };
    // Draw the first frame so the scene is visible before the first step.
    advance(0);
    captureHooks.ready = true;
    return () => {
      captureHooks.step = undefined;
      captureHooks.ready = false;
    };
  }, [advance]);

  return null;
}
