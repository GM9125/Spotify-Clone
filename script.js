const clientId = '998f99d0b45242729013c2346b8afff3';
const redirectUri = 'http://127.0.0.1:5500/';

let currentTrackUri = null;
let currentTrackIndex = 0;
let trackList = [];
let player;
let device_id;
let progressInterval;
let currentTrackState = null;

// Adding these SVG volume icons definitions as constants
const VOLUME_ICONS = {
    HIGH: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M9.741.85a.75.75 0 01.375.65v13a.75.75 0 01-1.125.65l-6.925-4a3.642 3.642 0 01-1.33-4.967 3.639 3.639 0 011.33-1.332l6.925-4a.75.75 0 01.75 0zm-6.924 5.3a2.139 2.139 0 000 3.7l5.8 3.35V2.8l-5.8 3.35zm8.683 4.29V5.56a2.75 2.75 0 010 4.88z"/>
        <path d="M11.5 13.614a5.752 5.752 0 000-11.228v1.55a4.252 4.252 0 010 8.127v1.55z"/>
    </svg>`,
    LOW: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M9.741.85a.75.75 0 01.375.65v13a.75.75 0 01-1.125.65l-6.925-4a3.642 3.642 0 01-1.33-4.967 3.639 3.639 0 011.33-1.332l6.925-4a.75.75 0 01.75 0zm-6.924 5.3a2.139 2.139 0 000 3.7l5.8 3.35V2.8l-5.8 3.35zm8.683 4.29V5.56a2.75 2.75 0 010 4.88z"/>
    </svg>`,
    MUTED: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M9.741.85a.75.75 0 01.375.65v13a.75.75 0 01-1.125.65l-6.925-4a3.642 3.642 0 01-1.33-4.967 3.639 3.639 0 011.33-1.332l6.925-4a.75.75 0 01.75 0zm-6.924 5.3a2.139 2.139 0 000 3.7l5.8 3.35V2.8l-5.8 3.35z"/>
        <line x1="15" y1="1" x2="1" y2="15" stroke="currentColor" stroke-width="1.5"/>
    </svg>`
};

// Generating a random string for the state parameter
function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
const state = generateRandomString(16);

// Spotify API scopes
const scope = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-library-read';

// Function to get the Spotify access token
function getAccessToken() {
    const params = new URLSearchParams(window.location.hash.substring(1));
    return params.get('access_token');
}

// Redirecting the user to Spotify's authorization page
function redirectToSpotifyAuthorization() {
    const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(scope)}`;
    window.location = url;
}

async function init() {
    const accessToken = getAccessToken();
    if (!accessToken) {
        redirectToSpotifyAuthorization();
        return;
    }

    initializeSearch();

    // Wait for Spotify SDK to load
    await new Promise(resolve => {
        if (window.Spotify) {
            resolve(window.Spotify);
        } else {
            window.onSpotifyWebPlaybackSDKReady = () => {
                resolve(window.Spotify);
            };
        }
    });

    // Initialize player
    player = new Spotify.Player({
        name: 'Spotify Clone Player',
        getOAuthToken: cb => { cb(accessToken); },
        volume: 0.5
    });

    // Error handling
    player.addListener('initialization_error', ({ message }) => { 
        console.error('Failed to initialize:', message); 
    });
    player.addListener('authentication_error', ({ message }) => { 
        console.error('Failed to authenticate:', message); 
    });
    player.addListener('account_error', ({ message }) => { 
        console.error('Failed to validate Spotify account:', message); 
    });
    player.addListener('playback_error', ({ message }) => { 
        console.error('Failed to perform playback:', message); 
    });

    // Playback status updates
    player.addListener('player_state_changed', state => {
        if (state) {
            currentTrackState = state;
            console.log('Player State:', state);
            updatePlaybar(state.track_window.current_track);
            updateTrackProgress(state);
            togglePlayPauseButtons(!state.paused);
            handleProgressBar(state);
        }
    });

    // Ready
    player.addListener('ready', ({ device_id: id }) => {
        console.log('Ready with Device ID', id);
        device_id = id;
        
        // Initialize track list and add event listeners
        const buttons = document.querySelectorAll('.play-btn');
        trackList = Array.from(buttons).map(button => button.dataset.uri);
        
        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                const uri = e.currentTarget.dataset.uri;
                playTrack(uri);
            });
        });

        // Setup controls
        setupPlayerControls();
    });

    // Connect to the player
    const connected = await player.connect();
    if (connected) {
        console.log('Successfully connected to Spotify Player');
    }
}

// Add this new function to set up player controls
function setupPlayerControls() {
    document.getElementById('playButton').addEventListener('click', () => player.resume());
    document.getElementById('pauseButton').addEventListener('click', () => player.pause());
    document.getElementById('nextButton').addEventListener('click', playNextTrack);
    document.getElementById('prevButton').addEventListener('click', playPrevTrack);
    
    setupVolumeControl();
    setupProgressBarSeek();
}
// Function to setup volume control with precise interaction
function setupVolumeControl() {
    const volumeBar = document.querySelector('.volume-bar');
    const volume = document.querySelector('.volume');
    const volumeHandle = document.querySelector('.volume-handle');
    const volumeButton = document.getElementById('volumeButton');
    let previousVolume = 0.5; // Default volume
    let isMuted = false;

    // Getting saved volume
    const savedVolume = localStorage.getItem('spotifyCloneVolume');
    if (savedVolume !== null) {
        const volumeLevel = parseFloat(savedVolume);
        updateVolume(volumeLevel);
    }

    // Update volume icon based on current volume level
    function updateVolumeIcon(volumeLevel) {
        if (volumeLevel === 0 || isMuted) {
            volumeButton.innerHTML = VOLUME_ICONS.MUTED;
        } else if (volumeLevel < 0.5) {
            volumeButton.innerHTML = VOLUME_ICONS.LOW;
        } else {
            volumeButton.innerHTML = VOLUME_ICONS.HIGH;
        }
    }

    // Function to update volume level
    function updateVolume(volumeLevel) {
        volume.style.width = `${volumeLevel * 100}%`;
        player.setVolume(volumeLevel).then(() => {
            updateVolumeIcon(volumeLevel);
            localStorage.setItem('spotifyCloneVolume', volumeLevel.toString());
        });
    }

    // Volume bar click handling
    volumeBar.addEventListener('click', (e) => {
        const barRect = volumeBar.getBoundingClientRect();
        const offsetX = Math.min(Math.max(0, e.clientX - barRect.left), barRect.width);
        const volumeLevel = offsetX / barRect.width;
        isMuted = volumeLevel === 0;
        updateVolume(volumeLevel);
    });

    //Volume Bar Dragging functionality
    let isDragging = false;

    volumeHandle.addEventListener('mousedown', () => {
        isDragging = true;
        document.body.style.cursor = 'pointer';
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const barRect = volumeBar.getBoundingClientRect();
            const offsetX = Math.min(Math.max(0, e.clientX - barRect.left), barRect.width);
            const volumeLevel = offsetX / barRect.width;
            isMuted = volumeLevel === 0;
            updateVolume(volumeLevel);
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.cursor = 'default';
    });

    // Mute/Unmute functionality
    volumeButton.addEventListener('click', () => {
        player.getVolume().then(currentVolume => {
            if (currentVolume > 0 && !isMuted) {
                previousVolume = currentVolume;
                isMuted = true;
                updateVolume(0);
            } else {
                isMuted = false;
                updateVolume(previousVolume);
            }
        });
    });

    // Initialize volume icon
    updateVolumeIcon(0.5);
}

// Function to setup progress bar seek functionality
function setupProgressBarSeek() {
    const progressBar = document.querySelector('.progress-bar');
    const progress = document.querySelector('.progress');
    let isDragging = false;

    function updateSeekPosition(clientX) {
        if (currentTrackState && player) {
            const rect = progressBar.getBoundingClientRect();
            const offsetX = Math.min(Math.max(0, clientX - rect.left), rect.width);
            const percentage = offsetX / rect.width;
            
            // Update visual progress
            progress.style.width = `${percentage * 100}%`;
            
            // Calculate and return seek position
            return percentage * currentTrackState.duration;
        }
        return null;
    }

    // Click handling
    progressBar.addEventListener('click', (event) => {
        if (!isDragging) {  // Only handle click if not dragging
            const seekPosition = updateSeekPosition(event.clientX);
            if (seekPosition !== null) {
                player.seek(seekPosition);
            }
        }
    });

    // Drag handling
    progressBar.addEventListener('mousedown', () => {
        isDragging = true;
        document.body.style.cursor = 'pointer';
    });

    document.addEventListener('mousemove', (event) => {
        if (isDragging) {
            updateSeekPosition(event.clientX);
        }
    });

    document.addEventListener('mouseup', (event) => {
        if (isDragging) {
            const seekPosition = updateSeekPosition(event.clientX);
            if (seekPosition !== null) {
                player.seek(seekPosition);
            }
            isDragging = false;
            document.body.style.cursor = 'default';
        }
    });
}

// Function to play a track with optimized loading
async function playTrack(uri) {
    currentTrackUri = uri;
    currentTrackIndex = trackList.indexOf(uri);

    try {
        const result = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device_id}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [uri] }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAccessToken()}`
            }
        });

        if (!result.ok) {
            console.error('Failed to play track:', result.statusText);
        }
    } catch (error) {
        console.error('Error playing track:', error);
    }
}

// Function to update the playbar with track details
function updatePlaybar(track) {
    document.querySelector('.song-img').style.backgroundImage = `url(${track.album.images[0].url})`;
    document.querySelector('.song-title').textContent = track.name;
    document.querySelector('.song-artist').textContent = track.artists.map(artist => artist.name).join(', ');
    document.querySelectorAll('.time')[1].textContent = formatDuration(track.duration_ms); // Total duration
}

// Function to update the track progress
function updateTrackProgress(state) {
    const progress = (state.position / state.duration) * 100;
    document.querySelector('.progress').style.width = `${progress}%`;
    document.querySelectorAll('.time')[0].textContent = formatDuration(state.position); // Current time
}

// Function to handle incremental progress bar updates
function handleProgressBar(state) {
    if (!state) return; // Add null check
    
    clearInterval(progressInterval);
    if (!state.paused) {
        let lastPosition = state.position;
        progressInterval = setInterval(() => {
            lastPosition += 1000;
            if (lastPosition <= state.duration) {
                updateTrackProgress({...state, position: lastPosition});
            } else {
                clearInterval(progressInterval);
            }
        }, 1000);
    }
}

// Function to format duration in milliseconds to mm:ss
function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Function to toggle play/pause buttons
function togglePlayPauseButtons(isPlaying) {
    document.getElementById('playButton').style.display = isPlaying ? 'none' : 'block';
    document.getElementById('pauseButton').style.display = isPlaying ? 'block' : 'none';
}

// Function to play the next track
function playNextTrack() {
    currentTrackIndex = (currentTrackIndex + 1) % trackList.length;
    playTrack(trackList[currentTrackIndex]);
}

// Function to play the previous track
function playPrevTrack() {
    currentTrackIndex = (currentTrackIndex - 1 + trackList.length) % trackList.length;
    playTrack(trackList[currentTrackIndex]);
}

let searchTimeout;

// Initializing the application only after the DOM is fully loaded
function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const contentContainer = document.querySelector('.content-container');

    // Show recent searches on focus if input is empty
    searchInput.addEventListener('focus', () => {
        if (!searchInput.value.trim()) {
            showRecentSearches();
            contentContainer.classList.add('hide');
        }
    });

    searchInput.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!searchInput.value.trim()) {
        showRecentSearches();
        contentContainer.classList.add('hide');
        }
    });

    // Handle input changes with debouncing
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        
        if (this.value.trim() === '') {
            contentContainer.classList.remove('hide');
            searchResults.classList.remove('active');
            return;
        }

        // Add debouncing to prevent too many API calls
        searchTimeout = setTimeout(() => {
            searchSpotify(this.value.trim());
            contentContainer.classList.add('hide');
        }, 500);
    });

    // Handle keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchResults.classList.remove('active');
            searchInput.blur();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const firstResult = searchResults.querySelector('.result-item');
            if (firstResult) {
                firstResult.focus();
            }
        }
    });

    // Close search results when clicking outside
    document.addEventListener('click', function(e) {
        const isClickInside = e.target.closest('.search-bar') || e.target.closest('.search-results');
        if (!isClickInside) {
            searchResults.classList.remove('active');
            contentContainer.classList.remove('hide');
        }
    });

    // Handle result item keyboard navigation
    searchResults.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('result-item')) {
            const currentItem = e.target;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextItem = currentItem.nextElementSibling;
                if (nextItem) {
                    nextItem.focus();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevItem = currentItem.previousElementSibling;
                if (prevItem) {
                    prevItem.focus();
                } else {
                    searchInput.focus();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                currentItem.click();
            }
        }
    });

    // Add tabindex to make results focusable
    const addFocusableResults = () => {
        const resultItems = searchResults.querySelectorAll('.result-item');
        resultItems.forEach(item => {
            item.setAttribute('tabindex', '0');
        });
    };

    // Create observer to watch for new results being added
    const observer = new MutationObserver(() => {
        addFocusableResults();
    });

    // Start observing the search results container
    observer.observe(searchResults, {
        childList: true,
        subtree: true
    });

    // Initial load of recent searches
    if (!searchInput.value.trim()) {
        showRecentSearches();
    }

    // Add loading state class
    const toggleLoading = (isLoading) => {
        searchInput.classList.toggle('loading', isLoading);
    };

    // Expose toggleLoading to be used by searchSpotify
    window.toggleSearchLoading = toggleLoading;
}

// Function to search Spotify for tracks
async function searchSpotify(query) {
    const searchResults = document.getElementById('searchResults');
    const contentContainer = document.querySelector('.content-container');
    
    searchResults.classList.add('active');
    contentContainer.classList.add('hide');
    searchResults.innerHTML = '<div class="loading"></div>';

    try {
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
            headers: {
                'Authorization': `Bearer ${getAccessToken()}`
            }
        });

        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();
        saveRecentSearch(query);
        displaySearchResults(data.tracks.items);
    } catch (error) {
        console.error('Search error:', error);
        displayError('An error occurred while searching');
    }
}

// Function to display search results
function displaySearchResults(tracks) {
    const searchResults = document.getElementById('searchResults');
    const contentContainer = document.querySelector('.content-container');
    
    searchResults.classList.add('active');
    contentContainer.classList.add('hide');

    if (tracks.length === 0) {
        searchResults.innerHTML = '<div class="no-results">No results found</div>';
        return;
    }

    const resultsHTML = tracks.map(track => `
        <div class="result-item" onclick="playTrack('${track.uri}')">
            <img src="${track.album.images[2].url}" alt="${track.name}">
            <div class="result-info">
                <h4>${track.name}</h4>
                <p>${track.artists.map(artist => artist.name).join(', ')}</p>
            </div>
            <div class="result-duration">${formatDuration(track.duration_ms)}</div>
        </div>
    `).join('');

    searchResults.innerHTML = `
        <h2 style="color: #fff; margin-bottom: 20px;">Search Results</h2>
        ${resultsHTML}
    `;
}

// Function to save recent searches
function saveRecentSearch(query) {
    let recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
    recentSearches = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
    localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
}

// Function to clear recent searches
function clearRecentSearches() {
    localStorage.removeItem('recentSearches');
    showRecentSearches();
}

// Function to show recent searches
function showRecentSearches() {
    const recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
    const searchResults = document.getElementById('searchResults');
    
    if (recentSearches.length > 0) {
        const recentHTML = recentSearches.map(search => `
            <div class="result-item" onclick="document.getElementById('searchInput').value='${search}'; searchSpotify('${search}')">
                <i class="fa-solid fa-clock-rotate-left"></i>
                <div class="result-info">
                    <h4>${search}</h4>
                </div>
            </div>
        `).join('');

        searchResults.innerHTML = `
            <div class="search-results-content">
                <h2>Recent Searches</h2>
                ${recentHTML}
                <button id="clearSearchesButton" onclick="clearRecentSearches()">Clear Recent Searches</button>
            </div>
        `;
        searchResults.classList.add('active');
    } else {
        searchResults.innerHTML = '<div class="no-results">No recent searches</div>';
        searchResults.classList.remove('active');
    }
}

// Function to display an error message
function displayError(message) {
    const searchResults = document.getElementById('searchResults');
    searchResults.classList.add('active');
    searchResults.innerHTML = `<div class="no-results">${message}</div>`;
}

// Add the new home button click handler here
document.querySelector('.sidebar-nav ul li a[href=""]').addEventListener('click', function(e) {
    e.preventDefault(); // Prevent default link behavior
    
    // Hide search results
    const searchResults = document.getElementById('searchResults');
    searchResults.classList.remove('active');
    
    // Show main content
    const contentContainer = document.querySelector('.content-container');
    contentContainer.classList.remove('hide');
    
    // Clear search input
    document.getElementById('searchInput').value = '';
});

// Initializing the application
document.addEventListener('DOMContentLoaded', function () {
    init();
});