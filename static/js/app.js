document.addEventListener('DOMContentLoaded', () => {
    // --- Audio Context & Nodes ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let audioSource = null;
    const gainNode = audioCtx.createGain();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;

    // EQ Filters (10 bands)
    const frequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
    const filters = frequencies.map(freq => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1;
        filter.gain.value = 0;
        return filter;
    });

    // Connect nodes
    const connectFilters = () => {
        let prevNode = null;
        filters.forEach((filter, index) => {
            if (index === 0) {
                // Source will connect to first filter later
            } else {
                prevNode.connect(filter);
            }
            prevNode = filter;
        });
        prevNode.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(audioCtx.destination);
    };
    connectFilters();

    // --- UI Elements ---
    const playBtn = document.getElementById('playBtn');
    const visualizerCanvas = document.getElementById('visualizer');
    const canvasCtx = visualizerCanvas.getContext('2d');
    const eqSlidersContainer = document.getElementById('eqSliders');
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchResults = document.getElementById('searchResults');
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const exportBtn = document.getElementById('exportBtn');
    const presetSelect = document.getElementById('presetSelect');

    let currentFileId = null;
    let currentFilename = null;
    let currentVideoId = null; // For YouTube Music tracks
    let isPlaying = false;
    let audioElement = new Audio();
    audioElement.crossOrigin = "anonymous";

    // Connect Audio Element to Web Audio API
    const setupAudioSource = () => {
        if (!audioSource) {
            audioSource = audioCtx.createMediaElementSource(audioElement);
            audioSource.connect(filters[0]);
        }
    };

    // --- Volume Control ---
    const volumeSlider = document.getElementById('volumeSlider');
    const muteBtn = document.getElementById('muteBtn');
    let isMuted = false;
    let previousVolume = 100;

    // Set initial volume
    audioElement.volume = 1.0;

    // Initialize slider fill
    volumeSlider.style.setProperty('--volume-fill', '100%');

    volumeSlider.addEventListener('input', (e) => {
        const volume = e.target.value / 100;
        audioElement.volume = volume;

        // Update slider fill
        e.target.style.setProperty('--volume-fill', `${e.target.value}%`);

        // Update mute state
        if (volume === 0) {
            isMuted = true;
            updateMuteIcon();
        } else if (isMuted) {
            isMuted = false;
            updateMuteIcon();
        }
    });

    muteBtn.addEventListener('click', () => {
        if (isMuted) {
            // Unmute
            audioElement.volume = previousVolume / 100;
            volumeSlider.value = previousVolume;
            isMuted = false;
        } else {
            // Mute
            previousVolume = volumeSlider.value;
            audioElement.volume = 0;
            volumeSlider.value = 0;
            isMuted = true;
        }

        // Update slider fill
        volumeSlider.style.setProperty('--volume-fill', `${volumeSlider.value}%`);

        updateMuteIcon();
    });

    function updateMuteIcon() {
        if (isMuted || audioElement.volume === 0) {
            muteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>`;
        } else {
            muteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
            </svg>`;
        }
    }

    // --- Visualizer ---
    const drawVisualizer = () => {
        requestAnimationFrame(drawVisualizer);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const width = visualizerCanvas.width;
        const height = visualizerCanvas.height;
        canvasCtx.clearRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;

            const gradient = canvasCtx.createLinearGradient(0, height, 0, 0);
            gradient.addColorStop(0, '#00ccff');
            gradient.addColorStop(1, '#00ff88');

            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
        }
    };

    // Resize canvas
    const resizeCanvas = () => {
        visualizerCanvas.width = visualizerCanvas.offsetWidth;
        visualizerCanvas.height = visualizerCanvas.offsetHeight;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    drawVisualizer();

    // --- EQ Controls ---
    const createSliders = () => {
        frequencies.forEach((freq, index) => {
            const container = document.createElement('div');
            container.className = 'slider-container';

            const labelDb = document.createElement('span');
            labelDb.className = 'db-label';
            labelDb.innerText = '0dB';

            const input = document.createElement('input');
            input.type = 'range';
            input.min = -12;
            input.max = 12;
            input.value = 0;
            input.step = 0.1;
            input.dataset.index = index;

            const labelFreq = document.createElement('span');
            labelFreq.className = 'freq-label';
            labelFreq.innerText = freq < 1000 ? freq + 'Hz' : (freq / 1000) + 'kHz';

            input.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                filters[index].gain.value = val;
                labelDb.innerText = (val > 0 ? '+' : '') + Math.round(val) + 'dB';

                // Update fill indicator height
                const fillPercent = ((val + 12) / 24) * 100;
                container.style.setProperty('--fill-height', `${fillPercent}%`);
            });

            container.appendChild(labelDb);
            container.appendChild(input);
            container.appendChild(labelFreq);
            eqSlidersContainer.appendChild(container);
        });
    };
    createSliders();

    // --- Presets ---
    const presets = {
        flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        bass: [8, 6, 3, 0, 0, 0, 0, 0, 0, 0],
        treble: [0, 0, 0, 0, 0, 2, 4, 6, 8, 8],
        vocal: [-2, -2, -1, 2, 4, 4, 2, 0, 0, 0],
        electronic: [6, 5, 2, -2, -3, 0, 2, 4, 5, 6],
        rock: [5, 4, 3, 1, -1, -1, 2, 4, 5, 6],
        pop: [2, 3, 4, 4, 2, 0, 2, 3, 4, 4],
        jazz: [4, 4, 2, 2, 0, 1, 2, 3, 3, 2],
        classical: [6, 4, 3, 1, 0, 0, 1, 3, 4, 4],
        metal: [7, 6, 2, -2, -4, 0, 4, 6, 7, 8]
    };

    let currentPreset = 'flat';

    const applyPreset = (presetName) => {
        const preset = presets[presetName];
        if (!preset) return;

        const sliders = document.querySelectorAll('.slider-container input');
        preset.forEach((val, i) => {
            sliders[i].value = val;
            sliders[i].dispatchEvent(new Event('input'));
        });
        currentPreset = presetName;
    };

    presetSelect.addEventListener('change', (e) => {
        applyPreset(e.target.value);
    });

    // Allow re-applying the same preset
    presetSelect.addEventListener('click', (e) => {
        if (e.target.value === currentPreset) {
            applyPreset(currentPreset);
        }
    });

    // Save Custom Preset
    const savePresetBtn = document.getElementById('savePresetBtn');
    savePresetBtn.addEventListener('click', () => {
        const sliders = document.querySelectorAll('.slider-container input');
        const customValues = Array.from(sliders).map(s => parseFloat(s.value));

        const presetName = prompt('Enter a name for your custom preset:');
        if (!presetName || presetName.trim() === '') return;

        const safePresetName = presetName.toLowerCase().replace(/\s+/g, '_');
        presets[safePresetName] = customValues;

        // Add to dropdown
        const option = document.createElement('option');
        option.value = safePresetName;
        option.textContent = presetName;
        presetSelect.appendChild(option);
        presetSelect.value = safePresetName;
        currentPreset = safePresetName;

        alert(`Custom preset "${presetName}" saved!`);
    });

    // Delete Preset
    const deletePresetBtn = document.getElementById('deletePresetBtn');
    const defaultPresets = ['flat', 'bass', 'treble', 'vocal', 'electronic', 'rock', 'pop', 'jazz', 'classical', 'metal'];

    deletePresetBtn.addEventListener('click', () => {
        const selectedPreset = presetSelect.value;

        // Prevent deleting default presets
        if (defaultPresets.includes(selectedPreset)) {
            alert('Cannot delete default presets!');
            return;
        }

        if (confirm(`Are you sure you want to delete "${selectedPreset}" preset?`)) {
            // Remove from presets object
            delete presets[selectedPreset];

            // Remove from dropdown
            const optionToRemove = presetSelect.querySelector(`option[value="${selectedPreset}"]`);
            if (optionToRemove) {
                optionToRemove.remove();
            }

            // Switch to Flat preset
            presetSelect.value = 'flat';
            applyPreset('flat');

            alert(`Preset "${selectedPreset}" deleted!`);
        }
    });

    // --- Player Controls ---
    playBtn.addEventListener('click', () => {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        if (isPlaying) {
            audioElement.pause();
            playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
        } else {
            audioElement.play();
            playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
            setupAudioSource();
        }
        isPlaying = !isPlaying;
    });

    audioElement.addEventListener('timeupdate', () => {
        const current = audioElement.currentTime;
        const duration = audioElement.duration || 0;
        document.getElementById('currentTime').innerText = formatTime(current);
        document.getElementById('duration').innerText = formatTime(duration);

        // Update progress bar
        const progressBar = document.getElementById('progressBar');
        if (!isDragging) {
            progressBar.max = duration;
            progressBar.value = current;
        }
    });

    // Progress Bar Interaction
    const progressBar = document.getElementById('progressBar');
    let isDragging = false;

    progressBar.addEventListener('mousedown', () => isDragging = true);
    progressBar.addEventListener('mouseup', () => isDragging = false);
    progressBar.addEventListener('touchstart', () => isDragging = true);
    progressBar.addEventListener('touchend', () => isDragging = false);

    progressBar.addEventListener('input', (e) => {
        const seekTime = parseFloat(e.target.value);
        audioElement.currentTime = seekTime;
        document.getElementById('currentTime').innerText = formatTime(seekTime);
    });

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // --- Search ---
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchBtn.click();
        }
    });

    searchBtn.addEventListener('click', async () => {
        const query = searchInput.value;
        if (!query) return;

        searchBtn.innerText = 'Searching...';
        const res = await fetch(`/search?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        searchBtn.innerText = 'Search';

        searchResults.innerHTML = '';
        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'result-item';
            div.innerHTML = `
                <img src="${item.thumbnails[0].url}" class="result-img">
                <div class="result-info">
                    <div class="result-title">${item.title}</div>
                    <div class="result-artist">${item.artists[0].name}</div>
                </div>
            `;
            div.addEventListener('click', async () => {
                if (!item.videoId) {
                    alert("Hata: Bu şarkı için ID bulunamadı.");
                    return;
                }

                document.getElementById('fileName').innerText = `Loading: ${item.title}...`;
                document.getElementById('fileInfo').classList.remove('hidden');

                try {
                    const streamUrl = `/stream/${item.videoId}`;
                    audioElement.src = streamUrl;
                    await audioElement.play();

                    // Track YouTube video for playback only (export disabled - no FFmpeg)
                    currentVideoId = item.videoId;
                    currentFileId = null; // Clear uploaded file ID
                    currentFilename = item.title;
                    exportBtn.style.display = 'none'; // Hide export for YouTube tracks

                    // Hide Analysis for YouTube (no FFmpeg)
                    document.getElementById('analysisSection').classList.add('hidden');

                    document.getElementById('fileName').innerText = `Playing: ${item.title}`;
                    isPlaying = true;
                    playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
                    setupAudioSource();
                } catch (err) {
                    console.error("Oynatma hatası:", err);
                    document.getElementById('fileName').innerText = "Error loading stream";
                    alert("Şarkı çalınamıyor. Backend hatası veya format desteklenmiyor olabilir.\nDetay: " + err.message);
                }
            });
            searchResults.appendChild(div);
        });
    });

    // --- File Upload ---
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        document.getElementById('fileName').innerText = 'Uploading...';
        document.getElementById('fileInfo').classList.remove('hidden');

        const res = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        currentFileId = data.file_id;
        currentFilename = data.filename;
        currentVideoId = null; // Clear YouTube video ID
        document.getElementById('fileName').innerText = data.filename;
        exportBtn.style.display = 'inline-block';

        // Load Analysis
        loadWaveform(currentFileId);

        audioElement.src = `/uploads/${data.file_id}.${data.filename.split('.').pop()}`;
        setupAudioSource();

        audioElement.play().then(() => {
            isPlaying = true;
            playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
        }).catch(err => {
            console.error('Playback error:', err);
            alert('Could not play the uploaded file: ' + err.message);
        });
    });

    // --- Export ---
    exportBtn.addEventListener('click', async () => {
        // Determine file source (uploaded file or YouTube track)
        const fileId = currentFileId || (currentVideoId ? `temp_${currentVideoId}` : null);
        if (!fileId) {
            alert('No audio loaded. Please upload a file or play a YouTube track first.');
            return;
        }

        const eqSettings = {};
        const sliders = document.querySelectorAll('.slider-container input');
        sliders.forEach(slider => {
            eqSettings[frequencies[slider.dataset.index]] = parseFloat(slider.value);
        });

        const formData = new FormData();
        formData.append('file_id', fileId);
        formData.append('eq_settings', JSON.stringify(eqSettings));
        if (currentFilename) {
            formData.append('original_filename', currentFilename);
        }

        exportBtn.innerText = 'Processing...';

        const res = await fetch('/export', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Use original filename with .wav extension if available
            if (currentFilename) {
                const nameParts = currentFilename.split('.');
                nameParts.pop(); // Remove extension
                a.download = nameParts.join('.') + '.wav';
            } else {
                a.download = `eq_export_${currentFileId}.wav`;
            }
            document.body.appendChild(a);
            a.click();
            a.remove();
            exportBtn.innerText = 'Export with EQ';
        } else {
            const errorData = await res.json();
            console.error('Export Error:', errorData);
            alert(`Export failed!\nError: ${errorData.error}`);
            exportBtn.innerText = 'Export with EQ';
        }
    });

    // --- Audio Analysis ---
    const loadWaveform = async (fileId) => {
        const analysisSection = document.getElementById('analysisSection');
        const waveformImage = document.getElementById('waveformImage');
        const loadingOverlay = document.getElementById('analysisLoading');

        analysisSection.classList.remove('hidden');
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.style.display = 'flex'; // Ensure flex display for centering
        loadingOverlay.innerText = "Loading Graph...";

        try {
            const analysisUrl = `/analyze/${fileId}?t=${new Date().getTime()}`;
            console.log("Fetching:", analysisUrl);

            const response = await fetch(analysisUrl);
            if (!response.ok) throw new Error('Server error');

            const blob = await response.blob();
            console.log("Blob received:", blob.size, blob.type);

            if (blob.size < 100) {
                throw new Error("Image too small (probably error text)");
            }

            const imageUrl = URL.createObjectURL(blob);

            // Wait for image to render
            waveformImage.onload = () => {
                console.log("Image rendered! Width:", waveformImage.naturalWidth);
                loadingOverlay.style.display = 'none'; // Force hide
                loadingOverlay.classList.add('hidden');
            };

            waveformImage.onerror = (e) => {
                console.error("Image render failed:", e);
                loadingOverlay.innerText = "Render Failed";
            };

            waveformImage.src = imageUrl;

        } catch (error) {
            console.error('Analysis failed:', error);
            loadingOverlay.innerText = "Failed to load";
        }
    };

    // --- Tabs ---
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}Tab`).classList.add('active');
        });
    });
});
