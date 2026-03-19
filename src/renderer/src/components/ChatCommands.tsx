import React, { useState } from 'react';

interface Command {
  cmd: string;
  desc: string;
}

export default function ChatCommands({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="chat-commands">
      <button className="chat-commands-toggle" onClick={() => setOpen(!open)}>
        💬 Chat Commands {open ? '▾' : '▸'}
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
