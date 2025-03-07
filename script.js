// Register service worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Use a timeout to avoid hanging if service worker registration fails
        const timeoutId = setTimeout(() => {
            console.warn('Service Worker registration timeout - continuing without service worker');
        }, 3000);

        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                clearTimeout(timeoutId);
                console.log('Service Worker registered with scope:', registration.scope);
                
                // Check if there's a waiting service worker and update UI
                if (registration.waiting) {
                    console.log('New service worker waiting to activate');
                }
                
                // Handle service worker updates
                registration.onupdatefound = () => {
                    const installingWorker = registration.installing;
                    if (installingWorker) {
                        installingWorker.onstatechange = () => {
                            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                console.log('New service worker installed - reload for updates');
                            }
                        };
                    }
                };
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error('Service Worker registration failed:', error);
                // Continue app functionality even if service worker fails
            });
    });
}

// Main app functionality
document.addEventListener('DOMContentLoaded', function() {
    // Constants
    const DAYS = 7;
    const SQUARES_PER_DAY = 100;
    const STORAGE_KEY = '100TimesChallenge';
    
    // Check if running in standalone mode (added to home screen)
    const isInStandaloneMode = () => 
        (window.navigator.standalone) || // iOS
        (window.matchMedia('(display-mode: standalone)').matches); // Android/Chrome
    
    // Add class to body if in standalone mode
    if (isInStandaloneMode()) {
        document.body.classList.add('standalone-mode');
        
        // Fix for iOS to hide the status bar
        if (window.navigator.standalone) {
            // Add empty div to push content down below status bar
            const statusBarSpacer = document.createElement('div');
            statusBarSpacer.classList.add('status-bar-spacer');
            document.body.prepend(statusBarSpacer);
        }
    }
    
    // DOM Elements
    const countButton = document.getElementById('count-button');
    const userSentence = document.getElementById('user-sentence');
    const squaresGrid = document.getElementById('squares-grid');
    const days = document.querySelectorAll('.day');
    
    // App state
    let currentDay = 1;
    let currentCount = 0;
    let userMotivation = '';
    let dayData = [];
    let settings = { darkMode: false, displayMode: 'random' };
    let isAnimating = false;
    let bigModeAnimationTimeout = null;
    // Queue for handling rapid clicks
    let clickQueue = [];
    let processingQueue = false;
    // Track the last processed number for data consistency
    let lastProcessedNumber = 0;
    
    // Helper functions
    function generateMutedColor() {
        // Generate a pleasing hue
        const hue = Math.floor(Math.random() * 360);
        
        // Use higher saturation and lightness for more vibrant colors
        const saturation = 70 + Math.floor(Math.random() * 30); // 70-100%
        const lightness = 45 + Math.floor(Math.random() * 15); // 45-60%
        
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    
    // Initialize the app
    function initializeApp() {
        // Load data or initialize fresh
        loadProgress();
        
        // Create squares grid
        generateSquares();
        
        // Set up event listeners
        setupEventListeners();
        
        // Update the UI
        updateUI();
        
        // Set initial display based on display mode
        const squaresGrid = document.getElementById('squares-grid');
        const bigNumberDisplay = document.querySelector('.big-number-display');
        
        if (settings.displayMode === 'big') {
            squaresGrid.style.display = 'none';
            bigNumberDisplay.style.display = 'flex';
            
            // Clear the big number display
            bigNumberDisplay.innerHTML = '';
            
            // Create the dots grid
            const dotsGrid = createDotsGrid();
            bigNumberDisplay.appendChild(dotsGrid);
            
            // Show the current count in big display
            const currentDayData = dayData[currentDay - 1];
            if (currentDayData.count > 0) {
                // Create number element
                const numberElement = document.createElement('div');
                numberElement.style.color = currentDayData.coloredSquares.length > 0 ? 
                    currentDayData.coloredSquares[currentDayData.coloredSquares.length - 1].color : '#e0e0e0';
                numberElement.style.fontSize = 'inherit';
                numberElement.style.display = 'flex';
                numberElement.style.justifyContent = 'center';
                numberElement.style.alignItems = 'center';
                numberElement.style.width = '100%';
                numberElement.style.height = '100%';
                numberElement.style.position = 'relative';
                numberElement.style.zIndex = '1';
                numberElement.textContent = currentDayData.count;
                
                // Add the number element to the display
                bigNumberDisplay.appendChild(numberElement);
                
                // Update the dots grid based on the current count
                updateDots(currentDayData.count);
            } else {
                // Create number element for zero count
                const numberElement = document.createElement('div');
                numberElement.style.color = '#888';
                numberElement.style.fontSize = 'inherit';
                numberElement.style.display = 'flex';
                numberElement.style.justifyContent = 'center';
                numberElement.style.alignItems = 'center';
                numberElement.style.width = '100%';
                numberElement.style.height = '100%';
                numberElement.style.position = 'relative';
                numberElement.style.zIndex = '1';
                numberElement.textContent = '0';
                
                // Add the number element to the display
                bigNumberDisplay.appendChild(numberElement);
                
                // Ensure dots grid is visible even with zero count
                updateDots(0);
            }
        } else {
            squaresGrid.style.display = 'grid';
            bigNumberDisplay.style.display = 'none';
        }
    }
    
    function generateSquares() {
        const currentDayData = dayData[currentDay - 1];
        
        // Create 100 squares
        for (let i = 1; i <= 100; i++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.textContent = i;
            
            // Check if this square should be colored
            const isColored = currentDayData.count >= i;
            if (isColored) {
                square.classList.add('colored');
                
                // Get the color for this square from coloredSquares or generate one
                let squareColor;
                if (i <= currentDayData.coloredSquares.length) {
                    squareColor = currentDayData.coloredSquares[i-1].color;
                } else {
                    squareColor = generateMutedColor();
                }
                
                square.style.backgroundColor = squareColor;
            }
            
            squaresGrid.appendChild(square);
        }
    }
    
    function initializeData() {
        // Initialize empty data for all 7 days
        for (let i = 1; i <= 7; i++) {
            dayData.push({
                day: i,
                count: 0,
                coloredSquares: [],
                completed: false
            });
        }
    }
    
    function loadProgress() {
        try {
            const savedData = localStorage.getItem(STORAGE_KEY);
            
            if (savedData) {
                try {
                    const parsed = JSON.parse(savedData);
                    dayData = parsed.dayData || [];
                    currentDay = parsed.currentDay || 1;
                    userMotivation = parsed.userMotivation || '';
                    settings = parsed.settings || { darkMode: false, displayMode: 'random' };
                    
                    // Ensure we have valid dayData
                    if (!Array.isArray(dayData) || dayData.length === 0) {
                        console.warn('Invalid dayData, initializing fresh data');
                        initializeData();
                    }
                    
                    // Ensure all day data has necessary properties
                    dayData.forEach(day => {
                        // Handle case where no coloredSquares property exists
                        if (!day.coloredSquares) {
                            day.coloredSquares = [];
                        }
                        
                        // Add position to old data if missing
                        day.coloredSquares.forEach((square, index) => {
                            if (square.position === undefined) {
                                square.position = index; // Just use sequential positions for old data
                            }
                        });
                        
                        // Verify data consistency
                        if (day.coloredSquares.length > 0) {
                            // Sort by number
                            day.coloredSquares.sort((a, b) => a.number - b.number);
                            
                            // Check for missing numbers
                            const numbers = day.coloredSquares.map(square => square.number);
                            const maxNumber = Math.max(...numbers, 0);
                            const expectedNumbers = Array.from({length: maxNumber}, (_, i) => i + 1);
                            const missingNumbers = expectedNumbers.filter(num => !numbers.includes(num));
                            
                            // If missing numbers detected, fix the data
                            if (missingNumbers.length > 0) {
                                console.warn(`Detected ${missingNumbers.length} missing numbers in day ${day.day} data, fixing...`);
                                for (const missingNum of missingNumbers) {
                                    // Find an unused position
                                    let availablePositions = [];
                                    for (let i = 0; i < 100; i++) {
                                        if (!day.coloredSquares.some(square => square.position === i)) {
                                            availablePositions.push(i);
                                        }
                                    }
                                    
                                    const position = availablePositions.length > 0 ? 
                                        availablePositions[0] : 
                                        missingNum - 1; // Fallback to sequential position
                                    
                                    // Add the missing square
                                    day.coloredSquares.push({
                                        number: missingNum,
                                        color: generateMutedColor(),
                                        position: position
                                    });
                                }
                                
                                // Re-sort after adding missing numbers
                                day.coloredSquares.sort((a, b) => a.number - b.number);
                            }
                            
                            // Make sure count reflects the highest number
                            if (day.coloredSquares.length > 0) {
                                const highestNumber = day.coloredSquares[day.coloredSquares.length - 1].number;
                                if (day.count < highestNumber) {
                                    day.count = highestNumber;
                                }
                            }
                        }
                    });
                    
                    // Verify current day is valid
                    if (currentDay < 1 || currentDay > 7) {
                        console.warn('Invalid currentDay, resetting to 1');
                        currentDay = 1;
                    }
                    
                } catch (parseError) {
                    console.error('Error parsing saved data:', parseError);
                    initializeData();
                }
            } else {
                // No saved data, initialize fresh
                console.log('No saved data found, initializing fresh data');
                initializeData();
            }
            
            // Ensure we have the correct number of days
            while (dayData.length < DAYS) {
                dayData.push({
                    day: dayData.length + 1,
                    count: 0,
                    coloredSquares: [],
                    completed: false
                });
            }
            
            // Initialize lastProcessedNumber based on current day's data
            if (dayData && dayData[currentDay - 1]) {
                const currentDayData = dayData[currentDay - 1];
                if (currentDayData.coloredSquares && currentDayData.coloredSquares.length > 0) {
                    const numbers = currentDayData.coloredSquares.map(square => square.number);
                    lastProcessedNumber = Math.max(...numbers, 0);
                } else {
                    lastProcessedNumber = 0;
                }
            }
            
            // Update the UI after loading data
            updateUI();
            
            // If it's dark mode, apply it
            if (settings.darkMode) {
                applyDarkMode();
            }
            
            // Update the display mode (random/sequential/big)
            const modeRadios = document.querySelectorAll('input[name="display-mode"]');
            modeRadios.forEach(radio => {
                if (radio.value === settings.displayMode) {
                    radio.checked = true;
                }
            });
            
            // Update the user sentence display with quotes
            if (userSentence && userMotivation && userMotivation.trim() !== '') {
                userSentence.value = `"${userMotivation}"`;
            }
            
        } catch (error) {
            // Catch any other errors that might occur
            console.error('Error in loadProgress:', error);
            
            // Recover from error by initializing fresh data
            console.log('Recovering from error by initializing fresh data');
            dayData = [];
            initializeData();
            currentDay = 1;
            userMotivation = '';
            settings = { darkMode: false, displayMode: 'random' };
            
            // Still update the UI to avoid hanging
            updateUI();
        }
    }
    
    function saveDataToLocalStorage() {
        // Save the day data, current day, and user motivation to local storage
        const dataToSave = {
            dayData: dayData,
            currentDay: currentDay,
            userMotivation: userMotivation,
            settings: settings
        };
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }
    
    function updateUI() {
        // Get current day's data
        const currentDayData = dayData[currentDay - 1];
        
        // Get the next available day for navigation
        const nextAvailableDay = getNextAvailableDay();
        
        // Update days
        days.forEach((day, index) => {
            const dayNumber = index + 1;
            const isCurrentDay = dayNumber === currentDay;
            const isDayCompleted = dayData[index].completed;
            const isPastDay = dayNumber < currentDay;
            const isAvailableDay = dayNumber <= nextAvailableDay;
            
            // Reset all classes and styles
            day.classList.remove('active', 'completed', 'past');
            day.style.cursor = isAvailableDay || isDayCompleted ? 'pointer' : 'default';
            
            // Get the day label element
            const dayLabel = day.querySelector('.day-label');
            
            // Hide day label by default
            if (dayLabel) {
                dayLabel.style.opacity = '0';
            }
            
            if (isCurrentDay) {
                // Highlight current day
                day.classList.add('active');
                
                // Show day label only for current day
                if (dayLabel) {
                    dayLabel.style.opacity = '1';
                }
            } else if (isDayCompleted) {
                // Completed days
                day.classList.add('completed');
            } else if (isPastDay) {
                // Past days (not completed)
                day.classList.add('past');
            }
        });
        
        // Update user sentence with a single set of quotation marks
        if (userSentence && userMotivation) {
            if (userMotivation.trim() !== '') {
                // First strip any existing quotes
                let cleanValue = userMotivation;
                while (cleanValue.startsWith('"') || cleanValue.endsWith('"')) {
                    cleanValue = cleanValue.replace(/^"/, '').replace(/"$/, '');
                }
                
                // Now add just one set of quotes
                if (cleanValue.trim() !== '') {
                    userSentence.value = `"${cleanValue}"`;
                } else {
                    userSentence.value = '';
                }
            } else {
                userSentence.value = userMotivation;
            }
        }
        
        // Update button appearance based on completion state
        updateButtonAppearance();
        
        // Update display based on display mode
        const squaresGrid = document.getElementById('squares-grid');
        const bigNumberDisplay = document.querySelector('.big-number-display');
        
        if (settings.displayMode === 'big') {
            // Hide grid completely when in big mode
            squaresGrid.style.display = 'none';
            bigNumberDisplay.style.display = 'flex';
            
            // Show the current count in big display
            const currentDayData = dayData[currentDay - 1];
            if (currentDayData.count > 0) {
                bigNumberDisplay.textContent = currentDayData.count;
                if (currentDayData.coloredSquares.length > 0) {
                    const lastColor = currentDayData.coloredSquares[currentDayData.coloredSquares.length - 1].color;
                    bigNumberDisplay.style.color = lastColor;
                }
            } else {
                bigNumberDisplay.textContent = '0';
                bigNumberDisplay.style.color = '#888';
            }
        } else {
            // Show grid for other modes
            squaresGrid.style.display = 'grid';
            bigNumberDisplay.style.display = 'none';
            // Regenerate the grid with current data
            regenerateGrid();
        }
    }
    
    function regenerateGrid() {
        // Clear grid
        squaresGrid.innerHTML = '';
        
        // Generate new squares (all empty initially)
        for (let i = 1; i <= 100; i++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.dataset.index = i - 1; // Store the position index as a data attribute
            square.textContent = i; // Set numbers but they'll be transparent initially
            squaresGrid.appendChild(square);
        }
        
        // Color the squares that have already been marked (with staggered animation)
        const currentDayData = dayData[currentDay - 1];
        const squares = document.querySelectorAll('.square');
        
        // Create a sorted copy of coloredSquares by number for consistent display
        let sortedSquares = [...currentDayData.coloredSquares];
        sortedSquares.sort((a, b) => a.number - b.number);
        
        // Verify we don't have any missing numbers
        const numbers = sortedSquares.map(square => square.number);
        const expectedNumbers = Array.from({length: currentDayData.count}, (_, i) => i + 1);
        const missingNumbers = expectedNumbers.filter(num => !numbers.includes(num));
        
        // Add any missing numbers
        for (const missingNum of missingNumbers) {
            // Get a position that's not used yet
            let availablePositions = [];
            for (let i = 0; i < 100; i++) {
                if (!sortedSquares.some(square => square.position === i)) {
                    availablePositions.push(i);
                }
            }
            
            const position = availablePositions.length > 0 ? 
                availablePositions[0] : 
                missingNum - 1; // Fallback to sequential position
                
            const newSquare = {
                number: missingNum,
                color: generateMutedColor(),
                position: position
            };
            
            sortedSquares.push(newSquare);
            currentDayData.coloredSquares.push(newSquare);
        }
        
        // Re-sort after adding missing numbers
        sortedSquares.sort((a, b) => a.number - b.number);
        
        // Apply the colored squares with staggered animation
        sortedSquares.forEach((squareData, index) => {
            const position = squareData.position;
            if (position < squares.length) {
                const square = squares[position];
                
                // Set initial properties
                square.style.backgroundColor = squareData.color;
                square.textContent = squareData.number;
                square.classList.add('colored');
                
                // Set initial state for animation
                square.style.opacity = '0';
                square.style.transform = 'scale(0)';
                
                // Apply staggered animation with a small delay based on index
                setTimeout(() => {
                    // Force reflow to ensure animation plays
                    void square.offsetWidth;
                    
                    // Use custom animation with more dramatic effect
                    square.style.transition = 'transform 0.4s cubic-bezier(0.17, 0.89, 0.32, 1.49), opacity 0.4s ease';
                    square.style.transform = 'scale(1.1)';
                    square.style.opacity = '1';
                    
                    // Remove the scaling after the animation completes
                    setTimeout(() => {
                        square.style.transform = 'scale(1)';
                    }, 350);
                }, 20 * index); // 20ms delay between each square
            }
        });
        
        // Make sure the count matches the highest number
        if (sortedSquares.length > 0) {
            const highestNumber = sortedSquares[sortedSquares.length - 1].number;
            if (currentDayData.count < highestNumber) {
                currentDayData.count = highestNumber;
            }
        }
        
        // Save the corrected data
        saveDataToLocalStorage();
    }
    
    function initializeData() {
        // Initialize empty data for all 7 days
        for (let i = 1; i <= 7; i++) {
            dayData.push({
                day: i,
                count: 0,
                coloredSquares: [],
                completed: false
            });
        }
    }
    
    function setupEventListeners() {
        // Count button event - adding both click and touchstart for better mobile response
        countButton.addEventListener('click', handleCountClick);
        countButton.addEventListener('touchstart', function(e) {
            e.preventDefault(); // Prevent default to avoid delays
            handleCountClick();
        });
        
        // Settings panel toggle
        const settingsToggle = document.getElementById('settings-toggle');
        const settingsPanel = document.getElementById('settings-panel');
        
        settingsToggle.addEventListener('click', function() {
            settingsPanel.classList.toggle('active');
        });
        
        settingsToggle.addEventListener('touchstart', function(e) {
            e.preventDefault(); // Prevent default to avoid delays
            settingsPanel.classList.toggle('active');
        });
        
        // Close settings panel when clicking outside
        document.addEventListener('click', function(event) {
            if (!settingsPanel.contains(event.target) && event.target !== settingsToggle) {
                settingsPanel.classList.remove('active');
            }
        });
        
        // Reset button
        const resetButton = document.getElementById('reset-button');
        
        resetButton.addEventListener('click', function() {
            if (confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
                // Save the current display mode settings before resetting
                const currentSettings = { 
                    darkMode: settings.darkMode, 
                    displayMode: settings.displayMode 
                };
                
                // Remove all data from localStorage
                localStorage.removeItem(STORAGE_KEY);
                
                // Create new data with preserved settings
                const newData = {
                    dayData: [],
                    currentDay: 1,
                    userMotivation: '',
                    settings: currentSettings
                };
                
                // Save the new data with preserved settings
                localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
                
                // Reload the page to apply changes
                location.reload();
            }
        });
        
        resetButton.addEventListener('touchstart', function(e) {
            e.preventDefault(); // Prevent default to avoid delays
            if (confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
                // Save the current display mode settings before resetting
                const currentSettings = { 
                    darkMode: settings.darkMode, 
                    displayMode: settings.displayMode 
                };
                
                // Remove all data from localStorage
                localStorage.removeItem(STORAGE_KEY);
                
                // Create new data with preserved settings
                const newData = {
                    dayData: [],
                    currentDay: 1,
                    userMotivation: '',
                    settings: currentSettings
                };
                
                // Save the new data with preserved settings
                localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
                
                // Reload the page to apply changes
                location.reload();
            }
        });
        
        // Modify the touchend handler to avoid interfering with interactive elements
        document.addEventListener('touchend', function(e) {
            // Only prevent default on day and square elements
            if (e.target.closest('.day, .square') && 
                !e.target.closest('#count-button, #settings-toggle, #reset-button')) {
                e.preventDefault();
            }
        }, { passive: false });
        
        // Day selection event
        days.forEach(day => {
            day.addEventListener('click', function() {
                // Get the day number element
                const dayNumberElement = this.querySelector('.day-number');
                const selectedDay = parseInt(dayNumberElement.textContent);
                
                // Get the index of the selected day (0-based)
                const dayIndex = selectedDay - 1;
                
                // Check if the day is completed or is the next available day
                const isDayCompleted = dayData[dayIndex].completed;
                const nextAvailableDay = getNextAvailableDay();
                const canNavigate = isDayCompleted || selectedDay <= nextAvailableDay;
                
                // Add a visual indication that the day is clickable
                if (canNavigate) {
                    this.style.cursor = 'pointer';
                } else {
                    this.style.cursor = 'not-allowed';
                }
                
                if (canNavigate) {
                    currentDay = selectedDay;
                    updateUI();
                    saveProgress(); // Save the current day selection
                }
            });
            
            day.addEventListener('touchstart', function(e) {
                e.preventDefault(); // Prevent default to avoid delays
                
                // Get the day number element
                const dayNumberElement = this.querySelector('.day-number');
                const selectedDay = parseInt(dayNumberElement.textContent);
                
                // Get the index of the selected day (0-based)
                const dayIndex = selectedDay - 1;
                
                // Check if the day is completed or is the next available day
                const isDayCompleted = dayData[dayIndex].completed;
                const nextAvailableDay = getNextAvailableDay();
                const canNavigate = isDayCompleted || selectedDay <= nextAvailableDay;
                
                if (canNavigate) {
                    currentDay = selectedDay;
                    updateUI();
                    saveProgress(); // Save the current day selection
                }
            });
        });
        
        // Save user sentence
        if (userSentence) {
            userSentence.addEventListener('input', function() {
                // Store the raw input value without quotes
                let inputValue = this.value;
                
                // Strip existing quotes to get clean content
                if (inputValue.startsWith('"') && inputValue.endsWith('"')) {
                    userMotivation = inputValue.substring(1, inputValue.length - 1);
                } else {
                    userMotivation = inputValue;
                }
                
                // Don't add quotes during typing to avoid weird cursor positioning
                // We'll add them on blur
                
                saveProgress();
            });
            
            // When the input field loses focus, ensure quotes are added properly
            userSentence.addEventListener('blur', function() {
                if (this.value.trim() !== '') {
                    // First strip any existing quotes
                    let cleanValue = this.value;
                    while (cleanValue.startsWith('"') || cleanValue.endsWith('"')) {
                        cleanValue = cleanValue.replace(/^"/, '').replace(/"$/, '');
                    }
                    
                    // Now add just one set of quotes
                    if (cleanValue.trim() !== '') {
                        this.value = `"${cleanValue}"`;
                    }
                }
            });
        }
        
        // Display mode radio buttons
        const displayModeRadios = document.querySelectorAll('input[name="display-mode"]');
        displayModeRadios.forEach(radio => {
            // Set the initial state based on settings
            if (radio.value === settings.displayMode) {
                radio.checked = true;
            }
            
            radio.addEventListener('change', function() {
                if (this.checked) {
                    const previousMode = settings.displayMode;
                    settings.displayMode = this.value;
                    
                    // Clear any existing animation timeouts
                    if (bigModeAnimationTimeout) {
                        clearTimeout(bigModeAnimationTimeout);
                        bigModeAnimationTimeout = null;
                    }
                    
                    // Reset animation state
                    isAnimating = false;
                    
                    // Update UI based on mode
                    const squaresGrid = document.getElementById('squares-grid');
                    const bigNumberDisplay = document.querySelector('.big-number-display');
                    
                    // Reset any classes on big number display
                    bigNumberDisplay.classList.remove('active');
                    bigNumberDisplay.classList.remove('fade-out');
                    bigNumberDisplay.classList.remove('big-number-pulse');
                    
                    if (settings.displayMode === 'big') {
                        // Hide grid completely when in big mode
                        squaresGrid.style.display = 'none';
                        bigNumberDisplay.style.display = 'flex';
                        
                        // Clear the big number display
                        bigNumberDisplay.innerHTML = '';
                        
                        // Create the dots grid
                        const dotsGrid = createDotsGrid();
                        bigNumberDisplay.appendChild(dotsGrid);
                        
                        // Show the current count in big display
                        const currentDayData = dayData[currentDay - 1];
                        if (currentDayData.count > 0) {
                            // Create number element
                            const numberElement = document.createElement('div');
                            numberElement.style.color = currentDayData.coloredSquares.length > 0 ? 
                                currentDayData.coloredSquares[currentDayData.coloredSquares.length - 1].color : '#e0e0e0';
                            numberElement.style.fontSize = 'inherit';
                            numberElement.style.display = 'flex';
                            numberElement.style.justifyContent = 'center';
                            numberElement.style.alignItems = 'center';
                            numberElement.style.width = '100%';
                            numberElement.style.height = '100%';
                            numberElement.style.position = 'relative';
                            numberElement.style.zIndex = '1';
                            numberElement.textContent = currentDayData.count;
                            
                            // Add the number element to the display
                            bigNumberDisplay.appendChild(numberElement);
                            
                            // Update the dots grid based on the current count
                            updateDots(currentDayData.count);
                            // Color is now applied directly to the numberElement, not needed here
                        } else {
                            // Create number element for zero count
                            const numberElement = document.createElement('div');
                            numberElement.style.color = '#888';
                            numberElement.style.fontSize = 'inherit';
                            numberElement.style.display = 'flex';
                            numberElement.style.justifyContent = 'center';
                            numberElement.style.alignItems = 'center';
                            numberElement.style.width = '100%';
                            numberElement.style.height = '100%';
                            numberElement.style.position = 'relative';
                            numberElement.style.zIndex = '1';
                            numberElement.textContent = '0';
                            
                            // Add the number element to the display
                            bigNumberDisplay.appendChild(numberElement);
                            
                            // No dots to update when count is 0
                        }
                    } else {
                        // Show grid for other modes
                        squaresGrid.style.display = 'grid';
                        bigNumberDisplay.style.display = 'none';
                        
                        // Always rearrange squares when switching between modes
                        if (previousMode !== settings.displayMode) {
                            // Rearrange all days' data
                            dayData.forEach(day => {
                                if (day.coloredSquares && day.coloredSquares.length > 0) {
                                    // Rearrange positions
                                    if (settings.displayMode === 'sequential') {
                                        // Sequential: assign positions 0 to count-1
                                        day.coloredSquares.forEach((square, index) => {
                                            square.position = index;
                                        });
                                    } else if (settings.displayMode === 'random') {
                                        // Random: assign random unique positions
                                        let availablePositions = Array.from({length: 100}, (_, i) => i);
                                        day.coloredSquares.forEach((square) => {
                                            // Get random position from available positions
                                            const randomIndex = Math.floor(Math.random() * availablePositions.length);
                                            square.position = availablePositions[randomIndex];
                                            // Remove used position
                                            availablePositions.splice(randomIndex, 1);
                                        });
                                    }
                                }
                            });
                            
                            // Regenerate the grid for the current day
                            regenerateGrid();
                        }
                    }
                    
                    // Save the new settings
                    saveProgress();
                }
            });
        });
    }
    
    function updateButtonAppearance() {
        const currentDayData = dayData[currentDay - 1];
        const isCurrentDayComplete = currentDayData.completed;
        
        // Disable button if day is completed
        countButton.disabled = isCurrentDayComplete;
        
        if (isCurrentDayComplete) {
            // Replace the icon with the word "DONE"
            const plusIcon = countButton.querySelector('.plus-icon');
            if (plusIcon) {
                // Create text that says "DONE" instead of a checkmark
                plusIcon.innerHTML = '<text x="50" y="55" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Inconsolata, monospace" font-weight="bold" font-size="24">DONE</text>';
            }
            countButton.style.backgroundColor = '#555'; // Reset to default gray when completed
        } else {
            // Restore plus icon for incomplete state
            const plusIcon = countButton.querySelector('.plus-icon');
            if (plusIcon) {
                plusIcon.innerHTML = '<path d="M50 15 A5 5 0 0 1 55 20 L55 45 L80 45 A5 5 0 0 1 85 50 A5 5 0 0 1 80 55 L55 55 L55 80 A5 5 0 0 1 50 85 A5 5 0 0 1 45 80 L45 55 L20 55 A5 5 0 0 1 15 50 A5 5 0 0 1 20 45 L45 45 L45 20 A5 5 0 0 1 50 15 Z" fill="white"/>';
            }
            
            // Set the button color to the last colored square if available, or default green
            if (currentDayData.coloredSquares.length > 0) {
                const lastColoredSquare = currentDayData.coloredSquares[currentDayData.coloredSquares.length - 1];
                countButton.style.backgroundColor = lastColoredSquare.color;
            } else {
                countButton.style.backgroundColor = '#4CAF50'; // Default green
            }
        }
    }
    
    function handleCountClick() {
        // Get current day data
        const currentDayData = dayData[currentDay - 1];
        
        // If day already completed or already at 100, don't do anything
        if (currentDayData.completed || currentDayData.count >= 100) {
            return;
        }
        
        // Generate a muted color for the square
        const color = generateMutedColor();
        
        // Add click to queue with minimal data
        clickQueue.push({
            color: color,
            dayData: currentDayData
        });
        
        // Process the queue if not already processing
        if (!processingQueue) {
            processClickQueue();
        }
        
        // Apply a more pronounced scale-down animation to simulate a button press
        // First clear any existing animations
        countButton.classList.remove('pulse');
        
        // Get the plus icon SVG for additional animation
        const plusIcon = countButton.querySelector('.plus-icon');
        
        // Apply scale down effect to the button
        countButton.style.transform = 'scale(0.8)';
        countButton.style.transition = 'transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        
        // Also scale the icon for additional effect
        if (plusIcon) {
            plusIcon.style.transform = 'scale(0.8) rotate(-10deg)';
            plusIcon.style.transition = 'transform 0.15s ease';
        }
        
        // Return to normal after a short delay
        setTimeout(() => {
            countButton.style.transform = 'scale(1.1)';
            if (plusIcon) {
                plusIcon.style.transform = 'scale(1.1) rotate(5deg)';
            }
            
            // Final return to normal size
            setTimeout(() => {
                countButton.style.transform = 'scale(1)';
                countButton.style.transition = '';
                if (plusIcon) {
                    plusIcon.style.transform = 'scale(1) rotate(0)';
                    plusIcon.style.transition = '';
                }
            }, 150);
        }, 150);
    }
    
    // Revised function to process the click queue
    function processClickQueue() {
        // If queue is empty, stop processing
        if (clickQueue.length === 0) {
            processingQueue = false;
            return;
        }
        
        // Mark as processing
        processingQueue = true;
        
        // Get the next click from the queue - ONLY ONE AT A TIME
        const clickData = clickQueue.shift();
        
        if (!clickData) {
            processingQueue = false;
            return;
        }
        
        const { color, dayData } = clickData;
        
        // Check if we've already reached 100 - enforce the limit
        if (dayData.count >= 100) {
            // Skip this click and process the next one
            processingQueue = false;
            if (clickQueue.length > 0) {
                setTimeout(processClickQueue, 10);
            }
            return;
        }
        
        // Calculate the next sequential number
        // This ensures we never skip numbers, even with rapid clicks
        const existingNumbers = dayData.coloredSquares.map(square => square.number);
        lastProcessedNumber++;
        
        // Skip this number if it's already been used
        while (existingNumbers.includes(lastProcessedNumber)) {
            lastProcessedNumber++;
        }
        
        // Use the calculated sequential number, but cap at 100
        const nextNumber = Math.min(lastProcessedNumber, 100);
        
        // Update the day data count, capped at 100
        dayData.count = Math.min(Math.max(dayData.count, nextNumber), 100);
        
        // Handle differently based on display mode
        if (settings.displayMode === 'big') {
            // Big mode - direct and simple approach
            handleBigModeClick(nextNumber, color);
        } else {
            // Grid mode - instant processing just like Big mode
            handleGridModeClick(dayData, color, nextNumber);
        }
        
        // Check completion after processing the click
        checkCompletionAndSave(dayData);
        
        // Continue processing queue with a slight delay to allow animations to be visible
        if (clickQueue.length > 0) {
            // Use setTimeout with a small delay to make animations visible even with rapid clicks
            setTimeout(processClickQueue, 150);
        } else {
            processingQueue = false;
        }
    }
    
    // New function to handle Grid mode clicks - updated to accept explicit number parameter
    function handleGridModeClick(currentDayData, color, number) {
        let position;
        
        if (settings.displayMode === 'random') {
            position = getNextRandomPosition();
        } else if (settings.displayMode === 'sequential') {
            position = number - 1; // Position is 0-indexed
        }
        
        // Update the button color to match the latest square - match Big mode behavior
        countButton.style.backgroundColor = color;
        
        // Add a pop-in animation to the square
        const squares = document.querySelectorAll('.square');
        if (position < squares.length) {
            const square = squares[position];
            
            // First set initial state for animation
            square.style.backgroundColor = color;
            square.textContent = number;
            square.classList.add('colored');
            
            // Set initial state for stronger pop-in animation
            square.style.opacity = '0';
            square.style.transform = 'scale(0)';
            
            // Force reflow to ensure animation plays
            void square.offsetWidth;
            
            // Use custom animation with more dramatic effect
            square.style.transition = 'transform 0.4s cubic-bezier(0.17, 0.89, 0.32, 1.49), opacity 0.4s ease';
            square.style.transform = 'scale(1.1)';
            square.style.opacity = '1';
            
            // Remove the scaling after the animation completes
            setTimeout(() => {
                square.style.transform = 'scale(1)';
            }, 350);
        }
        
        // Get current day data and add the square
        const squareData = { 
            position: position,
            color: color,
            number: number
        };
        
        // Add the square data
        currentDayData.coloredSquares.push(squareData);
        
        // Update the count if needed
        if (currentDayData.count < number) {
            currentDayData.count = number;
        }
    }
    
    function getAvailablePositions() {
        const squares = document.querySelectorAll('.square');
        const currentDayData = dayData[currentDay - 1];
        const usedPositions = currentDayData.coloredSquares.map(square => square.position);
        
        // Get all positions that haven't been used yet
        const availablePositions = [];
        for (let i = 0; i < squares.length; i++) {
            if (!usedPositions.includes(i)) {
                availablePositions.push(i);
            }
        }
        
        return availablePositions;
    }
    
    function getNextRandomPosition() {
        // Always get fresh available positions to ensure numbers never overlap
        const availablePositions = getAvailablePositions();
        
        if (availablePositions.length === 0) {
            // Fallback if no positions available
            return 0;
        }
        
        // Choose a random position from available positions
        const randomIndex = Math.floor(Math.random() * availablePositions.length);
        return availablePositions[randomIndex];
    }
    
    function showCongratulations() {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.classList.add('overlay');
        
        // Create congrats message
        const congratsContainer = document.createElement('div');
        congratsContainer.classList.add('congrats-container');
        
        const congratsHeading = document.createElement('h2');
        congratsHeading.textContent = 'Congratulations!';
        
        const congratsMessage = document.createElement('p');
        congratsMessage.textContent = 'You have successfully completed the 100 Times Challenge for all 7 days!';
        
        // Add the user's motivation text if available
        if (userMotivation && userMotivation.trim() !== '') {
            const motivationMessage = document.createElement('p');
            motivationMessage.classList.add('motivation-highlight');
            
            // Format the motivation text with proper quotes
            const formattedMotivation = `"${userMotivation.replace(/^"|"$/g, '')}"`;
            motivationMessage.textContent = `You did it! ${formattedMotivation}`;
            
            // Add a pop-in animation to the motivation text
            motivationMessage.style.opacity = '0';
            motivationMessage.style.transform = 'scale(0.5)';
            
            // Append motivation message
            congratsContainer.appendChild(motivationMessage);
            
            // Trigger animation after a slight delay
            setTimeout(() => {
                motivationMessage.style.transition = 'all 0.6s cubic-bezier(0.17, 0.89, 0.32, 1.49)';
                motivationMessage.style.opacity = '1';
                motivationMessage.style.transform = 'scale(1)';
            }, 300);
        }
        
        // Create a confetti effect
        const confettiContainer = document.createElement('div');
        confettiContainer.classList.add('confetti-container');
        
        // Add 50 confetti pieces
        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.classList.add('confetti');
            confetti.style.left = `${Math.random() * 100}%`;
            confetti.style.animationDelay = `${Math.random() * 3}s`;
            confetti.style.backgroundColor = generateMutedColor();
            confettiContainer.appendChild(confetti);
        }
        
        // Create reset button
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Start New Challenge';
        resetButton.classList.add('reset-button');
        resetButton.addEventListener('click', () => {
            // Save the current display mode settings before resetting
            const currentSettings = { 
                darkMode: settings.darkMode, 
                displayMode: settings.displayMode 
            };
            
            // Remove all data from localStorage
            localStorage.removeItem(STORAGE_KEY);
            
            // Create new data with preserved settings
            const newData = {
                dayData: [],
                currentDay: 1,
                userMotivation: '',
                settings: currentSettings
            };
            
            // Save the new data with preserved settings
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
            
            // Reload the page to apply changes
            location.reload();
        });
        
        // Append elements
        congratsContainer.appendChild(congratsHeading);
        congratsContainer.appendChild(congratsMessage);
        congratsContainer.appendChild(resetButton);
        
        overlay.appendChild(confettiContainer);
        overlay.appendChild(congratsContainer);
        document.body.appendChild(overlay);
    }
    
    function showDayCompletionMessage() {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.classList.add('overlay');
        overlay.style.zIndex = '1000';
        
        // Create congrats message
        const congratsContainer = document.createElement('div');
        congratsContainer.classList.add('congrats-container');
        congratsContainer.classList.add('day-completion');
        
        const congratsHeading = document.createElement('h2');
        congratsHeading.textContent = `Day ${currentDay} Complete!`;
        
        const congratsMessage = document.createElement('p');
        congratsMessage.textContent = 'You have reached 100 times for today!';
        
        // Add the user's motivation text if available
        if (userMotivation && userMotivation.trim() !== '') {
            const motivationMessage = document.createElement('p');
            motivationMessage.classList.add('motivation-highlight');
            
            // Format the motivation text with proper quotes
            const formattedMotivation = `"${userMotivation.replace(/^"|"$/g, '')}"`;
            motivationMessage.textContent = formattedMotivation;
            
            // Add a pop-in animation to the motivation text
            motivationMessage.style.opacity = '0';
            motivationMessage.style.transform = 'scale(0.5)';
            
            // Append motivation message
            congratsContainer.appendChild(motivationMessage);
            
            // Trigger animation after a slight delay
            setTimeout(() => {
                motivationMessage.style.transition = 'all 0.6s cubic-bezier(0.17, 0.89, 0.32, 1.49)';
                motivationMessage.style.opacity = '1';
                motivationMessage.style.transform = 'scale(1)';
            }, 300);
        }
        
        // Create a mini confetti effect
        const confettiContainer = document.createElement('div');
        confettiContainer.classList.add('confetti-container');
        
        // Add 30 confetti pieces (fewer than final completion)
        for (let i = 0; i < 30; i++) {
            const confetti = document.createElement('div');
            confetti.classList.add('confetti');
            confetti.style.left = `${Math.random() * 100}%`;
            confetti.style.animationDelay = `${Math.random() * 2}s`;
            confetti.style.backgroundColor = generateMutedColor();
            confettiContainer.appendChild(confetti);
        }
        
        // Create continue button
        const continueButton = document.createElement('button');
        continueButton.textContent = 'Continue to Day ' + (currentDay + 1);
        continueButton.classList.add('continue-button');
        
        // Check if we're on the last day
        if (currentDay >= 7) {
            continueButton.textContent = 'Continue';
        }
        
        continueButton.addEventListener('click', () => {
            // Remove the overlay
            document.body.removeChild(overlay);
            // Then move to the next day
            moveToNextDay();
            // Update UI to reflect the new day
            updateUI();
        });
        
        // Append elements
        congratsContainer.appendChild(congratsHeading);
        congratsContainer.appendChild(congratsMessage);
        congratsContainer.appendChild(continueButton);
        
        overlay.appendChild(confettiContainer);
        overlay.appendChild(congratsContainer);
        document.body.appendChild(overlay);
        
        // Auto-dismiss after 5 seconds if user doesn't click continue
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
                moveToNextDay();
                updateUI();
            }
        }, 5000);
    }
    
    function getNextAvailableDay() {
        // Find the next incomplete day
        for (let i = 0; i < dayData.length; i++) {
            if (!dayData[i].completed) {
                return i + 1; // Convert to 1-based index
            }
        }
        // If all days are completed, return the last day
        return dayData.length;
    }
    
    function moveToNextDay() {
        // Find the next incomplete day
        const nextDay = getNextAvailableDay();
        
        // If we found a next day, switch to it
        if (nextDay > 0) {
            currentDay = nextDay;
            
            // Ensure the day data is properly initialized for a fresh start
            const nextDayData = dayData[currentDay - 1];
            
            // Reset lastProcessedNumber to match the current count
            // This ensures we start counting from the right place
            lastProcessedNumber = nextDayData.count;
            
            // If this day hasn't been started yet (count is 0)
            if (nextDayData.count === 0) {
                // Make sure coloredSquares is initialized as an empty array
                nextDayData.coloredSquares = [];
            }
        }
    }
    
    function saveProgress() {
        // Already handled via the input event listener
        // No need to update userMotivation here to avoid conflicts
        
        // Ensure all data is properly ordered and consistent before saving
        dayData.forEach(day => {
            if (day.coloredSquares.length > 0) {
                // Sort by number for consistency
                day.coloredSquares.sort((a, b) => a.number - b.number);
                
                // Make sure count reflects the highest number
                const highestNumber = day.coloredSquares[day.coloredSquares.length - 1].number;
                if (day.count < highestNumber) {
                    day.count = highestNumber;
                }
            }
        });
        
        // Save to local storage
        saveDataToLocalStorage();
    }
    
    function applyDarkMode() {
        if (settings.darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }
    
    function checkCompletionAndSave(currentDayData) {
        // Check if we reached 100 for this day, mark as completed if so
        if (currentDayData.count >= 100) {
            // Only show completion message if this day wasn't already completed
            const wasAlreadyCompleted = currentDayData.completed;
            currentDayData.completed = true;
            
            // Check if all 7 days are completed
            const allDaysCompleted = dayData.every(day => day.completed);
            
            if (allDaysCompleted) {
                // Show the final congratulations if all days are done
                showCongratulations();
            } else if (!wasAlreadyCompleted) {
                // Show day completion message and move to next day
                // only if we just completed this day now
                showDayCompletionMessage();
            }
        }
        
        // Save progress to local storage
        saveProgress();
    }
    
    // Function to create the dots grid for big number display
    function createDotsGrid() {
        const dotsGrid = document.createElement('div');
        dotsGrid.className = 'dots-grid';
        dotsGrid.id = 'dots-grid';
        
        // Create 10x10 grid (100 dots)
        for (let i = 0; i < 100; i++) {
            const dot = document.createElement('div');
            dot.className = 'dot';
            dot.dataset.index = i;
            dotsGrid.appendChild(dot);
        }
        
        return dotsGrid;
    }
    
    // Function to update dots based on current number
    function updateDots(number) {
        const dots = document.querySelectorAll('.dot');
        
        if (dots.length === 0) {
            // If dots aren't found, the grid might not be created yet
            return;
        }
        
        // Reset all dots to inactive
        dots.forEach(dot => {
            dot.classList.remove('active');
        });
        
        // Activate dots up to the current number
        for (let i = 0; i < number; i++) {
            if (dots[i]) {
                dots[i].classList.add('active');
            }
        }
    }

    // Completely rewritten function for Big mode
    function handleBigModeClick(number, color) {
        // Update the button color
        countButton.style.backgroundColor = color;
        
        // Get the big number display container
        const bigNumberDisplay = document.querySelector('.big-number-display');
        
        // First, completely remove any existing content
        bigNumberDisplay.innerHTML = '';
        
        // Create the dots grid
        const dotsGrid = createDotsGrid();
        bigNumberDisplay.appendChild(dotsGrid);
        
        // Create a new element for the number
        const newNumber = document.createElement('div');
        newNumber.style.color = color;
        newNumber.style.fontSize = 'inherit';
        newNumber.style.display = 'flex';
        newNumber.style.justifyContent = 'center';
        newNumber.style.alignItems = 'center';
        newNumber.style.width = '100%';
        newNumber.style.height = '100%';
        newNumber.style.position = 'relative';
        newNumber.style.zIndex = '1';
        newNumber.textContent = number;
        
        // Set initial state for animation
        newNumber.style.opacity = '0';
        newNumber.style.transform = 'scale(0)';
        
        // Add the new number to the display
        bigNumberDisplay.appendChild(newNumber);
        
        // Force reflow
        void newNumber.offsetWidth;
        
        // Apply animation
        newNumber.style.transition = 'transform 0.4s cubic-bezier(0.17, 0.89, 0.32, 1.49), opacity 0.4s ease';
        newNumber.style.transform = 'scale(1.1)';
        newNumber.style.opacity = '1';
        
        // Remove the scaling after the animation completes
        setTimeout(() => {
            newNumber.style.transform = 'scale(1)';
        }, 350);
        
        // Apply a pulse animation to the entire counter for extra feedback
        bigNumberDisplay.style.transition = 'transform 0.3s ease';
        bigNumberDisplay.style.transform = 'scale(1.05)';
        setTimeout(() => {
            bigNumberDisplay.style.transform = 'scale(1)';
        }, 300);
        
        // Update the dots grid based on the current number
        updateDots(number);
        
        // Add this square to colored squares with a position for data consistency
        const position = number - 1;
        const squareData = { 
            number: number, 
            color: color,
            position: position
        };
        
        // Get current day data and add the square
        const currentDayData = dayData[currentDay - 1];
        currentDayData.coloredSquares.push(squareData);
    }

    initializeApp();
});
