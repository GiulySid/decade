/**
 * timeline-sprite-controller.js
 * Controls the couple sprite that appears on the current timeline node
 * Handles single image per year with bobbing animation
 */

const TimelineSpriteController = (function() {
    'use strict';
    
    // =========================================
    // PRIVATE STATE
    // =========================================
    
    // DOM elements
    let _spriteContainer = null;
    let _spriteElement = null;
    
    // Current sprite state
    let _currentLevel = null;
    let _spriteConfig = null;
    
    // Animation
    let _bobAnimationId = null;
    let _bobOffset = 0;
    let _bobDirection = -1; // -1 = going up, 1 = going down
    
    // Preloaded images
    const _loadedImages = new Map();
    
    // =========================================
    // INITIALIZATION
    // =========================================
    
    /**
     * Initialize the sprite controller
     */
    function init() {
        // Create sprite container element
        _createSpriteElement();
        
        // Subscribe to level changes
        EventBus.on(EventBus.Events.LEVEL_LOAD, _handleLevelChange);
        EventBus.on(EventBus.Events.UI_TIMELINE_UPDATE, _handleTimelineUpdate);
        
        // Initial positioning (if level already set)
        // Use small delay to ensure DOM is fully rendered
        setTimeout(() => {
            const currentLevel = StateManager.getCurrentLevel();
            if (currentLevel) {
                _currentLevel = null; // Force update
                _updateSprite(
                    currentLevel === 4.5 ? 4 :
                    currentLevel === 7.5 ? 7 :
                    currentLevel === 10.5 ? 10 :
                    currentLevel
                );
            }
        }, 100);
        
        console.log('[TimelineSpriteController] Initialized');
    }
    
    /**
     * Force refresh sprite position (for debugging/resize)
     */
    function refresh() {
        if (_currentLevel) {
            const level = _currentLevel;
            _currentLevel = null; // Force update
            _updateSprite(level);
        }
    }
    
    /**
     * Create the sprite DOM elements
     * Note: Not appended yet - _positionSprite will append to the correct node
     * @private
     */
    function _createSpriteElement() {
        // Remove existing sprite if any (for re-init)
        const existing = document.querySelector('.timeline-couple-sprite');
        if (existing) {
            existing.remove();
        }
        
        // Create container
        _spriteContainer = document.createElement('div');
        _spriteContainer.className = 'timeline-couple-sprite';
        _spriteContainer.setAttribute('aria-hidden', 'true');
        
        // Create img element
        _spriteElement = document.createElement('img');
        _spriteElement.className = 'timeline-couple-sprite__img';
        _spriteElement.alt = '';
        _spriteElement.draggable = false;
        
        _spriteContainer.appendChild(_spriteElement);
        
        // Note: Container will be appended to the node in _positionSprite
    }
    
    // =========================================
    // SPRITE UPDATES
    // =========================================
    
    /**
     * Update sprite for a level
     * @param {number} levelNum - Level number
     * @private
     */
    function _updateSprite(levelNum) {
        if (_currentLevel === levelNum) return;
        
        // Remove sprite-active class from previous node
        if (_currentLevel) {
            const prevNode = TimelineController.getNodeElement(_currentLevel);
            if (prevNode) {
                prevNode.classList.remove('timeline__node--has-sprite');
            }
        }
        
        _currentLevel = levelNum;
        _spriteConfig = LevelConfig.getSpriteForLevel(levelNum);
        
        if (!_spriteConfig) {
            console.warn(`[TimelineSpriteController] No sprite for level ${levelNum}`);
            hide();
            return;
        }
        
        // Add sprite-active class to current node (hides the dot)
        const currentNode = TimelineController.getNodeElement(levelNum);
        if (currentNode) {
            currentNode.classList.add('timeline__node--has-sprite');
        }
        
        // Update sprite image
        _applySpriteStyle();
        
        // Position over current node (after image loads)
        _spriteElement.onload = () => {
            _positionSprite(levelNum);
            // Start animation after positioning
            _startAnimation();
        };
        
        // Also position immediately if image is cached
        if (_spriteElement.complete && _spriteElement.naturalWidth > 0) {
            _positionSprite(levelNum);
            _startAnimation();
        }
        
        // Show the sprite
        show();
        
        console.log(`[TimelineSpriteController] Sprite updated for level ${levelNum} (${_spriteConfig.era}, year ${_spriteConfig.year})`);
    }
    
    /**
     * Apply sprite image and fixed dimensions
     * @private
     */
    function _applySpriteStyle() {
        if (!_spriteElement || !_spriteConfig) return;
        
        const { src, width, height, era } = _spriteConfig;
        
        // Set the image source
        _spriteElement.src = src;
        
        // Set fixed display size (64x64)
        _spriteElement.style.width = `${width}px`;
        _spriteElement.style.height = `${height}px`;
        
        // Update era class on container for era-specific styling
        _spriteContainer.className = 'timeline-couple-sprite';
        _spriteContainer.classList.add(`timeline-couple-sprite--${era}`);
    }
    
    /**
     * Position sprite over the current timeline node's dot
     * Instead of complex calculations, append sprite directly to the node
     * @param {number} levelNum - Level number
     * @private
     */
    function _positionSprite(levelNum) {
        if (!_spriteContainer || !_spriteConfig || !_spriteElement) return;
        
        // Get node element from TimelineController
        const nodeElement = TimelineController.getNodeElement(levelNum);
        
        if (!nodeElement) {
            console.warn(`[TimelineSpriteController] Node element not found for level ${levelNum}`);
            return;
        }
        
        // Move sprite container INTO the node element
        // This makes positioning much simpler - just center within the node
        nodeElement.appendChild(_spriteContainer);
        
        // Reset any previous absolute positioning
        _spriteContainer.style.left = '';
        _spriteContainer.style.top = '';
    }
    
    // =========================================
    // ANIMATION
    // =========================================
    
    /**
     * Start bobbing animation using JS interval
     * @private
     */
    function _startAnimation() {
        _stopAnimation(); // Clear any existing animation
        
        if (!_spriteContainer) return;
        
        // Start bobbing animation using JS interval
        _bobOffset = 0;
        _bobDirection = -1; // Start going up
        const bobHeight = 5; // pixels to move
        const bobSpeed = 300; // ms per step (600ms full cycle)
        
        _bobAnimationId = setInterval(() => {
            if (_bobDirection === -1) {
                _bobOffset = -bobHeight;
                _bobDirection = 1;
            } else {
                _bobOffset = 0;
                _bobDirection = -1;
            }
            _spriteContainer.style.marginTop = `${_bobOffset}px`;
        }, bobSpeed);
    }
    
    /**
     * Stop animation
     * @private
     */
    function _stopAnimation() {
        if (_bobAnimationId) {
            clearInterval(_bobAnimationId);
            _bobAnimationId = null;
        }
        
        if (_spriteContainer) {
            _spriteContainer.classList.remove('timeline-couple-sprite--animated');
            _spriteContainer.style.marginTop = ''; // Reset margin
        }
    }
    
    // =========================================
    // VISIBILITY
    // =========================================
    
    /**
     * Show the sprite
     */
    function show() {
        if (_spriteContainer) {
            _spriteContainer.classList.add('timeline-couple-sprite--visible');
        }
    }
    
    /**
     * Hide the sprite
     */
    function hide() {
        if (_spriteContainer) {
            _spriteContainer.classList.remove('timeline-couple-sprite--visible');
        }
        _stopAnimation();
    }
    
    // =========================================
    // PRELOADING
    // =========================================
    
    /**
     * Preload all sprite images
     * @returns {Promise} Resolves when all sprites are loaded
     */
    function preloadSprites() {
        const paths = LevelConfig.getAllSpritePaths();
        const promises = [];
        
        paths.forEach(path => {
            const promise = new Promise((resolve) => {
                const img = new Image();
                
                img.onload = () => {
                    _loadedImages.set(path, img);
                    console.log(`[TimelineSpriteController] Preloaded: ${path} (${img.width}x${img.height})`);
                    resolve(img);
                };
                
                img.onerror = () => {
                    console.warn(`[TimelineSpriteController] Failed to load: ${path}`);
                    resolve(null);
                };
                
                img.src = path;
            });
            
            promises.push(promise);
        });
        
        return Promise.all(promises);
    }
    
    /**
     * Check if a sprite is loaded
     * @param {string} path - Path to sprite
     * @returns {boolean}
     */
    function isLoaded(path) {
        return _loadedImages.has(path);
    }
    
    // =========================================
    // EVENT HANDLERS
    // =========================================
    
    function _handleLevelChange(data) {
        if (data.level) {
            _updateSprite(
                data.level === 4.5 ? 4 :
                data.level === 7.5 ? 7 :
                data.level === 10.5 ? 10 :
                data.level
            );
        }
    }
    
    function _handleTimelineUpdate(data) {
        if (data.currentLevel && data.currentLevel !== _currentLevel) {
            _updateSprite(
                data.currentLevel === 4.5 ? 4 :
                data.currentLevel === 7.5 ? 7 :
                data.currentLevel === 10.5 ? 10 :
                data.currentLevel
            );
        }
    }
    
    // =========================================
    // PUBLIC API
    // =========================================
    
    return {
        init,
        show,
        hide,
        refresh,
        preloadSprites,
        isLoaded
    };
})();

// Make available globally
window.TimelineSpriteController = TimelineSpriteController;
