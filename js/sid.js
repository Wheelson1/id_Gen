/**
 * SID — Students Identification Card Engine
 * Powered by Triple J Group of Companies
 * Unified with canonical StudentDataSource and CardTemplate.
 */

const SID_SYSTEM = (() => {
  let currentPendingStudent = null;

  // Sound & Haptic Feedback
  function playSound(type) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'click') {
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
      } else if (type === 'success') {
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2); // G5
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      }
    } catch (e) {}
  }

  function triggerHaptic() {
    if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
  }

  // Client-side student lookups on public pages are disabled (Phase 2);
  // student onboarding uses server-side Edge Functions in Phase 3.
  async function lookupStudent() {
    return null;
  }

  // Initialize UI event handlers on landing page
  function initIndexFlow() {
    const jambInput = document.getElementById('sid-jamb-input');
    const btnGenerate = document.getElementById('sid-btn-generate');
    const stepBox = document.getElementById('sid-step-container');
    const stepConfirm = document.getElementById('sid-step-confirm');
    const stepDob = document.getElementById('sid-step-dob');
    const stepCardResult = document.getElementById('sid-step-result');

    const confirmNameEl = document.getElementById('sid-confirm-name');
    const btnConfirmYes = document.getElementById('sid-btn-yes');
    const btnConfirmNo = document.getElementById('sid-btn-no');

    const dobInput = document.getElementById('sid-dob-input');
    const btnVerifyDob = document.getElementById('sid-btn-verify-dob');
    const dobError = document.getElementById('sid-dob-error');

    if (!jambInput || !btnGenerate) return;

    jambInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnGenerate.click();
    });

    // Step 1: Click Generate
    btnGenerate.addEventListener('click', async () => {
      const val = jambInput.value.trim();
      if (!val) {
        alert('Please enter your JAMB Registration Number or School Reg No.');
        jambInput.focus();
        return;
      }

      playSound('click');
      triggerHaptic();

      btnGenerate.disabled = true;
      btnGenerate.textContent = 'Searching...';

      try {
        const student = await lookupStudent(val);

        if (!student) {
          btnGenerate.disabled = false;
          btnGenerate.textContent = 'Generate ID ✨';
          alert(`❌ Registration number "${val}" was not found in the verified database. Please check the number or contact your faculty coordinator.`);
          jambInput.focus();
          return;
        }

        currentPendingStudent = student;
        if (confirmNameEl) confirmNameEl.textContent = student.fullName || student.name;

        const queueOverlay = document.getElementById('sid-queue-overlay');
        const ticketEl = document.getElementById('sid-queue-ticket');
        const rankEl = document.getElementById('sid-queue-rank');
        const etaEl = document.getElementById('sid-queue-eta');
        const barEl = document.getElementById('sid-queue-bar');

        if (stepBox) stepBox.style.display = 'block';
        if (stepConfirm) stepConfirm.style.display = 'none';
        if (stepDob) stepDob.style.display = 'none';
        if (stepCardResult) stepCardResult.style.display = 'none';

        // Activate Queue Simulation (Instant / Swift feedback, no artificial 2-second stall)
        if (queueOverlay) {
          queueOverlay.style.display = 'block';
          const randomHex = Math.random().toString(16).slice(2, 8).toUpperCase();
          if (ticketEl) ticketEl.textContent = `TICK-2026-${randomHex}`;
          if (rankEl) rankEl.textContent = '#1';
          if (etaEl) etaEl.textContent = '<1s';
          if (barEl) barEl.style.width = '100%';

          setTimeout(() => {
            queueOverlay.style.display = 'none';
            if (stepConfirm) {
              stepConfirm.style.display = 'block';
              stepConfirm.classList.add('sid-fade-in');
              stepConfirm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 250);
        } else {
          if (stepConfirm) {
            stepConfirm.style.display = 'block';
            stepConfirm.classList.add('sid-fade-in');
            stepConfirm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      } catch (err) {
        console.error('Error during student resolution:', err);
        alert('An error occurred while connecting to the student database. Please try again.');
      } finally {
        btnGenerate.disabled = false;
        btnGenerate.textContent = 'Generate ID ✨';
      }
    });

    // Step 2: Confirm Name (Yes)
    if (btnConfirmYes) {
      btnConfirmYes.addEventListener('click', () => {
        playSound('click');
        triggerHaptic();

        if (stepConfirm) stepConfirm.style.display = 'none';
        if (stepDob) {
          stepDob.style.display = 'block';
          stepDob.classList.add('sid-fade-in');
        }
        if (dobInput) {
          dobInput.value = '';
          try {
            dobInput.focus({ preventScroll: true });
          } catch (e) {
            dobInput.focus();
          }
        }
        if (dobError) dobError.style.display = 'none';
      });
    }

    // Step 2: Reject Name (No)
    if (btnConfirmNo) {
      btnConfirmNo.addEventListener('click', () => {
        playSound('click');
        if (stepConfirm) stepConfirm.style.display = 'none';
        if (stepBox) stepBox.style.display = 'none';
        jambInput.value = '';
        try {
          jambInput.focus({ preventScroll: true });
        } catch (e) {
          jambInput.focus();
        }
      });
    }

    // Step 3: Client-side DOB verification is disabled until Phase 3 server-side onboarding
    if (btnVerifyDob) {
      btnVerifyDob.addEventListener('click', () => {
        if (dobError) {
          dobError.textContent = 'Client-side verification is disabled for security. Please use the Student Portal.';
          dobError.style.display = 'block';
        }
      });
    }
  }

  // Canonical Card Render Function wrapper (Renders Front, Back & 3D Orbit Stage)
  function renderSidCard(canvasId, student, onComplete) {
    const frontCanvas = document.getElementById('sid-canvas');
    const backCanvas = document.getElementById('sid-canvas-back');
    const wrap3D = document.getElementById('sid-3d-wrap');
    const template = (typeof CardTemplate !== 'undefined' && CardTemplate.get) 
      ? CardTemplate.get() 
      : null;

    if (backCanvas && typeof drawBackCard === 'function') {
      drawBackCard(backCanvas, template, student, 1);
    }
    if (frontCanvas && typeof drawCard === 'function') {
      drawCard(frontCanvas, template, student, 1, () => {
        // Mount or update 3D card
        if (wrap3D && typeof Card3D !== 'undefined') {
          const existing = Card3D.getInstance(wrap3D);
          if (existing) {
            existing.update(student, template);
          } else {
            Card3D.mount({
              container: wrap3D,
              studentData: student,
              template: template,
              scale: 0.48,
              autoSpin: false,
              showControls: true,
              showHint: true
            });
          }
          setView('3d');
        }
        if (typeof onComplete === 'function') onComplete();
      });
    } else {
      if (typeof onComplete === 'function') onComplete();
    }
  }

  // View Mode Switcher
  function setView(mode) {
    const wrapFront = document.getElementById('sid-canvas-wrap-front');
    const wrapBack = document.getElementById('sid-canvas-wrap-back');
    const wrap3D = document.getElementById('sid-3d-wrap');
    const btn3D = document.getElementById('sid-view-3d-btn');
    const btnFront = document.getElementById('sid-view-front-btn');
    const btnBack = document.getElementById('sid-view-back-btn');
    const btnBoth = document.getElementById('sid-view-both-btn');

    [btn3D, btnFront, btnBack, btnBoth].forEach(btn => {
      if (btn) {
        btn.classList.remove('active-tab');
        btn.removeAttribute('style');
      }
    });

    if (mode === '3d') {
      if (wrap3D) wrap3D.style.display = 'block';
      if (wrapFront) wrapFront.style.display = 'none';
      if (wrapBack) wrapBack.style.display = 'none';
      if (btn3D) {
        btn3D.classList.add('active-tab');
        btn3D.style.fontWeight = '800';
        btn3D.style.borderColor = '#1558c0';
        btn3D.style.color = '#1558c0';
      }
    } else if (mode === 'front') {
      if (wrap3D) wrap3D.style.display = 'none';
      if (wrapFront) wrapFront.style.display = 'block';
      if (wrapBack) wrapBack.style.display = 'none';
      if (btnFront) btnFront.classList.add('active-tab');
    } else if (mode === 'back') {
      if (wrap3D) wrap3D.style.display = 'none';
      if (wrapFront) wrapFront.style.display = 'none';
      if (wrapBack) wrapBack.style.display = 'block';
      if (btnBack) btnBack.classList.add('active-tab');
    } else if (mode === 'both') {
      if (wrap3D) wrap3D.style.display = 'none';
      if (wrapFront) wrapFront.style.display = 'block';
      if (wrapBack) wrapBack.style.display = 'block';
      if (btnBoth) btnBoth.classList.add('active-tab');
    }
  }

  // Render text details below canvas
  function renderStudentDetails(student) {
    if (!student) return;
    const nameEl = document.getElementById('sid-res-name');
    const jambEl = document.getElementById('sid-res-jamb');
    const matricEl = document.getElementById('sid-res-matric');
    const deptEl = document.getElementById('sid-res-dept');
    const instEl = document.getElementById('sid-res-inst');

    if (nameEl) nameEl.textContent = student.fullName || student.name;
    if (jambEl) jambEl.textContent = student.jambNo || student.matric || '—';
    if (matricEl) matricEl.textContent = student.matric || student.schoolRegNo || '—';
    if (deptEl) deptEl.textContent = student.department || student.dept || '—';
    if (instEl) instEl.textContent = (typeof CardTemplate !== 'undefined' && CardTemplate.get) ? CardTemplate.get().institution.name : 'Ebonyi State University (EBSU)';
  }

  // Robust canvas download helper ensuring explicit .png extension and DOM attachment
  function triggerCanvasDownload(canvas, filename) {
    if (!canvas) return;

    let safeName = (filename || 'SID_ID_Card.png').trim();
    if (!safeName.toLowerCase().endsWith('.png')) {
      safeName += '.png';
    }

    function doDownload(url, isBlob) {
      const link = document.createElement('a');
      link.style.display = 'none';
      link.setAttribute('download', safeName);
      link.download = safeName;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
        if (isBlob) URL.revokeObjectURL(url);
      }, 1500);
    }

    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((blob) => {
          if (blob) {
            const objectUrl = URL.createObjectURL(blob);
            doDownload(objectUrl, true);
          } else {
            doDownload(canvas.toDataURL('image/png'), false);
          }
        }, 'image/png');
      } else {
        doDownload(canvas.toDataURL('image/png'), false);
      }
    } catch (err) {
      console.warn('Canvas export fallback:', err);
      doDownload(canvas.toDataURL('image/png'), false);
    }
  }

  // Download Front PNG
  function downloadFront() {
    const canvas = document.getElementById('sid-canvas');
    if (!canvas) return;
    const label = currentPendingStudent?.matric || currentPendingStudent?.jambNo || 'Student';
    const filename = `SID_Card_Front_${label.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    triggerCanvasDownload(canvas, filename);
  }

  // Download Back PNG
  function downloadBack() {
    const canvas = document.getElementById('sid-canvas-back');
    if (!canvas) return;
    const label = currentPendingStudent?.matric || currentPendingStudent?.jambNo || 'Student';
    const filename = `SID_Card_Back_${label.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    triggerCanvasDownload(canvas, filename);
  }

  // Download Both Sides Merged on 1 Sheet
  function downloadBoth() {
    const front = document.getElementById('sid-canvas');
    const back = document.getElementById('sid-canvas-back');
    if (!front || !back) return;

    const merged = document.createElement('canvas');
    const padding = 40;
    merged.width = front.width;
    merged.height = front.height + back.height + padding;

    const ctx = merged.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, merged.width, merged.height);

    ctx.drawImage(front, 0, 0);
    ctx.drawImage(back, 0, front.height + padding);

    const label = currentPendingStudent?.matric || currentPendingStudent?.jambNo || 'Student';
    const filename = `SID_Card_2Sided_${label.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    triggerCanvasDownload(merged, filename);
  }

  function downloadCard() {
    downloadBoth();
  }

  // Upload or update student photo dynamically
  function uploadPhoto(file) {
    if (!file || !currentPendingStudent) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const dataUrl = e.target.result;
      currentPendingStudent.photo = dataUrl;
      currentPendingStudent.photoUrl = dataUrl;
      renderSidCard('sid-canvas', currentPendingStudent);
    };
    reader.readAsDataURL(file);
  }

  // Upload or update student signature dynamically
  function uploadSignature(file) {
    if (!file || !currentPendingStudent) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const dataUrl = e.target.result;
      currentPendingStudent.sig = dataUrl;
      currentPendingStudent.signatureUrl = dataUrl;
      renderSidCard('sid-canvas', currentPendingStudent);
    };
    reader.readAsDataURL(file);
  }

  // Print Card
  function printCard() {
    setView('both');
    setTimeout(() => {
      window.print();
    }, 200);
  }

  // Theme Switcher Engine
  function initTheme() {
    const savedTheme = localStorage.getItem('sid_theme') || 'dark';
    setTheme(savedTheme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sid_theme', theme);

    const btns = document.querySelectorAll('.sid-theme-toggle');
    btns.forEach(btn => {
      btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    });
  }

  const INSTITUTION_NAMES = {
    'EBSU': 'EBONYI STATE UNIVERSITY, ABAKALIKI',
    'UNN': 'UNIVERSITY OF NIGERIA, NSUKKA',
    'UNILAG': 'UNIVERSITY OF LAGOS',
    'FUTO': 'FEDERAL UNIVERSITY OF TECHNOLOGY, OWERRI'
  };

  function switchInstitution(code) {
    const instName = INSTITUTION_NAMES[code] || 'EBONYI STATE UNIVERSITY, ABAKALIKI';
    if (typeof CardTemplate !== 'undefined' && CardTemplate.get) {
      const t = CardTemplate.get();
      if (t && t.institution) {
        t.institution.name = instName;
      }
    }
    const brandSub = document.querySelector('.ebsu-brand-subtitle');
    if (brandSub) brandSub.textContent = `${code} · SID PORTAL`;
    if (currentPendingStudent) {
      renderSidCard('sid-canvas', currentPendingStudent);
      renderStudentDetails(currentPendingStudent);
    }
  }

  return {
    initIndexFlow,
    lookupStudent,
    renderSidCard,
    setView,
    downloadFront,
    downloadBack,
    downloadBoth,
    downloadCard,
    uploadPhoto,
    uploadSignature,
    printCard,
    initTheme,
    toggleTheme,
    switchInstitution
  };
})();

// Immediately apply theme before render
(() => {
  const savedTheme = localStorage.getItem('sid_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof CardTemplate !== 'undefined' && CardTemplate.load) {
    await CardTemplate.load();
  }
  SID_SYSTEM.initTheme();
  SID_SYSTEM.initIndexFlow();
});
