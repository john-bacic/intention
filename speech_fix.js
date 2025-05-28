// This fix ensures speech recognition properly restarts after each utterance
function fixVoiceRecognition() {
    // Find and override the speech recognition in the existing code
    if (recognition) {
        // First stop any current recognition
        try {
            recognition.stop();
        } catch (e) {
            console.log("Error stopping recognition:", e);
        }
        
        // Clear all event handlers
        recognition.onresult = null;
        recognition.onend = null;
        recognition.onerror = null;
        
        // Recreate the recognition object
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = false; // This is key for reliable restarts
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.lang = 'en-US';
        
        // Set up result handler
        recognition.onresult = function(event) {
            const last = event.results.length - 1;
            const transcript = event.results[last][0].transcript.trim().toLowerCase();
            
            console.log("Speech recognition heard:", transcript);
            
            // Update transcript display
            const transcriptEl = document.getElementById('speech-transcript');
            if (transcriptEl) {
                transcriptEl.textContent = 'Heard: "' + transcript + '"';
                transcriptEl.classList.add('speech-update');
                
                // Remove the animation class after it completes
                setTimeout(() => {
                    transcriptEl.classList.remove('speech-update');
                }, 1000);
            }
            
            // Process the transcript
            processTranscript(transcript);
        };
        
        // Critical: ensure recognition restarts after each end
        recognition.onend = function() {
            console.log("Recognition ended, restarting...");
            isRecognitionActive = false;
            
            if (isVoiceEnabled) {
                // Restart with a short delay
                setTimeout(function() {
                    if (isVoiceEnabled) {
                        try {
                            recognition.start();
                            isRecognitionActive = true;
                            console.log("Recognition restarted successfully");
                        } catch (e) {
                            console.error("Error restarting recognition:", e);
                            // If error, try complete recreation
                            setTimeout(fixVoiceRecognition, 500);
                        }
                    }
                }, 300);
            }
        };
        
        // Error handler with automatic restart
        recognition.onerror = function(event) {
            console.log("Recognition error:", event.error);
            isRecognitionActive = false;
            
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                const transcriptEl = document.getElementById('speech-transcript');
                if (transcriptEl) {
                    transcriptEl.textContent = 'Error: ' + event.error;
                }
            }
            
            if (isVoiceEnabled) {
                setTimeout(function() {
                    if (isVoiceEnabled) {
                        try {
                            recognition.start();
                            isRecognitionActive = true;
                        } catch (e) {
                            // If restart fails, try a complete reset
                            setTimeout(fixVoiceRecognition, 500);
                        }
                    }
                }, 500);
            }
        };
        
        // Start recognition immediately
        try {
            recognition.start();
            isRecognitionActive = true;
            console.log("Speech recognition fixed and started");
            
            // Update UI to show we're listening
            const transcriptEl = document.getElementById('speech-transcript');
            if (transcriptEl) {
                transcriptEl.textContent = 'Listening for commands...';
            }
        } catch (e) {
            console.error("Error starting fixed recognition:", e);
        }
        
        return true;
    } else {
        console.error("No recognition object found to fix");
        return false;
    }
}

// Add function to toggle button click
document.addEventListener('DOMContentLoaded', function() {
    const voiceToggle = document.getElementById('voice-toggle');
    if (voiceToggle) {
        // Add an extra click handler that applies our fix
        voiceToggle.addEventListener('click', function() {
            // Give the original handler time to run first
            setTimeout(function() {
                if (isVoiceEnabled) {
                    console.log("Applying voice recognition fix...");
                    fixVoiceRecognition();
                }
            }, 500);
        });
    }
});
