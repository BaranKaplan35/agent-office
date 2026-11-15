import type { ActivityTone } from '../../state/selectors';
import type { ScenePalette } from '../scene/palette';

/** Screen / indicator colour for an agent's current activity. */
export function toneColors(
  palette: ScenePalette,
  tone: ActivityTone,
): { color: string; intensity: number } {
  switch (tone) {
    case 'working':
      return { color: palette.primary, intensity: 1.2 };
    case 'review':
      return { color: palette.accent, intensity: 1.3 };
    case 'ok':
      return { color: palette.success, intensity: 1 };
    case 'danger':
      return { color: palette.danger, intensity: 1.2 };
    default:
      return { color: '#4a5d70', intensity: 0.35 };
  }
}
