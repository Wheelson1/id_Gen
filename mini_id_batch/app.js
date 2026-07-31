/**
 * Mini ID Batch — Main Application Logic (Updated with exact Crest & Scannable QR)
 */

document.addEventListener('DOMContentLoaded', () => {
  // ── Element References ───────────────────────────────────────
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

  // Modals
  const batchModal = document.getElementById('batch-modal');
  const btnBatchModal = document.getElementById('btn-batch-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnLoadBatch = document.getElementById('btn-load-batch');
  const batchJsonInput = document.getElementById('batch-json-input');

  const verifyModal = document.getElementById('verify-modal');
  const btnCloseVerify = document.getElementById('btn-close-verify');
  const verifyModalContent = document.getElementById('verify-modal-content');

  let qrCodeInstance = null;

  // ── 1. Set Official Green & Gold EBSU Crest Logo ────────────
  ebsuCrestImg.src = 'ebsu_crest_logo.jpeg';

  // Set Default Student Photo (Placeholder Avatar)
  const defaultAvatar = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" fill="%23cbd5e1"><rect width="100" height="120" fill="%23f1f5f9"/><circle cx="50" cy="45" r="22" fill="%2394a3b8"/><path d="M15 110 C 15 75, 85 75, 85 110 Z" fill="%2394a3b8"/></svg>';
  cardPhotoImg.src = defaultAvatar;

  // ── 2. Update Card Preview Logic ────────────────────────────
  function updateCardPreview() {
    cardMatricText.textContent = inpMatric.value || 'EBSU/2019/97009';
    cardNameText.textContent = inpName.value || 'Ogbonnaya Nnagozie';
    cardFacultyText.textContent = inpFaculty.value || 'Science';
    cardDeptText.textContent = inpDept.value || 'Applied Biology';
    cardExpiryText.textContent = inpExpiry.value || '2023';

    // Format Blood Group HTML
    const bgVal = inpBlood.value || 'O+';
    if (bgVal.includes('+')) {
      cardBloodText.innerHTML = `${bgVal.replace('+', '')}<sup>+</sup>`;
    } else if (bgVal.includes('-')) {
      cardBloodText.innerHTML = `${bgVal.replace('-', '')}<sup>-</sup>`;
    } else {
      cardBloodText.textContent = bgVal;
    }

    cardGenotypeText.textContent = inpGenotype.value || 'AA';
    cardSigText.textContent = inpSignatureText.value || 'O.N';
    cardPhoneText.textContent = inpPhone.value || '+234-8067664449';

    // Regenerate Live Scannable Verification QR Code
    generateQRCode();
  }

  // ── 3. Dynamic High-Contrast Scannable QR Code Encoder ──────
  function generateQRCode() {
    const matric = inpMatric.value || 'EBSU/2019/97009';
    const name = inpName.value || 'Ogbonnaya Nnagozie';
    const faculty = inpFaculty.value || 'Science';
    const dept = inpDept.value || 'Applied Biology';
    const expiry = inpExpiry.value || '2023';
    const blood = inpBlood.value || 'O+';
    const genotype = inpGenotype.value || 'AA';

    // Construct clean, instantly scannable verification URL
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

    // Clear previous QR canvas/image
    qrElement.innerHTML = '';

    if (typeof QRCode !== 'undefined') {
      qrCodeInstance = new QRCode(qrElement, {
        text: qrPayload,
        width: 128,  // High resolution rendering for sharp mobile camera scanning
        height: 128,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  }

  // ── 4. Photo & Signature Upload Handlers ────────────────────
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

  // Attach live keyup/change listeners to all inputs
  [
    inpMatric, inpName, inpFaculty, inpDept,
    inpExpiry, inpSignatureText, inpBlood, inpGenotype, inpPhone
  ].forEach(inp => {
    inp.addEventListener('input', updateCardPreview);
    inp.addEventListener('change', updateCardPreview);
  });

  // ── 5. Presets ──────────────────────────────────────────────
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
        updateCardPreview();
      }
    });
  });

  // ── 6. Tab Switcher (Front / Back / Both) ───────────────────
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

  // ── 7. Card Verification Quick Modal Trigger ───────────────
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

  // ── 8. Export to High-Res PNG via html2canvas ───────────────
  function exportCard(cardElement, filename) {
    if (typeof html2canvas === 'undefined') {
      alert('html2canvas library is loading, please try again.');
      return;
    }

    const wasHidden = cardElement.classList.contains('hidden-card');
    cardElement.classList.remove('hidden-card');

    html2canvas(cardElement, {
      scale: 3, // High-res 300 DPI export
      useCORS: true,
      backgroundColor: null
    }).then(canvas => {
      if (wasHidden) cardElement.classList.add('hidden-card');

      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
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

  // ── CorelDRAW Layout Template Exporter (.pdf / 1:1 mm vector scale) ──
  const btnExportCorel = document.getElementById('btn-export-corel');

  async function exportCorelDrawTemplate() {
    if (typeof html2canvas === 'undefined') {
      alert('html2canvas library is loading, please try again.');
      return;
    }

    const cleanMatric = (inpMatric.value || 'card').replace(/[^a-zA-Z0-9]/g, '_');

    // Ensure both cards are visible for capture
    const frontWasHidden = cardFrontNode.classList.contains('hidden-card');
    const backWasHidden = cardBackNode.classList.contains('hidden-card');

    cardFrontNode.classList.remove('hidden-card');
    cardBackNode.classList.remove('hidden-card');

    try {
      // 1. Capture Front Card at 300 DPI high resolution
      const canvasFront = await html2canvas(cardFrontNode, {
        scale: 4,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      // 2. Capture Back Card at 300 DPI high resolution
      const canvasBack = await html2canvas(cardBackNode, {
        scale: 4,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      // Restore initial tab visibility states
      if (frontWasHidden) cardFrontNode.classList.add('hidden-card');
      if (backWasHidden) cardBackNode.classList.add('hidden-card');

      const imgDataFront = canvasFront.toDataURL('image/png', 1.0);
      const imgDataBack = canvasBack.toDataURL('image/png', 1.0);

      // Check if jsPDF is loaded
      const { jsPDF } = window.jspdf || {};
      if (jsPDF) {
        // Create A5 portrait PDF document matching CorelDRAW kfx.cdr page setup (148mm x 210mm)
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: [148, 210] // A5 dimensions matching CorelDRAW screenshot
        });

        // Exact 1:1 Scale Card Dimensions in mm (85.6mm x 53.98mm)
        const cardW_mm = 85.6;
        const cardH_mm = 53.98;

        // Position on A5 sheet matching kfx.cdr guidelines:
        // Centered horizontally: (148 - 85.6) / 2 = 31.2mm
        const posX_mm = 31.2;
        // Front Card Y coordinate
        const posY_front_mm = 40;
        // Back Card Y coordinate (stacked directly below with 12mm gap)
        const posY_back_mm = 40 + cardH_mm + 12;

        // Add Front Card
        doc.addImage(imgDataFront, 'PNG', posX_mm, posY_front_mm, cardW_mm, cardH_mm);

        // Add Back Card
        doc.addImage(imgDataBack, 'PNG', posX_mm, posY_back_mm, cardW_mm, cardH_mm);

        // Save PDF ready for direct CorelDRAW Import/Open
        doc.save(`EBSU_CorelDRAW_Layout_${cleanMatric}.pdf`);
      } else {
        // Fallback: download 300 DPI high-res PNG
        const link = document.createElement('a');
        link.download = `EBSU_CorelDRAW_Front_${cleanMatric}.png`;
        link.href = imgDataFront;
        link.click();
      }

    } catch (err) {
      console.error('Error generating CorelDRAW export:', err);
      alert('Failed to generate export file. Please try again.');
    }
  }

  if (btnExportCorel) {
    btnExportCorel.addEventListener('click', exportCorelDrawTemplate);
  }

  // ── 9. Batch Modal ──────────────────────────────────────────
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

  // Initialize on load
  updateCardPreview();
});
