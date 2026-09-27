import { useEffect, useState } from 'react';
import { authUrl, createClient } from '../lib/openrouter';
import { errorText, useStore } from '../store';
import { Icon } from './icons';
import { Button, Dialog, TextField } from './ui';

export function ConnectDialog() {
  const { connectOpen, setConnectOpen, apiKey, setApiKey, notify } = useStore();
  const [draft, setDraft] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!connectOpen || !apiKey) return;
    setInfo(null);
    createClient({ apiKey })
      .keyInfo()
      .then((k) =>
        setInfo(
          k.limitRemaining != null
            ? `${k.label ?? 'Key'} · $${k.limitRemaining.toFixed(2)} left on this key`
            : `${k.label ?? 'Key'} connected · $${(k.usage ?? 0).toFixed(3)} used so far`,
        ),
      )
      .catch((e) => setInfo(errorText(e)));
  }, [connectOpen, apiKey]);

  const connect = async () => {
    const callback = window.location.origin + window.location.pathname;
    window.location.href = await authUrl(callback);
  };

  const saveDraft = async () => {
    const key = draft.trim();
    if (!key) return;
    setBusy(true);
    try {
      await createClient({ apiKey: key }).keyInfo();
      setApiKey(key);
      setDraft('');
      setConnectOpen(false);
      notify('OpenRouter key saved.', 'success');
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={connectOpen} onClose={() => setConnectOpen(false)} title={apiKey ? 'OpenRouter' : 'Connect OpenRouter'}>
      <p className="text-ink-2 mb-5">
        AIconify runs in your browser and calls AI models through your own OpenRouter account. A full 16-icon set usually costs one to
        five cents.
      </p>
      {apiKey ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 p-3.5 rounded-[14px] bg-success-soft text-success">
            <Icon name="check" size={18} strokeWidth={2.2} />
            <span className="text-[14px] font-medium">{info ?? 'Checking key…'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <Button
              variant="danger"
              onClick={() => {
                setApiKey(null);
                notify('Disconnected. Your key was removed from this browser.');
              }}
            >
              Disconnect
            </Button>
            <Button variant="primary" onClick={() => setConnectOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <Button variant="primary" size="lg" icon="key" onClick={connect}>
            Connect with OpenRouter
          </Button>
          <div className="flex items-center gap-3 text-[12px] text-ink-3">
            <span className="flex-1 h-px bg-line" />
            or paste a key
            <span className="flex-1 h-px bg-line" />
          </div>
          <TextField label="API key" type="password" value={draft} onChange={setDraft} placeholder="sk-or-v1-…" onEnter={saveDraft} />
          <div className="flex items-center justify-between gap-3">
            <a className="text-[13px] text-accent hover:underline inline-flex items-center gap-1" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">
              Create a key <Icon name="external" size={13} />
            </a>
            <Button onClick={saveDraft} busy={busy} disabled={!draft.trim()}>
              Save key
            </Button>
          </div>
          <p className="text-[12px] text-ink-3">Tip: give the key a spending limit on OpenRouter. It is stored only in this browser.</p>
        </div>
      )}
    </Dialog>
  );
}
