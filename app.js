import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBw9RPgaP8lpc9B8NcW202Mj3CK9kAX2Iw",
  authDomain: "gdlpt-5dd88.firebaseapp.com",
  projectId: "gdlpt-5dd88",
  storageBucket: "gdlpt-5dd88.firebasestorage.app",
  messagingSenderId: "487137300359",
  appId: "1:487137300359:web:59fce5e66a66e247f7cd22",
  measurementId: "G-2WV37JVBNW"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let activeLevels = [];
let selectedLevelId = null;
let editingRunIndex = null;
let isSegmentMode = false;

// Elements
const levelsGrid = document.getElementById("levels-grid");
const levelModal = document.getElementById("level-modal");
const runModal = document.getElementById("run-modal");
const authModal = document.getElementById("auth-modal");
const userDisplay = document.getElementById("user-display");
const authBtn = document.getElementById("auth-btn");
const runModalTitle = document.getElementById("run-modal-title");

// Modals Setup
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

function getBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// Add Level Form
document.getElementById("level-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const imageUrlInput = document.getElementById("level-image-url").value;
  const imageFileInput = document.getElementById("level-image-file").files[0];
  let finalImage = "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600";

  if (imageFileInput) {
    finalImage = await getBase64(imageFileInput);
  } else if (imageUrlInput) {
    finalImage = imageUrlInput;
  }

  const initialBest = parseInt(document.getElementById("level-best").value) || 0;

  const newLevel = {
    name: document.getElementById("level-name").value,
    creator: document.getElementById("level-creator").value || "Unknown",
    image: finalImage,
    initialBest: initialBest, // Keep track of starting best
    best: initialBest,
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

// Add / Edit Run Form
document.getElementById("run-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const start = isSegmentMode ? parseInt(document.getElementById("run-start").value) || 0 : 0;
  const end = parseInt(document.getElementById("run-end").value) || 0;
  const note = document.getElementById("run-note").value;

  const targetLevel = activeLevels.find(l => l.id === selectedLevelId);
  if (!targetLevel) return;

  let updatedRuns = [...(targetLevel.runs || [])];

  if (editingRunIndex !== null) {
    updatedRuns[editingRunIndex] = {
      ...updatedRuns[editingRunIndex],
      start,
      end,
      note
    };
  } else {
    updatedRuns.push({
      start,
      end,
      note,
      date: new Date().toLocaleDateString()
    });
  }

  // Properly compute best: check initialBest and all remaining runs
  let highestBest = targetLevel.initialBest !== undefined ? targetLevel.initialBest : 0;
  updatedRuns.forEach(r => {
    if (r.end > highestBest) highestBest = r.end;
  });

  if (currentUser) {
    const levelRef = doc(db, "levels", selectedLevelId);
    await updateDoc(levelRef, {
      runs: updatedRuns,
      best: highestBest
    });
  } else {
    targetLevel.runs = updatedRuns;
    targetLevel.best = highestBest;
    saveLocalLevels(activeLevels);
    renderLevels(activeLevels);
  }

  runModal.classList.add("hidden");
  e.target.reset();
  editingRunIndex = null;
});

// Delete Run Handler (Fixes bug where 100% stays forever)
async function deleteRun(levelId, runIndex) {
  const targetLevel = activeLevels.find(l => l.id === levelId);
  if (!targetLevel) return;

  let updatedRuns = [...(targetLevel.runs || [])];
  updatedRuns.splice(runIndex, 1);

  // Recalculate true best from initialBest + remaining runs
  let highestBest = targetLevel.initialBest !== undefined ? targetLevel.initialBest : 0;
  updatedRuns.forEach(r => {
    if (r.end > highestBest) highestBest = r.end;
  });

  if (currentUser) {
    const levelRef = doc(db, "levels", levelId);
    await updateDoc(levelRef, {
      runs: updatedRuns,
      best: highestBest
    });
  } else {
    targetLevel.runs = updatedRuns;
    targetLevel.best = highestBest;
    saveLocalLevels(activeLevels);
    renderLevels(activeLevels);
  }
}

// Delete Whole Level Handler
async function deleteLevel(levelId) {
  if (!confirm("Are you sure you want to delete this level and all its runs?")) return;

  if (currentUser) {
    await deleteDoc(doc(db, "levels", levelId));
  } else {
    let local = JSON.parse(localStorage.getItem("gd_levels") || "[]");
    local = local.filter(l => l.id !== levelId);
    saveLocalLevels(local);
    loadLocalLevels();
  }
}

function openEditRunModal(levelId, runIndex) {
  selectedLevelId = levelId;
  editingRunIndex = runIndex;

  const targetLevel = activeLevels.find(l => l.id === levelId);
  const run = targetLevel.runs[runIndex];

  runModalTitle.textContent = "Edit Run";
  document.getElementById("run-start").value = run.start || 0;
  document.getElementById("run-end").value = run.end || 0;
  document.getElementById("run-note").value = run.note || "";

  if (run.start > 0) {
    isSegmentMode = true;
    modeSegmentBtn.classList.add("active");
    modeFullBtn.classList.remove("active");
    startPercentGroup.classList.remove("hidden");
  } else {
    isSegmentMode = false;
    modeFullBtn.classList.add("active");
    modeSegmentBtn.classList.remove("active");
    startPercentGroup.classList.add("hidden");
  }

  runModal.classList.remove("hidden");
}

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

function saveLocalLevels(levels) {
  localStorage.setItem("gd_levels", JSON.stringify(levels));
}

function renderLevels(levels) {
  levelsGrid.innerHTML = "";
  levels.forEach(lvl => {
    const card = document.createElement("div");
    card.className = "level-card";

    const runsListContainer = document.createElement("div");
    runsListContainer.className = "runs-list";

    if (!lvl.runs || lvl.runs.length === 0) {
      runsListContainer.innerHTML = `<p style="color:#64748b;font-size:0.8rem">No runs logged yet</p>`;
    } else {
      lvl.runs.forEach((r, idx) => {
        const runItem = document.createElement("div");
        runItem.className = "run-item";
        runItem.innerHTML = `
          <div class="run-info">
            <span class="run-tag">${r.start > 0 ? `${r.start}\% -${r.end}%` : `${r.end}%`}</span>
            <span class="run-note-text">${r.note ? r.note : r.date}</span>
          </div>
          <div class="run-actions">
            <button class="btn-icon edit-run-btn" title="Edit Run">✏️</button>
            <button class="btn-icon delete-run-btn" title="Delete Run">🗑️</button>
          </div>
        `;

        runItem.querySelector(".edit-run-btn").addEventListener("click", () => openEditRunModal(lvl.id, idx));
        runItem.querySelector(".delete-run-btn").addEventListener("click", () => deleteRun(lvl.id, idx));

        runsListContainer.appendChild(runItem);
      });
    }

    card.innerHTML = `
      <div class="card-img-container">
        <img src="${lvl.image}" class="card-img" alt="${lvl.name}" />
        <div class="card-best-badge">${lvl.best}% BEST</div>
      </div>
      <div class="card-body">
        <div class="card-header-row">
          <h3 class="card-title">${lvl.name}</h3>
          <button class="btn-delete-level" title="Delete Level">🗑️ Delete Level</button>
        </div>
        <p class="card-creator">By ${lvl.creator}</p>
      </div>
    `;

    card.querySelector(".btn-delete-level").addEventListener("click", () => deleteLevel(lvl.id));

    const cardBody = card.querySelector(".card-body");
    cardBody.appendChild(runsListContainer);

    const logBtn = document.createElement("button");
    logBtn.className = "btn btn-primary log-run-btn";
    logBtn.textContent = "+ Log Run";
    logBtn.addEventListener("click", () => {
      selectedLevelId = lvl.id;
      editingRunIndex = null;
      runModalTitle.textContent = "Log Run";
      document.getElementById("run-form").reset();
      runModal.classList.remove("hidden");
    });

    cardBody.appendChild(logBtn);
    levelsGrid.appendChild(card);
  });
}
