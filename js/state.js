// Shared mutable application state
export const ADMIN_PASSWORD = '123456';

export let matches = [];
export let players = [];
export let isAdmin = false;
export let isSyncEnabled = false;

export let simulationScores = {};

export let lastDataRefreshTime = null;
export let autoRefreshTimer = null;
export const AUTO_REFRESH_INTERVAL_MS = 2 * 60 * 1000;

export let teamPoints = {};
export let processedPlayers = [];
export let manualEliminatedTeams = new Set();
export let lastHighlightPlayer = '';
export let teamMatchesPlayedCounts = {};
export const elCache = {};

export let _playerDrawerSavedScrollY = 0;
export let _playerDrawerScrollLocked = false;

export let chartHoverPlayer = '';
export let chartPulseAnimPlayer = '';

export let statsSortState = { key: 'points', dir: 'desc' };
export let statsSortHandlersReady = false;

export let _rankSpeechVoice = null;
export let _maxPopularityCache = null;
