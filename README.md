# 100 Times Challenge

A simple web app for tracking a 7-day challenge of counting to 100 each day.

## Features

- 7 days tracker at the top of the screen
- 10x10 grid with 100 squares to track daily progress
- Animated squares with scale effect when they appear
- Random position generation for numbers
- Custom motivation sentence input
- Big button to count and light up squares
- Progress automatically saved in local storage
- Responsive design that works on both desktop and mobile
- No scrolling required - fits on any screen

## How to Use

1. Open `index.html` in a web browser
2. Enter your motivation sentence in the input field
3. Press the COUNT button to light up a square in a random color
4. Continue pressing the button until you've reached 100 for the day
5. The app will automatically move to the next day when you complete 100 counts
6. You can click on previous day indicators to review your progress

## Storage

All your progress is automatically saved in your browser's local storage, so you can close the app and come back later without losing your progress.

## Reset Progress

If you need to reset your progress for any reason, open your browser's developer console and run:
```javascript
localStorage.removeItem('100TimesChallenge');
location.reload();
```

## Open the App

Simply double-click on the `index.html` file to open it in your default web browser.

## Progressive Web App

This app can be installed on your device as a PWA. When visiting the site, you'll see an "Add to Home Screen" option in your browser.
