import { app, shell, BrowserWindow, nativeImage } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { registerHandlers } from './ipc/handlers';
import { closeBrowser } from './services/playwright';
import { terminateWorker } from './services/ocr';
import { cleanupImages } from './services/imageDownloader';
import { loadApiKeyFromKeychain } from './services/keytarStore';
import { loadWindowState, saveWindowState } from './services/windowState';
import { logger } from './utils/logger';

let mainWindow: BrowserWindow | null = null;

function getAppIconPath(): string {
  const iconFile = process.platform === 'darwin' ? 'AppIcon.icns' : 'icon.png';

  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', iconFile);
  }

  return join(__dirname, '../../resources', iconFile);
}

function createWindow(): void {
  const windowState = loadWindowState();
  const iconPath = getAppIconPath();

  mainWindow = new BrowserWindow({
    width: windowState.bounds.width,
    height: windowState.bounds.height,
    x: windowState.isMaximized ? undefined : windowState.bounds.x,
    y: windowState.isMaximized ? undefined : windowState.bounds.y,
    show: false,
    backgroundColor: '#f8f9fa',
    autoHideMenuBar: true,
    title: 'Ducklink Food Finder',
    icon: iconPath,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    if (windowState.isMaximized) {
      mainWindow?.maximize();
    }
    mainWindow?.show();
  });

  mainWindow.on('close', () => {
    if (mainWindow) {
      saveWindowState(mainWindow);
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Register IPC handlers
  registerHandlers(mainWindow);

  // Load renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.ducklinkfoodfinder');
  const appIcon = nativeImage.createFromPath(getAppIconPath());

  if (process.platform === 'darwin' && !appIcon.isEmpty()) {
    app.dock.setIcon(appIcon);
  }

  // Load API key from Keychain on startup
  try {
    await loadApiKeyFromKeychain();
  } catch {
    logger.warn('Keychain unavailable; configure an API key in Settings.');
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', async () => {
  logger.info('App shutting down, cleaning up resources...');
  await closeBrowser();
  await terminateWorker();
  cleanupImages();
});
