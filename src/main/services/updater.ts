import { app, BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import { IPC } from '../ipc/channels';
import { logger } from '../utils/logger';
import { existsSync } from 'fs';
import { join } from 'path';

export type UpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error';

export interface UpdateState {
  enabled: boolean;
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  downloadedVersion: string | null;
  progress: number | null;
  transferredBytes: number | null;
  totalBytes: number | null;
  message: string;
  releaseDate: string | null;
  lastCheckedAt: number | null;
}

let mainWindow: BrowserWindow | null = null;
let isInitialized = false;

let state: UpdateState = {
  enabled: false,
  status: 'disabled',
  currentVersion: app.getVersion(),
  availableVersion: null,
  downloadedVersion: null,
  progress: null,
  transferredBytes: null,
  totalBytes: null,
  message: 'Auto-updates are only available in packaged builds.',
  releaseDate: null,
  lastCheckedAt: null,
};

export function isUpdateConfigured(): boolean {
  return app.isPackaged && existsSync(join(process.resourcesPath, 'app-update.yml'));
}

export function initializeUpdater(window: BrowserWindow): void {
  mainWindow = window;

  if (isInitialized) {
    emitState();
    return;
  }

  state = createInitialState();

  if (!state.enabled) {
    emitState();
    isInitialized = true;
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    patchState({
      status: 'checking',
      progress: null,
      transferredBytes: null,
      totalBytes: null,
      lastCheckedAt: Date.now(),
      message: 'Checking for a new release...',
    });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    patchState(fromUpdateInfo(info, {
      status: 'available',
      progress: null,
      transferredBytes: null,
      totalBytes: null,
      message: `Version ${info.version} is available to download.`,
    }));
  });

  autoUpdater.on('update-not-available', () => {
    patchState({
      status: 'not-available',
      availableVersion: null,
      downloadedVersion: null,
      progress: null,
      transferredBytes: null,
      totalBytes: null,
      releaseDate: null,
      lastCheckedAt: Date.now(),
      message: 'You already have the latest version installed.',
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    patchState(fromProgressInfo(progress, {
      status: 'downloading',
      message: `Downloading update... ${Math.round(progress.percent)}%`,
    }));
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    patchState(fromUpdateInfo(info, {
      status: 'downloaded',
      downloadedVersion: info.version,
      progress: 100,
      transferredBytes: null,
      totalBytes: null,
      message: `Version ${info.version} is ready. Restart the app to install it.`,
    }));
  });

  autoUpdater.on('error', (error: Error) => {
    logger.error(`Updater error: ${error.message}`);
    patchState({
      status: 'error',
      progress: null,
      transferredBytes: null,
      totalBytes: null,
      message: error.message,
      lastCheckedAt: Date.now(),
    });
  });

  emitState();
  isInitialized = true;
}

export function getUpdateState(): UpdateState {
  return { ...state };
}

export async function checkForUpdates(): Promise<void> {
  ensureUpdaterEnabled();
  await autoUpdater.checkForUpdates();
}

export async function downloadUpdate(): Promise<void> {
  ensureUpdaterEnabled();
  await autoUpdater.downloadUpdate();
}

export function quitAndInstallUpdate(): void {
  ensureUpdaterEnabled();
  autoUpdater.quitAndInstall();
}

function createInitialState(): UpdateState {
  const baseState: UpdateState = {
    enabled: false,
    status: 'disabled',
    currentVersion: app.getVersion(),
    availableVersion: null,
    downloadedVersion: null,
    progress: null,
    transferredBytes: null,
    totalBytes: null,
    message: 'Auto-updates are only available in packaged builds.',
    releaseDate: null,
    lastCheckedAt: null,
  };

  if (is.dev || !isUpdateConfigured()) {
    return {
      ...baseState,
      enabled: false,
      status: 'disabled',
      message: is.dev
        ? 'Auto-updates are disabled while running in development.'
        : 'Updates are unavailable in this local build. Install a DMG or ZIP release to enable updates.',
    };
  }

  return {
    ...baseState,
    enabled: true,
    status: 'idle',
    message: 'Ready to check GitHub Releases for updates.',
  };
}

function ensureUpdaterEnabled(): void {
  if (!state.enabled) {
    throw new Error(state.message);
  }
}

function emitState(): void {
  mainWindow?.webContents.send(IPC.UPDATE_STATE_CHANGED, getUpdateState());
}

function patchState(partial: Partial<UpdateState>): void {
  state = {
    ...state,
    ...partial,
    currentVersion: app.getVersion(),
  };
  emitState();
}

function fromUpdateInfo(info: UpdateInfo, partial: Partial<UpdateState>): Partial<UpdateState> {
  return {
    availableVersion: info.version,
    releaseDate: info.releaseDate ?? null,
    lastCheckedAt: Date.now(),
    ...partial,
  };
}

function fromProgressInfo(progress: ProgressInfo, partial: Partial<UpdateState>): Partial<UpdateState> {
  return {
    progress: progress.percent,
    transferredBytes: progress.transferred,
    totalBytes: progress.total,
    ...partial,
  };
}
