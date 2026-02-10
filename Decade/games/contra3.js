/**
 * contra3.js
 * Simplified SNES-style run-and-gun mini-game for Level 3 (2018)
 * 
 * Win condition: Kill 25 enemies
 * Lose condition: Player HP reaches 0
 */

(function() {
    'use strict';
    
    /**
     * Contra III game factory
     * @param {Object} config - Level configuration
     * @returns {Object} Game instance
     */
    function createContra3Game(config) {
        // =========================================
        // CONSTANTS
        // =========================================
        
        const KILLS_TO_WIN = 25;
        
        // Player settings
        const PLAYER_WIDTH = 24;
        const PLAYER_HEIGHT = 32;
        const PLAYER_SPEED = 200;        // pixels per second
        const PLAYER_MAX_HP = 3;
        const INVINCIBILITY_TIME = 800;  // ms after being hit
        const FIRE_RATE = 100;           // ms between shots (10 shots/sec)
        
        // Bullet settings
        const BULLET_SPEED = 500;
        const BULLET_SIZE = 6;
        const ENEMY_BULLET_SPEED = 250;
        // Make the game harder: player bullets have shorter range (travel distance)
        const PLAYER_BULLET_RANGE_PX = 200;

        // =========================================
        // SPECIAL TARGET: "HEART BULLET" (3 hits) -> awards floppy collectible (Level 3)
        // =========================================
        // Spawns occasionally ("almost random"). Player must hit it 3 times.
        const HEART_HP = 3;
        const HEART_SPEED = 160;            // px/s (moves left)
        const HEART_W = 18;
        const HEART_H = 16;
        const HEART_SPAWN_MIN_MS = 6500;
        const HEART_SPAWN_MAX_MS = 13000;
        
        // Enemy settings
        const ENEMY_WIDTH = 20;
        const ENEMY_HEIGHT = 28;
        const RUNNER_SPEED = 120;
        const SHOOTER_SPEED = 60;
        const SPAWN_INTERVAL_BASE = 1500; // ms between spawns
        const SPAWN_INTERVAL_MIN = 600;   // minimum spawn interval
        
        // Play area
        const GROUND_Y = 380;             // Y position of ground line
        const PLAY_AREA_TOP = 280;        // Top boundary for movement
        const PLAY_AREA_LEFT = 40;
        const PLAY_AREA_RIGHT = 760;
        
        // SNES-style color palette
        const COLORS = {
            background: '#1a1c2c',
            backgroundMid: '#2a2040',
            backgroundFar: '#3b2d5a',
            ground: '#5c4a7a',
            groundLine: '#7a6a9a',
            
            player: '#4a9fff',
            playerHighlight: '#8ac4ff',
            playerHurt: '#ff4444',
            
            runner: '#cc3366',
            runnerHighlight: '#ff5588',
            shooter: '#ff9900',
            shooterHighlight: '#ffcc44',
            
            bulletPlayer: '#ffff00',
            bulletEnemy: '#ff3333',
            
            muzzleFlash: '#ffffff',
            
            text: '#f4f1de',
            textDim: '#8b8b8b',
            accent: '#f2c14e',
            hp: '#44ff44',
            hpLost: '#333333'
        };
        
        // =========================================
        // GAME STATE
        // =========================================
        
        let _isRunning = false;
        let _isPaused = false;
        let _isGameOver = false;
        let _isVictory = false;
        let _animationId = null;
        let _lastTime = 0;
        let _gameStartTime = 0;
        let _restartTimeout = null;
        
        // Player state
        let _player = {
            x: 100,
            y: GROUND_Y - PLAYER_HEIGHT,
            hp: PLAYER_MAX_HP,
            isInvincible: false,
            invincibilityTimer: 0,
            lastFireTime: 0,
            facingRight: true,
            isShooting: false,
            muzzleFlashTimer: 0
        };
        
        // Game objects
        let _playerBullets = [];
        let _enemyBullets = [];
        let _enemies = [];

        // Heart target (one at a time)
        let _heart = null; // { x,y,dx,hp,blinkMs,spawnMs }
        let _heartSpawnLeftMs = 0;

        // Collectible: floppy disk (💾) for Era1 Level 3 (one-time)
        let _hasAwardedFloppy = false;

        // UI target position for "fly to HUD" (this game's score area)
        let _uiFloppyTargetX = 0;
        let _uiFloppyTargetY = 0;

        // Celebration FX (same style as Tetris)
        let _floppyAnim = null; // { startMs, durationMs, fromX, fromY, toX, toY, active }
        let _sparkles = [];
        let _sparkleStreamLeftMs = 0;
        let _sparkleSpawnAcc = 0;
        let _shakeTimeLeftMs = 0;
        let _shakeDurationMs = 0;
        let _shakeIntensityPx = 0;
        let _shakeX = 0;
        let _shakeY = 0;
        let _foundTextLeftMs = 0;
        
        // Spawning
        let _spawnTimer = 0;
        let _spawnInterval = SPAWN_INTERVAL_BASE;
        
        // Stats
        let _kills = 0;
        let _score = 0;
        let _timeSurvived = 0;
        
        // Input state
        const _keys = {};
        
        // Canvas refs
        const _ctx = CanvasRenderer.getContext();
        const _canvas = CanvasRenderer.getCanvas();
        
        // =========================================
        // INITIALIZATION
        // =========================================
        
        function init() {
            console.log('[Contra3] Initializing...');
            // Pixel crisp (helps heart + sparkles + emoji)
            if (_ctx) _ctx.imageSmoothingEnabled = false;

            // Cache score UI target based on _renderUI() positions:
            // hpX=20, hpY=20, score value at (hpX, hpY+106)
            const hpX = 20;
            const hpY = 20;
            _uiFloppyTargetX = hpX + 70;
            _uiFloppyTargetY = hpY + 108;

            _resetGame();
            _render();
        }
        
        function _resetGame() {
            _isGameOver = false;
            _isVictory = false;
            
            // Reset player
            _player.x = 100;
            _player.y = GROUND_Y - PLAYER_HEIGHT;
            _player.hp = PLAYER_MAX_HP;
            _player.isInvincible = false;
            _player.invincibilityTimer = 0;
            _player.lastFireTime = 0;
            _player.facingRight = true;
            _player.muzzleFlashTimer = 0;
            
            // Clear objects
            _playerBullets = [];
            _enemyBullets = [];
            _enemies = [];
            _heart = null;
            _heartSpawnLeftMs = _randInt(HEART_SPAWN_MIN_MS, HEART_SPAWN_MAX_MS);

            _syncFloppyAwardedFromState();
            _resetFloppyFX();
            
            // Reset spawning
            _spawnTimer = 0;
            _spawnInterval = SPAWN_INTERVAL_BASE;
            
            // Reset stats
            _kills = 0;
            _score = 0;
            _timeSurvived = 0;
            
            _updateHUD();
        }

        // =========================================
        // HEART TARGET + COLLECTIBLE FX HELPERS
        // =========================================

        function _rand(min, max) {
            return min + Math.random() * (max - min);
        }

        function _randInt(min, max) {
            return Math.floor(_rand(min, max + 1));
        }

        function _clamp(v, min, max) {
            return Math.max(min, Math.min(max, v));
        }

        function _easeInOutCubic(t) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        function _easeOutElastic(t) {
            if (t === 0) return 0;
            if (t === 1) return 1;
            const c4 = (2 * Math.PI) / 3;
            return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
        }

        function _syncFloppyAwardedFromState() {
            try {
                if (typeof StateManager !== 'undefined' && typeof StateManager.isCollected === 'function') {
                    _hasAwardedFloppy = !!StateManager.isCollected('era1', 3);
                } else {
                    _hasAwardedFloppy = false;
                }
            } catch (_) {
                _hasAwardedFloppy = false;
            }
        }

        function _resetFloppyFX() {
            _floppyAnim = null;
            _sparkles = [];
            _sparkleStreamLeftMs = 0;
            _sparkleSpawnAcc = 0;
            _shakeTimeLeftMs = 0;
            _shakeDurationMs = 0;
            _shakeIntensityPx = 0;
            _shakeX = 0;
            _shakeY = 0;
            _foundTextLeftMs = 0;
        }

        const _sparkleColors = ['#ffffff', '#fff1a8', '#ffd0df', '#a8f7ff'];

        function _spawnSparkleBurst(x, y, count) {
            const total = Math.max(0, count | 0);
            for (let i = 0; i < total; i++) {
                const color = _sparkleColors[_randInt(0, _sparkleColors.length - 1)];
                const size = _randInt(1, 3);
                const angle = _rand(0, Math.PI * 2);
                const speed = _rand(120, 520);
                _sparkles.push({
                    x: x + _rand(-10, 10),
                    y: y + _rand(-10, 10),
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - _rand(40, 160),
                    lifeMs: _randInt(420, 900),
                    maxLifeMs: 900,
                    size,
                    color
                });
            }
        }

        function _triggerFloppyAward() {
            if (_hasAwardedFloppy) return;

            // Respect persistent state if already collected
            try {
                if (typeof StateManager !== 'undefined' && typeof StateManager.isCollected === 'function') {
                    if (StateManager.isCollected('era1', 3)) {
                        _hasAwardedFloppy = true;
                        return;
                    }
                }
            } catch (_) {}

            _hasAwardedFloppy = true;

            try {
                if (typeof StateManager !== 'undefined' && typeof StateManager.collectItem === 'function') {
                    StateManager.collectItem({ eraKey: 'era1', level: 3, itemId: 'floppy' });
                }
            } catch (_) {}

            const startX = PLAY_AREA_LEFT + (PLAY_AREA_RIGHT - PLAY_AREA_LEFT) / 2;
            const startY = PLAY_AREA_TOP + (GROUND_Y - PLAY_AREA_TOP) / 2;

            _floppyAnim = {
                startMs: performance.now(),
                durationMs: 1200,
                fromX: startX,
                fromY: startY,
                toX: _uiFloppyTargetX,
                toY: _uiFloppyTargetY,
                active: true
            };

            _shakeDurationMs = 450;
            _shakeTimeLeftMs = 450;
            _shakeIntensityPx = 10;

            _spawnSparkleBurst(startX, startY, _randInt(120, 220));
            _sparkleStreamLeftMs = 400;
            _sparkleSpawnAcc = 0;
            _foundTextLeftMs = 400;
        }

        function _updateFloppyFX(dtMs) {
            // Shake
            if (_shakeTimeLeftMs > 0) {
                _shakeTimeLeftMs = Math.max(0, _shakeTimeLeftMs - dtMs);
                const t = _shakeDurationMs > 0 ? (_shakeTimeLeftMs / _shakeDurationMs) : 0;
                const intensity = _shakeIntensityPx * t;
                _shakeX = Math.round(_rand(-1, 1) * intensity);
                _shakeY = Math.round(_rand(-1, 1) * intensity);
            } else {
                _shakeX = 0;
                _shakeY = 0;
            }

            // Sparkle stream (~400ms)
            if (_sparkleStreamLeftMs > 0) {
                _sparkleStreamLeftMs = Math.max(0, _sparkleStreamLeftMs - dtMs);
                _sparkleSpawnAcc += dtMs;
                const spawnEvery = 18;
                while (_sparkleSpawnAcc >= spawnEvery && _sparkleStreamLeftMs > 0) {
                    _sparkleSpawnAcc -= spawnEvery;
                    if (_floppyAnim && _floppyAnim.active) {
                        _spawnSparkleBurst(_floppyAnim.fromX, _floppyAnim.fromY, 1);
                    }
                }
            }

            // Sparkles update
            if (_sparkles.length) {
                const dt = dtMs / 1000;
                const gravity = 320;
                for (let i = _sparkles.length - 1; i >= 0; i--) {
                    const p = _sparkles[i];
                    p.vy += gravity * dt;
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.lifeMs -= dtMs;
                    if (p.lifeMs <= 0) _sparkles.splice(i, 1);
                }
            }

            // Floppy anim timeline
            if (_floppyAnim && _floppyAnim.active) {
                const now = performance.now();
                const elapsed = now - _floppyAnim.startMs;
                if (elapsed >= _floppyAnim.durationMs) {
                    _floppyAnim.active = false;
                    _floppyAnim = null;
                }
            }

            if (_foundTextLeftMs > 0) {
                _foundTextLeftMs = Math.max(0, _foundTextLeftMs - dtMs);
            }
        }
        
        // =========================================
        // PLAYER
        // =========================================
        
        function _updatePlayer(dt) {
            // Movement
            let dx = 0;
            let dy = 0;
            
            if (_keys['ArrowLeft'] || _keys['KeyA']) {
                dx = -1;
                _player.facingRight = false;
            }
            if (_keys['ArrowRight'] || _keys['KeyD']) {
                dx = 1;
                _player.facingRight = true;
            }
            if (_keys['ArrowUp'] || _keys['KeyW']) {
                dy = -1;
            }
            if (_keys['ArrowDown'] || _keys['KeyS']) {
                dy = 1;
            }
            
            // Normalize diagonal movement
            if (dx !== 0 && dy !== 0) {
                const factor = 0.707; // 1/sqrt(2)
                dx *= factor;
                dy *= factor;
            }
            
            // Apply movement
            _player.x += dx * PLAYER_SPEED * (dt / 1000);
            _player.y += dy * PLAYER_SPEED * (dt / 1000);
            
            // Clamp to play area
            _player.x = Math.max(PLAY_AREA_LEFT, Math.min(PLAY_AREA_RIGHT - PLAYER_WIDTH, _player.x));
            _player.y = Math.max(PLAY_AREA_TOP, Math.min(GROUND_Y - PLAYER_HEIGHT, _player.y));
            
            // Shooting
            if (_keys['KeyX'] || _keys['Space']) {
                _tryShoot();
            }
            
            // Update invincibility
            if (_player.isInvincible) {
                _player.invincibilityTimer -= dt;
                if (_player.invincibilityTimer <= 0) {
                    _player.isInvincible = false;
                }
            }
            
            // Update muzzle flash
            if (_player.muzzleFlashTimer > 0) {
                _player.muzzleFlashTimer -= dt;
            }
        }
        
        function _tryShoot() {
            const now = performance.now();
            if (now - _player.lastFireTime < FIRE_RATE) return;
            
            _player.lastFireTime = now;
            _player.muzzleFlashTimer = 50;
            
            // Create bullet
            const bulletX = _player.facingRight 
                ? _player.x + PLAYER_WIDTH 
                : _player.x - BULLET_SIZE;
            
            _playerBullets.push({
                x: bulletX,
                y: _player.y + PLAYER_HEIGHT / 2 - BULLET_SIZE / 2,
                dx: _player.facingRight ? 1 : -1,
                spawnX: bulletX
            });
            
            // TODO: Add shooting sound
        }
        
        function _damagePlayer() {
            if (_player.isInvincible) return;
            
            _player.hp--;
            _player.isInvincible = true;
            _player.invincibilityTimer = INVINCIBILITY_TIME;
            
            // TODO: Add hurt sound
            
            if (_player.hp <= 0) {
                _gameOver();
            }
            
            _updateHUD();
        }
        
        // =========================================
        // ENEMIES
        // =========================================
        
        function _spawnEnemy() {
            const isShooter = Math.random() < 0.35;
            
            _enemies.push({
                x: _canvas.width + 10,
                y: PLAY_AREA_TOP + Math.random() * (GROUND_Y - PLAY_AREA_TOP - ENEMY_HEIGHT),
                type: isShooter ? 'shooter' : 'runner',
                hp: 1,
                shootTimer: isShooter ? 1000 + Math.random() * 1000 : 0,
                stopped: false
            });
        }
        
        function _updateEnemies(dt) {
            for (let i = _enemies.length - 1; i >= 0; i--) {
                const enemy = _enemies[i];
                
                if (enemy.type === 'runner') {
                    // Runners move straight left
                    enemy.x -= RUNNER_SPEED * (dt / 1000);
                } else {
                    // Shooters move until they're on screen, then stop and shoot
                    if (enemy.x > _canvas.width - 150) {
                        enemy.x -= SHOOTER_SPEED * (dt / 1000);
                    } else {
                        enemy.stopped = true;
                        enemy.shootTimer -= dt;
                        
                        if (enemy.shootTimer <= 0) {
                            _enemyShoot(enemy);
                            enemy.shootTimer = 1500 + Math.random() * 1000;
                        }
                    }
                }
                
                // Remove if off screen left
                if (enemy.x + ENEMY_WIDTH < 0) {
                    _enemies.splice(i, 1);
                    continue;
                }
                
                // Check collision with player
                if (_checkCollision(
                    _player.x, _player.y, PLAYER_WIDTH, PLAYER_HEIGHT,
                    enemy.x, enemy.y, ENEMY_WIDTH, ENEMY_HEIGHT
                )) {
                    _damagePlayer();
                    _enemies.splice(i, 1);
                }
            }
        }
        
        function _enemyShoot(enemy) {
            _enemyBullets.push({
                x: enemy.x,
                y: enemy.y + ENEMY_HEIGHT / 2 - BULLET_SIZE / 2,
                dx: -1
            });
        }
        
        // =========================================
        // BULLETS
        // =========================================
        
        function _updateBullets(dt) {
            // Player bullets
            for (let i = _playerBullets.length - 1; i >= 0; i--) {
                const bullet = _playerBullets[i];
                bullet.x += bullet.dx * BULLET_SPEED * (dt / 1000);
                
                // Remove if out of range (shorter player bullet range) OR off screen
                const traveled = Math.abs(bullet.x - (bullet.spawnX ?? bullet.x));
                if (traveled > PLAYER_BULLET_RANGE_PX ||
                    bullet.x < -BULLET_SIZE || bullet.x > _canvas.width + BULLET_SIZE) {
                    _playerBullets.splice(i, 1);
                    continue;
                }

                // Check collision with heart target (3 hits)
                if (_heart && _checkCollision(
                    bullet.x, bullet.y, BULLET_SIZE, BULLET_SIZE,
                    _heart.x, _heart.y, HEART_W, HEART_H
                )) {
                    _playerBullets.splice(i, 1);
                    _heart.hp -= 1;
                    _heart.blinkMs = 120;
                    if (_heart.hp <= 0) {
                        _heart = null;
                        _triggerFloppyAward();
                    }
                    continue;
                }
                
                // Check collision with enemies
                for (let j = _enemies.length - 1; j >= 0; j--) {
                    const enemy = _enemies[j];
                    if (_checkCollision(
                        bullet.x, bullet.y, BULLET_SIZE, BULLET_SIZE,
                        enemy.x, enemy.y, ENEMY_WIDTH, ENEMY_HEIGHT
                    )) {
                        enemy.hp--;
                        _playerBullets.splice(i, 1);
                        
                        if (enemy.hp <= 0) {
                            _enemies.splice(j, 1);
                            _kills++;
                            _score += 10;
                            _updateHUD();
                            
                            // Check win condition
                            if (_kills >= KILLS_TO_WIN) {
                                _winGame();
                                return;
                            }
                        }
                        break;
                    }
                }
            }
            
            // Enemy bullets
            for (let i = _enemyBullets.length - 1; i >= 0; i--) {
                const bullet = _enemyBullets[i];
                bullet.x += bullet.dx * ENEMY_BULLET_SPEED * (dt / 1000);
                
                // Remove if off screen
                if (bullet.x < -BULLET_SIZE || bullet.x > _canvas.width + BULLET_SIZE) {
                    _enemyBullets.splice(i, 1);
                    continue;
                }
                
                // Check collision with player
                if (_checkCollision(
                    bullet.x, bullet.y, BULLET_SIZE, BULLET_SIZE,
                    _player.x, _player.y, PLAYER_WIDTH, PLAYER_HEIGHT
                )) {
                    _damagePlayer();
                    _enemyBullets.splice(i, 1);
                }
            }
        }
        
        // =========================================
        // COLLISION
        // =========================================
        
        function _checkCollision(x1, y1, w1, h1, x2, y2, w2, h2) {
            return x1 < x2 + w2 &&
                   x1 + w1 > x2 &&
                   y1 < y2 + h2 &&
                   y1 + h1 > y2;
        }
        
        // =========================================
        // SPAWNING
        // =========================================
        
        function _updateSpawning(dt) {
            _spawnTimer += dt;
            
            // Decrease spawn interval over time (increase difficulty)
            _spawnInterval = Math.max(
                SPAWN_INTERVAL_MIN,
                SPAWN_INTERVAL_BASE - (_kills * 30)
            );
            
            if (_spawnTimer >= _spawnInterval) {
                _spawnTimer = 0;
                _spawnEnemy();
            }

            // Heart target spawn (one at a time, occasional)
            if (!_hasAwardedFloppy && !_heart) {
                _heartSpawnLeftMs -= dt;
                if (_heartSpawnLeftMs <= 0) {
                    _spawnHeartTarget();
                    _heartSpawnLeftMs = _randInt(HEART_SPAWN_MIN_MS, HEART_SPAWN_MAX_MS);
                }
            }
        }

        function _spawnHeartTarget() {
            const y = PLAY_AREA_TOP + 20 + Math.random() * Math.max(1, (GROUND_Y - PLAY_AREA_TOP - 80));
            _heart = {
                x: _canvas.width + 20,
                y: y,
                dx: -1,
                hp: HEART_HP,
                blinkMs: 0,
                spawnMs: performance.now()
            };
        }

        function _updateHeart(dt) {
            if (!_heart) return;
            _heart.x += _heart.dx * HEART_SPEED * (dt / 1000);
            if (_heart.blinkMs > 0) _heart.blinkMs = Math.max(0, _heart.blinkMs - dt);
            if (_heart.x + HEART_W < -30) {
                _heart = null;
            }
        }
        
        // =========================================
        // GAME END CONDITIONS
        // =========================================
        
        function _gameOver() {
            console.log('[Contra3] Game Over!');
            _isGameOver = true;
            
            // Auto-restart after delay
            _restartTimeout = setTimeout(() => {
                if (_isGameOver) {
                    console.log('[Contra3] Auto-restarting...');
                    _resetGame();
                    _isRunning = true;
                    _gameStartTime = performance.now();
                    _lastTime = performance.now();
                    _gameLoop();
                }
            }, 2000);
        }
        
        function _winGame() {
            console.log('[Contra3] Victory!');
            _isVictory = true;
            _isRunning = false;
            
            const duration = performance.now() - _gameStartTime;
            
            EventBus.emit(EventBus.Events.MINIGAME_END, {
                success: true,
                score: _score,
                kills: _kills,
                timeSurvived: duration,
                hitsTaken: PLAYER_MAX_HP - _player.hp
            });
        }
        
        // =========================================
        // INPUT HANDLING
        // =========================================
        
        function _handleKeyDown(e) {
            if (_isPaused || _isGameOver || _isVictory) return;
            
            _keys[e.code] = true;
            
            // Debug: Skip level
            if ((e.code === 'NumpadMultiply') || (e.code === 'Digit8' && e.shiftKey)) {
                _winGame();
                e.preventDefault();
            }
            
            // Prevent scrolling
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                e.preventDefault();
            }
        }
        
        function _handleKeyUp(e) {
            _keys[e.code] = false;
        }
        
        // =========================================
        // GAME LOOP
        // =========================================
        
        function start() {
            console.log('[Contra3] Starting game...');
            
            _isRunning = true;
            _isPaused = false;
            _gameStartTime = performance.now();
            _lastTime = performance.now();
            
            // Add input listeners
            window.addEventListener('keydown', _handleKeyDown);
            window.addEventListener('keyup', _handleKeyUp);
            
            // Start game loop
            _gameLoop();
        }
        
        function _gameLoop(currentTime = performance.now()) {
            if (!_isRunning) {
                _render();
                return;
            }
            
            const dt = currentTime - _lastTime;
            _lastTime = currentTime;
            
            if (!_isPaused && !_isGameOver && !_isVictory) {
                _update(dt);
            }
            
            _render();
            
            _animationId = requestAnimationFrame(_gameLoop);
        }
        
        function _update(dt) {
            _timeSurvived += dt;
            _updateFloppyFX(dt);
            _updatePlayer(dt);
            _updateBullets(dt);
            _updateEnemies(dt);
            _updateSpawning(dt);
            _updateHeart(dt);
            
            // Score bonus for surviving
            _score = _kills * 10 + Math.floor(_timeSurvived / 1000);
        }
        
        function _updateHUD() {
            StateManager.updateLevelData({
                score: _score,
                kills: _kills,
                killsToWin: KILLS_TO_WIN,
                hp: _player.hp
            });
        }
        
        // =========================================
        // RENDERING
        // =========================================
        
        function _render() {
            // Clear canvas
            CanvasRenderer.clear(COLORS.background);

            // Camera shake (applies to gameplay + UI + effects)
            _ctx.save();
            _ctx.translate(_shakeX, _shakeY);
            
            // Draw background layers
            _renderBackground();
            
            // Draw ground
            _renderGround();
            
            // Draw enemies
            _renderEnemies();
            
            // Draw player
            _renderPlayer();
            
            // Draw bullets
            _renderBullets();
            
            // Draw UI
            _renderUI();

            // Collectible FX overlay (sparkles + floppy fly)
            _renderSparkles();
            _renderFloppyAnim();

            _ctx.restore();
            
            // Draw game over / victory
            if (_isGameOver) {
                _renderGameOver();
            } else if (_isVictory) {
                _renderVictory();
            }
            
            // Draw pause overlay
            if (_isPaused) {
                _renderPauseOverlay();
            }
        }
        
        function _renderBackground() {
            // Simple parallax-like background bands
            const bandHeight = 40;
            
            for (let y = 0; y < PLAY_AREA_TOP; y += bandHeight) {
                const shade = y / PLAY_AREA_TOP;
                const color = _lerpColor(COLORS.backgroundFar, COLORS.backgroundMid, shade);
                CanvasRenderer.drawRect(0, y, _canvas.width, bandHeight, color);
            }
            
            // Mountains/hills silhouette
            _ctx.fillStyle = COLORS.backgroundMid;
            _ctx.beginPath();
            _ctx.moveTo(0, PLAY_AREA_TOP);
            
            // Simple mountain shapes
            const mountains = [
                { x: 100, h: 60 },
                { x: 250, h: 80 },
                { x: 400, h: 50 },
                { x: 550, h: 70 },
                { x: 700, h: 55 }
            ];
            
            for (const m of mountains) {
                _ctx.lineTo(m.x - 60, PLAY_AREA_TOP);
                _ctx.lineTo(m.x, PLAY_AREA_TOP - m.h);
                _ctx.lineTo(m.x + 60, PLAY_AREA_TOP);
            }
            
            _ctx.lineTo(_canvas.width, PLAY_AREA_TOP);
            _ctx.closePath();
            _ctx.fill();
        }
        
        function _lerpColor(color1, color2, t) {
            // Simple color lerp (hex to hex)
            const c1 = parseInt(color1.slice(1), 16);
            const c2 = parseInt(color2.slice(1), 16);
            
            const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
            const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
            
            const r = Math.round(r1 + (r2 - r1) * t);
            const g = Math.round(g1 + (g2 - g1) * t);
            const b = Math.round(b1 + (b2 - b1) * t);
            
            return `rgb(${r}, ${g}, ${b})`;
        }
        
        function _renderGround() {
            // Ground area
            CanvasRenderer.drawRect(0, GROUND_Y, _canvas.width, _canvas.height - GROUND_Y, COLORS.ground);
            
            // Ground line
            CanvasRenderer.drawRect(0, GROUND_Y, _canvas.width, 3, COLORS.groundLine);
            
            // Simple ground texture
            _ctx.fillStyle = COLORS.backgroundMid;
            for (let x = 0; x < _canvas.width; x += 40) {
                _ctx.fillRect(x, GROUND_Y + 10, 20, 4);
                _ctx.fillRect(x + 15, GROUND_Y + 25, 15, 3);
            }
        }
        
        function _renderPlayer() {
            // Flicker when invincible
            if (_player.isInvincible && Math.floor(_player.invincibilityTimer / 50) % 2 === 0) {
                return;
            }
            
            const x = Math.floor(_player.x);
            const y = Math.floor(_player.y);
            
            // Body
            const bodyColor = _player.isInvincible ? COLORS.playerHurt : COLORS.player;
            CanvasRenderer.drawRect(x + 4, y + 8, PLAYER_WIDTH - 8, PLAYER_HEIGHT - 8, bodyColor);
            
            // Head
            CanvasRenderer.drawRect(x + 6, y, PLAYER_WIDTH - 12, 10, bodyColor);
            
            // Highlight
            _ctx.fillStyle = COLORS.playerHighlight;
            _ctx.fillRect(x + 4, y + 8, PLAYER_WIDTH - 8, 3);
            
            // Gun arm
            const armY = y + 14;
            if (_player.facingRight) {
                CanvasRenderer.drawRect(x + PLAYER_WIDTH - 4, armY, 8, 4, '#666666');
            } else {
                CanvasRenderer.drawRect(x - 4, armY, 8, 4, '#666666');
            }
            
            // Muzzle flash
            if (_player.muzzleFlashTimer > 0) {
                const flashX = _player.facingRight ? x + PLAYER_WIDTH + 4 : x - 10;
                CanvasRenderer.drawRect(flashX, armY - 2, 6, 8, COLORS.muzzleFlash);
            }
            
            // Legs (simple)
            CanvasRenderer.drawRect(x + 6, y + PLAYER_HEIGHT - 6, 5, 6, bodyColor);
            CanvasRenderer.drawRect(x + PLAYER_WIDTH - 11, y + PLAYER_HEIGHT - 6, 5, 6, bodyColor);
        }
        
        function _renderEnemies() {
            for (const enemy of _enemies) {
                const x = Math.floor(enemy.x);
                const y = Math.floor(enemy.y);
                
                const color = enemy.type === 'runner' ? COLORS.runner : COLORS.shooter;
                const highlight = enemy.type === 'runner' ? COLORS.runnerHighlight : COLORS.shooterHighlight;
                
                // Body
                CanvasRenderer.drawRect(x + 2, y + 6, ENEMY_WIDTH - 4, ENEMY_HEIGHT - 6, color);
                
                // Head
                CanvasRenderer.drawRect(x + 4, y, ENEMY_WIDTH - 8, 8, color);
                
                // Highlight
                _ctx.fillStyle = highlight;
                _ctx.fillRect(x + 2, y + 6, ENEMY_WIDTH - 4, 2);
                
                // Eyes (menacing)
                _ctx.fillStyle = '#ffffff';
                _ctx.fillRect(x + 5, y + 2, 3, 3);
                _ctx.fillRect(x + ENEMY_WIDTH - 8, y + 2, 3, 3);
                
                // Shooter indicator (gun)
                if (enemy.type === 'shooter') {
                    CanvasRenderer.drawRect(x - 4, y + 12, 6, 3, '#444444');
                }
            }
        }
        
        function _renderBullets() {
            // Player bullets
            _ctx.fillStyle = COLORS.bulletPlayer;
            for (const bullet of _playerBullets) {
                _ctx.fillRect(
                    Math.floor(bullet.x),
                    Math.floor(bullet.y),
                    BULLET_SIZE,
                    BULLET_SIZE
                );
            }
            
            // Enemy bullets
            _ctx.fillStyle = COLORS.bulletEnemy;
            for (const bullet of _enemyBullets) {
                _ctx.fillRect(
                    Math.floor(bullet.x),
                    Math.floor(bullet.y),
                    BULLET_SIZE,
                    BULLET_SIZE
                );
            }

            // Heart "bullet" target
            if (_heart) {
                _renderHeartBullet(_heart);
            }
        }

        function _renderHeartBullet(h) {
            const sx = Math.floor(h.x);
            const sy = Math.floor(h.y);
            const s = 2; // scale factor

            // Blink when hit
            const blink = h.blinkMs > 0 ? (Math.floor(h.blinkMs / 40) % 2 === 0) : true;
            if (!blink) return;

            _ctx.fillStyle = '#ff4da6';

            // 7x6 heart pattern
            const pattern = [
                '0110010',
                '1111111',
                '1111111',
                '0111110',
                '0011100',
                '0001000'
            ];

            for (let r = 0; r < pattern.length; r++) {
                for (let c = 0; c < pattern[r].length; c++) {
                    if (pattern[r][c] === '1') {
                        _ctx.fillRect(sx + c * s, sy + r * s, s, s);
                    }
                }
            }

            // HP pips above (3 hits)
            const pipY = sy - 6;
            for (let i = 0; i < HEART_HP; i++) {
                _ctx.fillStyle = (i < h.hp) ? '#ffffff' : 'rgba(255,255,255,0.25)';
                _ctx.fillRect(sx + i * 6, pipY, 4, 3);
            }
        }

        function _renderSparkles() {
            if (!_sparkles.length) return;
            for (let i = 0; i < _sparkles.length; i++) {
                const p = _sparkles[i];
                const a = _clamp(p.lifeMs / p.maxLifeMs, 0, 1);
                _ctx.save();
                _ctx.globalAlpha = Math.min(1, a);
                _ctx.fillStyle = p.color;

                const x = Math.round(p.x);
                const y = Math.round(p.y);
                const s = p.size;

                // Tiny pixel star/cross
                _ctx.fillRect(x, y, 1 * s, 1 * s);
                _ctx.fillRect(x - 1 * s, y, 1 * s, 1 * s);
                _ctx.fillRect(x + 1 * s, y, 1 * s, 1 * s);
                _ctx.fillRect(x, y - 1 * s, 1 * s, 1 * s);
                _ctx.fillRect(x, y + 1 * s, 1 * s, 1 * s);

                _ctx.restore();
            }
        }

        function _renderFloppyAnim() {
            if (!_floppyAnim || !_floppyAnim.active) return;

            const now = performance.now();
            const elapsed = now - _floppyAnim.startMs;
            const duration = _floppyAnim.durationMs;

            const phaseA = 350;
            const phaseB = duration - phaseA;

            let x = _floppyAnim.fromX;
            let y = _floppyAnim.fromY;
            let scale = 1;
            let alpha = 1;

            if (elapsed <= phaseA) {
                const t = _clamp(elapsed / phaseA, 0, 1);
                scale = 0.6 + (1.15 - 0.6) * _easeOutElastic(t);
            } else {
                const t = _clamp((elapsed - phaseA) / phaseB, 0, 1);
                const e = _easeInOutCubic(t);
                x = _floppyAnim.fromX + (_floppyAnim.toX - _floppyAnim.fromX) * e;
                y = _floppyAnim.fromY + (_floppyAnim.toY - _floppyAnim.fromY) * e - Math.sin(Math.PI * t) * 34;
                scale = 1.15 + (0.35 - 1.15) * e;
                alpha = 1 - 0.05 * e;
            }

            _ctx.save();
            _ctx.globalAlpha = alpha;
            _ctx.textAlign = 'center';
            _ctx.textBaseline = 'middle';

            const baseSize = 72;
            const sizePx = Math.max(10, Math.round(baseSize * scale));
            _ctx.font = `bold ${sizePx}px Arial, sans-serif`;
            _ctx.fillStyle = '#ffffff';
            _ctx.fillText('💾', Math.round(x), Math.round(y));
            _ctx.restore();

            if (_foundTextLeftMs > 0) {
                const t2 = _clamp(_foundTextLeftMs / 400, 0, 1);
                _ctx.save();
                _ctx.globalAlpha = Math.min(1, t2);
                CanvasRenderer.drawText('FOUND 💾!', _floppyAnim.fromX, _floppyAnim.fromY + 54, {
                    color: COLORS.accent,
                    size: 16,
                    align: 'center'
                });
                _ctx.restore();
            }
        }
        
        function _renderUI() {
            // HP display
            const hpX = 20;
            const hpY = 20;
            
            CanvasRenderer.drawText('HP', hpX, hpY, {
                color: COLORS.textDim,
                size: 10,
                align: 'left'
            });
            
            // HP hearts/boxes
            for (let i = 0; i < PLAYER_MAX_HP; i++) {
                const color = i < _player.hp ? COLORS.hp : COLORS.hpLost;
                CanvasRenderer.drawRect(hpX + i * 18, hpY + 14, 14, 14, color);
            }
            
            // Kills
            CanvasRenderer.drawText('KILLS', hpX, hpY + 45, {
                color: COLORS.textDim,
                size: 10,
                align: 'left'
            });
            CanvasRenderer.drawText(`${_kills}/${KILLS_TO_WIN}`, hpX, hpY + 61, {
                color: COLORS.accent,
                size: 14,
                align: 'left'
            });
            
            // Score
            CanvasRenderer.drawText('SCORE', hpX, hpY + 90, {
                color: COLORS.textDim,
                size: 10,
                align: 'left'
            });
            CanvasRenderer.drawText(_score.toString(), hpX, hpY + 106, {
                color: COLORS.text,
                size: 14,
                align: 'left'
            });
            
            // Controls hint
            const hintX = _canvas.width - 20;
            CanvasRenderer.drawText('ARROWS: MOVE', hintX, 20, {
                color: COLORS.textDim,
                size: 8,
                align: 'right'
            });
            CanvasRenderer.drawText('A/SPACE: SHOOT', hintX, 34, {
                color: COLORS.textDim,
                size: 8,
                align: 'right'
            });
        }
        
        function _renderGameOver() {
            CanvasRenderer.fade(0.7);
            
            CanvasRenderer.drawText('GAME OVER', _canvas.width / 2, _canvas.height / 2 - 40, {
                color: COLORS.accent,
                size: 24,
                align: 'center'
            });
            
            CanvasRenderer.drawText(`Kills: ${_kills}/${KILLS_TO_WIN}`, _canvas.width / 2, _canvas.height / 2, {
                color: COLORS.text,
                size: 12,
                align: 'center'
            });
            
            CanvasRenderer.drawText(`Score: ${_score}`, _canvas.width / 2, _canvas.height / 2 + 25, {
                color: COLORS.textDim,
                size: 10,
                align: 'center'
            });
        }
        
        function _renderVictory() {
            CanvasRenderer.fade(0.5);
            
            CanvasRenderer.drawText('MISSION COMPLETE', _canvas.width / 2, _canvas.height / 2 - 40, {
                color: COLORS.accent,
                size: 24,
                align: 'center'
            });
            
            CanvasRenderer.drawText(`Kills: ${_kills}`, _canvas.width / 2, _canvas.height / 2, {
                color: COLORS.text,
                size: 12,
                align: 'center'
            });
            
            CanvasRenderer.drawText(`Final Score: ${_score}`, _canvas.width / 2, _canvas.height / 2 + 25, {
                color: COLORS.text,
                size: 12,
                align: 'center'
            });
        }
        
        function _renderPauseOverlay() {
            CanvasRenderer.fade(0.5);
            
            CanvasRenderer.drawText('PAUSED', _canvas.width / 2, _canvas.height / 2, {
                color: COLORS.accent,
                size: 24,
                align: 'center'
            });
        }
        
        // =========================================
        // LIFECYCLE METHODS
        // =========================================
        
        function pause() {
            console.log('[Contra3] Paused');
            _isPaused = true;
        }
        
        function resume() {
            console.log('[Contra3] Resumed');
            _isPaused = false;
            _lastTime = performance.now();
        }
        
        function stop() {
            console.log('[Contra3] Stopped');
            _isRunning = false;
            _isGameOver = false;

            _resetFloppyFX();
            _heart = null;
            
            if (_animationId) {
                cancelAnimationFrame(_animationId);
                _animationId = null;
            }
            
            if (_restartTimeout) {
                clearTimeout(_restartTimeout);
                _restartTimeout = null;
            }
            
            window.removeEventListener('keydown', _handleKeyDown);
            window.removeEventListener('keyup', _handleKeyUp);
        }
        
        function destroy() {
            console.log('[Contra3] Destroyed');
            stop();
        }
        
        // =========================================
        // RETURN GAME INSTANCE
        // =========================================
        
        return {
            init,
            start,
            pause,
            resume,
            stop,
            destroy,
            
            getState: () => ({
                isRunning: _isRunning,
                isPaused: _isPaused,
                isGameOver: _isGameOver,
                isVictory: _isVictory,
                kills: _kills,
                score: _score,
                playerHP: _player.hp,
                enemies: _enemies.length,
                bullets: _playerBullets.length + _enemyBullets.length
            })
        };
    }
    
    // =========================================
    // REGISTER GAME
    // =========================================
    
    GameLoader.registerGame('contra3', createContra3Game);
    
    console.log('[Contra3] Game module loaded');
    
    // TODO: Future extensions
    // - Add power-ups (spread shot, rapid fire, shield)
    // - Add boss enemy at the end
    // - Add jumping mechanic
    // - Add different weapon types
    // - Add sound effects
    // - Add screen shake on hit
    
})();
