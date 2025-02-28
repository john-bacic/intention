// Register service worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
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
    let settings = { darkMode: false };
    
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
        loadDataFromLocalStorage();
        
        // Create squares grid
        generateSquares();
        
        // Set up event listeners
        setupEventListeners();
        
        // Update the UI
        updateUI();
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
    
    function loadDataFromLocalStorage() {
        const savedData = localStorage.getItem(STORAGE_KEY);
        
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                dayData = parsed.dayData || dayData;
                currentDay = parsed.currentDay || 1;
                userMotivation = parsed.userMotivation || '';
                settings = parsed.settings || { darkMode: false };
                
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
                });
                
                applyDarkMode();
            } catch (e) {
                console.error('Error parsing saved data:', e);
                // Initialize with defaults if there's an error
                initializeData();
            }
        } else {
            // No saved data, use defaults
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
    }
    
    function saveDataToLocalStorage() {
        const dataToSave = {
            dayData: dayData,
            currentDay: currentDay,
            userMotivation: userMotivation,
            settings: settings
        };
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }
    
    function updateUI() {
        // Update days
        days.forEach((day, index) => {
            const dayNumber = index + 1;
            const isCurrentDay = dayNumber === currentDay;
            const isDayCompleted = dayData[index].completed;
            
            // Reset day style
            day.style.backgroundColor = '';
            day.style.color = '';
            
            // Get the day label element
            const dayLabel = day.querySelector('.day-label');
            
            // Hide day label by default
            if (dayLabel) {
                dayLabel.style.opacity = '0';
            }
            
            if (isCurrentDay) {
                // Highlight current day
                day.style.backgroundColor = '#4CAF50';
                day.style.color = 'white';
                
                // Show day label only for current day
                if (dayLabel) {
                    dayLabel.style.opacity = '1';
                }
            } else if (dayNumber < currentDay || isDayCompleted) {
                // Past days
                day.style.backgroundColor = '#888';
                day.style.color = 'white';
            }
        });
        
        // Update user sentence
        if (userSentence) userSentence.value = userMotivation;
        
        // Update button appearance based on completion state
        updateButtonAppearance();
        
        // Regenerate the grid with current data
        regenerateGrid();
    }
    
    function regenerateGrid() {
        // Clear grid
        squaresGrid.innerHTML = '';
        
        // Generate new squares (all empty initially)
        for (let i = 1; i <= 100; i++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.textContent = i; // Set numbers but they'll be transparent initially
            squaresGrid.appendChild(square);
        }
        
        // Color the squares that have already been marked (without animation)
        const currentDayData = dayData[currentDay - 1];
        const squares = document.querySelectorAll('.square');
        
        currentDayData.coloredSquares.forEach(squareData => {
            const position = squareData.position || 0; // Default to 0 if position is undefined
            if (position < squares.length) {
                const square = squares[position];
                square.classList.add('colored');
                square.style.backgroundColor = squareData.color;
                square.textContent = squareData.number;
                // No animation or transition for already colored squares
                square.style.transform = 'scale(1)';
                square.style.opacity = '1';
                square.style.transition = 'none';
            }
        });
    }
    
    function updateButtonAppearance() {
        const currentDayData = dayData[currentDay - 1];
        const isCurrentDayComplete = currentDayData.completed;
        
        // Disable button if day is completed
        countButton.disabled = isCurrentDayComplete;
        
        if (isCurrentDayComplete) {
            // Update SVG to checkmark for completed state
            const plusIcon = countButton.querySelector('.plus-icon');
            if (plusIcon) {
                plusIcon.innerHTML = '<path d="M25 55 L45 75 L75 30" stroke="white" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
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
    
    function setupEventListeners() {
        // Count button event - adding both click and touchstart for better mobile response
        countButton.addEventListener('click', handleCountClick);
        countButton.addEventListener('touchstart', function(e) {
            e.preventDefault(); // Prevent default to avoid delays
            handleCountClick();
        });
        
        // Settings panel toggle - adding touchstart for better mobile response
        const settingsToggle = document.getElementById('settings-toggle');
        const settingsPanel = document.getElementById('settings-panel');
        
        settingsToggle.addEventListener('click', function() {
            settingsPanel.classList.toggle('active');
        });
        
        settingsToggle.addEventListener('touchstart', function(e) {
            e.preventDefault(); // Prevent default to avoid delays
            settingsPanel.classList.toggle('active');
        });
        
        // Reset button - adding touchstart for better mobile response
        const resetButton = document.getElementById('reset-button');
        
        resetButton.addEventListener('click', function() {
            if (confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            }
        });
        
        resetButton.addEventListener('touchstart', function(e) {
            e.preventDefault(); // Prevent default to avoid delays
            if (confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
                localStorage.removeItem(STORAGE_KEY);
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
                
                if (selectedDay <= currentDay) {
                    currentDay = selectedDay;
                    updateUI();
                }
            });
            
            day.addEventListener('touchstart', function(e) {
                e.preventDefault(); // Prevent default to avoid delays
                
                // Get the day number element
                const dayNumberElement = this.querySelector('.day-number');
                const selectedDay = parseInt(dayNumberElement.textContent);
                
                if (selectedDay <= currentDay) {
                    currentDay = selectedDay;
                    updateUI();
                }
            });
        });
        
        // Save user sentence
        userSentence.addEventListener('input', function() {
            userMotivation = this.value;
            saveDataToLocalStorage();
        });
        
        // Close settings panel when clicking outside
        document.addEventListener('click', function(event) {
            if (!settingsPanel.contains(event.target) && event.target !== settingsToggle) {
                settingsPanel.classList.remove('active');
            }
        });
    }
    
    function handleCountClick() {
        // Get current day data
        const currentDayData = dayData[currentDay - 1];
        
        // If day already completed, don't do anything
        if (currentDayData.completed) {
            return;
        }
        
        // Generate a muted color for the square
        const color = generateMutedColor();
        
        // Increment count
        currentDayData.count++;
        
        // Find a random available position in the grid
        const availablePositions = getAvailablePositions();
        if (availablePositions.length === 0) {
            // This shouldn't happen, but just in case
            return;
        }
        
        // Pick a random position
        const randomIndex = Math.floor(Math.random() * availablePositions.length);
        const position = availablePositions[randomIndex];
        
        // Add this square to colored squares
        const squareData = { 
            number: currentDayData.count, 
            color: color,
            position: position
        };
        currentDayData.coloredSquares.push(squareData);
        
        // Update the button color to match the latest square
        countButton.style.backgroundColor = color;
        
        // Color the square directly - this is more reliable for animation
        colorSquareDirectly(position, currentDayData.count, color);
        
        // Check if we reached 100 for this day, mark as completed if so
        if (currentDayData.count >= 100) {
            currentDayData.completed = true;
            
            // Check if all 7 days are completed
            const allDaysCompleted = dayData.every(day => day.completed);
            if (allDaysCompleted) {
                showCongratulations();
            } else {
                // Move to next day if not all days completed
                moveToNextDay();
            }
        }
        
        // Save progress to local storage
        saveProgress();
        
        // This will be called after the animation completes
        setTimeout(() => {
            updateUI();
        }, 500);
        
        // Apply a small scale animation to the button
        countButton.classList.add('button-pressed');
        setTimeout(() => {
            countButton.classList.remove('button-pressed');
        }, 150);
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
    
    function colorSquareDirectly(position, number, color) {
        const squares = document.querySelectorAll('.square');
        if (position < squares.length) {
            const square = squares[position];
            
            // Set the initial styles for animation
            square.style.transform = 'scale(0.01)';
            square.style.opacity = '0';
            square.style.transition = 'transform 0.5s cubic-bezier(0.18, 1.65, 0.58, 0.9), opacity 0.3s ease-out';
            square.style.backgroundColor = color;
            square.textContent = number;
            square.classList.add('colored');
            
            // Force reflow
            void square.offsetWidth;
            
            // Trigger animation with a very slight delay
            setTimeout(() => {
                square.style.transform = 'scale(1)';
                square.style.opacity = '1';
            }, 10);

            // Add an extra bounce after the initial animation
            setTimeout(() => {
                square.style.transform = 'scale(1.2)';
                
                setTimeout(() => {
                    square.style.transform = 'scale(1)';
                }, 100);
                
            }, 300);
        }
    }
    
    function showCongratulations() {
        alert('Congratulations! You have completed the 100 Times Challenge for all 7 days!');
    }
    
    function moveToNextDay() {
        for (let i = 0; i < dayData.length; i++) {
            if (!dayData[i].completed) {
                currentDay = i + 1;
                break;
            }
        }
    }
    
    function saveProgress() {
        saveDataToLocalStorage();
    }
    
    function applyDarkMode() {
        if (settings.darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }
    
    initializeApp();
});
