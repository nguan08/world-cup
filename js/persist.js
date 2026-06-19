import { app } from './state.js';
export async function saveToServer() {
  try {
    const payload = {
      matches: app.matches,
      players: app.players,
      eliminatedTeams: Array.from(app.manualEliminatedTeams)
    };
    if (app.isAdmin) {
      payload.adminPassword = app.ADMIN_PASSWORD;
    }
    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      console.log('Successfully synced data to server data.json');
    } else if (response.status === 401 || response.status === 403) {
      console.warn('Server refused save (admin auth required):', response.status);
    } else {
      console.warn('Server refused to save data:', response.statusText);
    }
  } catch {
    console.log('Offline/Static hosting: skipped syncing to server.');
  }
}