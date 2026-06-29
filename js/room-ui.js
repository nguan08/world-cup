import { app } from './state.js';
import { syncAdminRoomSettingsUI } from './admin.js';
import { recalculateAll } from './scoring.js';
import { createRoom, populateRoomSelect, saveRoomToServer } from './room-store.js';
import { roomStorageKey } from './room.js';
import {
  DEFAULT_ROOM_ID,
  generateRoomSlug,
  getRoomUrl,
  isValidRoomSlug,
  normalizeRoomSlug
} from './room.js';

let _roomSwitchBusy = false;

export function updateRoomBadge() {
  const nameEl = document.getElementById('room-current-name');
  const metaEl = document.getElementById('room-current-meta');
  const actionsEl = document.querySelector('.room-panel__actions');
  const switchSelect = document.getElementById('room-switch-select');
  const panelLabel = document.getElementById('room-panel-label');
  const panel = document.getElementById('room-panel');
  if (!nameEl) return;

  const missing = app.roomId !== DEFAULT_ROOM_ID && !app.roomLoaded;
  if (panel) {
    panel.classList.toggle('room-panel--missing', missing);
    panel.classList.toggle('room-panel--guest', !app.isAdmin);
    panel.classList.toggle('room-panel--admin', Boolean(app.isAdmin));
  }

  nameEl.textContent = missing ? `ไม่พบห้อง "${app.roomId}"` : (app.roomName || app.roomId || 'ห้องหลัก');

  if (!app.isAdmin) {
    if (nameEl) nameEl.hidden = false;
    if (switchSelect) switchSelect.hidden = true;
    if (panelLabel) panelLabel.textContent = 'ห้องปัจจุบัน';
    if (metaEl) {
      metaEl.textContent = '';
      metaEl.hidden = true;
    }
    if (actionsEl) actionsEl.hidden = true;
    return;
  }

  if (nameEl) nameEl.hidden = true;
  if (switchSelect) switchSelect.hidden = false;
  if (panelLabel) panelLabel.textContent = 'เลือกห้อง';
  if (actionsEl) actionsEl.hidden = false;

  void populateRoomSwitchSelect();

  if (metaEl) {
    metaEl.hidden = false;
    const count = Array.isArray(app.players) ? app.players.length : 0;
    const slugLabel = app.roomId === DEFAULT_ROOM_ID ? 'ห้องหลัก' : app.roomId;
    metaEl.textContent = missing
      ? 'สร้างห้องใหม่หรือตรวจสอบลิงก์'
      : `${count} ผู้เล่น · ${slugLabel}`;
  }
}

async function populateRoomSwitchSelect() {
  if (!app.isAdmin || _roomSwitchBusy) return;
  const select = document.getElementById('room-switch-select');
  if (!select) return;
  await populateRoomSelect(select, app.roomId);
}

async function handleRoomSwitch(event) {
  const select = event.target;
  const selected = select.value;
  if (!selected || selected === app.roomId || _roomSwitchBusy) return;

  _roomSwitchBusy = true;
  select.disabled = true;
  sessionStorage.setItem('worldcup_isAdmin', 'true');

  try {
    const { switchToRoom } = await import('./sync.js');
    const switched = await switchToRoom(selected);
    if (!switched) select.value = app.roomId;
  } catch (e) {
    console.error('[Room] switch failed:', e);
    select.value = app.roomId;
    alert('สลับห้องไม่สำเร็จ — ลองใหม่อีกครั้ง');
  } finally {
    select.disabled = false;
    _roomSwitchBusy = false;
  }
}

function setCreateRoomError(message = '') {
  const el = document.getElementById('create-room-error');
  if (!el) return;
  if (!message) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  el.textContent = message;
}

function openCreateRoomModal() {
  const overlay = document.getElementById('create-room-overlay');
  if (!overlay) return;
  const nameInput = document.getElementById('create-room-name');
  const slugInput = document.getElementById('create-room-slug');
  const linkInput = document.getElementById('create-room-link');
  if (nameInput) nameInput.value = '';
  if (slugInput) slugInput.value = generateRoomSlug();
  if (linkInput) linkInput.value = '';
  setCreateRoomError('');
  previewCreateRoomLink();
  overlay.classList.add('active');
  nameInput?.focus();
}

function closeCreateRoomModal() {
  document.getElementById('create-room-overlay')?.classList.remove('active');
}

function previewCreateRoomLink() {
  const slugInput = document.getElementById('create-room-slug');
  const linkInput = document.getElementById('create-room-link');
  if (!slugInput || !linkInput) return;
  const slug = normalizeRoomSlug(slugInput.value) || generateRoomSlug();
  linkInput.value = `${location.origin}${getRoomUrl(slug)}`;
}

async function handleCreateRoomSubmit() {
  const name = document.getElementById('create-room-name')?.value?.trim();
  const slugRaw = document.getElementById('create-room-slug')?.value?.trim();
  const submitBtn = document.getElementById('create-room-submit-btn');

  if (!name) {
    setCreateRoomError('กรุณาตั้งชื่อห้อง');
    return;
  }

  const slug = normalizeRoomSlug(slugRaw);
  if (slug && !isValidRoomSlug(slug)) {
    setCreateRoomError('รหัสห้องใช้ได้เฉพาะ a-z, 0-9 และ - (3-32 ตัว)');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังสร้าง...';
  }
  setCreateRoomError('');

  try {
    const room = await createRoom({ name, slug });
    const url = `${location.origin}${getRoomUrl(room.id)}`;
    const linkInput = document.getElementById('create-room-link');
    if (linkInput) linkInput.value = url;
    closeCreateRoomModal();
    if (confirm(`สร้างห้อง "${room.name}" สำเร็จ!\n\nเปิดห้องใหม่เลยไหม?`)) {
      location.href = url;
    } else {
      void populateRoomSwitchSelect();
    }
  } catch (e) {
    setCreateRoomError(e.message || 'สร้างห้องไม่สำเร็จ');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'สร้างห้อง';
    }
  }
}

async function copyCurrentRoomLink() {
  const url = `${location.origin}${getRoomUrl(app.roomId)}`;
  try {
    await navigator.clipboard.writeText(url);
    alert('คัดลอกลิงก์ห้องแล้ว');
  } catch {
    prompt('คัดลอกลิงก์ห้องนี้:', url);
  }
}

function savedAveragePayoutEnabled() {
  return app.roomSettings?.averagePayoutRules !== false;
}

export function syncRoomSettingsSaveUI() {
  const checkbox = document.getElementById('room-setting-average-payout');
  const btn = document.getElementById('room-settings-save-btn');
  const status = document.getElementById('room-settings-save-status');
  if (!checkbox || !btn) return;

  const checkboxDirty = Boolean(checkbox.checked) !== savedAveragePayoutEnabled();
  const blueInput = document.getElementById('room-setting-blue-pct');
  const greenInput = document.getElementById('room-setting-green-pct');
  
  const blueVal = blueInput ? (parseInt(blueInput.value, 10) || 0) : 24;
  const greenVal = greenInput ? (parseInt(greenInput.value, 10) || 0) : 50;
  
  const savedBlue = app.roomSettings?.blueZonePercent !== undefined ? app.roomSettings.blueZonePercent : 24;
  const savedGreen = app.roomSettings?.greenZonePercent !== undefined ? app.roomSettings.greenZonePercent : 50;
  
  const percentDirty = blueVal !== savedBlue || greenVal !== savedGreen;

  // Payout inputs
  const bluePayoutInput = document.getElementById('room-setting-blue-payout');
  const greenPayoutInput = document.getElementById('room-setting-green-payout');
  const redPayoutInput = document.getElementById('room-setting-red-payout');
  const secondLastPayoutInput = document.getElementById('room-setting-second-last-payout');
  const lastPayoutInput = document.getElementById('room-setting-last-payout');

  const bluePayoutVal = bluePayoutInput ? (parseInt(bluePayoutInput.value, 10) || 0) : 0;
  const greenPayoutVal = greenPayoutInput ? (parseInt(greenPayoutInput.value, 10) || 0) : 0;
  const redPayoutVal = redPayoutInput ? (parseInt(redPayoutInput.value, 10) || 0) : 1000;
  const secondLastPayoutVal = secondLastPayoutInput ? (parseInt(secondLastPayoutInput.value, 10) || 0) : 1200;
  const lastPayoutVal = lastPayoutInput ? (parseInt(lastPayoutInput.value, 10) || 0) : 1500;

  const savedBluePayout = app.roomSettings?.blueZonePayout !== undefined ? app.roomSettings.blueZonePayout : 0;
  const savedGreenPayout = app.roomSettings?.greenZonePayout !== undefined ? app.roomSettings.greenZonePayout : 0;
  const savedRedPayout = app.roomSettings?.redZonePayout !== undefined ? app.roomSettings.redZonePayout : 1000;
  const savedSecondLastPayout = app.roomSettings?.secondLastPlacePayout !== undefined ? app.roomSettings.secondLastPlacePayout : 1200;
  const savedLastPayout = app.roomSettings?.lastPlacePayout !== undefined ? app.roomSettings.lastPlacePayout : 1500;

  const payoutDirty = bluePayoutVal !== savedBluePayout ||
                       greenPayoutVal !== savedGreenPayout ||
                       redPayoutVal !== savedRedPayout ||
                       secondLastPayoutVal !== savedSecondLastPayout ||
                       lastPayoutVal !== savedLastPayout;

  const dirty = checkboxDirty || percentDirty || payoutDirty;

  btn.disabled = !dirty || btn.dataset.busy === '1';
  btn.textContent = btn.dataset.busy === '1' ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า';

  if (dirty && status) {
    status.textContent = 'มีการเปลี่ยนแปลง — กดบันทึก';
    status.classList.remove('admin-room-settings-save-status--error');
  } else if (status && status.textContent === 'มีการเปลี่ยนแปลง — กดบันทึก') {
    status.textContent = '';
    status.classList.remove('admin-room-settings-save-status--error');
  }
}

function handleAveragePayoutChange(event) {
  if (!app.isAdmin) {
    event.target.checked = savedAveragePayoutEnabled();
    return;
  }
  syncRoomSettingsSaveUI();
}

export function updateRedZonePercent() {
  const blueInput = document.getElementById('room-setting-blue-pct');
  const greenInput = document.getElementById('room-setting-green-pct');
  const redInput = document.getElementById('room-setting-red-pct');
  if (!blueInput || !greenInput || !redInput) return;

  let blueVal = parseInt(blueInput.value, 10) || 0;
  if (blueVal < 0) blueVal = 0;
  if (blueVal > 100) blueVal = 100;

  let greenVal = parseInt(greenInput.value, 10) || 0;
  if (greenVal < 0) greenVal = 0;
  if (blueVal + greenVal > 100) {
    greenVal = 100 - blueVal;
  }

  if (blueInput.value !== '' && parseInt(blueInput.value, 10) !== blueVal) {
    blueInput.value = blueVal;
  }
  if (greenInput.value !== '' && parseInt(greenInput.value, 10) !== greenVal) {
    greenInput.value = greenVal;
  }

  const redVal = 100 - blueVal - greenVal;
  redInput.value = redVal;

  syncRoomSettingsSaveUI();
}

function refreshViewsAfterSettingsSave() {
  recalculateAll();
  import('./bundle.js').then((m) => {
    if (document.getElementById('leaderboard')?.classList.contains('active')) {
      m.renderLeaderboard({ forceRecalc: false });
    }
    if (document.getElementById('payout')?.classList.contains('active')) {
      m.renderPayout();
    }
    if (document.getElementById('dashboard')?.classList.contains('active')) {
      m.renderDashboard();
    }
  });
}

function setRoomSettingsSaveStatus(message = '', isError = false) {
  const status = document.getElementById('room-settings-save-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('admin-room-settings-save-status--error', Boolean(isError && message));
}

async function handleSaveRoomSettings() {
  if (!app.isAdmin) return;

  const checkbox = document.getElementById('room-setting-average-payout');
  const btn = document.getElementById('room-settings-save-btn');
  if (!checkbox || !btn || btn.disabled) return;

  const enabled = Boolean(checkbox.checked);
  
  const blueInput = document.getElementById('room-setting-blue-pct');
  const greenInput = document.getElementById('room-setting-green-pct');
  const bluePct = blueInput ? (parseInt(blueInput.value, 10) || 0) : 24;
  const greenPct = greenInput ? (parseInt(greenInput.value, 10) || 0) : 50;

  const bluePayoutInput = document.getElementById('room-setting-blue-payout');
  const greenPayoutInput = document.getElementById('room-setting-green-payout');
  const redPayoutInput = document.getElementById('room-setting-red-payout');
  const secondLastPayoutInput = document.getElementById('room-setting-second-last-payout');
  const lastPayoutInput = document.getElementById('room-setting-last-payout');

  const bluePayout = bluePayoutInput ? (parseInt(bluePayoutInput.value, 10) || 0) : 0;
  const greenPayout = greenPayoutInput ? (parseInt(greenPayoutInput.value, 10) || 0) : 0;
  const redPayout = redPayoutInput ? (parseInt(redPayoutInput.value, 10) || 0) : 1000;
  const secondLastPayout = secondLastPayoutInput ? (parseInt(secondLastPayoutInput.value, 10) || 0) : 1200;
  const lastPayout = lastPayoutInput ? (parseInt(lastPayoutInput.value, 10) || 0) : 1500;

  app.roomSettings = { 
    ...app.roomSettings, 
    averagePayoutRules: enabled,
    blueZonePercent: bluePct,
    greenZonePercent: greenPct,
    blueZonePayout: bluePayout,
    greenZonePayout: greenPayout,
    redZonePayout: redPayout,
    secondLastPlacePayout: secondLastPayout,
    lastPlacePayout: lastPayout
  };
  app.roomSettingsDirtyUntil = Date.now() + 120_000;
  localStorage.setItem(roomStorageKey('settings', app.roomId), JSON.stringify(app.roomSettings));

  btn.dataset.busy = '1';
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';
  setRoomSettingsSaveStatus('');

  try {
    const ok = await saveRoomToServer({ quiet: false });
    if (!ok) {
      throw new Error('บันทึกไม่สำเร็จ — ตรวจสอบว่าเข้าสู่ระบบแอดมินแล้ว');
    }
    refreshViewsAfterSettingsSave();
    setRoomSettingsSaveStatus('บันทึกแล้ว');
  } catch (e) {
    setRoomSettingsSaveStatus(e.message || 'บันทึกไม่สำเร็จ', true);
    alert(e.message || 'บันทึกการตั้งค่าไม่สำเร็จ');
  } finally {
    delete btn.dataset.busy;
    syncRoomSettingsSaveUI();
  }
}

export function initRoomUI() {
  updateRoomBadge();
  syncAdminRoomSettingsUI();
  syncRoomSettingsSaveUI();

  document.getElementById('room-switch-select')?.addEventListener('change', handleRoomSwitch);
  document.getElementById('open-create-room-btn')?.addEventListener('click', openCreateRoomModal);
  document.getElementById('close-create-room-btn')?.addEventListener('click', closeCreateRoomModal);
  document.getElementById('create-room-cancel-btn')?.addEventListener('click', closeCreateRoomModal);
  document.getElementById('create-room-submit-btn')?.addEventListener('click', handleCreateRoomSubmit);
  document.getElementById('create-room-slug')?.addEventListener('input', previewCreateRoomLink);
  document.getElementById('copy-room-link-btn')?.addEventListener('click', copyCurrentRoomLink);
  document.getElementById('regenerate-room-slug-btn')?.addEventListener('click', () => {
    const slugInput = document.getElementById('create-room-slug');
    if (slugInput) slugInput.value = generateRoomSlug();
    previewCreateRoomLink();
  });

  document.getElementById('create-room-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'create-room-overlay') closeCreateRoomModal();
  });

  document.getElementById('room-setting-average-payout')?.addEventListener('change', handleAveragePayoutChange);
  document.getElementById('room-settings-save-btn')?.addEventListener('click', handleSaveRoomSettings);

  const blueInput = document.getElementById('room-setting-blue-pct');
  const greenInput = document.getElementById('room-setting-green-pct');
  if (blueInput) {
    blueInput.addEventListener('input', updateRedZonePercent);
    blueInput.addEventListener('change', updateRedZonePercent);
  }
  if (greenInput) {
    greenInput.addEventListener('input', updateRedZonePercent);
    greenInput.addEventListener('change', updateRedZonePercent);
  }

  const payoutInputs = [
    'room-setting-blue-payout',
    'room-setting-green-payout',
    'room-setting-red-payout',
    'room-setting-second-last-payout',
    'room-setting-last-payout'
  ];
  payoutInputs.forEach(id => {
    const inp = document.getElementById(id);
    if (inp) {
      inp.addEventListener('input', syncRoomSettingsSaveUI);
      inp.addEventListener('change', syncRoomSettingsSaveUI);
    }
  });
}