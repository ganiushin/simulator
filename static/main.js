/**
 * Главный файл для управления интерфейсом Olympic Robot v4.0 (Simulator Only)
 */

let uploadedScript = null;
let scriptSelected = false;
let mapSelected = false;

let ui;

document.addEventListener('DOMContentLoaded', () => {
    ui = window.SimulatorUI.init({
        getScriptContent: () => uploadedScript?.content || null,
        onMapLoaded: () => { mapSelected = true; },
        updateSimulatorButton
    });

    initFileUpload();
    ui.initMapUpload();
    ui.initSimulatorButtons('Сначала загрузите Python скрипт');
});

function initFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const uploadSection = document.getElementById('uploadSection');
    if (!fileInput || !uploadSection) return;

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFile(file);
            e.target.value = '';
        }
    });

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
            handleFile(file);
            fileInput.value = '';
        }
    });
}

function handleFile(file) {
    if (!file.name.endsWith('.py')) {
        ui.showStatus('Ошибка: Файл должен быть Python скриптом (.py)', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        uploadedScript = {
            name: file.name,
            content: e.target.result,
            size: file.size
        };

        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = file.size;
        document.getElementById('fileInfo').classList.add('show');

        scriptSelected = true;
        updateSimulatorButton();

        ui.showStatus('Файл успешно загружен!', 'success');

        if (window.simulator && window.simulator.running && (mapSelected || window.customMapData)) {
            window.simulator.stop();
            setTimeout(() => ui.startSimulator({ skipStartButton: true }), 150);
        }
    };
    reader.readAsText(file);
}

function updateSimulatorButton() {
    const btn = document.getElementById('btnSimulator');
    if (!btn) return;
    mapSelected = mapSelected || !!window.customMapData;
    btn.disabled = !(scriptSelected && mapSelected);
}
window.updateSimulatorButton = updateSimulatorButton;
