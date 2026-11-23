/*
 * lost-card-rebirth.js
 * --------------------------------------------------------------------------
 * FUTURE FEATURE: SWITCHED OFF.
 *
 * When a student reports a card lost, the old card burns on screen, falls to
 * ash, and a new card is born from the ash.
 *
 * Nothing here runs until the flag below is set to true (or CardRebirth.enable()
 * is called). The integration call at the bottom of this file is commented out.
 *
 * What it needs:  a container element, the old card and the new card (canvas,
 * image element, or data URL). Cards from another origin can taint the canvas;
 * use data URLs or same-origin images.
 *
 * It honours prefers-reduced-motion (it simply shows the new card).
 * It does not touch the server. Switching the old card off is done by the
 * server when the lost report is accepted; this file is only the animation.
 * --------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // FUTURE FEATURE FLAG: keep false until the feature ships.
  var ENABLED = false;

  // Look and timing
  var EDGE = 0.07;          // width of the glowing fire line
  var CHAR = 0.06;          // width of the charred band ahead of the fire
  var T_STAMP = 500;        // ms the stamp shows before burning starts
  var T_BURN = 3200;        // ms burning
  var T_PAUSE = 450;        // ms embers and ash settle
  var T_REBORN = 2600;      // ms ash gathers into the new card
  var T_SETTLE = 500;       // ms final glow fades

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Accepts a canvas, an image element, or a URL / data URL string.
  function toCanvas(src) {
    return new Promise(function (resolve, reject) {
      function draw(el) {
        var w = el.naturalWidth || el.width, h = el.naturalHeight || el.height;
        var c = makeCanvas(w, h);
        c.getContext('2d').drawImage(el, 0, 0);
        resolve(c);
      }
      if (src instanceof HTMLCanvasElement) { resolve(src); return; }
      if (typeof src === 'string') {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () { draw(img); };
        img.onerror = function () { reject(new Error('Card image could not be loaded')); };
        img.src = src;
        return;
      }
      draw(src);
    });
  }

  // Smooth value noise used to make the fire line ragged.
  function makeNoise(cell, seed) {
    var gw = 64, gh = 64;
    var g = new Float32Array(gw * gh);
    var s = seed || 1;
    for (var i = 0; i < g.length; i++) {
      s = (s * 1664525 + 1013904223) % 4294967296;
      g[i] = s / 4294967296;
    }
    return function (x, y) {
      var gx = x / cell, gy = y / cell;
      var ix = Math.floor(gx) % (gw - 1), iy = Math.floor(gy) % (gh - 1);
      var fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      var a = g[iy * gw + ix], b = g[iy * gw + ix + 1];
      var c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      var top = a + (b - a) * fx, bottom = c + (d - c) * fx;
      return top + (bottom - top) * fy;
    };
  }

  // For each small-grid cell: when does the fire reach it (0 = first, 1 = last)?
  function buildField(sw, sh) {
    var n1 = makeNoise(9, 12345), n2 = makeNoise(3, 777);
    var f = new Float32Array(sw * sh);
    for (var y = 0; y < sh; y++) {
      for (var x = 0; x < sw; x++) {
        var base = (x / sw) * 0.55 + (1 - y / sh) * 0.45;   // fire starts bottom-left
        var n = n1(x, y) * 0.7 + n2(x, y) * 0.3;
        f[y * sw + x] = clamp(base * 0.72 + n * 0.28, 0, 0.999);
      }
    }
    return f;
  }

  function play(opts) {
    opts = opts || {};
    var stopped = false;
    var finishCb;
    var promise = new Promise(function (resolve) { finishCb = resolve; });

    function finish() {
      if (typeof opts.onDone === 'function') { try { opts.onDone(); } catch (e) {} }
      finishCb();
    }

    var handle = { promise: promise, stop: function () { stopped = true; finishCb(); } };

    if (!opts.container) { finish(); return handle; }

    Promise.all([toCanvas(opts.oldCard), toCanvas(opts.newCard)]).then(function (cards) {
      var oldC = cards[0], newC = cards[1];
      var reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!ENABLED && !opts.force) { showStatic(newC); return; }
      if (reduceMotion) { showStatic(newC); return; }
      run(oldC, newC);
    }).catch(function () { finish(); });

    function showStatic(newC) {
      var container = opts.container;
      container.innerHTML = '';
      var v = makeCanvas(newC.width, newC.height);
      v.style.width = '100%'; v.style.height = 'auto'; v.style.display = 'block';
      v.getContext('2d').drawImage(newC, 0, 0);
      container.appendChild(v);
      finish();
    }

    function run(oldC, newC) {
      var container = opts.container;
      container.innerHTML = '';

      var scale = Math.min(1, 720 / oldC.width);
      var W = Math.round(oldC.width * scale), H = Math.round(oldC.height * scale);
      var view = makeCanvas(W, H);
      view.style.width = '100%'; view.style.height = 'auto'; view.style.display = 'block';
      view.setAttribute('role', 'img');
      view.setAttribute('aria-label', 'The old card burns and a new card appears');
      container.appendChild(view);
      var ctx = view.getContext('2d');
      ctx.imageSmoothingEnabled = true;

      var work = makeCanvas(W, H), wctx = work.getContext('2d');
      var sw = Math.max(60, Math.round(W / 5)), sh = Math.max(40, Math.round(H / 5));
      var maskC = makeCanvas(sw, sh), glowC = makeCanvas(sw, sh);
      var mctx = maskC.getContext('2d'), gctx = glowC.getContext('2d');
      var maskImg = mctx.createImageData(sw, sh), glowImg = gctx.createImageData(sw, sh);
      var field = buildField(sw, sh);

      // Pre-read the new card's colours so ash can turn into it.
      var tmp = makeCanvas(W, H), tctx = tmp.getContext('2d');
      tctx.drawImage(newC, 0, 0, W, H);
      var newData = null;
      try { newData = tctx.getImageData(0, 0, W, H).data; } catch (e) { newData = null; }

      var N = 1800, sz = Math.max(1.6, W / 220);
      var ash = [];
      for (var i = 0; i < N; i++) {
        var tx = Math.random() * W, ty = Math.random() * H;
        var cr = 212, cg = 165, cb = 116;               // gold fallback
        if (newData) {
          var idx = (Math.floor(ty) * W + Math.floor(tx)) * 4;
          cr = newData[idx]; cg = newData[idx + 1]; cb = newData[idx + 2];
        }
        var grey = 70 + Math.random() * 80;
        ash.push({
          sx: Math.random() * W, sy: H * 0.55 + Math.random() * H * 0.5,
          tx: tx, ty: ty, cr: cr, cg: cg, cb: cb, grey: grey,
          delay: Math.random() * 0.5, ph: Math.random() * 6.28
        });
      }

      var embers = [];

      function spawnEmbers(t) {
        for (var s = 0; s < 140 && embers.length < 700; s++) {
          var x = Math.floor(Math.random() * sw), y = Math.floor(Math.random() * sh);
          var v = field[y * sw + x];
          if (v >= t - EDGE && v < t && Math.random() < 0.5) {
            embers.push({
              x: (x + Math.random()) / sw * W, y: (y + Math.random()) / sh * H,
              vx: (Math.random() - 0.5) * 0.8, vy: -(0.5 + Math.random() * 1.6),
              life: 1, decay: 0.008 + Math.random() * 0.014,
              size: sz * (0.6 + Math.random() * 1.1), ph: Math.random() * 6.28
            });
          }
        }
      }

      function drawEmbers(dt) {
        for (var k = embers.length - 1; k >= 0; k--) {
          var e = embers[k];
          e.life -= e.decay * dt;
          if (e.life <= 0) { embers.splice(k, 1); continue; }
          e.vy *= 0.995;
          e.y += e.vy * dt;
          e.x += e.vx * dt + Math.sin(e.life * 12 + e.ph) * 0.3;
          var r = 255, g = Math.round(80 + 140 * e.life), b = Math.round(20 + 40 * e.life);
          ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + clamp(e.life, 0, 1) + ')';
          ctx.fillRect(e.x, e.y, e.size, e.size);
        }
      }

      function drawStamp(a) {
        if (a <= 0) return;
        var text = opts.stampText || 'REPORTED LOST';
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(-0.18);
        ctx.globalAlpha = a;
        ctx.font = '800 ' + Math.round(H * 0.13) + 'px system-ui, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var tw = ctx.measureText(text).width;
        ctx.lineWidth = Math.max(3, H * 0.012);
        ctx.strokeStyle = 'rgba(200,30,30,0.9)';
        ctx.strokeRect(-tw / 2 - 18, -H * 0.1, tw + 36, H * 0.2);
        ctx.fillStyle = 'rgba(200,30,30,0.9)';
        ctx.fillText(text, 0, 2);
        ctx.restore();
      }

      function drawBurning(p) {
        var t = p * (1 + EDGE);
        var charW = CHAR * clamp(p * 8, 0, 1);
        var md = maskImg.data, gd = glowImg.data;
        var i = 0;
        for (var y = 0; y < sh; y++) {
          for (var x = 0; x < sw; x++, i += 4) {
            var v = field[y * sw + x];
            var a = 255, gr = 0, gg = 0, gb = 0, ga = 0;
            if (v < t - EDGE) {
              a = 0;
            } else if (v < t) {
              var k = (v - (t - EDGE)) / EDGE;
              gr = 255; gg = Math.round(70 + 150 * (1 - k));
              gb = Math.round(20 + 90 * (1 - k) * (1 - k)); ga = 235;
            } else if (v < t + charW) {
              var kk = 1 - (v - t) / charW;
              gr = 24; gg = 14; gb = 10; ga = Math.round(210 * kk);
            }
            md[i] = 0; md[i + 1] = 0; md[i + 2] = 0; md[i + 3] = a;
            gd[i] = gr; gd[i + 1] = gg; gd[i + 2] = gb; gd[i + 3] = ga;
          }
        }
        mctx.putImageData(maskImg, 0, 0);
        gctx.putImageData(glowImg, 0, 0);
        wctx.globalCompositeOperation = 'source-over';
        wctx.clearRect(0, 0, W, H);
        wctx.drawImage(oldC, 0, 0, W, H);
        wctx.drawImage(glowC, 0, 0, W, H);
        wctx.globalCompositeOperation = 'destination-in';
        wctx.drawImage(maskC, 0, 0, W, H);
        wctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(work, 0, 0, W, H);
        if (p > 0 && p < 1) spawnEmbers(t);
      }

      function drawAshResting(alpha, time) {
        ctx.fillStyle = 'rgba(110,100,95,' + (0.8 * alpha) + ')';
        for (var i = 0; i < ash.length; i += 2) {
          var a = ash[i];
          ctx.fillRect(a.sx + Math.sin(time / 700 + a.ph) * 1.5, a.sy, sz, sz);
        }
      }

      function drawGlow(alpha) {
        if (alpha <= 0) return;
        var g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
        g.addColorStop(0, 'rgba(255,200,90,' + alpha + ')');
        g.addColorStop(1, 'rgba(255,200,90,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      function drawReborn(q) {
        drawGlow(0.35 * Math.sin(Math.PI * q));
        var aNew = clamp((q - 0.62) / 0.38, 0, 1);
        if (aNew > 0) {
          ctx.globalAlpha = aNew * aNew;
          ctx.drawImage(newC, 0, 0, W, H);
          ctx.globalAlpha = 1;
        }
        var fade = 1 - clamp((q - 0.78) / 0.22, 0, 1);
        if (fade <= 0) return;
        for (var i = 0; i < ash.length; i++) {
          var a = ash[i];
          var pr = clamp((q * 1.5 - a.delay) / 1.0, 0, 1);
          var e = easeOut(pr);
          var x = lerp(a.sx, a.tx, e) + Math.sin(pr * 6 + a.ph) * (1 - e) * 12;
          var y = lerp(a.sy, a.ty, e) + Math.cos(pr * 6 + a.ph) * (1 - e) * 12;
          var r = Math.round(lerp(a.grey, a.cr, e));
          var g = Math.round(lerp(a.grey, a.cg, e));
          var b = Math.round(lerp(a.grey, a.cb, e));
          ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + fade + ')';
          ctx.fillRect(x, y, sz, sz);
        }
      }

      var t0 = null, last = 0;

      function frame(ts) {
        if (stopped) return;
        if (t0 === null) { t0 = ts; last = ts; }
        var el = ts - t0;
        var dt = Math.min(48, ts - last) / 16.67;
        last = ts;
        ctx.clearRect(0, 0, W, H);

        var tBurnEnd = T_STAMP + T_BURN;
        var tPauseEnd = tBurnEnd + T_PAUSE;
        var tRebornEnd = tPauseEnd + T_REBORN;
        var tSettleEnd = tRebornEnd + T_SETTLE;

        if (el < tBurnEnd) {
          var p = clamp((el - T_STAMP) / T_BURN, 0, 1);
          drawBurning(p);
          if (p > 0.5) drawAshResting(clamp((p - 0.5) / 0.5, 0, 1), el);
          drawEmbers(dt);
          drawStamp(el < T_STAMP ? clamp(el / 250, 0, 1) : 1 - clamp((p - 0.4) / 0.3, 0, 1));
        } else if (el < tPauseEnd) {
          drawAshResting(1, el);
          drawEmbers(dt);
        } else if (el < tRebornEnd) {
          drawReborn((el - tPauseEnd) / T_REBORN);
          drawEmbers(dt);
        } else if (el < tSettleEnd) {
          ctx.drawImage(newC, 0, 0, W, H);
          drawGlow(0.25 * (1 - (el - tRebornEnd) / T_SETTLE));
        } else {
          ctx.drawImage(newC, 0, 0, W, H);
          finish();
          return;
        }
        global.requestAnimationFrame(frame);
      }

      global.requestAnimationFrame(frame);
    }

    return handle;
  }

  global.CardRebirth = {
    play: play,
    enable: function () { ENABLED = true; },
    disable: function () { ENABLED = false; },
    isEnabled: function () { return ENABLED; }
  };

  // -------------------------------------------------------------------------
  // INTEGRATION: commented out until the feature ships.
  //
  // Call it only after the server has accepted the lost report AND the
  // replacement payment has been confirmed. The old card's code is already
  // dead at that point; this is only the show.
  //
  // CardRebirth.enable();
  // CardRebirth.play({
  //   container: document.getElementById('card-stage'),
  //   oldCard: oldCardCanvas,          // canvas, <img> or data URL
  //   newCard: newCardCanvas,
  //   stampText: 'REPORTED LOST',
  //   onDone: function () { showNewCardDownloadButtons(); }
  // });
  // -------------------------------------------------------------------------
})(window);
