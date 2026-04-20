import React from 'react';

interface Props {
  hint: string;
  done: boolean;
  children: React.ReactNode;
}

export default function TryThisBadge({ hint, done, children }: Props) {
  if (done) return <>{children}</>;
  return (
    <span className="ux-try-this-wrapper">
      {children}
      <span className="ux-try-this-dot" title={hint} aria-label={hint} />
    </span>
  );
}
