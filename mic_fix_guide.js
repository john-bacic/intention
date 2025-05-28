/**
 * MICROPHONE ACCESS TROUBLESHOOTING GUIDE
 * 
 * This file contains sample code and instructions to fix the "Mic denied" error
 * in your 100 Times Challenge application.
 */

/**
 * COMMON CAUSES OF MIC DENIED ERRORS:
 * 
 * 1. Protocol Issues: Most browsers require HTTPS or localhost for mic access
 * 2. User Permissions: User may have denied mic access in browser settings
 * 3. Context Issues: Mic access must be requested in response to user gesture
 * 4. Competing Requests: Multiple systems requesting mic access
 * 5. Hardware Issues: Mic may be in use by another application
 */

/**
 * SOLUTION 1: Shared Microphone Stream
 * 
 * Add this function to your script.js to create a reusable microphone stream:
 */

// Global variables for shared microphone access
let sharedMicrophoneStream = null;

// Request microphone access with proper error handling
async function requestMicrophoneAccess(reason = "audio recording") {
    console.log(`Requesting microphone access for: ${reason}`);
    
    // If we already have a valid stream, return it
    if (sharedMicrophoneStream && sharedMicrophoneStream.active) {
        console.log("Using existing microphone stream");
        return sharedMicrophoneStream;
    }
    
    try {
        // Request with optimal audio constraints
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        // Store the stream for reuse
        sharedMicrophoneStream = stream;
        
        // Log success with stream details
        console.log("Microphone access granted:", 
                    stream.getAudioTracks().length + " audio tracks",
                    "Track settings:", stream.getAudioTracks()[0].getSettings());
        
        return stream;
    } catch (error) {
        // Detailed error handling based on error type
        console.error("Microphone access error:", error);
        
        // Show error in transcript
        const transcriptEl = document.getElementById('speech-transcript');
        if (transcriptEl) {
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                transcriptEl.textContent = 'Microphone access denied. Please check your browser permissions.';
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                transcriptEl.textContent = 'No microphone found. Please connect a microphone.';
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                transcriptEl.textContent = 'Microphone is being used by another application.';
            } else {
                transcriptEl.textContent = `Microphone error: ${error.message}`;
            }
        }
        
        // Log helpful debugging info
        console.log("TROUBLESHOOTING HELP:");
        console.log("1. Make sure you're on HTTPS or localhost (current protocol:", window.location.protocol + ")");
        console.log("2. Check browser settings for microphone permissions");
        console.log("3. Running on localhost?", window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        console.log("4. Error name:", error.name, "Message:", error.message);
        
        // Rethrow the error so the caller can handle it
        throw error;
    }
}

/**
 * SOLUTION 2: Modify startRecording function
 * 
 * Replace your startRecording function with this improved version:
 */

async function startRecording() {
    try {
        if (isRecording) {
            console.log("Already recording, stopping previous session");
            stopRecording();
        }
        
        console.log("Starting audio recording for OpenAI processing");
        
        try {
            // Use shared microphone access
            const stream = await requestMicrophoneAccess("OpenAI speech recognition");
            
            // Find the right MIME type for audio recording
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
                ? 'audio/webm' 
                : 'audio/mp4';
            
            // Create media recorder
            mediaRecorder = new MediaRecorder(stream, { mimeType });
            audioChunks = [];
            isRecording = true;
            
            // Add recording active indicator
            const voiceToggle = document.getElementById('voice-toggle');
            if (voiceToggle) {
                voiceToggle.classList.add('recording-active');
            }
            
            // Event listener for when data is available
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            // Event listener for when recording stops
            mediaRecorder.onstop = () => {
                processRecording();
            };
            
            // Start recording
            mediaRecorder.start();
            console.log("Recording started with MIME type:", mediaRecorder.mimeType);
            
            // Set up automatic processing every few seconds
            setTimeout(() => {
                if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
                    // Stop current recording to process it
                    mediaRecorder.stop();
                    
                    // If still enabled, start a new recording session after processing
                    if (isVoiceEnabled) {
                        setTimeout(() => {
                            if (isVoiceEnabled && !isRecording) {
                                startRecording();
                            }
                        }, 500);
                    }
                }
            }, RECORDING_INTERVAL);
            
            return true;
        } catch (micError) {
            console.error("Microphone error during recording:", micError);
            
            // Remove recording indicator
            const voiceToggle = document.getElementById('voice-toggle');
            if (voiceToggle) {
                voiceToggle.classList.remove('recording-active');
            }
            
            // Fall back to Web Speech API
            console.log("Falling back to Web Speech API due to microphone error");
            initVoiceRecognition();
            if (recognition && !isRecognitionActive) {
                try {
                    recognition.start();
                    isRecognitionActive = true;
                } catch (e) {
                    console.error("Error starting Web Speech API:", e);
                }
            }
            
            isRecording = false;
            return false;
        }
    } catch (error) {
        console.error("Error starting recording:", error);
        isRecording = false;
        return false;
    }
}

/**
 * SOLUTION 3: Run on HTTPS or localhost
 * 
 * The easiest way to ensure microphone access is to run your app with:
 * 
 * 1. A local development server (localhost)
 * 2. An HTTPS-enabled server
 * 
 * To run with a local dev server:
 * - Use tools like http-server with the -S flag for HTTPS: npx http-server -S -C cert.pem
 * - Or use ngrok to create a secure tunnel: ngrok http 8000
 */

/**
 * SOLUTION 4: Browser Troubleshooting Tips
 * 
 * 1. Check your browser's permission settings:
 *    - Chrome: chrome://settings/content/microphone
 *    - Firefox: about:preferences#privacy (Permissions section)
 *    - Safari: Preferences > Websites > Microphone
 * 
 * 2. Check the URL bar for permission indicators:
 *    - Most browsers show a mic icon in the address bar that may be blocked
 * 
 * 3. Add code to detect permission state:
 */

// Check if we already have microphone permission
async function checkMicrophonePermission() {
    try {
        // Query the permission state directly
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        console.log("Microphone permission state:", permissionStatus.state);
        
        switch(permissionStatus.state) {
            case 'granted':
                console.log("Microphone permission already granted");
                return true;
            case 'denied':
                console.log("Microphone permission explicitly denied");
                return false;
            case 'prompt':
                console.log("Microphone permission will prompt the user");
                return null; // User will be prompted
            default:
                console.log("Unknown permission state:", permissionStatus.state);
                return null;
        }
    } catch (error) {
        console.error("Error checking microphone permission:", error);
        return null; // Can't determine permission state
    }
}

/**
 * SOLUTION 5: Ensure User Gesture
 * 
 * Make sure microphone access is requested in response to a user gesture
 * like a button click. Add a click event listener and request mic access inside it.
 */

// Example:
document.getElementById('voice-toggle').addEventListener('click', async () => {
    try {
        const stream = await requestMicrophoneAccess("button click");
        console.log("Successfully got mic from click gesture");
        // Now you can use the stream...
    } catch (error) {
        console.error("Error getting mic from click:", error);
    }
});

/**
 * IMPLEMENTATION STEPS:
 * 
 * 1. Add the shared microphone access function to script.js
 * 2. Update your startRecording function with the improved version
 * 3. Add the permission checking function to help with debugging
 * 4. Ensure mic access is requested on a user gesture (like the voice toggle click)
 * 5. Run the app on localhost or with HTTPS
 */
