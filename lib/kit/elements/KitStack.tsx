import React from 'react';

export interface KitStackProps {
  direction?: 'column' | 'row';
  gap: number;
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function KitStack({
  direction = 'column',
  gap,
  align = 'flex-start',
  justify = 'flex-start',
  width = '100%',
  height,
  style,
  children,
}: KitStackProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: direction,
        gap,
        alignItems: align,
        justifyContent: justify,
        width,
        ...(height !== undefined ? { height } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
