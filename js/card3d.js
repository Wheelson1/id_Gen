/**
 * card3d.js — 3D 360° Interactive CR80 ID Card Engine
 * Ebonyi State University Digital ID System
 * 
 * Enables:
 * - 360° continuous Click & Drag (Mouse + Touch) orbit inspection
 * - Smooth physics with inertia, pitch-limiting & elastic damping
 * - Instant 180° front/back 3D flip animation
 * - Dynamic specular holographic light glare reflection
 * - Automated 360° cinematic showcase spin (ideal for demos & VC pitch)
 */

(function () {
  'use strict';

  const Card3D = {
    instances: new Map(),

    /**
     * Mounts a 3D 360° interactive card viewer inside a target container.
     * @param {Object} opts
     * @param {HTMLElement|string} opts.container - DOM element or selector
     * @param {HTMLCanvasElement} [opts.frontCanvas] - Pre-rendered front canvas
     * @param {HTMLCanvasElement} [opts.backCanvas] - Pre-rendered back canvas
     * @param {Object} [opts.studentData] - Student data object to render
     * @param {Object} [opts.template] - Template config
     * @param {boolean} [opts.autoSpin=false] - Start with auto-spin active
     * @param {boolean} [opts.showControls=true] - Render control toolbar
     * @param {boolean} [opts.showHint=true] - Show "Click & Drag 360°" badge
     * @param {number} [opts.scale=0.48] - Render scale for internal canvases
     * @returns {Object} Viewer instance controller
     */
    mount(opts = {}) {
      const container = typeof opts.container === 'string'
        ? document.querySelector(opts.container)
        : opts.container;

      if (!container) {
        console.warn('Card3D.mount: container element not found.');
        return null;
      }

      // Cleanup existing instance if already mounted in container
      if (Card3D.instances.has(container)) {
        Card3D.instances.get(container).destroy();
      }

      const instance = new Card3DViewer(container, opts);
      Card3D.instances.set(container, instance);
      return instance;
    },

    /**
     * Helper to get active instance for a container
     */
    getInstance(container) {
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      return Card3D.instances.get(el);
    }
  };

  class Card3DViewer {
    constructor(container, opts) {
      this.container = container;
      this.opts = Object.assign({
        scale: 0.48,
        autoSpin: false,
        showControls: true,
        showHint: true
      }, opts);

      // State
      this.rotX = 0;       // pitch: -35 to +35 deg
      this.rotY = 0;       // yaw: 0 to 360+ deg
      this.targetRotX = 0;
      this.targetRotY = 0;
      this.isDragging = false;
      this.startX = 0;
      this.startY = 0;
      this.lastX = 0;
      this.lastY = 0;
      this.velX = 0;
      this.velY = 0;
      this.isAutoSpinning = Boolean(this.opts.autoSpin);
      this.animFrameId = null;

      this._initDOM();
      this._bindEvents();
      this._renderCanvases(opts.studentData, opts.template);

      // Start RAF loop for smooth physics
      this._loop();
    }

    _initDOM() {
      this.container.innerHTML = '';
      this.container.classList.add('card3d-stage');

      // 1. Hint pill
      if (this.opts.showHint) {
        this.hintEl = document.createElement('div');
        this.hintEl.className = 'card3d-hint-pill';
        this.hintEl.innerHTML = '<span>🖱️ Click &amp; Drag Card 360° All-Round · 📱 Touch Orbit</span>';
        this.container.appendChild(this.hintEl);
      }

      // 2. 3D Viewport
      this.viewportEl = document.createElement('div');
      this.viewportEl.className = 'card3d-viewport';

      // 3. 3D Card
      this.cardEl = document.createElement('div');
      this.cardEl.className = 'card3d-card';

      // 4. Front Face
      this.frontFaceEl = document.createElement('div');
      this.frontFaceEl.className = 'card3d-face card3d-face-front';
      this.frontCanvas = this.opts.frontCanvas || document.createElement('canvas');
      this.frontCanvas.className = 'card3d-canvas-front';
      this.frontFaceEl.appendChild(this.frontCanvas);

      // 5. Back Face
      this.backFaceEl = document.createElement('div');
      this.backFaceEl.className = 'card3d-face card3d-face-back';
      this.backCanvas = this.opts.backCanvas || document.createElement('canvas');
      this.backCanvas.className = 'card3d-canvas-back';
      this.backFaceEl.appendChild(this.backCanvas);

      // 6. Holographic Specular Glare Overlay
      this.glareEl = document.createElement('div');
      this.glareEl.className = 'card3d-glare';

      // 7. PVC Card Thickness Edge Bevel
      this.edgeEl = document.createElement('div');
      this.edgeEl.className = 'card3d-edge';

      // Assemble Card
      this.cardEl.appendChild(this.frontFaceEl);
      this.cardEl.appendChild(this.backFaceEl);
      this.cardEl.appendChild(this.glareEl);
      this.cardEl.appendChild(this.edgeEl);
      this.viewportEl.appendChild(this.cardEl);

      // 8. Ground Shadow
      this.groundShadowEl = document.createElement('div');
      this.groundShadowEl.className = 'card3d-ground-shadow';
      this.viewportEl.appendChild(this.groundShadowEl);

      this.container.appendChild(this.viewportEl);

      // 9. Interactive Controls
      if (this.opts.showControls) {
        this.controlsEl = document.createElement('div');
        this.controlsEl.className = 'card3d-controls';

        // Flip Button
        this.btnFlip = document.createElement('button');
        this.btnFlip.type = 'button';
        this.btnFlip.className = 'card3d-btn card3d-btn-gold';
        this.btnFlip.innerHTML = '<span>🔀 Flip Card</span>';
        this.btnFlip.title = 'Flip 180° between Front & Back';
        this.btnFlip.onclick = () => this.flip();

        // 360 Auto-Spin Button
        this.btnSpin = document.createElement('button');
        this.btnSpin.type = 'button';
        this.btnSpin.className = `card3d-btn ${this.isAutoSpinning ? 'is-active' : ''}`;
        this.btnSpin.innerHTML = '<span>🔄 360° Auto-Orbit</span>';
        this.btnSpin.title = 'Continuous 360° rotation showcase';
        this.btnSpin.onclick = () => this.toggleAutoSpin();

        // Reset Front Button
        this.btnReset = document.createElement('button');
        this.btnReset.type = 'button';
        this.btnReset.className = 'card3d-btn';
        this.btnReset.innerHTML = '<span>⏮ Front</span>';
        this.btnReset.title = 'Snap back to Front view';
        this.btnReset.onclick = () => this.reset();

        // Download PNG Button
        this.btnDl = document.createElement('button');
        this.btnDl.type = 'button';
        this.btnDl.className = 'card3d-btn card3d-btn-green';
        this.btnDl.innerHTML = '<span>📥 Download PNG</span>';
        this.btnDl.title = 'Download high-resolution PNG of this card';
        this.btnDl.onclick = () => {
          if (typeof this.opts.onDownload === 'function') {
            this.opts.onDownload(this);
            return;
          }
          const normY = ((this.targetRotY % 360) + 360) % 360;
          const isBack = normY > 90 && normY < 270;
          const cvs = isBack ? this.backCanvas : this.frontCanvas;
          const side = isBack ? 'BACK' : 'FRONT';
          const matricClean = (this.studentData?.matric || this.studentData?.jamb_no || 'STUDENT').replace(/\//g, '-');
          const a = document.createElement('a');
          a.href = cvs.toDataURL('image/png');
          a.download = `EBSU-ID-${matricClean}-${side}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        };

        this.controlsEl.appendChild(this.btnFlip);
        this.controlsEl.appendChild(this.btnSpin);
        this.controlsEl.appendChild(this.btnReset);
        this.controlsEl.appendChild(this.btnDl);
        this.container.appendChild(this.controlsEl);
      }
    }

    _bindEvents() {
      // Mouse Events
      this._onMouseDown = (e) => {
        if (e.button !== 0) return; // Only left click
        this._startDrag(e.clientX, e.clientY);
      };

      this._onMouseMove = (e) => {
        if (!this.isDragging) return;
        this._drag(e.clientX, e.clientY);
      };

      this._onMouseUp = () => {
        if (this.isDragging) this._endDrag();
      };

      // Touch Events
      this._onTouchStart = (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        this._startDrag(t.clientX, t.clientY);
      };

      this._onTouchMove = (e) => {
        if (!this.isDragging || e.touches.length !== 1) return;
        const t = e.touches[0];
        this._drag(t.clientX, t.clientY);
        if (e.cancelable) e.preventDefault(); // Prevent scroll while orbiting
      };

      this._onTouchEnd = () => {
        if (this.isDragging) this._endDrag();
      };

      this.viewportEl.addEventListener('mousedown', this._onMouseDown);
      window.addEventListener('mousemove', this._onMouseMove);
      window.addEventListener('mouseup', this._onMouseUp);

      this.viewportEl.addEventListener('touchstart', this._onTouchStart, { passive: false });
      window.addEventListener('touchmove', this._onTouchMove, { passive: false });
      window.addEventListener('touchend', this._onTouchEnd);
      window.addEventListener('touchcancel', this._onTouchEnd);
    }

    _startDrag(x, y) {
      this.isDragging = true;
      this.isAutoSpinning = false;
      if (this.btnSpin) this.btnSpin.classList.remove('is-active');

      this.viewportEl.classList.add('is-dragging');
      this.viewportEl.classList.remove('is-animating');

      this.startX = x;
      this.startY = y;
      this.lastX = x;
      this.lastY = y;
      this.velX = 0;
      this.velY = 0;
    }

    _drag(x, y) {
      const deltaX = x - this.lastX;
      const deltaY = y - this.lastY;

      this.velX = deltaX * 0.7;
      this.velY = deltaY * 0.7;

      // Sensitivity: ~0.45 deg per pixel drag
      this.targetRotY += deltaX * 0.55;
      this.targetRotX -= deltaY * 0.40;

      // Elastic limit for pitch (X-axis tilt) so card doesn't flip upside down
      this.targetRotX = Math.max(-36, Math.min(36, this.targetRotX));

      this.lastX = x;
      this.lastY = y;
    }

    _endDrag() {
      this.isDragging = false;
      this.viewportEl.classList.remove('is-dragging');
    }

    _renderCanvases(studentData, template) {
      if (!studentData) return;
      const tpl = template || ((typeof CardTemplate !== 'undefined' && CardTemplate.get) ? CardTemplate.get() : null);
      // High-resolution canvas render (scale 1.0 = 1011x638) so 3D face matches flat card typography perfectly
      const scale = this.opts.scale || 1.0;

      // Draw Front Card
      if (typeof drawCard === 'function') {
        drawCard(this.frontCanvas, tpl, studentData, scale);
      }

      // Draw Back Card
      if (typeof drawBackCard === 'function') {
        drawBackCard(this.backCanvas, tpl, studentData, scale);
      }
    }

    /**
     * Update card data and redraw both front & back canvases
     */
    update(studentData, template) {
      this._renderCanvases(studentData, template);
    }

    /**
     * Smoothly flips card by 180° to toggle Front/Back
     */
    flip() {
      this.isAutoSpinning = false;
      if (this.btnSpin) this.btnSpin.classList.remove('is-active');

      this.viewportEl.classList.add('is-animating');

      // Determine nearest flip position
      const normY = ((this.targetRotY % 360) + 360) % 360;
      const isFacingBack = normY > 90 && normY < 270;

      if (isFacingBack) {
        // Return to front (0° or multiple of 360°)
        this.targetRotY = Math.round(this.targetRotY / 360) * 360;
      } else {
        // Flip to back (180° or multiple)
        const base = Math.floor(this.targetRotY / 360) * 360;
        this.targetRotY = base + 180;
      }
      this.targetRotX = 0;
    }

    /**
     * Toggles automatic 360° continuous rotation showcase
     */
    toggleAutoSpin() {
      this.isAutoSpinning = !this.isAutoSpinning;
      this.viewportEl.classList.remove('is-animating');
      if (this.btnSpin) {
        this.btnSpin.classList.toggle('is-active', this.isAutoSpinning);
      }
    }

    /**
     * Resets card to default flat front view (0°, 0°)
     */
    reset() {
      this.isAutoSpinning = false;
      if (this.btnSpin) this.btnSpin.classList.remove('is-active');
      this.viewportEl.classList.add('is-animating');
      this.targetRotX = 0;
      this.targetRotY = 0;
    }

    _loop() {
      if (this.isAutoSpinning) {
        // Continuous slow cinematic 360° rotation
        this.targetRotY += 0.45;
        this.targetRotX = Math.sin(Date.now() / 1200) * 8; // Gentle breathing tilt
      } else if (!this.isDragging) {
        // Apply inertia drag dissipation
        if (Math.abs(this.velX) > 0.05) {
          this.targetRotY += this.velX;
          this.velX *= 0.92;
        }
        if (Math.abs(this.velY) > 0.05) {
          this.targetRotX -= this.velY;
          this.velY *= 0.90;
          this.targetRotX = Math.max(-36, Math.min(36, this.targetRotX));
        }
      }

      // Smooth lerp (spring interpolation)
      this.rotX += (this.targetRotX - this.rotX) * 0.18;
      this.rotY += (this.targetRotY - this.rotY) * 0.18;

      // Apply 3D transform to card
      this.cardEl.style.transform = `rotateX(${this.rotX.toFixed(2)}deg) rotateY(${this.rotY.toFixed(2)}deg)`;

      // Dynamic Specular Glare: shifts across surface according to angle
      const glareX = 50 + (this.rotY % 180) * 0.5;
      const glareY = 50 - this.rotX * 0.8;
      this.glareEl.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.08) 35%, rgba(255,255,255,0) 65%)`;

      // Dynamic ground shadow: flattens as card tilts edge-on
      const cosY = Math.abs(Math.cos((this.rotY * Math.PI) / 180));
      const shadowScaleX = 0.4 + cosY * 0.6;
      const shadowOpacity = 0.25 + cosY * 0.35;
      this.groundShadowEl.style.transform = `scaleX(${shadowScaleX.toFixed(2)}) translateY(${Math.abs(this.rotX) * 0.25}px)`;
      this.groundShadowEl.style.opacity = shadowOpacity.toFixed(2);

      this.animFrameId = requestAnimationFrame(() => this._loop());
    }

    destroy() {
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('mouseup', this._onMouseUp);
      window.removeEventListener('touchmove', this._onTouchMove);
      window.removeEventListener('touchend', this._onTouchEnd);
      window.removeEventListener('touchcancel', this._onTouchEnd);
      this.container.innerHTML = '';
      Card3D.instances.delete(this.container);
    }
  }

  // Export to global scope
  window.Card3D = Card3D;
})();
