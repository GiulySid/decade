/**
 * arkanoid.js (BONUS level 10.5)
 * Arkanoid / Brick Breaker bonus mini-game.
 *
 * Controls:
 * - Left/Right or A/D: move paddle
 * - Space: launch ball (also relaunch after losing a life)
 *
 * Win:
 * - Clear all bricks => "STAGE CLEAR!" then MINIGAME_END success:true
 *
 * Lose:
 * - Ball falls below paddle => lose a life
 * - Lives reach 0 => "GAME OVER" then auto-restart after ~2500ms
 *
 * Debug:
 * - '*' (NumpadMultiply or Shift+8) => instant win
 */

(function() {
    'use strict';

    const GAME_ID = 'arkanoid';

    function createArkanoid(levelConfig) {
        const cfg = (levelConfig && levelConfig.config) || {};

        const DIFFICULTY = cfg.difficulty ?? 2.4;
        const START_LIVES = cfg.lives ?? 3;
        const PADDLE_SPEED = cfg.paddleSpeed ?? 520; // px/s
        const BALL_SPEED_BASE = cfg.ballSpeed ?? 320;
        const BALL_SPEED_MAX = cfg.ballSpeedMax ?? 520;
        const BRICK_ROWS = cfg.brickRows ?? 6;
        const BRICK_COLS = cfg.brickCols ?? 10;
        const POWERUP_CHANCE = cfg.powerupChance ?? 0.18;

        const _ctx = CanvasRenderer.getContext();
        const _canvas = CanvasRenderer.getCanvas();

        let _running = false;
        let _paused = false;
        let _raf = null;
        let _lastTs = 0;
        let _startMs = 0;

        const _keys = {};
        let _keyDownHandler = null;
        let _keyUpHandler = null;

        const _timeouts = new Set();

        // State
        let _status = 'READY'; // READY | PLAYING | CLEAR | GAME_OVER
        let _score = 0;
        let _lives = START_LIVES;

        // Powerups (simple)
        const powerups = []; // falling pickups
        const activePowerups = []; // {type, msLeft}

        // Layout
        const PAD = 24;
        const TOP_UI = 44;
        const BOTTOM_UI = 34;
        const PLAY_X = PAD;
        const PLAY_Y = TOP_UI;
        const PLAY_W = _canvas.width - PAD * 2;
        const PLAY_H = _canvas.height - TOP_UI - BOTTOM_UI;

        // Paddle
        const paddle = {
            x: PLAY_X + PLAY_W / 2,
            y: PLAY_Y + PLAY_H - 18,
            w: 120,
            h: 12
        };

        // Ball
        const ball = {
            x: paddle.x,
            y: paddle.y - 14,
            r: 6,
            vx: 0,
            vy: 0,
            speed: BALL_SPEED_BASE,
            launched: false
        };

        // Bricks: {x,y,w,h,hp,color}
        let bricks = [];
        let _bricksRemaining = 0;

        function _setTimeout(fn, ms) {
            const id = setTimeout(() => {
                _timeouts.delete(id);
                fn();
            }, ms);
            _timeouts.add(id);
            return id;
        }

        function _clearTimeouts() {
            _timeouts.forEach((id) => clearTimeout(id));
            _timeouts.clear();
        }

        function _now() {
            return performance.now();
        }

        function _clamp(v, min, max) {
            return Math.max(min, Math.min(max, v));
        }

        function _rectsOverlap(a, b) {
            return (
                a.x < b.x + b.w &&
                a.x + a.w > b.x &&
                a.y < b.y + b.h &&
                a.y + a.h > b.y
            );
        }

        function _syncHud() {
            if (typeof StateManager === 'undefined') return;
            const powerList = activePowerups.map(p => p.type);
            const elapsedSec = _startMs ? Math.max(0, (_now() - _startMs) / 1000) : 0;
            StateManager.updateLevelData({
                status: _status,
                score: _score,
                lives: _lives,
                bricksRemaining: _bricksRemaining,
                activePowerups: powerList,
                time: elapsedSec
            });
        }

        function _addScore(points) {
            _score += points;
            if (typeof StateManager !== 'undefined' && StateManager.addScore) {
                StateManager.addScore(points);
            }
            _syncHud();
        }

        function _resetPaddleAndBall() {
            paddle.x = PLAY_X + PLAY_W / 2;

            // Base width scales with difficulty (harder => smaller)
            const baseW = 138 - DIFFICULTY * 12; // ~109 at 2.4
            paddle.w = _clamp(Math.floor(baseW), 84, 150);

            ball.speed = _clamp(BALL_SPEED_BASE + (DIFFICULTY - 1.5) * 26, 260, BALL_SPEED_MAX);
            ball.launched = false;
            ball.vx = 0;
            ball.vy = 0;
            ball.x = paddle.x;
            ball.y = paddle.y - 14;
        }

        function _resetBricks() {
            bricks = [];
            _bricksRemaining = 0;

            const gridPadX = 10;
            const gridTop = PLAY_Y + 18;
            const gridW = PLAY_W - gridPadX * 2;
            const bw = Math.floor((gridW - (BRICK_COLS - 1) * 6) / BRICK_COLS);
            const bh = 16;
            const gapX = 6;
            const gapY = 6;
            const startX = PLAY_X + gridPadX + Math.floor((gridW - (BRICK_COLS * bw + (BRICK_COLS - 1) * gapX)) / 2);

            // Strong brick chance grows with difficulty
            const strongChance = _clamp((DIFFICULTY - 2.0) * 0.22, 0, 0.35);

            const rowColors = ['#4cc9f0', '#4895ef', '#4361ee', '#7209b7', '#b5179e', '#f72585'];

            for (let r = 0; r < BRICK_ROWS; r++) {
                for (let c = 0; c < BRICK_COLS; c++) {
                    const x = startX + c * (bw + gapX);
                    const y = gridTop + r * (bh + gapY);
                    const strong = Math.random() < strongChance;
                    const hp = strong ? 2 : 1;
                    bricks.push({
                        x, y, w: bw, h: bh,
                        hp,
                        maxHp: hp,
                        color: rowColors[r % rowColors.length]
                    });
                    _bricksRemaining++;
                }
            }
        }

        function _resetMatch() {
            _status = 'READY';
            _score = 0;
            _lives = START_LIVES;
            activePowerups.length = 0;
            powerups.length = 0;
            _resetBricks();
            _resetPaddleAndBall();
            _startMs = _now();
            _syncHud();
        }

        function _launchBall() {
            if (_status !== 'READY') return;
            ball.launched = true;
            _status = 'PLAYING';

            // launch at an angle
            const angle = (-Math.PI / 2) - (Math.random() * 0.5 - 0.25); // mostly up
            ball.vx = Math.cos(angle) * ball.speed;
            ball.vy = Math.sin(angle) * ball.speed;
            _syncHud();
        }

        function _spawnPowerup(x, y) {
            if (Math.random() > POWERUP_CHANCE) return;
            const types = ['expand', 'slow'];
            const type = types[Math.floor(Math.random() * types.length)];
            powerups.push({
                type,
                x,
                y,
                w: 18,
                h: 10,
                vy: 150
            });
        }

        function _applyPowerup(type) {
            if (!type) return;
            // Remove existing of same type
            for (let i = activePowerups.length - 1; i >= 0; i--) {
                if (activePowerups[i].type === type) activePowerups.splice(i, 1);
            }

            if (type === 'expand') {
                activePowerups.push({ type, msLeft: 10000 });
                paddle.w = _clamp(Math.floor(paddle.w * 1.35), 90, 190);
            } else if (type === 'slow') {
                activePowerups.push({ type, msLeft: 8000 });
                // Slow the current velocity (keep direction)
                const mag = Math.hypot(ball.vx, ball.vy) || ball.speed;
                const target = Math.max(220, mag * 0.75);
                if (mag > 0) {
                    ball.vx = (ball.vx / mag) * target;
                    ball.vy = (ball.vy / mag) * target;
                }
            }
        }

        function _expirePowerups(dtMs) {
            if (!activePowerups.length) return;
            for (let i = activePowerups.length - 1; i >= 0; i--) {
                const p = activePowerups[i];
                p.msLeft -= dtMs;
                if (p.msLeft <= 0) {
                    const type = p.type;
                    activePowerups.splice(i, 1);
                    if (type === 'expand') {
                        // restore baseline width
                        const baseW = 138 - DIFFICULTY * 12;
                        paddle.w = _clamp(Math.floor(baseW), 84, 150);
                    }
                }
            }
        }

        function _update(dtMs) {
            if (_status === 'CLEAR' || _status === 'GAME_OVER') return;

            const dt = dtMs / 1000;

            // Paddle movement
            const left = _keys.ArrowLeft || _keys.KeyA;
            const right = _keys.ArrowRight || _keys.KeyD;
            let dir = 0;
            if (left && !right) dir = -1;
            if (right && !left) dir = 1;
            paddle.x += dir * PADDLE_SPEED * dt;
            paddle.x = _clamp(paddle.x, PLAY_X + paddle.w / 2, PLAY_X + PLAY_W - paddle.w / 2);

            // Ball stick to paddle when not launched
            if (!ball.launched) {
                ball.x = paddle.x;
                ball.y = paddle.y - 14;
            } else if (_status === 'PLAYING') {
                // Move ball
                ball.x += ball.vx * dt;
                ball.y += ball.vy * dt;

                // Wall collisions
                if (ball.x - ball.r <= PLAY_X) {
                    ball.x = PLAY_X + ball.r;
                    ball.vx *= -1;
                }
                if (ball.x + ball.r >= PLAY_X + PLAY_W) {
                    ball.x = PLAY_X + PLAY_W - ball.r;
                    ball.vx *= -1;
                }
                if (ball.y - ball.r <= PLAY_Y) {
                    ball.y = PLAY_Y + ball.r;
                    ball.vy *= -1;
                }

                // Paddle collision
                const pr = { x: paddle.x - paddle.w / 2, y: paddle.y - paddle.h / 2, w: paddle.w, h: paddle.h };
                const br = { x: ball.x - ball.r, y: ball.y - ball.r, w: ball.r * 2, h: ball.r * 2 };
                if (ball.vy > 0 && _rectsOverlap(br, pr)) {
                    ball.y = pr.y - ball.r; // place above paddle

                    const hitOffset = (ball.x - paddle.x) / (paddle.w / 2);
                    const clamped = _clamp(hitOffset, -1, 1);

                    const speed = _clamp(Math.hypot(ball.vx, ball.vy) || ball.speed, 220, BALL_SPEED_MAX);
                    const vx = clamped * speed;
                    const vy = -Math.sqrt(Math.max(0, speed * speed - vx * vx));
                    ball.vx = vx;
                    ball.vy = vy;
                }

                // Brick collisions
                for (let i = bricks.length - 1; i >= 0; i--) {
                    const bk = bricks[i];
                    const rr = { x: bk.x, y: bk.y, w: bk.w, h: bk.h };
                    if (!_rectsOverlap(br, rr)) continue;

                    // Determine collision axis by overlap depth
                    const overlapLeft = (br.x + br.w) - rr.x;
                    const overlapRight = (rr.x + rr.w) - br.x;
                    const overlapTop = (br.y + br.h) - rr.y;
                    const overlapBottom = (rr.y + rr.h) - br.y;

                    const minX = Math.min(overlapLeft, overlapRight);
                    const minY = Math.min(overlapTop, overlapBottom);

                    if (minX < minY) {
                        ball.vx *= -1;
                        // Nudge out
                        ball.x += (overlapLeft < overlapRight) ? -minX : minX;
                    } else {
                        ball.vy *= -1;
                        ball.y += (overlapTop < overlapBottom) ? -minY : minY;
                    }

                    // Damage brick
                    bk.hp -= 1;
                    if (bk.hp <= 0) {
                        bricks.splice(i, 1);
                        _bricksRemaining--;
                        _addScore(60 + (bk.maxHp === 2 ? 40 : 0));
                        _spawnPowerup(bk.x + bk.w / 2, bk.y + bk.h / 2);

                        // Speed up slightly
                        const mag = Math.hypot(ball.vx, ball.vy) || ball.speed;
                        const next = _clamp(mag + 8, 220, BALL_SPEED_MAX);
                        if (mag > 0) {
                            ball.vx = (ball.vx / mag) * next;
                            ball.vy = (ball.vy / mag) * next;
                        }
                    } else {
                        // Hit but not break
                        _addScore(20);
                    }

                    break; // one brick per frame max
                }

                // Ball fall out
                if (ball.y - ball.r > PLAY_Y + PLAY_H + 10) {
                    _loseLife();
                }
            }

            // Powerups fall + catch
            for (let i = powerups.length - 1; i >= 0; i--) {
                const p = powerups[i];
                p.y += p.vy * dt;
                const pr = { x: paddle.x - paddle.w / 2, y: paddle.y - paddle.h / 2, w: paddle.w, h: paddle.h };
                const rr = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
                if (_rectsOverlap(rr, pr)) {
                    powerups.splice(i, 1);
                    _applyPowerup(p.type);
                    continue;
                }
                if (p.y - p.h > PLAY_Y + PLAY_H + 20) {
                    powerups.splice(i, 1);
                }
            }

            _expirePowerups(dtMs);

            // Win condition
            if (_status === 'PLAYING' && _bricksRemaining <= 0) {
                _win();
            }

            _syncHud();
        }

        function _loseLife() {
            if (_status !== 'PLAYING') return;
            _lives--;
            if (_lives <= 0) {
                _gameOver();
                return;
            }
            _status = 'READY';
            _resetPaddleAndBall();
            _syncHud();
        }

        function _gameOver() {
            if (_status === 'GAME_OVER') return;
            _status = 'GAME_OVER';
            _syncHud();
            _setTimeout(() => {
                if (!_running) return;
                _resetMatch();
            }, 2500);
        }

        function _win() {
            if (_status !== 'PLAYING') return;
            _status = 'CLEAR';
            _syncHud();
            _setTimeout(() => {
                if (!_running) return;
                const elapsedSeconds = _startMs ? Math.max(0, (_now() - _startMs) / 1000) : 0;
                EventBus.emit(EventBus.Events.MINIGAME_END, {
                    success: true,
                    score: _score,
                    livesLeft: _lives,
                    time: elapsedSeconds
                });
            }, 900);
        }

        function _draw() {
            // Background + letterbox bars
            CanvasRenderer.clear('#050612');
            CanvasRenderer.drawRect(0, 0, _canvas.width, TOP_UI, '#000000');
            CanvasRenderer.drawRect(0, _canvas.height - BOTTOM_UI, _canvas.width, BOTTOM_UI, '#000000');

            // Playfield frame
            CanvasRenderer.drawRect(PLAY_X - 6, PLAY_Y - 6, PLAY_W + 12, PLAY_H + 12, '#101a3a');
            CanvasRenderer.drawRect(PLAY_X - 4, PLAY_Y - 4, PLAY_W + 8, PLAY_H + 8, '#000000');

            // Bricks
            for (const bk of bricks) {
                CanvasRenderer.drawRect(Math.floor(bk.x), Math.floor(bk.y), bk.w, bk.h, bk.color);
                CanvasRenderer.setAlpha(0.18);
                CanvasRenderer.drawRect(Math.floor(bk.x) + 2, Math.floor(bk.y) + 2, bk.w - 4, bk.h - 4, '#ffffff');
                CanvasRenderer.setAlpha(1);
                if (bk.maxHp === 2) {
                    CanvasRenderer.setAlpha(0.25);
                    CanvasRenderer.drawRect(Math.floor(bk.x), Math.floor(bk.y), bk.w, bk.h, '#ffffff');
                    CanvasRenderer.setAlpha(1);
                }
            }

            // Paddle
            const px = Math.floor(paddle.x - paddle.w / 2);
            const py = Math.floor(paddle.y - paddle.h / 2);
            CanvasRenderer.drawRect(px, py, paddle.w, paddle.h, '#ffffff');
            CanvasRenderer.setAlpha(0.18);
            CanvasRenderer.drawRect(px + 2, py + 2, paddle.w - 4, paddle.h - 4, '#8bd3ff');
            CanvasRenderer.setAlpha(1);

            // Ball (simple circle using ctx for nicer look)
            _ctx.save();
            _ctx.fillStyle = '#ffe66d';
            _ctx.beginPath();
            _ctx.arc(Math.floor(ball.x), Math.floor(ball.y), ball.r, 0, Math.PI * 2);
            _ctx.fill();
            _ctx.globalAlpha = 0.2;
            _ctx.fillStyle = '#ffffff';
            _ctx.beginPath();
            _ctx.arc(Math.floor(ball.x) - 1, Math.floor(ball.y) - 2, Math.max(1, ball.r - 2), 0, Math.PI * 2);
            _ctx.fill();
            _ctx.restore();

            // Powerups
            for (const p of powerups) {
                const color = (p.type === 'expand') ? '#66ffcc' : '#88aaff';
                CanvasRenderer.drawRect(Math.floor(p.x - p.w / 2), Math.floor(p.y - p.h / 2), p.w, p.h, color);
            }

            // HUD text
            const livesStr = '♥'.repeat(Math.max(0, _lives));
            CanvasRenderer.drawText(`BONUS`, 12, 18, { align: 'left', size: 10, color: '#ffffff' });
            CanvasRenderer.drawText(`LIVES ${livesStr || _lives}`, 12, 34, { align: 'left', size: 10, color: '#dddddd' });
            CanvasRenderer.drawText(`BRICKS ${_bricksRemaining}`, _canvas.width / 2, 18, { align: 'center', size: 10, color: '#ffffff' });
            CanvasRenderer.drawText(`SCORE ${String(_score).padStart(4, '0')}`, _canvas.width / 2, 34, { align: 'center', size: 10, color: '#dddddd' });

            // Controls hint
            CanvasRenderer.drawText(`ARROWS/A-D MOVE`, _canvas.width - 12, 18, { align: 'right', size: 8, color: '#cccccc' });
            CanvasRenderer.drawText(`SPACE LAUNCH`, _canvas.width - 12, 34, { align: 'right', size: 8, color: '#cccccc' });

            if (_status === 'READY') {
                CanvasRenderer.drawText('PRESS SPACE', _canvas.width / 2, _canvas.height / 2, { align: 'center', size: 16, color: '#ffffff' });
            } else if (_status === 'CLEAR') {
                CanvasRenderer.drawText('STAGE CLEAR!', _canvas.width / 2, _canvas.height / 2, { align: 'center', size: 18, color: '#a8ff7a' });
            } else if (_status === 'GAME_OVER') {
                CanvasRenderer.drawText('GAME OVER', _canvas.width / 2, _canvas.height / 2, { align: 'center', size: 18, color: '#ff4d4d' });
            }
        }

        function _loop(ts) {
            if (!_running) return;
            _raf = requestAnimationFrame(_loop);
            if (_paused) return;

            const now = ts || _now();
            const dtMs = Math.min(50, Math.max(0, now - (_lastTs || now)));
            _lastTs = now;

            _update(dtMs);
            _draw();
        }

        function _bindInput() {
            _keyDownHandler = (e) => {
                if (!_running || _paused) return;

                // Debug skip: '*' (numpad multiply or shift+8)
                if (e.code === 'NumpadMultiply' || (e.code === 'Digit8' && e.shiftKey)) {
                    e.preventDefault();
                    _win();
                    return;
                }

                if (e.code === 'Space') {
                    e.preventDefault();
                    if (_status === 'READY') _launchBall();
                }

                _keys[e.code] = true;
                if (['ArrowLeft','ArrowRight','KeyA','KeyD','Space'].includes(e.code)) {
                    e.preventDefault();
                }
            };

            _keyUpHandler = (e) => {
                _keys[e.code] = false;
            };

            window.addEventListener('keydown', _keyDownHandler);
            window.addEventListener('keyup', _keyUpHandler);
        }

        function _unbindInput() {
            if (_keyDownHandler) window.removeEventListener('keydown', _keyDownHandler);
            if (_keyUpHandler) window.removeEventListener('keyup', _keyUpHandler);
            _keyDownHandler = null;
            _keyUpHandler = null;
            Object.keys(_keys).forEach((k) => { _keys[k] = false; });
        }

        const api = {
            init() {
                if (_ctx) _ctx.imageSmoothingEnabled = false;
                _resetMatch();
            },

            start() {
                if (_running) return;
                _running = true;
                _paused = false;
                _lastTs = _now();
                _bindInput();
                _raf = requestAnimationFrame(_loop);
            },

            pause() {
                _paused = true;
                if (typeof Input !== 'undefined') Input.clearAll();
            },

            resume() {
                _paused = false;
                _lastTs = _now();
            },

            stop() {
                _running = false;
                _paused = false;
                _unbindInput();
                _clearTimeouts();
                if (_raf) cancelAnimationFrame(_raf);
                _raf = null;
            },

            destroy() {
                this.stop();
            },

            getState() {
                return {
                    running: _running,
                    paused: _paused,
                    status: _status,
                    score: _score,
                    lives: _lives,
                    bricksRemaining: _bricksRemaining,
                    activePowerups: activePowerups.map(p => ({ ...p }))
                };
            }
        };

        return api;
    }

    GameLoader.registerGame(GAME_ID, createArkanoid);
})();

