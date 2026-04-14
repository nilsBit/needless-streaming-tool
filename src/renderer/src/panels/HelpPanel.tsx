import React, { useState } from 'react';
import { HELP_SECTIONS } from '../docs/help';

export default function HelpPanel() {
  const [openSection, setOpenSection] = useState<number | null>(0);

  const toggle = (i: number) => {
    setOpenSection(openSection === i ? null : i);
  };

  return (
    <div className="panel help-panel">
      <h2>📖 Hilfe & Dokumentation</h2>
      <p className="panel-desc">Alles was du über das Stream Toolkit wissen musst.</p>

      <div className="help-sections">
        {HELP_SECTIONS.map((section, i) => (
          <div key={i} className={`help-section ${openSection === i ? 'open' : ''}`}>
            <button className="help-section-header" onClick={() => toggle(i)}>
              <span className="help-toggle">{openSection === i ? '▼' : '▶'}</span>
              <span className="help-title">{section.title}</span>
            </button>
            {openSection === i && (
              <div className="help-content">
                {section.content.split('\n').map((line, j) => {
                  if (line.startsWith('**') && line.endsWith('**')) {
                    return <h4 key={j}>{line.replace(/\*\*/g, '')}</h4>;
                  }
                  if (line.startsWith('**') && line.includes(':**')) {
                    const [bold, rest] = line.split(':**');
                    return <p key={j}><strong>{bold.replace(/\*\*/g, '')}:</strong>{rest}</p>;
                  }
                  if (line.startsWith('| ') && line.includes(' | ')) {
                    const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
                    if (cells.every(c => c.match(/^[-]+$/))) return null; // separator row
                    return (
                      <div key={j} className="help-table-row">
                        {cells.map((cell, k) => (
                          <span key={k} className={`help-cell ${k === 0 ? 'help-cell-key' : ''}`}>
                            {cell.replace(/\*\*/g, '')}
                          </span>
                        ))}
                      </div>
                    );
                  }
                  if (line.startsWith('- ')) {
                    return <div key={j} className="help-list-item">{line.substring(2)}</div>;
                  }
                  if (line.trim() === '') return <div key={j} className="help-spacer" />;
                  return <p key={j}>{line}</p>;
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
