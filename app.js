/* ═══════════════════════════════════════════════════════════
   STUDENT ID CARD GENERATOR — APPLICATION LOGIC
   All card drawing, QR code, cropper and form logic lives here.
   ═══════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════
// PURE JS QR CODE GENERATOR (no libraries, completely offline)
// ═══════════════════════════════════════════════════════════════
var QRGen = (function(){
  // GF(256)
  var EXP=new Array(512), LOG=new Array(256);
  (function(){var x=1;for(var i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&256)x^=285;}for(var i=255;i<512;i++)EXP[i]=EXP[i-255];EXP[255]=1;LOG[0]=0;})();
  function gmul(a,b){if(!a||!b)return 0;return EXP[LOG[a]+LOG[b]];}
  function genpoly(n){var g=[1];for(var i=0;i<n;i++){var h=[1,EXP[i]],r=new Array(g.length+1).fill(0);for(var j=0;j<g.length;j++)for(var k=0;k<2;k++)r[j+k]^=gmul(g[j],h[k]);g=r;}return g;}
  function rsencode(data,n){var g=genpoly(n),msg=data.concat(new Array(n).fill(0));for(var i=0;i<data.length;i++){var c=msg[i];if(c)for(var j=0;j<g.length;j++)msg[i+j]^=gmul(g[j],c);}return msg.slice(data.length);}

  // Version/EC table for Level M
  var VINFO=[null,
    {ec:10,g1:[1,16]},
    {ec:16,g1:[1,28]},
    {ec:13,g1:[2,22]},
    {ec:18,g1:[2,32]},
    {ec:26,g1:[2,43]},
    {ec:18,g1:[4,27]},
    {ec:20,g1:[4,31]},
    {ec:24,g1:[2,38],g2:[2,39]},
    {ec:30,g1:[3,36],g2:[2,37]},
    {ec:18,g1:[4,43],g2:[1,44]},
    {ec:20,g1:[1,50],g2:[4,51]},
    {ec:24,g1:[6,36],g2:[2,37]},
    {ec:26,g1:[8,37],g2:[1,38]},
    {ec:30,g1:[4,40],g2:[5,41]},
    {ec:22,g1:[5,45],g2:[5,46]}
  ];
  // Capacity in bytes (data codewords) for level M
  var CAP=[0,16,28,44,64,86,108,124,154,182,216,254,290,334,365,415];
  // Alignment pattern centers
  var ALIGN=[[],...[null,[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74]]];

  function makeMatrix(n){var m=[];for(var i=0;i<n;i++){m.push(new Array(n).fill(-1));}return m;}
  function setModule(m,r,c,v){m[r][c]=v;}

  function placeFinderPattern(m,r,c){
    for(var i=-1;i<=7;i++)for(var j=-1;j<=7;j++){
      if(r+i<0||r+i>=m.length||c+j<0||c+j>=m.length)continue;
      m[r+i][c+j]=(i>=0&&i<=6&&j>=0&&j<=6&&(i==0||i==6||j==0||j==6||(i>=2&&i<=4&&j>=2&&j<=4)))?1:0;
    }
  }
  function placeAlignmentPattern(m,r,c){
    for(var i=-2;i<=2;i++)for(var j=-2;j<=2;j++){
      if(m[r+i][c+j]!=-1)continue;
      m[r+i][c+j]=(i==-2||i==2||j==-2||j==2||(!i&&!j))?1:0;
    }
  }
  function placeTiming(m,sz){
    for(var i=8;i<sz-8;i++){m[6][i]=m[i][6]=i%2===0?1:0;}
  }

  // Format info strings for EC level M (mask 0-7)
  var FMT=['101010000010010','101000100100101','101111001111100','101101101001011','100010111111001','100000011001110','100111110010111','100101010100000'];

  function placeFormat(m,sz,mask){
    var f=FMT[mask];
    var positions=[[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    for(var i=0;i<15;i++){var v=parseInt(f[i]);m[positions[i][0]][positions[i][1]]=v;m[sz-1-i<sz-8?sz-1-i:positions[i][0]][positions[i][1]]=v;}
    // Second copy
    for(var i=0;i<8;i++)m[sz-1-i][8]=parseInt(f[i]);
    for(var i=8;i<15;i++)m[8][sz-15+i]=parseInt(f[i]);
    m[sz-8][8]=1; // dark module
  }

  function encodeData(text){
    var bytes=[];
    for(var i=0;i<text.length;i++){
      var c=text.charCodeAt(i);
      if(c>255){bytes.push(63);}else{bytes.push(c);}
    }
    return bytes;
  }

  function makeCodewords(data,vi){
    var cw=[0x40|(data.length>>4),(((data.length&0xf)<<4)|0)];
    // Actually: mode=0100(4bits), charcount(8bits), data(8bits each), terminator
    var bits=[];
    bits.push(0,1,0,0); // byte mode
    var l=data.length;
    for(var i=7;i>=0;i--)bits.push((l>>i)&1);
    for(var i=0;i<data.length;i++)for(var j=7;j>=0;j--)bits.push((data[i]>>j)&1);
    // terminator
    for(var i=0;i<4&&bits.length<vi.total*8;i++)bits.push(0);
    // pad to byte
    while(bits.length%8)bits.push(0);
    // pad codewords
    var pads=[0xEC,0x11],pi=0;
    while(bits.length<vi.total*8){for(var j=7;j>=0;j--)bits.push((pads[pi>>0]>>j)&1);pi=(pi+1)%2;}
    // bits to bytes
    var cwds=[];
    for(var i=0;i<bits.length;i+=8){var b=0;for(var j=0;j<8;j++)b|=bits[i+j]<<(7-j);cwds.push(b);}
    return cwds;
  }

  function interleave(vi,dcw){
    // Build blocks
    var blocks=[];
    if(vi.g1){for(var i=0;i<vi.g1[0];i++){var s=blocks.length*vi.g1[1];blocks.push(dcw.slice(s,s+vi.g1[1]));}}
    if(vi.g2){for(var i=0;i<vi.g2[0];i++){var s=vi.g1[0]*vi.g1[1]+i*vi.g2[1];blocks.push(dcw.slice(s,s+vi.g2[1]));}}
    // EC for each block
    var ecblocks=blocks.map(function(b){return rsencode(b,vi.ec);});
    // Interleave data
    var result=[];
    var maxd=Math.max.apply(null,blocks.map(function(b){return b.length;}));
    for(var i=0;i<maxd;i++)for(var j=0;j<blocks.length;j++)if(i<blocks[j].length)result.push(blocks[j][i]);
    for(var i=0;i<vi.ec;i++)for(var j=0;j<ecblocks.length;j++)result.push(ecblocks[j][i]);
    return result;
  }

  function placeData(m,sz,codewords){
    var bits=[];
    for(var i=0;i<codewords.length;i++)for(var j=7;j>=0;j--)bits.push((codewords[i]>>j)&1);
    var bi=0,up=true;
    for(var col=sz-1;col>=1;col-=2){
      if(col===6)col--;
      for(var cnt=0;cnt<sz;cnt++){
        var row=up?sz-1-cnt:cnt;
        for(var dc=0;dc<2;dc++){
          var c=col-dc;
          if(m[row][c]===-1){
            m[row][c]=bi<bits.length?bits[bi++]:0;
          }
        }
      }
      up=!up;
    }
  }

  function applyMask(m,sz,mask){
    var f=[function(r,c){return (r+c)%2===0;},
           function(r,c){return r%2===0;},
           function(r,c){return c%3===0;},
           function(r,c){return (r+c)%3===0;},
           function(r,c){return (Math.floor(r/2)+Math.floor(c/3))%2===0;},
           function(r,c){return (r*c)%2+(r*c)%3===0;},
           function(r,c){return ((r*c)%2+(r*c)%3)%2===0;},
           function(r,c){return ((r+c)%2+(r*c)%3)%2===0;}];
    var masked=m.map(function(row){return row.slice();});
    for(var r=0;r<sz;r++)for(var c=0;c<sz;c++)if(masked[r][c]!==null&&masked[r][c]>=0&&m[r][c]!==-2&&f[mask](r,c))masked[r][c]^=1;
    return masked;
  }

  function penaltyScore(m,sz){
    var p=0;
    // Rule 1: 5+ same in row/col
    for(var r=0;r<sz;r++){var cnt=1;for(var c=1;c<sz;c++){if(m[r][c]===m[r][c-1])cnt++;else{if(cnt>=5)p+=cnt-2;cnt=1;}if(cnt>=5)p+=cnt-2;}cnt=1;for(var c=1;c<sz;c++){if(m[c][r]===m[c-1][r])cnt++;else{if(cnt>=5)p+=cnt-2;cnt=1;}if(cnt>=5)p+=cnt-2;}}
    // Rule 2: 2x2 blocks
    for(var r=0;r<sz-1;r++)for(var c=0;c<sz-1;c++)if(m[r][c]===m[r+1][c]&&m[r][c]===m[r][c+1]&&m[r][c]===m[r+1][c+1])p+=3;
    return p;
  }

  return {
    generate: function(text){
      var bytes=encodeData(text);
      var ver=1;
      while(ver<16&&bytes.length>CAP[ver])ver++;
      if(ver>15)ver=15;
      var vi=VINFO[ver];
      vi.total=CAP[ver]+(vi.g1[0]+(vi.g2?vi.g2[0]:0))*vi.ec;
      var sz=4*ver+17;
      var dcw=makeCodewords(bytes,vi);
      var allcw=interleave(vi,dcw);

      // Build matrix
      var base=makeMatrix(sz);
      placeFinderPattern(base,0,0);
      placeFinderPattern(base,0,sz-7);
      placeFinderPattern(base,sz-7,0);
      placeTiming(base,sz);
      // Mark format areas
      for(var i=0;i<9;i++){if(base[8][i]===-1)base[8][i]=-2;if(base[i][8]===-1)base[i][8]=-2;}
      for(var i=sz-8;i<sz;i++){if(base[8][i]===-1)base[8][i]=-2;if(base[i][8]===-1)base[i][8]=-2;}
      // Alignment patterns
      var ap=ALIGN[ver];
      if(ap.length){for(var i=0;i<ap.length;i++)for(var j=0;j<ap.length;j++){if(!((i===0&&j===0)||(i===0&&j===ap.length-1)||(i===ap.length-1&&j===0)))placeAlignmentPattern(base,ap[i],ap[j]);}}
      base[sz-8][8]=-2; // dark module
      placeData(base,sz,allcw);

      // Try all 8 masks, pick best
      var best=null,bestP=Infinity;
      for(var mask=0;mask<8;mask++){
        var m2=applyMask(base,sz,mask);
        placeFormat(m2,sz,mask);
        var p=penaltyScore(m2,sz);
        if(p<bestP){bestP=p;best=m2;}
      }
      return {matrix:best,size:sz,version:ver};
    },

    drawToCanvas: function(canvas,text,px){
      px=px||4;
      var q=this.generate(text);
      var sz=q.size,m=q.matrix;
      var W=(sz+8)*px;
      canvas.width=canvas.height=W;
      var ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,W,W);
      ctx.fillStyle='#000';
      var off=4*px;
      for(var r=0;r<sz;r++)for(var c=0;c<sz;c++)if(m[r][c]===1)ctx.fillRect(off+c*px,off+r*px,px,px);
    }
  };
})();

// ═══════════════════════════════════════════════════════════════
// APP STATE
// ═══════════════════════════════════════════════════════════════
var CREST_LARGE = 'data:image/png;base64,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';
var CREST_SMALL = 'data:image/png;base64,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';

var state = {
  schoolName: 'EBONYI STATE UNIVERSITY, ABAKALIKI',
  expiry: '2029',
  customLogo: null,
  students: [newStudent()],
  activeIdx: 0,
  layout: 'single',
  page: 'form',
  colors: {
    headerBg:        '#1558c0',
    headerText:      '#ffffff',
    bodyBg:          '#ffffff',
    borderColor:     '#6ab0e0',
    titleColor:      '#cc0000',
    matricLabel:     '#1a3a9a',
    labelColor:      '#000000',
    valueColor:      '#222222',
    photoBackground: '#aa1111'
  }
};

function newStudent(){
  return {name:'',matric:'',faculty:'',dept:'',level:'100 Level',session:'2024/2025',blood:'O+',genotype:'AA',photo:null,sig:null};
}

function s(){ return state.students[state.activeIdx]; }

// ═══════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════
function showPage(pg){
  state.page=pg;
  document.getElementById('page-form').style.display=pg==='form'?'block':'none';
  document.getElementById('page-preview').style.display=pg==='preview'?'block':'none';
  document.getElementById('tab-form').className='tab '+(pg==='form'?'active':'inactive');
  document.getElementById('tab-preview').className='tab '+(pg==='preview'?'active':'inactive');
}

// ═══════════════════════════════════════════════════════════════
// STUDENT TABS
// ═══════════════════════════════════════════════════════════════
function renderTabs(){
  var c=document.getElementById('student-tabs');
  c.innerHTML='';
  state.students.forEach(function(st,i){
    var b=document.createElement('button');
    b.className='stab';
    b.style.background=i===state.activeIdx?'#cc0000':'#162030';
    b.textContent=st.name?st.name.split(' ')[0]:'Student '+(i+1);
    b.onclick=(function(idx){return function(){switchStudent(idx);};})(i);
    c.appendChild(b);
  });
  var add=document.createElement('button');
  add.className='btn-outline';add.textContent='+ Add Student';
  add.onclick=addStudent;c.appendChild(add);
  if(state.students.length>1){
    var rm=document.createElement('button');
    rm.style.cssText='padding:5px 10px;border-radius:6px;border:none;background:#2a0808;color:#ff5252;font-weight:700;font-size:11px;cursor:pointer';
    rm.textContent='✕';rm.onclick=removeStudent;c.appendChild(rm);
  }
}

function saveCurrentFields(){
  var st=s();
  st.name=document.getElementById('f-name').value;
  st.matric=document.getElementById('f-matric').value;
  st.faculty=document.getElementById('f-faculty').value;
  st.dept=document.getElementById('f-dept').value;
  st.level=document.getElementById('f-level').value;
  st.session=document.getElementById('f-session').value;
  st.blood=document.getElementById('f-blood').value;
  st.genotype=document.getElementById('f-genotype').value;
}

function loadFields(){
  var st=s();
  document.getElementById('f-name').value=st.name||'';
  document.getElementById('f-matric').value=st.matric||'';
  document.getElementById('f-faculty').value=st.faculty||'';
  document.getElementById('f-dept').value=st.dept||'';
  document.getElementById('f-level').value=st.level||'100 Level';
  document.getElementById('f-session').value=st.session||'2024/2025';
  document.getElementById('f-blood').value=st.blood||'O+';
  document.getElementById('f-genotype').value=st.genotype||'AA';
  // Photo preview
  var pp=document.getElementById('photo-preview');
  if(st.photo){pp.innerHTML='<img src="'+st.photo+'" style="width:100%;height:100%;object-fit:cover"/>';document.getElementById('rm-photo').style.display='block';}
  else{pp.innerHTML='<span style="font-size:34px;opacity:0.35">👤</span>';document.getElementById('rm-photo').style.display='none';}
  var sp=document.getElementById('sig-preview');
  if(st.sig){sp.innerHTML='<img src="'+st.sig+'" style="max-width:100%;max-height:100%;object-fit:contain"/>';document.getElementById('rm-sig').style.display='block';}
  else{sp.innerHTML='<span style="font-size:11px;color:#aaa;font-style:italic">Signature</span>';document.getElementById('rm-sig').style.display='none';}
}

function switchStudent(idx){saveCurrentFields();state.activeIdx=idx;loadFields();renderTabs();}
function addStudent(){saveCurrentFields();state.students.push(newStudent());state.activeIdx=state.students.length-1;loadFields();renderTabs();}
function removeStudent(){saveCurrentFields();state.students.splice(state.activeIdx,1);state.activeIdx=Math.max(0,state.activeIdx-1);loadFields();renderTabs();}

// ═══════════════════════════════════════════════════════════════
// IMAGE CROPPER
// ═══════════════════════════════════════════════════════════════
var cropState={field:null,aspect:null,img:null,drag:false,start:{x:0,y:0},box:null};

function pickFile(field,aspect){
  var inp=document.createElement('input');inp.type='file';inp.accept='image/*';
  inp.onchange=function(e){
    var f=e.target.files[0];if(!f)return;
    var r=new FileReader();
    r.onload=function(ev){openCropper(field,aspect,ev.target.result);};
    r.readAsDataURL(f);
  };inp.click();
}

function openCropper(field,aspect,src){
  cropState.field=field;cropState.aspect=aspect;
  var ov=document.getElementById('cropper-overlay');
  var cvs=document.getElementById('crop-canvas');
  var img=new Image();
  img.onload=function(){
    cropState.img=img;cropState.box=null;cropState.drag=false;
    cvs.width=img.naturalWidth;cvs.height=img.naturalHeight;
    var ctx=cvs.getContext('2d');ctx.drawImage(img,0,0);
  };
  img.src=src;
  ov.className='show';
}

function cancelCrop(){document.getElementById('cropper-overlay').className='';}

function getPos(e,cvs){
  var r=cvs.getBoundingClientRect();
  var sx=cvs.width/r.width,sy=cvs.height/r.height;
  var cx=e.touches?e.touches[0].clientX:e.clientX;
  var cy=e.touches?e.touches[0].clientY:e.clientY;
  return{x:(cx-r.left)*sx,y:(cy-r.top)*sy};
}

var cvs2=null;
window.addEventListener('load',function(){
  cvs2=document.getElementById('crop-canvas');
  cvs2.addEventListener('mousedown',function(e){var p=getPos(e,cvs2);cropState.start=p;cropState.drag=true;cropState.box=null;drawCrop();});
  cvs2.addEventListener('mousemove',function(e){
    if(!cropState.drag)return;
    var p=getPos(e,cvs2),w=p.x-cropState.start.x;
    var h=cropState.aspect?Math.abs(w)/cropState.aspect*(p.y>cropState.start.y?1:-1):p.y-cropState.start.y;
    cropState.box={x:w<0?p.x:cropState.start.x,y:h<0?cropState.start.y+h:cropState.start.y,w:Math.abs(w),h:Math.abs(h)};
    drawCrop();
  });
  cvs2.addEventListener('mouseup',function(){cropState.drag=false;});
  cvs2.addEventListener('touchstart',function(e){e.preventDefault();var p=getPos(e,cvs2);cropState.start=p;cropState.drag=true;cropState.box=null;drawCrop();},{passive:false});
  cvs2.addEventListener('touchmove',function(e){
    e.preventDefault();if(!cropState.drag)return;
    var p=getPos(e,cvs2),w=p.x-cropState.start.x;
    var h=cropState.aspect?Math.abs(w)/cropState.aspect*(p.y>cropState.start.y?1:-1):p.y-cropState.start.y;
    cropState.box={x:w<0?p.x:cropState.start.x,y:h<0?cropState.start.y+h:cropState.start.y,w:Math.abs(w),h:Math.abs(h)};
    drawCrop();
  },{passive:false});
  cvs2.addEventListener('touchend',function(){cropState.drag=false;});
  renderTabs();loadFields();
});

function drawCrop(){
  var c=cvs2,i=cropState.img,b=cropState.box;
  if(!c||!i)return;
  c.width=i.naturalWidth;c.height=i.naturalHeight;
  var ctx=c.getContext('2d');ctx.drawImage(i,0,0);
  if(b){
    ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(0,0,c.width,c.height);
    ctx.clearRect(b.x,b.y,b.w,b.h);
    ctx.strokeStyle='#00aaff';ctx.lineWidth=2;ctx.strokeRect(b.x,b.y,b.w,b.h);
  }
}

function applyCrop(){
  var b=cropState.box;if(!b||b.w<5){alert('Please drag to select an area first.');return;}
  var off=document.createElement('canvas');
  off.width=b.w;off.height=b.h;
  off.getContext('2d').drawImage(cropState.img,b.x,b.y,b.w,b.h,0,0,b.w,b.h);
  var url=off.toDataURL('image/png');
  var field=cropState.field;
  s()[field]=url;
  if(field==='photo'){
    var pp=document.getElementById('photo-preview');
    pp.innerHTML='<img src="'+url+'" style="width:100%;height:100%;object-fit:cover"/>';
    document.getElementById('rm-photo').style.display='block';
  } else {
    var sp=document.getElementById('sig-preview');
    sp.innerHTML='<img src="'+url+'" style="max-width:100%;max-height:100%;object-fit:contain"/>';
    document.getElementById('rm-sig').style.display='block';
  }
  document.getElementById('cropper-overlay').className='';
}

function removeImg(field){
  s()[field===('photo')?'photo':'sig']=null;
  if(field==='photo'){document.getElementById('photo-preview').innerHTML='<span style="font-size:34px;opacity:0.35">👤</span>';document.getElementById('rm-photo').style.display='none';}
  else{document.getElementById('sig-preview').innerHTML='<span style="font-size:11px;color:#aaa;font-style:italic">Signature</span>';document.getElementById('rm-sig').style.display='none';}
}

function pickLogo(){
  var inp=document.createElement('input');inp.type='file';inp.accept='image/*';
  inp.onchange=function(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(ev){state.customLogo=ev.target.result;alert('Crest uploaded! Click Generate to see it.');};r.readAsDataURL(f);};
  inp.click();
}

// ═══════════════════════════════════════════════════════════════
// CARD RENDERING (Canvas-based = pixel perfect for download)
// ═══════════════════════════════════════════════════════════════
// ── QR DATA BUILDER ────────────────────────────────────────────
// Returns a clean, standardised string encoded into the QR code.
// Only essential fields are included to keep the QR compact and
// scannable at small print sizes.
function buildQRData(st){
  return (
    'Name: '   + (st.name   || '') + '\n' +
    'Matric: '  + (st.matric || '') + '\n' +
    'Dept: '    + (st.dept   || '') + '\n' +
    'Expiry: '  + (state.expiry || '')
  );
}

// ── CARD RENDERER ──────────────────────────────────────────────
// Draws a single student ID card onto `canvas` at the given scale.
// Rendering is split into synchronous foreground layers and async
// image loads so that every element always appears in the correct
// stacking order: background → watermark → UI text → photo (top).
function drawCard(canvas, st, scale) {
  scale = scale || 1;
  var W = Math.round(428 * scale), H = Math.round(306 * scale);
  canvas.width = W; canvas.height = H;
  var c = canvas.getContext('2d');
  var S = function(n) { return Math.round(n * scale); };
  var col = state.colors || {};

  // ── STAGE 1: SYNCHRONOUS STATIC BACKGROUNDS ─────────────────
  // These are drawn immediately (no image loads required) so the
  // card never appears completely blank while assets load.

  // Body fill
  c.fillStyle = col.bodyBg || '#ffffff';
  c.fillRect(0, 0, W, H);

  // Header bar
  var HH = S(36);
  c.fillStyle = col.headerBg || '#1558c0';
  c.fillRect(0, 0, W, HH);

  // Outer border
  c.strokeStyle = col.borderColor || '#6ab0e0';
  c.lineWidth = S(2);
  c.strokeRect(S(1), S(1), W - S(2), H - S(2));

  // Card title
  c.fillStyle = col.titleColor || '#cc0000';
  c.font = '900 ' + S(13) + 'px "Arial Black",Arial,sans-serif';
  c.textAlign = 'center';
  c.fillText('STUDENT IDENTITY CARD', W / 2, HH + S(18));

  // Matric number row
  var matY = HH + S(32);
  c.fillStyle = col.matricLabel || '#1a3a9a';
  c.font = '900 ' + S(8.5) + 'px Arial,sans-serif';
  c.textAlign = 'left';
  c.fillText('MATRIC NUMBER:', S(8), matY);
  c.font = '700 ' + S(8.5) + 'px Arial,sans-serif';
  c.fillText(st.matric || '\u2014', S(97), matY);

  // Thin divider below matric row
  var divY = matY + S(6);
  c.fillStyle = col.borderColor || '#dde8f5';
  c.fillRect(0, divY, W, S(1));

  // Photo placeholder (colour shown while photo loads / if no photo)
  var PX = S(8), PY = divY + S(4), PW = S(105), PH = S(148);
  c.fillStyle = col.photoBackground || '#aa1111';
  c.fillRect(PX, PY, PW, PH);

  // Right-column geometry (small crest / QR / sig column)
  var RW = S(78), RX = W - S(6) - RW;

  // ── STAGE 2: WATERFALL IMAGE CHAIN ──────────────────────────
  // Images load in strict sequence so the canvas layering is always:
  //   watermark (bottom) → small crest → QR → sig → text fields → photo (top)
  // Every Image has an onerror handler so a broken URL doesn't
  // silently stall the render pipeline.

  // Step A — large watermark crest (bottom-most image layer)
  var crestL = new Image();
  crestL.onerror = function() { stepB(); };
  crestL.onload = function() {
    c.save();
    c.globalAlpha = 0.15;
    c.drawImage(crestL, S(130), S(80), S(150), S(150));
    c.restore();
    stepB();
  };
  crestL.src = state.customLogo || CREST_LARGE;

  // Step B — small crest badge (top-right column)
  function stepB() {
    var crestS = new Image();
    crestS.onerror = function() { stepC(0); };
    crestS.onload = function() {
      var csH = S(62);
      c.drawImage(crestS, RX, PY, RW, csH);
      stepC(csH);
    };
    crestS.src = state.customLogo || CREST_SMALL;
  }

  // Step C — QR code + signature box (stacked under the small crest)
  function stepC(csH) {
    csH = csH || 0;

    // QR code (synchronous canvas draw, no image load needed)
    var qrCvs = document.createElement('canvas');
    QRGen.drawToCanvas(qrCvs, buildQRData(st), S(3));
    var qrY = PY + csH + S(4);
    c.drawImage(qrCvs, RX, qrY, RW, RW);

    // Signature box background
    var sigY = qrY + RW + S(4);
    var sigH = S(26);
    c.fillStyle = '#e8e8e8';
    c.fillRect(RX, sigY, RW, sigH);
    c.strokeStyle = '#bbbbbb'; c.lineWidth = S(1);
    c.strokeRect(RX, sigY, RW, sigH);

    if (st.sig) {
      var sigImg = new Image();
      sigImg.onerror = function() { stepD(); };
      sigImg.onload = function() {
        c.drawImage(sigImg, RX, sigY, RW, sigH);
        stepD();
      };
      sigImg.src = st.sig;
    } else {
      // Placeholder label
      c.fillStyle = '#aaaaaa';
      c.font = 'italic ' + S(7.5) + 'px Arial';
      c.textAlign = 'center';
      c.fillText('signature', RX + RW / 2, sigY + S(17));
      stepD();
    }
  }

  // Step D — school name + all text fields (drawn on top of images)
  function stepD() {
    // School name (in header — must be redrawn here so it sits above
    // the header bar and is not obscured by the watermark)
    c.fillStyle = col.headerText || '#ffffff';
    c.font = '900 ' + S(13) + 'px "Arial Black",Arial,sans-serif';
    c.textAlign = 'center';
    c.fillText((state.schoolName || 'EBONYI STATE UNIVERSITY').toUpperCase(), W / 2, S(24));

    // Student data rows
    var tx = PX + PW + S(8);
    var ty = PY + S(14);
    var rows = [
      ['Name:',        st.name],
      ['Faculty:',     st.faculty],
      ['Department:',  st.dept],
      ['Expiry Year:', state.expiry]
    ];
    rows.forEach(function(row) {
      c.textAlign = 'left';
      c.fillStyle = col.labelColor || '#000000';
      c.font = '700 ' + S(8.5) + 'px Arial,sans-serif';
      c.fillText(row[0], tx, ty);

      c.fillStyle = col.valueColor || '#222222';
      c.font = '400 ' + S(8.5) + 'px Arial,sans-serif';
      var val = truncateText(c, row[1] || '\u2014', S(140));
      c.fillText(val, tx + S(68), ty);
      ty += S(22);
    });

    // Blood group & genotype footer (bottom-left strip)
    var bY = H - S(22);
    c.textAlign = 'left';
    c.fillStyle = col.labelColor || '#000';
    c.font = '700 ' + S(8) + 'px Arial,sans-serif';
    c.fillText('Blood Group', S(8), bY);
    c.fillStyle = col.valueColor || '#222';
    c.font = '400 ' + S(8) + 'px Arial,sans-serif';
    c.fillText(st.blood || '\u2014', S(64), bY);

    c.fillStyle = col.labelColor || '#000';
    c.font = '700 ' + S(8) + 'px Arial,sans-serif';
    c.fillText('Genotype', S(8), bY + S(13));
    c.fillStyle = col.valueColor || '#222';
    c.font = '400 ' + S(8) + 'px Arial,sans-serif';
    c.fillText(st.genotype || '\u2014', S(64), bY + S(13));

    c.fillStyle = col.labelColor || '#000';
    c.font = '700 ' + S(8) + 'px Arial,sans-serif';
    c.textAlign = 'right';
    c.fillText('Signature', W - S(7), H - S(7));

    // Step E — photo is always the very last draw call so it is
    // never obscured by the watermark or any other layer
    stepE();
  }

  // Step E — student photo (topmost layer)
  function stepE() {
    if (!st.photo) return;
    var pImg = new Image();
    pImg.onerror = function() {}; // placeholder colour already visible
    pImg.onload = function() {
      c.drawImage(pImg, PX, PY, PW, PH);
    };
    pImg.src = st.photo;
  }
}

function truncateText(ctx,text,maxW){
  if(!text)return'—';
  if(ctx.measureText(text).width<=maxW)return text;
  while(text.length>1&&ctx.measureText(text+'…').width>maxW)text=text.slice(0,-1);
  return text+'…';
}

// ═══════════════════════════════════════════════════════════════
// COLOUR MANAGEMENT
// ═══════════════════════════════════════════════════════════════
var THEMES = {
  ebsu:    {headerBg:'#1558c0',headerText:'#ffffff',bodyBg:'#ffffff',borderColor:'#6ab0e0',titleColor:'#cc0000',matricLabel:'#1a3a9a',labelColor:'#000000',valueColor:'#222222',photoBackground:'#aa1111'},
  green:   {headerBg:'#1a7a3a',headerText:'#ffffff',bodyBg:'#f8fff8',borderColor:'#4aaa6a',titleColor:'#1a7a3a',matricLabel:'#0e4d22',labelColor:'#1a4a1a',valueColor:'#2a5a2a',photoBackground:'#0e4d22'},
  maroon:  {headerBg:'#8b0000',headerText:'#ffffff',bodyBg:'#fffafa',borderColor:'#cc4444',titleColor:'#8b0000',matricLabel:'#5a0000',labelColor:'#2a0000',valueColor:'#440000',photoBackground:'#5a0000'},
  purple:  {headerBg:'#5a1a9a',headerText:'#ffffff',bodyBg:'#fdf8ff',borderColor:'#9a6acc',titleColor:'#5a1a9a',matricLabel:'#3a0e6a',labelColor:'#2a0050',valueColor:'#3a0070',photoBackground:'#3a0e6a'},
  gold:    {headerBg:'#b8860b',headerText:'#ffffff',bodyBg:'#fffdf0',borderColor:'#d4a820',titleColor:'#7a5800',matricLabel:'#5a4000',labelColor:'#3a2800',valueColor:'#4a3800',photoBackground:'#7a5800'},
  classic: {headerBg:'#333333',headerText:'#ffffff',bodyBg:'#ffffff',borderColor:'#999999',titleColor:'#333333',matricLabel:'#444444',labelColor:'#000000',valueColor:'#333333',photoBackground:'#555555'}
};

function updateColor(key,val){
  state.colors[key]=val;
  var cp=document.getElementById('c-'+key);  if(cp)cp.value=val;
  var ct=document.getElementById('ct-'+key); if(ct)ct.value=val.toUpperCase();
  function el(id){return document.getElementById(id);}
  function bg(id,v){var e=el(id);if(e)e.style.background=v;}
  function bc(id,v){var e=el(id);if(e)e.style.borderColor=v;}
  function fc(id,v){var e=el(id);if(e)e.style.color=v;}
  if(key==='headerBg'){
    bg('prev-headerBg',val);
    bg('prev-headerText',val);
    fc('prevTxt-headerBg',state.colors.headerText||'#fff');
    fc('prevTxt-headerText',state.colors.headerText||'#fff');
  }
  if(key==='headerText'){fc('prevTxt-headerBg',val);fc('prevTxt-headerText',val);}
  if(key==='bodyBg')        bg('prev-bodyBg',val);
  if(key==='borderColor')   bc('prev-borderColor',val);
  if(key==='titleColor')    fc('prevTxt-titleColor',val);
  if(key==='matricLabel')   fc('prevTxt-matricLabel',val);
  if(key==='labelColor')   {fc('prevTxt-labelColor',val);}
  if(key==='valueColor')   {fc('prevTxt-valueColor',val);fc('prevTxt-valueColor2',val);}
  if(key==='photoBackground') bg('prev-photoBackground',val);
}

function syncColorText(key,val){
  if(/^#[0-9A-Fa-f]{6}$/.test(val)){updateColor(key,val);}
  else{var el=document.getElementById('ct-'+key);if(el)el.value=val.toUpperCase();}
}

function applyTheme(name){
  var t=THEMES[name];if(!t)return;
  Object.keys(t).forEach(function(k){updateColor(k,t[k]);});
}

// ═══════════════════════════════════════════════════════════════
// GENERATE
// ═══════════════════════════════════════════════════════════════
function generate(){
  saveCurrentFields();
  state.schoolName=document.getElementById('schoolName').value;
  state.expiry=document.getElementById('expiry').value;
  var st=s();
  if(!st.name||!st.matric){alert('Please enter at least Name and Matric Number.');return;}
  showPage('preview');
  renderPreview();
}

function setLayout(l){
  state.layout=l;
  ['single','double','batch'].forEach(function(x){
    document.getElementById('ly-'+x).className='layout-btn '+(x===l?'on':'off');
  });
  renderPreview();
}

function renderPreview(){
  var con=document.getElementById('cards-container');
  con.innerHTML='';
  var toRender=state.layout==='batch'?state.students.filter(function(s){return s.name&&s.matric;}):[s()];

  toRender.forEach(function(st,idx){
    var wrap=document.createElement('div');
    wrap.className = 'card-wrapper'; // enables .card-wrapper canvas:hover from CSS

    if(state.layout!=='double'){
      // Front card
      var cvs=document.createElement('canvas');
      wrap.appendChild(cvs);
      drawCard(cvs,st,state.layout==='batch'?0.7:0.85);
    } else {
      // Front + Back side by side
      var row=document.createElement('div');
      row.style.cssText='display:flex;gap:20px;flex-wrap:wrap;justify-content:center;align-items:flex-start;';
      var fc=document.createElement('canvas'),bc=document.createElement('canvas');
      row.appendChild(fc);row.appendChild(bc);
      wrap.appendChild(row);
      drawCard(fc,st,0.78);
      drawBackCard(bc,st,0.78);
    }

    // Download button
    var dlb=document.createElement('button');
    dlb.style.cssText='padding:8px 22px;background:#cc0000;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer;';
    dlb.textContent='⬇ Download PNG — '+st.name;
    (function(student){dlb.onclick=function(){downloadStudentCard(student);};})(st);
    wrap.appendChild(dlb);
    con.appendChild(wrap);
  });
}

function drawBackCard(canvas,st,scale){
  scale=scale||1;
  var W=Math.round(428*scale),H=Math.round(270*scale);
  canvas.width=W;canvas.height=H;
  var c=canvas.getContext('2d'),S=function(n){return Math.round(n*scale);};
  c.fillStyle='#fff';c.fillRect(0,0,W,H);
  c.strokeStyle='#6ab0e0';c.lineWidth=S(2);c.strokeRect(S(1),S(1),W-S(2),H-S(2));
  // Header
  var grad=c.createLinearGradient(0,0,W,0);grad.addColorStop(0,'#1a3a8a');grad.addColorStop(1,'#2255cc');
  c.fillStyle=grad;c.fillRect(0,0,W,S(30));
  c.fillStyle='#fff';c.font='800 '+S(10)+'px Arial,sans-serif';c.textAlign='center';
  c.fillText((state.schoolName||'EBONYI STATE UNIVERSITY').toUpperCase(),W/2,S(20));
  c.fillStyle='#cc0000';c.fillRect(0,S(30),W,S(3));
  // Terms
  c.fillStyle='#cc0000';c.font='800 '+S(8.5)+'px Arial,sans-serif';c.textAlign='left';
  c.fillText('TERMS & CONDITIONS OF USE',S(14),S(46));
  var terms=[
    '1. This card is the property of the University and must be returned on demand.',
    '2. This card is strictly non-transferable. Misuse attracts disciplinary action.',
    '3. Loss must be reported immediately to the Student Affairs Office.',
    '4. Carry this card at all times within the University premises.',
    '5. Present for access to library, exam halls and academic facilities.',
    '6. Tampering renders this card invalid and attracts disciplinary action.'
  ];
  c.fillStyle='#222';c.font=S(7.5)+'px Arial,sans-serif';
  var ty=S(60);
  terms.forEach(function(t){c.fillText(t,S(14),ty);ty+=S(18);});
  // Footer
  c.fillStyle=grad;c.fillRect(0,H-S(24),W,S(24));
  c.fillStyle='rgba(255,255,255,0.85)';c.font=S(7)+'px Arial,sans-serif';c.textAlign='left';
  c.fillText('Valid Until: '+state.expiry,S(12),H-S(8));
  c.textAlign='right';
  c.fillText('If found, return to Student Affairs Office',W-S(12),H-S(8));
}

// ═══════════════════════════════════════════════════════════════
// DOWNLOAD
// ═══════════════════════════════════════════════════════════════
function downloadStudentCard(st){
  // Draw at 3x scale for high resolution
  var hiCvs=document.createElement('canvas');
  drawCard(hiCvs,st,3);
  // Wait for async image loads
  setTimeout(function(){
    var link=document.createElement('a');
    link.style.display='none';
    link.download='ID_Card_'+(st.name||'student').replace(/\s+/g,'_')+'_'+(st.matric||'').replace(/\//g,'-')+'.png';
    link.href=hiCvs.toDataURL('image/png',1.0);
    document.body.appendChild(link);
    link.click();
    setTimeout(function(){ if(link.parentNode) link.parentNode.removeChild(link); },1500);
  },1200);
}

function downloadCard(){downloadStudentCard(s());}

// ═══════════════════════════════════════════════════════════════
// PRINT
// ═══════════════════════════════════════════════════════════════
function doPrint(){
  var con=document.getElementById('cards-container');
  if(!con.children.length){alert('Please generate a card first.');return;}
  // Collect all canvas elements and convert to images
  var canvases=con.querySelectorAll('canvas');
  var imgs='';
  canvases.forEach(function(cv){imgs+='<img src="'+cv.toDataURL('image/png')+'" style="max-width:100%;margin:10px auto;display:block"/>';});
  var w=window.open('','_blank');
  w.document.write('<html><head><title>ID Card</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#fff;padding:20px;display:flex;flex-wrap:wrap;gap:16px;justify-content:center;align-items:flex-start}@media print{body{background:#fff}}img{max-width:360px}</style></head><body>'+imgs+'</body></html>');
  w.document.close();
  setTimeout(function(){w.print();},600);
}

// Initial render
window.onload=function(){renderTabs();loadFields();};