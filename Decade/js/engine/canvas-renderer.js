/**
 * canvas-renderer.js
 * Canvas rendering utilities for mini-games
 * Provides pixel-perfect rendering, sprite handling, and effects
 */

const CanvasRenderer = (function() {
    'use strict';
    
    // Canvas references
    let _canvas = null;
    let _ctx = null;
    
    // Rendering settings
    const CONFIG = {
        // Fixed internal resolution (16:9). Do not change on resize.
        nativeWidth: 960,
        nativeHeight: 540,
        
        // Pixel size multiplier (for chunky pixels)
        pixelScale: 1,
        
        // Background color
        backgroundColor: '#000000'
    };
    
    // =========================================
    // INITIALIZATION
    // =========================================
    
    /**
     * Initialize the canvas renderer
     * @param {string} canvasId - Canvas element ID
     * @returns {CanvasRenderingContext2D} Canvas context
     */
    function init(canvasId = 'game-canvas') {
        _canvas = document.getElementById(canvasId);
        
        if (!_canvas) {
            console.error(`[CanvasRenderer] Canvas #${canvasId} not found`);
            return null;
        }
        
        _canvas.width = CONFIG.nativeWidth;
        _canvas.height = CONFIG.nativeHeight;
        
        _ctx = _canvas.getContext('2d');
        
        // Disable image smoothing for pixel-perfect rendering
        _ctx.imageSmoothingEnabled = false;
        _ctx.webkitImageSmoothingEnabled = false;
        _ctx.mozImageSmoothingEnabled = false;
        _ctx.msImageSmoothingEnabled = false;
        
        console.log('[CanvasRenderer] Initialized');
        
        return _ctx;
    }
    
    /**
     * Size canvas CSS to fit container. On mobile, fill container (100% + cover).
     * Internal buffer stays at nativeWidth x nativeHeight.
     * @param {string} [containerSelector='#canvas-container'] - Container element selector
     */
    function resizeToContainer(containerSelector = '#canvas-container') {
        if (!_canvas) return;
        const container = document.querySelector(containerSelector);
        if (!container) return;
        
        const isMobile = window.matchMedia('(max-width: 899px), (pointer: coarse)').matches;
        
        if (isMobile) {
            _canvas.style.width = '100%';
            _canvas.style.height = 'auto';
            _canvas.style.maxWidth = '100%';
            _canvas.style.maxHeight = '100%';
            _canvas.style.objectFit = 'contain';
            _canvas.style.objectPosition = 'center';
            _canvas.style.display = 'block';
            return;
        }
        
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const r = CONFIG.nativeWidth / CONFIG.nativeHeight;
        
        let w = cw;
        let h = cw / r;
        if (h > ch) {
            h = ch;
            w = ch * r;
        }
        
        _canvas.style.width = w + 'px';
        _canvas.style.height = h + 'px';
        _canvas.style.maxWidth = '100%';
        _canvas.style.maxHeight = '100%';
        _canvas.style.objectFit = 'contain';
        _canvas.style.display = 'block';
    }
    
    /**
     * Get the canvas context
     * @returns {CanvasRenderingContext2D}
     */
    function getContext() {
        return _ctx;
    }
    
    /**
     * Get the canvas element
     * @returns {HTMLCanvasElement}
     */
    function getCanvas() {
        return _canvas;
    }
    
    // =========================================
    // DRAWING UTILITIES
    // =========================================
    
    /**
     * Clear the entire canvas
     * @param {string} [color] - Fill color (optional)
     */
    function clear(color = CONFIG.backgroundColor) {
        _ctx.fillStyle = color;
        _ctx.fillRect(0, 0, _canvas.width, _canvas.height);
    }
    
    /**
     * Draw a filled rectangle
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {string} color - Fill color
     */
    function drawRect(x, y, width, height, color) {
        _ctx.fillStyle = color;
        _ctx.fillRect(
            Math.floor(x),
            Math.floor(y),
            Math.floor(width),
            Math.floor(height)
        );
    }
    
    /**
     * Draw a rectangle outline
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {string} color - Stroke color
     * @param {number} [lineWidth=1] - Line width
     */
    function drawRectOutline(x, y, width, height, color, lineWidth = 1) {
        _ctx.strokeStyle = color;
        _ctx.lineWidth = lineWidth;
        _ctx.strokeRect(
            Math.floor(x) + 0.5,
            Math.floor(y) + 0.5,
            Math.floor(width),
            Math.floor(height)
        );
    }
    
    /**
     * Draw text with pixel font
     * @param {string} text - Text to draw
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {Object} options - Text options
     */
    function drawText(text, x, y, options = {}) {
        const {
            color = '#ffffff',
            size = 16,
            align = 'left',
            baseline = 'top',
            font = 'Press Start 2P'
        } = options;
        
        _ctx.fillStyle = color;
        _ctx.font = `${size}px "${font}"`;
        _ctx.textAlign = align;
        _ctx.textBaseline = baseline;
        
        _ctx.fillText(text, Math.floor(x), Math.floor(y));
    }
    
    /**
     * Draw a sprite/image
     * @param {HTMLImageElement} image - Image to draw
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} [width] - Width (optional, uses image width)
     * @param {number} [height] - Height (optional, uses image height)
     */
    function drawSprite(image, x, y, width, height) {
        if (!image || !image.complete) return;
        
        const w = width || image.width;
        const h = height || image.height;
        
        _ctx.drawImage(
            image,
            Math.floor(x),
            Math.floor(y),
            Math.floor(w),
            Math.floor(h)
        );
    }
    
    /**
     * Draw a portion of a sprite sheet
     * @param {HTMLImageElement} image - Sprite sheet image
     * @param {number} sx - Source X
     * @param {number} sy - Source Y
     * @param {number} sw - Source width
     * @param {number} sh - Source height
     * @param {number} dx - Destination X
     * @param {number} dy - Destination Y
     * @param {number} dw - Destination width
     * @param {number} dh - Destination height
     */
    function drawSpriteRegion(image, sx, sy, sw, sh, dx, dy, dw, dh) {
        if (!image || !image.complete) return;
        
        _ctx.drawImage(
            image,
            sx, sy, sw, sh,
            Math.floor(dx),
            Math.floor(dy),
            Math.floor(dw),
            Math.floor(dh)
        );
    }
    
    /**
     * Draw a line
     * @param {number} x1 - Start X
     * @param {number} y1 - Start Y
     * @param {number} x2 - End X
     * @param {number} y2 - End Y
     * @param {string} color - Line color
     * @param {number} [lineWidth=1] - Line width
     */
    function drawLine(x1, y1, x2, y2, color, lineWidth = 1) {
        _ctx.strokeStyle = color;
        _ctx.lineWidth = lineWidth;
        _ctx.beginPath();
        _ctx.moveTo(Math.floor(x1) + 0.5, Math.floor(y1) + 0.5);
        _ctx.lineTo(Math.floor(x2) + 0.5, Math.floor(y2) + 0.5);
        _ctx.stroke();
    }
    
    /**
     * Draw a circle
     * @param {number} x - Center X
     * @param {number} y - Center Y
     * @param {number} radius - Radius
     * @param {string} color - Fill color
     */
    function drawCircle(x, y, radius, color) {
        _ctx.fillStyle = color;
        _ctx.beginPath();
        _ctx.arc(Math.floor(x), Math.floor(y), radius, 0, Math.PI * 2);
        _ctx.fill();
    }
    
    // =========================================
    // PIXEL ART EFFECTS
    // =========================================
    
    /**
     * Draw a pixel-art style border
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {string} color - Border color
     * @param {number} [thickness=4] - Border thickness
     */
    function drawPixelBorder(x, y, width, height, color, thickness = 4) {
        // Top
        drawRect(x, y, width, thickness, color);
        // Bottom
        drawRect(x, y + height - thickness, width, thickness, color);
        // Left
        drawRect(x, y, thickness, height, color);
        // Right
        drawRect(x + width - thickness, y, thickness, height, color);
    }
    
    /**
     * Apply a flash effect (screen flash)
     * @param {string} color - Flash color
     * @param {number} alpha - Flash opacity (0-1)
     */
    function flash(color, alpha = 0.5) {
        _ctx.globalAlpha = alpha;
        _ctx.fillStyle = color;
        _ctx.fillRect(0, 0, _canvas.width, _canvas.height);
        _ctx.globalAlpha = 1;
    }
    
    /**
     * Apply a fade effect
     * @param {number} alpha - Fade opacity (0 = transparent, 1 = opaque black)
     */
    function fade(alpha) {
        _ctx.globalAlpha = alpha;
        _ctx.fillStyle = '#000000';
        _ctx.fillRect(0, 0, _canvas.width, _canvas.height);
        _ctx.globalAlpha = 1;
    }
    
    // =========================================
    // STATE MANAGEMENT
    // =========================================
    
    /**
     * Save canvas state
     */
    function save() {
        _ctx.save();
    }
    
    /**
     * Restore canvas state
     */
    function restore() {
        _ctx.restore();
    }
    
    /**
     * Set global alpha
     * @param {number} alpha - Alpha value (0-1)
     */
    function setAlpha(alpha) {
        _ctx.globalAlpha = alpha;
    }
    
    // =========================================
    // LOADING SCREEN
    // Placeholder for loading/transition states
    // =========================================
    
    /**
     * Draw a loading screen
     * @param {string} message - Loading message
     * @param {number} [progress] - Progress percentage (0-100)
     */
    function drawLoadingScreen(message = 'LOADING...', progress = null) {
        clear('#0a0a1a');
        
        // Draw message
        drawText(message, _canvas.width / 2, _canvas.height / 2 - 20, {
            color: '#888888',
            size: 12,
            align: 'center',
            baseline: 'middle'
        });
        
        // Draw progress bar if provided
        if (progress !== null) {
            const barWidth = 200;
            const barHeight = 8;
            const barX = (_canvas.width - barWidth) / 2;
            const barY = _canvas.height / 2 + 20;
            
            // Background
            drawRect(barX, barY, barWidth, barHeight, '#222222');
            
            // Progress
            const fillWidth = (barWidth * progress) / 100;
            drawRect(barX, barY, fillWidth, barHeight, '#e94560');
        }
    }
    
    // =========================================
    // PLACEHOLDER DEMO
    // TODO: Remove in production
    // =========================================
    
    /**
     * Draw a placeholder game screen (for testing)
     * @param {number} level - Level number
     */
    function drawPlaceholder(level = 1) {
        const era = StateManager.getEraForLevel(level);
        
        // Era-based colors
        const colors = {
            snes: { bg: '#2d1b4e', accent: '#cc3366', text: '#ffdd00' },
            n64: { bg: '#0f1f18', accent: '#5cffc7', text: '#ffd86b' },
            ps2: { bg: '#0a0a1a', accent: '#0066ff', text: '#00d4ff' }
        };
        
        const c = colors[era];
        
        clear(c.bg);
        
        // Grid pattern
        for (let x = 0; x < _canvas.width; x += 40) {
            drawLine(x, 0, x, _canvas.height, c.accent + '22', 1);
        }
        for (let y = 0; y < _canvas.height; y += 40) {
            drawLine(0, y, _canvas.width, y, c.accent + '22', 1);
        }
        
        // Border
        drawPixelBorder(20, 20, _canvas.width - 40, _canvas.height - 40, c.accent, 4);
        
        // Center text
        drawText(`LEVEL ${level}`, _canvas.width / 2, _canvas.height / 2 - 40, {
            color: c.text,
            size: 24,
            align: 'center'
        });
        
        drawText('MINI-GAME PLACEHOLDER', _canvas.width / 2, _canvas.height / 2 + 10, {
            color: '#ffffff',
            size: 12,
            align: 'center'
        });
        
        drawText(`ERA: ${era.toUpperCase()}`, _canvas.width / 2, _canvas.height / 2 + 50, {
            color: c.accent,
            size: 10,
            align: 'center'
        });
        
        drawText('Press SPACE to complete level', _canvas.width / 2, _canvas.height - 60, {
            color: '#666666',
            size: 8,
            align: 'center'
        });
    }
    
    // Public API
    return {
        // Initialization
        init,
        getContext,
        getCanvas,
        resizeToContainer,
        
        // Drawing
        clear,
        drawRect,
        drawRectOutline,
        drawText,
        drawSprite,
        drawSpriteRegion,
        drawLine,
        drawCircle,
        drawPixelBorder,
        
        // Effects
        flash,
        fade,
        
        // State
        save,
        restore,
        setAlpha,
        
        // Screens
        drawLoadingScreen,
        drawPlaceholder,
        
        // Config
        CONFIG
    };
})();

// Make available globally
window.CanvasRenderer = CanvasRenderer;
