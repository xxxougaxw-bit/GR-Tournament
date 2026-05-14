import { db } from './config.js';
import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, getDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createBracket, recordResult, getStandings, buildDiscordText } from './bracket.js';

const root = document.getElementById('root');
const toast = document.getElementById('toast');

let members = [];
let tournaments = [];
let currentView = 'list'; // 'list' | 'create' | 'bracket'
let currentTournament = null;
let wizardState = newWizardState();

// ── WIZARD STATE ─────────────────────────────────────────────────────
function newWizardState() {
  return { step: 1, name: '', format: 'single', mode: '1v1', playersPerTeam: 1, teamCount: 4, teams: [] };
}

// ── LOAD MEMBERS ─────────────────────────────────────────────────────
onSnapshot(query(collection(db, 'members'), orderBy('createdAt', 'asc')), snap => {
  members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
});

// ── LOAD TOURNAMENTS ─────────────────────────────────────────────────
onSnapshot(query(collection(db, 'tournaments'), orderBy('createdAt', 'desc')), snap => {
  tournaments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (currentView === 'list') renderList();
});

// ── ROUTING ──────────────────────────────────────────────────────────
function show(view, data = null) {
  currentView = view;
  currentTournament = data;
  if (view === 'list') renderList();
  else if (view === 'create') { wizardState = newWizardState(); renderWizard(); }
  else if (view === 'bracket') renderBracket();
}

// ── LIST VIEW ────────────────────────────────────────────────────────
function renderList() {
  const formatBadge = f => {
    const map = { single: ['シングル', 'badge-single'], double: ['ダブル', 'badge-double'], triple: ['トリプル', 'badge-triple'], roundrobin: ['総当たり', 'badge-roundrobin'] };
    const [label, cls] = map[f] || [f, ''];
    return `<span class="badge ${cls}">${label}</span>`;
  };

  root.innerHTML = `
    <div class="page-header">
      <h1>トーナメント</h1>
      <button class="btn btn-primary" onclick="window._showCreate()">+ 新規作成</button>
    </div>
    ${tournaments.length ? `
      <div class="tournament-list">
        ${tournaments.map(t => `
          <div class="tournament-card" onclick="window._openTournament('${t.id}')">
            <div class="tournament-card-info">
              <div class="tournament-card-name">${esc(t.name)}</div>
              <div class="tournament-card-meta">${t.mode} · ${t.teams?.length ?? 0}チーム · ${new Date(t.createdAt?.toDate?.() ?? t.createdAt).toLocaleDateString('ja-JP')}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              ${formatBadge(t.format)}
              <span class="badge ${t.status === 'completed' ? 'badge-completed' : 'badge-active'}">${t.status === 'completed' ? '終了' : '進行中'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="empty">
        <div class="empty-title">トーナメントがありません</div>
        <div class="empty-desc">「新規作成」からトーナメントを作成してください</div>
        <button class="btn btn-primary" onclick="window._showCreate()">+ 新規作成</button>
      </div>
    `}`;
}

window._showCreate = () => show('create');
window._openTournament = async id => {
  const snap = await getDoc(doc(db, 'tournaments', id));
  if (snap.exists()) show('bracket', { id: snap.id, ...snap.data() });
};

// ── WIZARD ───────────────────────────────────────────────────────────
function renderWizard() {
  const w = wizardState;
  const formats = [
    { key: 'single', title: 'シングルエリミネーション', desc: '1敗で終了。シンプルな勝ち上がり。' },
    { key: 'double', title: 'ダブルエリミネーション', desc: '2敗で終了。敗者ブラケットで復活可能。' },
    { key: 'triple', title: 'トリプルエリミネーション', desc: '3敗で終了。2回まで敗者ブラケットで復活。' },
    { key: 'roundrobin', title: '総当たり', desc: '全チームと対戦。勝敗数で順位決定。' },
  ];
  const modes = ['1v1', '2v2', '3v3', '4v4'];

  const steps = ['基本設定', 'チーム入力', '確認'];
  const stepHtml = steps.map((s, i) => `
    <div class="wizard-step ${w.step > i + 1 ? 'done' : w.step === i + 1 ? 'active' : ''}">
      <div class="step-num">${w.step > i + 1 ? '✓' : i + 1}</div>
      <span>${s}</span>
    </div>
    ${i < steps.length - 1 ? '<div class="step-divider"></div>' : ''}
  `).join('');

  let content = '';

  if (w.step === 1) {
    content = `
      <div class="form-group">
        <label class="form-label">トーナメント名</label>
        <input type="text" class="form-input" id="tName" value="${esc(w.name)}" placeholder="例: 第1回 GR内部戦" autocomplete="off">
      </div>
      <div class="form-group mt-16">
        <div class="section-label">形式</div>
        <div class="format-grid">
          ${formats.map(f => `
            <div class="format-card ${w.format === f.key ? 'selected' : ''}" onclick="window._setFormat('${f.key}')">
              <div class="format-card-title">${f.title}</div>
              <div class="format-card-desc">${f.desc}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="form-group mt-16">
        <div class="section-label">対戦モード</div>
        <div class="mode-grid">
          ${modes.map(m => `
            <button class="mode-btn ${w.mode === m ? 'selected' : ''}" onclick="window._setMode('${m}')">${m}</button>
          `).join('')}
        </div>
      </div>
      <div class="form-group mt-16">
        <label class="form-label">チーム数</label>
        <select class="form-select" id="teamCount">
          ${[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]
            .filter(n => w.format === 'roundrobin' ? n >= 3 : n >= 2)
            .map(n => `<option value="${n}" ${w.teamCount === n ? 'selected' : ''}>${n}チーム</option>`).join('')}
        </select>
      </div>
      <div class="flex gap-8 mt-24" style="justify-content:flex-end">
        <button class="btn btn-outline" onclick="window._backToList()">キャンセル</button>
        <button class="btn btn-primary" onclick="window._step1Next()">次へ →</button>
      </div>`;
  }

  if (w.step === 2) {
    const teamInputs = Array.from({ length: w.teamCount }, (_, i) => {
      const team = w.teams[i] || { name: '', players: [] };
      const playerInputs = Array.from({ length: w.playersPerTeam }, (_, pi) => {
        const player = team.players[pi] || { epicId: '', discordId: '' };
        return `
          <div class="player-row">
            <span class="player-label">P${pi + 1}</span>
            <input type="text" class="form-input" style="flex:1" placeholder="Epic ID" value="${esc(player.epicId)}"
              id="epic-${i}-${pi}"
              oninput="window._updatePlayer(${i},${pi},'epicId',this.value); window._autoFillDiscord(${i},${pi},this.value)"
              list="memberSuggestions" autocomplete="off">
            <input type="text" class="form-input" style="width:160px" placeholder="Discord ID（自動入力）" value="${esc(player.discordId)}"
              id="discord-${i}-${pi}"
              oninput="window._updatePlayer(${i},${pi},'discordId',this.value)" autocomplete="off">
          </div>`;
      }).join('');
      return `
        <div class="team-input-group">
          <div class="team-input-header">
            <span class="team-num">TEAM ${i + 1}</span>
            <input type="text" class="form-input" style="flex:1" placeholder="チーム名（例: チームA）" value="${esc(team.name)}"
              oninput="window._updateTeamName(${i},this.value)" autocomplete="off">
          </div>
          <div class="team-players">${playerInputs}</div>
        </div>`;
    }).join('');

    const memberOptions = members.map(m => `<option value="${esc(m.epicId)}" label="${esc(m.name || m.epicId)}">`).join('');

    content = `
      <datalist id="memberSuggestions">${memberOptions}</datalist>
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-outline btn-sm" onclick="window._shuffleTeams()">🎲 ランダムに並べる</button>
      </div>
      ${teamInputs}
      <div class="flex gap-8 mt-24" style="justify-content:flex-end">
        <button class="btn btn-outline" onclick="window._step2Back()">← 戻る</button>
        <button class="btn btn-primary" onclick="window._step2Next()">確認 →</button>
      </div>`;
  }

  if (w.step === 3) {
    const formatLabels = { single: 'シングルエリミネーション', double: 'ダブルエリミネーション', triple: 'トリプルエリミネーション', roundrobin: '総当たり' };
    content = `
      <div class="card">
        <div class="section-label">確認</div>
        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
          <div><span class="text-muted">名前：</span> ${esc(w.name)}</div>
          <div><span class="text-muted">形式：</span> ${formatLabels[w.format]}</div>
          <div><span class="text-muted">モード：</span> ${w.mode}</div>
          <div><span class="text-muted">チーム数：</span> ${w.teamCount}</div>
        </div>
        <div class="mt-16">
          ${w.teams.map((t, i) => `
            <div style="font-size:13px;margin-bottom:6px">
              <strong>TEAM ${i+1}：${esc(t.name)}</strong>
              ${t.players.map(p => `<div style="color:var(--text-muted);padding-left:12px;font-size:12px">${esc(p.epicId)}${p.discordId ? ' / <@' + esc(p.discordId) + '>' : ''}</div>`).join('')}
            </div>
          `).join('')}
        </div>
      </div>
      <div class="flex gap-8 mt-24" style="justify-content:flex-end">
        <button class="btn btn-outline" onclick="window._step3Back()">← 戻る</button>
        <button class="btn btn-primary" onclick="window._createTournament()">🏆 トーナメント作成</button>
      </div>`;
  }

  root.innerHTML = `
    <div class="page-header">
      <h1>トーナメント作成</h1>
    </div>
    <div class="wizard-steps">${stepHtml}</div>
    <div class="card">${content}</div>`;
}

// Wizard actions
window._backToList = () => show('list');
window._setFormat = f => { wizardState.format = f; renderWizard(); };
window._setMode = m => {
  wizardState.mode = m;
  wizardState.playersPerTeam = parseInt(m[0]);
  renderWizard();
};
window._updateTeamName = (i, v) => { if (!wizardState.teams[i]) wizardState.teams[i] = { name: '', players: [] }; wizardState.teams[i].name = v; };
window._updatePlayer = (ti, pi, field, v) => {
  if (!wizardState.teams[ti]) wizardState.teams[ti] = { name: '', players: [] };
  if (!wizardState.teams[ti].players[pi]) wizardState.teams[ti].players[pi] = { epicId: '', discordId: '' };
  wizardState.teams[ti].players[pi][field] = v;
};

window._autoFillDiscord = (ti, pi, epicId) => {
  const member = members.find(m => m.epicId === epicId.trim());
  if (!member?.discordId) return;
  if (!wizardState.teams[ti]) wizardState.teams[ti] = { name: '', players: [] };
  if (!wizardState.teams[ti].players[pi]) wizardState.teams[ti].players[pi] = { epicId: '', discordId: '' };
  wizardState.teams[ti].players[pi].discordId = member.discordId;
  const el = document.getElementById(`discord-${ti}-${pi}`);
  if (el) el.value = member.discordId;
};

window._shuffleTeams = () => {
  const teams = wizardState.teams.slice(0, wizardState.teamCount);
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  wizardState.teams = teams;
  renderWizard();
};

window._step1Next = () => {
  const name = document.getElementById('tName')?.value.trim();
  if (!name) { showToast('トーナメント名を入力してください', 'error'); return; }
  const tc = parseInt(document.getElementById('teamCount')?.value);
  wizardState.name = name;
  wizardState.teamCount = tc;
  wizardState.step = 2;
  // Initialize team slots
  wizardState.teams = Array.from({ length: tc }, (_, i) => wizardState.teams[i] || { name: '', players: [] });
  renderWizard();
};
window._step2Back = () => { wizardState.step = 1; renderWizard(); };
window._step2Next = () => {
  for (let i = 0; i < wizardState.teamCount; i++) {
    const t = wizardState.teams[i];
    if (!t?.name?.trim()) { showToast(`TEAM ${i+1} の名前を入力してください`, 'error'); return; }
    for (let pi = 0; pi < wizardState.playersPerTeam; pi++) {
      if (!t?.players[pi]?.epicId?.trim()) { showToast(`TEAM ${i+1} のP${pi+1} Epic IDを入力してください`, 'error'); return; }
    }
  }
  wizardState.step = 3;
  renderWizard();
};
window._step3Back = () => { wizardState.step = 2; renderWizard(); };
window._createTournament = async () => {
  const w = wizardState;
  const teams = w.teams.slice(0, w.teamCount).map(t => ({
    name: t.name.trim(),
    players: t.players.slice(0, w.playersPerTeam).map(p => ({ epicId: p.epicId.trim(), discordId: p.discordId?.trim() ?? '' }))
  }));
  const matches = createBracket(teams.length, w.format);
  try {
    const ref = await addDoc(collection(db, 'tournaments'), {
      name: w.name, format: w.format, mode: w.mode, playersPerTeam: w.playersPerTeam,
      teams, matches, status: 'active', createdAt: new Date()
    });
    showToast('トーナメントを作成しました', 'success');
    const snap = await getDoc(ref);
    show('bracket', { id: snap.id, ...snap.data() });
  } catch (e) {
    showToast('エラー: ' + e.message, 'error');
  }
};

// ── BRACKET VIEW ─────────────────────────────────────────────────────
function renderBracket() {
  const t = currentTournament;
  if (!t) return show('list');

  const formatLabels = { single: 'シングルエリミネーション', double: 'ダブルエリミネーション', triple: 'トリプルエリミネーション', roundrobin: '総当たり' };
  const tName = idx => (idx !== null && idx < t.teams.length ? esc(t.teams[idx].name) : '<span style="opacity:.4;font-style:italic">TBD</span>');

  let bracketHtml = '';

  if (t.format === 'roundrobin') {
    bracketHtml = renderRoundRobin(t);
  } else {
    bracketHtml = renderEliminationBracket(t);
  }

  const discordText = buildDiscordText(t.matches, t.teams, t.format, t.mode);

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${esc(t.name)}</h1>
        <div class="text-muted" style="margin-top:2px">${formatLabels[t.format]} · ${t.mode} · ${t.teams.length}チーム</div>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-outline btn-sm" onclick="window._backToList()">← 一覧</button>
        ${t.status !== 'completed' ? `<button class="btn btn-outline btn-sm" onclick="window._completeTournament()">終了にする</button>` : ''}
        <button class="btn btn-ghost-danger" style="font-size:12px" onclick="window._deleteTournament()">削除</button>
      </div>
    </div>
    ${bracketHtml}
    <div class="bracket-section mt-24">
      <div class="bracket-label">Discord 出力</div>
      <div style="position:relative">
        <div class="discord-box" id="discordOutput">${esc(discordText)}</div>
        <button class="btn btn-outline btn-sm" style="position:absolute;top:10px;right:10px" onclick="window._copyDiscord()">コピー</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <input type="text" class="form-input" id="webhookUrl"
          placeholder="Discord Webhook URL（チャンネルの設定 → 連携サービス → Webhookから取得）"
          value="${esc(localStorage.getItem('discordWebhook') || '')}"
          style="flex:1;font-size:12px"
          oninput="localStorage.setItem('discordWebhook', this.value)">
        <button class="btn btn-primary btn-sm" onclick="window._postToDiscord()">Discordに投稿</button>
      </div>
    </div>`;
}

function renderEliminationBracket(t) {
  const bracketOrder = t.format === 'triple' ? ['W', 'L1', 'L2', 'GF']
    : t.format === 'double' ? ['W', 'L', 'GF']
    : ['W'];
  const bracketLabels = { W: '勝者ブラケット', L: '敗者ブラケット', L1: '敗者ブラケット（1敗）', L2: '敗者ブラケット（2敗）', GF: 'グランドファイナル' };

  return bracketOrder.map(bt => {
    const bMatches = t.matches.filter(m => m.bracket === bt);
    if (!bMatches.length) return '';
    const rounds = [...new Set(bMatches.map(m => m.round))].sort((a, b) => a - b);
    const maxMatchesInRound = Math.max(...rounds.map(r => bMatches.filter(m => m.round === r).length));

    const roundsHtml = rounds.map(r => {
      const rMatches = bMatches.filter(m => m.round === r).sort((a, b) => a.pos - b.pos);
      const matchesHtml = rMatches.map(m => {
        const t1Class = m.winner === null ? '' : m.winner === m.t1 ? 'winner' : 'loser';
        const t2Class = m.winner === null ? '' : m.winner === m.t2 ? 'winner' : 'loser';
        const t1Label = m.t1 === null ? '<span class="tbd">TBD</span>' : esc(t.teams[m.t1]?.name ?? '?');
        const t2Label = m.t2 === null ? '<span class="tbd">TBD</span>' : esc(t.teams[m.t2]?.name ?? '?');
        const canClick = m.winner === null && m.t1 !== null && m.t2 !== null;
        return `
          <div class="bracket-match-wrap" style="height:${Math.round(maxMatchesInRound > 1 ? 80 : 60)}px">
            <div class="bracket-match-box">
              <div class="bracket-team ${t1Class} ${m.t1 === null ? 'tbd' : ''}"
                onclick="${canClick ? `window._setWinner('${m.id}',${m.t1})` : ''}">
                <span class="bracket-team-name">${t1Label}</span>
                ${m.winner === m.t1 ? '🏆' : ''}
              </div>
              <div class="bracket-team ${t2Class} ${m.t2 === null ? 'tbd' : ''}"
                onclick="${canClick ? `window._setWinner('${m.id}',${m.t2})` : ''}">
                <span class="bracket-team-name">${t2Label}</span>
                ${m.winner === m.t2 ? '🏆' : ''}
              </div>
            </div>
          </div>`;
      }).join('');

      const isLast = r === rounds[rounds.length - 1];
      const label = bt === 'W' ? (isLast && bt !== 'GF' ? 'ファイナル' : `Round ${r}`)
        : bt === 'GF' ? 'グランドファイナル' : `Round ${r}`;

      return `
        <div class="bracket-round">
          <div class="round-header">${label}</div>
          <div class="round-matches">${matchesHtml}</div>
        </div>`;
    }).join('');

    return `
      <div class="bracket-section">
        <div class="bracket-label">${bracketLabels[bt] || bt}</div>
        <div class="bracket-scroll"><div class="bracket-rounds">${roundsHtml}</div></div>
      </div>`;
  }).join('');
}

function renderRoundRobin(t) {
  const rounds = [...new Set(t.matches.map(m => m.round))].sort((a, b) => a - b);
  const standings = getStandings(t.teams.length, t.matches);

  const matchRows = rounds.map(r => {
    const rMatches = t.matches.filter(m => m.round === r).sort((a, b) => a.pos - b.pos);
    return `
      <div class="bracket-label">第${r}回戦</div>
      <div class="match-list mb-16">
        ${rMatches.map(m => {
          const t1n = esc(t.teams[m.t1]?.name ?? '?');
          const t2n = esc(t.teams[m.t2]?.name ?? '?');
          const t1cls = m.winner === null ? '' : m.winner === m.t1 ? 'winner' : 'loser';
          const t2cls = m.winner === null ? '' : m.winner === m.t2 ? 'winner' : 'loser';
          const canClick = m.winner === null;
          return `
            <div class="match-row">
              <span class="match-team-name ${t1cls}">${t1n}</span>
              <span class="match-vs">vs</span>
              <span class="match-team-name ${t2cls}">${t2n}</span>
              ${canClick ? `
                <div class="match-result-btns">
                  <button class="btn btn-outline btn-xs" onclick="window._setWinner('${m.id}',${m.t1})">${t1n} 勝利</button>
                  <button class="btn btn-outline btn-xs" onclick="window._setWinner('${m.id}',${m.t2})">${t2n} 勝利</button>
                </div>` : `<span style="font-size:12px;color:var(--accent)">🏆 ${esc(t.teams[m.winner]?.name ?? '?')}</span>`}
            </div>`;
        }).join('')}
      </div>`;
  }).join('');

  const rankColors = ['rank-1', 'rank-2', 'rank-3'];
  const standingsHtml = `
    <div class="bracket-label mt-24">順位表</div>
    <div class="rr-table-wrap">
      <table class="rr-table">
        <thead><tr><th>#</th><th>チーム</th><th>勝</th><th>負</th><th>試合数</th></tr></thead>
        <tbody>
          ${standings.map((s, i) => `
            <tr>
              <td class="${rankColors[i] ?? ''}">${i + 1}</td>
              <td>${esc(t.teams[s.teamIdx]?.name ?? '?')}</td>
              <td>${s.wins}</td>
              <td>${s.losses}</td>
              <td>${s.played}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  return `<div class="bracket-section">${matchRows}${standingsHtml}</div>`;
}

// ── BRACKET ACTIONS ──────────────────────────────────────────────────
window._setWinner = async (matchId, winnerIdx) => {
  if (!currentTournament) return;
  const updated = recordResult([...currentTournament.matches], matchId, winnerIdx);
  const isComplete = updated.filter(m => m.bracket !== 'RR').every(m => m.winner !== null) ||
    (currentTournament.format === 'roundrobin' && updated.every(m => m.winner !== null));
  try {
    await updateDoc(doc(db, 'tournaments', currentTournament.id), {
      matches: updated,
      status: isComplete ? 'completed' : 'active'
    });
    currentTournament = { ...currentTournament, matches: updated, status: isComplete ? 'completed' : 'active' };
    renderBracket();
    if (isComplete) showToast('🏆 トーナメント終了！', 'success');
  } catch (e) {
    showToast('エラー: ' + e.message, 'error');
  }
};

window._completeTournament = async () => {
  if (!currentTournament || !confirm('このトーナメントを終了にしますか？')) return;
  await updateDoc(doc(db, 'tournaments', currentTournament.id), { status: 'completed' });
  currentTournament = { ...currentTournament, status: 'completed' };
  renderBracket();
};

window._deleteTournament = async () => {
  if (!currentTournament || !confirm(`「${currentTournament.name}」を削除しますか？`)) return;
  await deleteDoc(doc(db, 'tournaments', currentTournament.id));
  show('list');
};

window._copyDiscord = () => {
  const text = document.getElementById('discordOutput')?.textContent ?? '';
  navigator.clipboard.writeText(text).then(() => showToast('Discordテキストをコピーしました', 'success'));
};

window._postToDiscord = async () => {
  const webhookUrl = document.getElementById('webhookUrl')?.value.trim();
  if (!webhookUrl) { showToast('Webhook URLを入力してください', 'error'); return; }
  const text = document.getElementById('discordOutput')?.textContent ?? '';
  if (!text.trim()) { showToast('投稿するテキストがありません', 'error'); return; }

  // Discordの2000文字制限に対応して分割送信
  const chunks = [];
  for (let i = 0; i < text.length; i += 2000) chunks.push(text.slice(i, i + 2000));

  try {
    for (const chunk of chunks) {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: chunk })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }
    showToast('Discordに投稿しました！', 'success');
  } catch (e) {
    showToast('投稿失敗: ' + e.message, 'error');
  }
};

// ── TOAST ────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = 'toast show ' + type;
  setTimeout(() => { toast.className = 'toast'; }, 2600);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── INIT ─────────────────────────────────────────────────────────────
show('list');
