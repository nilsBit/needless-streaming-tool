import React, { useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';

interface Command {
  cmd: string;
  desc: string;
}

export default function ChatCommands({ commands }: { commands: Command[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="chat-commands">
      <button className="chat-commands-toggle" onClick={() => setOpen(!open)}>
        {t('chatcmds.label')} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="chat-commands-list">
          {commands.map((c) => (
            <div key={c.cmd} className="chat-command">
              <code>{c.cmd}</code>
              <span>{c.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
