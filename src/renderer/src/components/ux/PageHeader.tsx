import React from 'react';

interface Props {
  title: string;
  sentence?: string;
}

// The head of every page: the area's name and one sentence on what you do here.
export default function PageHeader({ title, sentence }: Props) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {sentence && <p>{sentence}</p>}
    </header>
  );
}
