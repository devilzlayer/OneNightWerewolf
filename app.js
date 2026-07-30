// Initialize Firebase Configuration Configs
const firebaseConfig = {
    apiKey: "AIzaSyBCzRTqax-MHopHELh4kT_U-QAc0_QBJAA",
    authDomain: "onenightwerewolf-ca443.firebaseapp.com",
    databaseURL: "https://onenightwerewolf-ca443-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "onenightwerewolf-ca443",
    storageBucket: "onenightwerewolf-ca443.firebasestorage.app",
    messagingSenderId: "265422561846",
    appId: "1:265422561846:web:880a22a10b0f6712e26e97"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentGameCode = "";
let myName = "";
let isHost = false;
let gameStarting = false;
let gameStarted = false;
// (spectator mode removed)
let lastSpokenPhase = "";
let tmFirstSelection = "";
let seerFirstCenterSelection = "";
let cachedNightRole = "";
let nightTimerInterval = null;

// ===== SESSION PERSISTENCE (for reconnection on refresh) =====
function saveSession() {
    localStorage.setItem("onw_gameCode", currentGameCode);
    localStorage.setItem("onw_playerName", myName);
    localStorage.setItem("onw_isHost", isHost ? "true" : "");
}
function clearSession() {
    localStorage.removeItem("onw_gameCode");
    localStorage.removeItem("onw_playerName");
    localStorage.removeItem("onw_isHost");
}

// Image Asset Mapping
const ROLE_IMAGES = {
    "Werewolf": "images/Werewolf.webp", "Seer": "images/Seer.webp",
    "Robber": "images/Robber.webp", "Troublemaker": "images/Troublemaker.webp",
    "Villager": "images/Villager.webp", "Tanner": "images/Tanner.webp",
    "Insomniac": "images/Insomniac.webp",
    "Unassigned": "images/Unassigned.webp"
};

// Night phase role order (sequential with timers)
const NIGHT_ORDER = [
    { phase: "werewolf",    roles: ["Werewolf"],    time: 30 },
    { phase: "seer",        roles: ["Seer"],        time: 30 },
    { phase: "robber",      roles: ["Robber"],      time: 30 },
    { phase: "troublemaker", roles: ["Troublemaker"], time: 30 },
    { phase: "insomniac",   roles: ["Insomniac"],   time: 15 }
];

// Role Information for the card click popup
const ROLE_INFO = {
    "Werewolf": "🐺 You are a Werewolf! At night, see who your fellow wolves are. Your goal is to not get voted out during the day. If one or more werewolf is exiled out you lose, you win if all werewolves are alive",
    "Seer": "🔮 You are the Seer! At night, you may look at another player's current role card or two of the center cards. Use this information to guide the village — or mislead them.",
    "Robber": "🕵️ You are the Robber! At night, you may swap your card with another player's card and look at it. You then become that role. Act accordingly!",
    "Troublemaker": "⚡ You are the Troublemaker! At night, you may swap the cards of two other players. You do not get to look at either card — chaos is the goal.",
    "Villager": "🌾 You are a Villager! You have no night action. Your goal is to use the day discussion to figure out who the Werewolves are and vote them out.",
    "Tanner": "🧑‍🌾 You are the Tanner! You have no night action. Your goal is to be voted out during the day. Make the village suspect you!",
    "Insomniac": "🌙 You are the Insomniac! At the end of the night, you may look at your own current role card to see if it was swapped during the night.",
    "Unassigned": "❓ Role not yet assigned. Wait for the game to start."
};

function showRoleInfo(role) {
    const info = ROLE_INFO[role] || "Unknown role.";
    const modal = document.getElementById("roleInfoModal");
    const overlay = document.getElementById("roleInfoOverlay");
    document.getElementById("roleInfoTitle").innerText = role;
    document.getElementById("roleInfoText").innerText = info;
    document.getElementById("roleInfoImage").src = ROLE_IMAGES[role] || "";
    modal.style.display = "block";
    overlay.style.display = "block";
}

function closeRoleInfo() {
    document.getElementById("roleInfoModal").style.display = "none";
    document.getElementById("roleInfoOverlay").style.display = "none";
}

function showRoleGallery() {
    const overlay = document.getElementById("roleGalleryOverlay");
    const panel = document.getElementById("roleGalleryPanel");
    const grid = document.getElementById("roleGalleryGrid");
    if (!panel || !grid) return;

    // All playable roles (exclude Unassigned)
    const roles = ["Werewolf","Seer","Robber","Troublemaker","Villager","Tanner","Insomniac"];
    grid.innerHTML = roles.map(role => `
        <div class="gallery-card" onclick="showRoleInfo('${role}')">
            <img src="${ROLE_IMAGES[role]}" alt="${role}">
            <span>${role}</span>
        </div>
    `).join("");

    panel.style.display = "block";
    overlay.style.display = "block";
}

function closeRoleGallery() {
    document.getElementById("roleGalleryPanel").style.display = "none";
    document.getElementById("roleGalleryOverlay").style.display = "none";
}

// ===== SOUND SYSTEM (Web Audio API - no files needed) =====
let soundEnabled = true;
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}
function playTone(freq, duration, type = "sine", volume = 1) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
    } catch(e) {}
}
function playClick() { playTone(800, 0.08, "square", 0.05); }
function playNightAmbiance() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioCtx();
        // Low hum
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(55, ctx.currentTime);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 2);
    } catch(e) {}
}
function playDayBell() { playTone(1200, 0.3, "sine", 0.1); setTimeout(() => playTone(1500, 0.3, "sine", 0.1), 300); }
function playGameOverFanfare() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.4, "sine", 0.12), i * 200));
}
function playVoteSound() { playTone(600, 0.15, "triangle", 0.08); }
function playCardFlipSound() { playTone(300, 0.1, "square", 0.06); setTimeout(() => playTone(500, 0.1, "square", 0.06), 100); }

// ===== DARK MODE =====
function toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    const btn = document.getElementById("darkModeToggle");
    if (btn) btn.innerText = document.body.classList.contains("dark-mode") ? "☀️ Light" : "🌙 Dark";
}


// ===== CREATE GAME =====
function createGame() {
    myName = document.getElementById("playerName").value.trim();
    if (!myName) return alert("Enter a name!");

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    currentGameCode = code;
    isHost = true;

    db.ref('games/' + code).set({
        host: myName,
        players: { [myName]: { alive: true, originalRole: "Unassigned", currentRole: "Unassigned", ready: false } },

        phase: "lobby",
        chat: {},
        nightLog: {}
    });
    // Don't delete the whole game on disconnect — just remove the host player
    // so the host can reconnect on refresh
    db.ref('games/' + code + '/players/' + myName).onDisconnect().remove();
    showGame(code);
    saveSession();
}

// ===== JOIN GAME =====
function joinGame() {
    const code = document.getElementById("gameCode").value.trim();
    myName = document.getElementById("playerName").value.trim();
    if (!code || !myName) return alert("Enter Name and Code!");

    db.ref('games/' + code).once('value', (snapshot) => {
        if (!snapshot.exists()) return alert("Game room not found!");
        const game = snapshot.val();

        if (game.players && game.players[myName]) {
            return alert("This name is already taken in this lobby! Choose a different name.");
        }
        currentGameCode = code;
        db.ref(`games/${code}/players/${myName}`).set({ alive: true, originalRole: "Unassigned", currentRole: "Unassigned", ready: false });
        showGame(code);
        saveSession();
    });
}

// ===== SHOW GAME =====
function showGame(code) {
    document.getElementById("setup").style.display = "none";
    document.getElementById("gameArea").style.display = "block";

    document.getElementById("displayCode").innerHTML =
        `Room Code: ${code} <span style="float:right;font-size:14px;font-weight:normal;color:#7f8c8d;">Playing as: <strong>${myName}</strong></span>`;

    if (isHost) {
        document.getElementById("startButton").style.display = "inline-block";
    }

    db.ref('games/' + code).on('value', (snapshot) => {
        const game = snapshot.val();
        if (game) updateUI(game);
    });
}

// ===== CHAT =====
function sendChat() {
    const input = document.getElementById("chatInput");
    const msg = input.value.trim();
    if (!msg || !currentGameCode) return;
    input.value = "";
    db.ref(`games/${currentGameCode}/chat`).push({
        name: myName,
        msg: msg,
        time: Date.now()
    });
    playClick();
}

// ===== WIN CONDITION =====
async function checkWinCondition(game) {
    const players = game.players || {};
    const votes = game.votes || {};

    const counts = {};
    Object.values(votes).forEach(t => counts[t] = (counts[t] || 0) + 1);
    let exiled = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, "Skip");

    let tannerExiled = false;
    if (exiled !== "Skip" && players[exiled] && players[exiled].currentRole === "Tanner") tannerExiled = true;

    let winner = "";
    if (tannerExiled) {
        winner = "Tanner";
    } else {
        let werewolfExiled = false;
        if (exiled !== "Skip" && players[exiled] && players[exiled].currentRole === "Werewolf") werewolfExiled = true;
        let totalWerewolves = 0;
        Object.keys(players).forEach(p => { if (players[p].currentRole === "Werewolf") totalWerewolves++; });
        if (totalWerewolves === 0) {
            winner = (exiled === "Skip") ? "Villagers" : "Werewolves";
        } else {
            winner = werewolfExiled ? "Villagers" : "Werewolves";
        }
    }

    // Record stats FIRST — wait for all transactions to complete
    await recordStats(game, winner, exiled);

    // Then update the phase (triggers updateUI → showStats with fresh data)
    db.ref(`games/${currentGameCode}`).update({ phase: "gameover", winner: winner, exiledPlayer: exiled });

    // Build night replay log
    buildNightReplay();
}

// ===== STATISTICS & ACHIEVEMENTS =====
async function recordStats(game, winner, exiled) {
    const players = game.players || {};
    const promises = Object.keys(players).map(p => {
        const role = players[p].currentRole;
        const isWinningTeam = (
            (winner === "Werewolves" && role === "Werewolf") ||
            (winner === "Villagers" && role !== "Werewolf" && role !== "Tanner") ||
            (winner === "Tanner" && role === "Tanner")
        );
        const statsRef = db.ref(`stats/${p.replace(/[.#$\/\[\]]/g, '_')}`);
        return statsRef.transaction(current => {
            if (!current) current = { games: 0, wins: 0, losses: 0, roles: {}, achievements: {} };
            current.games = (current.games || 0) + 1;
            if (isWinningTeam) current.wins = (current.wins || 0) + 1;
            else current.losses = (current.losses || 0) + 1;
            current.roles[role] = (current.roles[role] || 0) + 1;
            const ach = current.achievements || {};
            if (role === "Werewolf" && isWinningTeam) ach.loneWolf = true;
            if (role === "Tanner" && isWinningTeam) ach.tannerTriumph = true;
            if (exiled === p && role === "Tanner") ach.publicMenace = true;
            if (current.wins >= 5) ach.fiveTimeWinner = true;
            if (current.games >= 10) ach.veteran = true;
            if ((current.roles["Werewolf"] || 0) >= 3) ach.wolfPack = true;
            current.achievements = ach;
            return current;
        });
    });
    await Promise.all(promises);
}

function getAchievementBadges(achievements) {
    if (!achievements) return "";
    const badges = {
        loneWolf: "🐺 Lone Wolf", tannerTriumph: "🧑‍🌾 Tanner Triumph",
        publicMenace: "🔥 Public Menace", fiveTimeWinner: "🏆 Five-Time Winner",
        veteran: "🎖️ Veteran", wolfPack: "🐺🐺 Wolf Pack"
    };
    return Object.entries(achievements).filter(([,v]) => v).map(([key]) => {
        const label = badges[key] || key;
        return `<span class="badge badge-gold">${label}</span>`;
    }).join(" ");
}

function showStats() {
    const panel = document.getElementById("statsPanel");
    if (!panel) return;
    const content = document.getElementById("statsContent");
    const allPlayers = document.querySelectorAll("#playersUl li");
    let html = "<table><tr><th>Player</th><th>W/L</th><th>Badges</th></tr>";
    const names = Array.from(allPlayers).map(li => li.innerText.replace(" (You)", "").trim());
    let loaded = 0; const total = names.length;
    if (total === 0) { content.innerHTML = "<em>No players found.</em>"; panel.style.display = "block"; return; }
    names.forEach(name => {
        const safe = name.replace(/[.#$\/\[\]]/g, '_');
        db.ref(`stats/${safe}`).once('value', snap => {
            const s = snap.val();
            if (s) {
                const pct = s.games > 0 ? Math.round(s.wins / s.games * 100) : 0;
                html += `<tr><td>${name}</td><td>${s.wins}W / ${s.losses}L (${pct}%)</td><td>${getAchievementBadges(s.achievements)}</td></tr>`;
            } else {
                html += `<tr><td>${name}</td><td colspan="2">No games played yet</td></tr>`;
            }
            loaded++;
            if (loaded >= total) { html += "</table>"; content.innerHTML = html; panel.style.display = "block"; }
        });
    });
}

// ===== NIGHT REPLAY =====
function buildNightReplay() {
    const replayDiv = document.getElementById("nightReplay");
    const logDiv = document.getElementById("nightReplayLog");
    if (!replayDiv || !logDiv) return;
    db.ref(`games/${currentGameCode}/nightLog`).once('value', snap => {
        const log = snap.val();
        if (!log) { replayDiv.style.display = "none"; return; }
        let html = "";
        Object.values(log).forEach(entry => { html += `<div>${entry}</div>`; });
        logDiv.innerHTML = html;
        replayDiv.style.display = html ? "block" : "none";
    });
}

function logNightAction(msg) {
    if (!currentGameCode) return;
    db.ref(`games/${currentGameCode}/nightLog`).push(msg);
}

// ===== DYNAMIC BACKGROUND =====
let currentPhase = "";
function setPhaseBackground(phase) {
    if (phase === currentPhase) return;
    currentPhase = phase;
    const oldOverlay = document.getElementById("phaseOverlay");
    if (oldOverlay) oldOverlay.remove();

    // Swap video source based on phase
    const video = document.getElementById("bgVideo");
    if (video) {
        const sources = {
            "night": "images/background_night.mp4",
            "day": "images/background_day.mp4",
            "lobby": "images/background_lobby.mp4",
            "gameover": "images/background_lobby.mp4"
        };
        const src = sources[phase] || "images/background_lobby.mp4";
        if (video.dataset.currentSrc !== src) {
            video.dataset.currentSrc = src;
            video.querySelector("source").src = src;
            video.load();
            video.play().catch(() => {});
        }
    }
    if (phase === "gameover") {
        const overlay = document.createElement("div");
        overlay.id = "phaseOverlay";
        overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,215,0,0.2);z-index:-1;pointer-events:none;";
        document.body.appendChild(overlay);
    }

    // Update background music when phase changes
    startMusic(phase);
}

// ===== UPDATE UI =====
function updateUI(game) {
    setPhaseBackground(game.phase);

    // Player list
    const playersUl = document.getElementById("playersUl");
    playersUl.innerHTML = "";
    const isLobby = game.phase === "lobby";
    Object.keys(game.players || {}).forEach(p => {
        let li = document.createElement("li");
        const ready = game.players[p].ready;
        const readyIcon = ready ? "✅" : "⏳";
        const label = p === myName
            ? `<strong>${p} (You)</strong>`
            : ` ${p}`;
        li.innerHTML = isLobby
            ? `<span style="margin-right:6px;">${readyIcon}</span>${label}`
            : label;
        li.style.animation = "fadeIn 0.3s ease";
        playersUl.appendChild(li);
    });

    const status = document.getElementById("statusArea");
    const actions = document.getElementById("actionArea");
    const fixedHUD = document.getElementById("fixedRoleHUD");
    actions.innerHTML = "";
    // Clear cached night role and timer when leaving night phase
    if (game.phase !== "night") {
        cachedNightRole = "";
        if (nightTimerInterval) {
            clearInterval(nightTimerInterval);
            nightTimerInterval = null;
        }
    }
    if (game.phase !== "lobby") document.getElementById("startButton").style.display = "none";

    // HUD
    if (game.phase !== "lobby" && game.phase !== "gameover") {
        const myOrig = game.players?.[myName]?.originalRole || "Unassigned";
        fixedHUD.innerHTML = `<span style="font-size:11px;color:#7f8c8d;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${myName}</span>
            <hr style="margin:4px 0;border:0;border-top:1px solid #eee;">
            <strong>Your Card:</strong>
            <img src="${ROLE_IMAGES[myOrig]}" class="role-card-img card-flip" style="width:140px;height:187px;cursor:pointer;" alt="${myOrig}" onclick="showRoleInfo('${myOrig}')">
            <small style="cursor:pointer;" onclick="showRoleInfo('${myOrig}')">${myOrig} ℹ️</small>`;
        fixedHUD.style.display = "block";
    } else { fixedHUD.style.display = "none"; }

    // ===== GAMEOVER =====
    if (game.phase === "gameover") {
        if (lastSpokenPhase !== "gameover" && game.winner) {
            lastSpokenPhase = "gameover";
            playGameOverFanfare();
        }
        let html = `<h2 class="fade-in">Game Over! Victory for <span style="color:#d9534f;">${game.winner}</span>!</h2>`;
        html += `<p class="slide-up">Exiled: <strong>${game.exiledPlayer}</strong></p>`;

        // List winning players
        const allP = game.players || {};
        let winnersList = [];
        if (game.winner === "Werewolves") {
            winnersList = Object.keys(allP).filter(p => allP[p].currentRole === "Werewolf");
        } else if (game.winner === "Tanner") {
            winnersList = Object.keys(allP).filter(p => allP[p].currentRole === "Tanner");
        } else { // Villagers
            winnersList = Object.keys(allP).filter(p => allP[p].currentRole !== "Werewolf" && allP[p].currentRole !== "Tanner");
        }
        if (winnersList.length > 0) {
            html += `<p class="slide-up"><strong>🏆 Winners:</strong> ${winnersList.map(w => w === myName ? `<strong>${w} (You)</strong>` : w).join(", ")}</p>`;
        }

        // Show vote results to everyone
        if (game.voteResults) {
            html += `<div class="slide-up" style="margin:10px 0;padding:10px;background:rgba(0,0,0,0.03);border-radius:8px;"><strong>🗳️ Vote Results:</strong><br>`;
            Object.keys(game.voteResults).forEach(v => {
                const target = game.voteResults[v];
                const arrow = target === "Skip" ? "⏩ Skip" : `👤 ${target}`;
                html += `<span style="font-size:13px;">👤 ${v} → ${arrow}</span><br>`;
            });
            html += `</div>`;
        }

        html += `<h3>Final Roles:</h3><div style="display:flex;flex-wrap:wrap;gap:15px;justify-content:center;">`;
        Object.keys(game.players || {}).forEach((p, i) => {
            const role = game.players[p].currentRole;
            const av = "";
            html += `<div class="slide-up" style="text-align:center;border:1px solid #ccc;padding:10px;border-radius:8px;background:#fff;width:130px;animation-delay:${i*0.1}s;">
                <strong> ${p === myName ? `${p} (You)` : p}</strong><br>
                <img src="${ROLE_IMAGES[role]}" class="role-card-img card-flip" alt="${role}">
                <small style="color:#7f8c8d;">Started as ${game.players[p].originalRole}</small></div>`;
        });
        if (game.centerCards) {
            ["c1","c2","c3"].forEach((key, idx) => {
                const role = game.centerCards[key];
                html += `<div class="slide-up" style="text-align:center;border:1px solid #ffca28;padding:10px;border-radius:8px;background:#fffde7;width:130px;animation-delay:${(Object.keys(game.players||{}).length+idx)*0.1}s;">
                    <strong>Center ${idx+1}</strong><br>
                    <img src="${ROLE_IMAGES[role]}" class="role-card-img" alt="${role}"></div>`;
            });
        }
        html += `</div>`;
        if (isHost) html += `<br><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button onclick="rematch()" style="background:#2ecc71;color:white;font-size:16px;padding:10px 25px;">🔄 Rematch</button>
            <button onclick="cleanupGame()" style="background:#e74c3c;color:white;font-size:16px;padding:10px 25px;">🗑️ Close Game</button></div>`;
        status.innerHTML = html;

        buildNightReplay();
        showStats();
        return;
    }

    // ===== LOBBY =====
    if (game.phase === "lobby") {
        if (lastSpokenPhase !== "lobby") { lastSpokenPhase = "lobby"; }
        document.getElementById("chatBox").style.display = "none";
        document.getElementById("nightReplay").style.display = "none";
        if (isHost) document.getElementById("startButton").style.display = "inline-block";

        // Ready count
        const allPlayers = Object.keys(game.players || {});
        const totalPlayers = allPlayers.length;
        const readyCount = allPlayers.filter(p => game.players[p].ready).length;

        const instructBtn = "<button onclick=\"toggleInstructions()\" style=\"background:#9b59b6;color:white;font-size:14px;padding:8px 20px;border-radius:6px;border:none;cursor:pointer;margin-bottom:10px;\">📖 How to Play</button>";
        const rolesBtn = "<button onclick=\"showRoleGallery()\" style=\"background:#e67e22;color:white;font-size:14px;padding:8px 20px;border-radius:6px;border:none;cursor:pointer;margin-bottom:10px;margin-left:8px;\">🃏 Roles</button>";

        const amReady = game.players?.[myName]?.ready || false;
        const readyBtn = `<button onclick="toggleReady()" style="background:${amReady ? '#e74c3c' : '#2ecc71'};color:white;font-size:18px;padding:12px 30px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;margin-top:12px;">${amReady ? '❌ Not Ready' : '✅ Ready'}</button>`;

        const barWidth = totalPlayers > 0 ? Math.round((readyCount / totalPlayers) * 100) : 0;
        const progressBar = `<div style="background:#444;border-radius:10px;height:12px;width:80%;margin:10px auto;overflow:hidden;">
            <div style="background:#2ecc71;height:100%;width:${barWidth}%;border-radius:10px;transition:width 0.3s;"></div>
        </div>`;

        status.innerHTML = `
            <div style="text-align:center;">${instructBtn}${rolesBtn}</div>
            <div style="text-align:center;margin-top:14px;font-size:18px;font-weight:bold;">
                ${readyCount} / ${totalPlayers} Players Ready
            </div>
            ${progressBar}
            <div style="text-align:center;margin-top:6px;">${readyBtn}</div>
            <p style="text-align:center;color:#7f8c8d;margin:8px 0 0 0;font-size:13px;">Host can start once everyone is ready!</p>
        `;
    }

    // ===== DAY =====
    else if (game.phase === "day") {
        if (lastSpokenPhase !== "day") { lastSpokenPhase = "day"; playDayBell(); }
        document.getElementById("chatBox").style.display = "block";
        if (game.chat) {
            const chatDiv = document.getElementById("chatMessages");
            chatDiv.innerHTML = "";
            Object.values(game.chat).slice(-30).forEach(m => {
                chatDiv.innerHTML += `<div><strong>${m.name}:</strong> ${m.msg}</div>`;
            });
            chatDiv.scrollTop = chatDiv.scrollHeight;
        }
        let statusHtml = "<strong>🌅 It is DAY. Cast your ballot!</strong><br><br>";
        const votes = game.votes || {};
        const totalPlayers = Object.keys(game.players || {}).length;
        const votedCount = Object.keys(votes).length;

        if (isHost && votedCount === totalPlayers) {
            statusHtml += `<p>All votes in! <button onclick="revealVotes()" style="background:#e67e22;color:white;font-size:16px;padding:10px 25px;">🗳️ Reveal Votes</button></p>`;
        }
        statusHtml += `<p>📊 Votes: ${votedCount} / ${totalPlayers}</p>`;
        Object.keys(game.players || {}).forEach(p => {
            statusHtml += `<div class="vote-status fade-in"> ${p}: ${votes[p] ? "✅ Voted" : "⏳ Waiting..."}</div>`;
        });
        status.innerHTML = statusHtml;

        Object.keys(game.players || {}).forEach(p => {
                if (p !== myName) {
                    let btn = document.createElement("button");
                    btn.innerText = `🔴 ${p}`;
                    btn.style.backgroundColor = "#3498db"; btn.style.color = "white";
                    btn.className = "swipe-btn";
                    btn.onclick = () => { playVoteSound(); db.ref(`games/${currentGameCode}/votes/${myName}`).set(p); };
                    actions.appendChild(btn);
                }
            });
            let skipBtn = document.createElement("button");
            skipBtn.innerText = "⏩ Skip (Vote No One)";
            skipBtn.style.backgroundColor = "#f0ad4e"; skipBtn.style.color = "white";
            skipBtn.onclick = () => { playVoteSound(); db.ref(`games/${currentGameCode}/votes/${myName}`).set("Skip"); };
            actions.appendChild(skipBtn);
    }

    // ===== NIGHT =====
    else if (game.phase === "night") {
        if (lastSpokenPhase !== "night") { lastSpokenPhase = "night"; playNightAmbiance(); }
        document.getElementById("chatBox").style.display = "none";

        // Clear any old timer interval
        if (nightTimerInterval) {
            clearInterval(nightTimerInterval);
            nightTimerInterval = null;
        }

        const subPhase = game.nightSubPhase;
        // Cache the role at the start of night — prevents a robbed victim from seeing
        // the Robber UI (their currentRole changes in DB but they should not know it)
        if (!cachedNightRole) {
            cachedNightRole = game.players?.[myName]?.currentRole || "Unassigned";
        }
        const nightIdentity = cachedNightRole;
        const haveActed = game.nightDone && game.nightDone[myName];

        // ===== HOST: Manage sequential sub-phase progression =====
        if (isHost) {
            const allPlayersList = Object.keys(game.players || {});
            const subInfo = NIGHT_ORDER.find(n => n.phase === subPhase);
            const actingRoles = subInfo ? subInfo.roles : [];
            const actingPlayers = allPlayersList.filter(p => actingRoles.includes(game.players?.[p]?.originalRole));
            const doneActing = actingPlayers.filter(p => game.nightDone && game.nightDone[p]);
            const deadline = game.nightSubPhaseDeadline || 0;

            const allDone = actingPlayers.length > 0 && actingPlayers.every(p => doneActing.includes(p));
            const noActors = actingPlayers.length === 0;
            const expired = Date.now() > deadline;

            if (allDone || noActors || expired) {
                const updates = {};

                // Auto-complete any stragglers in this sub-phase
                actingPlayers.forEach(p => {
                    if (!(game.nightDone && game.nightDone[p])) {
                        updates[`games/${currentGameCode}/nightDone/${p}`] = true;
                    }
                });

                // Find the next phase that actually has players with that role — skip empty ones
                let currentIdx = NIGHT_ORDER.findIndex(n => n.phase === subPhase);
                let foundNext = false;

                while (currentIdx < NIGHT_ORDER.length - 1) {
                    currentIdx++;
                    const candidate = NIGHT_ORDER[currentIdx];
                    const candidateActors = allPlayersList.filter(p =>
                        candidate.roles.includes(game.players?.[p]?.originalRole)
                    );
                    if (candidateActors.length > 0) {
                        updates[`games/${currentGameCode}/nightSubPhase`] = candidate.phase;
                        updates[`games/${currentGameCode}/nightSubPhaseDeadline`] = Date.now() + candidate.time * 1000;
                        foundNext = true;
                        break;
                    }
                }

                if (!foundNext) {
                    // No more actors in any remaining phase — advance to day
                    allPlayersList.forEach(p => {
                        if (!(game.nightDone && game.nightDone[p])) {
                            updates[`games/${currentGameCode}/nightDone/${p}`] = true;
                        }
                    });
                    updates[`games/${currentGameCode}/phase`] = "day";
                    updates[`games/${currentGameCode}/nightSubPhase`] = null;
                    updates[`games/${currentGameCode}/nightSubPhaseDeadline`] = null;
                    updates[`games/${currentGameCode}/readyPlayers`] = null;
                }
                db.ref().update(updates).then(() => {
                    // Re-read fresh state from Firebase after write completes
                    db.ref(`games/${currentGameCode}`).once('value', snap => {
                        if (snap.val()) updateUI(snap.val());
                    });
                });
                status.innerHTML = `<div><strong>🌃 Night Phase</strong></div><p style="text-align:center;">Advancing...</p>`;
                actions.innerHTML = "";
                return;
            }
        }

        // ===== CLIENT DISPLAY =====
        if (!subPhase) {
            status.innerHTML = `<div><strong>🌃 Night Phase</strong></div><p>Getting ready...</p>`;
            actions.innerHTML = "";
            return;
        }

        const subInfo = NIGHT_ORDER.find(n => n.phase === subPhase);
        const isMyTurn = subInfo && subInfo.roles.includes(nightIdentity);
        const deadline = game.nightSubPhaseDeadline || Date.now();
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

        // Only the acting player sees the timer and sub-phase label
        const timerColor = remaining <= 5 ? '#e74c3c' : (remaining <= 10 ? '#f39c12' : '#f1c40f');
        const timerHtml = `<div id="nightTimer" style="text-align:center;font-size:36px;font-weight:bold;color:${timerColor};margin:4px 0;">⏱️ ${remaining}s</div>`;
        const phaseLabel = subInfo ? subInfo.roles.join("/") : "???";

        if (isMyTurn && !haveActed) {
            let sHtml = `<div><strong>🌃 Night Phase</strong></div>${timerHtml}`;
            sHtml += `<div style="text-align:center;font-size:14px;color:#bdc3c7;margin-bottom:6px;">👁️ <strong>${phaseLabel}</strong> phase</div>`;
            status.innerHTML = sHtml + `<div style="text-align:center;font-size:15px;margin-bottom:4px;">🎭 Your turn as ${nightIdentity}</div>`;
            actions.innerHTML = "";

            // Start local countdown timer — auto-completes when it hits 0
            const deadlineMs = deadline;
            nightTimerInterval = setInterval(() => {
                const timerEl = document.getElementById("nightTimer");
                if (!timerEl) return;
                const secs = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
                timerEl.textContent = `⏱️ ${secs}s`;
                timerEl.style.color = secs <= 5 ? '#e74c3c' : (secs <= 10 ? '#f39c12' : '#f1c40f');
                if (secs <= 0) {
                    clearInterval(nightTimerInterval);
                    nightTimerInterval = null;
                    if (!haveActed) {
                        completeNightAction();
                    }
                }
            }, 500);

            const addBtn = (text, cls, cb) => { let b = document.createElement("button"); b.innerText = text; b.className = cls; b.onclick = cb; actions.appendChild(b); return b; };
            const p = game.players || {};
            const allPlayers = Object.keys(p);

            if (nightIdentity === "Villager" || nightIdentity === "Tanner") {
                if (nightIdentity === "Tanner") status.innerHTML += "<p>🧑‍🌾 Your goal: be voted out during the day!</p>";
                addBtn("😴 Sleep", "night-btn swipe-btn", () => { playClick(); completeNightAction(); });
            }
            else if (nightIdentity === "Werewolf") {
                let allies = allPlayers.filter(x => x !== myName && p[x]?.originalRole === "Werewolf");
                sHtml = status.innerHTML;
                status.innerHTML = sHtml + (allies.length
                    ? `<p>🐺 Fellow Wolves: <strong>${allies.map(a => ""+a).join(", ")}</strong></p>`
                    : "<p>🐺 You are a lone wolf.</p>");
                addBtn("🐺 Acknowledge", "night-btn swipe-btn", () => { playClick(); completeNightAction(); });
            }
            else if (nightIdentity === "Seer") {
                let seerHtml = status.innerHTML + "<p>🔮 Inspect a player <em>or</em> 2 center cards:</p>";
                status.innerHTML = seerHtml;
                allPlayers.forEach(n => {
                    if (n !== myName) addBtn(`🔍 ${n}`, "swipe-btn", () => {
                        playCardFlipSound();
                        alert(`${n} holds: ${p[n].currentRole}`);
                        logNightAction(`🔮 Seer inspected ${n} → ${p[n].currentRole}`);
                        completeNightAction();
                    });
                });
                ["c1","c2","c3"].forEach((c, idx) => {
                    addBtn(`🎴 Center ${idx+1}`, "swipe-btn", () => {
                        if (!seerFirstCenterSelection) { seerFirstCenterSelection = c; playCardFlipSound(); alert(`First card: ${game.centerCards[c]}. Pick another!`); }
                        else if (seerFirstCenterSelection !== c) { playCardFlipSound(); alert(`Second card: ${game.centerCards[c]}`); logNightAction(`🔮 Seer viewed 2 center cards`); completeNightAction(); }
                    });
                });
            }
            else if (nightIdentity === "Robber") {
                status.innerHTML += "<p>🕵️ Rob a player:</p>";
                allPlayers.forEach(n => {
                    if (n !== myName) addBtn(`💰 ${n}`, "swipe-btn", () => {
                        let u = {}; u[`games/${currentGameCode}/players/${myName}/currentRole`] = p[n].currentRole;
                        u[`games/${currentGameCode}/players/${n}/currentRole`] = "Robber";
                        db.ref().update(u).then(() => { playCardFlipSound(); alert(`You stole ${n}'s card! You are now: ${p[n].currentRole}`); logNightAction(`🕵️ Robber stole from ${n} → ${p[n].currentRole}`); completeNightAction(); });
                    });
                });
            }
            else if (nightIdentity === "Troublemaker") {
                status.innerHTML += "<p>⚡ Swap 2 other players' cards:</p>";
                allPlayers.forEach(n => {
                    if (n !== myName) addBtn((tmFirstSelection===n?"✅ ":"")+" "+n, "swipe-btn", () => {
                        if (!tmFirstSelection) { tmFirstSelection = n; playClick(); updateUI(game); }
                        else if (tmFirstSelection !== n) {
                            let u = {}; u[`games/${currentGameCode}/players/${tmFirstSelection}/currentRole`] = p[n].currentRole;
                            u[`games/${currentGameCode}/players/${n}/currentRole`] = p[tmFirstSelection].currentRole;
                            db.ref().update(u).then(() => { playCardFlipSound(); alert(`Swapped ${tmFirstSelection} ↔ ${n}!`); logNightAction(`⚡ Troublemaker swapped ${tmFirstSelection} ↔ ${n}`); completeNightAction(); });
                        }
                    });
                });
            }
            else if (nightIdentity === "Insomniac") {
                status.innerHTML += "<p>🌙 Check your final card:</p>";
                addBtn("👁️ Peek", "night-btn swipe-btn", () => {
                    const finalRole = game.players[myName].currentRole;
                    playCardFlipSound(); alert(`Your final card: ${finalRole}`);
                    status.innerHTML += `<div style="text-align:center;"><img src="${ROLE_IMAGES[finalRole]}" class="role-card-img card-flip" style="width:100px;"><br><strong>${finalRole}</strong></div>`;
                    logNightAction(`🌙 Insomniac saw → ${finalRole}`); completeNightAction();
                });
            }

            const hint = document.createElement("div");
            hint.className = "swipe-hint"; hint.innerText = "👆 Tap to choose";
            actions.appendChild(hint);
        } else {
            // Not my turn, or already acted — no timer shown to other players
            if (haveActed) {
                status.innerHTML = `<div><strong>🌃 Night Phase</strong></div><p style="text-align:center;">✅ Done! Waiting for others...</p>`;
            } else {
                status.innerHTML = `<div><strong>🌃 Night Phase</strong></div><p style="text-align:center;">⏳ Waiting for other players...</p>`;
            }
            actions.innerHTML = "";
        }
    }
}

// ===== VOTE REVEAL =====
function revealVotes() {
    if (!isHost || !currentGameCode) return;
    db.ref(`games/${currentGameCode}`).once('value', snap => {
        const game = snap.val();
        if (!game || !game.votes) return;
        const votes = game.votes;

        // Write vote results to Firebase so everyone can see them
        let voteList = {};
        Object.keys(votes).forEach(voter => {
            voteList[voter] = votes[voter];
        });
        db.ref(`games/${currentGameCode}/voteResults`).set(voteList).then(() => {
            checkWinCondition(game);
        });
    });
}

// ===== COMPLETE NIGHT ACTION =====
function completeNightAction() { db.ref(`games/${currentGameCode}/nightDone/${myName}`).set(true); playClick(); }

// ===== CLEANUP =====
function cleanupGame() {
    if (!currentGameCode) return;
    if (isHost) db.ref('games/' + currentGameCode).remove();
    document.getElementById("gameArea").style.display = "none";
    document.getElementById("setup").style.display = "block";
    document.getElementById("chatBox").style.display = "none";
    document.getElementById("nightReplay").style.display = "none";
    document.getElementById("statsPanel").style.display = "none";
    clearSession();
    currentGameCode = ""; myName = ""; isHost = false; gameStarting = false; gameStarted = false;
    tmFirstSelection = ""; seerFirstCenterSelection = "";
}

// ===== REMATCH =====
function rematch() {
    if (!isHost || !currentGameCode) return;
    tmFirstSelection = ""; seerFirstCenterSelection = "";
    gameStarted = false;
    db.ref(`games/${currentGameCode}/players`).once('value', snap => {
        const players = snap.val();
        if (!players) return;
        let updates = {};
        Object.keys(players).forEach(p => {
            updates[`games/${currentGameCode}/players/${p}/originalRole`] = "Unassigned";
            updates[`games/${currentGameCode}/players/${p}/currentRole`] = "Unassigned";
            updates[`games/${currentGameCode}/players/${p}/ready`] = false;
        });
        updates[`games/${currentGameCode}/phase`] = "lobby";
        updates[`games/${currentGameCode}/votes`] = null;
        updates[`games/${currentGameCode}/readyPlayers`] = null;
        updates[`games/${currentGameCode}/centerCards`] = null;
        updates[`games/${currentGameCode}/winner`] = null;
        updates[`games/${currentGameCode}/exiledPlayer`] = null;
        updates[`games/${currentGameCode}/voteResults`] = null;
        updates[`games/${currentGameCode}/nightLog`] = null;
        db.ref().update(updates).then(() => {
            var btn = document.getElementById("startButton");
            if (btn) { btn.style.display = "inline-block"; btn.disabled = false; btn.style.opacity = "1"; }
        });
    });
}

// ===== TOGGLE READY =====
function toggleReady() {
    if (!currentGameCode) return;
    const ref = db.ref(`games/${currentGameCode}/players/${myName}/ready`);
    ref.transaction(current => !current);
}

// ===== START GAME =====
function startGame() {
    if (!isHost || gameStarting) return;
    gameStarting = true;
    var startBtn = document.getElementById("startButton");
    if (startBtn) { startBtn.disabled = true; startBtn.style.opacity = "0.5"; }

    // Check player count and readiness before playing howl
    db.ref(`games/${currentGameCode}/players`).once('value', snap => {
        const playerData = snap.val();
        let players = Object.keys(playerData);
        if (players.length < 3) {
            gameStarting = false;
            if (startBtn) { startBtn.disabled = false; startBtn.style.opacity = "1"; }
            return alert("Need at least 3 players!");
        }
        if (players.length > 20) {
            gameStarting = false;
            if (startBtn) { startBtn.disabled = false; startBtn.style.opacity = "1"; }
            return alert("Maximum 20 players allowed!");
        }
        // Check all players are ready
        const allReady = players.every(p => playerData[p]?.ready === true);
        if (!allReady) {
            gameStarting = false;
            if (startBtn) { startBtn.disabled = false; startBtn.style.opacity = "1"; }
            return alert("Not all players are ready yet! Waiting for everyone to hit ✅ Ready.");
        }

        playClick();
        // Play wolf howl sound effect and wait for it to finish
        try {
            const howl = new Audio('music/Wolf_howl.mp3');
            howl.volume = 0.9;
            howl.play().catch(() => {});
            howl.onended = () => proceedStartGame();
            setTimeout(() => proceedStartGame(), 2000);
        } catch(e) {
            proceedStartGame();
        }
    });
}

function proceedStartGame() {
    if (gameStarted) return;

    // Read players fresh from Firebase — avoids stale data if someone joined during the howl delay
    db.ref(`games/${currentGameCode}/players`).once('value', snap => {
        let players = Object.keys(snap.val());
        if (players.length < 3) return;
        if (players.length > 20) return;

        gameStarted = true;
        gameStarting = false;

        // Build a deck large enough for up to 20 players (20 players + 3 center = 23 cards)
        let baseDeck = [
            "Werewolf","Werewolf",
            "Seer","Robber","Troublemaker",
            "Tanner","Insomniac",
            "Villager","Villager","Villager","Villager","Villager",
            "Villager","Villager","Villager","Villager","Villager",
            "Villager","Villager","Villager","Villager","Villager",
            "Villager","Villager"
        ];
        let deck = baseDeck.slice(0, players.length + 3);
        deck.sort(() => Math.random() - 0.5);
        tmFirstSelection = ""; seerFirstCenterSelection = "";
        let updates = {};
        updates[`games/${currentGameCode}/phase`] = "night";
        updates[`games/${currentGameCode}/votes`] = null;
        updates[`games/${currentGameCode}/readyPlayers`] = null;
        updates[`games/${currentGameCode}/nightLog`] = null;
        updates[`games/${currentGameCode}/nightDone`] = null;
        updates[`games/${currentGameCode}/nightSubPhase`] = "werewolf";
        updates[`games/${currentGameCode}/nightSubPhaseDeadline`] = Date.now() + 30000;
        players.forEach((p, i) => {
            updates[`games/${currentGameCode}/players/${p}/originalRole`] = deck[i];
            updates[`games/${currentGameCode}/players/${p}/currentRole`] = deck[i];
        });
        updates[`games/${currentGameCode}/centerCards/c1`] = deck[players.length];
        updates[`games/${currentGameCode}/centerCards/c2`] = deck[players.length + 1];
        updates[`games/${currentGameCode}/centerCards/c3`] = deck[players.length + 2];
        db.ref().update(updates);
    });
}

// ===== BACKGROUND MUSIC (MP3 File) =====
let musicEnabled = true;
let musicAudio = null;
let musicPhase = "";
let musicPendingPhase = null;

function toggleMusic() {
    musicEnabled = !musicEnabled;
    const btn = document.getElementById("musicToggle");
    if (btn) btn.innerText = musicEnabled ? "🎵 Music ON" : "🎵 Music";
    if (!musicEnabled) stopMusic();
    else if (musicPhase) startMusic(musicPhase);
    else if (musicPendingPhase) startMusic(musicPendingPhase);
}

function stopMusic() {
    if (musicAudio) {
        musicAudio.pause();
        musicAudio.currentTime = 0;
    }
}

function startMusic(phase) {
    musicPendingPhase = phase;
    if (phase === musicPhase && musicAudio && !musicAudio.paused) return;
    musicPhase = phase;
    stopMusic();
    if (!musicEnabled) return;

    musicAudio = new Audio('music/Background_music.mp3');
    musicAudio.loop = true;
    musicAudio.volume = 0.2;

    if (phase === "lobby") musicAudio.playbackRate = 1.0;
    else if (phase === "night") musicAudio.playbackRate = 0.8;
    else if (phase === "day") musicAudio.playbackRate = 1.2;
    else if (phase === "gameover") musicAudio.playbackRate = 1.0;

    // Browser blocks autoplay — attempt to play, retry on first user click if blocked
    musicAudio.play().catch(() => {
        // Autoplay blocked — will be retried on user gesture below
    });
}

// Retry music playback on first user gesture (browsers require user interaction for audio)
document.addEventListener('click', function initAudio() {
    if (musicAudio && musicAudio.paused && musicEnabled) {
        musicAudio.play().catch(() => {});
    }
    document.removeEventListener('click', initAudio);
}, { once: true });

// Try to start background music on page load (may be blocked by browser)
startMusic("lobby");

// ===== RECONNECT ON REFRESH =====
async function tryReconnect() {
    const savedCode = localStorage.getItem("onw_gameCode");
    const savedName = localStorage.getItem("onw_playerName");
    const savedHost = localStorage.getItem("onw_isHost");
    if (!savedCode || !savedName) return;

    const snapshot = await db.ref('games/' + savedCode).once('value');
    if (!snapshot.exists()) {
        clearSession();
        console.log("🐺 Saved game room no longer exists — session cleared.");
        return;
    }
    const game = snapshot.val();

    // If the player was removed by a disconnect, re-add them
    if (!game.players || !game.players[savedName]) {
        isHost = savedHost === "true";
        // Re-add the player with default data
        const playerData = { alive: true, originalRole: "Unassigned", currentRole: "Unassigned", ready: false };
        await db.ref(`games/${savedCode}/players/${savedName}`).set(playerData);
        // If the original host disconnected, restore them as host
        if (isHost && game.host !== savedName) {
            await db.ref(`games/${savedCode}/host`).set(savedName);
        }
        console.log(`🐺 Re-added ${savedName} to game ${savedCode}`);
    }

    // Reconnect!
    currentGameCode = savedCode;
    myName = savedName;
    isHost = savedHost === "true";
    gameStarted = game.phase !== "lobby";

    // Re-establish onDisconnect so the host can survive another refresh
    if (isHost) {
        db.ref(`games/${savedCode}/players/${savedName}`).onDisconnect().remove();
    }

    showGame(savedCode);
    console.log(`🐺 Reconnected to game ${savedCode} as ${savedName}`);
}

// ===== MOBILE TOUCH SUPPORT =====
document.addEventListener("touchstart", () => {}, { passive: true });

tryReconnect();
// ===== HOW TO PLAY =====
function toggleInstructions() {
    const panel = document.getElementById("instructionsPanel");
    const overlay = document.getElementById("instructionsOverlay");
    if (!panel) return;
    const shown = panel.style.display === "block";
    panel.style.display = shown ? "none" : "block";
    overlay.style.display = shown ? "none" : "block";
}
function closeInstructions() {
    const panel = document.getElementById("instructionsPanel");
    const overlay = document.getElementById("instructionsOverlay");
    if (panel) panel.style.display = "none";
    if (overlay) overlay.style.display = "none";
}