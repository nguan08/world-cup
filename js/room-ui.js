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

async function handleAveragePayoutToggle(event) {
  if (!app.isAdmin) {
    event.target.checked = app.roomSettings?.averagePayoutRules !== false;
    return;
  }

  const enabled = Boolean(event.target.checked);
  app.roomSettings = { ...app.roomSettings, averagePayoutRules: enabled };
  localStorage.setItem(roomStorageKey('settings'), JSON.stringify(app.roomSettings));

  try {
    const ok = await saveRoomToServer({ quiet: true });
    if (!ok) throw new Error('บันทึกการตั้งค่าไม่สำเร็จ');
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
  } catch (e) {
    app.roomSettings = { ...app.roomSettings, averagePayoutRules: !enabled };
    event.target.checked = !enabled;
    localStorage.setItem(roomStorageKey('settings'), JSON.stringify(app.roomSettings));
    alert(e.message || 'บันทึกการตั้งค่าไม่สำเร็จ');
  }
}

export function initRoomUI() {
  updateRoomBadge();
  syncAdminRoomSettingsUI();

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

  document.getElementById('room-setting-average-payout')?.addEventListener('change', handleAveragePayoutToggle);
}