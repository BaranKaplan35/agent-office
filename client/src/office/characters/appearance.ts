/**
 * How each agent looks (pure): skin, hair, a role accessory and an outfit in the
 * agent's desk colour. Everything is derived from the agent, so the same agent
 * always looks the same.
 */
import { mixHex } from '../scene/daylight';

export type HairStyle = 'short' | 'bun' | 'spiky' | 'long';
export type Accessory = 'headset' | 'glasses' | 'cap' | 'headband' | 'goggles';

export interface Appearance {
  skin: string;
  cheek: string;
  hair: string;
  hairStyle: HairStyle;
  accessory: Accessory;
  outfit: string;
  pants: string;
  shoes: string;
}

const SKIN = ['#f6d3b3', '#ebb893', '#d39a70', '#b27650', '#86563a'];
const HAIR = ['#2b2118', '#5a3a22', '#8a5a2b', '#d9a441', '#b84a32', '#3a3f55'];
const HAIR_STYLES: HairStyle[] = ['short', 'bun', 'spiky', 'long'];
const FALLBACK_ACCESSORIES: Accessory[] = ['glasses', 'cap', 'headband', 'goggles'];

/** Role accessory from the agent's lucide icon. */
const BY_ICON: Record<string, Accessory> = {
  'clipboard-list': 'headset',
  rocket: 'headset',
  code: 'glasses',
  cpu: 'glasses',
  'book-open': 'cap',
  lightbulb: 'cap',
  bug: 'goggles',
  'shield-check': 'goggles',
  megaphone: 'headband',
};

/** FNV-1a: a small, stable string hash. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function appearanceFor(
  agent: { id: string; icon: string; deskColor: string; type: 'coordinator' | 'worker' },
  index: number,
): Appearance {
  const h = hashString(agent.id);
  const skin = SKIN[h % SKIN.length] as string;
  const accessory: Accessory =
    agent.type === 'coordinator'
      ? 'headset'
      : (BY_ICON[agent.icon] ??
        (FALLBACK_ACCESSORIES[index % FALLBACK_ACCESSORIES.length] as Accessory));
  // Hats and headbands cover the hair, so those characters get the plain short cut.
  const hairStyle: HairStyle =
    accessory === 'cap' || accessory === 'headband'
      ? 'short'
      : (HAIR_STYLES[(h >>> 7) % HAIR_STYLES.length] as HairStyle);
  return {
    skin,
    cheek: mixHex(skin, '#ff7f8f', 0.45),
    hair: HAIR[(h >>> 3) % HAIR.length] as string,
    hairStyle,
    accessory,
    outfit: agent.deskColor,
    pants: mixHex('#3a4150', agent.deskColor, 0.18),
    shoes: '#2a2f36',
  };
}
