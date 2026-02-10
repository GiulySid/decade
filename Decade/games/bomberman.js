/**
 * bomberman.js
 * Classic SNES-style Bomberman mini-game for Level 2 (2017)
 * 
 * Win condition: Destroy 15 soft blocks
 * Lose condition: Player hit by explosion
 */

(function() {
    'use strict';
    
    /**
     * Bomberman game factory
     * @param {Object} config - Level configuration
     * @returns {Object} Game instance
     */
    function createBombermanGame(config) {
        // =========================================
        // CONSTANTS
        // =========================================
        
        const GRID_COLS = 13;
        const GRID_ROWS = 11;
        const BLOCKS_TO_WIN = 15;
        
        // Timing
        const BOMB_FUSE_TIME = 2000;      // ms until bomb explodes
        const EXPLOSION_DURATION = 400;   // ms explosion stays visible
        const EXPLOSION_RANGE = 2;        // tiles in each direction
        const PLAYER_MOVE_SPEED = 150;    // ms per tile movement
        
        // Tile types
        const TILE = {
            EMPTY: 0,
            SOLID: 1,
            SOFT: 2
        };
        
        // SNES-style color palette
        const COLORS = {
            background: '#1a1c2c',
            floor: '#2a2a4a',
            solidWall: '#3b2d5a',
            softBlock: '#5c4a7a',
            softBlockHighlight: '#7a6a9a',
            player: '#d97f8b',
            playerHighlight: '#f4a0aa',
            bomb: '#2a2a2a',
            bombFuse: '#ff6644',
            explosion: '#f2c14e',
            explosionCenter: '#ffffff',
            text: '#f4f1de',
            textDim: '#8b8b8b',
            border: '#f2c14e'
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
        
        // Grid state
        let _grid = [];
        let _cellSize = 0;
        let _gridOffsetX = 0;
        let _gridOffsetY = 0;
        
        // Player state
        let _player = {
            gridX: 1,
            gridY: 1,
            pixelX: 0,
            pixelY: 0,
            isMoving: false,
            moveProgress: 0,
            moveFromX: 0,
            moveFromY: 0,
            moveToX: 0,
            moveToY: 0
        };
        
        // Bombs and explosions
        let _bombs = [];
        let _explosions = [];
        
        // Stats
        let _blocksDestroyed = 0;
        let _totalSoftBlocks = 0;

        // =========================================
        // COLLECTIBLE: FLOPPY DISK (💾) (Era 1 / Level 2)
        // =========================================
        // Earn rule: Destroy 4+ soft blocks in the SAME bomb explosion.
        // Award only once (persistent via StateManager.collectItem).

        let _floppyAwarded = false;

        // UI target position for "fly to HUD" (actually to this game's UI score area)
        let _uiScoreX = 0;
        let _uiScoreY = 0;
        let _uiFloppyTargetX = 0;
        let _uiFloppyTargetY = 0;

        let _shakeTimeLeftMs = 0;
        let _shakeDurationMs = 0;
        let _shakeIntensityPx = 0;
        let _shakeX = 0;
        let _shakeY = 0;
        let _sparkles = [];
        let _sparkleStreamLeftMs = 0;
        let _sparkleSpawnAcc = 0;
        let _floppyAnim = null; // { startMs, durationMs, fromX, fromY, toX, toY, active }
        let _foundTextLeftMs = 0;
        
        // Input state
        const _keys = {};
        let _moveQueue = null;
        
        // Restart timeout
        let _restartTimeout = null;
        
        // Debug skip flag (score 0 when * used)
        let _debugSkip = false;
        
        // Canvas refs
        const _ctx = CanvasRenderer.getContext();
        const _canvas = CanvasRenderer.getCanvas();
        
        // =========================================
        // INITIALIZATION
        // =========================================
        
        function init() {
            console.log('[Bomberman] Initializing...');

            // Keep pixel crispness for FX too
            if (_ctx) _ctx.imageSmoothingEnabled = false;
            
            // Calculate cell size to fit canvas
            const maxCellWidth = Math.floor((_canvas.width - 100) / GRID_COLS);
            const maxCellHeight = Math.floor((_canvas.height - 60) / GRID_ROWS);
            _cellSize = Math.min(maxCellWidth, maxCellHeight);
            
            // Center grid on canvas
            const gridWidth = GRID_COLS * _cellSize;
            const gridHeight = GRID_ROWS * _cellSize;
            _gridOffsetX = Math.floor((_canvas.width - gridWidth) / 2);
            _gridOffsetY = Math.floor((_canvas.height - gridHeight) / 2);

            // Cache this game's UI score position (used for floppy "fly to HUD" animation)
            // Matches _renderUI() constants: uiX=20, uiY=20, score value at (uiX, uiY+66)
            const uiX = 20;
            const uiY = 20;
            _uiScoreX = uiX;
            _uiScoreY = uiY + 66;
            _uiFloppyTargetX = uiX + 70;
            _uiFloppyTargetY = _uiScoreY + 2;
            
            // Reset game
            _resetGame();
            
            // Initial render
            _render();
        }
        
        function _resetGame() {
            _isGameOver = false;
            _isVictory = false;
            _blocksDestroyed = 0;
            _bombs = [];
            _explosions = [];

            // Sync collectible state (persistent) and reset local FX
            _syncFloppyAwardedFromState();
            _resetFloppyFX();
            
            // Generate map
            _generateMap();
            
            // Reset player position
            _player.gridX = 1;
            _player.gridY = 1;
            _player.pixelX = _gridOffsetX + _player.gridX * _cellSize;
            _player.pixelY = _gridOffsetY + _player.gridY * _cellSize;
            _player.isMoving = false;
            _player.moveProgress = 0;
            
            _updateHUD();
        }

        function _syncFloppyAwardedFromState() {
            try {
                if (typeof StateManager !== 'undefined' && typeof StateManager.isCollected === 'function') {
                    _floppyAwarded = !!StateManager.isCollected('era1', 2);
                } else {
                    _floppyAwarded = false;
                }
            } catch (_) {
                _floppyAwarded = false;
            }
        }

        function _resetFloppyFX() {
            _shakeTimeLeftMs = 0;
            _shakeDurationMs = 0;
            _shakeIntensityPx = 0;
            _shakeX = 0;
            _shakeY = 0;
            _sparkles = [];
            _sparkleStreamLeftMs = 0;
            _sparkleSpawnAcc = 0;
            _floppyAnim = null;
            _foundTextLeftMs = 0;
        }
        
        // =========================================
        // MAP GENERATION
        // =========================================
        
        function _generateMap() {
            _grid = [];
            _totalSoftBlocks = 0;
            
            for (let y = 0; y < GRID_ROWS; y++) {
                _grid[y] = [];
                for (let x = 0; x < GRID_COLS; x++) {
                    // Border walls
                    if (x === 0 || x === GRID_COLS - 1 || y === 0 || y === GRID_ROWS - 1) {
                        _grid[y][x] = TILE.SOLID;
                    }
                    // Checkerboard solid walls (classic Bomberman pattern)
                    else if (x % 2 === 0 && y % 2 === 0) {
                        _grid[y][x] = TILE.SOLID;
                    }
                    // Player spawn area (top-left corner must be clear)
                    else if ((x <= 2 && y === 1) || (x === 1 && y <= 2)) {
                        _grid[y][x] = TILE.EMPTY;
                    }
                    // Random soft blocks elsewhere
                    else if (Math.random() < 0.6) {
                        _grid[y][x] = TILE.SOFT;
                        _totalSoftBlocks++;
                    }
                    else {
                        _grid[y][x] = TILE.EMPTY;
                    }
                }
            }
            
            // Ensure we have enough soft blocks
            // Ensure at least BLOCKS_TO_WIN + 5 so the map always has enough targets.
            if (_totalSoftBlocks < BLOCKS_TO_WIN + 5) {
                // Add more soft blocks if needed
                for (let y = 1; y < GRID_ROWS - 1 && _totalSoftBlocks < BLOCKS_TO_WIN + 5; y++) {
                    for (let x = 1; x < GRID_COLS - 1 && _totalSoftBlocks < BLOCKS_TO_WIN + 5; x++) {
                        if (_grid[y][x] === TILE.EMPTY && !_isPlayerSpawnArea(x, y)) {
                            _grid[y][x] = TILE.SOFT;
                            _totalSoftBlocks++;
                        }
                    }
                }
            }
        }
        
        function _isPlayerSpawnArea(x, y) {
            return (x <= 2 && y === 1) || (x === 1 && y <= 2);
        }
        
        // =========================================
        // PLAYER MOVEMENT
        // =========================================
        
        function _tryMove(dx, dy) {
            if (_player.isMoving || _isGameOver) return;
            
            const newX = _player.gridX + dx;
            const newY = _player.gridY + dy;
            
            // Check bounds and collision
            if (newX < 0 || newX >= GRID_COLS || newY < 0 || newY >= GRID_ROWS) return;
            if (_grid[newY][newX] !== TILE.EMPTY) return;
            
            // Check bomb collision
            if (_bombs.some(b => b.gridX === newX && b.gridY === newY)) return;
            
            // Start movement
            _player.isMoving = true;
            _player.moveProgress = 0;
            _player.moveFromX = _player.gridX;
            _player.moveFromY = _player.gridY;
            _player.moveToX = newX;
            _player.moveToY = newY;
        }
        
        function _updatePlayerMovement(dt) {
            if (!_player.isMoving) return;
            
            _player.moveProgress += dt / PLAYER_MOVE_SPEED;
            
            if (_player.moveProgress >= 1) {
                // Movement complete
                _player.gridX = _player.moveToX;
                _player.gridY = _player.moveToY;
                _player.pixelX = _gridOffsetX + _player.gridX * _cellSize;
                _player.pixelY = _gridOffsetY + _player.gridY * _cellSize;
                _player.isMoving = false;
                _player.moveProgress = 0;
                
                // Check if there's a queued move
                if (_moveQueue) {
                    _tryMove(_moveQueue.dx, _moveQueue.dy);
                    _moveQueue = null;
                }
            } else {
                // Interpolate position
                const t = _player.moveProgress;
                _player.pixelX = _gridOffsetX + (_player.moveFromX + (_player.moveToX - _player.moveFromX) * t) * _cellSize;
                _player.pixelY = _gridOffsetY + (_player.moveFromY + (_player.moveToY - _player.moveFromY) * t) * _cellSize;
            }
        }
        
        // =========================================
        // BOMBS
        // =========================================
        
        function _placeBomb() {
            if (_isGameOver) return;
            
            // Check if already have a bomb at this location
            if (_bombs.some(b => b.gridX === _player.gridX && b.gridY === _player.gridY)) return;
            
            // Max 1 bomb for this simple version
            if (_bombs.length >= 1) return;
            
            _bombs.push({
                gridX: _player.gridX,
                gridY: _player.gridY,
                timer: BOMB_FUSE_TIME,
                blinkPhase: 0
            });
        }
        
        function _updateBombs(dt) {
            for (let i = _bombs.length - 1; i >= 0; i--) {
                const bomb = _bombs[i];
                bomb.timer -= dt;
                bomb.blinkPhase += dt * 0.01;
                
                if (bomb.timer <= 0) {
                    // Explode!
                    _createExplosion(bomb.gridX, bomb.gridY);
                    _bombs.splice(i, 1);
                }
            }
        }
        
        // =========================================
        // EXPLOSIONS
        // =========================================
        
        function _createExplosion(centerX, centerY) {
            const affectedTiles = [];
            let destroyedThisExplosion = 0;
            let didWin = false;
            let didGameOver = false;
            
            // Center
            affectedTiles.push({ x: centerX, y: centerY });
            
            // Expand in 4 directions
            const directions = [
                { dx: -1, dy: 0 },  // Left
                { dx: 1, dy: 0 },   // Right
                { dx: 0, dy: -1 },  // Up
                { dx: 0, dy: 1 }    // Down
            ];
            
            for (const dir of directions) {
                for (let i = 1; i <= EXPLOSION_RANGE; i++) {
                    const x = centerX + dir.dx * i;
                    const y = centerY + dir.dy * i;
                    
                    // Stop at bounds
                    if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) break;
                    
                    // Stop at solid walls
                    if (_grid[y][x] === TILE.SOLID) break;
                    
                    affectedTiles.push({ x, y });
                    
                    // Stop at soft blocks (but destroy them)
                    if (_grid[y][x] === TILE.SOFT) break;
                }
            }
            
            // Process affected tiles
            for (const tile of affectedTiles) {
                // Destroy soft blocks
                if (_grid[tile.y][tile.x] === TILE.SOFT) {
                    _grid[tile.y][tile.x] = TILE.EMPTY;
                    _blocksDestroyed++;
                    destroyedThisExplosion++;
                    _updateHUD();
                    
                    // Check win condition
                    if (_blocksDestroyed >= BLOCKS_TO_WIN) {
                        didWin = true;
                    }
                }
                
                // Check player hit
                if (_isPlayerAt(tile.x, tile.y)) {
                    didGameOver = true;
                }
                
                // Add visual explosion
                _explosions.push({
                    gridX: tile.x,
                    gridY: tile.y,
                    timer: EXPLOSION_DURATION,
                    isCenter: tile.x === centerX && tile.y === centerY
                });
            }

            // Collectible trigger: 4+ soft blocks destroyed together
            if (destroyedThisExplosion >= 3) {
                _triggerFloppyAward(centerX, centerY);
            }

            // Resolve end conditions AFTER processing all tiles + award logic
            if (didGameOver) {
                _gameOver();
                return;
            }
            if (didWin) {
                _winGame();
                return;
            }
            
            // TODO: Add explosion sound effect
        }

        function _triggerFloppyAward(centerX, centerY) {
            if (_floppyAwarded) return;

            // If already collected (via prior run or debug '-'), skip.
            try {
                if (typeof StateManager !== 'undefined' && typeof StateManager.isCollected === 'function') {
                    if (StateManager.isCollected('era1', 2)) {
                        _floppyAwarded = true;
                        return;
                    }
                }
            } catch (_) {
                // ignore
            }

            _floppyAwarded = true; // prevent double trigger even if another big explosion happens

            try {
                if (typeof StateManager !== 'undefined' && typeof StateManager.collectItem === 'function') {
                    StateManager.collectItem({ eraKey: 'era1', level: 2, itemId: 'floppy' });
                }
            } catch (_) {
                // non-fatal
            }

            // Celebration FX (match Tetris: ~1200ms pop + fly)
            const startX = _gridOffsetX + (GRID_COLS * _cellSize) / 2;
            const startY = _gridOffsetY + (GRID_ROWS * _cellSize) / 2;
            const endX = _uiFloppyTargetX;
            const endY = _uiFloppyTargetY;

            _floppyAnim = {
                startMs: performance.now(),
                durationMs: 1200,
                fromX: startX,
                fromY: startY,
                toX: endX,
                toY: endY,
                active: true
            };

            _startShake(450, 10);
            _spawnSparkleBurst(startX, startY, _randInt(120, 220));
            _sparkleStreamLeftMs = 400;
            _sparkleSpawnAcc = 0;
            _foundTextLeftMs = 400;
        }

        function _startShake(durationMs, intensityPx) {
            _shakeDurationMs = durationMs;
            _shakeTimeLeftMs = durationMs;
            _shakeIntensityPx = intensityPx;
        }

        const _sparkleColors = ['#ffffff', '#fff1a8', '#ffd0df', '#a8f7ff'];

        function _rand(min, max) {
            return min + Math.random() * (max - min);
        }

        function _randInt(min, max) {
            return Math.floor(_rand(min, max + 1));
        }

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
                const spawnEvery = 18; // ms
                while (_sparkleSpawnAcc >= spawnEvery && _sparkleStreamLeftMs > 0) {
                    _sparkleSpawnAcc -= spawnEvery;
                    if (_floppyAnim && _floppyAnim.active) {
                        _spawnSparkleBurst(_floppyAnim.fromX, _floppyAnim.fromY, 1);
                    }
                }
            }

            // Sparkles
            if (_sparkles.length) {
                const dt = dtMs / 1000;
                const gravity = 340;
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

            // Found text timer
            if (_foundTextLeftMs > 0) {
                _foundTextLeftMs = Math.max(0, _foundTextLeftMs - dtMs);
            }
        }
        
        function _isPlayerAt(gridX, gridY) {
            // Check both current position and movement destination
            if (_player.gridX === gridX && _player.gridY === gridY) return true;
            if (_player.isMoving && _player.moveToX === gridX && _player.moveToY === gridY) return true;
            return false;
        }
        
        function _updateExplosions(dt) {
            for (let i = _explosions.length - 1; i >= 0; i--) {
                _explosions[i].timer -= dt;
                if (_explosions[i].timer <= 0) {
                    _explosions.splice(i, 1);
                }
            }
        }
        
        // =========================================
        // GAME END CONDITIONS
        // =========================================
        
        function _gameOver() {
            console.log('[Bomberman] Game Over!');
            _isGameOver = true;
            
            // Auto-restart after delay
            _restartTimeout = setTimeout(() => {
                if (_isGameOver) {
                    console.log('[Bomberman] Auto-restarting...');
                    _resetGame();
                    _isRunning = true;
                    _gameStartTime = performance.now();
                    _lastTime = performance.now();
                    _gameLoop();
                }
            }, 2000); // 2 second delay to show game over screen
        }
        
        function _winGame() {
            console.log('[Bomberman] Victory!');
            _isVictory = true;
            _isRunning = false;
            
            const duration = performance.now() - _gameStartTime;
            const skip = _debugSkip;
            _debugSkip = false;
            
            const score = skip ? 0 : (_blocksDestroyed * 100 + Math.floor(30000 / Math.max(1, duration)) * 100);
            
            EventBus.emit(EventBus.Events.MINIGAME_END, {
                success: true,
                score,
                blocksDestroyed: _blocksDestroyed,
                time: skip ? 0 : duration
            });
        }
        
        // =========================================
        // INPUT HANDLING
        // =========================================
        
        function _handleKeyDown(e) {
            if (_isPaused || _isGameOver) return;
            
            _keys[e.code] = true;
            
            switch (e.code) {
                case 'ArrowLeft':
                case 'KeyA':
                    if (_player.isMoving) {
                        _moveQueue = { dx: -1, dy: 0 };
                    } else {
                        _tryMove(-1, 0);
                    }
                    e.preventDefault();
                    break;
                    
                case 'ArrowRight':
                case 'KeyD':
                    if (_player.isMoving) {
                        _moveQueue = { dx: 1, dy: 0 };
                    } else {
                        _tryMove(1, 0);
                    }
                    e.preventDefault();
                    break;
                    
                case 'ArrowUp':
                case 'KeyW':
                    if (_player.isMoving) {
                        _moveQueue = { dx: 0, dy: -1 };
                    } else {
                        _tryMove(0, -1);
                    }
                    e.preventDefault();
                    break;
                    
                case 'ArrowDown':
                case 'KeyS':
                    if (_player.isMoving) {
                        _moveQueue = { dx: 0, dy: 1 };
                    } else {
                        _tryMove(0, 1);
                    }
                    e.preventDefault();
                    break;
                    
                case 'Space':
                    _placeBomb();
                    e.preventDefault();
                    break;
                    
                // Debug: Skip level (use score 0 so overlay shows 0000)
                case 'NumpadMultiply':
                case 'Digit8': // Shift+8 = *
                    if (e.shiftKey || e.code === 'NumpadMultiply') {
                        _debugSkip = true;
                        _winGame();
                        e.preventDefault();
                    }
                    break;
            }
        }
        
        function _handleKeyUp(e) {
            _keys[e.code] = false;
        }
        
        // =========================================
        // GAME LOOP
        // =========================================
        
        function start() {
            console.log('[Bomberman] Starting game...');
            
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
                // Still render final state
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
            _updatePlayerMovement(dt);
            _updateBombs(dt);
            _updateExplosions(dt);
            _updateFloppyFX(dt);
        }
        
        function _updateHUD() {
            StateManager.updateLevelData({
                score: _blocksDestroyed * 100,
                blocksDestroyed: _blocksDestroyed,
                blocksToWin: BLOCKS_TO_WIN
            });
        }
        
        // =========================================
        // RENDERING
        // =========================================
        
        function _render() {
            // Clear canvas
            CanvasRenderer.clear(COLORS.background);

            // Camera shake
            _ctx.save();
            _ctx.translate(_shakeX, _shakeY);
            
            // Draw grid
            _renderGrid();
            
            // Draw explosions (below player)
            _renderExplosions();
            
            // Draw bombs
            _renderBombs();
            
            // Draw player
            _renderPlayer();
            
            // Draw UI
            _renderUI();

            // Celebration FX overlay
            _renderSparkles();
            _renderFloppyAnim();

            _ctx.restore();
            
            // Draw game over / victory overlay
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

        function _renderSparkles() {
            if (!_sparkles.length) return;
            for (let i = 0; i < _sparkles.length; i++) {
                const p = _sparkles[i];
                const a = Math.max(0, Math.min(1, p.lifeMs / p.maxLifeMs));
                _ctx.save();
                _ctx.globalAlpha = a;
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

            // Two-phase animation (match Tetris)
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
                    color: COLORS.border,
                    size: 16,
                    align: 'center'
                });
                _ctx.restore();
            }
        }
        
        function _renderGrid() {
            for (let y = 0; y < GRID_ROWS; y++) {
                for (let x = 0; x < GRID_COLS; x++) {
                    const px = _gridOffsetX + x * _cellSize;
                    const py = _gridOffsetY + y * _cellSize;
                    
                    switch (_grid[y][x]) {
                        case TILE.EMPTY:
                            // Floor
                            CanvasRenderer.drawRect(px, py, _cellSize, _cellSize, COLORS.floor);
                            // Subtle grid lines
                            CanvasRenderer.drawRectOutline(px, py, _cellSize, _cellSize, COLORS.background, 1);
                            break;
                            
                        case TILE.SOLID:
                            // Solid wall with 3D effect
                            CanvasRenderer.drawRect(px, py, _cellSize, _cellSize, COLORS.solidWall);
                            // Highlight
                            _ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                            _ctx.fillRect(px, py, _cellSize, 3);
                            _ctx.fillRect(px, py, 3, _cellSize);
                            // Shadow
                            _ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                            _ctx.fillRect(px, py + _cellSize - 3, _cellSize, 3);
                            _ctx.fillRect(px + _cellSize - 3, py, 3, _cellSize);
                            break;
                            
                        case TILE.SOFT:
                            // Soft block with different style
                            CanvasRenderer.drawRect(px + 2, py + 2, _cellSize - 4, _cellSize - 4, COLORS.softBlock);
                            // Cross pattern
                            _ctx.fillStyle = COLORS.softBlockHighlight;
                            _ctx.fillRect(px + _cellSize/2 - 2, py + 4, 4, _cellSize - 8);
                            _ctx.fillRect(px + 4, py + _cellSize/2 - 2, _cellSize - 8, 4);
                            break;
                    }
                }
            }
            
            // Border around grid
            CanvasRenderer.drawRectOutline(
                _gridOffsetX - 2,
                _gridOffsetY - 2,
                GRID_COLS * _cellSize + 4,
                GRID_ROWS * _cellSize + 4,
                COLORS.border,
                4
            );
        }
        
        function _renderPlayer() {
            const size = _cellSize - 6;
            const x = _player.pixelX + 3;
            const y = _player.pixelY + 3;
            
            // Player body
            CanvasRenderer.drawRect(x, y, size, size, COLORS.player);
            
            // Highlight
            _ctx.fillStyle = COLORS.playerHighlight;
            _ctx.fillRect(x, y, size, 4);
            _ctx.fillRect(x, y, 4, size);
            
            // Eyes (simple)
            _ctx.fillStyle = '#ffffff';
            _ctx.fillRect(x + size * 0.25, y + size * 0.3, 4, 4);
            _ctx.fillRect(x + size * 0.6, y + size * 0.3, 4, 4);
            
            // Pupils
            _ctx.fillStyle = '#000000';
            _ctx.fillRect(x + size * 0.3, y + size * 0.35, 2, 2);
            _ctx.fillRect(x + size * 0.65, y + size * 0.35, 2, 2);
        }
        
        function _renderBombs() {
            for (const bomb of _bombs) {
                const px = _gridOffsetX + bomb.gridX * _cellSize;
                const py = _gridOffsetY + bomb.gridY * _cellSize;
                const centerX = px + _cellSize / 2;
                const centerY = py + _cellSize / 2;
                const radius = _cellSize * 0.35;
                
                // Blink effect when about to explode
                const blink = bomb.timer < 500 ? Math.sin(bomb.blinkPhase * 20) > 0 : true;
                
                if (blink) {
                    // Bomb body
                    CanvasRenderer.drawCircle(centerX, centerY, radius, COLORS.bomb);
                    
                    // Highlight
                    CanvasRenderer.drawCircle(centerX - radius * 0.3, centerY - radius * 0.3, radius * 0.2, '#444444');
                    
                    // Fuse
                    _ctx.strokeStyle = COLORS.bombFuse;
                    _ctx.lineWidth = 2;
                    _ctx.beginPath();
                    _ctx.moveTo(centerX, centerY - radius);
                    _ctx.lineTo(centerX + 4, centerY - radius - 6);
                    _ctx.stroke();
                    
                    // Fuse spark
                    if (Math.sin(bomb.blinkPhase * 15) > 0) {
                        CanvasRenderer.drawCircle(centerX + 4, centerY - radius - 6, 3, COLORS.explosion);
                    }
                }
            }
        }
        
        function _renderExplosions() {
            for (const exp of _explosions) {
                const px = _gridOffsetX + exp.gridX * _cellSize;
                const py = _gridOffsetY + exp.gridY * _cellSize;
                
                // Fade out effect
                const alpha = exp.timer / EXPLOSION_DURATION;
                
                // Explosion color
                const color = exp.isCenter ? COLORS.explosionCenter : COLORS.explosion;
                
                _ctx.globalAlpha = alpha;
                CanvasRenderer.drawRect(px + 2, py + 2, _cellSize - 4, _cellSize - 4, color);
                
                // Inner glow
                _ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                _ctx.fillRect(px + _cellSize * 0.3, py + _cellSize * 0.3, _cellSize * 0.4, _cellSize * 0.4);
                
                _ctx.globalAlpha = 1;
            }
        }
        
        function _renderUI() {
            const uiX = 20;
            const uiY = 20;
            
            // Blocks destroyed
            CanvasRenderer.drawText('BLOCKS', uiX, uiY, {
                color: COLORS.textDim,
                size: 10,
                align: 'left'
            });
            CanvasRenderer.drawText(`${_blocksDestroyed}/${BLOCKS_TO_WIN}`, uiX, uiY + 16, {
                color: COLORS.border,
                size: 14,
                align: 'left'
            });
            
            // Score
            CanvasRenderer.drawText('SCORE', uiX, uiY + 50, {
                color: COLORS.textDim,
                size: 10,
                align: 'left'
            });
            CanvasRenderer.drawText((_blocksDestroyed * 100).toString(), uiX, uiY + 66, {
                color: COLORS.text,
                size: 14,
                align: 'left'
            });
            
            // Controls hint (right side)
            const hintX = _canvas.width - 20;
            CanvasRenderer.drawText('CONTROLS', hintX, uiY, {
                color: COLORS.textDim,
                size: 8,
                align: 'right'
            });
            CanvasRenderer.drawText('ARROWS: MOVE', hintX, uiY + 14, {
                color: COLORS.textDim,
                size: 8,
                align: 'right'
            });
            CanvasRenderer.drawText('A/SPACE: BOMB', hintX, uiY + 28, {
                color: COLORS.textDim,
                size: 8,
                align: 'right'
            });
        }
        
        function _renderGameOver() {
            CanvasRenderer.fade(0.7);
            
            CanvasRenderer.drawText('GAME OVER', _canvas.width / 2, _canvas.height / 2 - 40, {
                color: COLORS.border,
                size: 24,
                align: 'center'
            });
            
            CanvasRenderer.drawText('You got caught in the explosion!', _canvas.width / 2, _canvas.height / 2, {
                color: COLORS.text,
                size: 10,
                align: 'center'
            });
            
            CanvasRenderer.drawText(`BLOCKS: ${_blocksDestroyed}/${BLOCKS_TO_WIN}`, _canvas.width / 2, _canvas.height / 2 + 30, {
                color: COLORS.textDim,
                size: 10,
                align: 'center'
            });
        }
        
        function _renderVictory() {
            CanvasRenderer.fade(0.5);
            
            CanvasRenderer.drawText('VICTORY!', _canvas.width / 2, _canvas.height / 2 - 40, {
                color: COLORS.border,
                size: 24,
                align: 'center'
            });
            
            CanvasRenderer.drawText(`Blocks destroyed: ${_blocksDestroyed}`, _canvas.width / 2, _canvas.height / 2, {
                color: COLORS.text,
                size: 12,
                align: 'center'
            });
        }
        
        function _renderPauseOverlay() {
            CanvasRenderer.fade(0.5);
            
            CanvasRenderer.drawText('PAUSED', _canvas.width / 2, _canvas.height / 2, {
                color: COLORS.border,
                size: 24,
                align: 'center'
            });
        }
        
        // =========================================
        // LIFECYCLE METHODS
        // =========================================
        
        function pause() {
            console.log('[Bomberman] Paused');
            _isPaused = true;
        }
        
        function resume() {
            console.log('[Bomberman] Resumed');
            _isPaused = false;
            _lastTime = performance.now();
        }
        
        function stop() {
            console.log('[Bomberman] Stopped');
            _isRunning = false;
            _isGameOver = false; // Prevent auto-restart

            _resetFloppyFX();
            
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
            console.log('[Bomberman] Destroyed');
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
            
            // Debug helpers
            getState: () => ({
                isRunning: _isRunning,
                isPaused: _isPaused,
                isGameOver: _isGameOver,
                isVictory: _isVictory,
                blocksDestroyed: _blocksDestroyed,
                playerPos: { x: _player.gridX, y: _player.gridY },
                bombs: _bombs.length,
                explosions: _explosions.length
            })
        };
    }
    
    // =========================================
    // REGISTER GAME
    // =========================================
    
    GameLoader.registerGame('bomberman', createBombermanGame);
    
    console.log('[Bomberman] Game module loaded');
    
    // TODO: Future extensions
    // - Add enemies (basic AI)
    // - Add power-ups (extra bombs, longer range, speed)
    // - Add multiple bomb capability
    // - Add sound effects
    // - Add exit door after clearing blocks
    
})();
