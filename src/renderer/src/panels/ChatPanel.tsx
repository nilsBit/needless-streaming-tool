import React from 'react';
import { useApi } from '../hooks/useApi';
import { TwitchConfigResponse } from '../../../shared/types';

export default function ChatPanel() {
  const { data: config } = useApi<TwitchConfigResponse>('/settings/twitch');

  if (!config?.configured || !config.channel) {
    return (
      <div className="panel">
        <h2>💬 Chat</h2>
        <p className="empty">Verbinde zuerst Twitch in den Settings.</p>
      </div>
    );
  }

  return (
    <div className="panel chat-panel">
      <h2>💬 Chat</h2>
      <iframe
        src={`https://www.twitch.tv/popout/${config.channel}/chat?darkpopout`}
        title="Twitch Chat"
        className="chat-iframe"
      />
    </div>
  );
}
