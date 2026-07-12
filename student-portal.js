/**
 * student-portal.js
 */

// Initialize Supabase Client
const ebsuSupabase = supabase.createClient(EBSU_CONFIG.SUPABASE_URL, EBSU_CONFIG.SUPABASE_ANON_KEY);
let currentStudent = null;
let activeEmail = null;
let qrTimer = null;

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
    reqBtn.textContent = 'Send Login Code';
    reqBtn.disabled = false;
  }
});

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

// ── SESSION & DASHBOARD ────────────────────────────────────────

async function checkSession() {
  const { data: { session } } = await ebsuSupabase.auth.getSession();
  if (session) {
    authSec.className = 'auth-section';
    dashSec.className = 'dashboard-section active-section';
    loadDashboard();
    loadFaceModels(); // Load AI weights in background
  }
}

async function loadDashboard() {
  try {
    const { data: student, error } = await ebsuSupabase
      .from('students')
      .select('*')
      .single(); // RLS ensures this only returns THEIR record

    if (error || !student) {
      showToast('Error loading your student profile.', true);
      return;
    }
    
    currentStudent = student;
    document.getElementById('dash-name').textContent = student.name.split(' ')[0];
    
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
    photo: currentStudent.photo_url,
    sig: currentStudent.sig_url,
    qrString: liveQr
  };

  // Temporarily set layout properties used by canvas.js
  window.AppState = window.AppState || {
    get: (k) => k === 'colors' ? {
      headerBg: '#1558c0', headerText: '#ffffff', bodyBg: '#ffffff', borderColor: '#6ab0e0',
      titleColor: '#cc0000', matricLabel: '#1a3a9a', labelColor: '#000000', valueColor: '#222222', photoBackground: '#aa1111'
    } : k === 'schoolName' ? 'Ebonyi State University' : ''
  };

  drawCard(cvs, renderData, 1.0); // Draw at full scale, CSS will max-width it
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

// ── FACIAL RECOGNITION (face-api.js) ──────────────────────────

let modelsLoaded = false;
async function loadFaceModels() {
  if (modelsLoaded) return;
  const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
  try {
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    modelsLoaded = true;
    console.log('Face models loaded!');
  } catch (err) {
    console.error('Error loading face models', err);
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
    showStatus('photo-status', 'Still loading AI models, please wait a moment...', true);
    return;
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
