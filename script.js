// DOM 요소 선택
const dashboardButton = document.getElementById('dashboardButton');
const measureButton = document.getElementById('measureButton');
const manageHouseholdButton = document.getElementById('manageHouseholdButton');
const dashboardSection = document.getElementById('dashboardSection');
const measureSection = document.getElementById('measureSection');
const manageHouseholdSection = document.getElementById('manageHouseholdSection');
const householdSelectMeasure = document.getElementById('householdSelectMeasure');
const householdForm = document.getElementById('householdForm');
const householdList = document.getElementById('householdList');
const buildingInput = document.getElementById('buildingInput');
const unitInput = document.getElementById('unitInput');
const dashboardTableBody = document.querySelector('#dashboardTable tbody');
const exportButton = document.getElementById('exportButton'); // 엑셀 내보내기 버튼

// 측정 관련 변수
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const calibrateButton = document.getElementById('calibrateButton'); // 검교정 버튼
const decibelDisplay = document.getElementById('decibelDisplay');
const measurementDate = document.getElementById('measurementDate');
const measurementTime = document.getElementById('measurementTime');
const avgValue = document.getElementById('avgValue');
const maxValue = document.getElementById('maxValue');
const minValue = document.getElementById('minValue');
const aWeightedValue = document.getElementById('aWeightedValue');
const laeqValue = document.getElementById('laeqValue');
const freq63Value = document.getElementById('freq63Value');
const freq125Value = document.getElementById('freq125Value');
const freq250Value = document.getElementById('freq250Value');
const freq500Value = document.getElementById('freq500Value');
const liAFmaxValue = document.getElementById('liAFmaxValue');
const lnAWValue = document.getElementById('lnAWValue');
const samplingRateDisplay = document.getElementById('samplingRate');
const snrDisplay = document.getElementById('snr');
const fftSizeDisplay = document.getElementById('fftSize');
const durationDisplay = document.getElementById('duration');

let households = {};
let selectedHousehold = null;
let decibelChart;
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let audioContext, analyser, scriptProcessor, microphone, stream;
let micPermissionGranted = false; // 마이크 허용 여부 확인
let measuring = false;
let startTime;
let calibrationInProgress = false; // 검교정 진행 상태 확인

// 마이크 스트림 및 오디오 컨텍스트 초기화
async function initializeAudio() {
    if (!micPermissionGranted) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(stream);
            scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);

            analyser.smoothingTimeConstant = 0.8;
            analyser.fftSize = 1024;

            microphone.connect(analyser);
            analyser.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination);

            micPermissionGranted = true;
        } catch (error) {
            alert('마이크 권한이 필요합니다.');
            return;
        }
    }
}

// 검교정 함수
calibrateButton.addEventListener('click', async () => {
    if (calibrationInProgress) return;

    calibrationInProgress = true;
    await initializeAudio();

    const calibrationFrequency = 1000; // 1000Hz 주파수로 검교정
    const calibrationDuration = 5; // 5초 동안 검교정 진행
    const osc = audioContext.createOscillator();
    osc.frequency.setValueAtTime(calibrationFrequency, audioContext.currentTime);
    osc.connect(audioContext.destination);

    osc.start();

    setTimeout(() => {
        osc.stop();
        calibrationInProgress = false;
        alert('검교정 완료');
    }, calibrationDuration * 1000);
});

// 화면 전환 함수
function showSection(section) {
    dashboardSection.classList.add('hidden');
    measureSection.classList.add('hidden');
    manageHouseholdSection.classList.add('hidden');

    if (section === 'dashboard') {
        dashboardSection.classList.remove('hidden');
    } else if (section === 'measure') {
        measureSection.classList.remove('hidden');
    } else if (section === 'manageHousehold') {
        manageHouseholdSection.classList.remove('hidden');
    }
}

// 세대 추가/삭제 함수
function updateHouseholdSelects() {
    householdSelectMeasure.innerHTML = '<option value="">세대 선택</option>';
    householdList.innerHTML = '';

    Object.keys(households).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key;

        householdSelectMeasure.appendChild(option);

        const li = document.createElement('li');
        li.textContent = key;
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '삭제';
        deleteButton.onclick = () => deleteHousehold(key);
        li.appendChild(deleteButton);
        householdList.appendChild(li);
    });
}

// 세대 삭제 함수
function deleteHousehold(key) {
    delete households[key];
    updateHouseholdSelects();
    updateDashboardTable(); // 대쉬보드에서도 해당 세대 데이터 제거
}

// 세대 추가 시 이벤트
householdForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = `${buildingInput.value}-${unitInput.value}`;
    if (!households[key]) {
        households[key] = {
            building: buildingInput.value,
            unit: unitInput.value,
            measurements: []
        };
        updateHouseholdSelects();
    }
    buildingInput.value = '';
    unitInput.value = '';
});

// 소리 측정 관련 변수 및 이벤트
householdSelectMeasure.addEventListener('change', (e) => {
    selectedHousehold = e.target.value;
    startButton.disabled = !selectedHousehold;
    if (selectedHousehold) {
        resetResults();
        resetChart();
    }
});

startButton.addEventListener('click', async () => {
    if (!selectedHousehold) return;

    await initializeAudio(); // 오디오 초기화(마이크 권한 요청 포함)

    startButton.disabled = true;
    stopButton.disabled = false;
    resetResults();
    households[selectedHousehold].decibelValues = [];
    households[selectedHousehold].aWeightedValues = [];
    households[selectedHousehold].freqBands = {
        '63Hz': [],
        '125Hz': [],
        '250Hz': [],
        '500Hz': []
    };
    resetChart();
    measuring = true;
    isRecording = true;

    // 측정 시간 업데이트
    const now = new Date();
    measurementDate.textContent = `날짜: ${now.toLocaleDateString()}`;
    const currentMeasurementTime = now.toLocaleTimeString(); // 현재 시간 저장
    measurementTime.textContent = `시간: ${currentMeasurementTime}`;
    startTime = Date.now();

    scriptProcessor.onaudioprocess = () => {
        if (!measuring) return;

        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);

        let sum = 0.0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sum / buffer.length);
        const decibel = 20 * Math.log10(rms);

        if (decibel === -Infinity) {
            decibelDisplay.textContent = `0.00 dB`;
            households[selectedHousehold].decibelValues.push(0);
            households[selectedHousehold].aWeightedValues.push(applyAWeighting(0));
            updateFreqBands(0);
        } else {
            const adjustedDecibel = Math.max(0, decibel + 100);
            households[selectedHousehold].decibelValues.push(adjustedDecibel);
            households[selectedHousehold].aWeightedValues.push(applyAWeighting(adjustedDecibel));
            updateFreqBands(buffer, adjustedDecibel);
            decibelDisplay.textContent = `${adjustedDecibel.toFixed(2)} dB`;
        }

        updateChart(households[selectedHousehold].decibelValues);
    };

    audioChunks = [];  // 초기화
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };

    mediaRecorder.start();
    initCharts();
});

stopButton.addEventListener('click', () => {
    if (!isRecording) return;

    measuring = false;

    // 데이터 계산 및 결과 UI 업데이트
    if (households[selectedHousehold].decibelValues.length > 0) {
        const avgDecibel = calculateAverage(households[selectedHousehold].decibelValues);
        const maxDecibel = Math.max(...households[selectedHousehold].decibelValues);
        const minDecibel = Math.min(...households[selectedHousehold].decibelValues);
        const avgAWeighted = calculateAverage(households[selectedHousehold].aWeightedValues);
        const laeq = calculateLAeq(households[selectedHousehold].decibelValues);
        const freqBands = calculateFreqBandAverages(households[selectedHousehold].freqBands);
        const liAFmax = calculateLiAFmax(households[selectedHousehold].aWeightedValues);
        const lnAW = calculateLnAW(freqBands);

        // 녹음 종료 후 Blob 생성 및 URL 변환
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);

            // 결과값 화면에 표시
            avgValue.textContent = `평균 값: ${avgDecibel.toFixed(2)} dB`;
            maxValue.textContent = `최대 값: ${maxDecibel.toFixed(2)} dB`;
            minValue.textContent = `최소 값: ${minDecibel.toFixed(2)} dB`;
            aWeightedValue.textContent = `A-가중치 값: ${avgAWeighted.toFixed(2)} dB(A)`;
            laeqValue.textContent = `Laeq 값: ${laeq.toFixed(2)} dB`;
            freq63Value.textContent = `63Hz: ${freqBands['63Hz'].toFixed(2)} dB`;
            freq125Value.textContent = `125Hz: ${freqBands['125Hz'].toFixed(2)} dB`;
            freq250Value.textContent = `250Hz: ${freqBands['250Hz'].toFixed(2)} dB`;
            freq500Value.textContent = `500Hz: ${freqBands['500Hz'].toFixed(2)} dB`;
            liAFmaxValue.textContent = `L'iA,Fmax: ${liAFmax.toFixed(2)} dB`;
            lnAWValue.textContent = `L'n,AW: ${lnAW.toFixed(2)} dB`;

            // 측정 스펙 업데이트
            samplingRateDisplay.textContent = `샘플링 속도: ${(audioContext.sampleRate / 1000).toFixed(2)} kHz`;
            snrDisplay.textContent = `신호대비잡음비: ${calculateSNR(households[selectedHousehold].decibelValues).toFixed(2)} dB`;
            fftSizeDisplay.textContent = `FFT 크기: ${analyser.fftSize}`;
            durationDisplay.textContent = `측정 기간: ${((Date.now() - startTime) / 1000).toFixed(2)} 초`;

            // 데이터 저장
            households[selectedHousehold].measurements.push({
                date: measurementDate.textContent,
                time: measurementTime.textContent,
                avgDecibel,
                maxDecibel,
                minDecibel,
                avgAWeighted,
                laeq,
                freqBands,
                liAFmax,
                lnAW,
                audioUrl // URL을 measurements에 저장
            });

            // 대시보드 업데이트
            updateDashboardTable();
        };

        // 녹음을 중지
        mediaRecorder.stop();
        isRecording = false;
        stopButton.disabled = true; // 종료 후 버튼 비활성화
        startButton.disabled = false; // 시작 버튼 활성화
    } else {
        console.warn("No data collected during measurement.");
    }
});

function initCharts() {
    const ctx = document.getElementById('decibelChart').getContext('2d');
    decibelChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Decibel Level',
                data: [],
                borderColor: 'rgba(255, 127, 0, 1)',
                borderWidth: 2,
                fill: false,
            }]
        },
        options: {
            animation: false, // 애니메이션 비활성화로 성능 최적화
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time (frames)',
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Decibel (dB)',
                    },
                    min: 0,
                    max: 100,
                }
            }
        }
    });
}

function resetChart() {
    if (decibelChart) {
        decibelChart.data.labels = [];
        decibelChart.data.datasets[0].data = [];
        decibelChart.update();
    }
}

function updateChart(decibelValues) {
    decibelChart.data.labels.push(decibelValues.length);
    decibelChart.data.datasets[0].data = decibelValues;
    decibelChart.update('none'); // 애니메이션 없이 즉시 업데이트
}

// 주파수 대역별 dB 값을 계산하는 함수
function calculateFrequencyBands(analyser, buffer, sampleRate, fftSize) {
    const frequencies = [63, 125, 250, 500];
    const bandValues = {};

    const fftData = new Float32Array(fftSize);
    analyser.getFloatFrequencyData(fftData);

    frequencies.forEach(freq => {
        const index = getFrequencyIndex(freq, sampleRate, fftSize);
        let value = fftData[index];

        if (value === -Infinity || value < -100) {
            value = 0;  // 너무 낮거나 -Infinity인 경우 0으로 처리
        }

        bandValues[`${freq}Hz`] = value;
    });

    return bandValues;
}

// 주파수 대역별로 FFT 데이터를 추출하는 함수
function getFrequencyIndex(frequency, sampleRate, fftSize) {
    return Math.round(frequency / (sampleRate / fftSize));
}

// 주파수 대역별 데이터를 업데이트하는 함수
function updateFreqBands(buffer, adjustedDecibel) {
    const freqBands = calculateFrequencyBands(analyser, buffer, audioContext.sampleRate, analyser.fftSize);
    Object.keys(households[selectedHousehold].freqBands).forEach((band) => {
        households[selectedHousehold].freqBands[band].push(freqBands[band]);
    });
}

function updateDashboardTable() {
    dashboardTableBody.innerHTML = '';

    Object.keys(households).forEach(key => {
        households[key].measurements.forEach((measurement, index) => {
            const row = document.createElement('tr');

            const buildingCell = document.createElement('td');
            buildingCell.textContent = households[key].building;
            row.appendChild(buildingCell);

            const unitCell = document.createElement('td');
            unitCell.textContent = households[key].unit;
            row.appendChild(unitCell);

            const dateCell = document.createElement('td');
            dateCell.textContent = measurement.date;
            row.appendChild(dateCell);

            const timeCell = document.createElement('td');
            timeCell.textContent = measurement.time;
            row.appendChild(timeCell);

            const avgDecibelCell = document.createElement('td');
            avgDecibelCell.textContent = measurement.avgDecibel.toFixed(2);
            row.appendChild(avgDecibelCell);

            const maxDecibelCell = document.createElement('td');
            maxDecibelCell.textContent = measurement.maxDecibel.toFixed(2);
            row.appendChild(maxDecibelCell);

            const minDecibelCell = document.createElement('td');
            minDecibelCell.textContent = measurement.minDecibel.toFixed(2);
            row.appendChild(minDecibelCell);

            const avgAWeightedCell = document.createElement('td');
            avgAWeightedCell.textContent = measurement.avgAWeighted.toFixed(2);
            row.appendChild(avgAWeightedCell);

            const laeqCell = document.createElement('td');
            laeqCell.textContent = measurement.laeq.toFixed(2);
            row.appendChild(laeqCell);

            const freq63Cell = document.createElement('td');
            freq63Cell.textContent = measurement.freqBands['63Hz'].toFixed(2);
            row.appendChild(freq63Cell);

            const freq125Cell = document.createElement('td');
            freq125Cell.textContent = measurement.freqBands['125Hz'].toFixed(2);
            row.appendChild(freq125Cell);

            const freq250Cell = document.createElement('td');
            freq250Cell.textContent = measurement.freqBands['250Hz'].toFixed(2);
            row.appendChild(freq250Cell);

            const freq500Cell = document.createElement('td');
            freq500Cell.textContent = measurement.freqBands['500Hz'].toFixed(2);
            row.appendChild(freq500Cell);

            const liAFmaxCell = document.createElement('td');
            liAFmaxCell.textContent = measurement.liAFmax.toFixed(2);
            row.appendChild(liAFmaxCell);

            const lnAWCell = document.createElement('td');
            lnAWCell.textContent = measurement.lnAW.toFixed(2);
            row.appendChild(lnAWCell);

            const audioCell = document.createElement('td');
            if (measurement.audioUrl) {
                const playButton = document.createElement('button');
                playButton.textContent = '재생';
                playButton.onclick = () => {
                    const audio = new Audio(measurement.audioUrl);
                    audio.play();
                };
                audioCell.appendChild(playButton);
            } else {
                audioCell.textContent = 'N/A';
            }
            row.appendChild(audioCell);

            const deleteCell = document.createElement('td');
            const deleteLink = document.createElement('a');
            deleteLink.href = "#";
            deleteLink.textContent = "삭제";
            deleteLink.onclick = () => {
                households[key].measurements.splice(index, 1); // 해당 측정 데이터를 삭제
                updateDashboardTable();
            };
            deleteCell.appendChild(deleteLink);
            row.appendChild(deleteCell);

            dashboardTableBody.appendChild(row);
        });
    });
}

// 엑셀 내보내기 함수
function exportToExcel() {
    const table = document.querySelector('#dashboardTable');
    const rows = Array.from(table.rows);
    const csvContent = rows.map(row => {
        const cols = Array.from(row.cells);
        return cols.map(cell => cell.textContent).join(",");
    }).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dashboard_data.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

exportButton.addEventListener('click', exportToExcel);

function calculateAverage(values) {
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
}

function calculateLAeq(values) {
    const squaredValues = values.map(v => Math.pow(10, v / 10));
    const avgSquaredValue = squaredValues.reduce((a, b) => a + b, 0) / squaredValues.length;
    return 10 * Math.log10(avgSquaredValue);
}

function calculateFreqBandAverages(freqBands) {
    const averages = {};
    for (const band in freqBands) {
        averages[band] = calculateAverage(freqBands[band]);
    }
    return averages;
}

function applyAWeighting(decibel) {
    const aWeightingFactor = -3.2;
    return decibel + aWeightingFactor;
}

function calculateLiAFmax(aWeightedValues) {
    return Math.max(...aWeightedValues);
}

function calculateLnAW(freqBands) {
    // 계산 로직은 보고서의 기준에 따라 적용해야 합니다
    const lnAWValue = calculateAverage(Object.values(freqBands));
    return lnAWValue;
}

function calculateSNR(decibelValues) {
    const signalPower = decibelValues.reduce((sum, value) => sum + Math.pow(10, value / 10), 0) / decibelValues.length;
    const noisePower = 1; // 예시로 작은 고정 값 사용
    return 10 * Math.log10(signalPower / noisePower);
}

function resetResults() {
    avgValue.textContent = '평균 값: -- dB';
    maxValue.textContent = '최대 값: -- dB';
    minValue.textContent = '최소 값: -- dB';
    aWeightedValue.textContent = 'A-가중치 값: -- dB(A)';
    laeqValue.textContent = 'Laeq 값: -- dB';
    freq63Value.textContent = '63Hz: -- dB';
    freq125Value.textContent = '125Hz: -- dB';
    freq250Value.textContent = '250Hz: -- dB';
    freq500Value.textContent = '500Hz: -- dB';
    liAFmaxValue.textContent = 'L\'iA,Fmax: -- dB';
    lnAWValue.textContent = 'L\'n,AW: -- dB';
    samplingRateDisplay.textContent = '샘플링 속도: -- kHz';
    snrDisplay.textContent = '신호대비잡음비: -- dB';
    fftSizeDisplay.textContent = 'FFT 크기: --';
    durationDisplay.textContent = '측정 기간: -- 초';
}

// 이벤트 리스너 설정
dashboardButton.addEventListener('click', () => {
    showSection('dashboard');
    updateDashboardTable();
});

measureButton.addEventListener('click', () => showSection('measure'));
manageHouseholdButton.addEventListener('click', () => showSection('manageHousehold'));

// 초기화
updateHouseholdSelects();
