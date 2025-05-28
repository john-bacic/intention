// Update the script.js file to use the fixed implementation

// Replace the onresult handler to update transcript display continuously
recognition.onresult = (event) => {
    const last = event.results.length - 1;
    const result = event.results[last];
    const transcript = result[0].transcript.trim();
    
    // Always update the transcript display with latest text
    if (transcriptEl) {
        transcriptEl.textContent = 'Heard: "' + transcript + '"';
        
        // Only add animation and process for final results
        if (result.isFinal) {
            transcriptEl.classList.add('speech-update');
            
            // Process final results
            processTranscript(transcript.toLowerCase());
            
            // Remove the animation class after it completes
            setTimeout(() => {
                transcriptEl.classList.remove('speech-update');
            }, 1000);
        }
    }
};
