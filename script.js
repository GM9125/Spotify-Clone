// Spotify API configuration
const CLIENT_ID = '4746dcf87817496198c6641a9bedb3e3';
// Get the base URL of the current page (without hash or query parameters)
const REDIRECT_URI = 'http://127.0.0.1:5500/';
let accessToken = null;
let player = null;
let currentTrackUri = null;

// Initialize on page load
window.onload = async () => {
    console.log('Redirect URI:', REDIRECT_URI); // For debugging
    
    // Check if we have a token in URL hash
    const hash = window.location.hash
        .substring(1)
        .split('&')
        .reduce((initial, item) => {
            const parts = item.split('=');
            initial[parts[0]] = decodeURIComponent(parts[1]);
            return initial;
        }, {});

    if (hash.access_token) {
        accessToken = hash.access_token;
        console.log('Access Token acquired'); // For debugging
        initializePlayer();
    } else {
        console.log('Redirecting to Spotify auth...'); // For debugging
        redirectToSpotifyAuth();
    }

    // Rest of the initialization code...
    setupEventListeners();
};

function setupEventListeners() {
    // Add click listeners to all play buttons
    document.querySelectorAll('.play-btn').forEach(button => {
        button.addEventListener('click', () => {
            const trackUri = button.getAttribute('data-uri');
            playTrack(trackUri);
        });
    });

    // Add listeners for player controls
    document.getElementById('playButton').addEventListener('click', togglePlay);
    document.getElementById('pauseButton').addEventListener('click', togglePlay);
    document.getElementById('prevButton').addEventListener('click', playPrevious);
    document.getElementById('nextButton').addEventListener('click', playNext);

    // Progress bar functionality
    const progressBar = document.querySelector('.progress-bar');
    progressBar.addEventListener('click', handleProgressBarClick);
    
    // Volume control
    const volumeBar = document.querySelector('.volume-bar');
    volumeBar.addEventListener('click', handleVolumeChange);
}

function redirectToSpotifyAuth() {
    const scopes = [
        'streaming',
        'user-read-email',
        'user-read-private',
        'user-modify-playback-state',
        'user-read-playback-state'
    ];

    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scopes.join(' '))}`;
    console.log('Auth URL:', authUrl); // For debugging
    window.location.href = authUrl;
}

async function initializePlayer() {
    // Load Spotify Web Playback SDK
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
        player = new Spotify.Player({
            name: 'Spotify Clone Player',
            getOAuthToken: cb => { cb(accessToken); }
        });

        // Error handling
        player.addListener('initialization_error', ({ message }) => console.error(message));
        player.addListener('authentication_error', ({ message }) => console.error(message));
        player.addListener('account_error', ({ message }) => console.error(message));
        player.addListener('playback_error', ({ message }) => console.error(message));

        // Playback status updates
        player.addListener('player_state_changed', state => {
            updatePlayerState(state);
        });

        player.connect();
    };
}

async function playTrack(trackUri) {
    if (!player) return;

    try {
        // Get track info
        const response = await fetch(`https://api.spotify.com/v1/tracks/${trackUri.split(':')[2]}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        const trackInfo = await response.json();

        // Update player UI
        updatePlayerUI(trackInfo);

        // Play the track
        await fetch(`https://api.spotify.com/v1/me/player/play`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                uris: [trackUri]
            })
        });

        currentTrackUri = trackUri;
        updatePlayPauseButton(true);
    } catch (error) {
        console.error('Error playing track:', error);
    }
}

function updatePlayerUI(trackInfo) {
    // Update song info
    document.querySelector('.song-title').textContent = trackInfo.name;
    document.querySelector('.song-artist').textContent = trackInfo.artists.map(artist => artist.name).join(', ');
    
    // Update song image if available
    const songImg = document.querySelector('.song-img');
    if (trackInfo.album.images.length > 0) {
        songImg.style.backgroundImage = `url(${trackInfo.album.images[0].url})`;
    }

    // Update duration
    const durationMinutes = Math.floor(trackInfo.duration_ms / 60000);
    const durationSeconds = Math.floor((trackInfo.duration_ms % 60000) / 1000);
    document.querySelector('.progress-container .time:last-child').textContent = 
        `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;
}

async function togglePlay() {
    if (!player) return;

    const playButton = document.getElementById('playButton');
    const pauseButton = document.getElementById('pauseButton');

    try {
        const state = await player.getCurrentState();
        if (state?.paused) {
            await player.resume();
            updatePlayPauseButton(true);
        } else {
            await player.pause();
            updatePlayPauseButton(false);
        }
    } catch (error) {
        console.error('Error toggling playback:', error);
    }
}

function updatePlayPauseButton(isPlaying) {
    const playButton = document.getElementById('playButton');
    const pauseButton = document.getElementById('pauseButton');
    
    if (isPlaying) {
        playButton.style.display = 'none';
        pauseButton.style.display = 'flex';
    } else {
        playButton.style.display = 'flex';
        pauseButton.style.display = 'none';
    }
}

function handleProgressBarClick(event) {
    const progressBar = event.currentTarget;
    const clickPosition = event.offsetX / progressBar.offsetWidth;
    const progress = document.querySelector('.progress');
    progress.style.width = `${clickPosition * 100}%`;

    if (player) {
        player.seek(clickPosition * player.getDuration());
    }
}

function handleVolumeChange(event) {
    const volumeBar = event.currentTarget;
    const clickPosition = event.offsetX / volumeBar.offsetWidth;
    const volume = document.querySelector('.volume');
    volume.style.width = `${clickPosition * 100}%`;

    if (player) {
        player.setVolume(clickPosition);
    }
}

async function playPrevious() {
    if (!player) return;
    await player.previousTrack();
}

async function playNext() {
    if (!player) return;
    await player.nextTrack();
}

function updatePlayerState(state) {
    if (!state) return;

    // Update progress
    const progress = document.querySelector('.progress');
    const position = state.position;
    const duration = state.duration;
    const percentage = (position / duration) * 100;
    progress.style.width = `${percentage}%`;

    // Update time display
    const currentMinutes = Math.floor(position / 60000);
    const currentSeconds = Math.floor((position % 60000) / 1000);
    document.querySelector('.progress-container .time:first-child').textContent = 
        `${currentMinutes}:${currentSeconds.toString().padStart(2, '0')}`;

    // Update play/pause button
    updatePlayPauseButton(!state.paused);
}