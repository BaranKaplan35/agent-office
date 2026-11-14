// Loaded lazily (see AgentAvatar): the lucide name → module map is large, and only
// the handful of icons a team actually uses are ever fetched.
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic';
import type { ReactElement } from 'react';

const KNOWN = new Set<string>(iconNames);

interface Props {
  name: string;
  size: number;
  fallback: () => ReactElement;
}

export default function LucideIcon({ name, size, fallback }: Props) {
  if (!KNOWN.has(name)) return fallback();
  return <DynamicIcon name={name as IconName} size={size} fallback={fallback} />;
}
