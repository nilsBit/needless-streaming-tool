import React from 'react';

export interface EmptyStateCta {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface EmptyStateInlineInput {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  buttonLabel?: string;
}

interface Props {
  icon: string;
  title: string;
  description?: string;
  cta?: EmptyStateCta;
  inlineInput?: EmptyStateInlineInput;
  secondaryCta?: EmptyStateCta;
  secondaryLeadIn?: string;
  size?: 'normal' | 'compact';
}

export default function EmptyState({ icon, title, description, cta, inlineInput, secondaryCta, secondaryLeadIn, size = 'normal' }: Props) {
  return (
    <div className={`ux-empty ${size === 'compact' ? 'compact' : ''}`}>
      <div className="ux-empty-icon" aria-hidden>{icon}</div>
      <div className="ux-empty-title">{title}</div>
      {description && <div className="ux-empty-desc">{description}</div>}
      {inlineInput ? (
        <div className="ux-empty-inline-input">
          <input
            type="text"
            value={inlineInput.value}
            onChange={(e) => inlineInput.onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') inlineInput.onSubmit(); }}
            placeholder={inlineInput.placeholder}
            autoFocus
          />
          <button onClick={inlineInput.onSubmit} disabled={!inlineInput.value.trim()}>
            {inlineInput.buttonLabel ?? '+'}
          </button>
        </div>
      ) : cta && (
        <button className="ux-empty-cta" onClick={cta.onClick} disabled={cta.disabled}>
          {cta.label}
        </button>
      )}
      {secondaryCta && (
        <div className="ux-empty-secondary-row">
          {secondaryLeadIn && <span className="ux-empty-lead">{secondaryLeadIn}</span>}
          <button className="ux-empty-secondary" onClick={secondaryCta.onClick} disabled={secondaryCta.disabled}>
            {secondaryCta.label}
          </button>
        </div>
      )}
    </div>
  );
}
