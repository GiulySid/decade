/**
 * tetris.js
 * SNES-style Tetris mini-game for Level 1 (2016)
 * 
 * Win condition: Clear 10 lines
 * Lose condition: Stack reaches top
 */

(function() {
    'use strict';
    
    /**
     * Tetris game factory
     * @param {Object} config - Level configuration
     * @returns {Object} Game instance
     */
    function createTetrisGame(config) {
        // =========================================
        // CONSTANTS
        // =========================================
        
        const BOARD_COLS = 10;
        const BOARD_ROWS = 20;
        const CELL_SIZE = 20;  // pixels per cell
        const LINES_TO_WIN = 10;
        
        // SNES-style color palette
        const COLORS = {
            background: '#1a1c2c',
            grid: '#3b2d5a',
            border: '#f2c14e',
            text: '#f4f1de',
            textDim: '#8b8b8b',
            
            // Tetromino colors (SNES palette)
            I: '#00b8d4',  // Cyan
            O: '#ffd600',  // Yellow
            T: '#aa00ff',  // Purple
            S: '#00c853',  // Green
            Z: '#ff1744',  // Red
            J: '#2979ff',  // Blue
            L: '#ff9100',  // Orange
            
            // Ghost piece
            ghost: 'rgba(255, 255, 255, 0.2)',
            
            // Effects
            flash: '#ffffff'
        };
        
        // Tetromino shapes (each rotation state)
        // Format: [rotation0, rotation1, rotation2, rotation3]
        // Each rotation is array of [row, col] offsets from piece origin
        const TETROMINOES = {
            I: {
                shape: [
                    [[0,0], [0,1], [0,2], [0,3]],
                    [[0,1], [1,1], [2,1], [3,1]],
                    [[1,0], [1,1], [1,2], [1,3]],
                    [[0,2], [1,2], [2,2], [3,2]]
                ],
                color: COLORS.I
            },
            O: {
                shape: [
                    [[0,0], [0,1], [1,0], [1,1]],
                    [[0,0], [0,1], [1,0], [1,1]],
                    [[0,0], [0,1], [1,0], [1,1]],
                    [[0,0], [0,1], [1,0], [1,1]]
                ],
                color: COLORS.O
            },
            T: {
                shape: [
                    [[0,1], [1,0], [1,1], [1,2]],
                    [[0,0], [1,0], [1,1], [2,0]],
                    [[0,0], [0,1], [0,2], [1,1]],
                    [[0,1], [1,0], [1,1], [2,1]]
                ],
                color: COLORS.T
            },
            S: {
                shape: [
                    [[0,1], [0,2], [1,0], [1,1]],
                    [[0,0], [1,0], [1,1], [2,1]],
                    [[1,1], [1,2], [2,0], [2,1]],
                    [[0,0], [1,0], [1,1], [2,1]]
                ],
                color: COLORS.S
            },
            Z: {
                shape: [
                    [[0,0], [0,1], [1,1], [1,2]],
                    [[0,1], [1,0], [1,1], [2,0]],
                    [[1,0], [1,1], [2,1], [2,2]],
                    [[0,1], [1,0], [1,1], [2,0]]
                ],
                color: COLORS.Z
            },
            J: {
                shape: [
                    [[0,0], [1,0], [1,1], [1,2]],
                    [[0,0], [0,1], [1,0], [2,0]],
                    [[0,0], [0,1], [0,2], [1,2]],
                    [[0,1], [1,1], [2,0], [2,1]]
                ],
                color: COLORS.J
            },
            L: {
                shape: [
                    [[0,2], [1,0], [1,1], [1,2]],
                    [[0,0], [1,0], [2,0], [2,1]],
                    [[0,0], [0,1], [0,2], [1,0]],
                    [[0,0], [0,1], [1,1], [2,1]]
                ],
                color: COLORS.L
            }
        };
        
        const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
        
        // Scoring
        const SCORE_TABLE = {
            1: 100,   // Single
            2: 300,   // Double
            3: 500,   // Triple
            4: 800    // Tetris
        };
        const SOFT_DROP_POINTS = 1;
        const HARD_DROP_POINTS = 2;
        
        // Speed (ms per drop) - decreases as level increases
        const BASE_DROP_INTERVAL = 1000;
        const MIN_DROP_INTERVAL = 100;
        const SPEED_INCREASE_PER_LINE = 50;
        
        // =========================================
        // GAME STATE
        // =========================================
        
        let _isRunning = false;
        let _isPaused = false;
        let _isGameOver = false;
        let _animationId = null;
        let _lastTime = 0;
        let _dropTimer = 0;
        let _dropInterval = BASE_DROP_INTERVAL;
        
        // Board state (2D array, null = empty, otherwise color)
        let _board = [];
        
        // Current piece
        let _currentPiece = null;
        let _currentX = 0;
        let _currentY = 0;
        let _currentRotation = 0;
        
        // Next piece preview
        let _nextPieceType = null;
        
        // Stats
        let _score = 0;
        let _linesCleared = 0;
        let _gameStartTime = 0;
        
        // Line clear animation
        let _clearingLines = [];
        let _clearAnimationTimer = 0;
        const CLEAR_ANIMATION_DURATION = 300;
        
        // Restart timeout
        let _restartTimeout = null;

        // =========================================
        // COLLECTIBLE: FLOPPY DISK (💾) CELEBRATION
        // =========================================
        // Award rule (practical): 4-line clear ("Tetris") counts as the special event.
        // Must award only once, persist via StateManager.collectItem.

        let _hasAwardedFloppy = false;

        // UI target position for "fly to HUD" (actually to this game's UI score area)
        let _uiScoreX = 0;
        let _uiScoreY = 0;
        let _uiFloppyTargetX = 0;
        let _uiFloppyTargetY = 0;

        // Animation state
        let _floppyAnim = null; // { startMs, durationMs, fromX, fromY, toX, toY, active }
        let _sparkles = [];     // particle array
        let _sparkleStreamLeftMs = 0;
        let _sparkleSpawnAcc = 0;

        let _shakeTimeLeftMs = 0;
        let _shakeDurationMs = 0;
        let _shakeIntensityPx = 0;
        let _shakeX = 0;
        let _shakeY = 0;

        let _foundTextLeftMs = 0;
        
        // Canvas refs
        const _ctx = CanvasRenderer.getContext();
        const _canvas = CanvasRenderer.getCanvas();
        
        // Board positioning (centered on canvas)
        let _boardX = 0;
        let _boardY = 0;
        
        // =========================================
        // INITIALIZATION
        // =========================================
        
        function init() {
            console.log('[Tetris] Initializing...');

            // Keep pixel crispness for effects too
            if (_ctx) _ctx.imageSmoothingEnabled = false;
            
            // Calculate board position (centered, slightly left to make room for UI)
            const boardWidth = BOARD_COLS * CELL_SIZE;
            const boardHeight = BOARD_ROWS * CELL_SIZE;
            _boardX = (_canvas.width - boardWidth) / 2 - 60;
            _boardY = (_canvas.height - boardHeight) / 2;

            // Cache this game's UI score position (used for floppy "fly to HUD" animation)
            const uiX = _boardX + BOARD_COLS * CELL_SIZE + 30;
            _uiScoreX = uiX;
            _uiScoreY = _boardY + 16;
            _uiFloppyTargetX = uiX + 70;
            _uiFloppyTargetY = _boardY + 18;
            
            // Reset state
            _resetGame();
            
            // Initial render
            _render();
        }
        
        function _resetGame() {
            // Sync collectible state from global StateManager (persistent)
            _syncFloppyAwardedFromState();

            // Reset celebration FX for a clean restart
            _resetFloppyEffects();

            // Clear board
            _board = [];
            for (let row = 0; row < BOARD_ROWS; row++) {
                _board.push(new Array(BOARD_COLS).fill(null));
            }
            
            // Reset stats
            _score = 0;
            _linesCleared = 0;
            _dropInterval = BASE_DROP_INTERVAL;
            _dropTimer = 0;
            _isGameOver = false;
            _clearingLines = [];
            
            // Spawn first pieces
            _nextPieceType = _randomPieceType();
            _spawnPiece();
        }

        function _syncFloppyAwardedFromState() {
            // If already collected (via prior run or debug '-'), do not award again.
            try {
                if (typeof StateManager !== 'undefined' && typeof StateManager.isCollected === 'function') {
                    _hasAwardedFloppy = !!StateManager.isCollected('era1', 1);
                } else {
                    _hasAwardedFloppy = false;
                }
            } catch (_) {
                _hasAwardedFloppy = false;
            }
        }

        function _resetFloppyEffects() {
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
        
        // =========================================
        // PIECE MANAGEMENT
        // =========================================
        
        function _randomPieceType() {
            return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
        }
        
        function _spawnPiece() {
            _currentPiece = _nextPieceType;
            _nextPieceType = _randomPieceType();
            _currentRotation = 0;
            
            // Start position (centered at top)
            _currentX = Math.floor(BOARD_COLS / 2) - 2;
            _currentY = 0;
            
            // Check if spawn position is valid (game over if not)
            if (!_isValidPosition(_currentX, _currentY, _currentRotation)) {
                _gameOver();
            }
        }
        
        function _getCurrentShape() {
            return TETROMINOES[_currentPiece].shape[_currentRotation];
        }
        
        function _getCurrentColor() {
            return TETROMINOES[_currentPiece].color;
        }
        
        // =========================================
        // COLLISION DETECTION
        // =========================================
        
        function _isValidPosition(x, y, rotation) {
            const shape = TETROMINOES[_currentPiece].shape[rotation];
            
            for (const [dr, dc] of shape) {
                const newRow = y + dr;
                const newCol = x + dc;
                
                // Check bounds
                if (newCol < 0 || newCol >= BOARD_COLS || newRow >= BOARD_ROWS) {
                    return false;
                }
                
                // Check collision with placed pieces (only if on board)
                if (newRow >= 0 && _board[newRow][newCol] !== null) {
                    return false;
                }
            }
            
            return true;
        }
        
        // =========================================
        // PIECE MOVEMENT
        // =========================================
        
        function _moveLeft() {
            if (_isValidPosition(_currentX - 1, _currentY, _currentRotation)) {
                _currentX--;
                return true;
            }
            return false;
        }
        
        function _moveRight() {
            if (_isValidPosition(_currentX + 1, _currentY, _currentRotation)) {
                _currentX++;
                return true;
            }
            return false;
        }
        
        function _moveDown() {
            if (_isValidPosition(_currentX, _currentY + 1, _currentRotation)) {
                _currentY++;
                return true;
            }
            return false;
        }
        
        function _rotate(clockwise = true) {
            const newRotation = clockwise 
                ? (_currentRotation + 1) % 4 
                : (_currentRotation + 3) % 4;
            
            // Try normal rotation
            if (_isValidPosition(_currentX, _currentY, newRotation)) {
                _currentRotation = newRotation;
                return true;
            }
            
            // Simple wall kicks: try shifting left/right
            const kicks = [-1, 1, -2, 2];
            for (const kick of kicks) {
                if (_isValidPosition(_currentX + kick, _currentY, newRotation)) {
                    _currentX += kick;
                    _currentRotation = newRotation;
                    return true;
                }
            }
            
            return false;
        }
        
        function _softDrop() {
            if (_moveDown()) {
                _score += SOFT_DROP_POINTS;
                _updateHUD();
                return true;
            }
            return false;
        }
        
        function _hardDrop() {
            let dropDistance = 0;
            while (_moveDown()) {
                dropDistance++;
            }
            _score += dropDistance * HARD_DROP_POINTS;
            _updateHUD();
            _lockPiece();
        }
        
        function _getGhostY() {
            let ghostY = _currentY;
            while (_isValidPosition(_currentX, ghostY + 1, _currentRotation)) {
                ghostY++;
            }
            return ghostY;
        }
        
        // =========================================
        // PIECE LOCKING & LINE CLEARING
        // =========================================
        
        function _lockPiece() {
            const shape = _getCurrentShape();
            const color = _getCurrentColor();
            
            // Place piece on board
            for (const [dr, dc] of shape) {
                const row = _currentY + dr;
                const col = _currentX + dc;
                if (row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS) {
                    _board[row][col] = color;
                }
            }
            
            // Check for line clears
            _checkLineClears();
        }
        
        function _checkLineClears() {
            _clearingLines = [];
            
            for (let row = BOARD_ROWS - 1; row >= 0; row--) {
                if (_board[row].every(cell => cell !== null)) {
                    _clearingLines.push(row);
                }
            }
            
            if (_clearingLines.length > 0) {
                // Start clear animation
                _clearAnimationTimer = CLEAR_ANIMATION_DURATION;
            } else {
                // No lines to clear, spawn next piece
                _spawnPiece();
            }
        }
        
        function _finishLineClear() {
            const numLines = _clearingLines.length;

            // Collectible trigger: 4-line clear (Tetris) counts as the "5 lines at once" special event.
            if (numLines === 4) {
                _triggerFloppyAward();
            }
            
            // Remove cleared lines (from bottom to top)
            _clearingLines.sort((a, b) => b - a);
            for (const row of _clearingLines) {
                _board.splice(row, 1);
                _board.unshift(new Array(BOARD_COLS).fill(null));
            }
            
            // Update stats
            _linesCleared += numLines;
            _score += SCORE_TABLE[numLines] || 0;
            
            // Increase speed
            _dropInterval = Math.max(
                MIN_DROP_INTERVAL,
                BASE_DROP_INTERVAL - (_linesCleared * SPEED_INCREASE_PER_LINE)
            );
            
            _clearingLines = [];
            _updateHUD();
            
            // Check win condition
            if (_linesCleared >= LINES_TO_WIN) {
                _winGame();
                return;
            }
            
            // Spawn next piece
            _spawnPiece();
        }

        function _triggerFloppyAward() {
            // Only once, ever (persistent)
            if (_hasAwardedFloppy) return;

            // If already collected in persistent state, do not animate.
            if (typeof StateManager !== 'undefined' && typeof StateManager.isCollected === 'function') {
                if (StateManager.isCollected('era1', 1)) {
                    _hasAwardedFloppy = true;
                    return;
                }
            }

            // Set immediately to avoid double triggers while animation is playing
            _hasAwardedFloppy = true;

            // Persist collectible + let HUD update itself
            try {
                if (typeof StateManager !== 'undefined' && typeof StateManager.collectItem === 'function') {
                    StateManager.collectItem({ eraKey: 'era1', level: 1, itemId: 'floppy' });
                }
            } catch (_) {
                // non-fatal
            }

            // Initialize animation: center -> UI score area
            const startX = _boardX + (BOARD_COLS * CELL_SIZE) / 2;
            const startY = _boardY + (BOARD_ROWS * CELL_SIZE) / 2;
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

            // Strong camera shake
            _shakeDurationMs = 450;
            _shakeTimeLeftMs = 450;
            _shakeIntensityPx = 10;

            // Lots of sparkles (burst + short stream)
            _spawnSparkleBurst(startX, startY, _randInt(120, 220));
            _sparkleStreamLeftMs = 400;
            _sparkleSpawnAcc = 0;

            // Optional text
            _foundTextLeftMs = 400;
        }
        
        // =========================================
        // GAME END CONDITIONS
        // =========================================
        
        function _gameOver() {
            console.log('[Tetris] Game Over!');
            _isGameOver = true;
            
            // Auto-restart after delay
            _restartTimeout = setTimeout(() => {
                if (_isGameOver) {
                    console.log('[Tetris] Auto-restarting...');
                    _resetGame();
                    _isRunning = true;
                    _gameStartTime = performance.now();
                    _lastTime = performance.now();
                    _gameLoop();
                }
            }, 2000); // 2 second delay to show game over screen
        }
        
        function _winGame() {
            console.log('[Tetris] Victory!');
            _isRunning = false;
            
            const duration = performance.now() - _gameStartTime;
            
            // Emit win event
            EventBus.emit(EventBus.Events.MINIGAME_END, {
                success: true,
                score: _score,
                linesCleared: _linesCleared,
                time: duration
            });
        }
        
        // =========================================
        // INPUT HANDLING
        // =========================================
        
        function _handleKeyDown(e) {
            if (_isPaused || _isGameOver || _clearingLines.length > 0) return;
            
            switch (e.code) {
                case 'ArrowLeft':
                case 'KeyA':
                    _moveLeft();
                    e.preventDefault();
                    break;
                    
                case 'ArrowRight':
                case 'KeyD':
                    _moveRight();
                    e.preventDefault();
                    break;
                    
                case 'ArrowDown':
                case 'KeyS':
                    _softDrop();
                    _dropTimer = 0; // Reset drop timer on soft drop
                    e.preventDefault();
                    break;
                    
                case 'ArrowUp':
                case 'KeyX':
                    _rotate(true);  // Clockwise
                    e.preventDefault();
                    break;
                    
                case 'KeyZ':
                    _rotate(false); // Counter-clockwise
                    e.preventDefault();
                    break;
                    
                case 'Space':
                    _hardDrop();
                    e.preventDefault();
                    break;
                    
                // Debug: Skip level
                case 'NumpadMultiply':
                case 'Digit8': // Shift+8 = *
                    if (e.shiftKey || e.code === 'NumpadMultiply') {
                        _winGame();
                        e.preventDefault();
                    }
                    break;
            }
        }
        
        // =========================================
        // GAME LOOP
        // =========================================
        
        function start() {
            console.log('[Tetris] Starting game...');
            
            _isRunning = true;
            _isPaused = false;
            _gameStartTime = performance.now();
            _lastTime = performance.now();
            
            // Add input listeners
            window.addEventListener('keydown', _handleKeyDown);
            
            // Start game loop
            _gameLoop();
        }
        
        function _gameLoop(currentTime = performance.now()) {
            if (!_isRunning) return;
            
            const dt = currentTime - _lastTime;
            _lastTime = currentTime;
            
            if (!_isPaused && !_isGameOver) {
                _update(dt);
            }
            
            _render();
            
            _animationId = requestAnimationFrame(_gameLoop);
        }
        
        function _update(dt) {
            // Update celebration effects even during line clear animation
            _updateFloppyEffects(dt);

            // Handle line clear animation
            if (_clearingLines.length > 0) {
                _clearAnimationTimer -= dt;
                if (_clearAnimationTimer <= 0) {
                    _finishLineClear();
                }
                return;
            }
            
            // Gravity: drop piece automatically
            _dropTimer += dt;
            if (_dropTimer >= _dropInterval) {
                _dropTimer = 0;
                
                if (!_moveDown()) {
                    // Can't move down - lock piece
                    _lockPiece();
                }
            }
        }

        // =========================================
        // FLOPPY CELEBRATION FX (shake + sparkles + fly-to-UI)
        // =========================================

        const _sparkleColors = ['#ffffff', '#fff1a8', '#ffd0df', '#a8f7ff'];

        function _rand(min, max) {
            return min + Math.random() * (max - min);
        }

        function _randInt(min, max) {
            return Math.floor(_rand(min, max + 1));
        }

        function _clamp(v, min, max) {
            return Math.max(min, Math.min(max, v));
        }

        function _easeOutCubic(t) {
            return 1 - Math.pow(1 - t, 3);
        }

        function _easeInOutCubic(t) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        // Small elastic pop for Phase A
        function _easeOutElastic(t) {
            if (t === 0) return 0;
            if (t === 1) return 1;
            const c4 = (2 * Math.PI) / 3;
            return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
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

        function _updateFloppyEffects(dtMs) {
            // Camera shake
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

            // Sparkle stream for a short time
            if (_sparkleStreamLeftMs > 0) {
                _sparkleStreamLeftMs = Math.max(0, _sparkleStreamLeftMs - dtMs);
                _sparkleSpawnAcc += dtMs;
                // Spawn ~40-60 extra particles over the stream window
                const spawnEvery = 18; // ms
                while (_sparkleSpawnAcc >= spawnEvery && _sparkleStreamLeftMs > 0) {
                    _sparkleSpawnAcc -= spawnEvery;
                    if (_floppyAnim && _floppyAnim.active) {
                        // Stream follows the floppy center early on
                        _spawnSparkleBurst(_floppyAnim.fromX, _floppyAnim.fromY, 1);
                    }
                }
            }

            // Update sparkles
            if (_sparkles.length > 0) {
                const dt = dtMs / 1000;
                const gravity = 320; // px/s^2
                for (let i = _sparkles.length - 1; i >= 0; i--) {
                    const p = _sparkles[i];
                    p.vy += gravity * dt;
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.lifeMs -= dtMs;
                    if (p.lifeMs <= 0) {
                        _sparkles.splice(i, 1);
                    }
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

                // Tiny pixel star/cross (1-3px)
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

            // Two-phase animation
            const phaseA = 350;
            const phaseB = duration - phaseA;

            let x = _floppyAnim.fromX;
            let y = _floppyAnim.fromY;
            let scale = 1;
            let alpha = 1;

            if (elapsed <= phaseA) {
                const t = _clamp(elapsed / phaseA, 0, 1);
                // Pop scale 0.6 -> 1.15 with elastic
                scale = 0.6 + (1.15 - 0.6) * _easeOutElastic(t);
            } else {
                const t = _clamp((elapsed - phaseA) / phaseB, 0, 1);
                const e = _easeInOutCubic(t);
                x = _floppyAnim.fromX + (_floppyAnim.toX - _floppyAnim.fromX) * e;
                // Slight arc upward during flight
                y = _floppyAnim.fromY + (_floppyAnim.toY - _floppyAnim.fromY) * e - Math.sin(Math.PI * t) * 34;
                scale = 1.15 + (0.35 - 1.15) * e;
                alpha = 1 - 0.05 * e;
            }

            _ctx.save();
            _ctx.globalAlpha = alpha;
            _ctx.textAlign = 'center';
            _ctx.textBaseline = 'middle';

            // Giant emoji floppy (acceptable for now)
            const baseSize = 72;
            const sizePx = Math.max(10, Math.round(baseSize * scale));
            _ctx.font = `bold ${sizePx}px Arial, sans-serif`;
            _ctx.fillStyle = '#ffffff';

            _ctx.fillText('💾', Math.round(x), Math.round(y));

            _ctx.restore();

            // Optional "FOUND 💾!" text for a short moment
            if (_foundTextLeftMs > 0) {
                const t = _clamp(_foundTextLeftMs / 400, 0, 1);
                _ctx.save();
                _ctx.globalAlpha = Math.min(1, t);
                CanvasRenderer.drawText('FOUND 💾!', _floppyAnim.fromX, _floppyAnim.fromY + 54, {
                    color: COLORS.border,
                    size: 16,
                    align: 'center'
                });
                _ctx.restore();
            }
        }
        
        function _updateHUD() {
            StateManager.updateLevelData({
                score: _score,
                linesCleared: _linesCleared,
                linesToWin: LINES_TO_WIN
            });
        }
        
        // =========================================
        // RENDERING
        // =========================================
        
        function _render() {
            // Clear canvas
            CanvasRenderer.clear(COLORS.background);

            // Apply camera shake to gameplay + UI area
            _ctx.save();
            _ctx.translate(_shakeX, _shakeY);
            
            // Draw board background and grid
            _renderBoard();
            
            // Draw placed pieces
            _renderPlacedPieces();
            
            // Draw ghost piece
            if (!_isGameOver && _clearingLines.length === 0) {
                _renderGhostPiece();
            }
            
            // Draw current piece
            if (!_isGameOver && _clearingLines.length === 0) {
                _renderCurrentPiece();
            }
            
            // Draw line clear flash effect
            if (_clearingLines.length > 0) {
                _renderLineClearEffect();
            }
            
            // Draw UI (score, next piece, etc.)
            _renderUI();

            // Celebration overlay effects (sparkles + floppy fly)
            _renderSparkles();
            _renderFloppyAnim();

            _ctx.restore();

            // Draw game over screen (no shake; clean overlay)
            if (_isGameOver) {
                _renderGameOver();
            }
            
            // Draw pause overlay (no shake; clean overlay)
            if (_isPaused) {
                _renderPauseOverlay();
            }
        }
        
        function _renderBoard() {
            const boardWidth = BOARD_COLS * CELL_SIZE;
            const boardHeight = BOARD_ROWS * CELL_SIZE;
            
            // Board background
            CanvasRenderer.drawRect(_boardX, _boardY, boardWidth, boardHeight, COLORS.grid);
            
            // Grid lines
            _ctx.strokeStyle = COLORS.background;
            _ctx.lineWidth = 1;
            
            // Vertical lines
            for (let col = 0; col <= BOARD_COLS; col++) {
                const x = _boardX + col * CELL_SIZE;
                _ctx.beginPath();
                _ctx.moveTo(x + 0.5, _boardY);
                _ctx.lineTo(x + 0.5, _boardY + boardHeight);
                _ctx.stroke();
            }
            
            // Horizontal lines
            for (let row = 0; row <= BOARD_ROWS; row++) {
                const y = _boardY + row * CELL_SIZE;
                _ctx.beginPath();
                _ctx.moveTo(_boardX, y + 0.5);
                _ctx.lineTo(_boardX + boardWidth, y + 0.5);
                _ctx.stroke();
            }
            
            // Border
            CanvasRenderer.drawRectOutline(
                _boardX - 2, 
                _boardY - 2, 
                boardWidth + 4, 
                boardHeight + 4, 
                COLORS.border, 
                4
            );
        }
        
        function _renderCell(col, row, color, isGhost = false) {
            const x = _boardX + col * CELL_SIZE;
            const y = _boardY + row * CELL_SIZE;
            
            if (isGhost) {
                // Ghost piece - just outline
                CanvasRenderer.drawRectOutline(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2, COLORS.ghost, 2);
            } else {
                // Solid block with 3D-ish effect
                // Main color
                CanvasRenderer.drawRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2, color);
                
                // Highlight (top-left)
                _ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                _ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, 3);
                _ctx.fillRect(x + 1, y + 1, 3, CELL_SIZE - 2);
                
                // Shadow (bottom-right)
                _ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                _ctx.fillRect(x + 1, y + CELL_SIZE - 4, CELL_SIZE - 2, 3);
                _ctx.fillRect(x + CELL_SIZE - 4, y + 1, 3, CELL_SIZE - 2);
            }
        }
        
        function _renderPlacedPieces() {
            for (let row = 0; row < BOARD_ROWS; row++) {
                // Skip rows being cleared
                if (_clearingLines.includes(row)) continue;
                
                for (let col = 0; col < BOARD_COLS; col++) {
                    const color = _board[row][col];
                    if (color) {
                        _renderCell(col, row, color);
                    }
                }
            }
        }
        
        function _renderCurrentPiece() {
            if (!_currentPiece) return;
            
            const shape = _getCurrentShape();
            const color = _getCurrentColor();
            
            for (const [dr, dc] of shape) {
                const row = _currentY + dr;
                const col = _currentX + dc;
                if (row >= 0) {
                    _renderCell(col, row, color);
                }
            }
        }
        
        function _renderGhostPiece() {
            if (!_currentPiece) return;
            
            const shape = _getCurrentShape();
            const ghostY = _getGhostY();
            
            // Don't render if ghost is same as current
            if (ghostY === _currentY) return;
            
            for (const [dr, dc] of shape) {
                const row = ghostY + dr;
                const col = _currentX + dc;
                if (row >= 0) {
                    _renderCell(col, row, null, true);
                }
            }
        }
        
        function _renderLineClearEffect() {
            // Flash effect on clearing lines
            const flashPhase = Math.sin(_clearAnimationTimer / CLEAR_ANIMATION_DURATION * Math.PI * 4);
            const alpha = Math.abs(flashPhase) * 0.8;
            
            _ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            
            for (const row of _clearingLines) {
                _ctx.fillRect(
                    _boardX,
                    _boardY + row * CELL_SIZE,
                    BOARD_COLS * CELL_SIZE,
                    CELL_SIZE
                );
            }
        }
        
        function _renderUI() {
            const uiX = _boardX + BOARD_COLS * CELL_SIZE + 30;
            
            // Score
            CanvasRenderer.drawText('SCORE', uiX, _boardY, {
                color: COLORS.textDim,
                size: 10,
                align: 'left'
            });
            CanvasRenderer.drawText(_score.toString(), uiX, _boardY + 16, {
                color: COLORS.text,
                size: 14,
                align: 'left'
            });
            
            // Lines
            CanvasRenderer.drawText('LINES', uiX, _boardY + 50, {
                color: COLORS.textDim,
                size: 10,
                align: 'left'
            });
            CanvasRenderer.drawText(`${_linesCleared}/${LINES_TO_WIN}`, uiX, _boardY + 66, {
                color: COLORS.border,
                size: 14,
                align: 'left'
            });
            
            // Speed level indicator
            const speedLevel = Math.floor((_linesCleared / 2)) + 1;
            CanvasRenderer.drawText('SPEED', uiX, _boardY + 100, {
                color: COLORS.textDim,
                size: 10,
                align: 'left'
            });
            CanvasRenderer.drawText(speedLevel.toString(), uiX, _boardY + 116, {
                color: COLORS.text,
                size: 14,
                align: 'left'
            });
            
            // Next piece preview
            CanvasRenderer.drawText('NEXT', uiX, _boardY + 160, {
                color: COLORS.textDim,
                size: 10,
                align: 'left'
            });
            _renderNextPiecePreview(uiX, _boardY + 180);
            
            // Controls hint
            CanvasRenderer.drawText('CONTROLS', uiX, _boardY + 280, {
                color: COLORS.textDim,
                size: 8,
                align: 'left'
            });
            CanvasRenderer.drawText('← → MOVE', uiX, _boardY + 296, {
                color: COLORS.textDim,
                size: 8,
                align: 'left'
            });
            CanvasRenderer.drawText('↓ SOFT DROP', uiX, _boardY + 310, {
                color: COLORS.textDim,
                size: 8,
                align: 'left'
            });
            CanvasRenderer.drawText('A/SPACE HARD DROP', uiX, _boardY + 324, {
                color: COLORS.textDim,
                size: 8,
                align: 'left'
            });
            CanvasRenderer.drawText('X/↑ ROTATE', uiX, _boardY + 338, {
                color: COLORS.textDim,
                size: 8,
                align: 'left'
            });
        }
        
        function _renderNextPiecePreview(x, y) {
            if (!_nextPieceType) return;
            
            const piece = TETROMINOES[_nextPieceType];
            const shape = piece.shape[0]; // Default rotation
            const color = piece.color;
            const previewCellSize = 14;
            
            // Preview box background
            CanvasRenderer.drawRect(x - 4, y - 4, 70, 70, COLORS.grid);
            CanvasRenderer.drawRectOutline(x - 4, y - 4, 70, 70, COLORS.border, 2);
            
            // Calculate offset to center piece in preview
            let minC = 3, maxC = 0, minR = 3, maxR = 0;
            for (const [r, c] of shape) {
                minC = Math.min(minC, c);
                maxC = Math.max(maxC, c);
                minR = Math.min(minR, r);
                maxR = Math.max(maxR, r);
            }
            const pieceWidth = (maxC - minC + 1) * previewCellSize;
            const pieceHeight = (maxR - minR + 1) * previewCellSize;
            const offsetX = (70 - pieceWidth) / 2 - minC * previewCellSize;
            const offsetY = (70 - pieceHeight) / 2 - minR * previewCellSize;
            
            // Draw cells
            for (const [dr, dc] of shape) {
                const cellX = x + offsetX + dc * previewCellSize;
                const cellY = y + offsetY + dr * previewCellSize;
                
                CanvasRenderer.drawRect(
                    cellX + 1, 
                    cellY + 1, 
                    previewCellSize - 2, 
                    previewCellSize - 2, 
                    color
                );
            }
        }
        
        function _renderGameOver() {
            // Darken screen
            CanvasRenderer.fade(0.7);
            
            // Game Over text
            CanvasRenderer.drawText('GAME OVER', _canvas.width / 2, _canvas.height / 2 - 40, {
                color: COLORS.border,
                size: 24,
                align: 'center'
            });
            
            CanvasRenderer.drawText(`SCORE: ${_score}`, _canvas.width / 2, _canvas.height / 2, {
                color: COLORS.text,
                size: 12,
                align: 'center'
            });
            
            CanvasRenderer.drawText(`LINES: ${_linesCleared}/${LINES_TO_WIN}`, _canvas.width / 2, _canvas.height / 2 + 25, {
                color: COLORS.textDim,
                size: 10,
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
            console.log('[Tetris] Paused');
            _isPaused = true;
        }
        
        function resume() {
            console.log('[Tetris] Resumed');
            _isPaused = false;
            _lastTime = performance.now();
        }
        
        function stop() {
            console.log('[Tetris] Stopped');
            _isRunning = false;
            _isGameOver = false; // Prevent auto-restart

            _resetFloppyEffects();
            
            if (_animationId) {
                cancelAnimationFrame(_animationId);
                _animationId = null;
            }
            
            if (_restartTimeout) {
                clearTimeout(_restartTimeout);
                _restartTimeout = null;
            }
            
            window.removeEventListener('keydown', _handleKeyDown);
        }
        
        function destroy() {
            console.log('[Tetris] Destroyed');
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
                score: _score,
                linesCleared: _linesCleared,
                dropInterval: _dropInterval
            })
        };
    }
    
    // =========================================
    // REGISTER GAME
    // =========================================
    
    GameLoader.registerGame('tetris', createTetrisGame);
    
    console.log('[Tetris] Game module loaded');
    
})();
