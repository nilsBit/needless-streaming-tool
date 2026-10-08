import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { lastPreview, onPreview, rememberPreview, type PaletteConfig } from './previewBus';

// One overlay, scaled into a box, always with sample data where the overlay
// has any (08.10.: the preview no longer goes live once an overlay has its
// own look). Colours and fonts being chosen reach it at once.

export interface PreviewEntry { name: string; label: string; url: string; size: { width: number; height: number } | null; previewState: string | null }

/** The overlay's address with its sample state. A list overlay's address already carries ?type=. */
export function withSampleState(entry: PreviewEntry): string {
  if (!entry.previewState) return entry.url;
  return `${entry.url}${entry.url.includes('?') ? '&' : '?'}state=${encodeURIComponent(entry.previewState)}`;
}

function useBoxWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!box) return;
    const update = () => setWidth(box.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [box]);
  return [setBox, width];
}

export default function OverlayPreview({ entry, height }: { entry: PreviewEntry; height: number }) {
  const [boxRef, boxWidth] = useBoxWidth();
  const frame = useRef<HTMLIFrameElement>(null);
  const url = withSampleState(entry);
  const size = entry.size ?? { width: 1280, height: 720 };
  const scale = boxWidth > 0 ? Math.min((boxWidth - 24) / size.width, (height - 24) / size.height, 1) : 0;

  const post = (config: PaletteConfig | null) => {
    if (!config || !frame.current?.contentWindow) return;
    frame.current.contentWindow.postMessage({ type: 'nst-preview-config', config }, new URL(url).origin);
  };
  useEffect(() => onPreview(post));
  // A saved change from elsewhere (a Figma draft, the other window) is the new state.
  useWebSocket((event, data) => {
    if (event !== 'overlay-config' || !data) return;
    rememberPreview(data as PaletteConfig);
    post(data as PaletteConfig);
  });

  return (
    <div ref={boxRef} className="ovl-preview" style={{ height }}>
      {scale > 0 && (
        <div className="ovl-preview-frame" style={{ width: size.width * scale, height: size.height * scale }}>
          <iframe
            ref={frame}
            key={url}
            src={url}
            title={`Vorschau ${entry.label}`}
            width={size.width}
            height={size.height}
            onLoad={() => post(lastPreview())}
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left', border: 'none', background: 'transparent' }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}
