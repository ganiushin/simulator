/**
 * Главный файл для управления интерфейсом Olympic Robot v4.0 (Simulator Only)
 */

let uploadedScript = null;
let scriptSelected = false;
let mapSelected = false;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    initFileUpload();
    initButtons();
});

function initFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const uploadSection = document.getElementById('uploadSection');
    
    // Обработка выбора файла
    fileInput.addEventListener('change', (e) => {
        handleFile(e.target.files[0]);
    });
    
    // Drag and Drop
    uploadSection.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadSection.classList.add('dragover');
    });
    
    uploadSection.addEventListener('dragleave', () => {
        uploadSection.classList.remove('dragover');
    });
    
    uploadSection.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadSection.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) {
            fileInput.files = e.dataTransfer.files;
            handleFile(file);
        }
    });
}

function handleFile(file) {
    if (!file.name.endsWith('.py')) {
        showStatus('Ошибка: Файл должен быть Python скриптом (.py)', 'error');
        return;
    }

    const hadSimulator = !!window.simulator;
    const wasRunning = hadSimulator && window.simulator.running;
  
    const reader = new FileReader();
    reader.onload = (e) => {
        uploadedScript = {
            name: file.name,
            content: e.target.result,
            size: file.size
        };
        
        // Показываем информацию о файле
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = file.size;
        document.getElementById('fileInfo').classList.add('show');
        
        scriptSelected = true;
        updateSimulatorButton();
        
        showStatus('Файл успешно загружен!', 'success');

        // Если симулятор уже был создан, применяем новый скрипт
        if (hadSimulator) {
            try {
                window.simulator.loadScript(uploadedScript.content);
                if (wasRunning) {
                    showStatus('Скрипт обновлён. Перезапускаем симулятор...', 'info');
                    startSimulator();
                } else {
                    showStatus('Скрипт обновлён. Нажмите «Запустить симулятор», чтобы запустить его с новым кодом.', 'info');
                    if (typeof window.simulator.draw === 'function') {
                        window.simulator.draw();
                    }
                }
            } catch (err) {
                console.error('Ошибка применения нового скрипта:', err);
            }
        }
    };
    reader.readAsText(file);
}

function initMapUpload() {
    const mapInput = document.getElementById('mapFileInput');
    const mapSection = document.getElementById('mapUploadSection');
    if (!mapInput || !mapSection) return;

    mapInput.addEventListener('change', (e) => {
        handleMapFile(e.target.files[0]);
    });

    mapSection.addEventListener('dragover', (e) => {
        e.preventDefault();
        mapSection.classList.add('dragover');
    });

    mapSection.addEventListener('dragleave', () => {
        mapSection.classList.remove('dragover');
    });

    mapSection.addEventListener('drop', (e) => {
        e.preventDefault();
        mapSection.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) {
            mapInput.files = e.dataTransfer.files;
            handleMapFile(file);
        }
    });
}

function handleMapFile(file) {
    if (!file || !file.name) return;
    const hadSimulator = !!window.simulator;
    const wasRunning = hadSimulator && window.simulator.running;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const payload = JSON.parse(e.target.result);
            const ver = payload.version;
            if (ver !== 1) {
                showStatus('Неизвестная версия файла карты: ' + ver, 'error');
                return;
            }
            const w = Number(payload.mapWidth) || 800;
            const h = Number(payload.mapHeight) || 600;
            if (w !== 800 || h !== 600) {
                showStatus('Размер карты в файле (' + w + '×' + h + ') не совпадает с симулятором (800×600).', 'error');
                return;
            }
            const base64 = payload.imageDataBase64;
            if (!base64 || typeof base64 !== 'string') {
                showStatus('В файле нет данных изображения карты.', 'error');
                return;
            }
            const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = w;
            tmpCanvas.height = h;
            const tmpCtx = tmpCanvas.getContext('2d');
            const imageData = tmpCtx.createImageData(w, h);
            const len = Math.min(raw.length, imageData.data.length);
            for (let i = 0; i < len; i++) imageData.data[i] = raw[i];

            const ZONE_RADIUS = 25;
            const LAMP_INFLUENCE_RADIUS = 120;

            const cameraZones = (payload.cameraZones && Array.isArray(payload.cameraZones))
                ? payload.cameraZones.map(z => ({
                    x: Number(z.x) || 0,
                    y: Number(z.y) || 0,
                    radius: Number(z.radius) > 0 ? Number(z.radius) : ZONE_RADIUS,
                    sign: z.sign
                }))
                : [];

            const lamps = (payload.lamps && Array.isArray(payload.lamps))
                ? payload.lamps.map(l => ({
                    x: Number(l.x) || 0,
                    y: Number(l.y) || 0,
                    radius: Number(l.radius) > 0 ? Number(l.radius) : LAMP_INFLUENCE_RADIUS
                }))
                : [];

            const ultrasonicObstacles = (payload.ultrasonicObstacles && Array.isArray(payload.ultrasonicObstacles))
                ? payload.ultrasonicObstacles.map(obs => ({
                    x: Number(obs.x) || 0,
                    y: Number(obs.y) || 0,
                    radius: Number(obs.radius) > 0 ? Number(obs.radius) : 30
                }))
                : [];

            const sp = payload.startPosition;
            const startPosition = (sp && typeof sp.x === 'number' && typeof sp.y === 'number')
                ? { x: sp.x, y: sp.y, angle: Number(sp.angle) || 90 }
                : null;

            window.customMapData = {
                imageData,
                cameraZones,
                lamps,
                ultrasonicObstacles,
                startPosition
            };

            const mapNameEl = document.getElementById('mapFileName');
            const mapInfoEl = document.getElementById('mapFileInfo');
            if (mapNameEl && mapInfoEl) {
                mapNameEl.textContent = file.name;
                mapInfoEl.classList.add('show');
            }

            mapSelected = true;
            updateSimulatorButton();
            showStatus('Карта успешно загружена.', 'success');

            // Если симулятор уже был создан, применяем новую карту
            if (hadSimulator) {
                try {
                    if (window.simulator.updateMap && typeof window.simulator.updateMap === 'function') {
                        window.simulator.updateMap(window.customMapData);
                    }
                    if (wasRunning) {
                        showStatus('Карта обновлена. Перезапускаем симулятор...', 'info');
                        startSimulator();
                    } else if (typeof window.simulator.draw === 'function') {
                        showStatus('Карта обновлена. Нажмите «Запустить симулятор», чтобы увидеть её в действии.', 'info');
                        window.simulator.draw();
                    }
                } catch (err) {
                    console.error('Ошибка применения новой карты:', err);
                }
            }
        } catch (err) {
            showStatus('Ошибка загрузки карты: ' + (err.message || String(err)), 'error');
        }
    };
    reader.readAsText(file, 'UTF-8');
}

function updateSimulatorButton() {
    const btn = document.getElementById('btnSimulator');
    if (!btn) return;
    // Если карта уже есть в window.customMapData (например, из редактора), считаем, что карта выбрана
    mapSelected = mapSelected || !!window.customMapData;
    btn.disabled = !(scriptSelected && mapSelected);
}

function initButtons() {
    document.getElementById('btnSimulator').addEventListener('click', () => {
        if (!uploadedScript) {
            showStatus('Сначала загрузите Python скрипт', 'error');
            return;
        }
        if (!window.customMapData) {
            showStatus('Сначала выберите карту (.json) или загрузите её через редактор.', 'error');
            return;
        }
        startSimulator();
    });
    
    document.getElementById('btnReset').addEventListener('click', () => {
        if (window.simulator) {
            window.simulator.reset();
        }
    });
    
    document.getElementById('btnClose').addEventListener('click', () => {
        document.getElementById('simulatorContainer').classList.remove('show');
        const ph = document.getElementById('placeholderCenter');
        const mapOpen = document.getElementById('mapEditorContainer')?.classList.contains('show');
        if (ph && !mapOpen) ph.classList.remove('hide');
        const sensorPanel = document.getElementById('sensorPanel');
        if (sensorPanel) sensorPanel.innerHTML = '';
        if (window.simulator) {
            window.simulator.stop();
        }
    });
    
    // Кнопка робота (B)
    const btnRobotButton = document.getElementById('btnRobotButton');
    if (btnRobotButton) {
        btnRobotButton.addEventListener('mousedown', () => {
            if (window.currentBot && window.currentBot.button) {
                if (typeof window.currentBot.button.pressButton === 'function') {
                    window.currentBot.button.pressButton();
                } else {
                    window.currentBot.button._pressed = true;
                }
            }
        });
        btnRobotButton.addEventListener('mouseup', () => {
            if (window.currentBot && window.currentBot.button) {
                if (typeof window.currentBot.button.releaseButton === 'function') {
                    window.currentBot.button.releaseButton();
                } else {
                    window.currentBot.button._pressed = false;
                }
            }
        });
        btnRobotButton.addEventListener('mouseleave', () => {
            if (window.currentBot && window.currentBot.button) {
                if (typeof window.currentBot.button.releaseButton === 'function') {
                    window.currentBot.button.releaseButton();
                } else {
                    window.currentBot.button._pressed = false;
                }
            }
        });
    }
    
    // Горячая клавиша B для кнопки робота
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey) {
            if (window.currentBot && window.currentBot.button) {
                if (typeof window.currentBot.button.pressButton === 'function') {
                    window.currentBot.button.pressButton();
                } else {
                    window.currentBot.button._pressed = true;
                }
            }
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'b' || e.key === 'B') {
            if (window.currentBot && window.currentBot.button) {
                if (typeof window.currentBot.button.releaseButton === 'function') {
                    window.currentBot.button.releaseButton();
                } else {
                    window.currentBot.button._pressed = false;
                }
            }
        }
    });
}

async function startSimulator() {
    showStatus('Запуск симулятора... Загрузка Pyodide может занять время...', 'info');
    
    const container = document.getElementById('simulatorContainer');
    container.classList.add('show');
    document.getElementById('placeholderCenter')?.classList.add('hide');
    const mapEditorContainer = document.getElementById('mapEditorContainer');
    if (mapEditorContainer) mapEditorContainer.classList.remove('show');
    
    const customMapData = window.customMapData || null;
    if (!window.simulator) {
        window.simulator = new RobotSimulator('simulatorCanvas', uploadedScript.content, customMapData);
        // Ждем инициализации Pyodide
        while (!window.simulator.pyodideReady) {
            await new Promise(r => setTimeout(r, 100));
        }
    } else {
        window.simulator.loadScript(uploadedScript.content);
        if (window.simulator.updateMap && customMapData) {
            window.simulator.updateMap(customMapData);
        }
        if (window.simulator.running) {
            window.simulator.stop();
            await new Promise(r => setTimeout(r, 100));
        }
    }
    window.currentBot = window.simulator.bot || null;
    if (window.simulator && typeof window.simulator.draw === 'function') {
        window.simulator.draw();
    }

    // Автоматически запускаем симуляцию,
    // но кнопку B пользователь нажимает сам, если скрипт этого ждёт.
    if (window.simulator) {
        window.simulator.start();
    }

    showStatus('Симулятор запущен. Если в скрипте есть ожидание кнопки, нажмите кнопку B или клавишу B.', 'success');
}

function showStatus(message, type) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = `status ${type} show`;
    
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            statusEl.classList.remove('show');
        }, 5000);
    }
}

// Инициализация загрузки карты
document.addEventListener('DOMContentLoaded', () => {
    initMapUpload();
});
