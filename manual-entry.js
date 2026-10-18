/**
 * manual-entry.js — Logic for Student Manual Form Fill Center
 * Ebonyi State University Digital ID System
 */

(function () {
  'use strict';

  // ── Faculty -> Departments Mapping ──
  const DEPARTMENTS_BY_FACULTY = {
    'Science': [
      'Computer Science', 'Applied Biology', 'Biotechnology', 'Industrial Chemistry',
      'Industrial Physics', 'Industrial Mathematics', 'Geology and Exploration', 'Microbiology', 'Biochemistry'
    ],
    'Agricultural and Natural Resource Management': [
      'Agricultural Economics', 'Animal Science', 'Crop Production and Landscape',
      'Fisheries and Aquaculture', 'Food Science and Technology', 'Soil Science'
    ],
    'Health Science and Technology': [
      'Medical Laboratory Science', 'Nursing Science', 'Public Health'
    ],
    'Social Sciences and Humanities': [
      'Mass Communication', 'Political Science', 'Economics', 'Sociology and Anthropology',
      'History and International Relations', 'Psychology', 'Philosophy and Religion'
    ],
    'Basic Medical Sciences': [
      'Medicine and Surgery', 'Human Anatomy', 'Medical Physiology'
    ],
    'Clinical Medicine': [
      'Community Medicine', 'Internal Medicine', 'Surgery', 'Paediatrics', 'Obstetrics and Gynaecology'
    ],
    'Education': [
      'Science Education', 'Educational Foundations', 'Arts and Social Science Education',
      'Business Education', 'Human Kinetics and Health Education'
    ],
    'Management Sciences': [
      'Accountancy', 'Banking and Finance', 'Business Management', 'Public Administration', 'Marketing'
    ],
    'Law': [
      'Civil Law', 'Public Law', 'Commercial Law', 'Private and Property Law'
    ]
  };

  // ── Default State ──
  let studentData = {
    id: 'ebsu-' + Date.now(),
    name: '',
    schoolRegNo: '',
    matric: '',
    faculty: '',
    department: '',
    level: '100 Level',
    session: '2024/2025',
    blood: 'O+',
    genotype: 'AA',
    expiry: 2029,
    photo: null,
    sig: null,
    qrString: '',
    status: 'active'
  };

  let currentView = 'front'; // 'front' | 'back'
  let isWebcamRunning = false;
  let webcamStream = null;

  // ── Signature Drawing Pad State ──
  let sigCanvas = null;
  let sigCtx = null;
  let isDrawingSig = false;
  let sigHistory = [];

  // ── DOM References ──
  const fName = document.getElementById('mf-name');
  const fRegNo = document.getElementById('mf-regno');
  const fFaculty = document.getElementById('mf-faculty');
  const fDept = document.getElementById('mf-dept');
  const fLevel = document.getElementById('mf-level');
  const fSession = document.getElementById('mf-session');
  const fExpiry = document.getElementById('mf-expiry');

  const photoFileInput = document.getElementById('mf-photo-file');
  const photoPreview = document.getElementById('mf-photo-preview');
  const photoPlaceholder = document.getElementById('mf-photo-placeholder');
  const rmPhotoBtn = document.getElementById('mf-rm-photo');

  const sigFileInput = document.getElementById('mf-sig-file');
  const sigPreview = document.getElementById('mf-sig-preview');
  const sigImgEl = document.getElementById('mf-sig-img');
  const rmSigBtn = document.getElementById('mf-rm-sig');

  const cardCanvas = document.getElementById('mf-card-canvas');
  const qrDisplayCanvas = document.getElementById('mf-qr-canvas');

  // ── Initialization ──
  window.addEventListener('DOMContentLoaded', () => {
    if (fSession && fSession.value) studentData.session = fSession.value.trim();
    if (fExpiry && fExpiry.value) {
      const val = fExpiry.value.trim();
      studentData.expiry = parseInt(val, 10) || val || 2029;
    }
    initFacultyAndDept();
    initBloodAndGenotypePills();
    initSignatureCanvas();
    initFieldListeners();
    initWebcam();
    updateLiveCard();
  });

  // ── 1. Faculty & Department Autocomplete & Auto Expiry Calculation ──
  function autoCalculateGraduation() {
    if (typeof ACADEMIC_RULES === 'undefined') return;
    const regNo = studentData.schoolRegNo || studentData.matric || '';
    const fac = studentData.faculty || '';
    const dept = studentData.department || '';
    const session = studentData.session || '2024/2025';

    if (fac || regNo) {
      const gradYear = ACADEMIC_RULES.calculateGraduationYear(regNo, fac, dept, session);
      studentData.expiry = gradYear;
      if (fExpiry) {
        fExpiry.value = gradYear;
      }
      const expHelp = document.getElementById('mf-expiry-help');
      if (expHelp) {
        expHelp.textContent = '⚡ ' + ACADEMIC_RULES.explainGraduationYear(regNo, fac, dept, session);
      }
    }
  }

  function initFacultyAndDept() {
    updateDeptSuggestions(fFaculty ? fFaculty.value : '');

    fFaculty?.addEventListener('input', () => {
      studentData.faculty = fFaculty.value.trim();
      updateDeptSuggestions(studentData.faculty);
      autoCalculateGraduation();
      updateLiveCard();
    });

    fDept?.addEventListener('input', () => {
      studentData.department = fDept.value.trim();
      autoCalculateGraduation();
      updateLiveCard();
    });
  }

  function updateDeptSuggestions(selectedFac) {
    const deptList = document.getElementById('mf-dept-list');
    if (!deptList) return;
    deptList.innerHTML = '';

    const matchedFacKey = Object.keys(DEPARTMENTS_BY_FACULTY).find(k => 
      k.toLowerCase() === (selectedFac || '').toLowerCase()
    );
    const depts = matchedFacKey ? DEPARTMENTS_BY_FACULTY[matchedFacKey] : [];

    if (depts.length > 0) {
      depts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        deptList.appendChild(opt);
      });
    } else {
      const allDepts = [
        'Computer Science', 'Medicine and Surgery', 'Nursing Science', 
        'Medical Laboratory Science', 'Civil Law', 'Accountancy', 'Economics', 
        'Applied Biology', 'Mass Communication'
      ];
      allDepts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        deptList.appendChild(opt);
      });
    }
  }

  // ── 2. Blood Group and Genotype Pills ──
  function initBloodAndGenotypePills() {
    document.querySelectorAll('[data-blood]').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('[data-blood]').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        studentData.blood = pill.getAttribute('data-blood');
        triggerHaptic(10);
        updateLiveCard();
      });
    });

    document.querySelectorAll('[data-genotype]').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('[data-genotype]').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        studentData.genotype = pill.getAttribute('data-genotype');
        triggerHaptic(10);
        updateLiveCard();
      });
    });
  }

  // ── 3. Interactive Signature Canvas ──
  function initSignatureCanvas() {
    sigCanvas = document.getElementById('sig-drawing-canvas');
    if (!sigCanvas) return;
    sigCtx = sigCanvas.getContext('2d');

    // Resize canvas to match display size for 1:1 pixel coordinates
    sigCanvas.width = sigCanvas.offsetWidth || 440;
    sigCanvas.height = 120;

    sigCtx.lineWidth = 2.5;
    sigCtx.lineCap = 'round';
    sigCtx.lineJoin = 'round';
    sigCtx.strokeStyle = '#0b2545';

    let lastX = 0, lastY = 0;

    function getCoords(e) {
      const rect = sigCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    }

    function startDrawing(e) {
      e.preventDefault();
      isDrawingSig = true;
      const c = getCoords(e);
      lastX = c.x;
      lastY = c.y;
      sigCtx.beginPath();
      sigCtx.moveTo(lastX, lastY);
      saveSigState();
    }

    function draw(e) {
      if (!isDrawingSig) return;
      e.preventDefault();
      const c = getCoords(e);
      sigCtx.quadraticCurveTo(lastX, lastY, (lastX + c.x) / 2, (lastY + c.y) / 2);
      sigCtx.stroke();
      lastX = c.x;
      lastY = c.y;
    }

    function stopDrawing() {
      if (isDrawingSig) {
        isDrawingSig = false;
        sigCtx.closePath();
        // Export drawn signature to data URL
        studentData.sig = sigCanvas.toDataURL('image/png');
        updateLiveCard();
      }
    }

    sigCanvas.addEventListener('mousedown', startDrawing);
    sigCanvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);

    sigCanvas.addEventListener('touchstart', startDrawing, { passive: false });
    sigCanvas.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDrawing);

    // Signature buttons
    document.getElementById('btn-clear-sig')?.addEventListener('click', clearSignature);
    document.getElementById('btn-undo-sig')?.addEventListener('click', undoSignature);

    // Switch between Draw and Upload tabs
    document.getElementById('tab-sig-draw')?.addEventListener('click', () => {
      document.getElementById('tab-sig-draw').classList.add('active');
      document.getElementById('tab-sig-upload').classList.remove('active');
      document.getElementById('sig-draw-pane').style.display = 'block';
      document.getElementById('sig-upload-pane').style.display = 'none';
    });

    document.getElementById('tab-sig-upload')?.addEventListener('click', () => {
      document.getElementById('tab-sig-upload').classList.add('active');
      document.getElementById('tab-sig-draw').classList.remove('active');
      document.getElementById('sig-draw-pane').style.display = 'none';
      document.getElementById('sig-upload-pane').style.display = 'block';
    });

    // Signature File Upload
    sigFileInput?.addEventListener('change', handleSignatureUpload);
    rmSigBtn?.addEventListener('click', () => {
      studentData.sig = null;
      sigPreview.style.display = 'none';
      clearSignature();
      updateLiveCard();
    });
  }

  function saveSigState() {
    if (sigHistory.length > 10) sigHistory.shift();
    sigHistory.push(sigCanvas.toDataURL());
  }

  function undoSignature() {
    if (sigHistory.length > 0) {
      const prev = sigHistory.pop();
      const img = new Image();
      img.onload = () => {
        sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
        sigCtx.drawImage(img, 0, 0);
        studentData.sig = sigCanvas.toDataURL('image/png');
        updateLiveCard();
      };
      img.src = prev;
    } else {
      clearSignature();
    }
  }

  function clearSignature() {
    if (!sigCanvas || !sigCtx) return;
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    sigHistory = [];
    studentData.sig = null;
    updateLiveCard();
  }

  function handleSignatureUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      processSignatureImage(evt.target.result);
    };
    reader.readAsDataURL(file);
  }

  function processSignatureImage(src) {
    const img = new Image();
    img.onload = () => {
      const sc = document.createElement('canvas');
      sc.width = img.width;
      sc.height = img.height;
      const sctx = sc.getContext('2d');
      sctx.drawImage(img, 0, 0);

      // Make near-white background transparent
      const imgData = sctx.getImageData(0, 0, sc.width, sc.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        if (r > 200 && g > 200 && b > 200) {
          d[i+3] = 0; // Transparent
        }
      }
      sctx.putImageData(imgData, 0, 0);

      const processedData = sc.toDataURL('image/png');
      studentData.sig = processedData;

      if (sigImgEl) sigImgEl.src = processedData;
      if (sigPreview) sigPreview.style.display = 'block';

      updateLiveCard();
      showToast('✓ Signature image uploaded and processed');
    };
    img.src = src;
  }

  // ── 4. Passport Photo Capture (Upload & Webcam) ──
  function initWebcam() {
    const video = document.getElementById('camera-video');
    const snapBtn = document.getElementById('btn-snap-photo');
    const startCamBtn = document.getElementById('btn-start-camera');

    document.getElementById('tab-photo-upload')?.addEventListener('click', () => {
      document.getElementById('tab-photo-upload').classList.add('active');
      document.getElementById('tab-photo-camera').classList.remove('active');
      document.getElementById('photo-upload-pane').style.display = 'block';
      document.getElementById('photo-camera-pane').style.display = 'none';
      stopCamera();
    });

    document.getElementById('tab-photo-camera')?.addEventListener('click', () => {
      document.getElementById('tab-photo-camera').classList.add('active');
      document.getElementById('tab-photo-upload').classList.remove('active');
      document.getElementById('photo-upload-pane').style.display = 'none';
      document.getElementById('photo-camera-pane').style.display = 'block';
      startCamera();
    });

    photoFileInput?.addEventListener('change', handlePhotoUpload);

    rmPhotoBtn?.addEventListener('click', () => {
      studentData.photo = null;
      photoPreview.style.display = 'none';
      photoPlaceholder.style.display = 'flex';
      rmPhotoBtn.style.display = 'none';
      updateLiveCard();
    });

    startCamBtn?.addEventListener('click', startCamera);

    snapBtn?.addEventListener('click', () => {
      if (!video || !isWebcamRunning) return;
      const sc = document.createElement('canvas');
      sc.width = 300;
      sc.height = 400; // 3:4 passport aspect ratio
      const sctx = sc.getContext('2d');

      // Crop center 3:4 rectangle from video
      const vW = video.videoWidth || 640;
      const vH = video.videoHeight || 480;
      const targetW = vH * (3 / 4);
      const startX = (vW - targetW) / 2;

      sctx.drawImage(video, startX, 0, targetW, vH, 0, 0, sc.width, sc.height);

      const photoUrl = sc.toDataURL('image/jpeg', 0.9);
      studentData.photo = photoUrl;

      photoPreview.src = photoUrl;
      photoPreview.style.display = 'block';
      photoPlaceholder.style.display = 'none';
      rmPhotoBtn.style.display = 'inline-block';

      stopCamera();
      showToast('✓ Photo snapped from webcam');
      updateLiveCard();
    });
  }

  async function startCamera() {
    const video = document.getElementById('camera-video');
    const camStatus = document.getElementById('camera-status');
    const snapBtn = document.getElementById('btn-snap-photo');

    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      video.srcObject = webcamStream;
      await video.play();
      isWebcamRunning = true;
      if (camStatus) camStatus.textContent = 'Camera active. Center face inside frame.';
      if (snapBtn) snapBtn.disabled = false;
    } catch (err) {
      if (camStatus) camStatus.textContent = 'Camera permission denied or unavailable.';
      console.warn('Camera access error:', err);
    }
  }

  function stopCamera() {
    if (webcamStream) {
      webcamStream.getTracks().forEach(t => t.stop());
      webcamStream = null;
    }
    isWebcamRunning = false;
    const snapBtn = document.getElementById('btn-snap-photo');
    if (snapBtn) snapBtn.disabled = true;
  }

  function handlePhotoUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      // Auto crop / fit to 3:4 ratio
      const img = new Image();
      img.onload = () => {
        const sc = document.createElement('canvas');
        sc.width = 300;
        sc.height = 400; // 3:4 ratio
        const sctx = sc.getContext('2d');

        // Center crop
        const imgAspect = img.width / img.height;
        const targetAspect = 3 / 4;
        let sx, sy, sw, sh;

        if (imgAspect > targetAspect) {
          sh = img.height;
          sw = img.height * targetAspect;
          sx = (img.width - sw) / 2;
          sy = 0;
        } else {
          sw = img.width;
          sh = img.width / targetAspect;
          sx = 0;
          sy = (img.height - sh) / 2;
        }

        sctx.drawImage(img, sx, sy, sw, sh, 0, 0, sc.width, sc.height);
        const croppedUrl = sc.toDataURL('image/jpeg', 0.9);

        studentData.photo = croppedUrl;
        photoPreview.src = croppedUrl;
        photoPreview.style.display = 'block';
        photoPlaceholder.style.display = 'none';
        rmPhotoBtn.style.display = 'inline-block';

        updateLiveCard();
        showToast('✓ Passport photo uploaded and formatted to 3:4');
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ── 5. Field Change Listeners ──
  function initFieldListeners() {
    fName?.addEventListener('input', () => {
      studentData.name = fName.value.trim().toUpperCase();
      updateLiveCard();
    });

    fRegNo?.addEventListener('input', () => {
      studentData.schoolRegNo = fRegNo.value.trim().toUpperCase();
      studentData.matric = studentData.schoolRegNo;
      autoCalculateGraduation();
      updateLiveCard();
    });

    fLevel?.addEventListener('change', () => {
      studentData.level = fLevel.value;
      updateLiveCard();
    });

    const handleSessionChange = () => {
      studentData.session = fSession ? fSession.value.trim() : '2024/2025';
      autoCalculateGraduation();
      updateLiveCard();
    };
    fSession?.addEventListener('input', handleSessionChange);
    fSession?.addEventListener('change', handleSessionChange);

    const handleExpiryChange = () => {
      const val = fExpiry ? fExpiry.value.trim() : '2029';
      studentData.expiry = parseInt(val, 10) || val || 2029;
      updateLiveCard();
    };
    fExpiry?.addEventListener('input', handleExpiryChange);
    fExpiry?.addEventListener('change', handleExpiryChange);

    // Toggle Front / Back Preview
    document.getElementById('btn-view-front')?.addEventListener('click', () => {
      currentView = 'front';
      document.getElementById('btn-view-front').classList.add('active');
      document.getElementById('btn-view-back').classList.remove('active');
      updateLiveCard();
    });

    document.getElementById('btn-view-back')?.addEventListener('click', () => {
      currentView = 'back';
      document.getElementById('btn-view-back').classList.add('active');
      document.getElementById('btn-view-front').classList.remove('active');
      updateLiveCard();
    });

    // Primary Action Buttons
    document.getElementById('btn-save-record')?.addEventListener('click', saveAndBindRecord);
    document.getElementById('btn-test-scan')?.addEventListener('click', openScanModal);
    document.getElementById('btn-open-verifier')?.addEventListener('click', openPublicVerifierPage);
    document.getElementById('btn-download-front')?.addEventListener('click', downloadFrontPNG);
    document.getElementById('btn-download-back')?.addEventListener('click', downloadBackPNG);
    document.getElementById('btn-print-slip')?.addEventListener('click', () => window.print());
    document.getElementById('btn-load-sample')?.addEventListener('click', loadSampleData);

    // Modal Close
    document.getElementById('modal-close-btn')?.addEventListener('click', closeScanModal);
    document.getElementById('scan-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'scan-modal-overlay') closeScanModal();
    });
  }

  // ── 6. Live QR Generation & Card Rendering ──
  function buildVerificationURL() {
    const reg = studentData.schoolRegNo || studentData.matric || 'EBSU/2024/00000';
    const name = studentData.name || 'STUDENT NAME';
    const fac = studentData.faculty || '';
    const dept = studentData.department || '';
    const blood = studentData.blood || 'O+';
    const geno = studentData.genotype || 'AA';
    const cardId = studentData.id;
    const exp = studentData.expiry || 2029;
    const lvl = studentData.level || '100 Level';
    const ses = studentData.session || '2024/2025';

    // Build URL pointing to verify.html with compact query params
    const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
    const url = `${window.location.origin}${basePath}/verify.html?m=${encodeURIComponent(reg)}&n=${encodeURIComponent(name)}&f=${encodeURIComponent(fac)}&d=${encodeURIComponent(dept)}&b=${encodeURIComponent(blood)}&g=${encodeURIComponent(geno)}&c=${cardId}&exp=${exp}&lvl=${encodeURIComponent(lvl)}&ses=${encodeURIComponent(ses)}`;
    return url;
  }

  function getStudentPayload() {
    const verificationUrl = buildVerificationURL();
    return {
      id: studentData.id,
      cardId: studentData.id,
      name: studentData.name || 'STUDENT FULL NAME',
      fullName: studentData.name || 'STUDENT FULL NAME',
      matric: studentData.schoolRegNo || 'EBSU/2024/00000',
      schoolRegNo: studentData.schoolRegNo || 'EBSU/2024/00000',
      faculty: studentData.faculty || '—',
      dept: studentData.department || '—',
      department: studentData.department || '—',
      blood: studentData.blood,
      bloodGroup: studentData.blood,
      genotype: studentData.genotype,
      level: studentData.level,
      session: studentData.session,
      expiry: studentData.expiry,
      photo: studentData.photo,
      photoUrl: studentData.photo,
      sig: studentData.sig,
      signatureUrl: studentData.sig,
      qrString: verificationUrl,
      status: 'active'
    };
  }

  function updateLiveCard() {
    // 1. Build Verification URL for QR code
    const verificationUrl = buildVerificationURL();
    studentData.qrString = verificationUrl;

    // 2. Render Card Canvas (Front or Back)
    const stRecord = getStudentPayload();

    const activeTemplate = (typeof CardTemplate !== 'undefined' && CardTemplate.get) ? CardTemplate.get() : null;
    if (cardCanvas && typeof drawCard === 'function') {
      if (currentView === 'front') {
        drawCard(cardCanvas, activeTemplate, stRecord, 1);
      } else if (typeof drawBackCard === 'function') {
        drawBackCard(cardCanvas, activeTemplate, stRecord, 1);
      }
    }

    // 3. Render Enlarged QR Canvas
    if (qrDisplayCanvas && typeof QRGen !== 'undefined') {
      QRGen.drawToCanvas(qrDisplayCanvas, verificationUrl, 4);
    }

    // 4. Update Binding Checklists
    updateChecklist();
  }

  function updateChecklist() {
    setItemChecked('chk-name', Boolean(studentData.name && studentData.name.length >= 3));
    setItemChecked('chk-regno', Boolean(studentData.schoolRegNo && studentData.schoolRegNo.length >= 4));
    setItemChecked('chk-fac', Boolean(studentData.faculty && studentData.faculty.length > 0));
    setItemChecked('chk-vitals', Boolean(studentData.blood && studentData.genotype));
    setItemChecked('chk-photo', Boolean(studentData.photo));
    setItemChecked('chk-sig', Boolean(studentData.sig));
  }

  function setItemChecked(id, isChecked) {
    const el = document.getElementById(id);
    if (!el) return;
    if (isChecked) {
      el.classList.add('checked');
      el.querySelector('.mf-check-icon').textContent = '✓';
    } else {
      el.classList.remove('checked');
      el.querySelector('.mf-check-icon').textContent = '○';
    }
  }

  // ── 7. Save and Bind Record ──
  async function saveAndBindRecord() {
    if (!studentData.name) {
      showToast('Please enter the student\'s full name.', true);
      fName?.focus();
      return;
    }
    if (!studentData.schoolRegNo) {
      showToast('Please enter the student\'s School Reg Number.', true);
      fRegNo?.focus();
      return;
    }

    const verificationUrl = buildVerificationURL();
    studentData.qrString = verificationUrl;

    // 1. Save to StudentDataSource & localStorage
    if (typeof StudentDataSource !== 'undefined' && StudentDataSource.saveManualStudent) {
      StudentDataSource.saveManualStudent({
        id: studentData.id,
        name: studentData.name,
        school_reg_no: studentData.schoolRegNo,
        matric: studentData.schoolRegNo,
        faculty: studentData.faculty,
        dept: studentData.department,
        blood: studentData.blood,
        genotype: studentData.genotype,
        level: studentData.level,
        session: studentData.session,
        expiry: studentData.expiry,
        photo_url: studentData.photo,
        signature_url: studentData.sig,
        qr_string: verificationUrl,
        status: 'active'
      });
    }

    // 2. If Supabase is connected, attempt cloud sync
    if (typeof ebsuSupabase !== 'undefined' && ebsuSupabase) {
      try {
        await ebsuSupabase.from('students').upsert({
          matric: studentData.schoolRegNo,
          name: studentData.name,
          faculty: studentData.faculty,
          dept: studentData.department,
          blood: studentData.blood,
          genotype: studentData.genotype,
          expiry: studentData.expiry,
          status: 'active'
        }, { onConflict: 'matric' });
      } catch (err) {
        console.warn('Supabase background sync notice:', err.message);
      }
    }

    triggerHaptic([30, 50, 30]);
    showToast('🎉 All details successfully tied to QR code & saved!');
  }

  // ── 8. Modal Scan Simulator ──
  function openScanModal() {
    const modal = document.getElementById('scan-modal-overlay');
    if (!modal) return;

    // Populate modal with live bound details
    document.getElementById('sim-photo').src = studentData.photo || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="120" fill="%2394a3b8"><rect width="100" height="120" fill="%231e293b"/><circle cx="50" cy="45" r="22"/><path d="M15 110 C 15 75, 85 75, 85 110 Z"/></svg>';
    document.getElementById('sim-name').textContent = studentData.name || 'STUDENT FULL NAME';
    document.getElementById('sim-regno').textContent = studentData.schoolRegNo || 'EBSU/2024/00000';
    document.getElementById('sim-faculty').textContent = studentData.faculty || '—';
    document.getElementById('sim-dept').textContent = studentData.department || '—';
    document.getElementById('sim-blood').textContent = studentData.blood || '—';
    document.getElementById('sim-genotype').textContent = studentData.genotype || '—';
    document.getElementById('sim-level').textContent = studentData.level || '100 Level';
    document.getElementById('sim-session').textContent = studentData.session || '2024/2025';
    document.getElementById('sim-timestamp').textContent = new Date().toLocaleString();

    const simSigArea = document.getElementById('sim-sig-area');
    if (studentData.sig && simSigArea) {
      simSigArea.style.display = 'block';
      document.getElementById('sim-sig-img').src = studentData.sig;
    } else if (simSigArea) {
      simSigArea.style.display = 'none';
    }

    modal.style.display = 'flex';
  }

  function closeScanModal() {
    const modal = document.getElementById('scan-modal-overlay');
    if (modal) modal.style.display = 'none';
  }

  function openPublicVerifierPage() {
    const url = buildVerificationURL();
    window.open(url, '_blank');
  }

  // ── 9. High-Res PNG Download ──
  function downloadCanvasAsPNG(canvas, filename) {
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      showToast('Error: Canvas is empty, cannot export.', true);
      return;
    }

    function triggerDownload(url) {
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      }, 1500);
    }

    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((blob) => {
          if (blob) {
            const objectUrl = URL.createObjectURL(blob);
            triggerDownload(objectUrl);
          } else {
            const dataUrl = canvas.toDataURL('image/png');
            if (dataUrl && dataUrl !== 'data:,') {
              triggerDownload(dataUrl);
            } else {
              showToast('Error: Failed to export card image.', true);
            }
          }
        }, 'image/png');
      } else {
        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl && dataUrl !== 'data:,') {
          triggerDownload(dataUrl);
        } else {
          showToast('Error: Failed to export card image.', true);
        }
      }
    } catch (err) {
      console.warn('Canvas export fallback:', err);
      const dataUrl = canvas.toDataURL('image/png');
      if (dataUrl && dataUrl !== 'data:,') {
        triggerDownload(dataUrl);
      } else {
        showToast('Error: Failed to export card image.', true);
      }
    }
  }

  function downloadFrontPNG() {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 1011;
    exportCanvas.height = 638;
    const activeTemplate = (typeof CardTemplate !== 'undefined' && CardTemplate.get) ? CardTemplate.get() : null;
    const stRecord = getStudentPayload();

    if (typeof drawCard === 'function') {
      drawCard(exportCanvas, activeTemplate, stRecord, 1);
      setTimeout(() => {
        const cleanReg = (studentData.schoolRegNo || 'CARD').replace(/[^a-zA-Z0-9]/g, '_');
        downloadCanvasAsPNG(exportCanvas, `EBSU_ID_FRONT_${cleanReg}.png`);
        showToast('✓ Front ID card downloaded');
      }, 300);
    }
  }

  function downloadBackPNG() {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 1011;
    exportCanvas.height = 638;
    const activeTemplate = (typeof CardTemplate !== 'undefined' && CardTemplate.get) ? CardTemplate.get() : null;
    const stRecord = getStudentPayload();

    if (typeof drawBackCard === 'function') {
      drawBackCard(exportCanvas, activeTemplate, stRecord, 1);
      setTimeout(() => {
        const cleanReg = (studentData.schoolRegNo || 'CARD').replace(/[^a-zA-Z0-9]/g, '_');
        downloadCanvasAsPNG(exportCanvas, `EBSU_ID_BACK_${cleanReg}.png`);
        showToast('✓ Back ID card downloaded');
      }, 300);
    }
  }

  // ── 10. Load Realistic Sample Data ──
  function loadSampleData() {
    fName.value = 'NNAJI WILSON SOMTOCHUKWU';
    fRegNo.value = 'EBSU/2024/98421';
    fFaculty.value = 'Science';
    updateDeptSuggestions(fFaculty.value);
    fDept.value = 'Computer Science';
    fLevel.value = '200 Level';
    fSession.value = '2024/2025';
    fExpiry.value = '2029';

    studentData.name = fName.value;
    studentData.schoolRegNo = fRegNo.value;
    studentData.matric = fRegNo.value;
    studentData.jambNo = '202552179149SI';
    studentData.dob = '2003-02-26';
    studentData.faculty = fFaculty.value;
    studentData.department = fDept.value;
    studentData.level = fLevel.value;
    studentData.session = fSession.value;
    studentData.expiry = 2029;

    // Blood & Genotype pills
    document.querySelectorAll('[data-blood]').forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-blood') === 'O+');
    });
    studentData.blood = 'O+';

    document.querySelectorAll('[data-genotype]').forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-genotype') === 'AA');
    });
    studentData.genotype = 'AA';

    // Sample Signature (Stylized W.S. Nnaji cursive SVG)
    studentData.sig = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="220" height="60"><text x="10" y="44" font-family="Brush Script MT, cursive" font-size="38" font-weight="bold" fill="%230b2545">Wilson.N</text></svg>';
    if (sigImgEl) sigImgEl.src = studentData.sig;
    if (sigPreview) sigPreview.style.display = 'block';

    // Sample Passport (Professional Academic Portrait)
    studentData.photo = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="%23990000"/><circle cx="150" cy="140" r="70" fill="%23d4a574"/><rect x="65" y="240" width="170" height="160" rx="30" fill="%230c1b2f"/><path d="M125 240 L150 290 L175 240 Z" fill="%23ffffff"/><polygon points="144,285 156,285 152,360 148,360" fill="%231558c0"/><text x="150" y="380" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="%23ffffff" text-anchor="middle">OFFICIAL PASSPORT</text></svg>';
    photoPreview.src = studentData.photo;
    photoPreview.style.display = 'block';
    photoPlaceholder.style.display = 'none';
    rmPhotoBtn.style.display = 'inline-block';

    updateLiveCard();
    showToast('✨ Realistic demo student record loaded!');
  }

  // ── Helper Toast & Haptics ──
  function showToast(msg, isError = false) {
    const toast = document.getElementById('mf-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.borderLeftColor = isError ? 'var(--mf-red)' : 'var(--mf-green)';
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3500);
  }

  function triggerHaptic(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

})();
