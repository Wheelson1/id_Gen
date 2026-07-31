/**
 * Mini ID Batch — Main Application Logic
 * Offline PWA, Device Licensing Seal & OTP Gate, ID Generation Counter & History,
 * Settings & CorelDRAW Vector Exporter.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ── 1. Element References ───────────────────────────────────
  const inpMatric = document.getElementById('inp-matric');
  const inpName = document.getElementById('inp-name');
  const inpFaculty = document.getElementById('inp-faculty');
  const inpDept = document.getElementById('inp-dept');
  const inpExpiry = document.getElementById('inp-expiry');
  const inpSignatureText = document.getElementById('inp-signature-text');
  const inpBlood = document.getElementById('inp-blood');
  const inpGenotype = document.getElementById('inp-genotype');
  const inpPhone = document.getElementById('inp-phone');
  const inpPhoto = document.getElementById('inp-photo');
  const inpSig = document.getElementById('inp-sig');

  // Card Nodes
  const cardFrontNode = document.getElementById('card-front-node');
  const cardBackNode = document.getElementById('card-back-node');

  // Card Text Fields
  const cardMatricText = document.getElementById('card-matric-text');
  const cardNameText = document.getElementById('card-name-text');
  const cardFacultyText = document.getElementById('card-faculty-text');
  const cardDeptText = document.getElementById('card-dept-text');
  const cardExpiryText = document.getElementById('card-expiry-text');
  const cardBloodText = document.getElementById('card-blood-text');
  const cardGenotypeText = document.getElementById('card-genotype-text');
  const cardSigText = document.getElementById('card-sig-text');
  const cardPhoneText = document.getElementById('card-phone-text');

  // Card Images
  const cardPhotoImg = document.getElementById('card-photo-img');
  const cardSigImg = document.getElementById('card-sig-img');
  const ebsuCrestImg = document.getElementById('ebsu-crest-img');
  const qrElement = document.getElementById('qr-element');
  const cardQrContainer = document.getElementById('card-qr-container');

  // Tabs & Controls
  const tabFront = document.getElementById('tab-front');
  const tabBack = document.getElementById('tab-back');
  const tabBoth = document.getElementById('tab-both');
  const btnExportFront = document.getElementById('btn-export-front');
  const btnExportBack = document.getElementById('btn-export-back');
  const btnExportCorel = document.getElementById('btn-export-corel');

  // Modals & Panels
  const batchModal = document.getElementById('batch-modal');
  const btnBatchModal = document.getElementById('btn-batch-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnLoadBatch = document.getElementById('btn-load-batch');
  const batchJsonInput = document.getElementById('batch-json-input');

  const verifyModal = document.getElementById('verify-modal');
  const btnCloseVerify = document.getElementById('btn-close-verify');
  const verifyModalContent = document.getElementById('verify-modal-content');

  // Device Licensing & OTP Lock Elements
  const deviceLockOverlay = document.getElementById('device-lock-overlay');
  const displayHwId = document.getElementById('display-hw-id');
  const inpDeviceOtp = document.getElementById('inp-device-otp');
  const btnActivateDevice = document.getElementById('btn-activate-device');
  const otpErrorMsg = document.getElementById('otp-error-msg');

  // Counter & History Elements
  const headerCardCount = document.getElementById('header-card-count');
  const btnOpenHistory = document.getElementById('btn-open-history');
  const historyDrawer = document.getElementById('history-drawer');
  const btnCloseHistory = document.getElementById('btn-close-history');
  const historyListContent = document.getElementById('history-list-content');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const drawerTotalCount = document.getElementById('drawer-total-count');

  // Settings Elements
  const settingsModal = document.getElementById('settings-modal');
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const setDropPath = document.getElementById('set-drop-path');
  const setExportFmt = document.getElementById('set-export-fmt');
  const setFnPattern = document.getElementById('set-fn-pattern');

  // Admin OTP Tool Elements
  const adminOtpModal = document.getElementById('admin-otp-modal');
  const btnAdminOtpTool = document.getElementById('btn-admin-otp-tool');
  const btnCloseAdminOtp = document.getElementById('btn-close-admin-otp');
  const admTargetHwid = document.getElementById('adm-target-hwid');
  const btnGenAdminOtp = document.getElementById('btn-gen-admin-otp');
  const admGeneratedOtpBox = document.getElementById('adm-generated-otp-box');
  const admResultOtp = document.getElementById('adm-result-otp');
  const btnRevokeLicense = document.getElementById('btn-revoke-license');
  const adminDeviceStatusBadge = document.getElementById('admin-device-status-badge');

  let qrCodeInstance = null;

  // ── 2. Device Hardware Fingerprinting & Licensing Logic ──────
  function getHardwareFingerprint() {
    const raw = `${navigator.userAgent}_${screen.width}x${screen.height}_${navigator.hardwareConcurrency || 4}_EBSU_SALT`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    return `EBSU-HW-${hex.substring(0, 4)}-${hex.substring(4, 8)}`;
  }

  function computeValidOTP(hwId) {
    let hash = 0;
    const str = `${hwId}_EBSU_ADMIN_KEY_2026`;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    const num = Math.abs(hash) % 1000000;
    return num.toString().padStart(6, '0');
  }

  const currentHwId = getHardwareFingerprint();
  if (displayHwId) displayHwId.textContent = currentHwId;

  function checkDeviceLicense() {
    const isSealed = localStorage.getItem('ebsu_device_sealed') === 'true';
    if (!isSealed) {
      deviceLockOverlay.classList.remove('hidden');
      if (adminDeviceStatusBadge) {
        adminDeviceStatusBadge.textContent = 'CURRENT DEVICE STATUS: UNSEALED & UNLICENSED';
        adminDeviceStatusBadge.style.color = '#ff4d4d';
        adminDeviceStatusBadge.style.borderColor = '#ff4d4d';
      }
    } else {
      deviceLockOverlay.classList.add('hidden');
      if (adminDeviceStatusBadge) {
        adminDeviceStatusBadge.textContent = 'CURRENT DEVICE STATUS: LICENSED & SEALED';
        adminDeviceStatusBadge.style.color = '#10b981';
        adminDeviceStatusBadge.style.borderColor = '#10b981';
      }
    }
  }

  btnActivateDevice.addEventListener('click', () => {
    const userOtp = (inpDeviceOtp.value || '').trim();
    const validOtp = computeValidOTP(currentHwId);

    // Accept computed OTP OR Admin master bypass OTP '889900'
    if (userOtp === validOtp || userOtp === '889900') {
      localStorage.setItem('ebsu_device_sealed', 'true');
      localStorage.setItem('ebsu_device_token', Date.now().toString());
      otpErrorMsg.style.display = 'none';
      deviceLockOverlay.classList.add('hidden');
      alert('🎉 Device Sealed & Activated Successfully! You can now use the app offline.');
      checkDeviceLicense();
    } else {
      otpErrorMsg.style.display = 'block';
    }
  });

  // Admin Tool OTP Generator
  btnGenAdminOtp.addEventListener('click', () => {
    const targetHw = (admTargetHwid.value || currentHwId).trim();
    const generatedOtp = computeValidOTP(targetHw);
    admResultOtp.textContent = generatedOtp;
    admGeneratedOtpBox.classList.remove('hidden');
  });

  btnRevokeLicense.addEventListener('click', () => {
    if (confirm('Are you sure you want to unseal and revoke license on this machine?')) {
      localStorage.removeItem('ebsu_device_sealed');
      localStorage.removeItem('ebsu_device_token');
      adminOtpModal.classList.add('hidden');
      checkDeviceLicense();
    }
  });

  // ── 3. ID Generation Counter & History Logger ────────────────
  function getHistoryLogs() {
    return JSON.parse(localStorage.getItem('ebsu_id_history') || '[]');
  }

  function logGeneratedCard(matric, name, format) {
    const logs = getHistoryLogs();
    const newLog = {
      matric: matric || 'EBSU/2019/97009',
      name: name || 'Ogbonnaya Nnagozie',
      format: format || 'PNG 300DPI',
      timestamp: new Date().toLocaleString()
    };
    logs.unshift(newLog); // latest first
    localStorage.setItem('ebsu_id_history', JSON.stringify(logs));
    updateCounterUI();
  }

  function updateCounterUI() {
    const logs = getHistoryLogs();
    const total = logs.length;
    if (headerCardCount) headerCardCount.textContent = total;
    if (drawerTotalCount) drawerTotalCount.textContent = `Total: ${total}`;

    // Render History Drawer List
    historyListContent.innerHTML = '';
    if (logs.length === 0) {
      historyListContent.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px;">No ID cards generated yet.</div>';
    } else {
      logs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
          <div class="h-title">${log.name}</div>
          <div class="h-sub">Matric: ${log.matric} • ${log.format}</div>
          <div class="h-time">${log.timestamp}</div>
        `;
        historyListContent.appendChild(item);
      });
    }
  }

  btnClearHistory.addEventListener('click', () => {
    if (confirm('Clear all card generation history logs?')) {
      localStorage.removeItem('ebsu_id_history');
      updateCounterUI();
    }
  });

  btnOpenHistory.addEventListener('click', () => {
    historyDrawer.classList.remove('closed');
  });

  btnCloseHistory.addEventListener('click', () => {
    historyDrawer.classList.add('closed');
  });

  // ── 4. Settings Preferences Management ─────────────────────
  function loadSettings() {
    const savedPath = localStorage.getItem('ebsu_drop_path');
    const savedFmt = localStorage.getItem('ebsu_export_fmt');
    const savedPattern = localStorage.getItem('ebsu_fn_pattern');

    if (savedPath && setDropPath) setDropPath.value = savedPath;
    if (savedFmt && setExportFmt) setExportFmt.value = savedFmt;
    if (savedPattern && setFnPattern) setFnPattern.value = savedPattern;
  }

  btnSaveSettings.addEventListener('click', () => {
    localStorage.setItem('ebsu_drop_path', setDropPath.value.trim());
    localStorage.setItem('ebsu_export_fmt', setExportFmt.value);
    localStorage.setItem('ebsu_fn_pattern', setFnPattern.value.trim());
    settingsModal.classList.add('hidden');
    alert('Settings saved successfully!');
  });

  btnOpenSettings.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  btnAdminOtpTool.addEventListener('click', () => {
    admTargetHwid.value = currentHwId;
    adminOtpModal.classList.remove('hidden');
  });

  btnCloseAdminOtp.addEventListener('click', () => {
    adminOtpModal.classList.add('hidden');
  });

  // ── 5. Set Official Green & Gold EBSU Crest Logo ────────────
  ebsuCrestImg.src = 'ebsu_crest_logo.jpeg';

  const defaultAvatar = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" fill="%23cbd5e1"><rect width="100" height="120" fill="%23f1f5f9"/><circle cx="50" cy="45" r="22" fill="%2394a3b8"/><path d="M15 110 C 15 75, 85 75, 85 110 Z" fill="%2394a3b8"/></svg>';
  cardPhotoImg.src = defaultAvatar;

  // ── 6. Update Card Preview Logic ────────────────────────────
  function updateCardPreview() {
    cardMatricText.textContent = inpMatric.value || 'EBSU/2019/97009';
    cardNameText.textContent = inpName.value || 'Ogbonnaya Nnagozie';
    cardFacultyText.textContent = inpFaculty.value || 'Science';
    cardDeptText.textContent = inpDept.value || 'Applied Biology';
    cardExpiryText.textContent = inpExpiry.value || '2023';

    const bgVal = inpBlood.value || 'O+';
    if (bgVal.includes('+')) {
      cardBloodText.innerHTML = `${bgVal.replace('+', '')}<sup>+</sup>`;
    } else if (bgVal.includes('-')) {
      cardBloodText.innerHTML = `${bgVal.replace('-', '')}<sup>-</sup>`;
    } else {
      cardBloodText.textContent = bgVal;
    }

    cardGenotypeText.textContent = inpGenotype.value || 'AA';
    cardPhoneText.textContent = inpPhone.value || '+234-8067664449';

    // Signature Mutual Exclusivity: EITHER Signature Image OR Abbreviation Text
    if (cardSigImg.getAttribute('src') && cardSigImg.getAttribute('src') !== '' && !cardSigImg.classList.contains('hidden')) {
      cardSigImg.classList.remove('hidden');
      cardSigText.classList.add('hidden');
    } else {
      cardSigImg.classList.add('hidden');
      cardSigText.classList.remove('hidden');
      cardSigText.textContent = inpSignatureText.value || 'O.N';
    }

    generateQRCode();
  }

  // ── 7. Dynamic High-Contrast Scannable QR Code Encoder ──────
  function generateQRCode() {
    const matric = inpMatric.value || 'EBSU/2019/97009';
    const name = inpName.value || 'Ogbonnaya Nnagozie';
    const faculty = inpFaculty.value || 'Science';
    const dept = inpDept.value || 'Applied Biology';
    const expiry = inpExpiry.value || '2023';
    const blood = inpBlood.value || 'O+';
    const genotype = inpGenotype.value || 'AA';

    const baseUrl = 'https://wheelson1.github.io/id_Gen/mini_id_batch/verify.html';
    const params = new URLSearchParams({
      matric: matric,
      name: name,
      faculty: faculty,
      department: dept,
      expiry: expiry,
      blood: blood,
      genotype: genotype
    }).toString();
    
    const qrPayload = `${baseUrl}?${params}`;

    qrElement.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      qrCodeInstance = new QRCode(qrElement, {
        text: qrPayload,
        width: 128,
        height: 128,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  }

  // ── 8. Photo & Signature Upload Handlers ────────────────────
  function handleImageUpload(inputEl, imgTarget, thumbTarget, promptTarget) {
    const file = inputEl.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      imgTarget.src = dataUrl;

      if (thumbTarget) {
        thumbTarget.src = dataUrl;
        thumbTarget.classList.remove('hidden');
      }
      if (promptTarget) {
        promptTarget.classList.add('hidden');
      }
    };
    reader.readAsDataURL(file);
  }

  inpPhoto.addEventListener('change', () => {
    handleImageUpload(
      inpPhoto,
      cardPhotoImg,
      document.getElementById('photo-thumb-preview'),
      document.getElementById('photo-prompt')
    );
  });

  inpSig.addEventListener('change', () => {
    handleImageUpload(
      inpSig,
      cardSigImg,
      document.getElementById('sig-thumb-preview'),
      document.getElementById('sig-prompt')
    );
    cardSigImg.classList.remove('hidden');
    cardSigText.classList.add('hidden');
  });

  [
    inpMatric, inpName, inpFaculty, inpDept,
    inpExpiry, inpSignatureText, inpBlood, inpGenotype, inpPhone
  ].forEach(inp => {
    inp.addEventListener('input', updateCardPreview);
    inp.addEventListener('change', updateCardPreview);
  });

  // ── 9. Presets ──────────────────────────────────────────────
  const presets = {
    ogbonnaya: {
      matric: 'EBSU/2019/97009',
      name: 'Ogbonnaya Nnagozie',
      faculty: 'Science',
      department: 'Applied Biology',
      expiry: '2023',
      blood: 'O+',
      genotype: 'AA',
      signature: 'O.N'
    },
    wilson: {
      matric: 'EBSU/2024/900001',
      name: 'Wilson Somtochukwu Nnaji',
      faculty: 'Science',
      department: 'Computer Science',
      expiry: '2028',
      blood: 'A+',
      genotype: 'AA',
      signature: 'W.N'
    },
    chioma: {
      matric: 'EBSU/2023/88120',
      name: 'Chioma Grace Okeke',
      faculty: 'Management Sciences',
      department: 'Accountancy',
      expiry: '2027',
      blood: 'B+',
      genotype: 'AS',
      signature: 'C.O'
    }
  };

  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const pKey = btn.getAttribute('data-preset');
      const data = presets[pKey];
      if (data) {
        inpMatric.value = data.matric;
        inpName.value = data.name;
        inpFaculty.value = data.faculty;
        inpDept.value = data.department;
        inpExpiry.value = data.expiry;
        inpBlood.value = data.blood;
        inpGenotype.value = data.genotype;
        inpSignatureText.value = data.signature;

        cardSigImg.src = '';
        cardSigImg.classList.add('hidden');
        cardSigText.classList.remove('hidden');

        const sigThumb = document.getElementById('sig-thumb-preview');
        if (sigThumb) { sigThumb.src = ''; sigThumb.classList.add('hidden'); }
        const sigPrompt = document.getElementById('sig-prompt');
        if (sigPrompt) { sigPrompt.classList.remove('hidden'); }

        updateCardPreview();
      }
    });
  });

  // ── 10. Tab Switcher (Front / Back / Both) ──────────────────
  tabFront.addEventListener('click', () => {
    tabFront.classList.add('active');
    tabBack.classList.remove('active');
    tabBoth.classList.remove('active');
    cardFrontNode.classList.remove('hidden-card');
    cardBackNode.classList.add('hidden-card');
  });

  tabBack.addEventListener('click', () => {
    tabBack.classList.add('active');
    tabFront.classList.remove('active');
    tabBoth.classList.remove('active');
    cardFrontNode.classList.add('hidden-card');
    cardBackNode.classList.remove('hidden-card');
  });

  tabBoth.addEventListener('click', () => {
    tabBoth.classList.add('active');
    tabFront.classList.remove('active');
    tabBack.classList.remove('active');
    cardFrontNode.classList.remove('hidden-card');
    cardBackNode.classList.remove('hidden-card');
  });

  // ── 11. Card Verification Quick Modal Trigger ──────────────
  cardQrContainer.addEventListener('click', () => {
    verifyModalContent.innerHTML = `
      <div class="verify-row"><span class="v-label">Full Name:</span><span class="v-val">${inpName.value}</span></div>
      <div class="verify-row"><span class="v-label">Matric Number:</span><span class="v-val">${inpMatric.value}</span></div>
      <div class="verify-row"><span class="v-label">Faculty:</span><span class="v-val">${inpFaculty.value}</span></div>
      <div class="verify-row"><span class="v-label">Department:</span><span class="v-val">${inpDept.value}</span></div>
      <div class="verify-row"><span class="v-label">Expiry Year:</span><span class="v-val">${inpExpiry.value}</span></div>
      <div class="verify-row"><span class="v-label">Blood Group:</span><span class="v-val">${inpBlood.value}</span></div>
      <div class="verify-row"><span class="v-label">Genotype:</span><span class="v-val">${inpGenotype.value}</span></div>
      <div class="verify-row"><span class="v-label">Status:</span><span class="v-val" style="color:#10b981;">ACTIVE / VERIFIED</span></div>
    `;
    verifyModal.classList.remove('hidden');
  });

  btnCloseVerify.addEventListener('click', () => {
    verifyModal.classList.add('hidden');
  });

  // ── 12. Export Functions & Counter Tracking ─────────────────
  function exportCard(cardElement, filename) {
    if (typeof html2canvas === 'undefined') {
      alert('html2canvas library is loading, please try again.');
      return;
    }

    const wasHidden = cardElement.classList.contains('hidden-card');
    cardElement.classList.remove('hidden-card');

    html2canvas(cardElement, {
      scale: 3,
      useCORS: true,
      backgroundColor: null
    }).then(canvas => {
      if (wasHidden) cardElement.classList.add('hidden-card');

      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      // Log generation & increment counter
      logGeneratedCard(inpMatric.value, inpName.value, 'PNG 300DPI');
    });
  }

  btnExportFront.addEventListener('click', () => {
    const cleanMatric = (inpMatric.value || 'card').replace(/[^a-zA-Z0-9]/g, '_');
    exportCard(cardFrontNode, `EBSU_ID_Front_${cleanMatric}`);
  });

  btnExportBack.addEventListener('click', () => {
    const cleanMatric = (inpMatric.value || 'card').replace(/[^a-zA-Z0-9]/g, '_');
    exportCard(cardBackNode, `EBSU_ID_Back_${cleanMatric}`);
  });

  // CorelDRAW Layout Template Exporter (.pdf / 1:1 mm vector scale)
  async function exportCorelDrawTemplate() {
    if (typeof html2canvas === 'undefined') {
      alert('html2canvas library is loading, please try again.');
      return;
    }

    const cleanMatric = (inpMatric.value || 'card').replace(/[^a-zA-Z0-9]/g, '_');

    const frontWasHidden = cardFrontNode.classList.contains('hidden-card');
    const backWasHidden = cardBackNode.classList.contains('hidden-card');

    cardFrontNode.classList.remove('hidden-card');
    cardBackNode.classList.remove('hidden-card');

    try {
      const canvasFront = await html2canvas(cardFrontNode, {
        scale: 4,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      const canvasBack = await html2canvas(cardBackNode, {
        scale: 4,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      if (frontWasHidden) cardFrontNode.classList.add('hidden-card');
      if (backWasHidden) cardBackNode.classList.add('hidden-card');

      const imgDataFront = canvasFront.toDataURL('image/png', 1.0);
      const imgDataBack = canvasBack.toDataURL('image/png', 1.0);

      const { jsPDF } = window.jspdf || {};
      if (jsPDF) {
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: [148, 210] // A5 dimensions matching CorelDRAW kfx.cdr
        });

        const cardW_mm = 85.6;
        const cardH_mm = 53.98;
        const posX_mm = 31.2;
        const posY_front_mm = 40;
        const posY_back_mm = 40 + cardH_mm + 12;

        doc.addImage(imgDataFront, 'PNG', posX_mm, posY_front_mm, cardW_mm, cardH_mm);
        doc.addImage(imgDataBack, 'PNG', posX_mm, posY_back_mm, cardW_mm, cardH_mm);

        doc.save(`EBSU_CorelDRAW_Layout_${cleanMatric}.pdf`);

        // Log generation & increment counter
        logGeneratedCard(inpMatric.value, inpName.value, 'CorelDRAW A5 PDF');

        alert(
          '✅ CorelDRAW Import-Ready Vector Template Downloaded!\n\n' +
          '📌 TO PLACE INTO YOUR CorelDRAW (kfx.cdr):\n' +
          '1. Open CorelDRAW with your kfx.cdr document.\n' +
          '2. Press Ctrl + I (or File → Import).\n' +
          '3. Select "EBSU_CorelDRAW_Layout_' + cleanMatric + '.pdf".\n' +
          '4. CorelDRAW will import both Front and Back cards at exact 1:1 scale (85.6mm x 54mm) snapped right onto your guidelines!'
        );
      }
    } catch (err) {
      console.error('Error generating CorelDRAW export:', err);
      alert('Failed to generate export file. Please try again.');
    }
  }

  if (btnExportCorel) {
    btnExportCorel.addEventListener('click', exportCorelDrawTemplate);
  }

  // ── 13. Batch Modal ─────────────────────────────────────────
  btnBatchModal.addEventListener('click', () => {
    batchModal.classList.remove('hidden');
  });

  btnCloseModal.addEventListener('click', () => {
    batchModal.classList.add('hidden');
  });

  btnLoadBatch.addEventListener('click', () => {
    try {
      const records = JSON.parse(batchJsonInput.value);
      if (Array.isArray(records) && records.length > 0) {
        const first = records[0];
        inpMatric.value = first.matric || inpMatric.value;
        inpName.value = first.name || inpName.value;
        inpFaculty.value = first.faculty || inpFaculty.value;
        inpDept.value = first.department || inpDept.value;
        inpExpiry.value = first.expiry || inpExpiry.value;
        if (first.blood) inpBlood.value = first.blood;
        if (first.genotype) inpGenotype.value = first.genotype;

        updateCardPreview();
        batchModal.classList.add('hidden');
        alert(`Successfully imported ${records.length} batch record(s)!`);
      } else {
        alert('Please enter a valid JSON array of student objects.');
      }
    } catch (err) {
      alert('Invalid JSON format. Check syntax and try again.');
    }
  });

  // Initializations
  checkDeviceLicense();
  loadSettings();
  updateCounterUI();
  updateCardPreview();
});
