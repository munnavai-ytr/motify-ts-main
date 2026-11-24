'use client';

import React from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  Bell,
  Bookmark,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Cpu,
  Crown,
  Flame,
  Gift,
  Globe,
  Heart,
  Layers,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  Music,
  Percent,
  Phone,
  Play,
  Rocket,
  Shield,
  ShoppingBag,
  Sparkles,
  Star,
  Sun,
  Tag,
  ThumbsUp,
  TrendingUp,
  User,
  Users,
  Video,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { kitAttrs, useKitSceneContext } from './context';
import {
  computeAmbientStyle,
  computeEntranceStyle,
  computeExitStyle,
  mergeMotionStyles,
  type AnimAmbientPreset,
  type AnimInPreset,
  type AnimOutPreset,
  type EasePreset,
} from '../anim';

export const KIT_ICON_MAP = {
  sparkles: Sparkles,
  zap: Flame,
  flame: Flame,
  star: Star,
  heart: Heart,
  check: Check,
  'check-circle': CheckCircle2,
  'arrow-right': ArrowRight,
  'arrow-up-right': ArrowUpRight,
  'trending-up': TrendingUp,
  award: Award,
  shield: Shield,
  clock: Clock,
  calendar: Calendar,
  'map-pin': MapPin,
  phone: Phone,
  mail: Mail,
  globe: Globe,
  'shopping-bag': ShoppingBag,
  tag: Tag,
  percent: Percent,
  gift: Gift,
  rocket: Rocket,
  layers: Layers,
  cpu: Cpu,
  play: Play,
  'volume-2': Volume2,
  camera: Camera,
  video: Video,
  music: Music,
  users: Users,
  user: User,
  'message-circle': MessageCircle,
  'thumbs-up': ThumbsUp,
  bell: Bell,
  bookmark: Bookmark,
  compass: Compass,
  sun: Sun,
  moon: Moon,
  crown: Crown,
} as const satisfies Record<string, LucideIcon>;

export type KitIconName = keyof typeof KIT_ICON_MAP;

export const KIT_ICON_NAMES = Object.keys(KIT_ICON_MAP) as KitIconName[];

export function isKnownKitIcon(name: string): name is KitIconName {
  return Object.prototype.hasOwnProperty.call(KIT_ICON_MAP, name);
}

export function resolveKitIconName(name?: string): KitIconName {
  if (name && isKnownKitIcon(name)) {
    return name;
  }
  return 'sparkles';
}

export function getKitIconComponent(name?: string): LucideIcon {
  return KIT_ICON_MAP[resolveKitIconName(name)];
}

export interface KitIconProps {
  name?: string;
  size: number;
  color: string;
  strokeWidth?: number;
  animIn?: AnimInPreset;
  animOut?: AnimOutPreset;
  ambient?: AnimAmbientPreset;
  ease?: EasePreset;
  delayFrames?: number;
  exitFrames?: number;
  style?: React.CSSProperties;
}

export function KitIcon({
  name,
  size,
  color,
  strokeWidth = 2.2,
  animIn = 'none',
  animOut = 'none',
  ambient = 'none',
  ease = 'smooth',
  delayFrames = 0,
  exitFrames = 10,
  style,
}: KitIconProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ctx = useKitSceneContext();

  const resolvedName = resolveKitIconName(name);
  const IconComponent = KIT_ICON_MAP[resolvedName];

  const entrance = computeEntranceStyle({
    preset: animIn,
    frame: frame + ctx.preRollFrames,
    fps,
    delayFrames,
    durationFrames: 14,
    ease,
  });

  const exit = computeExitStyle({
    preset: animOut,
    frame,
    durationInFrames,
    exitFrames,
  });

  const ambientStyle = computeAmbientStyle({
    preset: ambient,
    frame,
    fps,
    amplitudePx: Math.max(3, size * 0.08),
  });

  const motionStyle = mergeMotionStyles(entrance, exit, ambientStyle);

  return (
    <div
      {...kitAttrs('icon', { sceneIndex: ctx.sceneIndex, zone: 'content' })}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        ...motionStyle,
        ...style,
      }}
    >
      <IconComponent size={size} color={color} strokeWidth={strokeWidth} />
    </div>
  );
}
