/**
 * _template.js
 * Template for creating new mini-games
 * 
 * Copy this file and rename to your game ID (e.g., game-01-catch.js)
 * Then implement the required methods.
 * 
 * USAGE:
 * 1. Copy this file to games/your-game-id.js
 * 2. Replace 'template' with your game ID in GameLoader.registerGame()
 * 3. Implement the game logic in the factory function
 * 4. Update level-config.js to use your gameId
 */

(function() {
    'use strict';
    
    /**
     * Game factory function
     * @param {Object} config - Level configuration from level-config.js
     * @returns {Object} Game instance with required methods
     */
    function createGame(config) {
        // =========================================
        // GAME STATE
        // =========================================
        
        let _isRunning = false;
        let _isPaused = false;
        let _animationId = null;
        let _lastTime = 0;
        
        // Game-specific state
        let _score = 0;
        let _gameTime = 0;
        const _timeLimit = (config.config?.timeLimit || 60) * 1000; // Convert to ms
        
        // =========================================
        // CANVAS & RENDERER
        // =========================================
        
        const _ctx = CanvasRenderer.getContext();
        const _canvas = CanvasRenderer.getCanvas();
        
        // =========================================
        // GAME OBJECTS
        // TODO: Define your game objects here
        // =========================================
        
        /*
        const player = {
            x: 400,
            y: 400,
            width: 32,
            height: 32,
            speed: 5
        };
        
        const enemies = [];
        const collectibles = [];
        */
        
        // =========================================
        // INPUT HANDLING
        // =========================================
        
        const _keys = {};
        
        function _handleKeyDown(e) {
            _keys[e.code] = true;
            
            // TODO: Add game-specific key handling
        }
        
        function _handleKeyUp(e) {
            _keys[e.code] = false;
        }
        
        // =========================================
        // GAME LOGIC
        // =========================================
        
        /**
         * Initialize game state
         */
        function init() {
            console.log(`[Game] Initializing: ${config.gameId}`);
            
            _score = 0;
            _gameTime = 0;
            _isRunning = false;
            _isPaused = false;
            
            // TODO: Initialize game objects
            // player.x = _canvas.width / 2;
            // player.y = _canvas.height - 50;
            // enemies.length = 0;
            // collectibles.length = 0;
            
            // Render initial state
            _render();
        }
        
        /**
         * Start the game loop
         */
        function start() {
            console.log(`[Game] Starting: ${config.gameId}`);
            
            _isRunning = true;
            _isPaused = false;
            _lastTime = performance.now();
            
            // Add input listeners
            window.addEventListener('keydown', _handleKeyDown);
            window.addEventListener('keyup', _handleKeyUp);
            
            // Start game loop
            _gameLoop();
        }
        
        /**
         * Main game loop
         */
        function _gameLoop(currentTime = performance.now()) {
            if (!_isRunning) return;
            
            // Calculate delta time
            const deltaTime = currentTime - _lastTime;
            _lastTime = currentTime;
            
            if (!_isPaused) {
                _update(deltaTime);
                _render();
            }
            
            _animationId = requestAnimationFrame(_gameLoop);
        }
        
        /**
         * Update game state
         * @param {number} dt - Delta time in milliseconds
         */
        function _update(dt) {
            // Update game time
            _gameTime += dt;
            
            // Check time limit
            if (_timeLimit > 0 && _gameTime >= _timeLimit) {
                _endGame(true); // Time's up - complete level
                return;
            }
            
            // TODO: Update game objects
            // _updatePlayer(dt);
            // _updateEnemies(dt);
            // _checkCollisions();
            
            // Update HUD score
            StateManager.updateLevelData({ score: _score });
        }
        
        /**
         * Render game state
         */
        function _render() {
            // Clear canvas
            CanvasRenderer.clear('#1a1a2e');
            
            // TODO: Render game objects
            // _renderBackground();
            // _renderPlayer();
            // _renderEnemies();
            // _renderCollectibles();
            // _renderUI();
            
            // Placeholder render
            CanvasRenderer.drawText(
                `${config.title || 'GAME'} - Level ${config.level}`,
                _canvas.width / 2,
                _canvas.height / 2 - 40,
                { color: '#ffffff', size: 16, align: 'center' }
            );
            
            CanvasRenderer.drawText(
                `Score: ${_score}`,
                _canvas.width / 2,
                _canvas.height / 2,
                { color: '#ffdd00', size: 12, align: 'center' }
            );
            
            const timeLeft = Math.max(0, Math.ceil((_timeLimit - _gameTime) / 1000));
            CanvasRenderer.drawText(
                `Time: ${timeLeft}s`,
                _canvas.width / 2,
                _canvas.height / 2 + 30,
                { color: '#888888', size: 10, align: 'center' }
            );
            
            CanvasRenderer.drawText(
                'Press SPACE to complete (placeholder)',
                _canvas.width / 2,
                _canvas.height - 50,
                { color: '#666666', size: 8, align: 'center' }
            );
        }
        
        /**
         * End the game
         * @param {boolean} success - Whether player won
         */
        function _endGame(success) {
            _isRunning = false;
            
            EventBus.emit(EventBus.Events.MINIGAME_END, {
                success: success,
                score: _score,
                time: _gameTime
            });
        }
        
        /**
         * Pause the game
         */
        function pause() {
            console.log(`[Game] Paused: ${config.gameId}`);
            _isPaused = true;
        }
        
        /**
         * Resume the game
         */
        function resume() {
            console.log(`[Game] Resumed: ${config.gameId}`);
            _isPaused = false;
            _lastTime = performance.now();
        }
        
        /**
         * Stop the game
         */
        function stop() {
            console.log(`[Game] Stopped: ${config.gameId}`);
            _isRunning = false;
            
            if (_animationId) {
                cancelAnimationFrame(_animationId);
                _animationId = null;
            }
            
            // Remove input listeners
            window.removeEventListener('keydown', _handleKeyDown);
            window.removeEventListener('keyup', _handleKeyUp);
        }
        
        /**
         * Clean up game resources
         */
        function destroy() {
            console.log(`[Game] Destroyed: ${config.gameId}`);
            stop();
            
            // TODO: Clean up any other resources
            // - Remove event listeners
            // - Clear intervals/timeouts
            // - Release audio/sprites
        }
        
        // =========================================
        // RETURN GAME INSTANCE
        // Required methods: init, start, pause, resume, stop, destroy
        // =========================================
        
        return {
            init,
            start,
            pause,
            resume,
            stop,
            destroy,
            
            // Optional: expose for debugging
            getState: () => ({
                isRunning: _isRunning,
                isPaused: _isPaused,
                score: _score,
                gameTime: _gameTime
            })
        };
    }
    
    // =========================================
    // REGISTER GAME
    // Change 'template' to your actual game ID
    // =========================================
    
    // GameLoader.registerGame('your-game-id', createGame);
    
    // Uncomment above and comment below when creating actual game:
    console.log('[GameTemplate] Template loaded - copy and modify for new games');
    
})();
