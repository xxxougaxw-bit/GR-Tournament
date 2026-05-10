import { db } from './config.js';
import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const COL = 'members';
let members = [];
let editingId = null;

const root = document.getElementById('root');
const overlay = document.getElementById('overlay');
const modalTitle = document.getElementById('modalTitle');
const epicIdInput = document.getElementById('epicIdInput');
const discordIdInput = document.getElementById('discordIdInput');
const toast = document.getElementById('toast');

// ── EVENTS ──────────────────────────────────────────────────────────
document.getElementById('addBtn').onclick = () => openModal(null);
document.getElementById('cancelBtn').onclick = closeModal;
document.getElementById('saveBtn').onclick = save;
overlay.onclick = e => { if (e.target === overlay) closeModal(); };
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && overlay.classList.contains('open')) save();
});

// ── MODAL ────────────────────────────────────────────────────────────
function openModal(member) {
  editingId = member?.id ?? null;
  modalTitle.textContent = member ? 'メンバー編集' : 'メンバー追加';
  epicIdInput.value = member?.epicId ?? '';
  discordIdInput.value = member?.discordId ?? '';
  overlay.classList.add('open');
  setTimeout(() => epicIdInput.focus(), 50);
}
function closeModal() {
  overlay.classList.remove('open');
  editingId = null;
}

// ── CRUD ─────────────────────────────────────────────────────────────
async function save() {
  const epicId = epicIdInput.value.trim();
  const discordId = discordIdInput.value.trim();
  if (!epicId) { showToast('Epic IDを入力してください', 'error'); return; }

  try {
    if (editingId) {
      await updateDoc(doc(db, COL, editingId), { epicId, discordId });
      showToast('更新しました', 'success');
    } else {
      await addDoc(collection(db, COL), { epicId, discordId, createdAt: new Date() });
      showToast('追加しました', 'success');
    }
    closeModal();
  } catch (e) {
    showToast('エラー: ' + e.message, 'error');
  }
}

window.editMember = id => openModal(members.find(m => m.id === id));

window.deleteMember = async id => {
  if (!confirm('このメンバーを削除しますか？')) return;
  try {
    await deleteDoc(doc(db, COL, id));
    showToast('削除しました');
  } catch (e) {
    showToast('エラー: ' + e.message, 'error');
  }
};

// ── COPY ─────────────────────────────────────────────────────────────
window.copyEpicId = (id, btn) => {
  const m = members.find(x => x.id === id);
  if (m) copyText(m.epicId, btn);
};
window.copyMention = (id, btn) => {
  const m = members.find(x => x.id === id);
  if (m?.discordId) copyText(`<@${m.discordId}>`, btn);
};

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ コピー済み';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
  });
}

// ── RENDER ───────────────────────────────────────────────────────────
function render() {
  if (!members.length) {
    root.innerHTML = `
      <div class="empty">
        <div class="empty-title">まだメンバーがいません</div>
        <div class="empty-desc">右上の「追加」からメンバーを登録してください</div>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="member-list">
      ${members.map(m => `
        <div class="member-row">
          <div class="member-avatar">${esc(m.epicId[0].toUpperCase())}</div>
          <div class="member-info">
            <div class="member-epic">${esc(m.epicId)}</div>
            <div class="member-discord">${m.discordId ? 'ID: ' + esc(m.discordId) : 'Discord ID 未設定'}</div>
          </div>
          <div class="member-actions">
            <button class="btn-copy" onclick="copyEpicId('${m.id}', this)">Epic IDをコピー</button>
            ${m.discordId ? `<button class="btn-copy" onclick="copyMention('${m.id}', this)">メンション</button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="editMember('${m.id}')">編集</button>
            <button class="btn-ghost-danger" onclick="deleteMember('${m.id}')">削除</button>
          </div>
        </div>
      `).join('')}
    </div>`;
}

// ── TOAST ────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = 'toast show ' + type;
  setTimeout(() => { toast.className = 'toast'; }, 2600);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── REALTIME ─────────────────────────────────────────────────────────
onSnapshot(query(collection(db, COL), orderBy('createdAt', 'asc')), snap => {
  members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
});
