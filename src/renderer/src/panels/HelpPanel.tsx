import React, { useState } from 'react';
import { HELP_SECTIONS_DE } from '../docs/help-de';
import SearchField, { matchesSearch } from '../components/ux/SearchField';

/**
 * **bold** and `code` inside a line. The help texts use both mid-sentence;
 * before 08.10. only whole bold lines were understood and the stars showed.
 */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, k) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={k}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={k}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export default function HelpPanel() {
  const [openSection, setOpenSection] = useState<number | null>(0);
  const [search, setSearch] = useState('');

  // A search looks through titles and text, and opens every section it finds.
  const searching = search.trim() !== '';
  const sections = HELP_SECTIONS_DE.map((section, i) => ({ ...section, i }))
    .filter((s) => matchesSearch(search, s.title, s.content));
  const isOpen = (i: number) => searching || openSection === i;

  const toggle = (i: number) => {
    setOpenSection(openSection === i ? null : i);
  };

  return (
    <div className="panel help-panel">
      <div className="cmd-toolbar">
        <p className="panel-desc" style={{ margin: 0 }}>Alles was du über das Stream Toolkit wissen musst.</p>
        <SearchField value={search} onChange={setSearch} label="Hilfe durchsuchen" width={280} />
      </div>
      {searching && sections.length === 0 && <p className="dialog-empty">Nichts in der Hilfe passt zu „{search.trim()}“.</p>}

      <div className="help-sections">
        {sections.map(({ i, ...section }) => (
          <div key={i} className={`help-section ${isOpen(i) ? 'open' : ''}`}>
            <button className="help-section-header" onClick={() => toggle(i)}>
              <span className="help-toggle">{isOpen(i) ? '▼' : '▶'}</span>
              <span className="help-title">{section.title}</span>
            </button>
            {isOpen(i) && (
              <div className="help-content">
                {section.content.split('\n').map((line, j) => {
                  if (line.startsWith('**') && line.endsWith('**')) {
                    return <h4 key={j}>{line.replace(/\*\*/g, '')}</h4>;
                  }
                  if (line.startsWith('**') && line.includes(':**')) {
                    const [bold, rest] = line.split(':**');
                    return <p key={j}><strong>{bold.replace(/\*\*/g, '')}:</strong>{inline(rest)}</p>;
                  }
                  if (line.startsWith('| ') && line.includes(' | ')) {
                    const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
                    if (cells.every(c => c.match(/^[-]+$/))) return null; // separator row
                    return (
                      <div key={j} className="help-table-row">
                        {cells.map((cell, k) => (
                          <span key={k} className={`help-cell ${k === 0 ? 'help-cell-key' : ''}`}>
                            {inline(cell)}
                          </span>
                        ))}
                      </div>
                    );
                  }
                  if (line.startsWith('- ')) {
                    return <div key={j} className="help-list-item">{inline(line.substring(2))}</div>;
                  }
                  if (line.trim() === '') return <div key={j} className="help-spacer" />;
                  return <p key={j}>{inline(line)}</p>;
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
