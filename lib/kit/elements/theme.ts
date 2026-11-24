import { getFontFamilyStack } from '../fonts';
import { getStyleDef, type StyleDef } from '../styles';
import {
  MOODS,
  PALETTES,
  ensureContrast,
  type IntensityName,
  type KitPalette,
  type MoodName,
  type MoodToken,
  type PaletteName,
  type PartialKitPalette,
  type StyleName,
} from '../tokens';

export interface ResolvedKitTheme {
  paletteName: PaletteName | 'custom';
  palette: KitPalette;
  moodName: MoodName;
  mood: MoodToken;
  styleName: StyleName;
  style: StyleDef;
  intensity: IntensityName;
  seed: number;
  titleFontFamily: string;
  bodyFontFamily: string;
}

export function resolveKitTheme(input?: {
  palette?: PaletteName | PartialKitPalette;
  mood?: MoodName;
  style?: StyleName;
  intensity?: IntensityName;
  seed?: number;
}): ResolvedKitTheme {
  const styleName: StyleName =
    input?.style ?? 'clean';
  const styleDef = getStyleDef(styleName);

  const moodName: MoodName =
    input?.mood && input.mood in MOODS ? input.mood : styleDef.defaultMood;
  const mood = MOODS[moodName];

  let paletteName: PaletteName | 'custom' = 'ember';
  let rawPalette: KitPalette | PartialKitPalette = PALETTES.ember;

  if (typeof input?.palette === 'string' && input.palette in PALETTES) {
    paletteName = input.palette;
    rawPalette = PALETTES[input.palette];
  } else if (input?.palette && typeof input.palette === 'object') {
    paletteName = 'custom';
    rawPalette = input.palette;
  }

  const { palette } = ensureContrast(rawPalette);

  // When style is explicitly non-clean, blend style typography/radius/weights cleanly
  const useStyleOverrides = styleName !== 'clean';
  const titleRole = useStyleOverrides ? styleDef.titleFontRole : mood.titleFontRole;
  const bodyRole = useStyleOverrides ? styleDef.bodyFontRole : mood.bodyFontRole;

  const effectiveMood: MoodToken = useStyleOverrides
    ? {
        ...mood,
        titleWeight: styleDef.titleWeight,
        bodyWeight: styleDef.bodyWeight,
        tracking: styleDef.tracking,
        radiusScale: styleDef.radiusScale,
        borderWidth: styleDef.borderWidth,
      }
    : mood;

  return {
    paletteName,
    palette,
    moodName,
    mood: effectiveMood,
    styleName,
    style: styleDef,
    intensity: input?.intensity ?? 'balanced',
    seed: typeof input?.seed === 'number' ? input.seed : 1337,
    titleFontFamily: getFontFamilyStack(titleRole),
    bodyFontFamily: getFontFamilyStack(bodyRole),
  };
}
