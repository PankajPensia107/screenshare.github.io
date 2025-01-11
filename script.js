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
const permissionDialog = document.getElementById("permission-dialog");
const enableControlCheckbox = document.getElementById("enable-control");
const pointer = document.getElementById('pointer');
let hostCode;
let mediaStream;
let sharingRequestRef;
var clientCodeForControl;

// Function to generate a unique device code with numbers only
async function generateUniqueCode() {
    let code;

    if(localStorage.getItem("SessionID) == undefined){
     let isUnique = false;
    while (!isUnique) {
        code = Math.floor(Math.random() * 1000000).toString().padStart(6, '0'); // Generate a 6-digit number
         localStorage.setItem("SessionID",code);
        const docRef = doc(db, "sessions", code);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            isUnique = true; // Code is unique
        }
    }else{
        code = localStorage.getItem("SessionID");
    }                
    }
    
  

    return code;
}

// Initialize the host's device code
async function initializeHostCode() {
    hostCode = await generateUniqueCode();
    hostCodeDisplay.innerText += hostCode; // Display the generated code

    // Save the host code in Firestore with an "available" status
    const hostDoc = doc(db, "sessions", hostCode);
    await setDoc(hostDoc, { status: "available", hostCode });

    // Listen for incoming sharing requests
    sharingRequestRef = ref(rtdb, `sessions/${hostCode}/request`);
    onValue(sharingRequestRef, (snapshot) => {
        if (snapshot.exists()) {
            showPermissionDialog(snapshot.val());
        }
    });

    // Start listening for remote control events
    listenForRemoteControl();
}

// Show the permission dialog
function showPermissionDialog(clientCode) {
    const myModal = new bootstrap.Modal(document.getElementById('exampleModal'));
    myModal.show();
    document.getElementById("accept-request").onclick = async () => {
        myModal.hide(); // Hide the modal when accepted
        set(ref(rtdb, `sessions/${hostCode}/status`), "accepted");
        console.log("Request accepted. Starting screen sharing...");
        // clientCodeForControl = clientCodeForPermission;
        startScreenSharing(); // Automatically start screen sharing
    };

    document.getElementById("reject-request").onclick = async () => {
        myModal.hide(); // Hide the modal when rejected
        set(ref(rtdb, `sessions/${hostCode}/status`), "rejected");
        console.log("Request rejected.");
    };
}

// Start screen sharing directly after acceptance
function startScreenSharing() {
    startShareBtn.click(); // Trigger the click event of the Start Sharing button
}

// Start screen sharing
startShareBtn.addEventListener("click", async () => {
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
        console.log("Screen sharing started successfully.");
        stopShareBtn.style.display = "block"; // Show Stop Sharing button
        startShareBtn.style.display = "none"; // Hide Start Sharing button
        connectBtn.style.display = "none";
    } catch (error) {
        console.error("Error starting screen sharing:", error);
    }
});

// Stop screen sharing
stopShareBtn.addEventListener("click", async () => {
    mediaStream.getTracks().forEach((track) => track.stop());
    await remove(ref(rtdb, `sessions/${hostCode}/stream`));
    console.log("Screen sharing stopped.");
    stopShareBtn.style.display = "none"; // Hide Stop Sharing button
    startShareBtn.style.display = "none"; // Show Start Sharing button
    connectBtn.style.display = "block";
});

// Client connects using the entered device code
connectBtn.addEventListener("click", async () => {
    const clientCode = clientCodeInput.value.trim();
    if (!clientCode) {
        alert("Please enter a valid device code.");
        return;
    }

    console.log("Requesting to connect to host with code:", clientCode);

    const requestRef = ref(rtdb, `sessions/${clientCode}/request`);
    await set(requestRef, hostCode); // Send request to host

    const statusRef = ref(rtdb, `sessions/${clientCode}/status`);
    onValue(statusRef, (snapshot) => {
        if (snapshot.exists()) {
            const status = snapshot.val();
            if (status === "accepted") {
                console.log("Sharing request accepted.");
                clientCodeForControl = clientCode;
                startReceivingStream(clientCode);
                captureClientEvents();
            } else if (status === "rejected") {
                console.log("Sharing request rejected.");
                const myModal = new bootstrap.Modal(document.getElementById('exampleModal1'));
                myModal.show();
            }
        }
    });
});

// Start receiving stream
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
    console.log(`Remote control ${allowControl ? "enabled" : "disabled"}`);
    await set(ref(rtdb, `sessions/${hostCode}/allowControl`), allowControl);
});

// Listen for remote control events from the client
function listenForRemoteControl() {
    const controlRef = ref(rtdb, `sessions/${hostCode}/controlEvents`);
    onValue(controlRef, (snapshot) => {
        if (snapshot.exists() && enableControlCheckbox.checked) {
            const event = snapshot.val();
            simulateEvent(event); // Simulate the received event on the host's PC
        }
    });
}

// Simulate received input events on the host's PC
function simulateEvent(event) {
    if (event.type === "mousemove") {
        pointer.style.left = `${event.x}px`;
        pointer.style.top = `${event.y}px`;
    } else if (event.type === "click") {
        const clickEffect = document.createElement('div');
        clickEffect.className = 'click-effect';
        clickEffect.style.left = `${event.x - 10}px`;
        clickEffect.style.top = `${event.y - 10}px`;
        document.body.appendChild(clickEffect);
        setTimeout(() => document.body.removeChild(clickEffect), 500);
    }
}

// Capture client-side events and send them to Firebase
function captureClientEvents() {
    document.addEventListener("mousemove", (event) => {
        sendControlEvent({
            type: "mousemove",
            x: event.clientX,
            y: event.clientY,
        });
    });

    document.addEventListener("click", (event) => {
        sendControlEvent({
            type: "click",
            x: event.clientX,
            y: event.clientY,
        });
    });
}

remoteScreen.addEventListener("mousemove", (event) => {
    const rect = remoteScreen.getBoundingClientRect(); // Get position of the remote screen on the page
    sendControlEvent({
        type: "mousemove",
        x: event.clientX - rect.left, // Adjust x by subtracting the screen's left position
        y: event.clientY - rect.top,  // Adjust y by subtracting the screen's top position
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

// Send captured events to Firebase
function sendControlEvent(event) {
    console.log("client Code:- " + clientCodeForControl);
    const controlRef = ref(rtdb, 'sessions/' + clientCodeForControl + '/controlEvents');
    set(controlRef, event);
}

// Initialize the app
initializeHostCode();
