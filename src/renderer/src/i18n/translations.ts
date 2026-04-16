export type Lang = 'de' | 'en';

const translations = {
  // App
  'app.title': { de: 'The Lab', en: 'The Lab' },
  'tab.stream': { de: 'Stream', en: 'Stream' },
  'tab.project': { de: 'Projekt', en: 'Project' },
  'tab.settings': { de: 'Settings', en: 'Settings' },
  'tab.help': { de: 'Hilfe', en: 'Help' },

  // Panels
  'panel.challenge': { de: 'Challenge', en: 'Challenge' },
  'panel.issues': { de: 'Glücksrad', en: 'Glücksrad' },
  'panel.clips': { de: 'Clip Moments', en: 'Clip Moments' },
  'panel.designs': { de: 'Chat Designs', en: 'Chat Designs' },
  'panel.progress': { de: 'Progress Tracker', en: 'Progress Tracker' },
  'panel.milestones': { de: 'Milestones', en: 'Milestones' },
  'panel.todos': { de: 'Todos', en: 'Todos' },
  'panel.settings': { de: 'Settings', en: 'Settings' },
  'panel.overlays': { de: 'Overlays', en: 'Overlays' },
  'panel.help': { de: 'Hilfe & Dokumentation', en: 'Help & Documentation' },

  // Settings
  'settings.title': { de: 'Settings', en: 'Settings' },
  'settings.desc': { de: 'Twitch-Verbindung konfigurieren und Bot steuern.', en: 'Configure Twitch connection and control the bot.' },
  'settings.twitch': { de: 'Twitch Verbindung', en: 'Twitch Connection' },
  'settings.connected_to': { de: 'Verbunden mit', en: 'Connected to' },
  'settings.not_connected': { de: 'Nicht verbunden', en: 'Not connected' },
  'settings.connect_twitch': { de: 'Mit Twitch verbinden', en: 'Connect to Twitch' },
  'settings.disconnect': { de: 'Trennen', en: 'Disconnect' },
  'settings.change_client_id': { de: 'Client-ID ändern', en: 'Change Client ID' },
  'settings.notion': { de: 'Notion Integration', en: 'Notion Integration' },
  'settings.notion_desc': { de: 'Clips werden automatisch in Notion gesynct. Erstelle eine Integration auf notion.so/my-integrations und teile die Clips-DB mit der Integration.', en: 'Clips are automatically synced to Notion. Create an integration at notion.so/my-integrations and share the Clips DB with the integration.' },
  'settings.change_token': { de: 'Token ändern', en: 'Change token' },
  'settings.clips_db': { de: 'Clips-Datenbank ID — die Notion-Datenbank in die Clips gesynct werden.', en: 'Clips database ID — the Notion database where clips are synced to.' },
  'settings.change_db': { de: 'Database ändern', en: 'Change database' },
  'settings.obs': { de: 'OBS Verbindung', en: 'OBS Connection' },
  'settings.obs_desc': { de: 'OBS Studio WebSocket-Verbindung. Aktiviere in OBS unter Tools → WebSocket Server Settings.', en: 'OBS Studio WebSocket connection. Enable in OBS under Tools → WebSocket Server Settings.' },
  'settings.obs_connected': { de: 'Verbunden mit OBS', en: 'Connected to OBS' },
  'settings.obs_not_connected': { de: 'Nicht verbunden', en: 'Not connected' },
  'settings.obs_connect': { de: 'Mit OBS verbinden', en: 'Connect to OBS' },
  'settings.obs_disconnect': { de: 'OBS trennen', en: 'Disconnect OBS' },
  'settings.obs_change': { de: 'Config ändern', en: 'Change config' },
  'settings.streamdeck': { de: 'Stream Deck API Token', en: 'Stream Deck API Token' },
  'settings.streamdeck_desc': { de: 'Diesen Token im Stream Deck HTTP-Plugin als Bearer Token verwenden. Bleibt gleich nach Neustart.', en: 'Use this token in the Stream Deck HTTP plugin as Bearer Token. Stays the same after restart.' },
  'settings.copy': { de: 'Kopieren', en: 'Copy' },
  'settings.copied': { de: 'Kopiert', en: 'Copied' },
  'settings.wizard': { de: 'Setup-Wizard', en: 'Setup Wizard' },
  'settings.wizard_desc': { de: 'Starte den Einrichtungs-Assistenten erneut.', en: 'Restart the setup wizard.' },
  'settings.wizard_restart': { de: 'Setup-Wizard erneut starten', en: 'Restart Setup Wizard' },
  'settings.language': { de: 'Sprache', en: 'Language' },
  'settings.language_desc': { de: 'App-Sprache wechseln.', en: 'Change app language.' },
  'settings.save': { de: 'Speichern', en: 'Save' },

  // Onboarding
  'onboarding.welcome_title': { de: 'Willkommen im Lab!', en: 'Welcome to The Lab!' },
  'onboarding.welcome_text': { de: 'Dein Stream Toolkit für Streaming. Hier steuerst du alles — Overlays, Challenges, Issues, Clips, Milestones und mehr.', en: 'Your Stream Toolkit for Streaming. Control everything here — overlays, challenges, issues, clips, milestones and more.' },
  'onboarding.welcome_sub': { de: 'Lass uns in ein paar Schritten alles einrichten.', en: 'Let\'s set everything up in a few steps.' },
  'onboarding.start_setup': { de: 'Setup starten', en: 'Start Setup' },
  'onboarding.next': { de: 'Weiter', en: 'Next' },
  'onboarding.back': { de: 'Zurück', en: 'Back' },
  'onboarding.skip': { de: 'Überspringen', en: 'Skip' },
  'onboarding.finish': { de: 'Los geht\'s!', en: 'Let\'s go!' },

  // Twitch Step
  'twitch.title': { de: 'Twitch verbinden', en: 'Connect Twitch' },
  'twitch.desc': { de: 'Damit der Bot in deinem Chat funktioniert, brauchst du eine Twitch-App. Das klingt kompliziert, dauert aber nur 2 Minuten.', en: 'To make the bot work in your chat, you need a Twitch App. Sounds complicated, but takes only 2 minutes.' },
  'twitch.step1': { de: 'Öffne dev.twitch.tv in deinem Browser und logge dich mit deinem Twitch-Account ein', en: 'Open dev.twitch.tv in your browser and log in with your Twitch account' },
  'twitch.step2': { de: 'Klicke oben rechts auf "Your Console", dann links auf "Applications"', en: 'Click "Your Console" in the top right, then "Applications" on the left' },
  'twitch.step3': { de: 'Klicke auf "Register Your Application" und füge folgende Daten ein:', en: 'Click "Register Your Application" and fill in the following:' },
  'twitch.step4': { de: 'Klicke auf "Create", dann auf "Manage" bei deiner neuen App', en: 'Click "Create", then "Manage" on your new app' },
  'twitch.step5': { de: 'Kopiere die "Client ID" und füge sie hier ein:', en: 'Copy the "Client ID" and paste it here:' },
  'twitch.name_hint': { de: 'Stream Toolkit (oder beliebig)', en: 'Stream Toolkit (or anything)' },
  'twitch.category': { de: 'Chat Bot', en: 'Chat Bot' },
  'twitch.client_id_placeholder': { de: 'Client-ID hier einfügen...', en: 'Paste Client ID here...' },
  'twitch.client_id_saved': { de: 'Client-ID gespeichert', en: 'Client ID saved' },
  'twitch.connect_desc': { de: 'Klicke jetzt auf den Button — es öffnet sich ein Twitch-Login in deinem Browser. Erlaube den Zugriff und du wirst automatisch verbunden.', en: 'Click the button — a Twitch login will open in your browser. Allow access and you\'ll be connected automatically.' },
  'twitch.connect_btn': { de: 'Mit Twitch verbinden', en: 'Connect to Twitch' },
  'twitch.connected': { de: 'Twitch ist verbunden! Der Bot ist live in deinem Chat.', en: 'Twitch is connected! The bot is live in your chat.' },

  // OBS Step
  'obs.title': { de: 'OBS verbinden', en: 'Connect OBS' },
  'obs.desc': { de: 'Das Toolkit steuert OBS über eine WebSocket-Verbindung. Du musst diese einmal in OBS aktivieren.', en: 'The toolkit controls OBS via a WebSocket connection. You need to enable it once in OBS.' },
  'obs.step1': { de: 'Öffne OBS Studio', en: 'Open OBS Studio' },
  'obs.step2': { de: 'Gehe oben im Menü auf Tools (oder Werkzeuge) → WebSocket Server Settings', en: 'Go to Tools → WebSocket Server Settings in the menu' },
  'obs.step3': { de: 'Setze den Haken bei "Enable WebSocket Server"', en: 'Check "Enable WebSocket Server"' },
  'obs.step4': { de: 'Optional: Klicke auf "Show Connect Info" um Port und Passwort zu sehen. Trage sie unten ein.', en: 'Optional: Click "Show Connect Info" to see port and password. Enter them below.' },
  'obs.connection_data': { de: 'Verbindungsdaten (Standard-Werte sind meistens richtig):', en: 'Connection details (defaults are usually correct):' },
  'obs.password_hint': { de: 'Passwort (leer lassen wenn keins gesetzt)', en: 'Password (leave empty if none set)' },
  'obs.connect_btn': { de: 'Verbinden', en: 'Connect' },
  'obs.tip': { de: 'Tipp: Wenn du kein Passwort in OBS gesetzt hast, lass das Feld einfach leer.', en: 'Tip: If you didn\'t set a password in OBS, just leave the field empty.' },
  'obs.connected': { de: 'OBS ist verbunden! Szenen-Wechsel und mehr funktionieren jetzt.', en: 'OBS is connected! Scene switching and more are working now.' },

  // Notion Step
  'notion.title': { de: 'Notion (optional)', en: 'Notion (optional)' },
  'notion.desc': { de: 'Wenn du Notion nutzt, kannst du deine Clips automatisch dorthin syncen. Falls nicht, überspringe diesen Schritt.', en: 'If you use Notion, you can auto-sync your clips there. If not, skip this step.' },
  'notion.step1': { de: 'Öffne notion.so/my-integrations in deinem Browser', en: 'Open notion.so/my-integrations in your browser' },
  'notion.step2': { de: 'Klicke auf "New integration" → Name z.B. "Stream Toolkit" → "Submit"', en: 'Click "New integration" → Name e.g. "Stream Toolkit" → "Submit"' },
  'notion.step3': { de: 'Kopiere den "Internal Integration Secret" (fängt mit ntn_ an) und füge ihn hier ein:', en: 'Copy the "Internal Integration Secret" (starts with ntn_) and paste it here:' },
  'notion.token_saved': { de: 'Notion-Token gespeichert', en: 'Notion token saved' },
  'notion.step4': { de: 'Erstelle in Notion eine Datenbank für deine Clips (oder nutze eine bestehende)', en: 'Create a database in Notion for your clips (or use an existing one)' },
  'notion.step5': { de: 'Klicke in der Datenbank oben rechts auf "..." → "Add connections" → wähle deine Integration aus', en: 'Click "..." in the top right of the database → "Add connections" → select your integration' },
  'notion.step6': { de: 'Kopiere die Datenbank-URL aus der Browser-Adressleiste und füge sie hier ein:', en: 'Copy the database URL from the browser address bar and paste it here:' },
  'notion.db_placeholder': { de: 'Notion Datenbank-URL oder ID...', en: 'Notion database URL or ID...' },
  'notion.complete': { de: 'Notion komplett eingerichtet — Clips werden automatisch gesynct!', en: 'Notion fully configured — clips will be synced automatically!' },

  // Overlays Step
  'overlays.title': { de: 'Overlays', en: 'Overlays' },
  'overlays.desc': { de: 'Overlays sind die Anzeigen die deine Zuschauer im Stream sehen — Todos, Progress, Alerts und mehr. So fügst du sie in OBS ein:', en: 'Overlays are the displays your viewers see in the stream — todos, progress, alerts and more. Here\'s how to add them in OBS:' },
  'overlays.step1': { de: 'In OBS: Klicke bei Quellen auf "+" → wähle "Browser"', en: 'In OBS: Click "+" in Sources → select "Browser"' },
  'overlays.step2': { de: 'Gib einen Namen ein (z.B. "Todos Overlay") und klicke "OK"', en: 'Enter a name (e.g. "Todos Overlay") and click "OK"' },
  'overlays.step3': { de: 'Kopiere eine URL von unten und füge sie im Feld "URL" ein', en: 'Copy a URL from below and paste it in the "URL" field' },
  'overlays.step4': { de: 'Passe Breite (z.B. 400) und Höhe (z.B. 600) an und klicke "OK"', en: 'Adjust width (e.g. 400) and height (e.g. 600) and click "OK"' },
  'overlays.available': { de: 'Verfügbare Overlays — klicke auf "URL kopieren" und füge sie in OBS ein:', en: 'Available overlays — click "Copy URL" and paste into OBS:' },
  'overlays.copy_url': { de: 'URL kopieren', en: 'Copy URL' },
  'overlays.copied': { de: 'Kopiert!', en: 'Copied!' },
  'overlays.hint': { de: 'Du musst nicht alle Overlays jetzt einrichten — du kannst das jederzeit später unter Settings → Overlays machen.', en: 'You don\'t need to set up all overlays now — you can do this anytime later under Settings → Overlays.' },

  // StreamDeck Step
  'streamdeck.title': { de: 'Stream Deck (optional)', en: 'Stream Deck (optional)' },
  'streamdeck.desc': { de: 'Mit dem Stream Deck Plugin kannst du Buttons für Szenen-Wechsel, Clips, Issues, Challenges und mehr direkt auf dein Deck legen.', en: 'With the Stream Deck plugin you can put buttons for scene switching, clips, issues, challenges and more directly on your deck.' },
  'streamdeck.step1': { de: 'Plugin installieren:', en: 'Install plugin:' },
  'streamdeck.install_btn': { de: 'Plugin jetzt installieren', en: 'Install plugin now' },
  'streamdeck.installed': { de: 'Installiert!', en: 'Installed!' },
  'streamdeck.installing': { de: 'Wird installiert...', en: 'Installing...' },
  'streamdeck.step2': { de: 'Ziehe einen "The Lab" Button auf dein Deck', en: 'Drag a "The Lab" button onto your deck' },
  'streamdeck.step3': { de: 'Kopiere den Token und füge ihn im Button-Settings unter "API Token" ein (einmalig):', en: 'Copy the token and paste it in the button settings under "API Token" (one time only):' },
  'streamdeck.no_deck': { de: 'Kein Stream Deck? Kein Problem — du kannst alles auch direkt in der App steuern.', en: 'No Stream Deck? No problem — you can control everything directly in the app.' },

  // Done Step
  'done.title_ready': { de: 'Alles bereit!', en: 'All set!' },
  'done.title_almost': { de: 'Fast fertig...', en: 'Almost there...' },
  'done.optional': { de: 'optional', en: 'optional' },
  'done.warning': { de: 'Twitch und OBS müssen verbunden sein. Gehe zurück und richte sie ein.', en: 'Twitch and OBS must be connected. Go back and set them up.' },
  'done.hint': { de: 'Du kannst alles jederzeit in den Settings ändern oder den Wizard unter Settings erneut starten.', en: 'You can change everything anytime in Settings or restart the wizard from Settings.' },

  // Overlays Panel
  'overlays_panel.title': { de: 'Overlays', en: 'Overlays' },
  'overlays_panel.desc': { de: 'Overlay-URLs für OBS Browser Source. Overlays anpassen oder eigene erstellen.', en: 'Overlay URLs for OBS Browser Source. Customize or create your own.' },
  'overlays_panel.builtin': { de: 'Eingebaute Overlays', en: 'Built-in Overlays' },
  'overlays_panel.custom': { de: 'Custom Overlays', en: 'Custom Overlays' },
  'overlays_panel.no_custom': { de: 'Keine Custom Overlays. Erstelle eins!', en: 'No custom overlays. Create one!' },
  'overlays_panel.new': { de: 'Neues Overlay', en: 'New Overlay' },
  'overlays_panel.from_template': { de: 'Aus Template', en: 'From Template' },
  'overlays_panel.upload_html': { de: 'HTML hochladen', en: 'Upload HTML' },
  'overlays_panel.create': { de: 'Aus Template erstellen', en: 'Create from Template' },
  'overlays_panel.cancel': { de: 'Abbrechen', en: 'Cancel' },
  'overlays_panel.customized': { de: 'angepasst', en: 'customized' },
  'overlays_panel.guide_title': { de: 'Anleitung', en: 'Guide' },

  // Help Panel
  'help.title': { de: 'Hilfe & Dokumentation', en: 'Help & Documentation' },
  'help.desc': { de: 'Alles was du über das Stream Toolkit wissen musst.', en: 'Everything you need to know about the Stream Toolkit.' },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, lang: Lang): string {
  return translations[key]?.[lang] || translations[key]?.['de'] || key;
}

export default translations;
