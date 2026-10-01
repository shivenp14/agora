export const IPC = {
  // Scan lifecycle
  SCAN_START: 'scan:start',
  SCAN_CANCEL: 'scan:cancel',

  // Main -> Renderer
  SCAN_PROGRESS: 'scan:progress',
  SCAN_COMPLETE: 'scan:complete',
  SCAN_ERROR: 'scan:error',

  // Events
  EVENTS_GET: 'events:get',
  EVENTS_CACHED: 'events:cached',

  // Settings
  SETTINGS_GET_API_KEY: 'settings:getApiKey',
  SETTINGS_SET_API_KEY: 'settings:setApiKey',
  SETTINGS_HAS_API_KEY: 'settings:hasApiKey',
  SETTINGS_DELETE_API_KEY: 'settings:deleteApiKey',

  // Cache
  CACHE_CLEAR: 'cache:clear',
  CACHE_INFO: 'cache:info',
  CACHE_GET: 'cache:get',

  // Food reviews
  REVIEWS_GET_FOR_SCAN: 'reviews:getForScan',
  REVIEWS_SAVE: 'reviews:save',
  REVIEWS_EXPORT: 'reviews:export',

  // App
  APP_INFO: 'app:info',

  // Updates
  UPDATE_GET_STATE: 'update:getState',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATE_CHANGED: 'update:stateChanged',

  // Browser
  BROWSER_URL_CHANGED: 'browser:urlChanged',
  BROWSER_PREVIEW_UPDATED: 'browser:previewUpdated',
  BROWSER_OPEN_EXTERNAL: 'browser:openExternal',
} as const;
