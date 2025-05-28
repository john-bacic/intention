// Latest speech recognition fix

// Create a backup of the file first
// cp script.js script.js.bak2

// Function to update the speech recognition implementation
function updateSpeechRecognition() {
  // Modify these lines in script.js
  
  const codeToFind = `recognition.onresult = (event) => {
            // Get the last result (most recent speech)
            const last = event.results.length - 1;
            const result = event.results[last];
            const transcript = result[0].transcript.trim();
            const isFinal = result.isFinal;`;
            
  const replacementCode = `recognition.onresult = (event) => {
            // Get the last result (most recent speech)
            const last = event.results.length - 1;
            const result = event.results[last];
            const transcript = result[0].transcript.trim();
            const isFinal = result.isFinal;
            
            console.log("Speech detected:", transcript, "isFinal:", isFinal);
            
            // Always update the transcript display immediately for every speech segment
            const transcriptEl = document.getElementById('speech-transcript');
            if (transcriptEl) {
                // Update for both interim and final results to show live updates
                transcriptEl.textContent = 'Heard: "' + transcript + '"';
                
                // Only add animation and process when the speech segment is finalized
                if (isFinal) {
                    transcriptEl.classList.add('speech-update');
                    
                    // Process final transcript for command matching
                    processTranscript(transcript.toLowerCase());
                    
                    // Remove animation class after effect completes
                    setTimeout(() => {
                        transcriptEl.classList.remove('speech-update');
                    }, 1000);
                }
            }`;
}

// How to use: 
// 1. Copy this file to your project directory
// 2. Open script.js and find the speech recognition handler
// 3. Replace it with the code in the replacementCode variable
