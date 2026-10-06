import React from 'react';
import { useApi } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';

interface Scenes { scenes: string[]; current: string | null }

// The scene OBS is on, as a hint in the page header. Switching happens in
// OBS or on the Stream Deck, not here (decided 06.10.).
export default function SceneHint() {
  const { data, refetch } = useApi<Scenes>('/obs/scenes');
  useWebSocket((event) => {
    if (event === 'obs-scene-changed' || event === 'obs-status') refetch();
  });
  if (!data?.current) return null;
  return (
    <p className="scene-hint">Szene in OBS: <strong>{data.current}</strong></p>
  );
}
