// Fetch the token from the URL hash
const getTokenFromUrl = () => {
    return window.location.hash.substring(1).split('&').reduce((initial, item) => {
        let parts = item.split('=');
        initial[parts[0]] = decodeURIComponent(parts[1]);
        return initial;
    }, {});
};

const { access_token } = getTokenFromUrl();
window.location.hash = "";

// Use the token to fetch data from Spotify API
const fetchSpotifyData = (url) => {
    return fetch(url, {
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    }).then(response => response.json());
};

// Update the song info in the playbar
const updateSongInfo = (track) => {
    document.querySelector('.song-title').textContent = track.name;
    document.querySelector('.song-artist').textContent = track.artists.map(artist => artist.name).join(', ');
    document.querySelector('.song-img').style.backgroundImage = `url(${track.album.images[0].url})`;
};

// Play a specific track
const playTrack = (trackUri) => {
    fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris: [trackUri] })
    }).then(() => {
        document.getElementById('playButton').style.display = 'none';
        document.getElementById('pauseButton').style.display = 'inline-block';
    });
};

// Pause the current track
const pauseTrack = () => {
    fetch('https://api.spotify.com/v1/me/player/pause', {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    }).then(() => {
        document.getElementById('pauseButton').style.display = 'none';
        document.getElementById('playButton').style.display = 'inline-block';
    });
};

// Event listeners for play buttons
document.querySelectorAll('.play-btn').forEach(button => {
    button.addEventListener('click', () => {
        const trackUri = button.getAttribute('data-uri');
        playTrack(trackUri);
        fetchSpotifyData(`https://api.spotify.com/v1/tracks/${trackUri.split(':')[2]}`)
            .then(track => {
                updateSongInfo(track);
            });
    });
});

// Event listeners for playbar controls
document.getElementById('playButton').addEventListener('click', () => {
    fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    }).then(() => {
        document.getElementById('playButton').style.display = 'none';
        document.getElementById('pauseButton').style.display = 'inline-block';
    });
});

document.getElementById('pauseButton').addEventListener('click', pauseTrack);

document.getElementById('prevButton').addEventListener('click', () => {
    fetch('https://api.spotify.com/v1/me/player/previous', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    });
});

document.getElementById('nextButton').addEventListener('click', () => {
    fetch('https://api.spotify.com/v1/me/player/next', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    });
});

// Adjust volume
document.getElementById('volumeButton').addEventListener('click', () => {
    const volume = document.querySelector('.volume').style.width.replace('%', '');
    fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${volume}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    });
});

// Initialize volume slider
const volumeSlider = document.querySelector('.volume-bar');
volumeSlider.addEventListener('click', (e) => {
    const volume = Math.floor((e.offsetX / volumeSlider.offsetWidth) * 100);
    document.querySelector('.volume').style.width = `${volume}%`;
    fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${volume}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    });
});

// Initialize progress bar
const progressBar = document.querySelector('.progress-bar');
progressBar.addEventListener('click', (e) => {
    const progress = Math.floor((e.offsetX / progressBar.offsetWidth) * 100);
    fetchSpotifyData('https://api.spotify.com/v1/me/player/currently-playing')
        .then(data => {
            const duration = data.item.duration_ms;
            const position = Math.floor((progress / 100) * duration);
            fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${position}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${access_token}`
                }
            });
        });
});