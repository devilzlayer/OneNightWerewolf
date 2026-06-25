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

// Selection temporary storage tracking state variables for Night Action Cycles
let tmFirstSelection = "";
let seerFirstCenterSelection = "";

// Image Asset Mapping using your local folder path references with fast loading .webp files
const ROLE_IMAGES = {
    "Werewolf": "images/werewolf.webp",
    "Seer": "images/seer.webp",
    "Robber": "images/robber.webp",
    "Troublemaker": "images/troublemaker.webp",
    "Villager": "images/villager.webp",
    "Unassigned": "images/card-back.webp" 
};

// Create Game Room Handler
function createGame() {
    myName = document.getElementById("playerName").value.trim();
    if (!myName) return alert("Enter a name!");
    
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    currentGameCode = code; 
    isHost = true;

    db.ref('games/' + code).set({
        host: myName,
        players: { [myName]: { alive: true, originalRole: "Unassigned", currentRole: "Unassigned" } },
        phase: "lobby"
    });
    showGame(code);
}

// Join Game Room Handler with Taken Name Validations
function joinGame() {
    const code = document.getElementById("gameCode").value.trim();
    myName = document.getElementById("playerName").value.trim();
    if (!code || !myName) return alert("Enter Name and Code!");

    db.ref('games/' + code).once('value', (snapshot) => {
        if (snapshot.exists()) {
            const game = snapshot.val();
            
            // Condition check: Abort entry if name matches someone already initialized in room pool
            if (game.players && game.players[myName]) {
                return alert("This name is already taken in this lobby! Choose a different name.");
            }

            currentGameCode = code;
            db.ref(`games/${code}/players/${myName}`).set({ alive: true, originalRole: "Unassigned", currentRole: "Unassigned" });
            showGame(code);
        } else {
            alert("Game room not found!");
        }
    });
}

function showGame(code) {
    document.getElementById("setup").style.display = "none";
    document.getElementById("gameArea").style.display = "block";
    
    // Displays the Room Code along with the player's identity at the top of the UI
    document.getElementById("displayCode").innerHTML = `Room Code: ${code} <span style="float: right; font-size: 16px; font-weight: normal; color: #7f8c8d;">Playing as: <strong>${myName}</strong></span>`;

    if (isHost) {
        document.getElementById("startButton").style.display = "inline-block";
    }

    db.ref('games/' + code).on('value', (snapshot) => {
        const game = snapshot.val();
        if (game) updateUI(game);
    });
}

// Compiles and evaluates final voting tallies under authentic One Night mechanics
function checkWinCondition(game) {
    const players = game.players || {};
    const votes = game.votes || {};
    
    const counts = {};
    Object.values(votes).forEach(t => counts[t] = (counts[t] || 0) + 1);
    let exiled = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, "Skip");

    let werewolfExiled = false;
    if (exiled !== "Skip" && players[exiled] && players[exiled].currentRole === "Werewolf") {
        werewolfExiled = true;
    }

    let totalWerewolves = 0;
    Object.keys(players).forEach(p => {
        if (players[p].currentRole === "Werewolf") totalWerewolves++;
    });

    let winner = "";
    if (totalWerewolves === 0) {
        winner = (exiled === "Skip") ? "Villagers" : "Werewolves (You executed an innocent Villager!)";
    } else {
        winner = werewolfExiled ? "Villagers" : "Werewolves";
    }

    db.ref(`games/${currentGameCode}/phase`).set("gameover");
    db.ref(`games/${currentGameCode}/winner`).set(winner);
    db.ref(`games/${currentGameCode}/exiledPlayer`).set(exiled);
}

function updateUI(game) {
    const playersUl = document.getElementById("playersUl");
    playersUl.innerHTML = "";
    Object.keys(game.players || {}).forEach(p => {
        let li = document.createElement("li");
        // Emphasize the current user in the lobby player list view
        li.innerHTML = p === myName ? `<strong>${p} (You)</strong>` : p;
        playersUl.appendChild(li);
    });

    const status = document.getElementById("statusArea");
    const actions = document.getElementById("actionArea");
    const fixedHUD = document.getElementById("fixedRoleHUD");
    actions.innerHTML = ""; 

    if (game.phase !== "lobby") {
        document.getElementById("startButton").style.display = "none";
    }

    // Persistent Left-Corner HUD UI Rendering Rule with Player Name Inclusion
    if (game.phase !== "lobby" && game.phase !== "gameover") {
        const myOriginalRole = (game.players && game.players[myName]) ? game.players[myName].originalRole : "Unassigned";
        const hudImgUrl = ROLE_IMAGES[myOriginalRole] || ROLE_IMAGES["Unassigned"];
        
        fixedHUD.innerHTML = `<span style="font-size: 11px; color: #7f8c8d; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">👤 ${myName}</span>
                              <hr style="margin: 4px 0; border: 0; border-top: 1px solid #eee;">
                              <strong>Your Card:</strong>
                              <img src="${hudImgUrl}" style="width: 90px; height: 120px; object-fit: cover; border-radius: 6px; display: block; margin: 5px auto; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" alt="${myOriginalRole}">
                              <small>${myOriginalRole}</small>`;
        fixedHUD.style.display = "block";
    } else {
        fixedHUD.style.display = "none";
    }

    // Phase: Game Over Termination Scoreboard
    if (game.phase === "gameover") {
        let endingHtml = `<h2>Game Over! Victory for the <span style="color: #d9534f;">${game.winner}</span>!</h2>`;
        endingHtml += `<p>Exiled Player: <strong>${game.exiledPlayer}</strong></p><h3>Final Swapped Roles Revealed:</h3><div style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: center;">`;
        
        Object.keys(game.players).forEach(p => {
            const currentRole = game.players[p].currentRole;
            const imgUrl = ROLE_IMAGES[currentRole] || ROLE_IMAGES["Unassigned"];
            endingHtml += `<div style="text-align: center; border: 1px solid #ccc; padding: 10px; border-radius: 8px; background: #fff; width: 130px;">
                            <strong>${p === myName ? `${p} (You)` : p}</strong><br>
                            <img src="${imgUrl}" class="role-card-img" alt="${currentRole}">
                            <small style="color:#7f8c8d;">Started as: ${game.players[p].originalRole}</small>
                           </div>`;
        });
        
        if (game.centerCards) {
            ["c1", "c2", "c3"].forEach((key, idx) => {
                const role = game.centerCards[key];
                const imgUrl = ROLE_IMAGES[role] || ROLE_IMAGES["Unassigned"];
                endingHtml += `<div style="text-align: center; border: 1px solid #ffca28; padding: 10px; border-radius: 8px; background-color: #fffde7; width: 130px;">
                                <strong>Center Pool ${idx + 1}</strong><br>
                                <img src="${imgUrl}" class="role-card-img" alt="${role}">
                               </div>`;
            });
        }
        
        endingHtml += `</div>`;
        status.innerHTML = endingHtml;
        return; 
    }

    if (game.phase === "lobby") {
        status.innerText = "Waiting inside the lobby for the host to initialize configuration parameters...";
    } 
    // Phase: Day Chat Debate and Accusation Execution Cycle
    else if (game.phase === "day") {
        let statusHtml = "<strong>🌅 It is DAY. Debate the swapped card layouts and cast your ballot!</strong><br><br>";
        
        const votes = game.votes || {};
        let totalPlayersCount = Object.keys(game.players).length;
        
        Object.keys(game.players).forEach(p => {
            const target = votes[p];
            statusHtml += `👤 ${p}: ${target ? `Voted for ➡️ <strong>${target}</strong>` : "⏳ <em>Thinking...</em>"}<br>`;
        });
        status.innerHTML = statusHtml;

        if (isHost && Object.keys(votes).length === totalPlayersCount) {
            checkWinCondition(game);
            return;
        }
        
        Object.keys(game.players).forEach(p => {
            if (p !== myName) {
                let btn = document.createElement("button");
                btn.style.backgroundColor = "#3498db";
                btn.style.color = "white";
                btn.innerText = "Accuse " + p;
                btn.onclick = () => { db.ref(`games/${currentGameCode}/votes/${myName}`).set(p); };
                actions.appendChild(btn);
            }
        });

        let skipBtn = document.createElement("button");
        skipBtn.innerText = "⏩ Skip (Vote No One)";
        skipBtn.style.backgroundColor = "#f0ad4e";
        skipBtn.style.color = "white";
        skipBtn.onclick = () => { db.ref(`games/${currentGameCode}/votes/${myName}`).set("Skip"); };
        actions.appendChild(skipBtn);
    } 
    // Phase: Night Interactive Actions Flow Loop
    else if (game.phase === "night") {
        const myOriginalRole = (game.players && game.players[myName]) ? game.players[myName].originalRole : "Unassigned";
        const hasDoneAction = game.readyPlayers && game.readyPlayers[myName];

        let statusHtml = `<div><strong>🌃 Night Phase: Execute your secret operation task before waking up.</strong></div>`;
        status.innerHTML = statusHtml;

        if (hasDoneAction) {
            actions.innerHTML = "<em>Waiting for remaining participants to finalize operation tasks...</em>";
        } else {
            if (myOriginalRole === "Villager") {
                let btn = document.createElement("button");
                btn.innerText = "Sleep (No night actions)";
                btn.className = "night-btn";
                btn.onclick = () => completeNightAction();
                actions.appendChild(btn);
            } 
            else if (myOriginalRole === "Werewolf") {
                let allies = [];
                Object.keys(game.players).forEach(p => {
                    if (p !== myName && game.players[p].originalRole === "Werewolf") allies.push(p);
                });
                let info = allies.length > 0 ? `<p>🐺 Fellow Werewolves: <strong>${allies.join(", ")}</strong></p>` : "<p>🐺 You are a lone wolf.</p>";
                status.innerHTML += info;

                let btn = document.createElement("button");
                btn.innerText = "Acknowledge Setup";
                btn.className = "night-btn";
                btn.onclick = () => completeNightAction();
                actions.appendChild(btn);
            } 
            else if (myOriginalRole === "Seer") {
                status.innerHTML += "<p>🔮 Choose 1 player to view their card, OR inspect 2 center cards:</p>";
                
                Object.keys(game.players).forEach(p => {
                    if (p !== myName) {
                        let btn = document.createElement("button");
                        btn.innerText = "Inspect " + p;
                        btn.onclick = () => {
                            alert(`${p} is currently hiding the: ${game.players[p].currentRole} card.`);
                            completeNightAction();
                        };
                        actions.appendChild(btn);
                    }
                });

                ["c1", "c2", "c3"].forEach((c, idx) => {
                    let btn = document.createElement("button");
                    btn.innerText = "Inspect Center " + (idx + 1);
                    btn.onclick = () => {
                        if (!seerFirstCenterSelection) {
                            seerFirstCenterSelection = c;
                            alert(`First Card evaluated: ${game.centerCards[c]}. Now choose a second center card!`);
                        } else {
                            if (seerFirstCenterSelection === c) return alert("Select a different option!");
                            alert(`Second Card evaluated: ${game.centerCards[c]}`);
                            completeNightAction();
                        }
                    };
                    actions.appendChild(btn);
                });
            } 
            else if (myOriginalRole === "Robber") {
                status.innerHTML += "<p>🕵️‍♂️ Choose a player to steal their card and assume their identity:</p>";
                
                Object.keys(game.players).forEach(p => {
                    if (p !== myName) {
                        let btn = document.createElement("button");
                        btn.innerText = "Rob " + p;
                        btn.onclick = () => {
                            const victimRole = game.players[p].currentRole;
                            let updates = {};
                            updates[`games/${currentGameCode}/players/${myName}/currentRole`] = victimRole;
                            updates[`games/${currentGameCode}/players/${p}/currentRole`] = "Robber";
                            
                            db.ref().update(updates).then(() => {
                                alert(`You successfully robbed ${p}! You are now secretly a: ${victimRole}`);
                                completeNightAction();
                            });
                        };
                        actions.appendChild(btn);
                    }
                });
            } 
            else if (myOriginalRole === "Troublemaker") {
                status.innerHTML += "<p>⚡ Choose two other players to swap their cards without looking:</p>";
                
                Object.keys(game.players).forEach(p => {
                    if (p !== myName) {
                        let btn = document.createElement("button");
                        btn.innerText = (tmFirstSelection === p ? "✅ " : "") + p;
                        btn.onclick = () => {
                            if (!tmFirstSelection) {
                                tmFirstSelection = p;
                                updateUI(game);
                            } else {
                                if (tmFirstSelection === p) return alert("Pick a different target!");
                                
                                const p1 = tmFirstSelection;
                                const p2 = p;
                                const r1 = game.players[p1].currentRole;
                                const r2 = game.players[p2].currentRole;

                                let updates = {};
                                updates[`games/${currentGameCode}/players/${p1}/currentRole`] = r2;
                                updates[`games/${currentGameCode}/players/${p2}/currentRole`] = r1;

                                db.ref().update(updates).then(() => {
                                    alert(`Successfully swapped cards belonging to ${p1} and ${p2}!`);
                                    completeNightAction();
                                });
                            }
                        };
                        actions.appendChild(btn);
                    }
                });
            }
        }

        if (isHost && game.readyPlayers && Object.keys(game.readyPlayers).length === Object.keys(game.players).length) {
            db.ref(`games/${currentGameCode}`).update({
                phase: "day",
                readyPlayers: null
            });
        }
    }
}

function completeNightAction() {
    db.ref(`games/${currentGameCode}/readyPlayers/${myName}`).set(true);
}

function startGame() {
    if (!isHost) return;
    db.ref(`games/${currentGameCode}/players`).once('value', (snap) => {
        let players = Object.keys(snap.val());
        
        // Enforce strict player limit rule validation checks
        if (players.length < 3) {
            return alert("You need at least 3 players to start a valid card configuration session!");
        }

        // Setup base dynamic script deck
        let baseDeck = [
            "Werewolf", "Seer", "Robber", "Troublemaker", "Werewolf",
            "Villager", "Villager", "Villager", "Villager", "Villager", 
            "Villager", "Villager", "Villager", "Villager", "Villager"
        ];
        let deck = baseDeck.slice(0, players.length + 3);
        
        deck.sort(() => Math.random() - 0.5);

        // Clear layout state variables cache safely
        tmFirstSelection = "";
        seerFirstCenterSelection = "";

        let updates = {};
        updates[`games/${currentGameCode}/phase`] = "night";
        updates[`games/${currentGameCode}/votes`] = null;
        updates[`games/${currentGameCode}/readyPlayers`] = null;
        
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