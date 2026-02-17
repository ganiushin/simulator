/**
 * Главный файл для управления интерфейсом Olympic Robot v4.0 (Simulator Only)
 */

let uploadedScript = null;

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
        
        // Активируем кнопку симулятора
        document.getElementById('btnSimulator').disabled = false;
        
        showStatus('Файл успешно загружен!', 'success');
    };
    reader.readAsText(file);
}

function initButtons() {
    document.getElementById('btnSimulator').addEventListener('click', () => {
        if (!uploadedScript) {
            showStatus('Сначала загрузите Python скрипт', 'error');
            return;
        }
        startSimulator();
    });
    
    document.getElementById('btnStart').addEventListener('click', () => {
        if (window.simulator) {
            window.simulator.start();
        }
    });
    
    document.getElementById('btnPause').addEventListener('click', () => {
        if (window.simulator) {
            window.simulator.togglePause();
        }
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
    showStatus('Симулятор готов! Нажмите «Старт», затем кнопку B (или клавишу B) для старта робота.', 'success');
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
