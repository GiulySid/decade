/**
 * hud-controller.js
 * Controls the HUD (Heads-Up Display) bar
 * Updates level number, year, score, and other status info
 */

const HudController = (function() {
    'use strict';
    
    // DOM element references
    let _elements = {
        hud: null,
        level: null,
        year: null,
        title: null,
        score: null,
        collectibles: null,
        toast: null
    };
    
    // Current displayed values (for animation comparison)
    let _currentValues = {
        level: 0,
        year: 0,
        score: 0
    };
    
    // =========================================
    // INITIALIZATION
    // =========================================
    
    /**
     * Initialize HUD controller
     */
    function init() {
        // Cache DOM elements
        _elements.hud = document.getElementById('hud');
        _elements.level = document.getElementById('hud-level');
        _elements.year = document.getElementById('hud-year');
        _elements.title = document.getElementById('hud-title');
        _elements.score = document.getElementById('hud-score');

        // Inject collectibles UI next to score (no HTML changes required)
        if (_elements.score && !_elements.collectibles) {
            const span = document.createElement('span');
            span.id = 'hud-collectibles';
            span.className = 'hud__collectibles';
            span.textContent = '';
            _elements.score.insertAdjacentElement('afterend', span);
            _elements.collectibles = span;
        }

        // Small toast (e.g. "FOUND 💾") for collectible feedback
        if (_elements.hud && !_elements.toast) {
            const toast = document.createElement('div');
            toast.id = 'hud-toast';
            toast.className = 'hud__toast';
            toast.textContent = '';
            _elements.hud.appendChild(toast);
            _elements.toast = toast;
        }
        
        // Subscribe to events
        EventBus.on(EventBus.Events.UI_HUD_UPDATE, _handleUpdate);
        EventBus.on(EventBus.Events.MINIGAME_SCORE, _handleScoreChange);
        EventBus.on(EventBus.Events.LEVEL_LOAD, _handleLevelLoad);
        EventBus.on(EventBus.Events.ERA_CHANGE, _handleEraChange);
        EventBus.on(EventBus.Events.COLLECTIBLE_COLLECTED, _handleCollectibleCollected);
        
        console.log('[HudController] Initialized');

        // Initial render
        _renderCollectiblesHUD();
    }
    
    // =========================================
    // UPDATE METHODS
    // =========================================
    
    /**
     * Update the level display
     * @param {number} level - Level number (1-10)
     */
    function setLevel(level) {
        if (_elements.level) {
            const formatted =
                (level === 4.5) ? '4B' :
                (level === 7.5) ? '7B' :
                (level === 10.5) ? '10B' :
                String(level).padStart(2, '0');
            _elements.level.textContent = formatted;
            _currentValues.level = level;
        }
    }
    
    /**
     * Update the year display
     * @param {number} year - Year (2016-2026)
     */
    function setYear(year) {
        if (_elements.year) {
            _elements.year.textContent = year;
            _currentValues.year = year;
        }
    }
    
    /**
     * Update the title
     * @param {string} title - Title text
     */
    function setTitle(title) {
        if (_elements.title) {
            _elements.title.textContent = title;
        }
    }
    
    /**
     * Update the score display
     * @param {number} score - Score value
     * @param {boolean} [animate=true] - Whether to animate the change
     */
    function setScore(score, animate = true) {
        if (!_elements.score) return;
        
        const formatted = String(score).padStart(4, '0');
        
        if (animate && score > _currentValues.score) {
            // Add pulse animation class
            _elements.score.classList.add('hud__value--updating');
            
            // Remove after animation
            setTimeout(() => {
                _elements.score.classList.remove('hud__value--updating');
            }, 200);
        }
        
        _elements.score.textContent = formatted;
        _currentValues.score = score;

        _renderCollectiblesHUD();
    }
    
    /**
     * Update multiple HUD values at once
     * @param {Object} data - Object with level, year, score properties
     */
    function update(data) {
        if (data.level !== undefined) setLevel(data.level);
        if (data.year !== undefined) setYear(data.year);
        if (data.score !== undefined) setScore(data.score, false);
        if (data.title !== undefined) setTitle(data.title);

        _renderCollectiblesHUD();
    }
    
    // =========================================
    // VISIBILITY
    // =========================================
    
    /**
     * Show the HUD
     */
    function show() {
        if (_elements.hud) {
            _elements.hud.style.display = 'flex';
        }
    }
    
    /**
     * Hide the HUD
     */
    function hide() {
        if (_elements.hud) {
            _elements.hud.style.display = 'none';
        }
    }
    
    // =========================================
    // EVENT HANDLERS
    // =========================================
    
    function _handleUpdate(data) {
        update(data);
    }
    
    function _handleScoreChange(data) {
        setScore(data.total, true);
    }
    
    function _handleLevelLoad(data) {
        const config = LevelConfig.getLevel(data.level);
        if (config) {
            setLevel(data.level);
            setYear(config.year);
        }
        _renderCollectiblesHUD();
    }

    function _handleEraChange() {
        _renderCollectiblesHUD();
    }

    let _toastTimer = null;
    function _handleCollectibleCollected(payload) {
        _renderCollectiblesHUD();

        // Only show a toast for actual new collection
        if (!_elements.toast || !payload) return;
        const icon = payload.icon || (typeof StateManager !== 'undefined' && StateManager.getCollectibleIconForEraKey
            ? StateManager.getCollectibleIconForEraKey(payload.eraKey)
            : '');
        const total = payload.total || (typeof StateManager !== 'undefined' && StateManager.getCollectibleTotalForEraKey
            ? StateManager.getCollectibleTotalForEraKey(payload.eraKey)
            : 0);
        const msg = `FOUND ${icon} (${payload.count}/${total || '?'})`;
        _showToast(msg);
    }

    function _renderCollectiblesHUD() {
        if (!_elements.collectibles) return;
        if (typeof StateManager === 'undefined') return;

        const lvl = StateManager.getCurrentLevel ? StateManager.getCurrentLevel() : 0;
        const eraKey = (StateManager.getEraKeyForLevel) ? StateManager.getEraKeyForLevel(lvl) : null;
        if (!eraKey) {
            _elements.collectibles.textContent = '';
            return;
        }

        const icon = (StateManager.getCollectibleIconForEraKey) ? StateManager.getCollectibleIconForEraKey(eraKey) : '';
        const count = (StateManager.getCollectibleCountForEraKey) ? StateManager.getCollectibleCountForEraKey(eraKey) : 0;
        _elements.collectibles.textContent = (count > 0 && icon) ? icon.repeat(count) : '';
    }

    function _showToast(text) {
        if (!_elements.toast) return;

        _elements.toast.textContent = text;
        _elements.toast.classList.add('hud__toast--visible');

        if (_toastTimer) clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => {
            if (!_elements.toast) return;
            _elements.toast.classList.remove('hud__toast--visible');
        }, 1200);
    }
    
    // Public API
    return {
        init,
        setLevel,
        setYear,
        setTitle,
        setScore,
        update,
        show,
        hide
    };
})();

// Make available globally
window.HudController = HudController;
