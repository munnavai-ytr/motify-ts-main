'use client';

import { useEffect, useState } from 'react';

export function useVisualViewportHeight(): number | null {
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      if (window.innerWidth < 768) {
        setViewportHeight(Math.round(vv.height));
      } else {
        setViewportHeight(null);
      }
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return viewportHeight;
}
