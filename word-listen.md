

Listens to audio input via microphone.
Transcribes audio to text in real-time (speech-to-text).
Detects specific words or phrases in the transcription.
Counts how many times these words or phrases are spoken.
✅ How to do this using JavaScript:
You can achieve this efficiently with the built-in Web Speech API.

Javascript:


let recognition;
let isListening = false;
let fullTranscript = "";
let detectPhrase = "";

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const transcriptEl = document.getElementById("transcript");
const countEl = document.getElementById("count");
const phraseInput = document.getElementById("phraseInput");

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = function(event) {
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcriptPart = event.results[i][0].transcript;
      
      if (event.results[i].isFinal) {
        fullTranscript += transcriptPart + ' ';
      } else {
        interimTranscript += transcriptPart;
      }
    }

    transcriptEl.textContent = fullTranscript + interimTranscript;

    // Phrase detection logic:
    detectPhrase = phraseInput.value.trim();
    if(detectPhrase){
      const regex = new RegExp(`\\b${detectPhrase}\\b`, 'gi');
      const matches = (fullTranscript + interimTranscript).match(regex);
      const count = matches ? matches.length : 0;
      countEl.textContent = count;
    }
  };

  recognition.onerror = function(event) {
    console.error("Speech Recognition Error", event);
  };

  recognition.onend = function() {
    if (isListening) recognition.start(); // Automatically restart
  };
} else {
  alert("Your browser doesn't support Speech Recognition. Please use Chrome or Edge.");
}

startBtn.onclick = () => {
  if(!phraseInput.value.trim()){
    alert("Please enter a word or phrase to detect!");
    return;
  }

  if (!isListening) {
    fullTranscript = "";
    transcriptEl.textContent = "";
    countEl.textContent = "0";
    recognition.start();
    isListening = true;
  }
};

stopBtn.onclick = () => {
  recognition.stop();
  isListening = false;
};
