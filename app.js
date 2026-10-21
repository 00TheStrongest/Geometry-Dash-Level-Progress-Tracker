import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, query, where, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBw9RPgaP8lpc9B8NcW202Mj3CK9kAX2Iw",
  authDomain: "gdlpt-5dd88.firebaseapp.com",
  projectId: "gdlpt-5dd88",
  storageBucket: "gdlpt-5dd88.firebasestorage.app",
  messagingSenderId: "487137300359",
  appId: "1:487137300359:web:59fce5e66a66e247f7cd22",
  measurementId: "G-2WV37JVBNW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let activeLevels = [];
let selectedLevelId = null;
let isSegmentMode = false;

// UI Elements
const levelsGrid = document.getElementById("levels-grid");
const levelModal = document.getElementById("level-modal");
const runModal = document.getElementById("run-modal");
const authModal = document.getElementById("auth-modal");
const userDisplay = document.getElementById("user-display");
const authBtn = document.getElementById("auth-btn");

// Event Listeners for Modals
document.getElementById("add-level-btn").addEventListener("click", () => levelModal.classList.remove("hidden"));
document.getElementById("close-level-modal").addEventListener("click", () => levelModal.classList.add("hidden"));
document.getElementById("close-run-modal").addEventListener("click", () => runModal.classList.add("hidden"));
document.getElementById("close-auth-modal").addEventListener("click", () => authModal.classList.add("hidden"));

authBtn.addEventListener("click", () => {
  if (currentUser) {
    signOut(auth);
  } else {
    authModal.classList.remove("hidden");
  }
});

// Run Mode Toggle
const modeFullBtn = document.getElementById("mode-full-btn");
const modeSegmentBtn = document.getElementById("mode-segment-btn");
const startPercentGroup = document.getElementById("start-percent-group");

modeFullBtn.addEventListener("click", () => {
  isSegmentMode = false;
  modeFullBtn.classList.add("active");
  modeSegmentBtn.classList.remove("active");
  startPercentGroup.classList.add("hidden");
});

modeSegmentBtn.addEventListener("click", () => {
  isSegmentMode = true;
  modeSegmentBtn.classList.add("active");
  modeFullBtn.classList.remove("active");
  startPercentGroup.classList.remove("hidden");
});

// Auth Flow
document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value;
  const pass = document.getElementById("auth-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    authModal.classList.add("hidden");
  } catch (err) {
    alert("Error logging in: " + err.message);
  }
});

document.getElementById("signup-btn").addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value;
  const pass = document.getElementById("auth-password").value;
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    authModal.classList.add("hidden");
  } catch (err) {
    alert("Error signing up: " + err.message);
  }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    userDisplay.textContent = user.email;
    authBtn.textContent = "Sign Out";
    listenToLevels(user.uid);
  } else {
    userDisplay.textContent = "Guest Mode (Local)";
    authBtn.textContent = "Sign In / Sign Up";
    loadLocalLevels();
  }
});

// Level Management
document.getElementById("level-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const newLevel = {
    name: document.getElementById("level-name").value,
    creator: document.getElementById("level-creator").value || "Unknown",
    image: document.getElementById("level-image").value || "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600",
    best: parseInt(document.getElementById("level-best").value) || 0,
    runs: []
  };

  if (currentUser) {
    await addDoc(collection(db, "levels"), { ...newLevel, uid: currentUser.uid });
  } else {
    const local = JSON.parse(localStorage.getItem("gd_levels") || "[]");
    local.push({ ...newLevel, id: Date.now().toString() });
    localStorage.setItem("gd_levels", JSON.stringify(local));
    loadLocalLevels();
  }

  levelModal.classList.add("hidden");
  e.target.reset();
});

// Run Logging
document.getElementById("run-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const start = isSegmentMode ? parseInt(document.getElementById("run-start").value) || 0 : 0;
  const end = parseInt(document.getElementById("run-end").value) || 0;
  const note = document.getElementById("run-note").value;

  const runData = { start, end, note, date: new Date().toLocaleDateString() };

  if (currentUser) {
    const levelRef = doc(db, "levels", selectedLevelId);
    const targetLevel = activeLevels.find(l => l.id === selectedLevelId);
    const newBest = Math.max(targetLevel.best, end);
    await updateDoc(levelRef, {
      runs: arrayUnion(runData),
      best: newBest
    });
  } else {
    const local = JSON.parse(localStorage.getItem("gd_levels") || "[]");
    const lvl = local.find(l => l.id === selectedLevelId);
    if (lvl) {
      lvl.runs.push(runData);
      lvl.best = Math.max(lvl.best, end);
      localStorage.setItem("gd_levels", JSON.stringify(local));
      loadLocalLevels();
    }
  }

  runModal.classList.add("hidden");
  e.target.reset();
});

function listenToLevels(uid) {
  const q = query(collection(db, "levels"), where("uid", "==", uid));
  onSnapshot(q, (snapshot) => {
    activeLevels = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderLevels(activeLevels);
  });
}

function loadLocalLevels() {
  activeLevels = JSON.parse(localStorage.getItem("gd_levels") || "[]");
  renderLevels(activeLevels);
}

function renderLevels(levels) {
  levelsGrid.innerHTML = "";
  levels.forEach(lvl => {
    const card = document.createElement("div");
    card.className = "level-card";
    
    const runsListHtml = lvl.runs.map(r => `
      <div class="run-item">
        <span class="run-tag">${r.start > 0 ? `${r.start}\% -${r.end}%` : `${r.end}%`}</span>
        <span>${r.note ? r.note : r.date}</span>
      </div>
    `).reverse().join("");

    card.innerHTML = `
      <div class="card-img-container">
        <img src="${lvl.image}" class="card-img" alt="${lvl.name}" />
        <div class="card-best-badge">${lvl.best}% BEST</div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${lvl.name}</h3>
        <p class="card-creator">By ${lvl.creator}</p>
        <div class="runs-list">
          ${runsListHtml || '<p style="color:#64748b;font-size:0.8rem">No runs logged yet</p>'}
        </div>
        <button class="btn btn-primary log-run-btn" data-id="${lvl.id}">+ Log Run</button>
      </div>
    `;

    card.querySelector(".log-run-btn").addEventListener("click", () => {
      selectedLevelId = lvl.id;
      runModal.classList.remove("hidden");
    });

    levelsGrid.appendChild(card);
  });
}
