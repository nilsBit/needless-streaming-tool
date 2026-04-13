import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PluginConfig {
  token: string;
  baseUrl: string;
}

let _config: PluginConfig | null = null;

export function getConfig(): PluginConfig {
  if (!_config) {
    // Plugin runs from com.nilsr.stream-toolkit.sdPlugin/bin/plugin.js
    // config.json lives one level up: com.nilsr.stream-toolkit.sdPlugin/config.json
    const configPath = join(__dirname, '..', 'config.json');
    _config = JSON.parse(readFileSync(configPath, 'utf-8')) as PluginConfig;
  }
  return _config;
}
