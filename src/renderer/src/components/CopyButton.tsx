import React, { useState } from 'react';

interface Props {
  text: string;
  label?: string;
  className?: string;
}

export default function CopyButton({ text, label, className }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      className={className || 'btn-copy-small'}
      onClick={copy}
      title={copied ? 'Kopiert!' : 'Kopieren'}
    >
      {copied ? '✅' : '📋'}{label ? ` ${copied ? 'Kopiert!' : label}` : ''}
    </button>
  );
}
