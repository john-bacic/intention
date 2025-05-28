// Function to process recognized speech transcript
function processTranscript(transcript) {
    console.log("Processing transcript:", transcript);
    
    // Get the motivation phrase if set
    const motivationPhrase = localStorage.getItem('motivation-phrase') || "";
    
    // Normalize the transcript and phrase for better matching
    const normalizedTranscript = transcript.toLowerCase().trim();
    const normalizedPhrase = motivationPhrase.toLowerCase().trim();
    
    // Flag to track if we should trigger a count
    let shouldCount = false;
    
    // Check for default "count" command if no motivation phrase is set
    if (!normalizedPhrase && (
        normalizedTranscript.includes("count") || 
        normalizedTranscript.includes("counts") ||
        normalizedTranscript.includes("counter")
    )) {
        shouldCount = true;
        console.log("Default count command detected");
    }
    // Check if the transcript EXACTLY matches the custom motivation phrase
    else if (normalizedPhrase && (
        normalizedTranscript === normalizedPhrase || // Exact match 
        normalizedTranscript.includes(normalizedPhrase) // Still allow contained matches
    )) {
        shouldCount = true;
        // Log whether it was an exact match or just contained
        if (normalizedTranscript === normalizedPhrase) {
            console.log("EXACT match with custom phrase:", normalizedPhrase);
        } else {
            console.log("Custom phrase detected within speech:", normalizedPhrase);
        }
    }
    
    // If we should count, trigger the count action
    if (shouldCount) {
        // Use a small cooldown to prevent multiple rapid triggers
        const now = Date.now();
        const lastTriggerTime = window.lastVoiceTriggerTime || 0;
        const cooldownPeriod = 1500; // 1.5 seconds cooldown
        
        if (now - lastTriggerTime > cooldownPeriod) {
            console.log("Voice command triggered counter increment");
            handleCountClickFromAudio();
            window.lastVoiceTriggerTime = now;
        } else {
            console.log("Command ignored due to cooldown");
        }
    }
}
