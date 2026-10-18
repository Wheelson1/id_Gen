/**
 * student-portal.js
 */

// Initialize Supabase Client
const ebsuSupabase = supabase.createClient(EBSU_CONFIG.SUPABASE_URL, EBSU_CONFIG.SUPABASE_ANON_KEY);
let currentStudent = null;
let activeEmail = null;
let qrTimer = null;

// Session timeout - auto logout after 30 minutes of inactivity
let sessionTimer = null;
let warningTimer = null;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_TIMEOUT_MS = 28 * 60 * 1000; // 28 minutes

function resetSessionTimer() {
  if (sessionTimer) clearTimeout(sessionTimer);
  if (warningTimer) clearTimeout(warningTimer);
  
  warningTimer = setTimeout(() => {
    showToast('Warning: Your session will expire in 2 minutes due to inactivity.', true);
  }, WARNING_TIMEOUT_MS);

  sessionTimer = setTimeout(async () => {
    showToast('Session expired due to inactivity. Logging out...', true);
    await ebsuSupabase.auth.signOut();
    setTimeout(() => { window.location.reload(); }, 2000);
  }, SESSION_TIMEOUT_MS);
}

// Reset timer on user activity
['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, resetSessionTimer, { passive: true });
});
// Need to defer initial call since showToast is defined later, or just rely on first interaction
setTimeout(resetSessionTimer, 100);

// UI Elements
const authSec = document.getElementById('auth-section');
const dashSec = document.getElementById('dashboard-section');
const matricStep = document.getElementById('matric-step');
const otpStep = document.getElementById('otp-step');
const matricInput = document.getElementById('portal-matric');
const otpInput = document.getElementById('portal-otp');
const otpMsg = document.getElementById('otp-message');

function showToast(msg, isError = false) {
  const toast = document.getElementById('status-toast');
  const text  = document.getElementById('status-text');
  text.textContent = msg;
  toast.style.borderColor = isError ? '#cc0000' : '#1558c0';
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

function showStatus(elId, msg, isError) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.className = 'status-msg ' + (isError ? 'status-error' : 'status-success');
  el.style.display = 'block';
}

// ── SENSORY FEEDBACK (Law 5) ──────────────────────────────────
function playSwoosh() {
  // A subtle base64 UI swoosh sound
  const swoosh = new Audio('data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
  swoosh.volume = 0.5;
  swoosh.play().catch(e => {});
}

function playSnap() {
  const snap = new Audio('data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
  snap.volume = 0.3;
  snap.play().catch(e => {});
}

function triggerHaptic(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ── ZERO FRICTION GUEST MODE (Law 1 & 2) ──────────────────────
matricInput.addEventListener('input', () => {
  const val = matricInput.value.trim();
  const skeleton = document.getElementById('skeleton-preview');
  if (/^EBSU\/\d{4}\/\d{6,8}$/i.test(val)) {
    // Predictive intent: User typed a valid matric. We subtly animate the skeleton.
    skeleton.style.filter = 'blur(1px)';
    skeleton.style.border = '2px solid #1558c0';
    triggerHaptic(10);
  } else {
    skeleton.style.filter = 'blur(4px)';
    skeleton.style.border = '2px dashed #ccc';
  }
});


// ── AUTHENTICATION ─────────────────────────────────────────────

document.getElementById('btn-request-otp').addEventListener('click', async () => {
  const matric = matricInput.value.trim();
  if (!matric) return showToast('Please enter your Matric Number', true);

  const reqBtn = document.getElementById('btn-request-otp');
  reqBtn.textContent = 'Sending...';
  reqBtn.disabled = true;

  try {
    // Call Edge Function to safely trigger OTP based on Matric
    // Note: To implement this properly, the request-otp endpoint would be called.
    // For this prototype, we'll hit the deployed Edge Function.
    const res = await fetch(`${EBSU_CONFIG.SUPABASE_URL}/functions/v1/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matric })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to request OTP');

    // We got the real email back, now trigger Supabase Auth OTP
    activeEmail = data.email;
    const { error } = await ebsuSupabase.auth.signInWithOtp({ email: activeEmail });
    if (error) throw error;

    matricStep.style.display = 'none';
    otpStep.style.display = 'block';
    otpMsg.textContent = `A 6-digit code has been sent to ${data.masked}. Please check your inbox.`;
    showToast('Login code sent!');
  } catch (err) {
    showToast(err.message, true);
  } finally {
    const reqBtn = document.getElementById('btn-request-otp');
    reqBtn.textContent = 'Unlock Digital ID';
    reqBtn.disabled = false;
  }
});

// Grace Protocol Logic
const graceBtn = document.getElementById('btn-grace-protocol');
if (graceBtn) {
  graceBtn.addEventListener('click', (e) => {
    e.preventDefault();
    matricStep.style.display = 'none';
    document.getElementById('grace-step').style.display = 'block';
  });
}

const cancelGraceBtn = document.getElementById('btn-cancel-grace');
if (cancelGraceBtn) {
  cancelGraceBtn.addEventListener('click', () => {
    document.getElementById('grace-step').style.display = 'none';
    matricStep.style.display = 'block';
  });
}

const submitGraceBtn = document.getElementById('btn-submit-grace');
if (submitGraceBtn) {
  submitGraceBtn.addEventListener('click', async () => {
    const gMatric = document.getElementById('grace-matric').value.trim();
    const gEmail = document.getElementById('grace-email').value.trim();
    if (!gMatric || !gEmail) return showToast('Enter both Matric and Alternative Email', true);
    
    submitGraceBtn.textContent = 'Verifying...';
    submitGraceBtn.disabled = true;

    try {
      // For this prototype, simulate grace protocol backend request
      await new Promise(r => setTimeout(r, 1500));
      showToast('Grace protocol initiated. You will receive instructions at your new email.', 0);
      setTimeout(() => {
        document.getElementById('grace-step').style.display = 'none';
        matricStep.style.display = 'block';
      }, 3000);
    } catch (err) {
      showToast('Error initiating grace protocol', true);
    } finally {
      submitGraceBtn.textContent = 'Initiate Verification';
      submitGraceBtn.disabled = false;
    }
  });
}

document.getElementById('btn-verify-otp').addEventListener('click', async () => {
  const token = otpInput.value.trim();
  if (!token || !activeEmail) return showToast('Please enter the code', true);

  const verBtn = document.getElementById('btn-verify-otp');
  verBtn.textContent = 'Verifying...';
  verBtn.disabled = true;

  try {
    const { data, error } = await ebsuSupabase.auth.verifyOtp({
      email: activeEmail,
      token,
      type: 'email'
    });
    if (error) throw error;
    
    // Logged in!
    triggerHaptic([15, 30, 15]);
    playSwoosh();
    checkSession();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    verBtn.textContent = 'Verify & Log In';
    verBtn.disabled = false;
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await ebsuSupabase.auth.signOut();
  if (qrTimer) clearInterval(qrTimer);
  authSec.className = 'auth-section active-section';
  dashSec.className = 'dashboard-section';
  matricStep.style.display = 'block';
  otpStep.style.display = 'none';
  matricInput.value = '';
  otpInput.value = '';
});

// ── 1-CLICK DEMO STUDENT LOGIN ────────────────────────────────
window.loginAsDemoStudent = function(key) {
  if (typeof DemoAuthSuite !== 'undefined') {
    const persona = DemoAuthSuite.getPersona(key);
    if (!persona) return;
    DemoAuthSuite.setMockSession(key);

    const gradYear = (typeof ACADEMIC_RULES !== 'undefined')
      ? ACADEMIC_RULES.calculateGraduationYear(persona.matric || persona.jamb_no, persona.faculty, persona.dept, persona.session)
      : (persona.expiry || 2029);

    currentStudent = {
      id: 'demo-student-' + persona.key,
      name: persona.name,
      matric: persona.matric,
      jamb_no: persona.jamb_no,
      faculty: persona.faculty,
      dept: persona.dept,
      level: persona.level,
      session: persona.session,
      blood: persona.blood,
      genotype: persona.genotype,
      expiry: gradYear,
      status: persona.status,
      status_reason: persona.status_reason || null,
      fees_paid: persona.fees_paid,
      photo_url: 'images/demo_user_face.jpg',
      signature_url: 'images/demo_user_sig.jpg'
    };

    authSec.className = 'auth-section';
    dashSec.className = 'dashboard-section active-section';
    document.getElementById('dash-name').textContent = currentStudent.name.split(' ')[0];

    // Status / Fee handling
    const banner = document.getElementById('fee-banner');
    if (banner) {
      if (!currentStudent.fees_paid) {
        banner.style.display = 'block';
        banner.style.background = '#fffbeb';
        banner.style.borderColor = '#f59e0b';
        banner.style.color = '#b45309';
        banner.innerHTML = '<strong>⚠️ Tuition Fees Outstanding:</strong> Digital ID download is temporarily locked until full tuition payment is confirmed via Remita / Paystack.';
      } else if (currentStudent.status === 'revoked') {
        banner.style.display = 'block';
        banner.style.background = '#fef2f2';
        banner.style.borderColor = '#ef4444';
        banner.style.color = '#b91c1c';
        banner.innerHTML = `<strong>🚨 CARD REVOKED / REPORTED LOST:</strong> Incident Ref: <code>${currentStudent.status_reason || 'Lost'}</code>. Please visit the ID Card Bureau for a physical replacement.`;
      } else {
        banner.style.display = 'none';
      }
    }

    renderLiveCard();
    playSnap();
    showToast(`Logged in as demo student: ${currentStudent.name}`);
  }
};

// ── SESSION & DASHBOARD ────────────────────────────────────────

async function checkSession() {
  let hasSession = false;
  try {
    const { data: { session } } = await ebsuSupabase.auth.getSession();
    if (session) hasSession = true;
  } catch(e) {}

  if (!hasSession) {
    const mockSession = localStorage.getItem('ebsu_mock_session');
    const mockStudent = localStorage.getItem('ebsu_active_student');
    if (mockSession && mockStudent) {
      hasSession = true;
    }
  }

  if (hasSession) {
    authSec.className = 'auth-section';
    dashSec.className = 'dashboard-section active-section';
    loadDashboard();
  }
}

async function loadDashboard() {
  try {
    let student = null;
    try {
      const res = await ebsuSupabase.from('students').select('*').single();
      student = res.data;
    } catch(e) {}

    if (!student) {
      const mock = localStorage.getItem('ebsu_active_student');
      if (mock) student = JSON.parse(mock);
    }

    if (!student) {
      showToast('Error loading your student profile.', true);
      return;
    }
    
    currentStudent = student;
    document.getElementById('dash-name').textContent = student.name.split(' ')[0];
    
    // Check fee payment status
    if (currentStudent && !currentStudent.fees_paid) {
      const banner = document.getElementById('fee-banner');
      if (banner) banner.style.display = 'block';
      // Disable any ID generation buttons
      document.querySelectorAll('.btn-generate, #btn-generate-id').forEach(btn => {
        btn.disabled = true;
        btn.title = 'Fee payment required';
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
      });
    }

    // Privacy shield - blur sensitive data until email verified ONLY after 3 logins
    const userEmail = currentStudent ? `${currentStudent.jamb_no}@ebsu.edu.ng` : '';
    const loginKey = `ebsu_login_count_${userEmail}`;
    const loginCount = parseInt(localStorage.getItem(loginKey) || '1', 10);

    if (currentStudent && !currentStudent.is_email_verified && loginCount > 3) {
      document.querySelectorAll('.student-name, .student-photo, .student-dept, .student-detail').forEach(el => {
        el.classList.add('privacy-blurred');
      });
      showToast('Link your Google account to unlock full profile access', false);
    } else if (currentStudent && !currentStudent.is_email_verified && loginCount <= 3) {
      showToast(`Login ${loginCount}/3: Free access active. Link your Google account before login 4 to avoid access restrictions.`, false);
    }

    renderLiveCard();
    playSnap();
    loadActivityLog();
    // Refresh QR every 30 seconds
    if (qrTimer) clearInterval(qrTimer);
    qrTimer = setInterval(() => {
      renderLiveCard();
      playSnap();
      triggerHaptic(5);
    }, 30000);

  } catch (err) {
    console.error(err);
  }
}

async function loadActivityLog() {
  try {
    const { data, error } = await ebsuSupabase
      .from('activity_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    const feed = document.getElementById('activity-feed');
    if (data && data.length > 0) {
      feed.innerHTML = data.map(log => `
        <div class="activity-item">
          <strong>${log.action}</strong>
          <div>${log.location || 'Campus'}</div>
          <div class="activity-time">${new Date(log.timestamp).toLocaleString()}</div>
        </div>
      `).join('');
    } else {
      feed.innerHTML = '<p style="color:#aaa; text-align:center; margin-top: 20px;">No recent activity</p>';
    }
  } catch (err) {
    console.error('Error loading activity:', err);
  }
}

function renderLiveCard() {
  if (!currentStudent) return;
  const container = document.getElementById('portal-card-container');
  container.innerHTML = '';
  
  const cvs = document.createElement('canvas');
  container.appendChild(cvs);

  // Re-generate the QR Token (EBSU1:uuid:sig:timestamp)
  // We append the current timestamp to make it a rotating token.
  // The verifier logic would need to allow this format.
  const timeSlice = Math.floor(Date.now() / 30000);
  const liveQr = `EBSU1:${currentStudent.id}:${currentStudent.card_signature}:${timeSlice}`;

  const renderData = {
    ...currentStudent,
    name: currentStudent.name,
    fullName: currentStudent.name,
    matric: currentStudent.matric || currentStudent.school_reg_no || currentStudent.jamb_no,
    faculty: currentStudent.faculty,
    department: currentStudent.dept || currentStudent.department,
    level: currentStudent.level,
    session: currentStudent.session,
    blood: currentStudent.blood || currentStudent.blood_group,
    genotype: currentStudent.genotype,
    photo: currentStudent.photo_url,
    sig: currentStudent.sig_url || currentStudent.signature_url,
    qrString: liveQr
  };

  const template = (typeof CardTemplate !== 'undefined' && CardTemplate.get)
    ? CardTemplate.get()
    : null;

  drawCard(cvs, template, renderData, 0.48);
}

document.getElementById('btn-report-lost').addEventListener('click', async () => {
  triggerHaptic([50, 50, 50]);
  if (!confirm("Are you sure? This will instantly revoke your current ID card. You will need to pay a ₦2,000 replacement fee.")) return;
  
  try {
    const { error } = await ebsuSupabase
      .from('students')
      .update({ status: 'revoked' })
      .eq('id', currentStudent.id);
    
    if (error) throw error;
    showToast('Card successfully revoked. It can no longer be scanned at the gate.', true);
    currentStudent.status = 'revoked';
    renderLiveCard();
    
    // Show Monetization UI (Law 6)
    document.getElementById('btn-report-lost').style.display = 'none';
    document.getElementById('paystack-mock').style.display = 'block';
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById('btn-pay-now').addEventListener('click', () => {
  triggerHaptic(15);
  const btn = document.getElementById('btn-pay-now');
  btn.textContent = 'Processing Payment via Paystack...';
  setTimeout(() => {
    btn.textContent = 'Payment Successful! See Admin for pickup.';
    btn.style.background = '#155724';
    btn.disabled = true;
    triggerHaptic([15, 30, 15]);
    playSwoosh();
  }, 2000);
});

// ── FACIAL RECOGNITION (face-api.js - On-Demand Lazy Loaded) ──────

let modelsLoaded = false;
let modelsLoading = false;

async function ensureFaceApiLoaded() {
  if (typeof faceapi !== 'undefined') return true;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Failed to load Face Recognition library. Check your internet connection.'));
    document.head.appendChild(script);
  });
}

async function loadFaceModels(statusCallback) {
  if (modelsLoaded) return true;
  if (modelsLoading) {
    while (modelsLoading) {
      await new Promise(r => setTimeout(r, 200));
    }
    return modelsLoaded;
  }
  modelsLoading = true;
  if (statusCallback) statusCallback('Downloading AI verification models (first time only)...');
  const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
  try {
    await ensureFaceApiLoaded();
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    modelsLoaded = true;
    modelsLoading = false;
    return true;
  } catch (err) {
    modelsLoading = false;
    console.error('Error loading face models', err);
    throw err;
  }
}

async function getFaceDescriptor(imgSrc) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = imgSrc;
  await new Promise(r => img.onload = r);
  const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
  return detection ? detection.descriptor : null;
}

document.getElementById('photo-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!modelsLoaded) {
    showStatus('photo-status', 'Initializing AI Facial Recognition models on demand...', false);
    try {
      await loadFaceModels(msg => showStatus('photo-status', msg, false));
    } catch (err) {
      showStatus('photo-status', 'Failed to load AI models: ' + err.message, true);
      return;
    }
  }

  showStatus('photo-status', 'Running AI Facial Recognition analysis...', false);

  try {
    // 1. Read new photo
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const newPhotoSrc = ev.target.result;

      // 2. Compute face descriptor for official photo
      if (!currentStudent.photo_url) {
        throw new Error("No official photo on record to compare against. Visit Admin.");
      }
      const officialDesc = await getFaceDescriptor(currentStudent.photo_url);
      if (!officialDesc) throw new Error("Could not detect a face in your official portal photo.");

      // 3. Compute face descriptor for new photo
      const newDesc = await getFaceDescriptor(newPhotoSrc);
      if (!newDesc) throw new Error("Could not detect a clear face in your uploaded photo.");

      // 4. Compare
      const distance = faceapi.euclideanDistance(officialDesc, newDesc);
      console.log('Face Match Distance:', distance);

      // distance < 0.6 is typically a match
      if (distance > 0.55) {
        throw new Error(`AI Rejected: Face does not match official records! (Score: ${distance.toFixed(2)})`);
      }

      // 5. Success! Upload to Supabase Storage
      showStatus('photo-status', 'Face matched! Uploading to secure storage...', false);
      
      const fileExt = file.name.split('.').pop();
      const filePath = `${currentStudent.id}_update.${fileExt}`;
      
      const { error: uploadErr } = await ebsuSupabase.storage
        .from('student-photos')
        .upload(filePath, file, { upsert: true });
        
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = ebsuSupabase.storage
        .from('student-photos')
        .getPublicUrl(filePath);

      // 6. Update Database Row
      const { error: dbErr } = await ebsuSupabase
        .from('students')
        .update({ photo_url: publicUrl })
        .eq('id', currentStudent.id);
      
      if (dbErr) throw dbErr;

      // Update UI
      currentStudent.photo_url = publicUrl;
      renderLiveCard();
      showStatus('photo-status', 'Photo successfully updated and verified by AI!', false);
    };
    reader.readAsDataURL(file);

  } catch (err) {
    showStatus('photo-status', err.message, true);
  }
});

// Init
checkSession();
