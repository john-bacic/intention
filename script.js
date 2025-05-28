// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Use a timeout to avoid hanging if service worker registration fails
    const timeoutId = setTimeout(() => {
      console.warn(
        'Service Worker registration timeout - continuing without service worker'
      )
    }, 3000)

    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        clearTimeout(timeoutId)
        console.log('Service Worker registered with scope:', registration.scope)

        // Check if there's a waiting service worker and update UI
        if (registration.waiting) {
          console.log('New service worker waiting to activate')
        }

        // Handle service worker updates
        registration.onupdatefound = () => {
          const installingWorker = registration.installing
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (
                installingWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                console.log('New service worker installed - reload for updates')
              }
            }
          }
        }
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        console.error('Service Worker registration failed:', error)
        // Continue app functionality even if service worker fails
      })
  })
}

// Main app functionality
document.addEventListener('DOMContentLoaded', function () {
  // Constants and settings
  const DAYS = 7
  const MAX_COUNT = 100
  const STORAGE_KEY = 'hundredTimesApp'
  const SQUARES_PER_DAY = 100
  const RECORDING_INTERVAL = 5000 // Process recording every 5 seconds

  // Initialize global variables
  let dayData = []
  let currentDay = 1
  let userMotivation = ''
  let settings = {
    darkMode: false,
    displayMode: 'random',
    audioSensitivity: 1,
    openaiApiKey: '',
  }

  // Initialize audio variables
  let audioContext = null
  let analyser = null
  let microphone = null
  let microphoneStream = null
  let audioInitialized = false
  let visualizationFrame = null
  let recognition = null
  let isRecognitionActive = false
  let isVoiceEnabled = false
  let lastSpeechTimestamp = 0
  let phraseMatched = false
  let lastRecognizedPhrase = ''
  let recorder = null
  let audioChunks = []
  let isRecording = false
  let isUsingOpenAI = true
  let sharedMicrophoneStream = null
  let micPermissionRequested = false
  let isProcessingAudio = false

  // Audio level detection variables
  let lastAudioLevel = 0
  let speechThresholdTimer = null
  let audioLevelHistory = []
  const AUDIO_HISTORY_LENGTH = 10 // Number of samples to keep for calculating average

  // Global variables for click processing
  let clickQueue = []
  let lastProcessedNumber = 0

  // Global variables for OpenAI API
  let OPENAI_API_KEY = ''
  let mediaRecorder = null

  // DOM Elements
  const countButton = document.getElementById('count-button')
  const userSentence = document.getElementById('user-sentence')
  let squaresGrid = document.getElementById('squares-grid')
  let bigNumberDisplay = document.querySelector('.big-number-display')
  const days = document.querySelectorAll('.day')

  // Application-level variables
  let dayButtons
  let processingQueue = false
  let isAnimating = false
  let bigModeAnimationTimeout = null

  // Variables for OpenAI Whisper API
  let isSpeaking = false
  let lastTranscriptProcessTime = 0
  let potentialTriggerPhrase = ''
  let fullTranscript = '' // Store the full transcript for phrase detection
  let lastPhraseDetectionTime = 0 // To prevent duplicate triggers
  let lastAudioState = false // false = silence, true = audio detected
  let audioStateChangeTimeout = null // Timeout for audio state changes
  let animationId = null
  let canvasContext = null
  let audioDataArray = null

  // Better microphone access function
  async function requestMicrophoneAccess() {
    try {
      // Always create a fresh audio context on user interaction if needed
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)()
        console.log('Created new AudioContext')
      } else if (audioContext.state === 'suspended') {
        await audioContext.resume()
        console.log('Resumed AudioContext')
      }

      // Request microphone access with clear constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      // Save the stream globally for reuse
      microphoneStream = stream

      console.log(
        'Microphone access granted',
        'Tracks:',
        stream.getAudioTracks().length
      )

      // Success! Create analyzer if needed
      if (!analyser) {
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        console.log('Created new analyzer')
      }

      // Create and connect microphone source if needed
      if (!microphone) {
        microphone = audioContext.createMediaStreamSource(stream)
        microphone.connect(analyser)
        console.log('Connected microphone to analyzer')
      }

      // Show success message
      const transcriptEl = document.getElementById('speech-transcript')
      if (transcriptEl) {
        transcriptEl.textContent = 'Microphone connected successfully'
      }

      audioInitialized = true
      return stream
    } catch (error) {
      // Handle specific error types
      console.error('Microphone access error:', error)

      // Update UI with specific error messages
      const transcriptEl = document.getElementById('speech-transcript')
      if (transcriptEl) {
        if (
          error.name === 'NotAllowedError' ||
          error.name === 'PermissionDeniedError'
        ) {
          transcriptEl.textContent =
            'Microphone access denied by browser. Please check permission settings.'
        } else if (
          error.name === 'NotFoundError' ||
          error.name === 'DevicesNotFoundError'
        ) {
          transcriptEl.textContent = 'No microphone found on your device'
        } else if (
          error.name === 'NotReadableError' ||
          error.name === 'TrackStartError'
        ) {
          transcriptEl.textContent =
            'Microphone is in use by another application'
        } else {
          transcriptEl.textContent = `Error accessing microphone: ${error.message}`
        }
      }

      // Log helpful debugging information
      console.log('TROUBLESHOOTING:')
      console.log('- Browser:', navigator.userAgent)
      console.log('- Error name:', error.name)
      console.log('- Error message:', error.message)
      console.log('- Running on HTTPS?', window.location.protocol === 'https:')
      console.log(
        '- Running on localhost?',
        window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1'
      )

      throw error
    }
  }

  // Function to clean up audio resources
  function cleanupAudioResources() {
    if (microphone) {
      microphone.disconnect()
      microphone = null
    }

    if (microphoneStream) {
      microphoneStream.getTracks().forEach((track) => track.stop())
      microphoneStream = null
    }

    if (audioContext) {
      audioContext.close().then(() => {
        console.log('AudioContext closed')
        audioContext = null
        analyser = null
      })
    }

    audioInitialized = false
  }

  // Helper functions
  function generateMutedColor() {
    // Generate a pleasing hue
    const hue = Math.floor(Math.random() * 360)

    // Use higher saturation and lightness for more vibrant colors
    const saturation = 70 + Math.floor(Math.random() * 30) // 70-100%
    const lightness = 45 + Math.floor(Math.random() * 15) // 45-60%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`
  }

  // Function to initialize the app
  function initializeApp() {
    // Load data or initialize fresh
    loadProgress()

    // Create squares grid
    generateSquares()

    // Set up event listeners
    setupEventListeners()

    // Update the UI
    updateUI()

    // Fetch latest commit hash from GitHub
    fetchLatestCommitHash()

    // Set initial display based on display mode
    const squaresGrid = document.getElementById('squares-grid')
    const bigNumberDisplay = document.querySelector('.big-number-display')

    if (settings.displayMode === 'big') {
      squaresGrid.style.display = 'none'
      bigNumberDisplay.style.display = 'flex'

      // Clear the big number display
      bigNumberDisplay.innerHTML = ''

      // Create the dots grid
      const dotsGrid = createDotsGrid()
      bigNumberDisplay.appendChild(dotsGrid)

      // Show the current count in big display
      const currentDayData = dayData[currentDay - 1]
      if (currentDayData.count > 0) {
        // Create number element
        const numberElement = document.createElement('div')
        numberElement.style.color =
          currentDayData.coloredSquares.length > 0
            ? currentDayData.coloredSquares[
                currentDayData.coloredSquares.length - 1
              ].color
            : '#e0e0e0'
        numberElement.style.fontSize = 'inherit'
        numberElement.style.display = 'flex'
        numberElement.style.justifyContent = 'center'
        numberElement.style.alignItems = 'center'
        numberElement.style.width = '100%'
        numberElement.style.height = '100%'
        numberElement.style.position = 'relative'
        numberElement.style.zIndex = '1'
        numberElement.textContent = currentDayData.count

        // Add the number element to the display
        bigNumberDisplay.appendChild(numberElement)

        // Update the dots grid based on the current count
        updateDots(currentDayData.count)
      } else {
        // Create number element for zero count
        const numberElement = document.createElement('div')
        numberElement.style.color = '#888'
        numberElement.style.fontSize = 'inherit'
        numberElement.style.display = 'flex'
        numberElement.style.justifyContent = 'center'
        numberElement.style.alignItems = 'center'
        numberElement.style.width = '100%'
        numberElement.style.height = '100%'
        numberElement.style.position = 'relative'
        numberElement.style.zIndex = '1'
        numberElement.textContent = '0'

        // Add the number element to the display
        bigNumberDisplay.appendChild(numberElement)

        // Ensure dots grid is visible even with zero count
        updateDots(0)
      }
    } else {
      squaresGrid.style.display = 'grid'
      bigNumberDisplay.style.display = 'none'
    }

    // Load dark mode setting from localStorage
    const savedDarkMode = localStorage.getItem('darkMode')
    if (savedDarkMode) {
      settings.darkMode = JSON.parse(savedDarkMode)
      if (settings.darkMode) {
        document.body.classList.add('dark-mode')
        document.getElementById('dark-mode-toggle').classList.add('active')
      }
    }

    // Load saved audio sensitivity
    const savedSensitivity = localStorage.getItem('audioSensitivity')
    if (savedSensitivity) {
      audioSensitivity = parseInt(savedSensitivity)
      const sensitivitySlider = document.getElementById('audio-sensitivity')
      if (sensitivitySlider) {
        sensitivitySlider.value = audioSensitivity

        // Update the displayed value (0-10 scale)
        const sensitivityValueElement =
          document.getElementById('sensitivity-value')
        if (sensitivityValueElement) {
          sensitivityValueElement.textContent = audioSensitivity
        }
      }
    }
  }

  function generateSquares() {
    const currentDayData = dayData[currentDay - 1]

    // Create 100 squares
    for (let i = 1; i <= 100; i++) {
      const square = document.createElement('div')
      square.classList.add('square')
      square.textContent = i

      // Check if this square should be colored
      const isColored = currentDayData.count >= i
      if (isColored) {
        square.classList.add('colored')

        // Get the color for this square from coloredSquares or generate one
        let squareColor
        if (i <= currentDayData.coloredSquares.length) {
          squareColor = currentDayData.coloredSquares[i - 1].color
        } else {
          squareColor = generateMutedColor()
        }

        square.style.backgroundColor = squareColor
      }

      squaresGrid.appendChild(square)
    }
  }

  function initializeData() {
    // Initialize empty data for all 7 days
    for (let i = 1; i <= 7; i++) {
      dayData.push({
        day: i,
        count: 0,
        coloredSquares: [],
        completed: false,
      })
    }
  }

  function loadProgress() {
    try {
      console.log('Loading progress from localStorage...')

      // Get saved data from localStorage
      const savedData = localStorage.getItem(STORAGE_KEY)

      if (savedData) {
        const parsed = JSON.parse(savedData)

        // Load existing data if it's available
        dayData = parsed.dayData || []
        currentDay = parsed.currentDay || 1
        userMotivation = parsed.userMotivation || ''
        settings = parsed.settings || {
          darkMode: false,
          displayMode: 'random',
          audioSensitivity: 1,
          openaiApiKey: '',
        }

        // Ensure we have valid dayData
        if (!Array.isArray(dayData) || dayData.length === 0) {
          // Create fresh data as fallback
          initializeData()
        }

        // Check if user has an existing motivation
        if (userMotivation && userMotivation.length > 0) {
          const userSentenceField = document.getElementById('user-sentence')
          if (userSentenceField) {
            // Check if the motivation needs quotes added
            // Only add quotes if they're not already there
            let displayText = userMotivation
            if (!displayText.startsWith('"') && !displayText.endsWith('"')) {
              displayText = `"${displayText}"`
            }
            userSentenceField.value = displayText
          }
        }
      } else {
        // Start with fresh data if nothing was saved
        initializeData()
      }

      // Verify currentDay is valid
      if (currentDay < 1 || currentDay > DAYS) {
        currentDay = 1
      }

      // Restore other settings and variables

      // Restore dark mode
      if (settings.darkMode) {
        document.body.classList.add('dark-mode')
      }

      // Set the display mode - we'll update it properly in updateUI
      if (!settings.displayMode) {
        settings.displayMode = 'random' // Default
      }

      // Restore sensitivity setting
      const savedSensitivity = localStorage.getItem('audioSensitivity')
      if (savedSensitivity) {
        audioSensitivity = parseInt(savedSensitivity)
        document.getElementById('audio-sensitivity').value = audioSensitivity
      }

      // Load OpenAI API key from config.js first, then localStorage as fallback
      if (typeof CONFIG !== 'undefined' && CONFIG.OPENAI_API_KEY) {
        // If config.js is loaded and has the API key
        OPENAI_API_KEY = CONFIG.OPENAI_API_KEY
        settings.openaiApiKey = CONFIG.OPENAI_API_KEY
        console.log('Loaded API key from config.js')

        // Add the key to the input field in the settings and disable it
        const apiKeyInput = document.getElementById('openai-api-key')
        if (apiKeyInput) {
          apiKeyInput.value = OPENAI_API_KEY
          apiKeyInput.disabled = true
          apiKeyInput.placeholder = 'API key loaded from config'

          // Hide the save button since it's not needed
          const saveApiKeyButton = document.getElementById('save-api-key')
          if (saveApiKeyButton) {
            saveApiKeyButton.style.display = 'none'
          }
        }

        // Save to localStorage as well
        localStorage.setItem('openaiApiKey', OPENAI_API_KEY)
        saveProgress()
      } else {
        // Fall back to localStorage if config.js doesn't have a valid key
        useLocalStorageKey()
      }

      function useLocalStorageKey() {
        const savedOpenaiApiKey = localStorage.getItem('openaiApiKey')
        if (savedOpenaiApiKey) {
          settings.openaiApiKey = savedOpenaiApiKey
          OPENAI_API_KEY = savedOpenaiApiKey

          // Add the key to the input field in the settings
          const apiKeyInput = document.getElementById('openai-api-key')
          if (apiKeyInput) {
            apiKeyInput.value = OPENAI_API_KEY
          }
        }
      }
    } catch (error) {
      // Catch any other errors that might occur
      console.error('Error in loadProgress:', error)

      // Provide a fallback to avoid app breaking
      initializeData()
      currentDay = 1
      userMotivation = ''
      settings = {
        darkMode: false,
        displayMode: 'random',
        audioSensitivity: 1,
        openaiApiKey: '',
      }

      // Still update the UI to avoid hanging
      updateUI()
    }
  }

  function saveDataToLocalStorage() {
    // Save the day data, current day, and user motivation to local storage
    const dataToSave = {
      dayData: dayData,
      currentDay: currentDay,
      userMotivation: userMotivation,
      settings: settings,
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
  }

  function updateUI() {
    // Get current day's data
    const currentDayData = dayData[currentDay - 1]

    // Get the next available day for navigation
    const nextAvailableDay = getNextAvailableDay()

    // Update days
    days.forEach((day, index) => {
      const dayNumber = index + 1
      const isCurrentDay = dayNumber === currentDay
      const isDayCompleted = dayData[index].completed
      const isPastDay = dayNumber < currentDay
      const isAvailableDay = dayNumber <= nextAvailableDay

      // Reset all classes and styles
      day.classList.remove('active', 'completed', 'past')
      day.style.cursor =
        isAvailableDay || isDayCompleted ? 'pointer' : 'default'

      // Get the day label element
      const dayLabel = day.querySelector('.day-label')

      // Hide day label by default
      if (dayLabel) {
        dayLabel.style.opacity = '0'
      }

      if (isCurrentDay) {
        // Highlight current day
        day.classList.add('active')

        // Show day label only for current day
        if (dayLabel) {
          dayLabel.style.opacity = '1'
        }
      } else if (isDayCompleted) {
        // Completed days
        day.classList.add('completed')
      } else if (isPastDay) {
        // Past days (not completed)
        day.classList.add('past')
      }
    })

    // Update user sentence with a single set of quotation marks
    if (userSentence && userMotivation) {
      if (userMotivation.trim() !== '') {
        // First strip any existing quotes
        let cleanValue = userMotivation
        while (cleanValue.startsWith('"') || cleanValue.endsWith('"')) {
          cleanValue = cleanValue.replace(/^"/, '').replace(/"$/, '')
        }

        // Now add just one set of quotes
        if (cleanValue.trim() !== '') {
          userSentence.value = `"${cleanValue}"`
        } else {
          userSentence.value = ''
        }
      } else {
        userSentence.value = userMotivation
      }
    }

    // Update button appearance based on completion state
    updateButtonAppearance()

    // Update display based on display mode
    const squaresGrid = document.getElementById('squares-grid')
    const bigNumberDisplay = document.querySelector('.big-number-display')

    if (settings.displayMode === 'big') {
      // Hide grid completely when in big mode
      squaresGrid.style.display = 'none'
      bigNumberDisplay.style.display = 'flex'

      // Show the current count in big display
      const currentDayData = dayData[currentDay - 1]
      if (currentDayData.count > 0) {
        bigNumberDisplay.textContent = currentDayData.count
        if (currentDayData.coloredSquares.length > 0) {
          const lastColoredSquare =
            currentDayData.coloredSquares[
              currentDayData.coloredSquares.length - 1
            ]
          bigNumberDisplay.style.color = lastColoredSquare.color
        }
      } else {
        bigNumberDisplay.textContent = '0'
        bigNumberDisplay.style.color = '#888'
      }
    } else {
      // Show grid for other modes
      squaresGrid.style.display = 'grid'
      bigNumberDisplay.style.display = 'none'
      // Regenerate the grid with current data
      regenerateGrid()
    }
  }

  function regenerateGrid() {
    // Clear grid
    squaresGrid.innerHTML = ''

    // Generate new squares (all empty initially)
    for (let i = 1; i <= 100; i++) {
      const square = document.createElement('div')
      square.classList.add('square')
      square.dataset.index = i - 1 // Store the position index as a data attribute
      square.textContent = i // Set numbers but they'll be transparent initially
      squaresGrid.appendChild(square)
    }

    // Color the squares that have already been marked (with staggered animation)
    const currentDayData = dayData[currentDay - 1]
    const squares = document.querySelectorAll('.square')

    // Create a sorted copy of coloredSquares by number for consistent display
    let sortedSquares = [...currentDayData.coloredSquares]
    sortedSquares.sort((a, b) => a.number - b.number)

    // Verify we don't have any missing numbers
    const numbers = sortedSquares.map((square) => square.number)
    const expectedNumbers = Array.from(
      { length: currentDayData.count },
      (_, i) => i + 1
    )
    const missingNumbers = expectedNumbers.filter(
      (num) => !numbers.includes(num)
    )

    // Add any missing numbers
    for (const missingNum of missingNumbers) {
      // Get a position that's not used yet
      let availablePositions = []
      for (let i = 0; i < squares.length; i++) {
        if (!sortedSquares.some((square) => square.position === i)) {
          availablePositions.push(i)
        }
      }

      const position =
        availablePositions.length > 0 ? availablePositions[0] : missingNum - 1 // Fallback to sequential position

      const newSquare = {
        number: missingNum,
        color: generateMutedColor(),
        position: position,
      }

      sortedSquares.push(newSquare)
      currentDayData.coloredSquares.push(newSquare)
    }

    // Re-sort after adding missing numbers
    sortedSquares.sort((a, b) => a.number - b.number)

    // Apply the colored squares with staggered animation
    sortedSquares.forEach((squareData, index) => {
      const position = squareData.position
      if (position < squares.length) {
        const square = squares[position]

        // First set initial state for animation
        square.style.backgroundColor = squareData.color
        square.textContent = squareData.number
        square.classList.add('colored')

        // Set initial state for stronger pop-in animation
        square.style.opacity = '0'
        square.style.transform = 'scale(0)'

        // Force reflow to ensure animation plays
        void square.offsetWidth

        // Use custom animation with more dramatic effect
        square.style.transition =
          'transform 0.4s cubic-bezier(0.17, 0.89, 0.32, 1.49), opacity 0.4s ease'
        square.style.transform = 'scale(1.1)'
        square.style.opacity = '1'

        // Remove the scaling after the animation completes
        setTimeout(() => {
          square.style.transform = 'scale(1)'
        }, 350)
      }
    })

    // Make sure the count matches the highest number
    if (sortedSquares.length > 0) {
      const highestNumber = sortedSquares[sortedSquares.length - 1].number
      if (currentDayData.count < highestNumber) {
        currentDayData.count = highestNumber
      }
    }

    // Save the corrected data
    saveDataToLocalStorage()
  }

  function initializeData() {
    // Initialize empty data for all 7 days
    for (let i = 1; i <= 7; i++) {
      dayData.push({
        day: i,
        count: 0,
        coloredSquares: [],
        completed: false,
      })
    }
  }

  function setupEventListeners() {
    // Auto-resize textarea
    const userSentenceTextarea = document.getElementById('user-sentence')
    if (userSentenceTextarea) {
      function autoResize() {
        userSentenceTextarea.style.height = 'auto'
        userSentenceTextarea.style.height =
          Math.max(44, userSentenceTextarea.scrollHeight) + 'px'
      }

      userSentenceTextarea.addEventListener('input', autoResize)
      userSentenceTextarea.addEventListener('paste', () =>
        setTimeout(autoResize, 0)
      )

      // Initial resize
      autoResize()
    }

    // Count button event - adding both click and touchstart for better mobile response
    countButton.addEventListener('click', handleCountClick)
    countButton.addEventListener('touchstart', function (e) {
      e.preventDefault() // Prevent default to avoid delays
      handleCountClick()
    })

    // Voice toggle button event
    const voiceToggle = document.getElementById('voice-toggle')
    const audioVisualizer = document.getElementById('audio-visualizer')

    if (voiceToggle) {
      voiceToggle.addEventListener('click', function () {
        toggleVoiceRecognition()

        // Log the new state
        console.log(
          `Voice recognition is now ${isVoiceEnabled ? 'enabled' : 'disabled'}`
        )

        // Ensure we start up voice recognition immediately when enabled
        if (isVoiceEnabled) {
          // Initialize speech recognition using OpenAI if API key is available
          if (OPENAI_API_KEY) {
            initOpenAISpeechRecognition()
          } else {
            // Fallback to Web Speech API
            if (!recognition) {
              const success = initVoiceRecognition()
              console.log(
                'Voice recognition initialization:',
                success ? 'successful' : 'failed'
              )
            }

            // Attempt to start it if we have recognition available
            if (recognition && !isRecognitionActive) {
              try {
                recognition.start()
                isRecognitionActive = true
                console.log('Speech recognition started successfully')
              } catch (err) {
                console.error('Failed to start recognition:', err)

                // Try to recreate recognition after error
                setTimeout(() => {
                  console.log('Attempting to recreate recognition after error')
                  initVoiceRecognition()
                }, 500)
              }
            }
          }
        } else {
          // Stop recording if using OpenAI
          stopRecording()
        }
      })

      voiceToggle.addEventListener('touchstart', function (e) {
        e.preventDefault() // Prevent default to avoid delays

        toggleVoiceRecognition()

        // Log the new state
        console.log(
          `Voice recognition is now ${isVoiceEnabled ? 'enabled' : 'disabled'}`
        )

        // Ensure we start up voice recognition immediately when enabled
        if (isVoiceEnabled) {
          // Initialize speech recognition using OpenAI if API key is available
          if (OPENAI_API_KEY) {
            initOpenAISpeechRecognition()
          } else {
            // Fallback to Web Speech API
            if (!recognition) {
              const success = initVoiceRecognition()
              console.log(
                'Voice recognition initialization:',
                success ? 'successful' : 'failed'
              )
            }

            // Attempt to start it if we have recognition available
            if (recognition && !isRecognitionActive) {
              try {
                recognition.start()
                isRecognitionActive = true
                console.log('Speech recognition started successfully')
              } catch (err) {
                console.error('Failed to start recognition:', err)

                // Try to recreate recognition after error
                setTimeout(() => {
                  console.log('Attempting to recreate recognition after error')
                  initVoiceRecognition()
                }, 500)
              }
            }
          }
        } else {
          // Stop recording if using OpenAI
          stopRecording()
        }
      })
    }

    // Settings panel toggle
    const settingsToggle = document.getElementById('settings-toggle')
    const settingsPanel = document.getElementById('settings-panel')

    // Completely replace both event handlers with a single more robust one
    const handleSettingsToggle = function (e) {
      e.preventDefault() // Prevent any default actions
      e.stopPropagation() // Prevent event bubbling

      // Force toggle the settings panel
      if (settingsPanel.classList.contains('active')) {
        settingsPanel.classList.remove('active')
      } else {
        settingsPanel.classList.add('active')
      }

      // Return false to ensure the event is completely handled
      return false
    }

    // Add both event listeners with the same handler
    settingsToggle.addEventListener('click', handleSettingsToggle)
    settingsToggle.addEventListener('touchstart', handleSettingsToggle)

    // Close settings panel when clicking outside
    document.addEventListener('click', function (event) {
      if (
        !settingsPanel.contains(event.target) &&
        event.target !== settingsToggle
      ) {
        settingsPanel.classList.remove('active')
      }
    })

    // Reset button
    const resetButton = document.getElementById('reset-button')

    resetButton.addEventListener('click', function () {
      if (
        confirm(
          'Are you sure you want to reset all progress? This cannot be undone.'
        )
      ) {
        // Save the current display mode settings before resetting
        const currentSettings = {
          darkMode: settings.darkMode,
          displayMode: settings.displayMode,
        }

        // Remove all data from localStorage
        localStorage.removeItem(STORAGE_KEY)

        // Create new data with preserved settings
        const newData = {
          dayData: [],
          currentDay: 1,
          userMotivation: '',
          settings: currentSettings,
        }

        // Save the new data with preserved settings
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newData))

        // Reload the page to apply changes
        location.reload()
      }
    })

    resetButton.addEventListener('touchstart', function (e) {
      e.preventDefault() // Prevent default to avoid delays
      if (
        confirm(
          'Are you sure you want to reset all progress? This cannot be undone.'
        )
      ) {
        // Save the current display mode settings before resetting
        const currentSettings = {
          darkMode: settings.darkMode,
          displayMode: settings.displayMode,
        }

        // Remove all data from localStorage
        localStorage.removeItem(STORAGE_KEY)

        // Create new data with preserved settings
        const newData = {
          dayData: [],
          currentDay: 1,
          userMotivation: '',
          settings: currentSettings,
        }

        // Save the new data with preserved settings
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newData))

        // Reload the page to apply changes
        location.reload()
      }
    })

    // Modify the touchend handler to avoid interfering with interactive elements
    document.addEventListener(
      'touchend',
      function (e) {
        // Only prevent default on day and square elements
        if (
          e.target.closest('.day, .square') &&
          !e.target.closest('#count-button, #settings-toggle, #reset-button')
        ) {
          e.preventDefault()
        }
      },
      { passive: false }
    )

    // Day selection event
    days.forEach((day) => {
      day.addEventListener('click', function () {
        // Get the day number element
        const dayNumberElement = this.querySelector('.day-number')
        const selectedDay = parseInt(dayNumberElement.textContent)

        // Get the index of the selected day (0-based)
        const dayIndex = selectedDay - 1

        // Check if the day is completed or is the next available day
        const isDayCompleted = dayData[index].completed
        const nextAvailableDay = getNextAvailableDay()
        const canNavigate = isDayCompleted || selectedDay <= nextAvailableDay

        // Add a visual indication that the day is clickable
        if (canNavigate) {
          this.style.cursor = 'pointer'
        } else {
          this.style.cursor = 'not-allowed'
        }

        if (canNavigate) {
          currentDay = selectedDay
          updateUI()
          saveProgress() // Save the current day selection
        }
      })

      day.addEventListener('touchstart', function (e) {
        e.preventDefault() // Prevent default to avoid delays

        // Get the day number element
        const dayNumberElement = this.querySelector('.day-number')
        const selectedDay = parseInt(dayNumberElement.textContent)

        // Get the index of the selected day (0-based)
        const dayIndex = selectedDay - 1

        // Check if the day is completed or is the next available day
        const isDayCompleted = dayData[index].completed
        const nextAvailableDay = getNextAvailableDay()
        const canNavigate = isDayCompleted || selectedDay <= nextAvailableDay

        if (canNavigate) {
          currentDay = selectedDay
          updateUI()
          saveProgress() // Save the current day selection
        }
      })
    })

    // Save user sentence
    if (userSentence) {
      userSentence.addEventListener('input', function () {
        // Store the raw input value without quotes
        let inputValue = this.value

        // Strip existing quotes to get clean content
        if (inputValue.startsWith('"') && inputValue.endsWith('"')) {
          userMotivation = inputValue.substring(1, inputValue.length - 1)
        } else {
          userMotivation = inputValue
        }

        // Don't add quotes during typing to avoid weird cursor positioning
        // We'll add them on blur

        saveProgress()
      })

      // When the input field loses focus, ensure quotes are added properly
      userSentence.addEventListener('blur', function () {
        if (this.value.trim() !== '') {
          // First strip any existing quotes
          let cleanValue = this.value
          while (cleanValue.startsWith('"') || cleanValue.endsWith('"')) {
            cleanValue = cleanValue.replace(/^"/, '').replace(/"$/, '')
          }

          // Now add just one set of quotes
          if (cleanValue.trim() !== '') {
            this.value = `"${cleanValue}"`
          }
        }
      })
    }

    // Display mode radio buttons
    const displayModeRadios = document.querySelectorAll(
      'input[name="display-mode"]'
    )
    displayModeRadios.forEach((radio) => {
      // Set the initial state based on settings
      if (radio.value === settings.displayMode) {
        radio.checked = true
      }

      radio.addEventListener('change', function () {
        if (this.checked) {
          const previousMode = settings.displayMode
          settings.displayMode = this.value

          // Clear any existing animation timeouts
          if (bigModeAnimationTimeout) {
            clearTimeout(bigModeAnimationTimeout)
            bigModeAnimationTimeout = null
          }

          // Reset animation state
          isAnimating = false

          // Update UI based on mode
          const squaresGrid = document.getElementById('squares-grid')
          const bigNumberDisplay = document.querySelector('.big-number-display')

          // Reset any classes on big number display
          bigNumberDisplay.classList.remove('active')
          bigNumberDisplay.classList.remove('fade-out')
          bigNumberDisplay.classList.remove('big-number-pulse')

          if (settings.displayMode === 'big') {
            // Hide grid completely when in big mode
            squaresGrid.style.display = 'none'
            bigNumberDisplay.style.display = 'flex'

            // Clear the big number display
            bigNumberDisplay.innerHTML = ''

            // Create the dots grid
            const dotsGrid = createDotsGrid()
            bigNumberDisplay.appendChild(dotsGrid)

            // Show the current count in big display
            const currentDayData = dayData[currentDay - 1]
            if (currentDayData.count > 0) {
              // Create number element
              const numberElement = document.createElement('div')
              numberElement.style.color =
                currentDayData.coloredSquares.length > 0
                  ? currentDayData.coloredSquares[
                      currentDayData.coloredSquares.length - 1
                    ].color
                  : '#e0e0e0'
              numberElement.style.fontSize = 'inherit'
              numberElement.style.display = 'flex'
              numberElement.style.justifyContent = 'center'
              numberElement.style.alignItems = 'center'
              numberElement.style.width = '100%'
              numberElement.style.height = '100%'
              numberElement.style.position = 'relative'
              numberElement.style.zIndex = '1'
              numberElement.textContent = currentDayData.count

              // Add the number element to the display
              bigNumberDisplay.appendChild(numberElement)

              // Update the dots grid based on the current count
              updateDots(currentDayData.count)
              // Color is now applied directly to the numberElement, not needed here
            } else {
              // Create number element for zero count
              const numberElement = document.createElement('div')
              numberElement.style.color = '#888'
              numberElement.style.fontSize = 'inherit'
              numberElement.style.display = 'flex'
              numberElement.style.justifyContent = 'center'
              numberElement.style.alignItems = 'center'
              numberElement.style.width = '100%'
              numberElement.style.height = '100%'
              numberElement.style.position = 'relative'
              numberElement.style.zIndex = '1'
              numberElement.textContent = '0'

              // Add the number element to the display
              bigNumberDisplay.appendChild(numberElement)

              // Ensure dots grid is visible even with zero count
              updateDots(0)
            }
          } else {
            // Show grid for other modes
            squaresGrid.style.display = 'grid'
            bigNumberDisplay.style.display = 'none'
            // Regenerate the grid with current data
            regenerateGrid()
          }

          // Always rearrange squares when switching between modes
          if (previousMode !== settings.displayMode) {
            // Rearrange all days' data
            dayData.forEach((day) => {
              if (day.coloredSquares && day.coloredSquares.length > 0) {
                // Rearrange positions
                if (settings.displayMode === 'sequential') {
                  // Sequential: assign positions 0 to count-1
                  day.coloredSquares.forEach((square, index) => {
                    square.position = index // Just use sequential positions for now
                  })
                } else if (settings.displayMode === 'random') {
                  // Random: assign random unique positions
                  let availablePositions = Array.from(
                    { length: 100 },
                    (_, i) => i
                  )
                  day.coloredSquares.forEach((square) => {
                    // Get random position from available positions
                    const randomIndex = Math.floor(
                      Math.random() * availablePositions.length
                    )
                    square.position = availablePositions[randomIndex]
                    // Remove used position
                    availablePositions.splice(randomIndex, 1)
                  })
                }
              }
            })

            // Regenerate the grid for the current day
            regenerateGrid()
          }

          // Save the new settings
          saveProgress()
        }
      })
    })

    // Display mode toggle
    const displayModeToggle = document.getElementById('display-mode-toggle')

    if (displayModeToggle) {
      displayModeToggle.addEventListener('click', function () {
        // Toggle between 'random' and 'big' modes
        settings.displayMode =
          settings.displayMode === 'random' ? 'big' : 'random'

        // Save setting to localStorage
        localStorage.setItem(
          'displayMode',
          JSON.stringify(settings.displayMode)
        )

        // Update UI
        updateUI()
      })
    }

    // Audio sensitivity slider
    const sensitivitySlider = document.getElementById('audio-sensitivity')
    if (sensitivitySlider) {
      sensitivitySlider.addEventListener('input', handleSensitivityChange)

      // Initialize display value
      const savedSensitivity = localStorage.getItem('audioSensitivity')
      if (savedSensitivity) {
        audioSensitivity = parseInt(savedSensitivity)
        sensitivitySlider.value = audioSensitivity

        // Update the displayed value (0-10 scale)
        const sensitivityValueElement =
          document.getElementById('sensitivity-value')
        if (sensitivityValueElement) {
          sensitivityValueElement.textContent = audioSensitivity
        }
      }

      // Add touch-specific improvements
      sensitivitySlider.addEventListener('touchstart', function () {
        this.classList.add('touch-active')
      })

      sensitivitySlider.addEventListener('touchend', function () {
        this.classList.remove('touch-active')
      })
    }

    // Setup audio sensitivity slider
    document
      .getElementById('audio-sensitivity')
      .addEventListener('input', function () {
        const value = parseInt(this.value)
        document.getElementById('sensitivity-value').textContent = value
        audioSensitivity = value
        settings.audioSensitivity = value
        saveProgress()

        // Also save in local storage directly for backup
        localStorage.setItem('audioSensitivity', value)
      })

    // Setup OpenAI API key save button
    const saveApiKeyButton = document.getElementById('save-api-key')
    if (saveApiKeyButton) {
      saveApiKeyButton.addEventListener('click', function () {
        const apiKeyInput = document.getElementById('openai-api-key')
        const apiKey = apiKeyInput.value.trim()

        if (apiKey) {
          OPENAI_API_KEY = apiKey
          settings.openaiApiKey = apiKey

          // Save settings to local storage
          saveProgress()

          // Also save in local storage directly for backup
          localStorage.setItem('openaiApiKey', apiKey)

          // Give visual feedback
          apiKeyInput.style.backgroundColor = 'rgba(0, 255, 0, 0.1)'
          setTimeout(() => {
            apiKeyInput.style.backgroundColor = ''
          }, 1000)

          // If voice is already enabled, reinitialize with the new API key
          if (isVoiceEnabled) {
            // Reset and initialize with the new API key
            stopRecording()
            initOpenAISpeechRecognition()
          }
        } else {
          alert('Please enter a valid API key')
        }
      })
    }

    // User can press Enter to save API key too
    const apiKeyInput = document.getElementById('openai-api-key')
    if (apiKeyInput) {
      apiKeyInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault()
          document.getElementById('save-api-key').click()
        }
      })
    }
  }

  function updateButtonAppearance() {
    const currentDayData = dayData[currentDay - 1]
    const isCurrentDayComplete = currentDayData.completed

    // Disable button if day is completed
    countButton.disabled = isCurrentDayComplete

    if (isCurrentDayComplete) {
      // Replace the icon with the word "DONE"
      const plusIcon = countButton.querySelector('.plus-icon')
      if (plusIcon) {
        // Create text that says "DONE" instead of a checkmark
        plusIcon.innerHTML =
          '<text x="50" y="55" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Inconsolata, monospace" font-weight="bold" font-size="24">DONE</text>'
      }
      countButton.style.backgroundColor = '#555' // Reset to default gray when completed
    } else {
      // Restore plus icon for incomplete state
      const plusIcon = countButton.querySelector('.plus-icon')
      if (plusIcon) {
        plusIcon.innerHTML =
          '<path d="M50 15 A5 5 0 0 1 55 20 L55 45 L80 45 A5 5 0 0 1 85 50 A5 5 0 0 1 80 55 L55 55 L55 80 A5 5 0 0 1 50 85 A5 5 0 0 1 45 80 L45 55 L20 55 A5 5 0 0 1 15 50 A5 5 0 0 1 20 45 L45 45 L45 20 A5 5 0 0 1 50 15 Z" fill="white"/>'
      }

      // Set the button color to the last colored square if available, or default green
      if (currentDayData.coloredSquares.length > 0) {
        const lastColoredSquare =
          currentDayData.coloredSquares[
            currentDayData.coloredSquares.length - 1
          ]
        countButton.style.backgroundColor = lastColoredSquare.color
      } else {
        countButton.style.backgroundColor = '#4CAF50' // Default green
      }
    }
  }

  function handleCountClick() {
    // Get current day data
    const currentDayData = dayData[currentDay - 1]

    // If day already completed or already at 100, don't do anything
    if (currentDayData.completed || currentDayData.count >= 100) {
      return
    }

    // Generate a muted color for the square
    const color = generateMutedColor()

    // Add click to queue with minimal data
    clickQueue.push({
      color: color,
      dayData: currentDayData,
    })

    // Process the queue if not already processing
    if (!processingQueue) {
      processClickQueue()
    }

    // Animate button press
    animateButtonPress()
  }

  // New function to animate button press - can be reused for both manual and audio triggers
  function animateButtonPress() {
    // Apply a more pronounced scale-down animation to simulate a button press
    // First clear any existing animations
    countButton.classList.remove('pulse')

    // Get the plus icon SVG for additional animation
    const plusIcon = countButton.querySelector('.plus-icon')

    // Apply scale down effect to the button with smooth transition
    countButton.style.transform = 'translateX(-50%) scale(0.85)'
    countButton.style.transition =
      'transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)'

    // Smoothly rotate the icon with improved timing
    if (plusIcon) {
      // Use a smoother easing function for rotation
      plusIcon.style.transition =
        'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      plusIcon.style.transform = 'scale(0.85) rotate(20deg)'
    }

    // Return to normal with a smoother animation sequence
    setTimeout(() => {
      // Smooth return to normal for button
      countButton.style.transform = 'translateX(-50%) scale(1)'
      countButton.style.transition =
        'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'

      // Smooth rotation back to normal
      if (plusIcon) {
        plusIcon.style.transition =
          'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
        plusIcon.style.transform = 'scale(1) rotate(0deg)'
      }
    }, 150)
  }

  // Revised function to process the click queue
  function processClickQueue() {
    // If queue is empty, stop processing
    if (clickQueue.length === 0) {
      processingQueue = false
      return
    }

    // Mark as processing
    processingQueue = true

    // Get the next click from the queue - ONLY ONE AT A TIME
    const clickData = clickQueue.shift()

    if (!clickData) {
      processingQueue = false
      return
    }

    const { color, dayData } = clickData

    // Check if we've already reached 100 - enforce the limit
    if (dayData.count >= 100) {
      // Skip this click and process the next one
      processingQueue = false
      if (clickQueue.length > 0) {
        setTimeout(processClickQueue, 10)
      }
      return
    }

    // Calculate the next sequential number
    // This ensures we never skip numbers, even with rapid clicks
    const existingNumbers = dayData.coloredSquares.map(
      (square) => square.number
    )
    lastProcessedNumber++

    // Skip this number if it's already been used
    while (existingNumbers.includes(lastProcessedNumber)) {
      lastProcessedNumber++
    }

    // Use the calculated sequential number, but cap at 100
    const nextNumber = Math.min(lastProcessedNumber, 100)

    // Update the day data count, capped at 100
    dayData.count = Math.min(Math.max(dayData.count, nextNumber), 100)

    // Handle differently based on display mode
    if (settings.displayMode === 'big') {
      // Big mode - direct and simple approach
      handleBigModeClick(nextNumber, color)
    } else {
      // Grid mode - instant processing just like Big mode
      handleGridModeClick(dayData, color, nextNumber)
    }

    // Check completion after processing the click
    checkCompletionAndSave(dayData)

    // Continue processing queue with a slight delay to allow animations to be visible
    if (clickQueue.length > 0) {
      // Use setTimeout with a small delay to make animations visible even with rapid clicks
      setTimeout(processClickQueue, 150)
    } else {
      processingQueue = false
    }
  }

  // New function to handle Grid mode clicks - updated to accept explicit number parameter
  function handleGridModeClick(currentDayData, color, number) {
    let position

    if (settings.displayMode === 'random') {
      position = getNextRandomPosition()
    } else if (settings.displayMode === 'sequential') {
      position = number - 1 // Position is 0-indexed
    }

    // Update the button color to match the latest square - match Big mode behavior
    countButton.style.backgroundColor = color

    // Add a pop-in animation to the square
    const squares = document.querySelectorAll('.square')
    if (position < squares.length) {
      const square = squares[position]

      // First set initial state for animation
      square.style.backgroundColor = color
      square.textContent = number
      square.classList.add('colored')

      // Set initial state for stronger pop-in animation
      square.style.opacity = '0'
      square.style.transform = 'scale(0)'

      // Force reflow to ensure animation plays
      void square.offsetWidth

      // Use custom animation with more dramatic effect
      square.style.transition =
        'transform 0.4s cubic-bezier(0.17, 0.89, 0.32, 1.49), opacity 0.4s ease'
      square.style.transform = 'scale(1.1)'
      square.style.opacity = '1'

      // Remove the scaling after the animation completes
      setTimeout(() => {
        square.style.transform = 'scale(1)'
      }, 350)
    }

    // Get current day data and add the square
    const squareData = {
      position: position,
      color: color,
      number: number,
    }

    // Add the square data
    currentDayData.coloredSquares.push(squareData)

    // Update the count if needed
    if (currentDayData.count < number) {
      currentDayData.count = number
    }
  }

  function getAvailablePositions() {
    const squares = document.querySelectorAll('.square')
    const currentDayData = dayData[currentDay - 1]
    const usedPositions = currentDayData.coloredSquares.map(
      (square) => square.position
    )

    // Get all positions that haven't been used yet
    const availablePositions = []
    for (let i = 0; i < squares.length; i++) {
      if (!usedPositions.includes(i)) {
        availablePositions.push(i)
      }
    }

    return availablePositions
  }

  function getNextRandomPosition() {
    // Always get fresh available positions to ensure numbers never overlap
    const availablePositions = getAvailablePositions()

    if (availablePositions.length === 0) {
      // Fallback if no positions available
      return 0
    }

    // Choose a random position from available positions
    const randomIndex = Math.floor(Math.random() * availablePositions.length)
    return availablePositions[randomIndex]
  }

  function showCongratulations() {
    // Create overlay
    const overlay = document.createElement('div')
    overlay.classList.add('overlay')

    // Create congrats message
    const congratsContainer = document.createElement('div')
    congratsContainer.classList.add('congrats-container')

    const congratsHeading = document.createElement('h2')
    congratsHeading.textContent = 'Congratulations!'

    const congratsMessage = document.createElement('p')
    congratsMessage.textContent =
      'You have successfully completed the 100 Times Challenge for all 7 days!'

    // Add the user's motivation text if available
    if (userMotivation && userMotivation.trim() !== '') {
      const motivationMessage = document.createElement('p')
      motivationMessage.classList.add('motivation-highlight')

      // Format the motivation text with proper quotes
      const formattedMotivation = `"${userMotivation.replace(/^"|"$/g, '')}"`
      motivationMessage.textContent = `You did it! ${formattedMotivation}`

      // Add a pop-in animation to the motivation text
      motivationMessage.style.opacity = '0'
      motivationMessage.style.transform = 'scale(0.5)'

      // Append motivation message
      congratsContainer.appendChild(motivationMessage)

      // Trigger animation after a slight delay
      setTimeout(() => {
        motivationMessage.style.transition =
          'all 0.6s cubic-bezier(0.17, 0.89, 0.32, 1.49)'
        motivationMessage.style.opacity = '1'
        motivationMessage.style.transform = 'scale(1)'
      }, 300)
    }

    // Create a confetti effect
    const confettiContainer = document.createElement('div')
    confettiContainer.classList.add('confetti-container')

    // Add 50 confetti pieces
    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div')
      confetti.classList.add('confetti')
      confetti.style.left = `${Math.random() * 100}%`
      confetti.style.animationDelay = `${Math.random() * 3}s`
      confetti.style.backgroundColor = generateMutedColor()
      confettiContainer.appendChild(confetti)
    }

    // Create reset button
    const resetButton = document.createElement('button')
    resetButton.textContent = 'Start New Challenge'
    resetButton.classList.add('reset-button')
    resetButton.addEventListener('click', () => {
      // Save the current display mode settings before resetting
      const currentSettings = {
        darkMode: settings.darkMode,
        displayMode: settings.displayMode,
      }

      // Remove all data from localStorage
      localStorage.removeItem(STORAGE_KEY)

      // Create new data with preserved settings
      const newData = {
        dayData: [],
        currentDay: 1,
        userMotivation: '',
        settings: currentSettings,
      }

      // Save the new data with preserved settings
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newData))

      // Reload the page to apply changes
      location.reload()
    })

    // Append elements
    congratsContainer.appendChild(congratsHeading)
    congratsContainer.appendChild(congratsMessage)
    congratsContainer.appendChild(resetButton)

    overlay.appendChild(confettiContainer)
    overlay.appendChild(congratsContainer)
    document.body.appendChild(overlay)
  }

  function showDayCompletionMessage() {
    // Create overlay
    const overlay = document.createElement('div')
    overlay.classList.add('overlay')
    overlay.style.zIndex = '1000'

    // Create congrats message
    const congratsContainer = document.createElement('div')
    congratsContainer.classList.add('congrats-container')
    congratsContainer.classList.add('day-completion')

    const congratsHeading = document.createElement('h2')
    congratsHeading.textContent = `Day ${currentDay} Complete!`

    const congratsMessage = document.createElement('p')
    congratsMessage.textContent = 'You have reached 100 times for today!'

    // Add the user's motivation text if available
    if (userMotivation && userMotivation.trim() !== '') {
      const motivationMessage = document.createElement('p')
      motivationMessage.classList.add('motivation-highlight')

      // Format the motivation text with proper quotes
      const formattedMotivation = `"${userMotivation.replace(/^"|"$/g, '')}"`
      motivationMessage.textContent = formattedMotivation

      // Add a pop-in animation to the motivation text
      motivationMessage.style.opacity = '0'
      motivationMessage.style.transform = 'scale(0.5)'

      // Append motivation message
      congratsContainer.appendChild(motivationMessage)

      // Trigger animation after a slight delay
      setTimeout(() => {
        motivationMessage.style.transition =
          'all 0.6s cubic-bezier(0.17, 0.89, 0.32, 1.49)'
        motivationMessage.style.opacity = '1'
        motivationMessage.style.transform = 'scale(1)'
      }, 300)
    }

    // Create a mini confetti effect
    const confettiContainer = document.createElement('div')
    confettiContainer.classList.add('confetti-container')

    // Add 30 confetti pieces (fewer than final completion)
    for (let i = 0; i < 30; i++) {
      const confetti = document.createElement('div')
      confetti.classList.add('confetti')
      confetti.style.left = `${Math.random() * 100}%`
      confetti.style.animationDelay = `${Math.random() * 2}s`
      confetti.style.backgroundColor = generateMutedColor()
      confettiContainer.appendChild(confetti)
    }

    // Create continue button
    const continueButton = document.createElement('button')
    continueButton.textContent = 'Continue to Day ' + (currentDay + 1)
    continueButton.classList.add('continue-button')

    // Check if we're on the last day
    if (currentDay >= 7) {
      continueButton.textContent = 'Continue'
    }

    continueButton.addEventListener('click', () => {
      // Remove the overlay
      document.body.removeChild(overlay)
      // Then move to the next day
      moveToNextDay()
      // Update UI to reflect the new day
      updateUI()
    })

    // Append elements
    congratsContainer.appendChild(congratsHeading)
    congratsContainer.appendChild(congratsMessage)
    congratsContainer.appendChild(continueButton)

    overlay.appendChild(confettiContainer)
    overlay.appendChild(congratsContainer)
    document.body.appendChild(overlay)

    // Auto-dismiss after 5 seconds if user doesn't click continue
    setTimeout(() => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay)
        moveToNextDay()
        updateUI()
      }
    }, 5000)
  }

  function getNextAvailableDay() {
    // Find the next incomplete day
    for (let i = 0; i < dayData.length; i++) {
      if (!dayData[i].completed) {
        return i + 1 // Convert to 1-based index
      }
    }
    // If all days are completed, return the last day
    return dayData.length
  }

  function moveToNextDay() {
    // Find the next incomplete day
    const nextDay = getNextAvailableDay()

    // If we found a next day, switch to it
    if (nextDay > 0) {
      currentDay = nextDay

      // Ensure the day data is properly initialized for a fresh start
      const nextDayData = dayData[currentDay - 1]

      // Reset lastProcessedNumber to match the current count
      // This ensures we start counting from the right place
      lastProcessedNumber = nextDayData.count

      // If this day hasn't been started yet (count is 0)
      if (nextDayData.count === 0) {
        // Make sure coloredSquares is initialized as an empty array
        nextDayData.coloredSquares = []
      }
    }
  }

  function saveProgress() {
    // Already handled via the input event listener
    // No need to update userMotivation here to avoid conflicts

    // Ensure all data is properly ordered and consistent before saving
    dayData.forEach((day) => {
      if (day.coloredSquares.length > 0) {
        // Sort by number for consistency
        day.coloredSquares.sort((a, b) => a.number - b.number)

        // Make sure count reflects the highest number
        const highestNumber =
          day.coloredSquares[day.coloredSquares.length - 1].number
        if (day.count < highestNumber) {
          day.count = highestNumber
        }
      }
    })

    // Save to local storage
    saveDataToLocalStorage()
  }

  function applyDarkMode() {
    if (settings.darkMode) {
      document.body.classList.add('dark-mode')
    } else {
      document.body.classList.remove('dark-mode')
    }
  }

  function checkCompletionAndSave(currentDayData) {
    // Check if we reached 100 for this day, mark as completed if so
    if (currentDayData.count >= 100) {
      // Only show completion message if this day wasn't already completed
      const wasAlreadyCompleted = currentDayData.completed
      currentDayData.completed = true

      // Check if all 7 days are completed
      const allDaysCompleted = dayData.every((day) => day.completed)

      if (allDaysCompleted) {
        // Show the final congratulations if all days are done
        showCongratulations()
      } else if (!wasAlreadyCompleted) {
        // Show day completion message and move to next day
        // only if we just completed this day now
        showDayCompletionMessage()
      }
    }

    // Save progress to local storage
    saveProgress()
  }

  // Function to create the dots grid for big number display
  function createDotsGrid() {
    const dotsGrid = document.createElement('div')
    dotsGrid.className = 'dots-grid'
    dotsGrid.id = 'dots-grid'

    // Create 10x10 grid (100 dots)
    for (let i = 0; i < 100; i++) {
      const dot = document.createElement('div')
      dot.className = 'dot'
      dot.dataset.index = i
      dotsGrid.appendChild(dot)
    }

    return dotsGrid
  }

  // Function to update dots based on current number
  function updateDots(number) {
    const dots = document.querySelectorAll('.dot')

    if (dots.length === 0) {
      // If dots aren't found, the grid might not be created yet
      return
    }

    // Reset all dots to inactive
    dots.forEach((dot) => {
      dot.classList.remove('active')
    })

    // Activate dots up to the current number
    for (let i = 0; i < number; i++) {
      if (dots[i]) {
        dots[i].classList.add('active')
      }
    }
  }

  // Completely rewritten function for Big mode
  function handleBigModeClick(number, color) {
    // Update the button color
    countButton.style.backgroundColor = color

    // Get the big number display container
    const bigNumberDisplay = document.querySelector('.big-number-display')

    // First, completely remove any existing content
    bigNumberDisplay.innerHTML = ''

    // Create the dots grid
    const dotsGrid = createDotsGrid()
    bigNumberDisplay.appendChild(dotsGrid)

    // Create a new element for the number
    const newNumber = document.createElement('div')
    newNumber.style.color = color
    newNumber.style.fontSize = 'inherit'
    newNumber.style.display = 'flex'
    newNumber.style.justifyContent = 'center'
    newNumber.style.alignItems = 'center'
    newNumber.style.width = '100%'
    newNumber.style.height = '100%'
    newNumber.style.position = 'relative'
    newNumber.style.zIndex = '1'
    newNumber.textContent = number

    // Set initial state for animation
    newNumber.style.opacity = '0'
    newNumber.style.transform = 'scale(0)'

    // Add the new number to the display
    bigNumberDisplay.appendChild(newNumber)

    // Force reflow
    void newNumber.offsetWidth

    // Apply animation
    newNumber.style.transition =
      'transform 0.4s cubic-bezier(0.17, 0.89, 0.32, 1.49), opacity 0.4s ease'
    newNumber.style.transform = 'scale(1.1)'
    newNumber.style.opacity = '1'

    // Remove the scaling after the animation completes
    setTimeout(() => {
      newNumber.style.transform = 'scale(1)'
    }, 350)

    // Apply a pulse animation to the entire counter for extra feedback
    bigNumberDisplay.style.transition = 'transform 0.3s ease'
    bigNumberDisplay.style.transform = 'scale(1.05)'
    setTimeout(() => {
      bigNumberDisplay.style.transform = 'scale(1)'
    }, 300)

    // Update the dots grid based on the current number
    updateDots(number)

    // Add this square to colored squares with a position for data consistency
    const position = number - 1
    const squareData = {
      number: number,
      color: color,
      position: position,
    }

    // Get current day data and add the square
    const currentDayData = dayData[currentDay - 1]
    currentDayData.coloredSquares.push(squareData)
  }

  // Function to handle count clicks triggered by audio without animation conflicts
  function handleCountClickFromAudio() {
    // ONLY process if speech recognition has triggered this function
    // This function should ONLY be called from the processTranscript function
    // after proper speech recognition has verified an exact match

    // Get current day data
    const currentDayData = dayData[currentDay - 1]

    // If day already completed or already at 100, don't do anything
    if (currentDayData.completed || currentDayData.count >= 100) {
      return
    }

    // Generate a muted color for the square
    const color = generateMutedColor()

    // Add click to queue with minimal data
    clickQueue.push({
      color: color,
      dayData: currentDayData,
    })

    // Process the queue if not already processing
    if (!processingQueue) {
      processClickQueue()
    }

    // Use the same animation as manual button press
    animateButtonPress()
  }

  // Initialize voice recognition with better handling for abort errors
  function initVoiceRecognition() {
    if (
      !('webkitSpeechRecognition' in window) &&
      !('SpeechRecognition' in window)
    ) {
      console.log('Speech recognition not supported')
      return false
    }

    // Get transcript display element
    const transcriptEl = document.getElementById('speech-transcript')
    const transcriptContainer = document.getElementById(
      'speech-transcript-container'
    )

    if (transcriptContainer) {
      transcriptContainer.style.display = 'block'
    }

    // Clean up any existing recognition instance first
    if (recognition) {
      try {
        // Remove all event handlers before stopping
        recognition.onresult = null
        recognition.onerror = null
        recognition.onend = null
        recognition.stop()
      } catch (e) {
        // Ignore cleanup errors
        console.log('Cleanup error:', e)
      }
      recognition = null
    }

    // Create a fresh recognition instance
    recognition = new (window.SpeechRecognition ||
      window.webkitSpeechRecognition)()
    recognition.continuous = false // Changed to false to avoid buffering issues
    recognition.interimResults = true // Enable interim results for more responsive updates
    recognition.maxAlternatives = 1
    recognition.lang = 'en-US'

    // Handle recognition results - using both interim and final results
    recognition.onresult = (event) => {
      const last = event.results.length - 1
      const result = event.results[last]
      const transcript = result[0].transcript.trim().toLowerCase()
      const isFinal = result.isFinal

      console.log(`Speech: "${transcript}" (${isFinal ? 'final' : 'interim'})`)

      // Always update display for both interim and final results
      const transcriptEl = document.getElementById('speech-transcript')
      if (transcriptEl) {
        // Clear text first and show that speech is being detected
        if (
          transcriptEl.textContent === 'Listening...' ||
          !transcriptEl.textContent.includes('"')
        ) {
          transcriptEl.textContent = 'Heard: "'
        }

        // Update with the latest transcript (clear previous text)
        transcriptEl.textContent = 'Heard: "' + transcript + '"'
        transcriptEl.classList.add('speech-update')

        // Remove the animation class after it completes
        setTimeout(() => {
          transcriptEl.classList.remove('speech-update')
        }, 1000)
      }

      // Only process for FINAL results to avoid duplicate counting
      if (isFinal) {
        // Process the transcript
        processTranscript(transcript)
      }
    }

    // Handle end event - automatically restart if still listening
    recognition.onend = () => {
      isRecognitionActive = false
      console.log('Speech recognition session ended')

      // Restart if still enabled
      if (isVoiceEnabled) {
        console.log('Restarting speech recognition')
        setTimeout(() => {
          startWebSpeechRecognition()
        }, 50)
      }
    }

    // Error handling with better recovery
    recognition.onerror = (event) => {
      console.log('Speech recognition error:', event.error)
      isRecognitionActive = false

      // Hide errors for normal operation errors
      if (event.error === 'aborted' || event.error === 'no-speech') {
        console.log('Normal recognition error, will restart if enabled')
      } else {
        // Only show user errors that are actual problems
        const transcriptEl = document.getElementById('speech-transcript')
        if (transcriptEl) {
          transcriptEl.textContent = 'Error: ' + event.error
        }
      }

      // Restart with delay if voice is still enabled
      if (isVoiceEnabled) {
        setTimeout(() => {
          startWebSpeechRecognition()
        }, 300)
      }
    }

    console.log('Speech recognition initialized successfully')

    return true
  }

  // Start Web Speech API recognition safely
  function startWebSpeechRecognition() {
    // Only start if not already active and voice is enabled
    if (recognition && !isRecognitionActive && isVoiceEnabled) {
      try {
        recognition.start()
        isRecognitionActive = true
        console.log('Speech recognition started')

        // Update UI to show we're listening
        const transcriptEl = document.getElementById('speech-transcript')
        if (transcriptEl) {
          transcriptEl.textContent = 'Listening...'
        }
      } catch (error) {
        console.error('Error starting recognition:', error)

        // If already started, just mark as active
        if (error.message.includes('already started')) {
          isRecognitionActive = true
        } else {
          // For other errors, reset and try again later
          recognition = null
          setTimeout(() => {
            if (isVoiceEnabled) {
              initVoiceRecognition()
              startWebSpeechRecognition()
            }
          }, 300)
        }
      }
    }
  }

  // Toggle voice recognition
  function toggleVoiceRecognition() {
    isVoiceEnabled = !isVoiceEnabled

    // Update UI
    const voiceToggle = document.getElementById('voice-toggle')
    const transcriptEl = document.getElementById('speech-transcript')
    const transcriptContainer = document.getElementById(
      'speech-transcript-container'
    )
    const audioVisualizer = document.getElementById('audio-visualizer')

    if (voiceToggle) {
      voiceToggle.classList.toggle('active', isVoiceEnabled)
    }

    if (transcriptContainer) {
      transcriptContainer.classList.toggle('speech-active', isVoiceEnabled)
    }

    // Save preference
    localStorage.setItem('voice-enabled', isVoiceEnabled)

    if (isVoiceEnabled) {
      // Share the same microphone initialization for both visualizer and recognition
      requestMicrophoneAccess()
        .then((stream) => {
          console.log(
            'Microphone access successful for both recognition and visualizer'
          )

          // Activate the audio visualizer
          if (audioVisualizer) {
            audioVisualizer.classList.add('active')
            const bars = audioVisualizer.querySelectorAll('.bar')

            // Make sure we have bars to visualize
            if (bars.length === 0) {
              // Create bars if needed
              const numBars = 10
              for (let i = 0; i < numBars; i++) {
                const bar = document.createElement('div')
                bar.className = 'bar'
                audioVisualizer.appendChild(bar)
              }
            }

            // Start visualization
            const updatedBars = audioVisualizer.querySelectorAll('.bar')
            if (updatedBars.length > 0) {
              visualizeAudio(updatedBars)
            }
          }

          // Start OpenAI voice recognition if API key is available
          if (OPENAI_API_KEY) {
            console.log('Starting OpenAI voice recognition')
            try {
              startRecording()
            } catch (e) {
              console.error('Error starting OpenAI recording:', e)
              // Fall back to Web Speech API if OpenAI fails
              initVoiceRecognition()
              startWebSpeechRecognition()
            }
          } else {
            console.log('No OpenAI API key, using Web Speech API')
            initVoiceRecognition()
            startWebSpeechRecognition()
          }
        })
        .catch((error) => {
          console.error('Microphone access failed:', error)

          // Show error in UI
          if (transcriptEl) {
            transcriptEl.textContent =
              'Microphone access denied. Please check permissions.'
          }

          // Try using Web Speech API anyway as a fallback
          if (!OPENAI_API_KEY) {
            initVoiceRecognition()
            startWebSpeechRecognition()
          }
        })
    } else {
      // Voice recognition disabled
      if (audioVisualizer) {
        audioVisualizer.classList.remove('active')
      }

      // Stop OpenAI recording if active
      if (isRecording) {
        stopRecording()
      }

      // Stop Web Speech API if active
      if (recognition && isRecognitionActive) {
        try {
          recognition.stop()
        } catch (e) {
          // Ignore
        }
        isRecognitionActive = false
      }

      // Clean up audio resources
      cleanupAudioResources()

      // Clear transcript
      if (transcriptEl) {
        transcriptEl.textContent = 'Voice recognition disabled'
      }
    }
  }

  // Function to reset and reinitialize audio system
  function resetAudioSystem() {
    // Reset audio state tracking variables
    lastAudioState = false
    fullTranscript = ''
    lastPhraseDetectionTime = 0

    // Cancel any animation frame
    if (animationId) {
      cancelAnimationFrame(animationId)
      animationId = null
    }

    // Disconnect microphone
    if (microphone) {
      microphone.disconnect()
      microphone = null
    }

    // Stop all tracks in the microphone stream
    if (microphoneStream) {
      microphoneStream.getTracks().forEach((track) => track.stop())
      microphoneStream = null
    }

    // Close the audio context
    if (audioContext) {
      audioContext.close().then(() => {
        console.log('AudioContext closed')
        audioContext = null
        analyser = null
      })
    }

    audioInitialized = false
  }

  // Function to fetch the latest commit hash from GitHub
  function fetchLatestCommitHash() {
    fetch('https://api.github.com/repos/john-bacic/intention/commits/master')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok')
        }
        return response.json()
      })
      .then((data) => {
        const commitHash = data.sha.substring(0, 7) // Get short hash
        const versionIndicator = document.getElementById('version-indicator')
        if (versionIndicator) {
          versionIndicator.textContent = commitHash
        }
        console.log('Latest commit hash:', commitHash)
      })
      .catch((error) => {
        console.error('Error fetching commit hash:', error)
      })
  }

  // Function to apply settings to UI
  function applySettingsToUI() {
    // Apply audio sensitivity setting - explicitly set to 1 if not defined
    if (typeof settings.audioSensitivity === 'undefined') {
      settings.audioSensitivity = 1
    }
    audioSensitivity = settings.audioSensitivity

    // Set the sensitivity slider value
    document.getElementById('audio-sensitivity').value = audioSensitivity
    document.getElementById('sensitivity-value').textContent = audioSensitivity

    // Apply OpenAI API key if saved
    if (settings.openaiApiKey) {
      OPENAI_API_KEY = settings.openaiApiKey
      document.getElementById('openai-api-key').value = settings.openaiApiKey
    }

    // Apply voice recognition setting if enabled
    if (settings.isVoiceEnabled) {
      toggleVoiceRecognition(true)
    }

    // Apply dark mode if enabled
    if (settings.darkMode) {
      document.body.classList.add('dark-mode')
    } else {
      document.body.classList.remove('dark-mode')
    }

    // Apply display mode
    if (settings.displayMode) {
      // Select the correct radio button
      document.querySelector(
        `input[name="display-mode"][value="${settings.displayMode}"]`
      ).checked = true

      // Show correct display based on mode
      setDisplayMode(settings.displayMode)
    }
  }

  // Event handler for sensitivity slider change
  function handleSensitivityChange(event) {
    audioSensitivity = parseInt(event.target.value)
    document.getElementById('sensitivity-value').textContent = audioSensitivity

    // Save the new sensitivity setting
    settings.audioSensitivity = audioSensitivity
    saveSettings()

    console.log('Audio sensitivity set to:', audioSensitivity)
  }

  // Function to increment counter and update UI
  function incrementCounter() {
    // Get current day data
    const currentDayData = dayData[currentDay - 1]

    // If day already completed, don't increment
    if (currentDayData.completed || currentDayData.count >= 100) {
      return
    }

    // Increment count and save
    currentDayData.count++
    saveDayData()

    // Update count display and other UI elements
    updateCountDisplay()

    // Automatically add one more dot for this count
    const color = generateMutedColor()
    handleBigModeClick(currentDayData.count, color)

    // Check if we've reached 100
    if (currentDayData.count === 100) {
      completeDay()
    }
  }

  // Initialize OpenAI Whisper API speech recognition
  async function initOpenAISpeechRecognition() {
    if (!OPENAI_API_KEY) {
      const transcriptEl = document.getElementById('speech-transcript')
      if (transcriptEl) {
        transcriptEl.textContent = 'Please set your OpenAI API key in settings'
      }
      return false
    }

    // Clean up any existing recording session
    stopRecording()

    // Get transcript display element
    const transcriptEl = document.getElementById('speech-transcript')
    const transcriptContainer = document.getElementById(
      'speech-transcript-container'
    )

    if (transcriptEl) {
      transcriptEl.textContent = 'Starting speech recognition...'
      transcriptContainer.classList.add('speech-active')
    }

    // Start recording
    startRecording()

    return true
  }

  // Start recording audio for OpenAI speech recognition
  async function startRecording() {
    try {
      if (isRecording) {
        console.log('Already recording, stopping previous session')
        stopRecording()
      }

      console.log('Starting audio recording for OpenAI processing')

      try {
        // Use our improved microphone access approach
        const stream = await requestMicrophoneAccess()

        // Determine supported MIME type
        let mimeType = 'audio/webm'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4'
          console.log('Switching to audio/mp4 format as webm is not supported')
        }

        // Create media recorder with explicit MIME type
        mediaRecorder = new MediaRecorder(stream, { mimeType })
        audioChunks = []
        isRecording = true

        // Add recording active indicator
        const voiceToggle = document.getElementById('voice-toggle')
        if (voiceToggle) {
          voiceToggle.classList.add('recording-active')
        }

        // Event listener for when data is available
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data)
          }
        }

        // Event listener for when recording stops
        mediaRecorder.onstop = () => {
          processRecording()
        }

        // Start recording
        mediaRecorder.start()
        console.log('Recording started with MIME type:', mediaRecorder.mimeType)

        // Set up automatic processing every few seconds
        setTimeout(() => {
          if (
            isRecording &&
            mediaRecorder &&
            mediaRecorder.state === 'recording'
          ) {
            // Stop current recording to process it
            mediaRecorder.stop()

            // If still enabled, start a new recording session after processing
            if (isVoiceEnabled) {
              setTimeout(() => {
                if (isVoiceEnabled && !isRecording) {
                  startRecording()
                }
              }, 500)
            }
          }
        }, RECORDING_INTERVAL)
      } catch (error) {
        console.error('Error accessing microphone:', error)

        // Remove recording indicator
        const voiceToggle = document.getElementById('voice-toggle')
        if (voiceToggle) {
          voiceToggle.classList.remove('recording-active')
        }

        // Fall back to Web Speech API
        console.log('Falling back to Web Speech API due to microphone error')
        initVoiceRecognition()
        if (recognition && !isRecognitionActive) {
          try {
            recognition.start()
            isRecognitionActive = true
          } catch (e) {
            console.error('Error starting Web Speech API:', e)
          }
        }

        isRecording = false
      }
    } catch (error) {
      console.error('Error starting recording:', error)
      isRecording = false
    }
  }

  // Stop recording
  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
    }

    if (mediaRecorder) {
      // Clean up media recorder
      try {
        const tracks = mediaRecorder.stream.getTracks()
        tracks.forEach((track) => track.stop())
      } catch (e) {
        console.error('Error stopping tracks:', e)
      }

      mediaRecorder = null
    }

    // Remove recording indicator
    const voiceToggle = document.getElementById('voice-toggle')
    if (voiceToggle) {
      voiceToggle.classList.remove('recording-active')
    }

    isRecording = false

    // Update UI
    const transcriptEl = document.getElementById('speech-transcript')
    const transcriptContainer = document.getElementById(
      'speech-transcript-container'
    )

    if (transcriptEl && !isVoiceEnabled) {
      transcriptEl.textContent = 'Voice recognition is disabled'
      transcriptContainer.classList.remove('speech-active')
    }
  }

  // Process the recorded audio and send to OpenAI for transcription
  async function processRecording() {
    if (audioChunks.length === 0 || isProcessingAudio) return

    isProcessingAudio = true

    // Get transcript display element
    const transcriptEl = document.getElementById('speech-transcript')
    if (transcriptEl) {
      transcriptEl.textContent = 'Processing audio...'
    }

    try {
      // Get the MIME type from the recorder
      const mimeType = mediaRecorder ? mediaRecorder.mimeType : 'audio/webm'
      console.log('Audio MIME type:', mimeType)

      // Create audio blob with explicit MIME type
      const audioBlob = new Blob(audioChunks, { type: mimeType })

      // Clear audio chunks for the next recording
      audioChunks = []

      // Log blob details for debugging
      console.log(
        'Audio blob size:',
        audioBlob.size,
        'bytes, type:',
        audioBlob.type
      )

      // Skip processing if blob is too small (likely just background noise)
      if (audioBlob.size < 1000) {
        console.log('Audio too short, skipping processing')
        isProcessingAudio = false
        if (transcriptEl) {
          transcriptEl.textContent = 'Listening...'
        }
        return
      }

      // Create form data for the API request
      const formData = new FormData()

      // Get the file extension based on MIME type
      const fileExtension = mimeType.includes('mp3') ? 'mp3' : 'webm'

      // Create a File object with appropriate extension and type
      const audioFile = new File([audioBlob], `recording.${fileExtension}`, {
        type: mimeType,
        lastModified: Date.now(),
      })

      // Add the audio file to FormData
      formData.append('file', audioFile)
      formData.append('model', 'whisper-1')
      formData.append('response_format', 'json')

      console.log(
        `Sending request to OpenAI API with file: recording.${fileExtension} (${audioFile.size} bytes)`
      )

      // Make the API request
      const response = await fetch(
        'https://api.openai.com/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: formData,
        }
      )

      // Get response text for debugging
      const responseText = await response.text()
      console.log('OpenAI API raw response:', responseText)

      // Handle error responses
      if (!response.ok) {
        console.error('OpenAI API error:', response.status, response.statusText)
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText}`
        )
      }

      // Parse the response JSON
      let data
      try {
        data = JSON.parse(responseText)
        console.log('Parsed OpenAI response:', data)
      } catch (e) {
        console.error('Error parsing response as JSON:', e)
        throw new Error('Invalid JSON response from OpenAI')
      }

      // Extract the transcript
      const transcript = data.text ? data.text.trim() : ''

      // Update the transcript display
      if (transcriptEl && transcript) {
        transcriptEl.textContent = 'Heard: "' + transcript + '"'
        transcriptEl.classList.add('speech-update')

        // Remove the animation class after it completes
        setTimeout(() => {
          transcriptEl.classList.remove('speech-update')
        }, 1000)
      } else if (transcriptEl) {
        transcriptEl.textContent = 'No speech detected'
      }

      // Process the transcript
      if (transcript) {
        processTranscript(transcript.toLowerCase())
      }
    } catch (error) {
      console.error('Error processing audio:', error)

      if (transcriptEl) {
        transcriptEl.textContent = 'Error: ' + error.message
      }

      // Fall back to Web Speech API
      console.log('Falling back to Web Speech API')
      if (!recognition) {
        initVoiceRecognition()
      }
      if (recognition && !isRecognitionActive && isVoiceEnabled) {
        try {
          recognition.start()
          isRecognitionActive = true
        } catch (e) {
          console.error('Error starting Web Speech API:', e)
        }
      }
    } finally {
      isProcessingAudio = false
    }
  }

  // Function to visualize audio input - copied from working mic_test.html
  function visualizeAudio(bars) {
    // Cancel any existing animation
    if (visualizationFrame) {
      cancelAnimationFrame(visualizationFrame)
      visualizationFrame = null
    }

    // If analyser is not available, we can't visualize
    if (!analyser) {
      console.error('No analyzer available for visualization')
      return
    }

    // Get the audio level indicator element
    const audioLevelIndicator = document.getElementById('audio-level-indicator')
    const audioVisualizer = document.getElementById('audio-visualizer')

    // Position the audio level indicator below the visualizer if it isn't already
    if (audioLevelIndicator && audioVisualizer) {
      // If the indicator isn't directly after the visualizer, move it there
      if (audioVisualizer.nextSibling !== audioLevelIndicator) {
        audioVisualizer.parentNode.insertBefore(
          audioLevelIndicator,
          audioVisualizer.nextSibling
        )
      }
      audioLevelIndicator.style.display = 'block'
      audioLevelIndicator.style.textAlign = 'center'
      audioLevelIndicator.style.margin = '5px 0'
    }

    // Create a new array for frequency data
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    // Animation function
    function animate() {
      // Get frequency data
      analyser.getByteFrequencyData(dataArray)

      // Calculate overall audio level
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i]
      }
      const average = sum / dataArray.length

      // Update the audio level indicator with decibel value and sensitivity
      if (audioLevelIndicator) {
        // Show both the audio level and sensitivity setting
        audioLevelIndicator.textContent = `In: ${Math.round(
          average
        )} dB | Sen: ${audioSensitivity}`
        audioLevelIndicator.style.opacity = '1'
      }

      // Track audio level for speech detection
      lastAudioLevel = average

      // Keep a history of audio levels for better detection
      audioLevelHistory.push(average)
      if (audioLevelHistory.length > AUDIO_HISTORY_LENGTH) {
        audioLevelHistory.shift() // Remove oldest value
      }

      // Detect significant audio level changes that might indicate speech
      detectSpeechFromAudioLevels()

      // Update each bar
      for (let i = 0; i < bars.length; i++) {
        // Get data for this bar (map from frequency range to bar index)
        const start = Math.floor((i * dataArray.length) / bars.length)
        const end = Math.floor(((i + 1) * dataArray.length) / bars.length)

        // Calculate average frequency value for this range
        let sum = 0
        for (let j = start; j < end; j++) {
          sum += dataArray[j]
        }
        const average = sum / (end - start)

        // Apply sensitivity multiplier (1-10 scale)
        const adjusted = average * (audioSensitivity * 0.1)

        // Map to height (5px minimum, 40px maximum)
        const height = Math.max(5, Math.min(40, adjusted * 0.5))

        // Set bar height with transition for animation
        const bar = bars[i]
        bar.style.height = `${height}px`
        bar.style.transition = 'height 0.1s ease'
      }

      // Request next frame
      visualizationFrame = requestAnimationFrame(animate)
    }

    // Start the animation
    animate()
    console.log('Audio visualization started with', bars.length, 'bars')
  }

  // New function to detect speech based on audio levels
  function detectSpeechFromAudioLevels() {
    // Only proceed if speech recognition is active
    if (!isVoiceEnabled || !isRecognitionActive) {
      return
    }

    // Calculate average of recent audio levels
    const avgLevel =
      audioLevelHistory.reduce((sum, level) => sum + level, 0) /
      Math.max(1, audioLevelHistory.length)

    // Calculate audio threshold based on sensitivity (1-10 scale)
    // Higher sensitivity = lower threshold to trigger
    const baseThreshold = 30 // Baseline threshold value
    const threshold = baseThreshold - audioSensitivity * 2 // Adjust by sensitivity

    // Detect significant rise in audio level that might indicate speech
    if (lastAudioLevel > threshold && !isProcessingAudio) {
      // Clear any existing timer
      if (speechThresholdTimer) {
        clearTimeout(speechThresholdTimer)
      }

      // Mark that we're processing audio
      isProcessingAudio = true

      // Clear transcript when new speech is detected
      const transcriptEl = document.getElementById('speech-transcript')
      if (transcriptEl && transcriptEl.textContent !== 'Listening...') {
        transcriptEl.textContent = 'Listening...'
      }

      // Set a timer to restart recognition after silence is detected
      // This helps capture new phrases more reliably
      speechThresholdTimer = setTimeout(() => {
        if (isVoiceEnabled && lastAudioLevel < threshold / 2) {
          console.log('Audio level dropped, restarting recognition')
          isProcessingAudio = false

          // Restart recognition to prepare for next phrase
          if (recognition) {
            try {
              recognition.stop()
            } catch (e) {
              // Ignore errors when stopping
            }

            // Small delay before restarting
            setTimeout(() => {
              if (isVoiceEnabled) {
                startWebSpeechRecognition()
              }
            }, 100)
          }
        } else {
          isProcessingAudio = false
        }
        speechThresholdTimer = null
      }, 1000) // Wait 1 second of silence before considering speech ended
    }
  }

  // Function to process recognized speech transcript
  function processTranscript(transcript) {
    console.log('Processing transcript:', transcript)

    // Get the motivation phrase if set
    const motivationPhrase = localStorage.getItem('motivation-phrase') || ''

    // Normalize the transcript and phrase for better matching
    const normalizedTranscript = transcript.toLowerCase().trim()
    const normalizedPhrase = motivationPhrase.toLowerCase().trim()

    // Flag to track if we should trigger a count
    let shouldCount = false

    // Check for default "count" command if no motivation phrase is set
    if (
      !normalizedPhrase &&
      (normalizedTranscript.includes('count') ||
        normalizedTranscript.includes('counts') ||
        normalizedTranscript.includes('counter'))
    ) {
      shouldCount = true
      console.log('Default count command detected')
    }
    // Check if the transcript EXACTLY matches the custom motivation phrase
    else if (
      normalizedPhrase &&
      (normalizedTranscript === normalizedPhrase || // Exact match
        normalizedTranscript.includes(normalizedPhrase)) // Still allow contained matches
    ) {
      shouldCount = true
      // Log whether it was an exact match or just contained
      if (normalizedTranscript === normalizedPhrase) {
        console.log('EXACT match with custom phrase:', normalizedPhrase)
      } else {
        console.log('Custom phrase detected within speech:', normalizedPhrase)
      }
    }

    // If we should count, trigger the count action
    if (shouldCount) {
      // Use a small cooldown to prevent multiple rapid triggers
      const now = Date.now()
      const lastTriggerTime = window.lastVoiceTriggerTime || 0
      const cooldownPeriod = 1500 // 1.5 seconds cooldown

      if (now - lastTriggerTime > cooldownPeriod) {
        console.log('Voice command triggered counter increment')
        handleCountClickFromAudio()
        window.lastVoiceTriggerTime = now
      } else {
        console.log('Command ignored due to cooldown')
      }
    }
  }

  // Function to setup audio detection - returns Promise so we can await completion
  async function setupAudioDetection() {
    try {
      // Use our improved microphone access function
      const stream = await requestMicrophoneAccess()

      // Set up visualization after microphone is connected
      const bars = document.querySelectorAll('.audio-visualizer .bar')
      if (bars.length > 0) {
        visualizeAudio(bars)
        console.log('Audio visualization started with', bars.length, 'bars')
      } else {
        console.warn('No visualizer bars found in the DOM')
      }

      return true
    } catch (error) {
      console.error('Failed to setup audio detection:', error)

      // Update UI to show error
      const audioLevelIndicator = document.getElementById(
        'audio-level-indicator'
      )
      if (audioLevelIndicator) {
        audioLevelIndicator.textContent = 'Mic denied'
        audioLevelIndicator.style.color = '#ff0000'
        audioLevelIndicator.style.opacity = '1'
      }

      return false
    }
  }

  initializeApp()
})
