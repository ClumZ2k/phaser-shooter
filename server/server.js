require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { Redis } =
    require("@upstash/redis");

const app = express();

const server =
    http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "https://phaser-shooter.hirenmudaliar2.workers.dev/"
    }
});

const redis = new Redis({
    url:
        process.env
            .UPSTASH_REDIS_REST_URL,

    token:
        process.env
            .UPSTASH_REDIS_REST_TOKEN
});

let players = {};

// SEND PLAYER COUNT
function sendPlayerCount() {

    let count = 0;

    for (const id in players) {

        if (players[id].inGame) {

            count++;
        }
    }

    io.emit(
        "playerCount",
        count
    );
}

io.on("connection", (socket) => {

    console.log(
        "CONNECTED:",
        socket.id
    );
    sendPlayerCount();

    // REQUEST PLAYERS
    socket.on(
        "requestPlayers",
        () => {

            const activePlayers = {};

            for (const id in players) {

                if (
                    players[id].inGame
                ) {

                    activePlayers[id] =
                        players[id];
                }
            }

            socket.emit(
                "currentPlayers",
                activePlayers
            );
        }
    );

    // PLAYER JOINED GAME
    socket.on(
        "playerJoined",
        (data) => {

            // CREATE OR RESET PLAYER
            players[socket.id] = {

                x: 400,
                y: 300,

                lives: 3,

                kills:
                    players[socket.id]
                        ?.kills || 0,

                name: data.name,

                inGame: true
            };

            // SEND EXISTING PLAYERS
            const activePlayers = {};

            for (const id in players) {

                if (
                    players[id].inGame
                ) {

                    activePlayers[id] =
                        players[id];
                }
            }

            socket.emit(
                "currentPlayers",
                activePlayers
            );

            
            // SEND NEW PLAYER TO OTHERS
            socket.broadcast.emit(
                "newPlayer",
                {
                    id: socket.id,
                    player:
                        players[socket.id]
                }
            );
            sendPlayerCount();
        }
    );

    // MOVEMENT
    socket.on(
        "playerMovement",
        (data) => {

            if (
                !players[socket.id]
            ) return;

            if (
                !players[socket.id]
                    .inGame
            ) return;

            players[socket.id].x =
                data.x;

            players[socket.id].y =
                data.y;

            socket.broadcast.emit(
                "playerMoved",
                {
                    id: socket.id,
                    x: data.x,
                    y: data.y
                }
            );
        }
    );

    // SHOOT
    socket.on(
        "shootBullet",
        (data) => {

            if (
                !players[socket.id]
            ) return;

            if (
                !players[socket.id]
                    .inGame
            ) return;

            socket.broadcast.emit(
                "bulletFired",
                {
                    id: socket.id,
                    x: data.x,
                    y: data.y,
                    targetX:
                        data.targetX,
                    targetY:
                        data.targetY
                }
            );
        }
    );

    // PLAYER HIT
    socket.on(
        "playerHit",
        (data) => {

            if (
                !players[socket.id]
            ) return;

            players[socket.id]
                .lives = data.lives;

            io.emit(
                "playerHit",
                {
                    id: socket.id,
                    lives:
                        data.lives
                }
            );
        }
    );

    // PLAYER KILL
    socket.on(
        "playerKill",
        async (data) => {

            const killer =
                players[
                    data.killerId
                ];

            if (!killer) return;

            // ADD KILL
            killer.kills++;

            // SAVE TO REDIS
            await redis.hset(
                "kills",
                {
                    [data.killerId]:
                        JSON.stringify({
                            name:
                                killer.name,
                            kills:
                                killer.kills
                        })
                }
            );

            // SEND KILL UPDATE
            io.emit(
                "killUpdate",
                {
                    id:
                        data.killerId,
                    kills:
                        killer.kills
                }
            );

            // REBUILD LEADERBOARD
            const dataFromRedis =
                await redis.hgetall(
                    "kills"
                );

            let leaderboard = [];

            for (const id in dataFromRedis) {

                let parsed;

                if (
                    typeof dataFromRedis[
                        id
                    ] === "string"
                ) {

                    try {

                        parsed =
                            JSON.parse(
                                dataFromRedis[
                                    id
                                ]
                            );

                    } catch {

                        continue;
                    }

                } else {

                    parsed =
                        dataFromRedis[id];
                }

                if (
                    !parsed ||
                    !parsed.name
                ) continue;

                leaderboard.push({
                    name:
                        parsed.name,
                    kills:
                        parsed.kills
                });
            }

            // REMOVE DUPLICATES
            const unique = [];

            const names =
                new Set();

            leaderboard.forEach(
                (player) => {

                    if (
                        !names.has(
                            player.name
                        )
                    ) {

                        names.add(
                            player.name
                        );

                        unique.push(
                            player
                        );
                    }
                }
            );

            // SORT
            unique.sort(
                (a, b) =>
                    b.kills -
                    a.kills
            );

            // SEND LIVE LEADERBOARD
            io.emit(
                "leaderboardData",
                unique
            );
        }
    );

    // LEADERBOARD
    socket.on(
        "getLeaderboard",
        async () => {

            const data =
                await redis.hgetall(
                    "kills"
                );

            let leaderboard = [];

            for (const id in data) {

                let parsed;

                // HANDLE STRING OR OBJECT
                if (
                    typeof data[id] ===
                    "string"
                ) {

                    try {

                        parsed = JSON.parse(
                            data[id]
                        );

                    } catch {

                        continue;
                    }

                } else {

                    parsed = data[id];
                }

                // SKIP INVALID DATA
                if (
                    !parsed ||
                    !parsed.name ||
                    parsed.name ===
                        "undefined"
                ) {
                    continue;
                }

                // ONLY SHOW PLAYERS
                if (
                    parsed.kills ===
                    undefined
                ) {
                    continue;
                }

                leaderboard.push({
                    name:
                        parsed.name,
                    kills:
                        parsed.kills
                });
            }

            // REMOVE DUPLICATES
            const unique =
                [];

            const names =
                new Set();

            leaderboard.forEach(
                (player) => {

                    if (
                        !names.has(
                            player.name
                        )
                    ) {

                        names.add(
                            player.name
                        );

                        unique.push(
                            player
                        );
                    }
                }
            );

            // SORT
            unique.sort(
                (a, b) =>
                    b.kills -
                    a.kills
            );

            socket.emit(
                "leaderboardData",
                unique
            );
        }
    );

    // LEAVE GAME
    socket.on(
        "leaveGame",
        () => {

            if (
                !players[socket.id]
            ) return;

            players[socket.id]
                .inGame = false;

            io.emit(
                "playerDisconnected",
                socket.id
            );
            sendPlayerCount();
        }
    );

    // DISCONNECT
    socket.on(
        "disconnect",
        () => {

            console.log(
                "DISCONNECTED:",
                socket.id
            );

            delete players[
                socket.id
            ];

            io.emit(
                "playerDisconnected",
                socket.id
            );
            sendPlayerCount();
        }
    );
});

server.listen(3000, () => {

    console.log(
        "SERVER RUNNING ON PORT 3000"
    );
});