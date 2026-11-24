'use client';

import React, { createContext, useContext } from 'react';
import { STYLE_DEFS, type StyleDef } from '../styles';
import {
  PALETTES,
  type IntensityName,
  type KitPalette,
  type NumeralSystem,
} from '../tokens';

export type KitElementKind =
  | 'text'
  | 'icon'
  | 'shape'
  | 'badge'
  | 'button'
  | 'counter'
  | 'decor'
  | 'bg';

export type KitZone = 'content' | 'decor';

export interface KitAttrsOptions {
  sceneIndex?: number;
  zone?: KitZone;
  avoid?: boolean;
}

export interface KitDataAttributes {
  'data-kit': KitElementKind;
  'data-kit-scene'?: string;
  'data-kit-zone': KitZone;
  'data-kit-avoid'?: 'true';
}

export function kitAttrs(
  kind: KitElementKind,
  opts?: KitAttrsOptions
): KitDataAttributes {
  const defaultZone: KitZone =
    kind === 'decor' || kind === 'bg' ? 'decor' : 'content';
  const attrs: KitDataAttributes = {
    'data-kit': kind,
    'data-kit-zone': opts?.zone ?? defaultZone,
  };
  if (opts?.sceneIndex !== undefined) {
    attrs['data-kit-scene'] = String(opts.sceneIndex);
  }
  if (opts?.avoid) {
    attrs['data-kit-avoid'] = 'true';
  }
  return attrs;
}

export interface KitSceneContextValue {
  preRollFrames: number;
  style: StyleDef;
  palette: KitPalette;
  intensity: IntensityName;
  sceneIndex: number;
  numerals?: NumeralSystem;
}

const DEFAULT_CONTEXT: KitSceneContextValue = {
  preRollFrames: 0,
  style: STYLE_DEFS.clean,
  palette: PALETTES.ember,
  intensity: 'balanced',
  sceneIndex: 0,
};

const KitSceneContext = createContext<KitSceneContextValue>(DEFAULT_CONTEXT);

export function KitSceneProvider({
  value,
  children,
}: {
  value: KitSceneContextValue;
  children: React.ReactNode;
}) {
  return (
    <KitSceneContext.Provider value={value}>
      {children}
    </KitSceneContext.Provider>
  );
}

export function useKitSceneContext(): KitSceneContextValue {
  return useContext(KitSceneContext);
}
