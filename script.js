// Main app functionality
document.addEventListener('DOMContentLoaded', function() {
    // Constants
    const TOTAL_DAYS = 7;
    const SQUARES_PER_DAY = 100;
    
    // DOM Elements
    const countButton = document.getElementById('count-button');
    const userSentence = document.getElementById('user-sentence');
    const days = document.querySelectorAll('.day');
    const squaresGrid = document.getElementById('squares-grid');
    
    // App state
    let currentDay = 1;
    let currentCount = 0;
    let userMotivation = '';
    let dayData = [];
    
    // Helper functions
    function generateMutedColor() {
        // Generate a random hue from the entire color spectrum (0-360)
        const hue = Math.floor(Math.random() * 360);
        
        // Use lower saturation (40-60%) to make colors less vibrant
        const saturation = 50 + Math.floor(Math.random() * 20); 
        
        // Use medium-high lightness (60-75%) to make colors softer
        const lightness = 50 + Math.floor(Math.random() * 15);
        
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    
    // Initialize the app
    function initializeApp() {
        // Load data or initialize fresh
        loadDataFromLocalStorage();
        
        // Create squares grid
        createSquaresGrid();
        
        // Set up event listeners
        setupEventListeners();
        
        // Update the UI
        updateUI();
    }
    
    function createSquaresGrid() {
        const grid = document.getElementById('squares-grid');
        grid.innerHTML = '';
        
        for (let i = 0; i < SQUARES_PER_DAY; i++) {
            const square = document.createElement('div');
            square.classList.add('square');
            grid.appendChild(square);
        }
    }
    
    function loadDataFromLocalStorage() {
        const savedData = localStorage.getItem('100TimesChallenge');
        
        if (savedData) {
            const parsed = JSON.parse(savedData);
            dayData = parsed.dayData || [];
            currentDay = parsed.currentDay || 1;
            userMotivation = parsed.userMotivation || '';
        } else {
            // Initialize fresh data
            dayData = [];
            for (let i = 0; i < TOTAL_DAYS; i++) {
                dayData.push({
                    day: i + 1,
                    count: 0,
                    coloredSquares: [],
                    completed: false
                });
            }
        }
        
        // Ensure we have the correct number of days
        while (dayData.length < TOTAL_DAYS) {
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
            userMotivation: userMotivation
        };
        
        localStorage.setItem('100TimesChallenge', JSON.stringify(dataToSave));
    }
    
    function updateUI() {
        // Update day indicators
        days.forEach((day, index) => {
            // Clear existing classes
            day.classList.remove('active', 'completed', 'past');
            
            const dayNumber = index + 1;
            if (dayNumber < currentDay) {
                // Check if this day is completed
                if (dayData[index].completed) {
                    day.classList.add('completed');
                } else {
                    day.classList.add('past');
                }
            } else if (dayNumber === currentDay) {
                day.classList.add('active');
            }
            // Future days have no class, they'll use the default styling
        });
        
        // Update squares
        const squares = document.querySelectorAll('.square');
        squares.forEach(square => {
            // Reset all squares
            square.style.backgroundColor = '';
            square.classList.remove('colored');
            square.textContent = '';
        });
        
        // Color the squares for current day
        const currentDayData = dayData[currentDay - 1];
        currentCount = currentDayData.count;
        
        currentDayData.coloredSquares.sort((a, b) => a.displayOrder - b.displayOrder);
        
        currentDayData.coloredSquares.forEach((data) => {
            if (data.index < squares.length) {
                const square = squares[data.index];
                square.style.backgroundColor = data.color;
                square.classList.add('colored');
                square.textContent = data.displayOrder;
            }
        });
        
        // Update user sentence
        userSentence.value = userMotivation;
        
        // Disable button if day is completed
        countButton.disabled = currentDayData.completed;
        
        // Handle button appearance
        if (currentDayData.completed) {
            // Change text to checkmark for completed days
            countButton.textContent = "✓";
            countButton.classList.add('completed');
            countButton.style.backgroundColor = '#555'; // Reset to default gray when completed
        } else {
            // Ensure plus sign is displayed for active days
            countButton.textContent = "+";
            countButton.classList.remove('completed');
            
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
        
        // Modify the touchend handler to avoid interfering with button taps
        document.addEventListener('touchend', function(e) {
            // Only prevent default on non-button interactive elements
            if (e.target.closest('.day, .square, .gear-icon, #reset-button') && 
                !e.target.closest('#count-button')) {
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
        });
        
        // Save user sentence
        userSentence.addEventListener('input', function() {
            userMotivation = this.value;
            saveDataToLocalStorage();
        });
        
        // Settings panel toggle
        const settingsToggle = document.getElementById('settings-toggle');
        const settingsPanel = document.getElementById('settings-panel');
        
        settingsToggle.addEventListener('click', function() {
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
                localStorage.removeItem('100TimesChallenge');
                location.reload();
            }
        });
    }
    
    function handleCountClick() {
        const currentDayData = dayData[currentDay - 1];
        
        // Check if this day is already completed
        if (currentDayData.completed) {
            return;
        }
        
        if (currentCount < SQUARES_PER_DAY) {
            currentCount++;
            
            // Find available squares (those not yet colored)
            const squares = document.querySelectorAll('.square');
            const availableIndices = [];
            
            for (let i = 0; i < squares.length; i++) {
                const isAlreadyColored = currentDayData.coloredSquares.some(square => square.index === i);
                if (!isAlreadyColored) {
                    availableIndices.push(i);
                }
            }
            
            // Randomly select an available square
            const randomIndex = Math.floor(Math.random() * availableIndices.length);
            const selectedSquareIndex = availableIndices[randomIndex];
            
            // Generate a muted color
            const color = generateMutedColor();
            
            // Add colored square to the data
            const coloredSquare = {
                index: selectedSquareIndex,
                color: color,
                displayOrder: currentCount
            };
            
            dayData[currentDay - 1].coloredSquares.push(coloredSquare);
            
            // If this day is now complete, mark it as such
            if (currentCount >= SQUARES_PER_DAY) {
                dayData[currentDay - 1].completed = true;
                
                // Check if all days are completed
                const allCompleted = dayData.every(day => day.completed);
                if (allCompleted) {
                    // All days completed!
                    alert('Congratulations! You have completed the 100 Times Challenge for all 7 days!');
                } else {
                    // Current day completed
                    alert(`Day ${currentDay} completed! You've counted to 100!`);
                    
                    // Move to the next uncompleted day
                    for (let i = 0; i < dayData.length; i++) {
                        if (!dayData[i].completed) {
                            currentDay = i + 1;
                            break;
                        }
                    }
                }
            }
            
            // Save data and update UI
            dayData[currentDay - 1].count = currentCount;
            saveDataToLocalStorage();
            updateUI();
        }
    }
    
    initializeApp();
});
