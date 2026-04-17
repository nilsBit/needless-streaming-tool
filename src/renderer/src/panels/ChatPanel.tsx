import React from 'react';
import { useApi } from '../hooks/useApi';
import { TwitchConfigResponse } from '../../../shared/types';
import { useTranslation } from '../i18n/LanguageContext';

export default function ChatPanel() {
  const { t } = useTranslation();
  const { data: config } = useApi<TwitchConfigResponse>('/settings/twitch');

  if (!config?.configured || !config.channel) {
    return (
      <div className="panel">
        <h2>💬 Chat</h2>
        <p className="empty">{t('chat.connect_first')}</p>
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
