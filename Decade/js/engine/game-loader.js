/**
 * game-loader.js
 * Dynamically loads and initializes mini-games for each level
 * Acts as a factory/registry for game modules
 */

const GameLoader = (function() {
    'use strict';
    
    // Registry of available games
    const _gameRegistry = new Map();
    
    // Currently loaded game module
    let _loadedGameScript = null;
    
    // =========================================
    // GAME REGISTRATION
    // =========================================
    
    /**
     * Register a game in the loader
     * @param {string} gameId - Unique game identifier
     * @param {Function} gameFactory - Factory function that creates game instance
     */
    function registerGame(gameId, gameFactory) {
        if (_gameRegistry.has(gameId)) {
            console.warn(`[GameLoader] Game "${gameId}" already registered, overwriting`);
        }
        
        _gameRegistry.set(gameId, gameFactory);
        console.log(`[GameLoader] Registered game: ${gameId}`);
    }
    
    /**
     * Check if a game is registered
     * @param {string} gameId - Game identifier
     * @returns {boolean}
     */
    function isRegistered(gameId) {
        return _gameRegistry.has(gameId);
    }
    
    /**
     * Get list of registered games
     * @returns {string[]}
     */
    function getRegisteredGames() {
        return Array.from(_gameRegistry.keys());
    }
    
    // =========================================
    // GAME LOADING
    // =========================================
    
    /**
     * Load and initialize a game
     * @param {string} gameId - Game identifier
     * @param {Object} config - Level configuration
     * @returns {Promise<Object>} Game instance
     */
    async function loadGame(gameId, config) {
        console.log(`[GameLoader] Loading game: ${gameId}`);
        console.log(`[GameLoader] Registry has ${_gameRegistry.size} games:`, Array.from(_gameRegistry.keys()));
        
        // Check registry first
        if (_gameRegistry.has(gameId)) {
            console.log(`[GameLoader] Game "${gameId}" found in registry`);
            return _createGameFromRegistry(gameId, config);
        }
        
        console.log(`[GameLoader] Game "${gameId}" not in registry, attempting to load script...`);
        
        // Try dynamic loading
        try {
            await _loadGameScript(gameId);
            
            if (_gameRegistry.has(gameId)) {
                console.log(`[GameLoader] Game "${gameId}" registered successfully after script load`);
                return _createGameFromRegistry(gameId, config);
            } else {
                console.warn(`[GameLoader] Game "${gameId}" script loaded but not registered. Registry now has:`, Array.from(_gameRegistry.keys()));
            }
        } catch (error) {
            console.error(`[GameLoader] Could not load game script for: ${gameId}`, error);
        }
        
        // Fallback to placeholder
        console.warn(`[GameLoader] Using placeholder for: ${gameId}`);
        return _createPlaceholderGame(config);
    }
    
    /**
     * Create game instance from registry
     * @private
     */
    function _createGameFromRegistry(gameId, config) {
        const factory = _gameRegistry.get(gameId);
        const gameInstance = factory(config);
        
        // Store reference in LevelManager
        LevelManager.setCurrentGame(gameInstance);
        
        // Initialize if method exists
        if (typeof gameInstance.init === 'function') {
            gameInstance.init();
        }
        
        return gameInstance;
    }
    
    /**
     * Dynamically load a game script
     * @private
     */
    async function _loadGameScript(gameId) {
        return new Promise((resolve, reject) => {
            // Remove previously loaded game script
            if (_loadedGameScript) {
                _loadedGameScript.remove();
                _loadedGameScript = null;
            }
            
            const script = document.createElement('script');
            script.src = `Decade/games/${gameId}.js`;
            script.onload = () => {
                _loadedGameScript = script;
                console.log(`[GameLoader] Script loaded: ${gameId}.js`);
                // Give script a moment to execute and register
                setTimeout(() => {
                    if (_gameRegistry.has(gameId)) {
                        console.log(`[GameLoader] Game "${gameId}" registered after script load`);
                    } else {
                        console.warn(`[GameLoader] Game "${gameId}" not registered after script load`);
                    }
                    resolve();
                }, 100);
            };
            script.onerror = (error) => {
                console.error(`[GameLoader] Failed to load script: Decade/games/${gameId}.js`, error);
                reject(new Error(`Failed to load game script: ${gameId}`));
            };
            
            document.body.appendChild(script);
        });
    }
    
    // =========================================
    // PLACEHOLDER GAME
    // Used when actual game isn't implemented yet
    // =========================================
    
    /**
     * Create a placeholder game for testing
     * @private
     */
    function _createPlaceholderGame(config) {
        const level = config.level || 1;
        let animationId = null;
        let isRunning = false;
        
        const game = {
            init() {
                console.log(`[PlaceholderGame] Init level ${level}`);
                CanvasRenderer.drawPlaceholder(level);
            },
            
            start() {
                console.log(`[PlaceholderGame] Start level ${level}`);
                isRunning = true;
                this._loop();
                
                // Add keyboard listener for testing
                this._keyHandler = (e) => {
                    if (e.code === 'Space' && isRunning) {
                        // Simulate completing the level
                        const score = 1000 + Math.floor(Math.random() * 500);
                        EventBus.emit(EventBus.Events.MINIGAME_END, {
                            success: true,
                            score: score
                        });
                    }
                };
                window.addEventListener('keydown', this._keyHandler);
            },
            
            _loop() {
                if (!isRunning) return;
                
                // Simple animation
                CanvasRenderer.drawPlaceholder(level);
                
                // Draw "PLAYING" indicator
                CanvasRenderer.drawText('▶ PLAYING', 40, 40, {
                    color: '#00ff00',
                    size: 10
                });
                
                animationId = requestAnimationFrame(() => this._loop());
            },
            
            pause() {
                console.log(`[PlaceholderGame] Pause`);
                isRunning = false;
                if (animationId) {
                    cancelAnimationFrame(animationId);
                }
            },
            
            resume() {
                console.log(`[PlaceholderGame] Resume`);
                isRunning = true;
                this._loop();
            },
            
            stop() {
                console.log(`[PlaceholderGame] Stop`);
                isRunning = false;
                if (animationId) {
                    cancelAnimationFrame(animationId);
                }
                if (this._keyHandler) {
                    window.removeEventListener('keydown', this._keyHandler);
                }
            },
            
            destroy() {
                this.stop();
                console.log(`[PlaceholderGame] Destroy`);
            }
        };
        
        LevelManager.setCurrentGame(game);
        game.init();
        
        return game;
    }
    
    // =========================================
    // INITIALIZATION
    // =========================================
    
    /**
     * Initialize the game loader
     */
    function init() {
        // TODO: Pre-register any inline games here
        // registerGame('example', (config) => new ExampleGame(config));
        
        console.log('[GameLoader] Initialized');
    }
    
    // Public API
    return {
        registerGame,
        isRegistered,
        getRegisteredGames,
        loadGame,
        init
    };
})();

// Make available globally
window.GameLoader = GameLoader;
