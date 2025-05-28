// FIXED SPEECH RECOGNITION - PASTE THIS INTO YOUR CONSOLE

// Function to fix the speech recognition issue
function fixSpeechRecognition() {
  // Stop any existing recognition
  if (window.recognition) {
    try {
      window.recognition.stop();
    } catch(e) {
      console.log("Error stopping existing recognition:", e);
    }
  }
  
  // Create a completely new recognition instance
  window.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  
  // IMPORTANT: Set continuous to FALSE to prevent buffering all results
  // This is key to fixing the issue where it gets stuck
  window.recognition.continuous = false;
  window.recognition.interimResults = true;
  window.recognition.maxAlternatives = 1;
  window.recognition.lang = 'en-US';
  
  // Handle recognition results
  window.recognition.onresult = (event) => {
    const last = event.results.length - 1;
    const result = event.results[last];
    const transcript = result[0].transcript.trim();
    const isFinal = result.isFinal;
    
    console.log(`Speech: "${transcript}" (${isFinal ? 'final' : 'interim'})`);
    
    // Always update the transcript display
    const transcriptEl = document.getElementById('speech-transcript');
    if (transcriptEl) {
      transcriptEl.textContent = 'Heard: "' + transcript + '"';
      
      // Only process and animate final results
      if (isFinal) {
        transcriptEl.classList.add('speech-update');
        
        // Process final transcript for command matching
        processTranscript(transcript.toLowerCase());
        
        setTimeout(() => {
          transcriptEl.classList.remove('speech-update');
        }, 1000);
      }
    }
  };
  
  // This is CRITICAL - restart recognition when it ends
  // This is how we achieve continuous listening with 'continuous: false'
  window.recognition.onend = () => {
    console.log("Recognition ended, restarting...");
    
    // Restart if voice is still enabled
    if (window.isVoiceEnabled) {
      setTimeout(() => {
        window.recognition.start();
      }, 50); // Small delay to prevent errors
    }
  };
  
  // Handle errors properly
  window.recognition.onerror = (event) => {
    console.log("Recognition error:", event.error);
    
    // Only show user meaningful errors
    if (event.error !== 'aborted' && event.error !== 'no-speech') {
      const transcriptEl = document.getElementById('speech-transcript');
      if (transcriptEl) {
        transcriptEl.textContent = 'Error: ' + event.error;
      }
    }
    
    // Restart after errors if still enabled
    if (window.isVoiceEnabled) {
      setTimeout(() => {
        window.recognition.start();
      }, 300);
    }
  };
  
  // Start listening!
  window.recognition.start();
  
  // Show initial status
  const transcriptEl = document.getElementById('speech-transcript');
  if (transcriptEl) {
    transcriptEl.textContent = 'Listening...';
  }
  
  console.log("Fixed speech recognition started!");
}

// Override the toggleVoiceRecognition function to use our fixed implementation
window.originalToggleVoiceRecognition = window.toggleVoiceRecognition;
window.toggleVoiceRecognition = function() {
  window.isVoiceEnabled = !window.isVoiceEnabled;
  
  // Update UI
  const voiceToggle = document.getElementById('voice-toggle');
  const transcriptContainer = document.getElementById('speech-transcript-container');
  
  if (voiceToggle) {
    voiceToggle.classList.toggle('active', window.isVoiceEnabled);
  }
  
  if (transcriptContainer) {
    transcriptContainer.classList.toggle('speech-active', window.isVoiceEnabled);
  }
  
  // Save preference
  localStorage.setItem('voice-enabled', window.isVoiceEnabled);
  
  if (window.isVoiceEnabled) {
    // Start our fixed speech recognition
    fixSpeechRecognition();
    
    // Also start audio detection for visualizer (keep original behavior)
    if (window.setupAudioDetection) {
      window.setupAudioDetection();
    }
  } else {
    // Stop speech recognition
    if (window.recognition) {
      try {
        window.recognition.stop();
      } catch (e) {
        console.log("Error stopping recognition:", e);
      }
    }
    
    // Clear transcript
    const transcriptEl = document.getElementById('speech-transcript');
    if (transcriptEl) {
      transcriptEl.textContent = '';
    }
  }
};

// Call the fixed implementation immediately if voice is already enabled
if (window.isVoiceEnabled) {
  fixSpeechRecognition();
  console.log("Applied fix to already running speech recognition");
}

console.log("Speech recognition fix loaded successfully");
console.log("Click the microphone button or say something to test");
