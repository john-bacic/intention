// Fixed speech recognition implementation
// Copy this into your browser console to test

// First, stop any existing recognition
if (window.recognition) {
  try {
    window.recognition.stop();
  } catch(e) {
    console.log("Error stopping existing recognition:", e);
  }
}

// Create a new recognition instance with proper settings
window.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
window.recognition.continuous = false; // Set to false and restart after each segment
window.recognition.interimResults = true; // Get live updates
window.recognition.maxAlternatives = 1;
window.recognition.lang = 'en-US';

// Handle results - update for both interim and final
window.recognition.onresult = (event) => {
  const last = event.results.length - 1;
  const result = event.results[last];
  const transcript = result[0].transcript.trim();
  const isFinal = result.isFinal;
  
  console.log(`Speech: "${transcript}" (${isFinal ? 'final' : 'interim'})`);
  
  // Always update the display
  const transcriptEl = document.getElementById('speech-transcript');
  if (transcriptEl) {
    transcriptEl.textContent = 'Heard: "' + transcript + '"';
    
    // Only process final results
    if (isFinal) {
      transcriptEl.classList.add('speech-update');
      
      // Process the transcript
      processTranscript(transcript.toLowerCase());
      
      setTimeout(() => {
        transcriptEl.classList.remove('speech-update');
      }, 1000);
    }
  }
};

// Restart when it ends
window.recognition.onend = () => {
  console.log("Recognition ended, restarting");
  window.isRecognitionActive = false;
  
  if (window.isVoiceEnabled) {
    setTimeout(() => {
      window.recognition.start();
      window.isRecognitionActive = true;
    }, 50);
  }
};

// Start listening
window.recognition.start();
window.isRecognitionActive = true;

// Update display
const transcriptEl = document.getElementById('speech-transcript');
if (transcriptEl) {
  transcriptEl.textContent = 'Listening...';
}

console.log("Fixed speech recognition started");
