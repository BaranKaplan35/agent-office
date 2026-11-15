import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { NeutralToneMapping } from 'three';

/**
 * Khronos "PBR Neutral" tone mapping: highlights roll off softly while the
 * theme's colours stay true (the default ACES look washes them out).
 */
export function ToneMapping() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    gl.toneMapping = NeutralToneMapping;
    gl.toneMappingExposure = 1;
    invalidate();
  }, [gl, invalidate]);
  return null;
}
