import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// Authorized developer account email.
// Never put a password directly in client-side JavaScript.
const DEV_MODE_EMAILS = ["liamhowley42@gmail.com"];
const DEV_LOG_COLLECTION = "dev_mode_logs";

let currentUser = null;
let activeLevels = [];
let selectedLevelId = null;
let editingRunIndex = null;
let isSegmentMode = false;

let levelsUnsubscribe = null;
let devLogsUnsubscribe = null;
let devModeActive = false;
let devSessionStartedAt = null;
let devSessionLogId = null;

let devModeButton = null;
let devModePanel = null;

// UI Elements
const levelsGrid = document.getElementById("levels-grid");
const levelModal = document.getElementById("level-modal");
const runModal = document.getElementById("run-modal");
const authModal = document.getElementById("auth-modal");
const ideaModal = document.getElementById("idea-modal");
const bugModal = document.getElementById("bug-modal");

const userDisplay = document.getElementById("user-display");
const authBtn = document.getElementById("auth-btn");
const runModalTitle = document.getElementById("run-modal-title");

// --------------------------------------------------
// DEV MODE
// --------------------------------------------------

function setupDevModeUI() {
  if (devModeButton || !authBtn) return;

  devModeButton = document.createElement("button");
  devModeButton.id = "dev-mode-btn";
  devModeButton.className = authBtn.className || "btn";
  devModeButton.textContent = "Dev Mode";
  devModeButton.hidden = true;
  devModeButton.style.marginLeft = "0.5rem";

  authBtn.insertAdjacentElement("afterend", devModeButton);

  devModeButton.addEventListener("click", () => {
    if (devModeActive) {
      exitDevMode();
    } else {
      enterDevMode();
    }
  });

  devModePanel = document.createElement("section");
  devModePanel.id = "dev-mode-panel";
  devModePanel.hidden = true;
  devModePanel.setAttribute("aria-label", "Dev Mode activity log");

  devModePanel.style.cssText = `
    max-width: 1100px;
    margin: 1rem auto;
    padding: 1rem;
    border: 1px solid #334155;
    border-radius: 12px;
    background: #0f172a;
    color: #e2e8f0;
  `;

  devModePanel.innerHTML = `
    <div style="
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:1rem;
      flex-wrap:wrap;
    ">
      <div>
        <h2 style="margin:0 0 .25rem;">
          Dev Mode Activity Log
        </h2>
        <p style="margin:0;color:#94a3b8;font-size:.9rem;">
          Records Dev Mode sessions for this project.
        </p>
      </div>
      <button type="button" id="dev-mode-exit-btn" class="btn">
        Exit Dev Mode
      </button>
    </div>

    <p id="dev-mode-log-status" role="status" style="color:#94a3b8;">
      Loading activity…
    </p>

    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;text-align:left;">
        <thead>
          <tr>
            <th style="padding:.65rem;border-bottom:1px solid #334155;">Event</th>
            <th style="padding:.65rem;border-bottom:1px solid #334155;">Account</th>
            <th style="padding:.65rem;border-bottom:1px solid #334155;">Time</th>
            <th style="padding:.65rem;border-bottom:1px solid #334155;">Session</th>
          </tr>
        </thead>
        <tbody id="dev-mode-log-rows"></tbody>
      </table>
    </div>
  `;

  const header = document.querySelector("header");

  if (header && header.parentNode) {
    header.insertAdjacentElement("afterend", devModePanel);
  } else {
    document.body.prepend(devModePanel);
  }

  document
    .getElementById("dev-mode-exit-btn")
    .addEventListener("click", exitDevMode);
}

function isAuthorizedDev(user = currentUser) {
  return Boolean(
    user &&
    DEV_MODE_EMAILS.some(email =>
      email !== "YOUR_ADMIN_EMAIL_HERE" &&
      email.toLowerCase() === (user.email || "").toLowerCase()
    )
  );
}

function updateDevModeAvailability() {
  setupDevModeUI();

  if (!devModeButton) return;

  devModeButton.hidden = !isAuthorizedDev();

  if (!isAuthorizedDev() && devModeActive) {
    closeDevModePanel();
  }
}

async function enterDevMode() {
  if (!isAuthorizedDev() || devModeActive) return;

  devModeActive = true;
  devSessionStartedAt = Date.now();
  devSessionLogId = null;

  devModePanel.hidden = false;
  devModeButton.textContent = "Exit Dev Mode";

  document.getElementById("dev-mode-log-status").textContent =
    "Loading activity…";

  try {
    const logRef = await addDoc(
      collection(db, DEV_LOG_COLLECTION),
      {
        event: "entered",
        uid: currentUser.uid,
        email: currentUser.email || "Unknown account",
        sessionStartedAt: serverTimestamp(),
        clientTime: new Date().toISOString(),
        userAgent: navigator.userAgent,
        platform: navigator.platform || "Unknown"
      }
    );

    devSessionLogId = logRef.id;
    listenToDevLogs();
  } catch (error) {
    console.error("Could not write Dev Mode activity log:", error);

    document.getElementById("dev-mode-log-status").textContent =
      "Could not load the activity log. Check Firestore rules for dev_mode_logs.";
  }
}

async function exitDevMode() {
  if (!devModeActive) return;

  const durationMs = devSessionStartedAt
    ? Date.now() - devSessionStartedAt
    : null;

  try {
    if (isAuthorizedDev() && currentUser) {
      await addDoc(
        collection(db, DEV_LOG_COLLECTION),
        {
          event: "exited",
          uid: currentUser.uid,
          email: currentUser.email || "Unknown account",
          clientTime: new Date().toISOString(),
          durationSeconds:
            durationMs === null
              ? null
              : Math.round(durationMs / 1000),
          relatedSessionId: devSessionLogId
        }
      );
    }
  } catch (error) {
    console.error("Could not write Dev Mode exit log:", error);
  }

  closeDevModePanel();
}

function closeDevModePanel() {
  devModeActive = false;
  devSessionStartedAt = null;
  devSessionLogId = null;

  if (devLogsUnsubscribe) {
    devLogsUnsubscribe();
    devLogsUnsubscribe = null;
  }

  if (devModePanel) {
    devModePanel.hidden = true;
  }

  if (devModeButton) {
    devModeButton.textContent = "Dev Mode";
  }
}

function listenToDevLogs() {
  if (!devModeActive || !isAuthorizedDev()) return;

  if (devLogsUnsubscribe) {
    devLogsUnsubscribe();
  }

  const logsQuery = query(
    collection(db, DEV_LOG_COLLECTION),
    orderBy("clientTime", "desc"),
    limit(100)
  );

  devLogsUnsubscribe = onSnapshot(
    logsQuery,
    snapshot => {
      if (!devModeActive || !devModePanel) return;

      const rows = document.getElementById("dev-mode-log-rows");
      const status = document.getElementById("dev-mode-log-status");

      rows.replaceChildren();

      if (snapshot.empty) {
        status.textContent = "No activity has been recorded yet.";
        return;
      }

      status.textContent =
        `Showing the latest ${snapshot.size} event(s). ` +
        "Times are shown in your browser's local time.";

      snapshot.forEach(item => {
        const data = item.data();
        const tr = document.createElement("tr");

        const values = [
          data.event === "entered"
            ? "Entered Dev Mode"
            : data.event === "exited"
              ? "Exited Dev Mode"
              : (data.event || "Activity"),

          data.email || "Unknown account",

          formatLogTime(
            data.sessionStartedAt || data.clientTime
          ),

          data.durationSeconds == null
            ? "—"
            : formatDuration(data.durationSeconds)
        ];

        values.forEach(value => {
          const td = document.createElement("td");

          td.style.cssText =
            "padding:.65rem;border-bottom:1px solid #1e293b;" +
            "vertical-align:top;";

          td.textContent = value;
          tr.appendChild(td);
        });

        rows.appendChild(tr);
      });
    },
    error => {
      console.error("Could not read Dev Mode activity log:", error);

      document.getElementById("dev-mode-log-status").textContent =
        "Access denied or activity log unavailable. Check Firestore Security Rules.";
    }
  );
}

function formatLogTime(value) {
  if (!value) return "Time unavailable";

  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : new Date(value);

  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : date.toLocaleString();
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;

  return minutes
    ? `${minutes}m ${remainingSeconds}s`
    : `${remainingSeconds}s`;
}

setupDevModeUI();

// --------------------------------------------------
// MODALS
// --------------------------------------------------

document
  .getElementById("add-level-btn")
  .addEventListener("click", () => {
    levelModal.classList.remove("hidden");
  });

document
  .getElementById("close-level-modal")
  .addEventListener("click", () => {
    levelModal.classList.add("hidden");
  });

document
  .getElementById("close-run-modal")
  .addEventListener("click", () => {
    runModal.classList.add("hidden");
  });

document
  .getElementById("close-auth-modal")
  .addEventListener("click", () => {
    authModal.classList.add("hidden");
  });

document
  .getElementById("close-idea-modal")
  .addEventListener("click", () => {
    ideaModal.classList.add("hidden");
  });

document
  .getElementById("close-bug-modal")
  .addEventListener("click", () => {
    bugModal.classList.add("hidden");
  });

// Feature Ideas & Bug Modals Trigger (Require Account)
document
  .getElementById("open-idea-btn")
  .addEventListener("click", () => {
    if (!currentUser) {
      alert("Please sign in or create an account to submit update ideas!");
      authModal.classList.remove("hidden");
      return;
    }

    ideaModal.classList.remove("hidden");
  });

document
  .getElementById("open-bug-btn")
  .addEventListener("click", () => {
    if (!currentUser) {
      alert("Please sign in or create an account to report bugs!");
      authModal.classList.remove("hidden");
      return;
    }

    bugModal.classList.remove("hidden");
  });

authBtn.addEventListener("click", () => {
  if (currentUser) {
    signOut(auth);
  } else {
    authModal.classList.remove("hidden");
  }
});

// --------------------------------------------------
// RUN MODE TOGGLE
// --------------------------------------------------

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

// --------------------------------------------------
// AUTHENTICATION
// --------------------------------------------------

document
  .getElementById("login-btn")
  .addEventListener("click", async () => {
    const email = document.getElementById("auth-email").value;
    const pass = document.getElementById("auth-password").value;

    try {
      await signInWithEmailAndPassword(auth, email, pass);
      authModal.classList.add("hidden");
    } catch (err) {
      alert("Error logging in: " + err.message);
    }
  });

document
  .getElementById("signup-btn")
  .addEventListener("click", async () => {
    const email = document.getElementById("auth-email").value;
    const pass = document.getElementById("auth-password").value;

    try {
      await createUserWithEmailAndPassword(auth, email, pass);
      authModal.classList.add("hidden");
    } catch (err) {
      alert("Error signing up: " + err.message);
    }
  });

onAuthStateChanged(auth, user => {
  const previousUid = currentUser?.uid || null;
  currentUser = user;

  if (previousUid !== (user?.uid || null) && levelsUnsubscribe) {
    levelsUnsubscribe();
    levelsUnsubscribe = null;
  }

  if (!user && devModeActive) {
    closeDevModePanel();
  }

  if (user) {
    userDisplay.textContent = user.email || "Signed in";
    authBtn.textContent = "Sign Out";
    listenToLevels(user.uid);
  } else {
    userDisplay.textContent = "Guest Mode (Local)";
    authBtn.textContent = "Sign In / Sign Up";
    loadLocalLevels();
  }

  updateDevModeAvailability();
});

// --------------------------------------------------
// IMAGE HELPER
// --------------------------------------------------

function getBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.readAsDataURL(file);

    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// --------------------------------------------------
// SUBMIT FEATURE IDEA
// --------------------------------------------------

document
  .getElementById("idea-form")
  .addEventListener("submit", async e => {
    e.preventDefault();

    if (!currentUser) return;

    const title = document.getElementById("idea-title").value;
    const description =
      document.getElementById("idea-description").value;

    try {
      await addDoc(collection(db, "update_ideas"), {
        uid: currentUser.uid,
        userEmail: currentUser.email,
        title,
        description,
        createdAt: serverTimestamp()
      });

      alert("Thank you! Your feature idea has been submitted.");
      ideaModal.classList.add("hidden");
      e.target.reset();
    } catch (err) {
      alert("Failed to submit idea: " + err.message);
    }
  });

// --------------------------------------------------
// SUBMIT BUG REPORT
// --------------------------------------------------

document
  .getElementById("bug-form")
  .addEventListener("submit", async e => {
    e.preventDefault();

    if (!currentUser) return;

    const title = document.getElementById("bug-title").value;
    const description =
      document.getElementById("bug-description").value;

    try {
      await addDoc(collection(db, "bug_reports"), {
        uid: currentUser.uid,
        userEmail: currentUser.email,
        title,
        description,
        createdAt: serverTimestamp()
      });

      alert("Thank you! Your bug report has been submitted.");
      bugModal.classList.add("hidden");
      e.target.reset();
    } catch (err) {
      alert("Failed to submit bug report: " + err.message);
    }
  });

// --------------------------------------------------
// ADD LEVEL
// --------------------------------------------------

document
  .getElementById("level-form")
  .addEventListener("submit", async e => {
    e.preventDefault();

    const imageUrlInput =
      document.getElementById("level-image-url").value;

    const imageFileInput =
      document.getElementById("level-image-file").files[0];

    let finalImage =
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600";

    if (imageFileInput) {
      if (!imageFileInput.type.startsWith("image/")) {
        alert("Please choose an image file.");
        return;
      }

      if (imageFileInput.size > 700 * 1024) {
        alert(
          "Please choose an image smaller than 700 KB. " +
          "Large Base64 images can exceed storage limits."
        );
        return;
      }

      try {
        finalImage = await getBase64(imageFileInput);
      } catch {
        alert("Could not read that image file.");
        return;
      }
    } else if (imageUrlInput) {
      try {
        const parsedUrl = new URL(imageUrlInput);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("Unsupported URL protocol");
        }

        finalImage = parsedUrl.href;
      } catch {
        alert("Please enter a valid http or https image URL.");
        return;
      }
    }

    const initialBest =
      parseInt(document.getElementById("level-best").value) || 0;

    const newLevel = {
      name: document.getElementById("level-name").value,
      creator:
        document.getElementById("level-creator").value || "Unknown",
      image: finalImage,
      initialBest,
      best: initialBest,
      runs: []
    };

    try {
      if (currentUser) {
        await addDoc(collection(db, "levels"), {
          ...newLevel,
          uid: currentUser.uid
        });
      } else {
        const local = JSON.parse(
          localStorage.getItem("gd_levels") || "[]"
        );

        local.push({
          ...newLevel,
          id: Date.now().toString()
        });

        localStorage.setItem("gd_levels", JSON.stringify(local));
        loadLocalLevels();
      }

      levelModal.classList.add("hidden");
      e.target.reset();
    } catch (error) {
      console.error("Could not add level:", error);
      alert("Could not save the level. Check your connection and try again.");
    }
  });

// --------------------------------------------------
// ADD / EDIT RUN
// --------------------------------------------------

document
  .getElementById("run-form")
  .addEventListener("submit", async e => {
    e.preventDefault();

    const start = isSegmentMode
      ? parseInt(document.getElementById("run-start").value) || 0
      : 0;

    const end =
      parseInt(document.getElementById("run-end").value) || 0;

    const note = document.getElementById("run-note").value;

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < 0 ||
      start > 100 ||
      end > 100 ||
      (start > 0 && start >= end)
    ) {
      alert("Enter valid percentages between 0 and 100.");
      return;
    }

    const targetLevel = activeLevels.find(
      level => level.id === selectedLevelId
    );

    if (!targetLevel) return;

    const updatedRuns = [...(targetLevel.runs || [])];

    if (editingRunIndex !== null) {
      if (!updatedRuns[editingRunIndex]) {
        alert("That run could not be found. Please try again.");
        return;
      }

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

    // FIX: Only full runs starting at 0% count toward overall best.
    let highestBest =
      targetLevel.initialBest !== undefined
        ? targetLevel.initialBest
        : 0;

    updatedRuns.forEach(run => {
      const runStart = Number(run.start) || 0;
      const runEnd = Number(run.end) || 0;

      if (runStart === 0 && runEnd > highestBest) {
        highestBest = runEnd;
      }
    });

    try {
      if (currentUser) {
        await updateDoc(doc(db, "levels", selectedLevelId), {
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
    } catch (error) {
      console.error("Could not save run:", error);
      alert("Could not save the run. Please try again.");
    }
  });

// --------------------------------------------------
// DELETE RUN
// --------------------------------------------------

async function deleteRun(levelId, runIndex) {
  const targetLevel = activeLevels.find(
    level => level.id === levelId
  );

  if (!targetLevel) return;

  const updatedRuns = [...(targetLevel.runs || [])];

  if (runIndex < 0 || runIndex >= updatedRuns.length) return;

  if (!confirm("Delete this run?")) return;

  updatedRuns.splice(runIndex, 1);

  // FIX: Recalculate overall best using full runs only.
  let highestBest =
    targetLevel.initialBest !== undefined
      ? targetLevel.initialBest
      : 0;

  updatedRuns.forEach(run => {
    const runStart = Number(run.start) || 0;
    const runEnd = Number(run.end) || 0;

    if (runStart === 0 && runEnd > highestBest) {
      highestBest = runEnd;
    }
  });

  try {
    if (currentUser) {
      await updateDoc(doc(db, "levels", levelId), {
        runs: updatedRuns,
        best: highestBest
      });
    } else {
      targetLevel.runs = updatedRuns;
      targetLevel.best = highestBest;
      saveLocalLevels(activeLevels);
      renderLevels(activeLevels);
    }
  } catch (error) {
    console.error("Could not delete run:", error);
    alert("Could not delete the run. Please try again.");
  }
}

// --------------------------------------------------
// DELETE LEVEL
// --------------------------------------------------

async function deleteLevel(levelId) {
  if (
    !confirm("Are you sure you want to delete this level and all its runs?")
  ) {
    return;
  }

  try {
    if (currentUser) {
      await deleteDoc(doc(db, "levels", levelId));
    } else {
      let local = JSON.parse(
        localStorage.getItem("gd_levels") || "[]"
      );

      local = local.filter(level => level.id !== levelId);

      saveLocalLevels(local);
      loadLocalLevels();
    }
  } catch (error) {
    console.error("Could not delete level:", error);
    alert("Could not delete the level. Please try again.");
  }
}

// --------------------------------------------------
// EDIT RUN MODAL
// --------------------------------------------------

function openEditRunModal(levelId, runIndex) {
  const targetLevel = activeLevels.find(
    level => level.id === levelId
  );

  if (!targetLevel || !targetLevel.runs?.[runIndex]) {
    alert("That run could not be found.");
    return;
  }

  selectedLevelId = levelId;
  editingRunIndex = runIndex;

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

// --------------------------------------------------
// LOAD LEVELS
// --------------------------------------------------

function listenToLevels(uid) {
  if (levelsUnsubscribe) {
    levelsUnsubscribe();
  }

  const levelsQuery = query(
    collection(db, "levels"),
    where("uid", "==", uid)
  );

  levelsUnsubscribe = onSnapshot(
    levelsQuery,
    snapshot => {
      activeLevels = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderLevels(activeLevels);
    },
    error => {
      console.error("Could not load levels:", error);

      levelsGrid.textContent =
        "Could not load levels. Check your connection and Firestore permissions.";
    }
  );
}

function loadLocalLevels() {
  try {
    activeLevels = JSON.parse(
      localStorage.getItem("gd_levels") || "[]"
    );

    if (!Array.isArray(activeLevels)) {
      activeLevels = [];
    }
  } catch (error) {
    console.error("Could not read locally saved levels:", error);
    activeLevels = [];
  }

  renderLevels(activeLevels);
}

function saveLocalLevels(levels) {
  localStorage.setItem("gd_levels", JSON.stringify(levels));
}

// --------------------------------------------------
// RENDER LEVEL CARDS
// --------------------------------------------------

function renderLevels(levels) {
  levelsGrid.replaceChildren();

  levels.forEach(lvl => {
    const card = document.createElement("div");
    card.className = "level-card";

    const runsListContainer = document.createElement("div");
    runsListContainer.className = "runs-list";

    if (!lvl.runs || lvl.runs.length === 0) {
      const emptyMessage = document.createElement("p");

      emptyMessage.style.cssText =
        "color:#64748b;font-size:0.8rem";

      emptyMessage.textContent = "No runs logged yet";
      runsListContainer.appendChild(emptyMessage);
    } else {
      lvl.runs.forEach((run, idx) => {
        const runItem = document.createElement("div");
        runItem.className = "run-item";

        runItem.innerHTML = `
          <div class="run-info">
            <span class="run-tag"></span>
            <span class="run-note-text"></span>
          </div>
          <div class="run-actions">
            <button class="btn-icon edit-run-btn" title="Edit Run">✏️</button>
            <button class="btn-icon delete-run-btn" title="Delete Run">🗑️</button>
          </div>
        `;

        runItem.querySelector(".run-tag").textContent =
          run.start > 0
            ? `${run.start}% - ${run.end}%`
            : `${run.end}%`;

        runItem.querySelector(".run-note-text").textContent =
          run.note || run.date || "";

        runItem
          .querySelector(".edit-run-btn")
          .addEventListener("click", () => {
            openEditRunModal(lvl.id, idx);
          });

        runItem
          .querySelector(".delete-run-btn")
          .addEventListener("click", () => {
            deleteRun(lvl.id, idx);
          });

        runsListContainer.appendChild(runItem);
      });
    }

    card.innerHTML = `
      <div class="card-img-container">
        <img class="card-img" alt="" />
        <div class="card-best-badge"></div>
      </div>
      <div class="card-body">
        <div class="card-header-row">
          <h3 class="card-title"></h3>
          <button class="btn-delete-level" title="Delete Level">🗑️ Delete Level</button>
        </div>
        <p class="card-creator"></p>
      </div>
    `;

    const imageElement = card.querySelector(".card-img");

    const safeImage =
      typeof lvl.image === "string" &&
      /^(https?:\/\/|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(
        lvl.image
      )
        ? lvl.image
        : "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600";

    imageElement.src = safeImage;
    imageElement.alt = String(lvl.name || "Geometry Dash level");

    card.querySelector(".card-best-badge").textContent =
      `${Number(lvl.best) || 0}% BEST`;

    card.querySelector(".card-title").textContent =
      String(lvl.name || "Untitled level");

    card.querySelector(".card-creator").textContent =
      `By ${String(lvl.creator || "Unknown")}`;

    card
      .querySelector(".btn-delete-level")
      .addEventListener("click", () => {
        deleteLevel(lvl.id);
      });

    const cardBody = card.querySelector(".card-body");
    cardBody.appendChild(runsListContainer);

    const logBtn = document.createElement("button");
    logBtn.className = "btn btn-primary log-run-btn";
    logBtn.textContent = "+ Log Run";

    logBtn.addEventListener("click", () => {
      selectedLevelId = lvl.id;
      editingRunIndex = null;
      isSegmentMode = false;

      runModalTitle.textContent = "Log Run";
      document.getElementById("run-form").reset();

      modeFullBtn.classList.add("active");
      modeSegmentBtn.classList.remove("active");
      startPercentGroup.classList.add("hidden");

      runModal.classList.remove("hidden");
    });

    cardBody.appendChild(logBtn);
    levelsGrid.appendChild(card);
  });
}
