// Import Firebase modules
import { db, rtdb } from "./firebase-config.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-firestore.js";
import { ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-database.js";

// DOM Elements
const hostCodeDisplay = document.getElementById("host-code-display");
const startShareBtn = document.getElementById("start-share");
const stopShareBtn = document.getElementById("stop-share");
const clientCodeInput = document.getElementById("client-code");
const connectBtn = document.getElementById("connect");
const remoteScreen = document.getElementById("remote-screen");
const enableControlCheckbox = document.getElementById("enable-control");
const pointer = document.getElementById("pointer");

let hostCode;
let mediaStream;
let sharingRequestRef;
let clientCodeForControl;

// Generate a unique 6-digit device code
async function generateUniqueCode() {
    while (true) {
        const code = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
        const docRef = doc(db, "sessions", code);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return code;
        }
    }
}

// Initialize the host code and listeners
async function initializeHostCode() {
    hostCode = await generateUniqueCode();
    hostCodeDisplay.innerText = `Your Host Code: ${hostCode}`;

    await setDoc(doc(db, "sessions", hostCode), { status: "available", hostCode });

    sharingRequestRef = ref(rtdb, `sessions/${hostCode}/request`);
    onValue(sharingRequestRef, (snapshot) => {
        if (snapshot.exists()) {
            handleSharingRequest(snapshot.val());
        }
    });

    listenForRemoteControl();
}

// Handle incoming sharing requests
function handleSharingRequest(clientCode) {
    const accept = confirm(`Client ${clientCode} wants to connect. Accept?`);
    const statusRef = ref(rtdb, `sessions/${hostCode}/status`);

    if (accept) {
        set(statusRef, "accepted");
        startScreenSharing();
    } else {
        set(statusRef, "rejected");
    }
}

// Start screen sharing
async function startScreenSharing() {
    try {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

        const streamRef = ref(rtdb, `sessions/${hostCode}/stream`);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const video = document.createElement("video");

        video.srcObject = mediaStream;
        video.play();

        const sendFrame = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frameData = canvas.toDataURL("image/webp");
            set(streamRef, frameData);
        };

        setInterval(sendFrame, 100);
        startShareBtn.style.display = "none";
        stopShareBtn.style.display = "block";
    } catch (error) {
        console.error("Failed to start screen sharing:", error);
    }
}

// Stop screen sharing
stopShareBtn.addEventListener("click", async () => {
    mediaStream.getTracks().forEach(track => track.stop());
    await remove(ref(rtdb, `sessions/${hostCode}/stream`));
    stopShareBtn.style.display = "none";
    startShareBtn.style.display = "block";
});

// Connect as a client
connectBtn.addEventListener("click", async () => {
    const clientCode = clientCodeInput.value.trim();
    if (!clientCode) {
        alert("Please enter a valid device code.");
        return;
    }

    const requestRef = ref(rtdb, `sessions/${clientCode}/request`);
    await set(requestRef, hostCode);

    const statusRef = ref(rtdb, `sessions/${clientCode}/status`);
    onValue(statusRef, (snapshot) => {
        if (snapshot.exists()) {
            const status = snapshot.val();
            if (status === "accepted") {
                clientCodeForControl = clientCode;
                startReceivingStream(clientCode);
                captureClientEvents();
            } else if (status === "rejected") {
                alert("Your connection request was rejected.");
            }
        }
    });
});

// Start receiving the stream
function startReceivingStream(clientCode) {
    const streamRef = ref(rtdb, `sessions/${clientCode}/stream`);
    onValue(streamRef, (snapshot) => {
        if (snapshot.exists()) {
            const frameData = snapshot.val();
            const img = new Image();
            img.src = frameData;
            remoteScreen.innerHTML = "";
            remoteScreen.appendChild(img);
        }
    });
}

// Enable/disable remote control
enableControlCheckbox.addEventListener("change", async () => {
    const allowControl = enableControlCheckbox.checked;
    await set(ref(rtdb, `sessions/${hostCode}/allowControl`), allowControl);
});

// Listen for remote control events
function listenForRemoteControl() {
    const controlRef = ref(rtdb, `sessions/${hostCode}/controlEvents`);
    onValue(controlRef, (snapshot) => {
        if (snapshot.exists() && enableControlCheckbox.checked) {
            const event = snapshot.val();
            simulateEvent(event);
        }
    });
}

// Simulate a received input event
function simulateEvent(event) {
    if (event.type === "mousemove") {
        pointer.style.left = `${event.x}px`;
        pointer.style.top = `${event.y}px`;
    } else if (event.type === "click") {
        const clickEffect = document.createElement("div");
        clickEffect.classList.add("click-effect");
        clickEffect.style.left = `${event.x}px`;
        clickEffect.style.top = `${event.y}px`;
        document.body.appendChild(clickEffect);
        setTimeout(() => clickEffect.remove(), 500);
    }
}

// Capture client events and send them to Firebase
function captureClientEvents() {
    remoteScreen.addEventListener("mousemove", (event) => {
        const rect = remoteScreen.getBoundingClientRect();
        sendControlEvent({
            type: "mousemove",
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        });
    });

    remoteScreen.addEventListener("click", (event) => {
        const rect = remoteScreen.getBoundingClientRect();
        sendControlEvent({
            type: "click",
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        });
    });
}

// Send control events to Firebase
function sendControlEvent(event) {
    if (!clientCodeForControl) return;
    const controlRef = ref(rtdb, `sessions/${clientCodeForControl}/controlEvents`);
    set(controlRef, event);
}

// Initialize the app
initializeHostCode();
