import React, { useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';

interface Props {
  text: string;
  label?: string;
  className?: string;
}

export default function CopyButton({ text, label, className }: Props) {
  const { t } = useTranslation();
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
      title={copied ? t('tooltip.copied') : t('tooltip.copy')}
    >
      {copied ? '✅' : '📋'}{label ? ` ${copied ? t('tooltip.copied') : label}` : ''}
    </button>
  );
}
