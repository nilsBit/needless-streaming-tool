import React from 'react';
import ConnectionCards from '../settings/ConnectionCards';
import type { ConnectionKey } from '../../../../shared/features';

interface Props { needed: readonly ConnectionKey[] }

// Step 2: only the connections the choice needs, as the same cards the
// settings show.
export default function ConnectionsStep({ needed }: Props) {
  if (needed.length === 0) {
    return <p className="setup-empty">Deine Auswahl braucht keine Verbindung. Weiter geht es gleich mit OBS – oder zum Schluss.</p>;
  }
  return (
    <div className="setup-cards">
      <ConnectionCards only={needed} />
    </div>
  );
}
