import React from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import { PANEL_REGISTRY } from '../panelRegistry';
import { PANEL_LABELS, type SubTab } from '../navigation';

interface Props {
  subTab: SubTab;
  /** Show the sub tab's own sentence (when the area has a tab row). */
  showSentence: boolean;
}

// One sub tab's panels, one below the other. Each panel keeps its own look for
// now; the stages after the shell reshape them page by page.
export default function AreaPage({ subTab, showSentence }: Props) {
  return (
    <div className="page-panels">
      {showSentence && subTab.sentence && <p className="page-sentence">{subTab.sentence}</p>}
      {subTab.panels.map((key) => {
        const Component = PANEL_REGISTRY[key];
        return (
          <div key={key} className="page-panel" data-panel={key}>
            <ErrorBoundary
              fallback={PANEL_LABELS[key]}
              errorTitle="Fehler"
              errorMessage="Etwas ist schiefgelaufen."
              retryLabel="Nochmal versuchen"
            >
              <Component />
            </ErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}
