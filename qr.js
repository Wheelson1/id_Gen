/**
 * qr.js — Pure-JS QR Code Generator (EC Level M, versions 1-15)
 * Completely offline, no external dependencies.
 */
const QRGen = (() => {
  // GF(256) arithmetic tables
  const EXP = new Array(512);
  const LOG = new Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1; if (x & 256) x ^= 285;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    EXP[255] = 1; LOG[0] = 0;
  })();

  const gmul = (a, b) => (!a || !b) ? 0 : EXP[LOG[a] + LOG[b]];

  function genpoly(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const h = [1, EXP[i]];
      const r = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++)
        for (let k = 0; k < 2; k++) r[j + k] ^= gmul(g[j], h[k]);
      g = r;
    }
    return g;
  }

  function rsencode(data, n) {
    const g = genpoly(n);
    const msg = data.concat(new Array(n).fill(0));
    for (let i = 0; i < data.length; i++) {
      const c = msg[i];
      if (c) for (let j = 0; j < g.length; j++) msg[i + j] ^= gmul(g[j], c);
    }
    return msg.slice(data.length);
  }

  // Version/EC table for Level M
  const VINFO = [null,
    { ec: 10, g1: [1, 16] },
    { ec: 16, g1: [1, 28] },
    { ec: 13, g1: [2, 22] },
    { ec: 18, g1: [2, 32] },
    { ec: 26, g1: [2, 43] },
    { ec: 18, g1: [4, 27] },
    { ec: 20, g1: [4, 31] },
    { ec: 24, g1: [2, 38], g2: [2, 39] },
    { ec: 30, g1: [3, 36], g2: [2, 37] },
    { ec: 18, g1: [4, 43], g2: [1, 44] },
    { ec: 20, g1: [1, 50], g2: [4, 51] },
    { ec: 24, g1: [6, 36], g2: [2, 37] },
    { ec: 26, g1: [8, 37], g2: [1, 38] },
    { ec: 30, g1: [4, 40], g2: [5, 41] },
    { ec: 22, g1: [5, 45], g2: [5, 46] }
  ];

  const CAP   = [0, 16, 28, 44, 64, 86, 108, 124, 154, 182, 216, 254, 290, 334, 365, 415];
  const ALIGN = [[], ...[null, [6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74]]];

  const makeMatrix = n => Array.from({ length: n }, () => new Array(n).fill(-1));

  function placeFinderPattern(m, r, c) {
    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
      if (r+i < 0 || r+i >= m.length || c+j < 0 || c+j >= m.length) continue;
      m[r+i][c+j] = (i>=0&&i<=6&&j>=0&&j<=6&&(i===0||i===6||j===0||j===6||(i>=2&&i<=4&&j>=2&&j<=4))) ? 1 : 0;
    }
  }

  function placeAlignmentPattern(m, r, c) {
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      if (m[r+i][c+j] !== -1) continue;
      m[r+i][c+j] = (i===-2||i===2||j===-2||j===2||(!i&&!j)) ? 1 : 0;
    }
  }

  function placeTiming(m, sz) {
    for (let i = 8; i < sz - 8; i++) m[6][i] = m[i][6] = i % 2 === 0 ? 1 : 0;
  }

  const FMT = ['101010000010010','101000100100101','101111001111100','101101101001011','100010111111001','100000011001110','100111110010111','100101010100000'];

  function placeFormat(m, sz, mask) {
    const f = FMT[mask];
    const positions = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    for (let i = 0; i < 15; i++) {
      const v = parseInt(f[i]);
      m[positions[i][0]][positions[i][1]] = v;
      m[sz-1-i < sz-8 ? sz-1-i : positions[i][0]][positions[i][1]] = v;
    }
    for (let i = 0; i < 8; i++) m[sz-1-i][8] = parseInt(f[i]);
    for (let i = 8; i < 15; i++) m[8][sz-15+i] = parseInt(f[i]);
    m[sz-8][8] = 1;
  }

  function encodeData(text) {
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      bytes.push(c > 255 ? 63 : c);
    }
    return bytes;
  }

  function makeCodewords(data, vi) {
    const bits = [];
    bits.push(0,1,0,0);
    const l = data.length;
    for (let i = 7; i >= 0; i--) bits.push((l >> i) & 1);
    for (let i = 0; i < data.length; i++) for (let j = 7; j >= 0; j--) bits.push((data[i] >> j) & 1);
    for (let i = 0; i < 4 && bits.length < vi.total * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const pads = [0xEC, 0x11]; let pi = 0;
    while (bits.length < vi.total * 8) {
      for (let j = 7; j >= 0; j--) bits.push((pads[pi] >> j) & 1);
      pi = (pi + 1) % 2;
    }
    const cwds = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b |= bits[i+j] << (7-j);
      cwds.push(b);
    }
    return cwds;
  }

  function interleave(vi, dcw) {
    const blocks = [];
    if (vi.g1) for (let i = 0; i < vi.g1[0]; i++) { const s = blocks.length * vi.g1[1]; blocks.push(dcw.slice(s, s + vi.g1[1])); }
    if (vi.g2) for (let i = 0; i < vi.g2[0]; i++) { const s = vi.g1[0] * vi.g1[1] + i * vi.g2[1]; blocks.push(dcw.slice(s, s + vi.g2[1])); }
    const ecblocks = blocks.map(b => rsencode(b, vi.ec));
    const result = [];
    const maxd = Math.max(...blocks.map(b => b.length));
    for (let i = 0; i < maxd; i++) for (let j = 0; j < blocks.length; j++) if (i < blocks[j].length) result.push(blocks[j][i]);
    for (let i = 0; i < vi.ec; i++) for (let j = 0; j < ecblocks.length; j++) result.push(ecblocks[j][i]);
    return result;
  }

  function placeData(m, sz, codewords) {
    const bits = [];
    for (let i = 0; i < codewords.length; i++) for (let j = 7; j >= 0; j--) bits.push((codewords[i] >> j) & 1);
    let bi = 0, up = true;
    for (let col = sz - 1; col >= 1; col -= 2) {
      if (col === 6) col--;
      for (let cnt = 0; cnt < sz; cnt++) {
        const row = up ? sz - 1 - cnt : cnt;
        for (let dc = 0; dc < 2; dc++) {
          const c = col - dc;
          if (m[row][c] === -1) m[row][c] = bi < bits.length ? bits[bi++] : 0;
        }
      }
      up = !up;
    }
  }

  function applyMask(m, sz, mask) {
    const fns = [
      (r,c) => (r+c)%2===0,
      (r,c) => r%2===0,
      (r,c) => c%3===0,
      (r,c) => (r+c)%3===0,
      (r,c) => (Math.floor(r/2)+Math.floor(c/3))%2===0,
      (r,c) => (r*c)%2+(r*c)%3===0,
      (r,c) => ((r*c)%2+(r*c)%3)%2===0,
      (r,c) => ((r+c)%2+(r*c)%3)%2===0
    ];
    const masked = m.map(row => row.slice());
    for (let r = 0; r < sz; r++)
      for (let c = 0; c < sz; c++)
        if (masked[r][c] !== null && masked[r][c] >= 0 && m[r][c] !== -2 && fns[mask](r, c))
          masked[r][c] ^= 1;
    return masked;
  }

  function penaltyScore(m, sz) {
    let p = 0;
    for (let r = 0; r < sz; r++) {
      let cnt = 1;
      for (let c = 1; c < sz; c++) { if (m[r][c]===m[r][c-1]) cnt++; else { if (cnt>=5) p+=cnt-2; cnt=1; } if (cnt>=5) p+=cnt-2; }
      cnt = 1;
      for (let c = 1; c < sz; c++) { if (m[c][r]===m[c-1][r]) cnt++; else { if (cnt>=5) p+=cnt-2; cnt=1; } if (cnt>=5) p+=cnt-2; }
    }
    for (let r = 0; r < sz - 1; r++)
      for (let c = 0; c < sz - 1; c++)
        if (m[r][c]===m[r+1][c] && m[r][c]===m[r][c+1] && m[r][c]===m[r+1][c+1]) p += 3;
    return p;
  }

  return {
    generate(text) {
      const bytes = encodeData(text);
      let ver = 1;
      while (ver < 16 && bytes.length > CAP[ver]) ver++;
      if (ver > 15) ver = 15;
      const vi = { ...VINFO[ver] };
      // vi.total is the number of DATA codewords only (what makeCodewords pads to).
      // CAP[ver] already holds exactly that value — do NOT add EC codewords here.
      vi.total = CAP[ver];
      const sz = 4 * ver + 17;
      const dcw = makeCodewords(bytes, vi);
      const allcw = interleave(vi, dcw);

      const base = makeMatrix(sz);
      placeFinderPattern(base, 0, 0);
      placeFinderPattern(base, 0, sz - 7);
      placeFinderPattern(base, sz - 7, 0);
      placeTiming(base, sz);
      for (let i = 0; i < 9; i++) { if (base[8][i]===-1) base[8][i]=-2; if (base[i][8]===-1) base[i][8]=-2; }
      for (let i = sz - 8; i < sz; i++) { if (base[8][i]===-1) base[8][i]=-2; if (base[i][8]===-1) base[i][8]=-2; }
      const ap = ALIGN[ver];
      if (ap && ap.length) for (let i = 0; i < ap.length; i++) for (let j = 0; j < ap.length; j++) {
        if (!((i===0&&j===0)||(i===0&&j===ap.length-1)||(i===ap.length-1&&j===0))) placeAlignmentPattern(base, ap[i], ap[j]);
      }
      base[sz-8][8] = -2;
      placeData(base, sz, allcw);

      let best = null, bestP = Infinity;
      for (let mask = 0; mask < 8; mask++) {
        const m2 = applyMask(base, sz, mask);
        placeFormat(m2, sz, mask);
        const p = penaltyScore(m2, sz);
        if (p < bestP) { bestP = p; best = m2; }
      }
      return { matrix: best, size: sz, version: ver };
    },

    drawToCanvas(canvas, text, px = 4) {
      const q = this.generate(text);
      const { size: sz, matrix: m } = q;
      const W = (sz + 8) * px;
      canvas.width = canvas.height = W;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, W);
      ctx.fillStyle = '#000';
      const off = 4 * px;
      for (let r = 0; r < sz; r++)
        for (let c = 0; c < sz; c++)
          if (m[r][c] === 1) ctx.fillRect(off + c * px, off + r * px, px, px);
    }
  };
})();
