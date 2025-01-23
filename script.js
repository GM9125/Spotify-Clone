// script.js

const clientId = '998f99d0b45242729013c2346b8afff3';
const redirectUri = 'http://127.0.0.1:5500/'; // Change this to your actual redirect URI

// First, add these SVG icon definitions as constants at the top of your script
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
// Generate a random string for the state parameter
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
const scope = 'streaming user-read-email user-read-private';

// Function to get the Spotify access token
function getAccessToken() {
    const params = new URLSearchParams(window.location.hash.substring(1));
    return params.get('access_token');
}

// Redirect the user to Spotify's authorization page
function redirectToSpotifyAuthorization() {
    const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(scope)}`;
    window.location = url;
}

let currentTrackUri = null;
let currentTrackIndex = 0;
let trackList = [];
let player;
let device_id;
let progressInterval;
let currentTrackState = null;

async function init() {
    const accessToken = getAccessToken();
    if (!accessToken) {
        redirectToSpotifyAuthorization();
        return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
        player = new Spotify.Player({
            name: 'Spotify Clone Player',
            getOAuthToken: cb => { cb(accessToken); },
            volume: 0.5 // Set initial volume to 50%
        });

        // Error handling
        player.addListener('initialization_error', ({ message }) => { console.error(message); });
        player.addListener('authentication_error', ({ message }) => { console.error(message); });
        player.addListener('account_error', ({ message }) => { console.error(message); });
        player.addListener('playback_error', ({ message }) => { console.error(message); });

        // Playback status updates
        player.addListener('player_state_changed', state => {
            currentTrackState = state;
            console.log(state);
            updatePlaybar(state.track_window.current_track);
            updateTrackProgress(state);
            togglePlayPauseButtons(!state.paused);
            handleProgressBar(state);
        });

        // Ready
        player.addListener('ready', ({ device_id: id }) => {
            device_id = id;
            console.log('Ready with Device ID', id);
            
            // Initialize track list and add event listeners to play buttons
            document.querySelectorAll('.play-btn').forEach(button => {
                trackList.push(button.dataset.uri);
                button.addEventListener('click', (e) => {
                    const uri = e.target.closest('.play-btn').dataset.uri;
                    playTrack(uri);
                });
            });

            // Add event listeners to playbar controls
            document.getElementById('playButton').addEventListener('click', () => player.resume());
            document.getElementById('pauseButton').addEventListener('click', () => player.pause());
            document.getElementById('nextButton').addEventListener('click', playNextTrack);
            document.getElementById('prevButton').addEventListener('click', playPrevTrack);

            // Setup volume control and progress bar seek functionality
            setupVolumeControl();
            setupProgressBarSeek();
        });

        // Not Ready
        player.addListener('not_ready', ({ device_id }) => {
            console.log('Device ID has gone offline', device_id);
        });

        // Connect to the player!
        player.connect();
    };
}

// Function to setup volume control with precise interaction
function setupVolumeControl() {
    const volumeBar = document.querySelector('.volume-bar');
    const volume = document.querySelector('.volume');
    const volumeHandle = document.querySelector('.volume-handle');
    const volumeButton = document.getElementById('volumeButton');
    let previousVolume = 0.5; // Default volume
    let isMuted = false;

    // Function to update volume icon based on volume level
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
            console.log(`Volume set to ${volumeLevel}`);
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

    // Dragging functionality for volume handle
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

    // Add transition styles for smooth icon changes
    const style = document.createElement('style');
    style.textContent = `
        #volumeButton {
            transition: all 0.2s ease;
        }
        #volumeButton svg {
            transition: all 0.2s ease;
        }
        .volume {
            transition: width 0.1s ease;
        }
    `;
    document.head.appendChild(style);

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
    updateVolumeIcon(0.5); // Set initial icon state
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
    clearInterval(progressInterval);
    if (!state.paused) {
        progressInterval = setInterval(() => {
            state.position += 1000;
            updateTrackProgress(state);
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
// Initialize the application
init();