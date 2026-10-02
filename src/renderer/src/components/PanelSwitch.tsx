import React from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';

const LABELS: Record<string, string> = { progress: 'Fortschritt', todos: 'Todos', off: 'Aus' };

/** Which of its panels the panel overlay shows — picked by hand, never on its own. */
export default function PanelSwitch() {
  const { data, refetch } = useApi<{ view: string; views: string[] }>('/panel');

  // The hotkey changes it too.
  useWebSocket((event) => {
    if (event === 'panel-view') refetch();
  });

  const pick = async (view: string) => {
    await apiPost('/panel', { view });
    refetch();
  };

  return (
    <div className="obs-mappings-section">
      <h3>Wechselfläche</h3>
      <p className="setup-info">Was die Quelle „Wechselfläche“ (/overlay/panel/) zeigt. Es bleibt stehen, bis du umschaltest. Die Abstimmung hat ihre eigene Quelle (/overlay/poll/).</p>
      <div className="s-toggle-row">
        {(data?.views ?? Object.keys(LABELS)).map((view) => (
          <button key={view} className={`s-toggle-btn ${data?.view === view ? 'active' : ''}`} onClick={() => pick(view)}>
            {LABELS[view] ?? view}
          </button>
        ))}
      </div>
    </div>
  );
}
