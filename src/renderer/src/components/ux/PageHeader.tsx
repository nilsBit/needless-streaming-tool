import React from 'react';

interface Props {
  title: string;
  sentence?: string;
  /** Something small for the right side, e.g. the current OBS scene. */
  aside?: React.ReactNode;
}

// The head of every page: the area's name and one sentence on what you do here.
export default function PageHeader({ title, sentence, aside }: Props) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {sentence && <p>{sentence}</p>}
      </div>
      {aside && <div className="page-header-aside">{aside}</div>}
    </header>
  );
}
