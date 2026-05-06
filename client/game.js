const socket = io("http://127.0.0.1:3000");

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: "#1a1a1a",

    physics: {
        default: "arcade"
    },

    scene: {
        preload,
        create,
        update
    }
};

const game = new Phaser.Game(config);

let player;
let otherPlayers;

let bullets;
let enemyBullets;

let cursors;

let playerName = "";

let gameStarted = false;

let lives = 3;
let kills = 0;

let livesText;
let killsText;

let menuContainer;

let shootHandler;

let nameInput;

function preload() {

    this.load.image(
        "player",
        "https://labs.phaser.io/assets/sprites/phaser-dude.png"
    );

    this.load.image(
        "bullet",
        "assets/bullet.png"
    );
}

function create() {

    createMenu(this);

    setupSocketEvents(this);
}

function setupSocketEvents(scene) {

    socket.removeAllListeners();

    // CURRENT PLAYERS
    socket.on("currentPlayers", (players) => {

        if (!gameStarted) return;

        Object.keys(players).forEach((id) => {

            if (id === socket.id) return;

            createOrUpdatePlayer(
                scene,
                id,
                players[id]
            );
        });
    });

    // NEW PLAYER
    socket.on("newPlayer", (data) => {

        if (!gameStarted) return;

        createOrUpdatePlayer(
            scene,
            data.id,
            data.player
        );
    });

    // MOVEMENT
    socket.on("playerMoved", (data) => {

        if (!gameStarted) return;

        otherPlayers.getChildren().forEach((p) => {

            if (p.playerId === data.id) {

                p.setPosition(
                    data.x,
                    data.y
                );

                p.nameText.setPosition(
                    data.x - 20,
                    data.y - 40
                );
            }
        });
    });

    // BULLETS
    socket.on("bulletFired", (data) => {

        if (!gameStarted) return;

        if (data.id === socket.id) return;

        const bullet = enemyBullets.create(
            data.x,
            data.y,
            "bullet"
        );

        bullet.ownerId = data.id;

        // MOVE BULLET
        scene.physics.moveTo(
            bullet,
            data.targetX,
            data.targetY,
            500
        );

        // ROTATE BULLET
        bullet.rotation =
            Phaser.Math.Angle.Between(
                data.x,
                data.y,
                data.targetX,
                data.targetY
            );

        setTimeout(() => {

            if (bullet) bullet.destroy();

        }, 2000);
    });

    // HIT
    socket.on("playerHit", (data) => {

        if (!gameStarted) return;

        if (data.id === socket.id) {

            lives = data.lives;

            livesText.setText(
                "Lives: " + lives
            );

            player.setPosition(
                400,
                300
            );

            if (lives <= 0) {

                gameOver(scene);
            }
        }
    });

    // KILLS
    socket.on("killUpdate", (data) => {

        if (!gameStarted) return;

        if (data.id === socket.id) {

            kills = data.kills;

            killsText.setText(
                "Kills: " + kills
            );
        }
    });

    // DISCONNECT
    socket.on("playerDisconnected", (id) => {

        if (!gameStarted) return;

        otherPlayers.getChildren().forEach((p) => {

            if (p.playerId === id) {

                p.nameText.destroy();

                p.destroy();
            }
        });
    });
}

function startGame(scene) {

    gameStarted = true;

    if (menuContainer)
        menuContainer.destroy();

    player = scene.physics.add.sprite(
        400,
        300,
        "player"
    );

    player.setCollideWorldBounds(true);

    player.nameText = scene.add.text(
        player.x - 20,
        player.y - 40,
        playerName,
        {
            fontSize: "18px",
            fill: "#ffffff"
        }
    );

    otherPlayers = scene.add.group();

    bullets = scene.physics.add.group({
        defaultKey: "bullet",
        maxSize: 30
    });

    enemyBullets =
        scene.physics.add.group();

    cursors =
        scene.input.keyboard.createCursorKeys();

    livesText = scene.add.text(
        16,
        16,
        "Lives: 3",
        {
            fontSize: "24px",
            fill: "#ff4444"
        }
    );

    killsText = scene.add.text(
        16,
        50,
        "Kills: 0",
        {
            fontSize: "24px",
            fill: "#00ff00"
        }
    );

    shootHandler = (pointer) => {

        if (!gameStarted) return;

        shootBullet(scene, pointer);
    };

    scene.input.on(
        "pointerdown",
        shootHandler
    );

    scene.physics.add.overlap(
        player,
        enemyBullets,
        hitByBullet,
        null,
        scene
    );

    socket.emit(
        "playerJoined",
        {
            name: playerName
        }
    );

    socket.emit("requestPlayers");
}

function update() {

    if (!gameStarted) return;

    player.setVelocity(0);

    if (cursors.left.isDown)
        player.setVelocityX(-200);

    if (cursors.right.isDown)
        player.setVelocityX(200);

    if (cursors.up.isDown)
        player.setVelocityY(-200);

    if (cursors.down.isDown)
        player.setVelocityY(200);

    player.nameText.setPosition(
        player.x - 20,
        player.y - 40
    );

    socket.emit(
        "playerMovement",
        {
            x: player.x,
            y: player.y
        }
    );
}

function shootBullet(scene, pointer) {

    const bullet = bullets.get(
        player.x,
        player.y
    );

    if (!bullet) return;

    bullet.setActive(true);
    bullet.setVisible(true);

    bullet.body.enable = true;

    // MOVE BULLET
    scene.physics.moveTo(
        bullet,
        pointer.worldX,
        pointer.worldY,
        500
    );

    // ROTATE BULLET
    bullet.rotation =
        Phaser.Math.Angle.Between(
            player.x,
            player.y,
            pointer.worldX,
            pointer.worldY
        );

    socket.emit(
        "shootBullet",
        {
            x: player.x,
            y: player.y,
            targetX: pointer.worldX,
            targetY: pointer.worldY
        }
    );

    setTimeout(() => {

        bullet.setActive(false);
        bullet.setVisible(false);

        bullet.body.enable = false;

    }, 2000);
}

function hitByBullet(playerObj, bullet) {

    if (bullet.ownerId === socket.id)
        return;

    bullet.destroy();

    lives--;

    livesText.setText(
        "Lives: " + lives
    );

    socket.emit(
        "playerHit",
        {
            lives: lives
        }
    );

    socket.emit(
        "playerKill",
        {
            killerId: bullet.ownerId
        }
    );

    player.setPosition(
        400,
        300
    );
}

function createOrUpdatePlayer(
    scene,
    id,
    playerInfo
) {

    let exists = false;

    otherPlayers.getChildren().forEach((p) => {

        if (p.playerId === id) {

            exists = true;
        }
    });

    if (exists) return;

    const otherPlayer =
        scene.add.sprite(
            playerInfo.x,
            playerInfo.y,
            "player"
        );

    otherPlayer.playerId = id;

    otherPlayer.nameText =
        scene.add.text(
            playerInfo.x - 20,
            playerInfo.y - 40,
            playerInfo.name || "Player",
            {
                fontSize: "18px",
                fill: "#ffffff"
            }
        );

    otherPlayers.add(otherPlayer);
}

function createMenu(scene) {

    // REMOVE OLD MENU
    if (menuContainer)
        menuContainer.destroy();

    // REMOVE OLD INPUT
    if (nameInput)
        nameInput.remove();

    // REMOVE OLD WHEEL EVENTS
    scene.input.off("wheel");

    // BACKGROUND
    const bg = scene.add.rectangle(
        400,
        300,
        800,
        600,
        0x000000
    );

    // TITLE
    const title = scene.add.text(
        400,
        90,
        "Phaser Shooter",
        {
            fontSize: "52px",
            fill: "#00ff00",
            fontStyle: "bold"
        }
    );

    title.setOrigin(0.5);

    // LEADERBOARD TITLE
    const leaderboardTitle =
        scene.add.text(
            400,
            160,
            "Leaderboard",
            {
                fontSize: "34px",
                fill: "#ffff00",
                fontStyle: "bold"
            }
        );

    leaderboardTitle.setOrigin(0.5);

    // LEADERBOARD FRAME
    const leaderboardFrame =
        scene.add.rectangle(
            400,
            330,
            430,
            250,
            0x222222
        );

    leaderboardFrame.setStrokeStyle(
        4,
        0xffff00
    );

    // MASK GRAPHICS
    const maskShape =
        scene.make.graphics();

    maskShape.fillRect(
        185,
        210,
        430,
        230
    );

    const mask =
        maskShape.createGeometryMask();

    // LEADERBOARD CONTAINER
    const leaderboardContainer =
        scene.add.container(
            0,
            0
        );

    leaderboardContainer.setMask(
        mask
    );

    // SCROLL DATA
    let scrollY = 0;

    let maxScroll = 0;

    // UPDATE LEADERBOARD
    function updateLeaderboard(data) {

        leaderboardContainer.removeAll(
            true
        );

        let y = 220;

        // NO DATA
        if (
            !data ||
            data.length === 0
        ) {

            const noData =
                scene.add.text(
                    400,
                    y,
                    "No Scores Yet",
                    {
                        fontSize:
                            "24px",
                        fill:
                            "#ffffff"
                    }
                );

            noData.setOrigin(0.5);

            leaderboardContainer.add(
                noData
            );

            return;
        }

        // PLAYER LIST
        data.forEach(
            (player, index) => {

                let color =
                    "#ffffff";

                // TOP 3 COLORS
                if (index === 0) {

                    color =
                        "#FFD700";

                } else if (
                    index === 1
                ) {

                    color =
                        "#C0C0C0";

                } else if (
                    index === 2
                ) {

                    color =
                        "#CD7F32";
                }

                // MEDALS
                let rankText =
                    `${index + 1}.`;

                if (index === 0)
                    rankText = "🥇";

                if (index === 1)
                    rankText = "🥈";

                if (index === 2)
                    rankText = "🥉";

                const entry =
                    scene.add.text(
                        400,
                        y,
                        `${rankText} ${player.name} - ${player.kills} Kills`,
                        {
                            fontSize:
                                "26px",

                            fill:
                                color,

                            fontStyle:
                                index < 3
                                    ? "bold"
                                    : "normal"
                        }
                    );

                entry.setOrigin(0.5);

                leaderboardContainer.add(
                    entry
                );

                y += 42;
            }
        );

        // DYNAMIC SCROLL
        const contentHeight =
            data.length * 42;

        maxScroll = Math.max(
            0,
            contentHeight - 180
        );
    }

    // SCROLLING
    scene.input.on(
        "wheel",
        (
            pointer,
            gameObjects,
            deltaX,
            deltaY
        ) => {

            // ONLY INSIDE FRAME
            if (
                pointer.x < 185 ||
                pointer.x > 615 ||
                pointer.y < 210 ||
                pointer.y > 440
            ) {
                return;
            }

            scrollY -= deltaY * 0.5;

            scrollY = Phaser.Math.Clamp(
                scrollY,
                -maxScroll,
                0
            );

            leaderboardContainer.y =
                scrollY;
        }
    );
    
    scene.input.off(
        "pointerdown",
        shootHandler
    );

    // REMOVE OLD LISTENER
    socket.off(
        "leaderboardData"
    );

    // LIVE LEADERBOARD
    socket.on(
        "leaderboardData",
        (data) => {

            updateLeaderboard(
                data
            );
        }
    );

    // REQUEST LEADERBOARD
    socket.emit(
        "getLeaderboard"
    );

    // NAME INPUT
    nameInput =
        document.createElement(
            "input"
        );

    nameInput.type = "text";

    nameInput.placeholder =
        "Enter Name";

    nameInput.style.position =
        "absolute";

    nameInput.style.top =
        "470px";

    nameInput.style.left =
        "50%";

    nameInput.style.transform =
        "translateX(-50%)";

    nameInput.style.padding =
        "12px";

    nameInput.style.fontSize =
        "20px";

    nameInput.style.borderRadius =
        "8px";

    nameInput.style.border =
        "none";

    nameInput.style.outline =
        "none";

    document.body.appendChild(
        nameInput
    );

    // PLAY BUTTON
    const playButton =
        scene.add.text(
            400,
            560,
            "PLAY",
            {
                fontSize: "32px",

                fill: "#ffffff",

                backgroundColor:
                    "#008800",

                padding: {
                    x: 25,
                    y: 12
                }
            }
        );

    playButton.setOrigin(0.5);

    playButton.setInteractive();

    // HOVER EFFECT
    playButton.on(
        "pointerover",
        () => {

            playButton.setStyle({
                backgroundColor:
                    "#00aa00"
            });
        }
    );

    playButton.on(
        "pointerout",
        () => {

            playButton.setStyle({
                backgroundColor:
                    "#008800"
            });
        }
    );

    // START GAME
    playButton.on(
        "pointerdown",
        () => {

            if (
                nameInput.value.trim() ===
                ""
            ) return;

            playerName =
                nameInput.value;

            // REMOVE INPUT
            nameInput.remove();

            nameInput = null;

            startGame(scene);
        }
    );

    // MENU CONTAINER
    menuContainer =
        scene.add.container(
            0,
            0,
            [
                bg,
                title,
                leaderboardTitle,
                leaderboardFrame,
                leaderboardContainer,
                playButton
            ]
        );
}

function gameOver(scene) {

    gameStarted = false;

    socket.emit("leaveGame");

    scene.input.off(
        "pointerdown",
        shootHandler
    );

    if (player) {

        player.nameText.destroy();

        player.destroy();
    }

    if (livesText)
        livesText.destroy();

    if (killsText)
        killsText.destroy();

    if (otherPlayers) {

        otherPlayers
            .getChildren()
            .forEach((p) => {

                p.nameText.destroy();

                p.destroy();
            });
    }

    if (bullets)
        bullets.clear(true, true);

    if (enemyBullets)
        enemyBullets.clear(true, true);

    lives = 3;

    kills = 0;

    createMenu(scene);
}