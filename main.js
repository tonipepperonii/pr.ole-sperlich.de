// App State
let app = {
    currentTab: 'prs',
    firebase: null,
    db: null,
    exercises: [],
    prEntries: [],
    weightEntries: [],
    charts: {
        pr: null,
        weight: null
    }
};

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    setupTabs();
    setupForms();
    setupDateInputs();
    loadFirebaseConfig();
    loadLocalData();
    updateUI();
}

// Tab Management
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            
            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update active tab content
            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            
            app.currentTab = tabId;
            
            // Update charts when switching tabs
            if (tabId === 'prs') {
                setTimeout(() => updatePRChart(), 100);
            } else if (tabId === 'weight') {
                setTimeout(() => updateWeightChart(), 100);
            }
        });
    });
}

// Form Setup
function setupForms() {
    // Add Exercise Form
    document.getElementById('add-exercise').addEventListener('click', addExercise);
    document.getElementById('new-exercise').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addExercise();
    });

    // PR Form
    document.getElementById('pr-form').addEventListener('submit', addPREntry);

    // Weight Form
    document.getElementById('weight-form').addEventListener('submit', addWeightEntry);

    // Firebase Config
    document.getElementById('save-config').addEventListener('click', saveFirebaseConfig);

    // Data Management
    document.getElementById('export-data').addEventListener('click', exportData);
    document.getElementById('clear-data').addEventListener('click', clearAllData);

    // Chart Controls
    document.getElementById('chart-exercise').addEventListener('change', updatePRChart);
    document.getElementById('chart-period').addEventListener('change', updatePRChart);
    document.getElementById('weight-chart-period').addEventListener('change', updateWeightChart);
}

function setupDateInputs() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pr-date').value = today;
    document.getElementById('weight-date').value = today;
}

// Firebase Management
function loadFirebaseConfig() {
    const savedConfig = localStorage.getItem('firebase-config');
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            document.getElementById('firebase-config').value = JSON.stringify(config, null, 2);
            initializeFirebase(config);
        } catch (error) {
            console.error('Error loading Firebase config:', error);
        }
    }
}

function saveFirebaseConfig() {
    const configText = document.getElementById('firebase-config').value.trim();
    if (!configText) {
        showMessage('Bitte Firebase-Konfiguration eingeben', 'error');
        return;
    }

    try {
        const config = JSON.parse(configText);
        localStorage.setItem('firebase-config', JSON.stringify(config));
        initializeFirebase(config);
        showMessage('Firebase-Konfiguration gespeichert', 'success');
    } catch (error) {
        showMessage('Ungültige JSON-Konfiguration', 'error');
        console.error('Config parse error:', error);
    }
}

function initializeFirebase(config) {
    try {
        if (app.firebase) {
            app.firebase.delete();
        }
        
        app.firebase = firebase.initializeApp(config);
        app.db = firebase.firestore();
        
        updateConnectionStatus(true);
        loadDataFromFirebase();
    } catch (error) {
        console.error('Firebase initialization error:', error);
        updateConnectionStatus(false);
        showMessage('Firebase-Verbindung fehlgeschlagen', 'error');
    }
}

function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    const statusContainer = statusElement.parentElement;
    
    if (connected) {
        statusElement.textContent = 'Verbunden';
        statusContainer.className = 'connection-status connected';
    } else {
        statusElement.textContent = 'Nicht verbunden';
        statusContainer.className = 'connection-status disconnected';
    }
}

// Data Management
function loadLocalData() {
    const exercises = localStorage.getItem('exercises');
    const prEntries = localStorage.getItem('pr-entries');
    const weightEntries = localStorage.getItem('weight-entries');

    if (exercises) app.exercises = JSON.parse(exercises);
    if (prEntries) app.prEntries = JSON.parse(prEntries);
    if (weightEntries) app.weightEntries = JSON.parse(weightEntries);
}

function saveLocalData() {
    localStorage.setItem('exercises', JSON.stringify(app.exercises));
    localStorage.setItem('pr-entries', JSON.stringify(app.prEntries));
    localStorage.setItem('weight-entries', JSON.stringify(app.weightEntries));
}

async function loadDataFromFirebase() {
    if (!app.db) return;

    try {
        // Load exercises
        const exercisesSnapshot = await app.db.collection('exercises').get();
        app.exercises = exercisesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Load PR entries
        const prSnapshot = await app.db.collection('pr-entries').orderBy('date', 'desc').get();
        app.prEntries = prSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Load weight entries
        const weightSnapshot = await app.db.collection('weight-entries').orderBy('date', 'desc').get();
        app.weightEntries = weightSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        saveLocalData();
        updateUI();
        showMessage('Daten von Firebase geladen', 'success');
    } catch (error) {
        console.error('Error loading from Firebase:', error);
        showMessage('Fehler beim Laden der Daten', 'error');
    }
}

async function saveToFirebase(collection, data, id = null) {
    if (!app.db) {
        saveLocalData();
        return;
    }

    try {
        if (id) {
            await app.db.collection(collection).doc(id).set(data);
        } else {
            const docRef = await app.db.collection(collection).add(data);
            return docRef.id;
        }
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        showMessage('Fehler beim Speichern', 'error');
    }
}

async function deleteFromFirebase(collection, id) {
    if (!app.db) {
        saveLocalData();
        return;
    }

    try {
        await app.db.collection(collection).doc(id).delete();
    } catch (error) {
        console.error('Error deleting from Firebase:', error);
        showMessage('Fehler beim Löschen', 'error');
    }
}

// Exercise Management
function addExercise() {
    const input = document.getElementById('new-exercise');
    const exerciseName = input.value.trim();

    if (!exerciseName) {
        showMessage('Bitte Übungsname eingeben', 'error');
        return;
    }

    if (app.exercises.some(ex => ex.name.toLowerCase() === exerciseName.toLowerCase())) {
        showMessage('Übung existiert bereits', 'error');
        return;
    }

    const exercise = {
        name: exerciseName,
        createdAt: new Date().toISOString()
    };

    saveToFirebase('exercises', exercise).then(id => {
        if (id) exercise.id = id;
        app.exercises.push(exercise);
        saveLocalData();
        updateExerciseSelects();
        input.value = '';
        showMessage('Übung hinzugefügt', 'success');
    });
}

function updateExerciseSelects() {
    const selects = ['exercise-select', 'chart-exercise'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        const currentValue = select.value;
        
        // Clear options except first
        select.innerHTML = select.children[0].outerHTML;
        
        // Add exercises
        app.exercises.forEach(exercise => {
            const option = document.createElement('option');
            option.value = exercise.name;
            option.textContent = exercise.name;
            select.appendChild(option);
        });
        
        // Restore selection
        if (currentValue) select.value = currentValue;
    });
}

// PR Entry Management
function addPREntry(e) {
    e.preventDefault();
    
    const exerciseName = document.getElementById('exercise-select').value;
    const date = document.getElementById('pr-date').value;
    const weight = parseFloat(document.getElementById('pr-weight').value);
    const reps = parseInt(document.getElementById('pr-reps').value) || null;

    if (!exerciseName || !date || !weight) {
        showMessage('Bitte alle Pflichtfelder ausfüllen', 'error');
        return;
    }

    const entry = {
        exercise: exerciseName,
        date: date,
        weight: weight,
        reps: reps,
        createdAt: new Date().toISOString()
    };

    saveToFirebase('pr-entries', entry).then(id => {
        if (id) entry.id = id;
        app.prEntries.unshift(entry);
        saveLocalData();
        updatePRList();
        updatePRChart();
        document.getElementById('pr-form').reset();
        setupDateInputs();
        showMessage('PR gespeichert', 'success');
    });
}

function deletePREntry(id) {
    if (!confirm('Eintrag wirklich löschen?')) return;

    deleteFromFirebase('pr-entries', id);
    app.prEntries = app.prEntries.filter(entry => entry.id !== id);
    saveLocalData();
    updatePRList();
    updatePRChart();
    showMessage('Eintrag gelöscht', 'success');
}

function updatePRList() {
    const container = document.getElementById('pr-list');
    
    if (app.prEntries.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>Keine Einträge</h3><p>Füge deine ersten PRs hinzu!</p></div>';
        return;
    }

    container.innerHTML = app.prEntries.map(entry => `
        <div class="entry-item">
            <div class="entry-info">
                <div class="entry-value">${entry.exercise}: ${entry.weight}kg</div>
                <div class="entry-date">${formatDate(entry.date)}</div>
                ${entry.reps ? `<div class="entry-reps">${entry.reps} Wiederholungen</div>` : ''}
            </div>
            <button class="delete-btn" onclick="deletePREntry('${entry.id}')">×</button>
        </div>
    `).join('');
}

// Weight Entry Management
function addWeightEntry(e) {
    e.preventDefault();
    
    const date = document.getElementById('weight-date').value;
    const weight = parseFloat(document.getElementById('weight-value').value);

    if (!date || !weight) {
        showMessage('Bitte alle Felder ausfüllen', 'error');
        return;
    }

    const entry = {
        date: date,
        weight: weight,
        createdAt: new Date().toISOString()
    };

    saveToFirebase('weight-entries', entry).then(id => {
        if (id) entry.id = id;
        app.weightEntries.unshift(entry);
        saveLocalData();
        updateWeightList();
        updateWeightChart();
        document.getElementById('weight-form').reset();
        setupDateInputs();
        showMessage('Gewicht gespeichert', 'success');
    });
}

function deleteWeightEntry(id) {
    if (!confirm('Eintrag wirklich löschen?')) return;

    deleteFromFirebase('weight-entries', id);
    app.weightEntries = app.weightEntries.filter(entry => entry.id !== id);
    saveLocalData();
    updateWeightList();
    updateWeightChart();
    showMessage('Eintrag gelöscht', 'success');
}

function updateWeightList() {
    const container = document.getElementById('weight-list');
    
    if (app.weightEntries.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>Keine Einträge</h3><p>Füge deine ersten Gewichtseinträge hinzu!</p></div>';
        return;
    }

    container.innerHTML = app.weightEntries.map(entry => `
        <div class="entry-item">
            <div class="entry-info">
                <div class="entry-value">${entry.weight}kg</div>
                <div class="entry-date">${formatDate(entry.date)}</div>
            </div>
            <button class="delete-btn" onclick="deleteWeightEntry('${entry.id}')">×</button>
        </div>
    `).join('');
}

// Chart Management
function updatePRChart() {
    const exerciseSelect = document.getElementById('chart-exercise');
    const periodSelect = document.getElementById('chart-period');
    const canvas = document.getElementById('pr-chart');
    const ctx = canvas.getContext('2d');

    const selectedExercise = exerciseSelect.value;
    const selectedPeriod = periodSelect.value;

    if (!selectedExercise) {
        if (app.charts.pr) {
            app.charts.pr.destroy();
            app.charts.pr = null;
        }
        return;
    }

    // Filter data
    const exerciseEntries = app.prEntries
        .filter(entry => entry.exercise === selectedExercise)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const filteredEntries = filterByPeriod(exerciseEntries, selectedPeriod);

    if (filteredEntries.length === 0) {
        if (app.charts.pr) {
            app.charts.pr.destroy();
            app.charts.pr = null;
        }
        return;
    }

    // Prepare chart data
    const labels = filteredEntries.map(entry => formatDate(entry.date));
    const weights = filteredEntries.map(entry => entry.weight);

    // Destroy existing chart
    if (app.charts.pr) {
        app.charts.pr.destroy();
    }

    // Create new chart
    app.charts.pr = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${selectedExercise} (kg)`,
                data: weights,
                borderColor: '#ff4444',
                backgroundColor: 'rgba(255, 68, 68, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ff4444',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#b0b0b0'
                    },
                    grid: {
                        color: '#444444'
                    }
                },
                y: {
                    ticks: {
                        color: '#b0b0b0'
                    },
                    grid: {
                        color: '#444444'
                    }
                }
            }
        }
    });
}

function updateWeightChart() {
    const periodSelect = document.getElementById('weight-chart-period');
    const canvas = document.getElementById('weight-chart');
    const ctx = canvas.getContext('2d');

    const selectedPeriod = periodSelect.value;

    // Filter data
    const sortedEntries = app.weightEntries
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const filteredEntries = filterByPeriod(sortedEntries, selectedPeriod);

    if (filteredEntries.length === 0) {
        if (app.charts.weight) {
            app.charts.weight.destroy();
            app.charts.weight = null;
        }
        return;
    }

    // Prepare chart data
    const labels = filteredEntries.map(entry => formatDate(entry.date));
    const weights = filteredEntries.map(entry => entry.weight);

    // Destroy existing chart
    if (app.charts.weight) {
        app.charts.weight.destroy();
    }

    // Create new chart
    app.charts.weight = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Körpergewicht (kg)',
                data: weights,
                borderColor: '#ff4444',
                backgroundColor: 'rgba(255, 68, 68, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ff4444',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#b0b0b0'
                    },
                    grid: {
                        color: '#444444'
                    }
                },
                y: {
                    ticks: {
                        color: '#b0b0b0'
                    },
                    grid: {
                        color: '#444444'
                    }
                }
            }
        }
    });
}

// Utility Functions
function filterByPeriod(entries, period) {
    if (period === 'max') return entries;

    const months = parseInt(period);
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    return entries.filter(entry => new Date(entry.date) >= cutoffDate);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
    });
}

function showMessage(text, type = 'success') {
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());

    // Create new message
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;

    // Insert at top of current tab content
    const activeTab = document.querySelector('.tab-content.active');
    activeTab.insertBefore(message, activeTab.firstChild);

    // Auto remove after 3 seconds
    setTimeout(() => {
        if (message.parentNode) {
            message.remove();
        }
    }, 3000);
}

function updateUI() {
    updateExerciseSelects();
    updatePRList();
    updateWeightList();
    updatePRChart();
    updateWeightChart();
}

// Data Export/Import
function exportData() {
    const data = {
        exercises: app.exercises,
        prEntries: app.prEntries,
        weightEntries: app.weightEntries,
        exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `pr-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMessage('Daten exportiert', 'success');
}

function clearAllData() {
    if (!confirm('Wirklich ALLE Daten löschen? Diese Aktion kann nicht rückgängig gemacht werden!')) {
        return;
    }

    if (!confirm('Letzte Warnung: Alle Übungen, PRs und Gewichtseinträge werden gelöscht!')) {
        return;
    }

    // Clear Firebase
    if (app.db) {
        Promise.all([
            ...app.exercises.map(ex => deleteFromFirebase('exercises', ex.id)),
            ...app.prEntries.map(entry => deleteFromFirebase('pr-entries', entry.id)),
            ...app.weightEntries.map(entry => deleteFromFirebase('weight-entries', entry.id))
        ]).then(() => {
            showMessage('Alle Daten aus Firebase gelöscht', 'success');
        });
    }

    // Clear local data
    app.exercises = [];
    app.prEntries = [];
    app.weightEntries = [];
    
    localStorage.removeItem('exercises');
    localStorage.removeItem('pr-entries');
    localStorage.removeItem('weight-entries');

    updateUI();
    showMessage('Alle lokalen Daten gelöscht', 'success');
}
