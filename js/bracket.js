// Pure bracket generation and state management — no Firebase dependencies

const nextPow2 = n => { let p = 1; while (p < n) p *= 2; return p; };

function mkMatch(id, bracket, round, pos, t1, t2) {
  return { id, bracket, round, pos, t1, t2, winner: null, loser: null, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 };
}

// Wire winners forward through rounds within the same bracket type
function wireRound(matches, bracketType) {
  const bm = matches.filter(m => m.bracket === bracketType);
  const rounds = [...new Set(bm.map(m => m.round))].sort((a, b) => a - b);
  for (let ri = 0; ri < rounds.length - 1; ri++) {
    const curr = bm.filter(m => m.round === rounds[ri]).sort((a, b) => a.pos - b.pos);
    const next = bm.filter(m => m.round === rounds[ri + 1]).sort((a, b) => a.pos - b.pos);
    curr.forEach((m, i) => {
      if (!m.winTo) {
        const nm = next[Math.floor(i / 2)];
        if (nm) { m.winTo = nm.id; m.winSlot = i % 2; }
      }
    });
  }
}

// Advance winner/loser through routing — mutates matches in place
function applyResult(matches, matchId, winnerIdx) {
  const m = matches.find(x => x.id === matchId);
  if (!m) return;
  m.winner = winnerIdx;
  m.loser = m.t1 === winnerIdx ? m.t2 : m.t1;
  if (m.winTo) {
    const nm = matches.find(x => x.id === m.winTo);
    if (nm) nm[m.winSlot === 0 ? 't1' : 't2'] = winnerIdx;
  }
  if (m.loseTo && m.loser !== null) {
    const lm = matches.find(x => x.id === m.loseTo);
    if (lm) lm[m.loseSlot === 0 ? 't1' : 't2'] = m.loser;
  }
}

// Auto-advance byes — Round 1 のみ（null = 実際の不戦勝）
// Round 2 以降の null は「まだ決まっていない（TBD）」なので自動進出させない
function advanceByes(matches) {
  matches.filter(m => m.round === 1).forEach(m => {
    if (m.winner !== null) return;
    if (m.t1 !== null && m.t2 === null) applyResult(matches, m.id, m.t1);
    else if (m.t2 !== null && m.t1 === null) applyResult(matches, m.id, m.t2);
  });
}

// ── SINGLE ELIMINATION ──────────────────────────────────────────────
export function generateSingle(n) {
  const size = nextPow2(n);
  const matches = [];
  const seed = i => (i < n ? i : null);

  for (let i = 0; i < size / 2; i++) {
    matches.push(mkMatch(`W1-${i}`, 'W', 1, i, seed(i * 2), seed(i * 2 + 1)));
  }
  let prev = size / 2, r = 2;
  while (prev > 1) {
    const cnt = prev / 2;
    for (let i = 0; i < cnt; i++) matches.push(mkMatch(`W${r}-${i}`, 'W', r, i, null, null));
    prev = cnt; r++;
  }

  wireRound(matches, 'W');
  advanceByes(matches);
  return matches;
}

// ── DOUBLE ELIMINATION ──────────────────────────────────────────────
export function generateDouble(n) {
  const size = nextPow2(n);
  const matches = [];
  const seed = i => (i < n ? i : null);

  // Winners R1
  for (let i = 0; i < size / 2; i++) {
    const m = mkMatch(`W1-${i}`, 'W', 1, i, seed(i * 2), seed(i * 2 + 1));
    m.loseTo = `L1-${Math.floor(i / 2)}`; m.loseSlot = i % 2;
    matches.push(m);
  }
  // Winners R2+
  let wPrev = size / 2, wR = 2;
  while (wPrev > 1) {
    const wCnt = wPrev / 2;
    for (let i = 0; i < wCnt; i++) {
      const m = mkMatch(`W${wR}-${i}`, 'W', wR, i, null, null);
      // Losers from later W rounds feed into L bracket
      m.loseTo = `L${wR}-0`; m.loseSlot = i % 2;
      matches.push(m);
    }
    wPrev = wCnt; wR++;
  }
  // Losers bracket
  let lCnt = Math.max(1, size / 4), lR = 1;
  while (lCnt >= 1) {
    for (let i = 0; i < lCnt; i++) matches.push(mkMatch(`L${lR}-${i}`, 'L', lR, i, null, null));
    if (lCnt === 1) break;
    lCnt = Math.floor(lCnt / 2); lR++;
  }
  // Grand Final
  matches.push(mkMatch('GF-0', 'GF', 1, 0, null, null));

  wireRound(matches, 'W');
  wireRound(matches, 'L');

  // Override: last W match → GF slot 0
  const wFinal = matches.filter(m => m.bracket === 'W').sort((a, b) => b.round - a.round)[0];
  if (wFinal) { wFinal.winTo = 'GF-0'; wFinal.winSlot = 0; wFinal.loseTo = null; }

  // Override: last L match → GF slot 1
  const lFinal = matches.filter(m => m.bracket === 'L').sort((a, b) => b.round - a.round)[0];
  if (lFinal) { lFinal.winTo = 'GF-0'; lFinal.winSlot = 1; }

  advanceByes(matches);
  return matches;
}

// ── TRIPLE ELIMINATION ──────────────────────────────────────────────
// W bracket → L1 (1 loss) → L2 (2 losses) → eliminated on 3rd loss
// GF: W champion vs L1 winner
export function generateTriple(n) {
  const size = nextPow2(n);
  const matches = [];
  const seed = i => (i < n ? i : null);

  // Winners R1
  for (let i = 0; i < size / 2; i++) {
    const m = mkMatch(`W1-${i}`, 'W', 1, i, seed(i * 2), seed(i * 2 + 1));
    m.loseTo = `L1-1-${Math.floor(i / 2)}`; m.loseSlot = i % 2;
    matches.push(m);
  }
  // Winners R2+
  let wPrev = size / 2, wR = 2;
  while (wPrev > 1) {
    const wCnt = wPrev / 2;
    for (let i = 0; i < wCnt; i++) {
      const m = mkMatch(`W${wR}-${i}`, 'W', wR, i, null, null);
      m.loseTo = `L1-${wR}-0`; m.loseSlot = 0;
      matches.push(m);
    }
    wPrev = wCnt; wR++;
  }
  // L1 bracket (1 loss)
  let l1Cnt = Math.max(1, size / 4), l1R = 1;
  while (l1Cnt >= 1) {
    for (let i = 0; i < l1Cnt; i++) {
      const m = mkMatch(`L1-${l1R}-${i}`, 'L1', l1R, i, null, null);
      m.loseTo = `L2-1-${Math.floor(i / 2)}`; m.loseSlot = i % 2;
      matches.push(m);
    }
    if (l1Cnt === 1) break;
    l1Cnt = Math.floor(l1Cnt / 2); l1R++;
  }
  // L2 bracket (2 losses)
  let l2Cnt = Math.max(1, size / 8), l2R = 1;
  l2Cnt = Math.max(1, l2Cnt);
  while (l2Cnt >= 1) {
    for (let i = 0; i < l2Cnt; i++) matches.push(mkMatch(`L2-${l2R}-${i}`, 'L2', l2R, i, null, null));
    if (l2Cnt === 1) break;
    l2Cnt = Math.floor(l2Cnt / 2); l2R++;
  }
  // Grand Final
  matches.push(mkMatch('GF-0', 'GF', 1, 0, null, null));

  wireRound(matches, 'W');
  wireRound(matches, 'L1');
  wireRound(matches, 'L2');

  const wFinal = matches.filter(m => m.bracket === 'W').sort((a, b) => b.round - a.round)[0];
  if (wFinal) { wFinal.winTo = 'GF-0'; wFinal.winSlot = 0; wFinal.loseTo = null; }

  const l1Final = matches.filter(m => m.bracket === 'L1').sort((a, b) => b.round - a.round)[0];
  if (l1Final) { l1Final.winTo = 'GF-0'; l1Final.winSlot = 1; }

  advanceByes(matches);
  return matches;
}

// ── ROUND ROBIN ──────────────────────────────────────────────────────
export function generateRoundRobin(n) {
  const matches = [];
  const list = Array.from({ length: n % 2 === 0 ? n : n + 1 }, (_, i) => (i < n ? i : null));
  const numRounds = list.length - 1;
  for (let round = 0; round < numRounds; round++) {
    for (let i = 0; i < list.length / 2; i++) {
      const t1 = list[i], t2 = list[list.length - 1 - i];
      if (t1 !== null && t2 !== null) {
        matches.push(mkMatch(`RR${round + 1}-${i}`, 'RR', round + 1, i, t1, t2));
      }
    }
    list.splice(1, 0, list.pop());
  }
  return matches;
}

// ── PUBLIC API ────────────────────────────────────────────────────────
export function createBracket(n, format) {
  if (format === 'single') return generateSingle(n);
  if (format === 'double') return generateDouble(n);
  if (format === 'triple') return generateTriple(n);
  if (format === 'roundrobin') return generateRoundRobin(n);
  return [];
}

// Record a match result and propagate
export function recordResult(matches, matchId, winnerIdx) {
  const updated = matches.map(m => ({ ...m }));
  applyResult(updated, matchId, winnerIdx);
  return updated;
}

// Round robin standings
export function getStandings(n, matches) {
  const stats = Array.from({ length: n }, (_, i) => ({ teamIdx: i, wins: 0, losses: 0, played: 0 }));
  matches.filter(m => m.winner !== null && m.bracket === 'RR').forEach(m => {
    if (m.winner !== null && m.winner < n) { stats[m.winner].wins++; stats[m.winner].played++; }
    if (m.loser !== null && m.loser < n) { stats[m.loser].losses++; stats[m.loser].played++; }
  });
  return stats.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}

// Generate Discord-ready text for a set of matches
export function buildDiscordText(matches, teams, format, mode) {
  const tName = idx => (idx !== null && idx < teams.length ? teams[idx].name : '?');
  const tMention = idx => {
    if (idx === null || idx >= teams.length) return '?';
    const t = teams[idx];
    const playerMentions = t.players
      .filter(p => p.discordId)
      .map(p => `<@${p.discordId}>`);
    return playerMentions.length ? playerMentions.join(' ') : t.players.map(p => p.epicId).join(' / ');
  };
  const tEpicIds = idx => {
    if (idx === null || idx >= teams.length) return '?';
    return teams[idx].players.map(p => p.epicId).join(' / ');
  };

  const formatName = { single: 'シングルエリミネーション', double: 'ダブルエリミネーション', triple: 'トリプルエリミネーション', roundrobin: '総当たり' };
  let text = `【GalaxyRize トーナメント】${formatName[format]} ${mode}\n${'─'.repeat(30)}\n`;

  if (format === 'roundrobin') {
    const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
    rounds.forEach(r => {
      text += `\n📅 第${r}回戦\n`;
      matches.filter(m => m.round === r).forEach(m => {
        const res = m.winner !== null ? ` → 🏆 ${tName(m.winner)}` : '';
        text += `  ${tName(m.t1)} vs ${tName(m.t2)}${res}\n`;
      });
    });
  } else {
    const bracketLabels = { W: '🏆 勝者ブラケット', L: '🔵 敗者ブラケット', L1: '🔵 敗者ブラケット（1敗）', L2: '🟡 敗者ブラケット（2敗）', GF: '🎯 グランドファイナル' };
    const bracketOrder = format === 'triple' ? ['W', 'L1', 'L2', 'GF'] : format === 'double' ? ['W', 'L', 'GF'] : ['W'];
    bracketOrder.forEach(bt => {
      const bMatches = matches.filter(m => m.bracket === bt && m.t1 !== null && m.t2 !== null);
      if (!bMatches.length) return;
      text += `\n${bracketLabels[bt] || bt}\n`;
      const rounds = [...new Set(bMatches.map(m => m.round))].sort((a, b) => a - b);
      rounds.forEach(r => {
        const rMatches = bMatches.filter(m => m.round === r);
        text += `  Round ${r}\n`;
        rMatches.forEach(m => {
          const res = m.winner !== null ? ` → 🏆 ${tName(m.winner)}` : '';
          text += `  ${tName(m.t1)} vs ${tName(m.t2)}${res}\n`;
        });
      });
    });
  }

  // Mention block
  text += `\n${'─'.repeat(30)}\n📢 Discord メンション\n`;
  const pending = matches.filter(m => m.winner === null && m.t1 !== null && m.t2 !== null);
  if (pending.length) {
    text += pending.map(m => `${tMention(m.t1)}  vs  ${tMention(m.t2)}`).join('\n') + '\n';
  }

  // Epic ID lobby list
  text += `\n🎮 ロビー招待用 Epic ID\n`;
  teams.forEach(t => {
    text += `${t.name}: ${t.players.map(p => p.epicId).join(' / ')}\n`;
  });

  return text;
}
