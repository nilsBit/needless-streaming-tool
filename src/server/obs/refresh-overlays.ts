export interface ObsCaller {
  call(request: string, data?: Record<string, string>): Promise<unknown>;
}

export async function refreshOwnBrowserSources(obs: ObsCaller, port: number): Promise<string[]> {
  const { inputs } = (await obs.call('GetInputList')) as { inputs: { inputName: string; inputKind: string }[] };
  const reloaded: string[] = [];

  for (const input of inputs) {
    const { inputSettings } = (await obs.call('GetInputSettings', { inputName: input.inputName })) as {
      inputSettings: { url?: string };
    };
    if (!isOwnOverlayUrl(inputSettings.url, port)) continue;
    try {
      await obs.call('PressInputPropertiesButton', { inputName: input.inputName, propertyName: 'refreshnocache' });
      reloaded.push(input.inputName);
    } catch (err) {
      console.error(`[OBS] Could not reload browser source "${input.inputName}":`, err);
    }
  }

  return reloaded;
}

function isOwnOverlayUrl(url: string | undefined, port: number): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && parsed.port === String(port);
  } catch {
    return false;
  }
}
