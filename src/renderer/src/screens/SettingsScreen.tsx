import { useEffect, useMemo, useState } from 'react';
import { AppInfo, CacheInfo, UpdateState } from '../types';

interface Props {
  onBack: () => void;
}

const DEFAULT_APP_INFO: AppInfo = {
  version: '0.0.0',
  platform: 'unknown',
  isPackaged: false,
  updatesEnabled: false,
};

const DEFAULT_UPDATE_STATE: UpdateState = {
  enabled: false,
  status: 'disabled',
  currentVersion: '0.0.0',
  availableVersion: null,
  downloadedVersion: null,
  progress: null,
  transferredBytes: null,
  totalBytes: null,
  message: 'Checking updater status...',
  releaseDate: null,
  lastCheckedAt: null,
};

export default function SettingsScreen({ onBack }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo>(DEFAULT_APP_INFO);
  const [updateState, setUpdateState] = useState<UpdateState>(DEFAULT_UPDATE_STATE);
  const [updateBusy, setUpdateBusy] = useState(false);

  useEffect(() => {
    const reportLoadError = () => setSettingsError('Some settings could not be loaded. Reopen Settings to try again.');
    window.api.hasApiKey().then(setHasKey).catch(reportLoadError);
    window.api.getCacheInfo().then(setCacheInfo).catch(reportLoadError);
    window.api.getAppInfo().then(setAppInfo).catch(reportLoadError);
    window.api.getUpdateState().then(setUpdateState).catch(reportLoadError);

    const detachUpdateListener = window.api.onUpdateStateChanged((nextState) => {
      setUpdateState(nextState);
      setUpdateBusy(false);
    });

    return () => {
      detachUpdateListener();
    };
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setSaved(false);
    setSettingsError('');
    try {
      await window.api.setApiKey(apiKey.trim());
      setHasKey(true);
      setApiKey('');
      setSaved(true);
    } catch {
      setSettingsError('Unable to save the API key to Keychain. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async () => {
    await window.api.clearCache();
    setCacheInfo(null);
  };

  const handleUpdateAction = async () => {
    try {
      setUpdateBusy(true);

      if (updateState.status === 'available') {
        await window.api.downloadUpdate();
        return;
      }

      if (updateState.status === 'downloaded') {
        await window.api.installUpdate();
        return;
      }

      await window.api.checkForUpdates();
    } catch (error) {
      setUpdateBusy(false);
      setUpdateState((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to check for updates.',
      }));
    }
  };

  const updateButtonLabel = useMemo(() => {
    if (updateBusy || updateState.status === 'checking') return 'Checking...';
    if (updateState.status === 'downloading') return 'Downloading...';
    if (updateState.status === 'available') return 'Download Update';
    if (updateState.status === 'downloaded') return 'Restart to Update';
    return 'Check for Updates';
  }, [updateBusy, updateState.status]);

  const buildType = useMemo(() => {
    const environment = appInfo.isPackaged ? 'PROD' : 'DEV';
    return `${environment}-${appInfo.platform.toUpperCase()}`;
  }, [appInfo.isPackaged, appInfo.platform]);

  const lastCheckedLabel = useMemo(() => {
    if (!updateState.lastCheckedAt) return 'Never';
    return new Date(updateState.lastCheckedAt).toLocaleString();
  }, [updateState.lastCheckedAt]);

  const updaterTone = updateState.status === 'error'
    ? 'text-error'
    : updateState.status === 'downloaded'
      ? 'text-tertiary'
      : 'text-on-surface';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 sm:mb-12 flex flex-col sm:flex-row sm:items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 self-start bg-surface-container-high hover:bg-surface-dim rounded-full transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-on-surface">arrow_back</span>
        </button>
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-on-background mb-2">System Preferences</h1>
          <p className="text-on-surface-variant text-sm sm:text-lg leading-relaxed max-w-2xl">Manage your API credentials, data storage, and application updates.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <section className="lg:col-span-2 space-y-6 sm:space-y-8">
          <div className="bg-surface-container-lowest p-6 sm:p-8 rounded-xl shadow-sm border border-outline-variant/10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined">key</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-on-background">TypeSafe Jev Authentication</h2>
            </div>

            <div className="space-y-5 sm:space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-on-surface-variant flex flex-col sm:flex-row sm:justify-between gap-1" htmlFor="typesafe-api">
                  TypeSafe API Key
                  <span className="text-xs font-normal opacity-60">Required for food identification</span>
                </label>
                <p className="text-xs text-on-surface-variant">
                  Model: Jev 1.13. Get a key from{' '}
                  <button type="button" onClick={() => void window.api.openExternal('https://console.typesafe.ai')} className="text-primary underline cursor-pointer">TypeSafe Console</button>.
                </p>
                <div className="relative">
                  <input
                    id="typesafe-api"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={hasKey ? 'TypeSafe API key (Saved)' : 'Paste your TypeSafe API key'}
                    className="w-full bg-surface-container-highest border-0 border-b-2 border-primary/20 focus:border-primary focus:ring-0 rounded-t-lg px-4 py-4 font-mono text-sm transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-tertiary-container/10 rounded-lg border border-tertiary-container/20">
                <div className="flex-shrink-0 text-tertiary-container">
                  <span className="material-symbols-outlined">verified_user</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-tertiary-container">Secure Keychain Integration</h4>
                  <p className="text-xs text-tertiary-container/80">Keys are stored locally in your system&apos;s encrypted vault.</p>
                </div>
                <label className="relative inline-flex items-center cursor-default">
                  <input type="checkbox" className="sr-only peer" checked={hasKey} readOnly />
                  <div className="w-11 h-6 bg-surface-container-highest rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving || !apiKey.trim()}
                  className="w-full sm:w-auto px-6 py-3 bg-primary text-on-primary font-bold rounded-full hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save API Key'}
                </button>
                {saved && (
                  <div className="flex items-center gap-2 text-sm font-medium text-tertiary">
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    Saved
                  </div>
                )}
              </div>
              {settingsError && <p role="alert" className="text-sm text-error">{settingsError}</p>}
            </div>
          </div>

          <div className="bg-surface-container-low p-6 sm:p-8 rounded-xl border border-outline-variant/10">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-on-background">Application Updates</h2>
                <p className="text-sm text-on-surface-variant mt-1">Check for a published build, download it in place, and restart to apply it.</p>
              </div>
              <span className="text-xs font-bold px-3 py-1 bg-surface-container-high rounded-full text-on-surface-variant uppercase tracking-widest">
                {updateState.status.replace('-', ' ')}
              </span>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/10 p-5">
                <div className="flex items-start gap-4">
                  <span className="material-symbols-outlined text-primary">system_update</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${updaterTone}`}>{updateState.message}</p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      Current version: v{appInfo.version}
                      {updateState.availableVersion ? ` · Latest release: v${updateState.availableVersion}` : ''}
                    </p>
                    {typeof updateState.progress === 'number' && (
                      <div className="mt-4">
                        <div className="h-2 w-full rounded-full bg-surface-container overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.max(0, Math.min(100, updateState.progress))}%` }}
                          />
                        </div>
                        <p className="text-xs text-on-surface-variant mt-2">{Math.round(updateState.progress)}% downloaded</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <button
                  onClick={handleUpdateAction}
                  disabled={updateBusy || updateState.status === 'checking' || updateState.status === 'downloading' || !updateState.enabled}
                  className="w-full sm:w-auto px-6 py-3 bg-primary text-on-primary font-bold rounded-full hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer"
                >
                  {updateButtonLabel}
                </button>
                <div className="text-xs text-on-surface-variant">
                  Last checked: {lastCheckedLabel}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-low p-6 sm:p-8 rounded-xl border border-outline-variant/10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined">database</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-on-background">Cached Data</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 sm:mb-8">
              <div className="bg-surface-container-lowest p-5 rounded-xl flex items-start gap-4">
                <span className="material-symbols-outlined text-primary">image</span>
                <div>
                  <p className="text-sm font-bold">Image Cache</p>
                  <p className="text-xs text-on-surface-variant">Auto-managed</p>
                </div>
              </div>
              <div className="bg-surface-container-lowest p-5 rounded-xl flex items-start gap-4">
                <span className="material-symbols-outlined text-primary">history</span>
                <div>
                  <p className="text-sm font-bold">Event History</p>
                  <p className="text-xs text-on-surface-variant">{cacheInfo ? cacheInfo.date : 'None'}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <button
                onClick={handleClearCache}
                className="w-full sm:w-auto px-6 py-3 text-error font-bold rounded-full hover:bg-error/5 transition-colors flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">delete_sweep</span>
                Clear Scan Cache
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-6 sm:space-y-8">
          <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-6">Application Info</h3>
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-surface-container-low">
                <span className="text-sm font-medium opacity-70">Version</span>
                <span className="text-sm font-bold font-headline">v{appInfo.version}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-surface-container-low">
                <span className="text-sm font-medium opacity-70">Build Type</span>
                <span className="text-xs font-bold px-2 py-0.5 bg-tertiary-container/20 text-tertiary-container rounded">{buildType}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-surface-container-low">
                <span className="text-sm font-medium opacity-70">Last Sync</span>
                <span className="text-sm font-medium">{cacheInfo ? cacheInfo.date : 'Never'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium opacity-70">Updater</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${updateState.enabled ? 'bg-tertiary shadow-[0_0_8px_rgba(0,73,58,0.5)]' : 'bg-outline'}`}></div>
                  <span className={`text-sm font-bold ${updateState.enabled ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                    {updateState.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative h-48 sm:h-56 lg:h-64 rounded-2xl overflow-hidden group shadow-xl">
            <img alt="Stevens Campus" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBzKUl5WXu2Ddb4KGIp32Txiu3WtwpMapPYquu7m3XX0W8NWrYpTmj2qz8KOzJpX7MLHNtlMBoAUw7CwrB821I4dxhSW2ISlUGMbiV5HGNLhquAhB-AUilE9f0sPE4aRGftB-n8R8UZn74z15mAhtXZY6HT3N_bSb5BRNt3kdN65ZxcmDDuGXN4_XuHAtA-zSItJC1PAQdCRnCX4M2OS7C46nrDJtQCZdm2O7D0JNoyTVGbpblmL4cJMhVfrmnFVMwil2OwXAOpWSo" />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent flex flex-col justify-end p-6">
              <p className="text-white/80 text-xs font-bold uppercase tracking-widest mb-1">Location</p>
              <h4 className="text-white text-xl font-bold font-headline">Hoboken Campus</h4>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
