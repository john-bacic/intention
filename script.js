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
  // Constants
  const DAYS = 7
  const SQUARES_PER_DAY = 100
  const STORAGE_KEY = '100TimesChallenge'

  // Check if running in standalone mode (added to home screen)
  const isInStandaloneMode = () =>
    window.navigator.standalone || // iOS
    window.matchMedia('(display-mode: standalone)').matches // Android/Chrome

  // Add class to body if in standalone mode
  if (isInStandaloneMode()) {
    document.body.classList.add('standalone-mode')

    // Fix for iOS to hide the status bar
    if (window.navigator.standalone) {
      // Add empty div to push content down below status bar
      const statusBarSpacer = document.createElement('div')
      statusBarSpacer.classList.add('status-bar-spacer')
      document.body.prepend(statusBarSpacer)
    }
  }

  // DOM Elements
  const countButton = document.getElementById('count-button')
  const userSentence = document.getElementById('user-sentence')
  const squaresGrid = document.getElementById('squares-grid')
  const days = document.querySelectorAll('.day')

  // Global variables
  let currentDay = 1
  let dayData = []
  let clickQueue = []
  let processingQueue = false
  let isVoiceEnabled = false
  let recognition = null
  let audioContext = null
  let analyser = null
  let microphone = null
  let microphoneStream = null // Store the stream to properly close it
  let animationId = null
  let audioSensitivity = 3 // Default sensitivity threshold (on 1-5 scale)
  let audioTriggerActive = false // Flag to prevent double counting
  let lastAudioState = false // false = silence, true = audio detected
  let audioStateChangeTimeout = null // Timeout for audio state changes
  let fullTranscript = '' // Store the full transcript for phrase detection
  let lastPhraseDetectionTime = 0 // To prevent duplicate triggers
  let userMotivation = ''
  let settings = {
    darkMode: false,
    displayMode: 'big',
    audioSensitivity: 3,
  }
  let isAnimating = false
  let bigModeAnimationTimeout = null
  // Track the last processed number for data consistency
  let lastProcessedNumber = 0

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
      const savedData = localStorage.getItem(STORAGE_KEY)

      if (savedData) {
        try {
          const parsed = JSON.parse(savedData)
          dayData = parsed.dayData || []
          currentDay = parsed.currentDay || 1
          userMotivation = parsed.userMotivation || ''
          settings = parsed.settings || {
            darkMode: false,
            displayMode: 'big',
            audioSensitivity: 3,
          }

          // Ensure we have valid dayData
          if (!Array.isArray(dayData) || dayData.length === 0) {
            console.warn('Invalid dayData, initializing fresh data')
            initializeData()
          }

          // Ensure all day data has necessary properties
          dayData.forEach((day) => {
            // Handle case where no coloredSquares property exists
            if (!day.coloredSquares) {
              day.coloredSquares = []
            }

            // Add position to old data if missing
            day.coloredSquares.forEach((square, index) => {
              if (square.position === undefined) {
                square.position = index // Just use sequential positions for old data
              }
            })

            // Verify data consistency
            if (day.coloredSquares.length > 0) {
              // Sort by number
              day.coloredSquares.sort((a, b) => a.number - b.number)

              // Check for missing numbers
              const numbers = day.coloredSquares.map((square) => square.number)
              const maxNumber = Math.max(...numbers, 0)
              const expectedNumbers = Array.from(
                { length: maxNumber },
                (_, i) => i + 1
              )
              const missingNumbers = expectedNumbers.filter(
                (num) => !numbers.includes(num)
              )

              // If missing numbers detected, fix the data
              if (missingNumbers.length > 0) {
                console.warn(
                  `Detected ${missingNumbers.length} missing numbers in day ${day.day} data, fixing...`
                )
                for (const missingNum of missingNumbers) {
                  // Find an unused position
                  let availablePositions = []
                  for (let i = 0; i < 100; i++) {
                    if (
                      !day.coloredSquares.some(
                        (square) => square.position === i
                      )
                    ) {
                      availablePositions.push(i)
                    }
                  }

                  const position =
                    availablePositions.length > 0
                      ? availablePositions[0]
                      : missingNum - 1 // Fallback to sequential position

                  // Add the missing square
                  day.coloredSquares.push({
                    number: missingNum,
                    color: generateMutedColor(),
                    position: position,
                  })
                }

                // Re-sort after adding missing numbers
                day.coloredSquares.sort((a, b) => a.number - b.number)
              }

              // Make sure count reflects the highest number
              if (day.coloredSquares.length > 0) {
                const highestNumber =
                  day.coloredSquares[day.coloredSquares.length - 1].number
                if (day.count < highestNumber) {
                  day.count = highestNumber
                }
              }
            }
          })

          // Verify current day is valid
          if (currentDay < 1 || currentDay > 7) {
            console.warn('Invalid currentDay, resetting to 1')
            currentDay = 1
          }
        } catch (parseError) {
          console.error('Error parsing saved data:', parseError)
          initializeData()
        }
      } else {
        // No saved data, initialize fresh
        console.log('No saved data found, initializing fresh data')
        initializeData()
      }

      // Ensure we have the correct number of days
      while (dayData.length < DAYS) {
        dayData.push({
          day: dayData.length + 1,
          count: 0,
          coloredSquares: [],
          completed: false,
        })
      }

      // Initialize lastProcessedNumber based on current day's data
      if (dayData && dayData[currentDay - 1]) {
        const currentDayData = dayData[currentDay - 1]
        if (
          currentDayData.coloredSquares &&
          currentDayData.coloredSquares.length > 0
        ) {
          const numbers = currentDayData.coloredSquares.map(
            (square) => square.number
          )
          lastProcessedNumber = Math.max(...numbers, 0)
        } else {
          lastProcessedNumber = 0
        }
      }

      // Update the UI after loading data
      updateUI()

      // If it's dark mode, apply it
      if (settings.darkMode) {
        applyDarkMode()
      }

      // Update the display mode (random/sequential/big)
      const modeRadios = document.querySelectorAll('input[name="display-mode"]')
      modeRadios.forEach((radio) => {
        if (radio.value === settings.displayMode) {
          radio.checked = true
        }
      })

      // Update the user sentence display with quotes
      if (userSentence && userMotivation && userMotivation.trim() !== '') {
        userSentence.value = `"${userMotivation}"`
      }

      // Load audio sensitivity setting
      const savedSensitivity = localStorage.getItem('audioSensitivity')
      if (savedSensitivity) {
        audioSensitivity = parseInt(savedSensitivity)
        document.getElementById('audio-sensitivity').value = audioSensitivity
      }
    } catch (error) {
      // Catch any other errors that might occur
      console.error('Error in loadProgress:', error)

      // Recover from error by initializing fresh data
      console.log('Recovering from error by initializing fresh data')
      dayData = []
      initializeData()
      currentDay = 1
      userMotivation = ''
      settings = { darkMode: false, displayMode: 'big', audioSensitivity: 3 }

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
          const lastColor =
            currentDayData.coloredSquares[
              currentDayData.coloredSquares.length - 1
            ].color
          bigNumberDisplay.style.color = lastColor
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
    const textareaWrapper = document.querySelector('.textarea-wrapper')
    const clearButton = document.getElementById('clear-button')

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

      // Show/hide clear button on focus/blur
      userSentenceTextarea.addEventListener('focus', () => {
        if (textareaWrapper) {
          textareaWrapper.classList.add('focused')
        }
      })

      userSentenceTextarea.addEventListener('blur', (e) => {
        // Don't hide if clicking on clear button
        if (e.relatedTarget !== clearButton) {
          if (textareaWrapper) {
            textareaWrapper.classList.remove('focused')
          }
        }
      })

      // Initial resize
      autoResize()
    }

    // Clear button functionality
    if (clearButton) {
      clearButton.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        // Clear the textarea
        userSentenceTextarea.value = ''
        userMotivation = ''

        // Trigger auto-resize
        if (userSentenceTextarea) {
          userSentenceTextarea.style.height = 'auto'
          userSentenceTextarea.style.height =
            Math.max(44, userSentenceTextarea.scrollHeight) + 'px'
        }

        // Save the change
        saveProgress()

        // Refocus the textarea
        userSentenceTextarea.focus()
      })

      // Prevent blur when clicking clear button
      clearButton.addEventListener('mousedown', (e) => {
        e.preventDefault()
      })
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
      })

      voiceToggle.addEventListener('touchstart', function (e) {
        e.preventDefault()
        toggleVoiceRecognition()
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
        // Save the current display mode settings and user motivation before resetting
        const currentSettings = {
          darkMode: settings.darkMode,
          displayMode: settings.displayMode,
        }

        // Remove all data from localStorage
        localStorage.removeItem(STORAGE_KEY)

        // Create new data with preserved settings and motivation
        const newData = {
          dayData: [],
          currentDay: 1,
          userMotivation: userMotivation, // Preserve the current motivation
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
        // Save the current display mode settings and user motivation before resetting
        const currentSettings = {
          darkMode: settings.darkMode,
          displayMode: settings.displayMode,
        }

        // Remove all data from localStorage
        localStorage.removeItem(STORAGE_KEY)

        // Create new data with preserved settings and motivation
        const newData = {
          dayData: [],
          currentDay: 1,
          userMotivation: userMotivation, // Preserve the current motivation
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
        const isDayCompleted = dayData[dayIndex].completed
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
        const isDayCompleted = dayData[dayIndex].completed
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

              // No dots to update when count is 0
            }
          } else {
            // Show grid for other modes
            squaresGrid.style.display = 'grid'
            bigNumberDisplay.style.display = 'none'

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

      // Enhanced mobile touch support
      sensitivitySlider.addEventListener(
        'touchstart',
        function (e) {
          this.classList.add('touch-active')
          // Don't prevent default - let the slider handle touch events naturally
        },
        { passive: true }
      )

      sensitivitySlider.addEventListener(
        'touchmove',
        function (e) {
          // Don't prevent default - let the slider handle dragging naturally
        },
        { passive: true }
      )

      sensitivitySlider.addEventListener('touchend', function (e) {
        this.classList.remove('touch-active')
        // Small delay to ensure value is updated
        setTimeout(() => {
          handleSensitivityChange()
        }, 50)
      })

      // Mouse events for desktop
      sensitivitySlider.addEventListener('mousedown', function () {
        this.classList.add('touch-active')
      })

      sensitivitySlider.addEventListener('mouseup', function () {
        this.classList.remove('touch-active')
      })

      // Ensure value updates on all interaction types
      sensitivitySlider.addEventListener('change', handleSensitivityChange)
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

  // Initialize voice recognition
  function initVoiceRecognition() {
    if (
      !('webkitSpeechRecognition' in window) &&
      !('SpeechRecognition' in window)
    ) {
      console.log('Speech recognition not supported')
      return false
    }

    // Initialize speech recognition
    recognition = new (window.SpeechRecognition ||
      window.webkitSpeechRecognition)()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    let pauseTimer = null
    let potentialTriggerPhrase = ''
    let isSpeaking = false
    const PAUSE_THRESHOLD = 1500 // milliseconds to wait after speech stops before processing

    // Get transcript display element
    const transcriptEl = document.getElementById('speech-transcript')
    const transcriptContainer = document.getElementById(
      'speech-transcript-container'
    )

    // Speech recognition start event
    recognition.onstart = function () {
      console.log('Voice recognition started')
      isRecognitionActive = true
      if (transcriptEl) {
        transcriptEl.textContent = 'Listening...'
        transcriptContainer.classList.add('speech-active')
      }
    }

    // Speech recognition result event
    recognition.onresult = function (event) {
      isSpeaking = true

      // Clear any existing pause timer
      if (pauseTimer) {
        clearTimeout(pauseTimer)
        pauseTimer = null
      }

      let transcript = ''
      let isFinal = false
      let confidence = 0

      // Get the latest results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
        confidence = event.results[i][0].confidence // Store confidence level
        if (event.results[i].isFinal) {
          isFinal = true
        }
      }

      // Convert to lowercase for easier matching
      transcript = transcript.toLowerCase().trim()

      // Filter out noise at high sensitivity levels
      if (
        audioSensitivity >= 4 &&
        (confidence < 0.3 || transcript.length < 2)
      ) {
        console.log(
          'Low quality detection at high sensitivity - confidence:',
          confidence,
          'length:',
          transcript.length
        )
        if (transcriptEl) {
          transcriptEl.textContent =
            'Background noise detected (ignored at high sensitivity)'
        }
        return
      }

      // Save potential trigger phrase
      if (transcript && transcript.length > 0) {
        potentialTriggerPhrase = transcript
        fullTranscript = transcript // Update full transcript for reference
        console.log(
          'Potential phrase detected:',
          potentialTriggerPhrase,
          'confidence:',
          confidence
        )

        // Update transcript display
        if (transcriptEl) {
          transcriptEl.textContent = 'Heard: "' + transcript + '"'
          transcriptEl.classList.add('speech-update')
          setTimeout(() => {
            transcriptEl.classList.remove('speech-update')
          }, 1000)
        }
      }

      // Set pause timer to process after speech stops
      pauseTimer = setTimeout(() => {
        isSpeaking = false
        if (transcriptEl) {
          transcriptEl.textContent += ' (processing...)'
        }
        processTranscript(potentialTriggerPhrase)
        potentialTriggerPhrase = ''
        pauseTimer = null
      }, PAUSE_THRESHOLD)
    }

    // Speech recognition end event
    recognition.onend = function () {
      console.log('Voice recognition ended')
      isRecognitionActive = false

      if (transcriptEl) {
        transcriptContainer.classList.remove('speech-active')
        if (!isVoiceEnabled) {
          transcriptEl.textContent = 'Voice recognition is disabled'
        }
      }

      // Process any pending speech after a complete stop
      if (potentialTriggerPhrase && !isSpeaking) {
        if (transcriptEl) {
          transcriptEl.textContent += ' (processing...)'
        }
        processTranscript(potentialTriggerPhrase)
        potentialTriggerPhrase = ''
      }

      // Restart if voice is still enabled
      if (isVoiceEnabled) {
        try {
          recognition.start()
          isRecognitionActive = true
          console.log('Voice recognition restarted')
        } catch (e) {
          console.error('Error restarting voice recognition:', e)
          // Try again after a delay
          setTimeout(() => {
            try {
              recognition.start()
              isRecognitionActive = true
            } catch (err) {
              console.error(
                'Failed to restart voice recognition after error:',
                err
              )
            }
          }, 1000)
        }
      }
    }

    // Speech recognition error event
    recognition.onerror = function (event) {
      console.error('Voice recognition error:', event.error)
      if (event.error === 'no-speech') {
        // No speech detected, this is normal
        return
      }

      if (transcriptEl) {
        transcriptEl.textContent = 'Error: ' + event.error
      }

      isRecognitionActive = false

      // Try to restart after errors
      if (isVoiceEnabled) {
        setTimeout(() => {
          try {
            recognition.start()
            isRecognitionActive = true
          } catch (e) {
            console.error('Failed to restart voice recognition after error:', e)
          }
        }, 1000)
      }
    }

    // Start recognition if voice is enabled
    if (isVoiceEnabled) {
      try {
        recognition.start()
        isRecognitionActive = true
        console.log('Voice recognition initialized and started')
      } catch (e) {
        console.error('Error starting voice recognition:', e)
        return false
      }
    } else if (transcriptEl) {
      transcriptEl.textContent = 'Voice recognition is disabled'
    }

    return true
  }

  // Process speech transcript after pause detection
  function processTranscript(transcript) {
    if (!transcript || transcript.length === 0) return

    // Get transcript display element
    const transcriptEl = document.getElementById('speech-transcript')

    console.log('Processing transcript after pause:', transcript)

    // Additional filtering for high sensitivity levels
    // At higher sensitivity, require more checks to prevent false triggers
    if (audioSensitivity >= 4) {
      // Check for very short transcripts which are likely noise
      if (transcript.length < 3) {
        console.log(
          'Ignoring very short transcript at high sensitivity level:',
          transcript
        )
        if (transcriptEl) {
          transcriptEl.textContent =
            'Background noise detected (ignored at sensitivity level ' +
            audioSensitivity +
            ')'
        }
        return
      }

      // Check for common noise patterns at high sensitivity
      const noisePatterns = [' ', '.', ',', '?', '!', 'a', 'um', 'uh', 'hmm']
      if (noisePatterns.includes(transcript)) {
        console.log(
          'Ignoring common noise pattern at high sensitivity level:',
          transcript
        )
        if (transcriptEl) {
          transcriptEl.textContent =
            'Background noise detected (ignored at sensitivity level ' +
            audioSensitivity +
            ')'
        }
        return
      }
    }

    // Get the current time to prevent multiple triggers
    const currentTime = new Date().getTime()
    if (currentTime - lastPhraseDetectionTime < 2000) {
      console.log('Ignoring trigger - too soon after last one')
      if (transcriptEl) {
        transcriptEl.textContent =
          'Heard: "' + transcript + '" (ignored - too soon)'
      }
      return
    }

    let phraseDetected = false
    // Get user motivation phrase from input field
    const motivationField = document.getElementById('user-sentence')
    const motivationPhrase = motivationField
      ? motivationField.value.trim().toLowerCase()
      : ''
    let detectedPhrase = ''

    // Check for exact match with user's motivation phrase
    // Only process if there is a motivation phrase set
    if (motivationPhrase && motivationPhrase.length > 0) {
      // Use exact text matching instead of inclusion
      if (transcript === motivationPhrase) {
        phraseDetected = true
        detectedPhrase = motivationPhrase
        console.log(
          'Exact match with motivation phrase detected:',
          motivationPhrase
        )
      } else {
        console.log('No exact match with motivation phrase:', motivationPhrase)
        if (transcriptEl) {
          transcriptEl.textContent =
            'Heard: "' +
            transcript +
            '" (not an exact match with "' +
            motivationPhrase +
            '")'
        }
      }
    } else {
      console.log('No motivation phrase set. Set a phrase to enable counting.')
      if (transcriptEl) {
        transcriptEl.textContent =
          'No trigger phrase set. Enter a phrase in the "I say" field.'
      }
    }

    // If a phrase was detected, increment counter
    if (phraseDetected) {
      lastPhraseDetectionTime = currentTime
      incrementCounter()

      if (transcriptEl) {
        transcriptEl.textContent =
          'Matched: "' + detectedPhrase + '" ✓ Count increased!'
        transcriptEl.classList.add('speech-update')
        setTimeout(() => {
          transcriptEl.classList.remove('speech-update')
        }, 1000)
      }
    }
  }

  // Function to toggle voice recognition
  function toggleVoiceRecognition(force = null) {
    const voiceToggle = document.getElementById('voice-toggle')
    const audioVisualizer = document.getElementById('audio-visualizer')

    // Set voice enabled based on force parameter or toggle current state
    isVoiceEnabled = force !== null ? force : !isVoiceEnabled
    document
      .getElementById('voice-toggle')
      .classList.toggle('active', isVoiceEnabled)

    if (isVoiceEnabled) {
      console.log('Voice recognition enabled')

      // Ensure audio context is activated and microphone permissions are granted
      if (!audioContext || !analyser) {
        console.log('Initializing audio system...')

        // Set up audio detection from scratch
        setupAudioDetection()
          .then(() => {
            console.log('Audio detection setup complete')
            document.getElementById('audio-visualizer').classList.add('active')
          })
          .catch((err) => {
            console.error('Failed to setup audio detection:', err)
          })
      } else {
        // Resume existing audio context if it's suspended
        if (audioContext.state === 'suspended') {
          audioContext.resume().then(() => {
            console.log('Audio context resumed')
          })
        }
        document.getElementById('audio-visualizer').classList.add('active')
      }

      // Initialize speech recognition
      if (!recognition) {
        initVoiceRecognition()
      }

      // Start recognition if it's available and not already running
      if (recognition && !isRecognitionActive) {
        try {
          recognition.start()
          isRecognitionActive = true
          console.log('Started speech recognition')
        } catch (e) {
          console.error('Error starting recognition:', e)
          // If we encounter an error, try re-initializing
          setTimeout(() => {
            initVoiceRecognition()
            try {
              recognition.start()
              isRecognitionActive = true
            } catch (e) {
              console.error('Failed to restart recognition after error:', e)
            }
          }, 500)
        }
      }

      // Set amplitude display to default
      const audioLevelIndicator = document.getElementById(
        'audio-level-indicator'
      )
      if (audioLevelIndicator) {
        audioLevelIndicator.textContent = 'Listening...'
        audioLevelIndicator.style.color = '#4CAF50' // Green
      }
    } else {
      console.log('Voice recognition disabled')

      // Stop recognition if it's running
      if (recognition && isRecognitionActive) {
        try {
          recognition.stop()
          isRecognitionActive = false
          console.log('Stopped speech recognition')
        } catch (e) {
          console.error('Error stopping recognition:', e)
        }
      }

      // Stop all audio recording and reset the system
      if (microphoneStream) {
        microphoneStream.getTracks().forEach((track) => {
          track.stop()
          console.log('Stopped microphone track')
        })
        microphoneStream = null
      }

      // Disconnect microphone if connected
      if (microphone) {
        microphone.disconnect()
        microphone = null
        console.log('Disconnected microphone')
      }

      // Cancel animation frame
      if (animationId) {
        cancelAnimationFrame(animationId)
        animationId = null
      }

      // Suspend audio context to free resources
      if (audioContext && audioContext.state !== 'closed') {
        audioContext
          .suspend()
          .then(() => {
            console.log('Audio context suspended')
            // Set to null so it properly reinitializes on restart
            audioContext = null
            analyser = null
          })
          .catch((e) => {
            console.error('Error suspending audio context:', e)
            // Set to null even if suspend fails
            audioContext = null
            analyser = null
          })
      } else {
        // Set to null if context is already closed or doesn't exist
        audioContext = null
        analyser = null
      }

      // Reset audio state variables
      lastAudioState = false
      audioTriggerActive = false
      fullTranscript = ''
      lastPhraseDetectionTime = 0

      // Reset visualizer and remove active class
      const bars = document.querySelectorAll('.audio-visualizer .bar')
      bars.forEach((bar) => {
        bar.style.height = '5px'
      })
      document.getElementById('audio-visualizer').classList.remove('active')

      // Set amplitude display to inactive
      const audioLevelIndicator = document.getElementById(
        'audio-level-indicator'
      )
      if (audioLevelIndicator) {
        audioLevelIndicator.textContent = 'Voice Off'
        audioLevelIndicator.style.color = '#777'
      }
    }

    // Save settings
    settings.voiceEnabled = isVoiceEnabled
    saveSettings()
  }

  // Function to handle sensitivity change
  function handleSensitivityChange() {
    const sensitivitySlider = document.getElementById('audio-sensitivity')
    const sensitivityValue = document.getElementById('sensitivity-value')

    audioSensitivity = parseInt(sensitivitySlider.value)
    sensitivityValue.textContent = audioSensitivity

    // Save to settings
    settings.audioSensitivity = audioSensitivity
    saveSettings()

    console.log('Audio sensitivity set to:', audioSensitivity)
  }

  // Function to visualize audio
  function visualizeAudio(bars) {
    // Create data array for time domain data
    const timeDomainData = new Uint8Array(analyser.fftSize)

    // Create data array for frequency data
    const frequencyData = new Uint8Array(analyser.frequencyBinCount)

    // Variables for audio-triggered counting
    let lastTriggerTime = 0
    const triggerCooldown = 1000 // 1 second cooldown between triggers to prevent rapid counting

    // Get the audio level indicator element
    const audioLevelIndicator = document.getElementById('audio-level-indicator')

    // Debug confirmation
    console.log('Audio visualization started, indicator:', audioLevelIndicator)

    // Function to render the visualization
    function render() {
      // Only continue if voice is enabled
      if (!isVoiceEnabled) return

      // Get time domain data for volume calculation
      analyser.getByteTimeDomainData(timeDomainData)

      // Get frequency data for visualization
      analyser.getByteFrequencyData(frequencyData)

      // Calculate volume from time domain data
      let sumSquares = 0
      for (let i = 0; i < timeDomainData.length; i++) {
        // Convert from 0-255 to -1 to 1
        const amplitude = timeDomainData[i] / 128.0 - 1.0
        sumSquares += amplitude * amplitude
      }

      // Calculate RMS (root mean square)
      const rms = Math.sqrt(sumSquares / timeDomainData.length)

      // Convert to decibels (logarithmic scale) and ensure values are positive
      let db = Math.max(0, Math.round(20 * Math.log10(rms + 0.0001)))

      // Alternative method: use the raw frequency data average
      let frequencySum = 0
      for (let i = 0; i < frequencyData.length; i++) {
        frequencySum += frequencyData[i]
      }
      const frequencyAvg = Math.round(frequencySum / frequencyData.length)

      // Calculate amplification factor based on sensitivity setting
      // Higher sensitivity = amplify quiet sounds more (1=low, 5=high)
      let amplificationFactor = 0.1 + audioSensitivity * 0.18 // Ranges from 0.1 (level 1) to 1.0 (level 5)

      // Apply volume amplification
      const amplifiedFrequencyAvg = Math.round(
        frequencyAvg * amplificationFactor
      )
      const amplifiedDb = Math.round(db * amplificationFactor)

      // Final audio level to display - use the larger of the two values for better visibility
      const audioLevel = Math.max(amplifiedDb, amplifiedFrequencyAvg)

      // Always update the level indicator with the current value
      if (audioLevelIndicator) {
        // Show decibels
        audioLevelIndicator.textContent = audioLevel + ' dB'

        // Change color based on level
        if (audioLevel > 40) {
          audioLevelIndicator.style.color = '#4CAF50' // Green for high volume
        } else if (audioLevel > 20) {
          audioLevelIndicator.style.color = '#FFA000' // Orange for medium volume
        } else {
          audioLevelIndicator.style.color = '#E91E63' // Pink for low volume
        }

        // Make indicator visible
        audioLevelIndicator.style.opacity = '1'
      }

      // First, calculate the first bar's height for audio state detection
      const firstBarStart = Math.floor((0 * frequencyData.length) / bars.length)
      const firstBarEnd = Math.floor((1 * frequencyData.length) / bars.length)
      let firstBarSum = 0

      // Sum frequencies for first bar
      for (let j = firstBarStart; j < firstBarEnd; j++) {
        firstBarSum += frequencyData[j]
      }

      // Calculate average for first bar
      const firstBarAvg = firstBarSum / (firstBarEnd - firstBarStart)

      // Apply amplification based on sensitivity setting
      const amplifiedFirstBarAvg = firstBarAvg * amplificationFactor

      // Fixed detection threshold (since sensitivity now controls amplification instead)
      const detectionThreshold = 20 // A moderate threshold that works with amplification

      // Map to height (5px to 40px)
      const firstBarHeight = Math.max(
        5,
        Math.min(40, amplifiedFirstBarAvg * 0.4)
      )

      // Determine current audio state based on the height and threshold
      const currentAudioState = firstBarHeight >= detectionThreshold

      // For debugging, log the current db level
      if (Math.random() < 0.01) {
        // Log occasionally
        console.log(
          'Current dB:',
          db,
          'Threshold:',
          detectionThreshold,
          'FirstBarAvg:',
          firstBarAvg
        )
      }

      // For level 5, add a debug flag to force trigger if no recent triggers
      const now = Date.now()
      // Detect transition from silence to audio (instead of continuous audio detection)
      if (
        (!lastAudioState && currentAudioState && !audioTriggerActive) ||
        (audioSensitivity === 5 &&
          firstBarHeight >= 3 &&
          now - lastTriggerTime > 2000 &&
          !audioTriggerActive)
      ) {
        lastTriggerTime = now
        audioTriggerActive = true

        // Trigger the count button when we go from silence to audio
        setTimeout(() => {
          handleCountClickFromAudio()
          // Reset the flag after a short delay
          setTimeout(() => {
            audioTriggerActive = false
          }, 200)
        }, 10)
      }

      // Update last audio state for next comparison
      lastAudioState = currentAudioState

      // Animation amplification factor based on sensitivity
      // Higher sensitivity = more amplification of the visualizer
      amplificationFactor = 0.1 + audioSensitivity * 0.18 // Ranges from 0.1 to 1.0

      // Calculate average frequency for each bar for visualization
      for (let i = 0; i < bars.length; i++) {
        // Show or hide bars based on sensitivity setting
        // Sensitivity 1 = 1 bar, Sensitivity 5 = 5 bars
        if (i < audioSensitivity) {
          bars[i].style.display = 'block'
        } else {
          bars[i].style.display = 'none'
          continue // Skip calculations for hidden bars
        }

        // If this is the first bar, add the 'active' class to the visualizer
        if (i === 0) {
          document.getElementById('audio-visualizer').classList.add('active')
        }

        // Get frequency data for this bar
        const start = Math.floor((i * frequencyData.length) / bars.length)
        const end = Math.floor(((i + 1) * frequencyData.length) / bars.length)
        let sum = 0

        // Sum frequencies
        for (let j = start; j < end; j++) {
          sum += frequencyData[j]
        }

        // Calculate average
        const avg = sum / (end - start)

        // Apply volume amplification based on sensitivity level
        const amplifiedAvg = avg * amplificationFactor

        // Map to bar height with amplification
        // More sensitive = taller bars for the same input
        const height = Math.max(5, Math.min(40, amplifiedAvg * 0.4))

        // Apply height to bar
        bars[i].style.height = `${height}px`
      }

      // Request next frame
      animationId = requestAnimationFrame(render)
    }

    // Start visualization
    render()
  }

  // Function to reset and reinitialize audio system
  function resetAudioSystem() {
    // Reset audio state tracking variables
    lastAudioState = false
    audioTriggerActive = false
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
      microphoneStream.getTracks().forEach((track) => {
        track.stop()
      })
      microphoneStream = null
    }

    // Close the audio context
    if (audioContext) {
      audioContext.close()
      audioContext = null
      analyser = null
    }

    // Create a new audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)()

    // Get visualizer and its bars
    const visualizer = document.getElementById('audio-visualizer')
    const bars = visualizer.querySelectorAll('.bar')

    // Create analyser node
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256

    // Request microphone access
    return navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // Store the stream for proper cleanup
        microphoneStream = stream

        // Connect microphone to analyser
        microphone = audioContext.createMediaStreamSource(stream)
        microphone.connect(analyser)

        // Start visualization
        visualizeAudio(bars)

        return true
      })
      .catch((err) => {
        console.error('Error accessing microphone:', err)
        return false
      })
  }

  // Function for audio detection setup - returns Promise so we can await completion
  function setupAudioDetection() {
    return new Promise((resolve, reject) => {
      try {
        // Create audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)()

        // Debug: Log that we're attempting to access the microphone
        console.log('Attempting to access microphone...')

        // Resume audio context (needed in some browsers due to autoplay policy)
        if (audioContext.state === 'suspended') {
          audioContext
            .resume()
            .then(() => {
              console.log('Audio context resumed successfully')
            })
            .catch((err) => {
              console.error('Failed to resume audio context:', err)
            })
        }

        // Get access to microphone with explicit error handling
        navigator.mediaDevices
          .getUserMedia({ audio: true, video: false })
          .then(function (stream) {
            console.log('Microphone access granted')

            // Create analyzer node with appropriate settings
            analyser = audioContext.createAnalyser()
            analyser.fftSize = 256 // Must be power of 2
            analyser.smoothingTimeConstant = 0.8 // Smooth transitions

            // Connect microphone to analyzer
            const microphone = audioContext.createMediaStreamSource(stream)
            microphone.connect(analyser)

            // Keep track of audio state
            lastAudioState = false

            // Additional debugging
            console.log(
              'Microphone connected successfully:',
              'FFT size:',
              analyser.fftSize,
              'Frequency bin count:',
              analyser.frequencyBinCount
            )

            // Get bars for visualization
            const bars = document.querySelectorAll('.audio-visualizer .bar')

            // Start visualization if we have bars
            if (bars.length > 0) {
              visualizeAudio(bars)
              console.log(
                'Audio visualization started with',
                bars.length,
                'bars'
              )

              // Make the audio indicator visible
              const audioLevelIndicator = document.getElementById(
                'audio-level-indicator'
              )
              if (audioLevelIndicator) {
                audioLevelIndicator.style.opacity = '1'
                audioLevelIndicator.textContent = 'Listening...'
              }
            } else {
              console.warn('No visualizer bars found in the DOM')
            }

            resolve(true) // Successfully set up audio
          })
          .catch(function (err) {
            console.error('Error accessing microphone:', err)

            // Update UI to show error
            const audioLevelIndicator = document.getElementById(
              'audio-level-indicator'
            )
            if (audioLevelIndicator) {
              audioLevelIndicator.textContent = 'Mic denied'
              audioLevelIndicator.style.color = '#ff0000'
              audioLevelIndicator.style.opacity = '1'
            }

            reject(err)
          })
      } catch (error) {
        console.error('Error setting up audio detection:', error)
        reject(error)
      }
    })
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
    // Apply dark mode if enabled
    if (settings.darkMode) {
      document.body.classList.add('dark-mode')
      document.getElementById('dark-mode-toggle').classList.add('active')
    } else {
      document.body.classList.remove('dark-mode')
      document.getElementById('dark-mode-toggle').classList.remove('active')
    }

    // Apply display mode
    const displayMode = settings.displayMode || 'grid'
    if (displayMode === 'grid') {
      document.getElementById('grid-toggle').classList.add('active')
      document.getElementById('number-toggle').classList.remove('active')
    } else {
      document.getElementById('grid-toggle').classList.remove('active')
      document.getElementById('number-toggle').classList.add('active')
    }

    // Apply voice settings
    isVoiceEnabled = settings.voiceEnabled || false
    if (isVoiceEnabled) {
      document.getElementById('voice-toggle').classList.add('active')
    } else {
      document.getElementById('voice-toggle').classList.remove('active')
    }

    // Apply audio sensitivity setting - explicitly set to 3 if not defined
    if (typeof settings.audioSensitivity === 'undefined') {
      settings.audioSensitivity = 3
    }
    audioSensitivity = settings.audioSensitivity

    // Update sensitivity slider and display
    const sensitivitySlider = document.getElementById('audio-sensitivity')
    const sensitivityValue = document.getElementById('sensitivity-value')
    if (sensitivitySlider) sensitivitySlider.value = audioSensitivity
    if (sensitivityValue) sensitivityValue.textContent = audioSensitivity

    // Apply today-only view setting
    if (settings.showTodayOnly) {
      document.getElementById('today-toggle').classList.add('active')
    } else {
      document.getElementById('today-toggle').classList.remove('active')
    }

    // Update the display
    updateDisplayMode()
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

  initializeApp()
})
// end of script
