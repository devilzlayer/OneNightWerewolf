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

// Image Asset Mapping
const ROLE_IMAGES = {
    "Werewolf": "images/Werewolf.webp", "Seer": "images/Seer.webp",
    "Robber": "images/Robber.webp", "Troublemaker": "images/Troublemaker.webp",
    "Villager": "images/Villager.webp", "Tanner": "images/Tanner.webp",
    "Insomniac": "images/Insomniac.webp",
    "Unassigned": "images/Unassigned.webp"
};

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

// ===== TEXT TO SPEECH =====
let ttsEnabled = true;
let ttsVoices = [];
function initTTS() {
    ttsVoices = window.speechSynthesis.getVoices();
    if (ttsVoices.length === 0) {
        window.speechSynthesis.onvoiceschanged = () => { ttsVoices = window.speechSynthesis.getVoices(); };
    }
}
initTTS();
function speak(text) {
    if (!ttsEnabled || !text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.8; utterance.pitch = 0.2; utterance.volume = 1;
    const deepVoice = ttsVoices.find(v => v.name.includes("Alex") || v.name.includes("Fred") || v.name.includes("Bruce") || v.name.includes("Male") || v.name.includes("Daniel"));
    if (deepVoice) utterance.voice = deepVoice;
    try { window.speechSynthesis.speak(utterance); } catch(e) {}
}

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
        players: { [myName]: { alive: true, originalRole: "Unassigned", currentRole: "Unassigned" } },

        phase: "lobby",
        chat: {},
        nightLog: {}
    });
    db.ref('games/' + code).onDisconnect().remove();
    showGame(code);
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
        db.ref(`games/${code}/players/${myName}`).set({ alive: true, originalRole: "Unassigned", currentRole: "Unassigned" });
        showGame(code);
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
function checkWinCondition(game) {
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

    db.ref(`games/${currentGameCode}`).update({ phase: "gameover", winner: winner, exiledPlayer: exiled });

    // Record stats
    recordStats(game, winner, exiled);

    // Build night replay log
    buildNightReplay();
}

// ===== STATISTICS & ACHIEVEMENTS =====
function recordStats(game, winner, exiled) {
    const players = game.players || {};
    Object.keys(players).forEach(p => {
        const role = players[p].currentRole;
        const isWinningTeam = (
            (winner === "Werewolves" && role === "Werewolf") ||
            (winner === "Villagers" && role !== "Werewolf" && role !== "Tanner") ||
            (winner === "Tanner" && role === "Tanner")
        );
        const statsRef = db.ref(`stats/${p.replace(/[.#$\/\[\]]/g, '_')}`);
        statsRef.transaction(current => {
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
    Object.keys(game.players || {}).forEach(p => {
        let li = document.createElement("li");
        const label = p === myName ? `<strong>${p} (You)</strong>` : ` ${p}`;
        li.innerHTML = label;
        li.style.animation = "fadeIn 0.3s ease";
        playersUl.appendChild(li);
    });

    const status = document.getElementById("statusArea");
    const actions = document.getElementById("actionArea");
    const fixedHUD = document.getElementById("fixedRoleHUD");
    actions.innerHTML = "";
    if (game.phase !== "lobby") document.getElementById("startButton").style.display = "none";

    // HUD
    if (game.phase !== "lobby" && game.phase !== "gameover") {
        const myOrig = game.players?.[myName]?.originalRole || "Unassigned";
        fixedHUD.innerHTML = `<span style="font-size:11px;color:#7f8c8d;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${myName}</span>
            <hr style="margin:4px 0;border:0;border-top:1px solid #eee;">
            <strong>Your Card:</strong>
            <img src="${ROLE_IMAGES[myOrig]}" class="role-card-img card-flip" style="width:90px;height:120px;" alt="${myOrig}">
            <small>${myOrig}</small>`;
        fixedHUD.style.display = "block";
    } else { fixedHUD.style.display = "none"; }

    // ===== GAMEOVER =====
    if (game.phase === "gameover") {
        if (lastSpokenPhase !== "gameover" && game.winner) {
            lastSpokenPhase = "gameover";
            speak(`Game Over! Victory for the ${game.winner}`);
            playGameOverFanfare();
        }
        let html = `<h2 class="fade-in">Game Over! Victory for <span style="color:#d9534f;">${game.winner}</span>!</h2>`;
        html += `<p class="slide-up">Exiled: <strong>${game.exiledPlayer}</strong></p>`;

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
        if (lastSpokenPhase !== "lobby") { lastSpokenPhase = "lobby"; speak("Waiting in the lobby for the host to start the game."); }
        status.innerText = "Waiting in the lobby for the host to start the game...";
        document.getElementById("chatBox").style.display = "none";
        document.getElementById("nightReplay").style.display = "none";
        if (isHost) document.getElementById("startButton").style.display = "inline-block";
    }

    // ===== DAY =====
    else if (game.phase === "day") {
        if (lastSpokenPhase !== "day") { lastSpokenPhase = "day"; speak("It is Day. Cast your ballot!"); playDayBell(); }
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
        if (lastSpokenPhase !== "night") { lastSpokenPhase = "night"; speak("Night Phase. Close your eyes."); playNightAmbiance(); }
        document.getElementById("chatBox").style.display = "none";
        const myOrig = game.players?.[myName]?.originalRole || "Unassigned";
        const hasDone = game.readyPlayers && game.readyPlayers[myName];
        let sHtml = `<div><strong>🌃 Night Phase</strong></div>`;
        status.innerHTML = sHtml;
        if (hasDone) { actions.innerHTML = "<em>Waiting for other players...</em>"; }

        else {
            const addBtn = (text, cls, cb) => { let b = document.createElement("button"); b.innerText = text; b.className = cls; b.onclick = cb; actions.appendChild(b); return b; };
            const p = game.players || {};
            const allPlayers = Object.keys(p);

            if (myOrig === "Villager" || myOrig === "Tanner") {
                if (myOrig === "Tanner") status.innerHTML += "<p>🧑‍🌾 Your goal: be voted out during the day!</p>";
                addBtn("😴 Sleep", "night-btn swipe-btn", () => { playClick(); completeNightAction(); });
            }
            else if (myOrig === "Werewolf") {
                let allies = allPlayers.filter(x => x !== myName && p[x]?.originalRole === "Werewolf");
                status.innerHTML += allies.length
                    ? `<p>🐺 Fellow Wolves: <strong>${allies.map(a => ""+a).join(", ")}</strong></p>`
                    : "<p>🐺 You are a lone wolf.</p>";
                addBtn("🐺 Acknowledge", "night-btn swipe-btn", () => { playClick(); completeNightAction(); });
            }
            else if (myOrig === "Seer") {
                status.innerHTML += "<p>🔮 Inspect a player or 2 center cards:</p>";
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
            else if (myOrig === "Robber") {
                status.innerHTML += "<p>🕵️ Rob a player:</p>";
                allPlayers.forEach(n => {
                    if (n !== myName) addBtn(`💰 ${n}`, "swipe-btn", () => {
                        let u = {}; u[`games/${currentGameCode}/players/${myName}/currentRole`] = p[n].currentRole;
                        u[`games/${currentGameCode}/players/${n}/currentRole`] = "Robber";
                        db.ref().update(u).then(() => { playCardFlipSound(); alert(`You stole ${n}'s card! You are now: ${p[n].currentRole}`); logNightAction(`🕵️ Robber stole from ${n} → ${p[n].currentRole}`); completeNightAction(); });
                    });
                });
            }
            else if (myOrig === "Troublemaker") {
                status.innerHTML += "<p>⚡ Swap 2 players' cards:</p>";
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
            else if (myOrig === "Insomniac") {
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
        }

        if (isHost && game.readyPlayers && Object.keys(game.readyPlayers).length === Object.keys(game.players || {}).length) {
            db.ref(`games/${currentGameCode}`).update({ phase: "day", readyPlayers: null });
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
function completeNightAction() { db.ref(`games/${currentGameCode}/readyPlayers/${myName}`).set(true); playClick(); }

// ===== CLEANUP =====
function cleanupGame() {
    if (!currentGameCode) return;
    if (isHost) db.ref('games/' + currentGameCode).remove();
    document.getElementById("gameArea").style.display = "none";
    document.getElementById("setup").style.display = "block";
    document.getElementById("chatBox").style.display = "none";
    document.getElementById("nightReplay").style.display = "none";
    document.getElementById("statsPanel").style.display = "none";
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

// ===== START GAME =====
function startGame() {
    if (!isHost || gameStarting) return;
    gameStarting = true;
    var startBtn = document.getElementById("startButton");
    if (startBtn) { startBtn.disabled = true; startBtn.style.opacity = "0.5"; }

    // Check player count first before playing howl
    db.ref(`games/${currentGameCode}/players`).once('value', snap => {
        let players = Object.keys(snap.val());
        if (players.length < 3) {
            gameStarting = false;
            if (startBtn) { startBtn.disabled = false; startBtn.style.opacity = "1"; }
            return alert("Need at least 3 players!");
        }

        speak("The game is starting! Close your eyes.");
        playClick();
        // Play wolf howl sound effect and wait for it to finish
        try {
            const howl = new Audio('music/Wolf_howl.mp3');
            howl.volume = 0.9;
            howl.play().catch(() => {});
            howl.onended = () => proceedStartGame(players);
            setTimeout(() => proceedStartGame(players), 2000);
        } catch(e) {
            proceedStartGame(players);
        }
    });
}

function proceedStartGame(players) {
    if (gameStarted) return;
    gameStarted = true;
    gameStarting = false;
    if (players.length < 3) return;
    let baseDeck = [
        "Werewolf","Werewolf","Seer","Robber","Troublemaker",
        "Tanner","Insomniac",
        "Villager","Villager","Villager","Villager","Villager",
        "Villager","Villager","Villager","Villager"
    ];
    let deck = baseDeck.slice(0, players.length + 3);
    deck.sort(() => Math.random() - 0.5);
    tmFirstSelection = ""; seerFirstCenterSelection = "";
    let updates = {};
    updates[`games/${currentGameCode}/phase`] = "night";
    updates[`games/${currentGameCode}/votes`] = null;
    updates[`games/${currentGameCode}/readyPlayers`] = null;
    updates[`games/${currentGameCode}/nightLog`] = null;
    players.forEach((p, i) => {
        updates[`games/${currentGameCode}/players/${p}/originalRole`] = deck[i];
        updates[`games/${currentGameCode}/players/${p}/currentRole`] = deck[i];
    });
    updates[`games/${currentGameCode}/centerCards/c1`] = deck[players.length];
    updates[`games/${currentGameCode}/centerCards/c2`] = deck[players.length + 1];
    updates[`games/${currentGameCode}/centerCards/c3`] = deck[players.length + 2];
    db.ref().update(updates);
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

// ===== MOBILE TOUCH SUPPORT =====
document.addEventListener("touchstart", () => {}, { passive: true });

console.log("🐺 One Night Werewolf — All features loaded!");