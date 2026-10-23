// App State
let app = {
    currentTab: 'prs',
    selectedExerciseId: localStorage.getItem('selected-exercise') || null,
    firebase: null,
    db: null,
    exercises: [],
    prEntries: [],
    weightEntries: [],
    newExerciseType: 'weight',
    editingExerciseId: null,
    periods: {
        pr: localStorage.getItem('pr-period') || 'max',
        weight: localStorage.getItem('weight-period') || 'max'
    },
    charts: {
        pr: null,
        weight: null
    }
};

// Übungstypen: was ist bei einer Übung ausschlaggebend?
const EXERCISE_TYPES = {
    weight: { label: 'Gewicht', short: 'kg' },
    reps: { label: 'Wiederholungen', short: 'Wdh.' },
    time: { label: 'Dauer', short: 'Zeit' }
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    registerServiceWorker();
});

function initializeApp() {
    setupTabs();
    setupForms();
    setupDateInputs();
    setGreeting();
    loadLocalData();
    loadFirebaseConfig();
    updateUI();
}

function setGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Guten Abend';
    if (hour < 11) greeting = 'Guten Morgen';
    else if (hour < 18) greeting = 'Hallo';
    document.getElementById('greeting').textContent = `${greeting} 👋`;
}

// Tab Management
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;

            tabButtons.forEach(btn => btn.classList.toggle('active', btn === button));
            tabContents.forEach(content => content.classList.toggle('active', content.id === tabId));

            app.currentTab = tabId;
            window.scrollTo(0, 0);

            // Charts neu zeichnen, sobald der Tab sichtbar ist
            if (tabId === 'prs') {
                requestAnimationFrame(updatePRChart);
            } else if (tabId === 'weight') {
                requestAnimationFrame(updateWeightChart);
            }
        });
    });
}

// Form Setup
function setupForms() {
    // Add Exercise
    document.getElementById('add-exercise').addEventListener('click', addExercise);
    document.getElementById('new-exercise').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addExercise();
    });
    setupSegmented('new-exercise-type', 'type', type => { app.newExerciseType = type; });

    // Exercise Management
    document.getElementById('exercise-manage-list').addEventListener('click', onManageListClick);
    document.getElementById('sort-alpha').addEventListener('click', sortExercisesAlphabetically);
    document.getElementById('exercise-edit-form').addEventListener('submit', onExerciseDialogSubmit);
    document.getElementById('delete-exercise').addEventListener('click', deleteEditingExercise);
    document.getElementById('exercise-dialog').addEventListener('click', (e) => {
        // Tap auf den abgedunkelten Hintergrund schließt das Sheet
        if (e.target === e.currentTarget) e.currentTarget.close();
    });
    setupSegmented('edit-exercise-type', 'type', type => updateGoalFields(type));
    document.getElementById('pr-goal-set').addEventListener('click', () => {
        if (app.selectedExerciseId) openExerciseDialog(app.selectedExerciseId, true);
    });

    // Exercise Chips
    document.getElementById('exercise-chips').addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (chip) selectExercise(chip.dataset.id);
    });

    // PR Form
    document.getElementById('pr-form').addEventListener('submit', addPREntry);

    // Weight Form
    document.getElementById('weight-form').addEventListener('submit', addWeightEntry);

    // Delete-Buttons in Listen
    document.getElementById('pr-list').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-delete]');
        if (btn) deletePREntry(btn.dataset.delete);
    });
    document.getElementById('weight-list').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-delete]');
        if (btn) deleteWeightEntry(btn.dataset.delete);
    });

    // Firebase Config
    document.getElementById('save-config').addEventListener('click', saveFirebaseConfig);

    // Data Management
    document.getElementById('export-data').addEventListener('click', exportData);
    document.getElementById('clear-data').addEventListener('click', clearAllData);

    // Chart Controls
    setupSegmented('chart-period', 'period', period => {
        app.periods.pr = period;
        localStorage.setItem('pr-period', period);
        updatePRChart();
    }, app.periods.pr);
    setupSegmented('weight-chart-period', 'period', period => {
        app.periods.weight = period;
        localStorage.setItem('weight-period', period);
        updateWeightChart();
        updateWeightHero();
    }, app.periods.weight);
}

// Pill-Auswahl: genau ein Button aktiv
function setupSegmented(containerId, dataKey, onChange, initialValue) {
    const container = document.getElementById(containerId);
    if (initialValue !== undefined) setSegmentedValue(containerId, dataKey, initialValue);

    container.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        setSegmentedValue(containerId, dataKey, button.dataset[dataKey]);
        if (onChange) onChange(button.dataset[dataKey]);
    });
}

function setSegmentedValue(containerId, dataKey, value) {
    document.querySelectorAll(`#${containerId} button`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset[dataKey] === value);
    });
}

function getSegmentedValue(containerId, dataKey) {
    const active = document.querySelector(`#${containerId} button.active`);
    return active ? active.dataset[dataKey] : null;
}

function setupDateInputs() {
    const today = todayString();
    document.getElementById('pr-date').value = today;
    document.getElementById('weight-date').value = today;
}

// Firebase Configuration - Hier deine Config eintragen!
const FIREBASE_CONFIG = {
    "apiKey": "AIzaSyDN5GjFDHFq2-mRpaejA5fxg-fCHcKyXaM",
    "authDomain": "pr-tracking-bcf4a.firebaseapp.com",
    "projectId": "pr-tracking-bcf4a",
    "storageBucket": "pr-tracking-bcf4a.firebasestorage.app",
    "messagingSenderId": "91735077638",
    "appId": "1:91735077638:web:e09c1d5c5e3f0c442ba487"
};

// Firebase Management
function loadFirebaseConfig() {
    // Automatisch die eingebaute Config verwenden
    if (FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey) {
        document.getElementById('firebase-config').value = JSON.stringify(FIREBASE_CONFIG, null, 2);
        initializeFirebase(FIREBASE_CONFIG);
        return;
    }

    // Fallback: Aus localStorage laden
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

async function initializeFirebase(config) {
    try {
        if (app.firebase) {
            await app.firebase.delete();
        }

        app.firebase = firebase.initializeApp(config);
        app.db = firebase.firestore();

        // Offline-Cache: Schreibvorgänge werden gepuffert und später synchronisiert
        try {
            await app.db.enablePersistence({ synchronizeTabs: true });
        } catch (error) {
            console.log('Firestore persistence not available:', error.code);
        }

        updateConnectionStatus(true);
        loadDataFromFirebase();
    } catch (error) {
        console.error('Firebase initialization error:', error);
        updateConnectionStatus(false);
        showMessage('Firebase-Verbindung fehlgeschlagen', 'error');
    }
}

function updateConnectionStatus(connected) {
    document.getElementById('connection-status').textContent =
        connected ? 'Mit Firebase verbunden' : 'Nicht verbunden – nur lokal gespeichert';
    document.getElementById('connection-status-box').classList.toggle('connected', connected);
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
        const [exercisesSnapshot, prSnapshot, weightSnapshot] = await Promise.all([
            app.db.collection('exercises').get(),
            app.db.collection('pr-entries').orderBy('date', 'desc').get(),
            app.db.collection('weight-entries').orderBy('date', 'desc').get()
        ]);

        app.exercises = exercisesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        app.prEntries = prSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        app.weightEntries = weightSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        saveLocalData();
        updateUI();
    } catch (error) {
        console.error('Error loading from Firebase:', error);
        showMessage('Fehler beim Laden der Daten', 'error');
    }
}

// Speichert ein neues Dokument. Die ID wird lokal erzeugt, damit die UI
// sofort aktualisiert werden kann – auch offline.
function saveToFirebase(collection, data) {
    if (!app.db) {
        return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    const docRef = app.db.collection(collection).doc();
    docRef.set(data).catch(error => {
        console.error('Error saving to Firebase:', error);
        showMessage('Fehler beim Speichern', 'error');
    });
    return docRef.id;
}

function updateInFirebase(collection, id, data) {
    if (!app.db || !id || id.startsWith('local-')) return Promise.resolve();

    return app.db.collection(collection).doc(id).update(data).catch(error => {
        console.error('Error updating Firebase:', error);
        showMessage('Fehler beim Speichern', 'error');
    });
}

function deleteFromFirebase(collection, id) {
    if (!app.db || !id || id.startsWith('local-')) return Promise.resolve();

    return app.db.collection(collection).doc(id).delete().catch(error => {
        console.error('Error deleting from Firebase:', error);
        showMessage('Fehler beim Löschen', 'error');
    });
}

// Exercise Helpers
function exerciseType(exercise) {
    return exercise && EXERCISE_TYPES[exercise.type] ? exercise.type : 'weight';
}

function getSortedExercises() {
    return [...app.exercises].sort((a, b) => {
        const orderA = Number.isFinite(a.order) ? a.order : Infinity;
        const orderB = Number.isFinite(b.order) ? b.order : Infinity;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });
    });
}

function getSelectedExercise() {
    return app.exercises.find(ex => ex.id === app.selectedExerciseId) || null;
}

function entriesForExercise(exercise) {
    return app.prEntries.filter(entry => entry.exercise === exercise.name);
}

// Ausschlaggebender Wert eines Eintrags je nach Übungstyp
function entryValue(entry, type) {
    if (type === 'reps') return entry.reps || 0;
    if (type === 'time') return entry.duration || 0;
    return entry.weight || 0;
}

// Exercise Management
function addExercise() {
    const input = document.getElementById('new-exercise');
    const exerciseName = input.value.trim();

    if (!exerciseName) {
        showMessage('Bitte Übungsname eingeben', 'error');
        return;
    }

    if (isDuplicateName(exerciseName)) {
        showMessage('Übung existiert bereits', 'error');
        return;
    }

    const maxOrder = app.exercises.reduce((max, ex) => Number.isFinite(ex.order) ? Math.max(max, ex.order) : max, -1);
    const exercise = {
        name: exerciseName,
        type: app.newExerciseType,
        order: maxOrder + 1,
        createdAt: new Date().toISOString()
    };

    exercise.id = saveToFirebase('exercises', { ...exercise });
    app.exercises.push(exercise);
    saveLocalData();

    input.value = '';
    input.blur();
    app.selectedExerciseId = exercise.id;
    localStorage.setItem('selected-exercise', exercise.id);
    updateExerciseViews();
    showMessage(`„${exerciseName}“ hinzugefügt`, 'success');
}

function isDuplicateName(name, ignoreId = null) {
    return app.exercises.some(ex => ex.id !== ignoreId && ex.name.toLowerCase() === name.toLowerCase());
}

function onManageListClick(e) {
    const item = e.target.closest('[data-id]');
    if (!item) return;
    const id = item.dataset.id;

    if (e.target.closest('[data-move="up"]')) moveExercise(id, -1);
    else if (e.target.closest('[data-move="down"]')) moveExercise(id, 1);
    else if (e.target.closest('[data-edit], .entry-info')) openExerciseDialog(id);
}

function moveExercise(id, direction) {
    const sorted = getSortedExercises();
    const index = sorted.findIndex(ex => ex.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sorted.length) return;

    [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
    persistOrder(sorted);
}

function sortExercisesAlphabetically() {
    const sorted = [...app.exercises].sort((a, b) =>
        a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })
    );
    persistOrder(sorted);
    showMessage('Alphabetisch sortiert', 'success');
}

// Schreibt die Reihenfolge; nur geänderte Übungen werden gespeichert
function persistOrder(sortedExercises) {
    sortedExercises.forEach((exercise, index) => {
        if (exercise.order !== index) {
            exercise.order = index;
            updateInFirebase('exercises', exercise.id, { order: index });
        }
    });
    saveLocalData();
    updateExerciseViews();
}

function openExerciseDialog(id, focusGoal = false) {
    const exercise = app.exercises.find(ex => ex.id === id);
    if (!exercise) return;

    const type = exerciseType(exercise);
    app.editingExerciseId = id;
    document.getElementById('edit-exercise-name').value = exercise.name;
    setSegmentedValue('edit-exercise-type', 'type', type);
    updateGoalFields(type);
    document.getElementById('exercise-dialog').showModal();

    if (focusGoal) {
        document.getElementById(type === 'time' ? 'edit-goal-min' : 'edit-goal').focus();
    }
}

// Ziel wird in der Einheit des Übungstyps gespeichert: kg, Wdh. oder Sekunden
function fillGoalFields(goal, type) {
    document.getElementById('edit-goal').value = goal && type !== 'time' ? goal : '';
    document.getElementById('edit-goal-min').value = goal && type === 'time' ? Math.floor(goal / 60) || '' : '';
    document.getElementById('edit-goal-sec').value = goal && type === 'time' ? goal % 60 || '' : '';
}

function updateGoalFields(type) {
    const exercise = app.exercises.find(ex => ex.id === app.editingExerciseId);
    // Beim Typwechsel passt das alte Ziel nicht mehr zur Einheit
    fillGoalFields(exercise && exerciseType(exercise) === type ? exercise.goal || null : null, type);

    document.querySelector('[data-goal="value"]').hidden = type === 'time';
    document.querySelector('[data-goal="time"]').hidden = type !== 'time';
    document.getElementById('edit-goal-label').textContent =
        type === 'reps' ? 'Ziel in Wdh. (optional)' : 'Ziel in kg (optional)';
}

function readGoalFields(type) {
    let goal;
    if (type === 'time') {
        const minutes = parseInt(document.getElementById('edit-goal-min').value) || 0;
        const seconds = parseInt(document.getElementById('edit-goal-sec').value) || 0;
        goal = minutes * 60 + seconds;
    } else if (type === 'reps') {
        goal = parseInt(document.getElementById('edit-goal').value) || 0;
    } else {
        goal = parseFloat(document.getElementById('edit-goal').value) || 0;
    }
    return goal > 0 ? goal : null;
}

function onExerciseDialogSubmit(e) {
    if (e.submitter && e.submitter.value === 'cancel') return;

    const exercise = app.exercises.find(ex => ex.id === app.editingExerciseId);
    if (!exercise) return;

    const newName = document.getElementById('edit-exercise-name').value.trim();
    const newType = getSegmentedValue('edit-exercise-type', 'type') || 'weight';

    if (!newName) {
        e.preventDefault();
        showMessage('Bitte Übungsname eingeben', 'error');
        return;
    }
    if (isDuplicateName(newName, exercise.id)) {
        e.preventDefault();
        showMessage('Übung existiert bereits', 'error');
        return;
    }

    const oldName = exercise.name;
    const newGoal = readGoalFields(newType);
    const changes = {};
    if (newName !== oldName) changes.name = newName;
    if (newType !== exerciseType(exercise)) changes.type = newType;
    if (newGoal !== (exercise.goal || null)) changes.goal = newGoal;
    if (Object.keys(changes).length === 0) return;

    Object.assign(exercise, changes);
    updateInFirebase('exercises', exercise.id, changes);

    // Einträge referenzieren die Übung über den Namen
    if (changes.name) {
        const affected = app.prEntries.filter(entry => entry.exercise === oldName);
        affected.forEach(entry => { entry.exercise = newName; });
        batchUpdate('pr-entries', affected.map(entry => entry.id), { exercise: newName });
    }

    saveLocalData();
    updateExerciseViews();
    showMessage('Übung aktualisiert', 'success');
}

function deleteEditingExercise() {
    const exercise = app.exercises.find(ex => ex.id === app.editingExerciseId);
    if (!exercise) return;

    const entries = entriesForExercise(exercise);
    const question = entries.length > 0
        ? `„${exercise.name}“ und ${entries.length} Einträge wirklich löschen?`
        : `„${exercise.name}“ wirklich löschen?`;
    if (!confirm(question)) return;

    document.getElementById('exercise-dialog').close();

    deleteFromFirebase('exercises', exercise.id);
    batchDelete('pr-entries', entries.map(entry => entry.id));

    app.exercises = app.exercises.filter(ex => ex.id !== exercise.id);
    app.prEntries = app.prEntries.filter(entry => entry.exercise !== exercise.name);
    if (app.selectedExerciseId === exercise.id) app.selectedExerciseId = null;

    persistOrder(getSortedExercises());
    showMessage(`„${exercise.name}“ gelöscht`, 'success');
}

// Firestore-Batches sind auf 500 Operationen begrenzt
function batchUpdate(collection, ids, data) {
    runBatches(ids, (batch, ref) => batch.update(ref, data), collection);
}

function batchDelete(collection, ids) {
    runBatches(ids, (batch, ref) => batch.delete(ref), collection);
}

function runBatches(ids, operation, collection) {
    if (!app.db) return;
    const remoteIds = ids.filter(id => id && !id.startsWith('local-'));

    for (let i = 0; i < remoteIds.length; i += 450) {
        const batch = app.db.batch();
        remoteIds.slice(i, i + 450).forEach(id => operation(batch, app.db.collection(collection).doc(id)));
        batch.commit().catch(error => {
            console.error('Batch error:', error);
            showMessage('Fehler beim Synchronisieren', 'error');
        });
    }
}

function updateExerciseManageList() {
    const container = document.getElementById('exercise-manage-list');
    const sorted = getSortedExercises();

    if (sorted.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Noch keine Übungen angelegt.</p></div>';
        return;
    }

    const upIcon = '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>';
    const downIcon = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
    const editIcon = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';

    container.innerHTML = sorted.map((exercise, index) => {
        const count = entriesForExercise(exercise).length;
        const goal = exercise.goal ? ` · Ziel ${formatValue(exercise.goal, exerciseType(exercise))}` : '';
        return `
        <div class="entry-item manage-item" data-id="${escapeHtml(exercise.id)}">
            <div class="entry-info">
                <div class="entry-value">${escapeHtml(exercise.name)}<span class="badge type">${EXERCISE_TYPES[exerciseType(exercise)].short}</span></div>
                <div class="entry-meta">${count} ${count === 1 ? 'Eintrag' : 'Einträge'}${escapeHtml(goal)}</div>
            </div>
            <div class="manage-actions">
                <button type="button" class="icon-btn" data-edit aria-label="Bearbeiten">${editIcon}</button>
                <button type="button" class="icon-btn" data-move="up" aria-label="Nach oben" ${index === 0 ? 'disabled' : ''}>${upIcon}</button>
                <button type="button" class="icon-btn" data-move="down" aria-label="Nach unten" ${index === sorted.length - 1 ? 'disabled' : ''}>${downIcon}</button>
            </div>
        </div>`;
    }).join('');
}

function updateExerciseChips() {
    const container = document.getElementById('exercise-chips');
    const sorted = getSortedExercises();

    // Fallback: erste Übung in der eigenen Reihenfolge
    if (!getSelectedExercise() && sorted.length > 0) {
        app.selectedExerciseId = sorted[0].id;
    }

    container.innerHTML = sorted.map(exercise => `
        <button type="button" class="chip ${exercise.id === app.selectedExerciseId ? 'active' : ''}" data-id="${escapeHtml(exercise.id)}">${escapeHtml(exercise.name)}</button>
    `).join('');

    // Aktiven Chip sichtbar machen, ohne die Seite vertikal zu scrollen
    const active = container.querySelector('.chip.active');
    if (active) container.scrollLeft = Math.max(0, active.offsetLeft - 16);
}

function selectExercise(id) {
    app.selectedExerciseId = id;
    localStorage.setItem('selected-exercise', id);
    document.querySelectorAll('#exercise-chips .chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.id === id);
    });
    updateExerciseContent();
}

function updateExerciseViews() {
    updateExerciseChips();
    updateExerciseManageList();
    updateExerciseContent();
}

function updateExerciseContent() {
    const exercise = getSelectedExercise();
    document.getElementById('exercise-content').hidden = !exercise;
    document.getElementById('no-exercise-selected').hidden = !!exercise;

    if (!exercise) return;

    updatePRForm(exercise);
    updatePRHero();
    updatePRList();
    updatePRChart();
}

// Formularfelder je nach Übungstyp
function updatePRForm(exercise) {
    const type = exerciseType(exercise);
    const form = document.getElementById('pr-form');

    form.querySelector('[data-field="weight"]').hidden = type === 'time';
    form.querySelector('[data-field="reps"]').hidden = type === 'time';
    form.querySelector('[data-field="time"]').hidden = type !== 'time';

    document.getElementById('pr-weight-label').textContent = type === 'reps' ? 'Zusatzgewicht (kg)' : 'Gewicht (kg)';
    document.getElementById('pr-reps-label').textContent = type === 'reps' ? 'Wiederholungen' : 'Wdh. (optional)';
    document.getElementById('pr-weight').placeholder = type === 'reps' ? 'optional' : '0';
}

// PR Entry Management
function addPREntry(e) {
    e.preventDefault();

    const exercise = getSelectedExercise();
    if (!exercise) return;

    const type = exerciseType(exercise);
    const date = document.getElementById('pr-date').value;
    const weight = parseFloat(document.getElementById('pr-weight').value) || null;
    const reps = parseInt(document.getElementById('pr-reps').value) || null;
    const minutes = parseInt(document.getElementById('pr-minutes').value) || 0;
    const seconds = parseInt(document.getElementById('pr-seconds').value) || 0;
    const duration = minutes * 60 + seconds || null;

    const missing = !date
        || (type === 'weight' && !weight)
        || (type === 'reps' && !reps)
        || (type === 'time' && !duration);
    if (missing) {
        showMessage('Bitte alle Pflichtfelder ausfüllen', 'error');
        return;
    }

    const entry = {
        exercise: exercise.name,
        date: date,
        weight: type === 'time' ? null : weight,
        reps: type === 'time' ? null : reps,
        duration: type === 'time' ? duration : null,
        createdAt: new Date().toISOString()
    };

    const previousBest = bestValue(entriesForExercise(exercise), type);

    entry.id = saveToFirebase('pr-entries', { ...entry });
    app.prEntries.unshift(entry);
    sortByDateDesc(app.prEntries);
    saveLocalData();

    document.getElementById('pr-form').reset();
    setupDateInputs();
    document.activeElement.blur();

    updateExerciseContent();
    updateExerciseManageList();

    const value = entryValue(entry, type);
    const isNewPR = previousBest !== null && value > previousBest;
    const reachedGoal = exercise.goal && value >= exercise.goal && (previousBest === null || previousBest < exercise.goal);
    if (reachedGoal) showMessage('Ziel erreicht! 🎯', 'success');
    else showMessage(isNewPR ? 'Neuer PR! 🏆' : 'Eintrag gespeichert', 'success');
}

function deletePREntry(id) {
    if (!confirm('Eintrag wirklich löschen?')) return;

    deleteFromFirebase('pr-entries', id);
    app.prEntries = app.prEntries.filter(entry => entry.id !== id);
    saveLocalData();
    updateExerciseContent();
    updateExerciseManageList();
    showMessage('Eintrag gelöscht', 'success');
}

function bestValue(entries, type) {
    if (entries.length === 0) return null;
    return Math.max(...entries.map(entry => entryValue(entry, type)));
}

function findBestEntry(entries, type) {
    // Bei Gleichstand zählt der früheste Eintrag als PR
    return [...entries]
        .sort((a, b) => parseDate(a.date) - parseDate(b.date))
        .reduce((best, entry) => !best || entryValue(entry, type) > entryValue(best, type) ? entry : best, null);
}

function updatePRHero() {
    const exercise = getSelectedExercise();
    if (!exercise) return;

    const type = exerciseType(exercise);
    const entries = entriesForExercise(exercise);
    const sorted = [...entries].sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const best = findBestEntry(entries, type);
    const last = sorted[sorted.length - 1];
    const first = sorted[0];

    const heroValue = document.getElementById('pr-hero-value');
    const heroDelta = document.getElementById('pr-hero-delta');
    const statLast = document.getElementById('pr-stat-last');
    const statLastLabel = document.getElementById('pr-stat-last-label');
    const statExtra = document.getElementById('pr-stat-extra');
    const statExtraLabel = document.getElementById('pr-stat-extra-label');

    updateGoalProgress(exercise, best ? entryValue(best, type) : 0);

    if (!best) {
        heroValue.textContent = '–';
        heroDelta.textContent = '';
        statLast.textContent = '–';
        statLastLabel.textContent = 'Letzter Eintrag';
        statExtra.textContent = '0';
        statExtraLabel.textContent = 'Einträge';
        return;
    }

    heroValue.textContent = formatValue(entryValue(best, type), type);

    const delta = entryValue(best, type) - entryValue(first, type);
    heroDelta.className = 'hero-delta';
    heroDelta.textContent = delta > 0 ? `+${formatDelta(delta, type)} seit ${formatDate(first.date)}` : `seit ${formatDate(best.date)}`;

    statLast.textContent = formatEntryShort(last, type);
    statLastLabel.textContent = `Letzter · ${formatDate(last.date)}`;

    // Gewichtsübungen: geschätztes 1RM (Epley), sonst Anzahl Einträge
    const oneRepMax = type === 'weight' ? bestOneRepMax(entries) : null;
    if (oneRepMax) {
        statExtra.textContent = `${formatNumber(oneRepMax)} kg`;
        statExtraLabel.textContent = '1RM geschätzt';
    } else {
        statExtra.textContent = String(entries.length);
        statExtraLabel.textContent = entries.length === 1 ? 'Eintrag' : 'Einträge';
    }
}

function updateGoalProgress(exercise, bestValue) {
    const type = exerciseType(exercise);
    const goal = exercise.goal;
    const container = document.getElementById('pr-goal');

    document.getElementById('pr-goal-set').textContent = goal ? 'Ziel ändern' : 'Ziel setzen';
    container.hidden = !goal;
    if (!goal) return;

    const percent = Math.min(100, Math.round(bestValue / goal * 100));
    const reached = bestValue >= goal;

    container.classList.toggle('reached', reached);
    document.getElementById('pr-goal-text').textContent = `Ziel ${formatValue(goal, type)}`;
    document.getElementById('pr-goal-percent').textContent = reached ? 'Erreicht 🎯' : `${percent} %`;
    document.getElementById('pr-goal-bar').style.width = `${percent}%`;
    document.getElementById('pr-goal-rest').textContent = reached
        ? 'Zeit für ein neues Ziel?'
        : `noch ${formatDelta(goal - bestValue, type)}`;
}

function bestOneRepMax(entries) {
    const values = entries
        .filter(entry => entry.weight && entry.reps && entry.reps <= 12)
        .map(entry => entry.reps === 1 ? entry.weight : entry.weight * (1 + entry.reps / 30));
    if (values.length === 0) return null;
    return Math.round(Math.max(...values) * 2) / 2;
}

function updatePRList() {
    const container = document.getElementById('pr-list');
    const exercise = getSelectedExercise();
    if (!exercise) return;

    const type = exerciseType(exercise);
    const entries = entriesForExercise(exercise);
    const best = findBestEntry(entries, type);

    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>Keine Einträge</h3><p>Füge deinen ersten Eintrag für diese Übung hinzu!</p></div>';
        return;
    }

    container.innerHTML = entries.map(entry => {
        const isBest = entry === best;
        return `
        <div class="entry-item ${isBest ? 'is-best' : ''}">
            <span class="entry-dot"></span>
            <div class="entry-info">
                <div class="entry-value">${escapeHtml(formatEntryShort(entry, type))}${isBest ? '<span class="badge">PR</span>' : ''}</div>
                <div class="entry-meta">${formatDate(entry.date, true)}${formatEntryExtra(entry, type)}</div>
            </div>
            <button type="button" class="icon-btn delete" data-delete="${escapeHtml(entry.id || '')}" aria-label="Löschen">
                <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
        </div>`;
    }).join('');
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

    entry.id = saveToFirebase('weight-entries', { ...entry });
    app.weightEntries.unshift(entry);
    sortByDateDesc(app.weightEntries);
    saveLocalData();

    document.getElementById('weight-form').reset();
    setupDateInputs();
    document.activeElement.blur();

    updateWeightViews();
    showMessage('Gewicht gespeichert', 'success');
}

function deleteWeightEntry(id) {
    if (!confirm('Eintrag wirklich löschen?')) return;

    deleteFromFirebase('weight-entries', id);
    app.weightEntries = app.weightEntries.filter(entry => entry.id !== id);
    saveLocalData();
    updateWeightViews();
    showMessage('Eintrag gelöscht', 'success');
}

function updateWeightViews() {
    updateWeightHero();
    updateWeightList();
    updateWeightChart();
}

function updateWeightHero() {
    const sorted = [...app.weightEntries].sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const inPeriod = filterByPeriod(sorted, app.periods.weight);
    const last = sorted[sorted.length - 1];

    const heroValue = document.getElementById('weight-hero-value');
    const heroDelta = document.getElementById('weight-hero-delta');

    if (!last) {
        heroValue.textContent = '–';
        heroDelta.textContent = '';
        document.getElementById('weight-stat-min').textContent = '–';
        document.getElementById('weight-stat-max').textContent = '–';
        return;
    }

    heroValue.textContent = `${formatNumber(last.weight)} kg`;

    const reference = inPeriod[0];
    const delta = reference && reference !== last ? last.weight - reference.weight : 0;
    heroDelta.className = 'hero-delta';
    if (reference && reference !== last) {
        const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
        heroDelta.textContent = `${sign}${formatNumber(Math.abs(delta))} kg seit ${formatDate(reference.date)}`;
    } else {
        heroDelta.textContent = `am ${formatDate(last.date)}`;
    }

    const values = (inPeriod.length ? inPeriod : sorted).map(entry => entry.weight);
    document.getElementById('weight-stat-min').textContent = `${formatNumber(Math.min(...values))} kg`;
    document.getElementById('weight-stat-max').textContent = `${formatNumber(Math.max(...values))} kg`;
}

function updateWeightList() {
    const container = document.getElementById('weight-list');

    if (app.weightEntries.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>Keine Einträge</h3><p>Füge deinen ersten Gewichtseintrag hinzu!</p></div>';
        return;
    }

    container.innerHTML = app.weightEntries.map(entry => `
        <div class="entry-item">
            <span class="entry-dot"></span>
            <div class="entry-info">
                <div class="entry-value">${formatNumber(entry.weight)} kg</div>
                <div class="entry-meta">${formatDate(entry.date, true)}</div>
            </div>
            <button type="button" class="icon-btn delete" data-delete="${escapeHtml(entry.id || '')}" aria-label="Löschen">
                <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
        </div>
    `).join('');
}

// Chart Management
function updatePRChart() {
    const exercise = getSelectedExercise();
    if (!exercise) {
        destroyChart('pr');
        return;
    }

    const type = exerciseType(exercise);
    const entries = entriesForExercise(exercise).sort((a, b) => parseDate(a.date) - parseDate(b.date));

    renderLineChart({
        key: 'pr',
        canvasId: 'pr-chart',
        emptyId: 'pr-chart-empty',
        entries: entries,
        period: app.periods.pr,
        getValue: entry => entryValue(entry, type),
        formatValue: value => formatValue(value, type),
        formatTick: value => type === 'time' ? formatDurationShort(value) : formatNumber(value),
        beginAtZero: type !== 'weight',
        goal: exercise.goal || null
    });
}

function updateWeightChart() {
    const entries = [...app.weightEntries].sort((a, b) => parseDate(a.date) - parseDate(b.date));

    renderLineChart({
        key: 'weight',
        canvasId: 'weight-chart',
        emptyId: 'weight-chart-empty',
        entries: entries,
        period: app.periods.weight,
        getValue: entry => entry.weight,
        formatValue: value => `${formatNumber(value)} kg`,
        formatTick: value => formatNumber(value),
        beginAtZero: false
    });
}

function destroyChart(key) {
    if (app.charts[key]) {
        app.charts[key].destroy();
        app.charts[key] = null;
    }
}

// Liniendiagramm mit echter Zeitachse: Abstände entsprechen den tatsächlichen Tagen
function renderLineChart({ key, canvasId, emptyId, entries, period, getValue, formatValue, formatTick, beginAtZero, goal = null }) {
    const canvas = document.getElementById(canvasId);
    const filtered = filterByPeriod(entries, period);
    document.getElementById(emptyId).hidden = filtered.length > 0;

    destroyChart(key);
    if (filtered.length === 0 || typeof Chart === 'undefined') return;

    const points = filtered.map(entry => ({ x: parseDate(entry.date).getTime(), y: getValue(entry) }));
    const { min, max } = getTimeRange(points, period);

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 240);
    gradient.addColorStop(0, 'rgba(95, 212, 169, 0.35)');
    gradient.addColorStop(1, 'rgba(95, 212, 169, 0)');

    app.charts[key] = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                data: points,
                borderColor: '#5fd4a9',
                backgroundColor: gradient,
                borderWidth: 2.5,
                fill: true,
                cubicInterpolationMode: 'monotone',
                pointBackgroundColor: '#5fd4a9',
                pointBorderColor: '#0b1613',
                pointBorderWidth: 2,
                pointRadius: points.length > 40 ? 0 : 4,
                pointHoverRadius: 6,
                pointHitRadius: 12
            }, ...(goal ? [{
                // Ziel als gestrichelte Linie über die ganze Breite
                data: [{ x: min, y: goal }, { x: max, y: goal }],
                borderColor: 'rgba(245, 181, 46, 0.8)',
                borderDash: [6, 6],
                borderWidth: 1.5,
                pointRadius: 0,
                pointHitRadius: 0,
                fill: false
            }] : [])]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300 },
            layout: { padding: { top: 8, right: 4 } },
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#132a23',
                    borderColor: '#1a8a6b',
                    borderWidth: 1,
                    titleColor: '#9db1aa',
                    bodyColor: '#f2f6f4',
                    bodyFont: { weight: '600' },
                    padding: 10,
                    displayColors: false,
                    filter: item => item.datasetIndex === 0,
                    callbacks: {
                        title: items => formatDate(new Date(items[0].parsed.x), true),
                        label: item => formatValue(item.parsed.y)
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: min,
                    max: max,
                    afterBuildTicks: axis => {
                        axis.ticks = buildDateTicks(axis.min, axis.max);
                    },
                    ticks: {
                        color: '#62776f',
                        font: { size: 11 },
                        maxRotation: 0,
                        autoSkip: false,
                        callback: value => formatTickDate(value, max - min)
                    },
                    grid: { display: false },
                    border: { color: '#17302a' }
                },
                y: {
                    beginAtZero: beginAtZero,
                    grace: '8%',
                    ticks: {
                        color: '#62776f',
                        font: { size: 11 },
                        maxTicksLimit: 5,
                        callback: value => formatTick(value)
                    },
                    grid: { color: 'rgba(95, 212, 169, 0.07)' },
                    border: { display: false }
                }
            }
        }
    });
}

function getTimeRange(points, period) {
    const today = startOfDay(new Date()).getTime();
    const first = points[0].x;
    const last = points[points.length - 1].x;

    // Fester Zeitraum: Achse zeigt den kompletten Zeitraum bis heute
    if (period !== 'max') {
        return { min: periodCutoff(period).getTime(), max: Math.max(today, last) };
    }

    if (first === last) {
        return { min: first - 7 * DAY_MS, max: last + 7 * DAY_MS };
    }

    const padding = Math.max((last - first) * 0.03, DAY_MS);
    return { min: first - padding, max: last + padding };
}

// Achsenbeschriftung an echten Kalendergrenzen (Tage, Wochen oder Monate)
function buildDateTicks(min, max) {
    const spanDays = (max - min) / DAY_MS;
    const ticks = [];

    if (spanDays <= 31) {
        const step = Math.max(1, Math.ceil(spanDays / 5));
        const date = startOfDay(new Date(min));
        if (date.getTime() < min) date.setDate(date.getDate() + 1);
        while (date.getTime() <= max) {
            ticks.push({ value: date.getTime() });
            date.setDate(date.getDate() + step);
        }
    } else if (spanDays <= 100) {
        const step = Math.max(1, Math.ceil(spanDays / 7 / 5));
        const date = startOfDay(new Date(min));
        date.setDate(date.getDate() + ((8 - date.getDay()) % 7)); // nächster Montag
        if (date.getTime() < min) date.setDate(date.getDate() + 7);
        while (date.getTime() <= max) {
            ticks.push({ value: date.getTime() });
            date.setDate(date.getDate() + step * 7);
        }
    } else {
        const step = [1, 2, 3, 6, 12, 24].find(s => spanDays / 30.4 / s <= 5) || 24;
        const date = new Date(min);
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        if (date.getTime() < min) date.setMonth(date.getMonth() + 1);
        // Monate auf glatte Vielfache ausrichten (z. B. Jan/Apr/Jul/Okt)
        while (date.getMonth() % step !== 0 && step <= 12) date.setMonth(date.getMonth() + 1);
        while (date.getTime() <= max) {
            ticks.push({ value: date.getTime() });
            date.setMonth(date.getMonth() + step);
        }
    }

    return ticks;
}

function formatTickDate(value, span) {
    const date = new Date(value);
    if (span / DAY_MS <= 100) {
        return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
    }
    if (date.getMonth() === 0) return String(date.getFullYear());
    return date.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '');
}

// Utility Functions
function periodCutoff(period) {
    const cutoff = startOfDay(new Date());
    cutoff.setMonth(cutoff.getMonth() - parseInt(period));
    return cutoff;
}

function filterByPeriod(entries, period) {
    if (period === 'max') return entries;
    const cutoff = periodCutoff(period);
    return entries.filter(entry => parseDate(entry.date) >= cutoff);
}

function sortByDateDesc(entries) {
    entries.sort((a, b) => parseDate(b.date) - parseDate(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// "YYYY-MM-DD" als lokales Datum interpretieren (nicht UTC)
function parseDate(value) {
    if (value instanceof Date) return value;
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, month - 1, day);
}

function startOfDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
}

function todayString() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

function formatDate(value, long = false) {
    const date = parseDate(value);
    return date.toLocaleDateString('de-DE', long
        ? { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }
        : { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatNumber(value) {
    return Number(value).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function formatDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    if (minutes === 0) return `${seconds} s`;
    return `${minutes}:${String(seconds).padStart(2, '0')} min`;
}

function formatDurationShort(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatValue(value, type) {
    if (type === 'reps') return `${value} Wdh.`;
    if (type === 'time') return formatDuration(value);
    return `${formatNumber(value)} kg`;
}

function formatDelta(value, type) {
    if (type === 'time') return formatDuration(value);
    return formatValue(value, type);
}

// Hauptwert eines Eintrags, z. B. "80 kg × 5" oder "12 Wdh."
function formatEntryShort(entry, type) {
    if (type === 'weight') {
        return entry.reps ? `${formatNumber(entry.weight)} kg × ${entry.reps}` : `${formatNumber(entry.weight)} kg`;
    }
    if (type === 'reps') {
        return entry.weight ? `${entry.reps || 0} Wdh. · +${formatNumber(entry.weight)} kg` : `${entry.reps || 0} Wdh.`;
    }
    return formatDuration(entry.duration || 0);
}

function formatEntryExtra(entry, type) {
    // Alte Einträge, deren Übungstyp später geändert wurde
    if (type !== 'weight' && !entryValue(entry, type) && entry.weight) {
        return ` · ${formatNumber(entry.weight)} kg`;
    }
    return '';
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

let toastTimeout;
function showMessage(text, type = 'success') {
    const toast = document.getElementById('toast');

    // Modale Dialoge liegen im Top-Layer – Toast dort einhängen, damit er sichtbar bleibt
    const openDialog = document.querySelector('dialog[open]');
    (openDialog || document.body).appendChild(toast);

    toast.textContent = text;
    toast.className = `toast ${type}`;
    toast.hidden = false;

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.hidden = true; }, 2500);
}

function updateUI() {
    updateExerciseViews();
    updateWeightViews();
}

// Data Export
function exportData() {
    const data = {
        exercises: app.exercises,
        prEntries: app.prEntries,
        weightEntries: app.weightEntries,
        exportDate: new Date().toISOString()
    };

    const fileName = `pr-tracker-backup-${todayString()}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const file = new File([blob], fileName, { type: 'application/json' });

    // iOS: Teilen-Dialog (in Dateien sichern, AirDrop, …)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'PR Tracker Backup' }).catch(() => {});
        return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
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
    batchDelete('exercises', app.exercises.map(ex => ex.id));
    batchDelete('pr-entries', app.prEntries.map(entry => entry.id));
    batchDelete('weight-entries', app.weightEntries.map(entry => entry.id));

    // Clear local data
    app.exercises = [];
    app.prEntries = [];
    app.weightEntries = [];
    app.selectedExerciseId = null;

    localStorage.removeItem('exercises');
    localStorage.removeItem('pr-entries');
    localStorage.removeItem('weight-entries');
    localStorage.removeItem('selected-exercise');

    updateUI();
    showMessage('Alle Daten gelöscht', 'success');
}

// PWA Service Worker Registration
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');

            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showMessage('Update verfügbar – App neu öffnen für die neue Version.', 'success');
                    }
                });
            });

            window.addEventListener('online', () => {
                showMessage('Wieder online – Daten werden synchronisiert.', 'success');
            });

            window.addEventListener('offline', () => {
                showMessage('Offline – Einträge werden später synchronisiert.', 'error');
            });
        } catch (error) {
            console.log('PWA: Service Worker registration failed', error);
        }
    });
}
