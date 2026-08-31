// Time-system persistence and calendar management controller
async function initializeTimeSystems() {
    console.log('Initializing Time Systems...');

    // Load user's custom calendars from backend
    if (!window.loreTimeSystemsLoaded) await loadUserTimeSystems();

    // Set up event listeners
    setupTimeSystemsEventListeners();

    console.log('Time Systems initialized');
}

// Set up event listeners
function setupTimeSystemsEventListeners() {
    // Open Time Systems Editor button (from Plans Options modal)
    const openEditorBtn = document.getElementById('open-time-systems-editor');
    if (openEditorBtn) {
        openEditorBtn.addEventListener('click', openTimeSystemsEditor);
    }
    
    // Manage Calendars button (in editor sidebar)
    const manageCalendarsBtn = document.getElementById('manage-calendars-btn');
    if (manageCalendarsBtn) {
        manageCalendarsBtn.addEventListener('click', openManageCalendarsModal);
    }
    
    // Create New Calendar button (in Manage Calendars modal)
    const createCalendarBtn = document.getElementById('create-new-calendar-btn');
    if (createCalendarBtn) {
        createCalendarBtn.addEventListener('click', createNewCalendar);
    }
    
    // Calendar selector dropdown
    const calendarSelector = document.getElementById('calendar-selector');
    if (calendarSelector) {
        calendarSelector.addEventListener('change', loadCalendarForEditing);
    }
    
    // Navigation items
    document.querySelectorAll('.time-systems-nav-item').forEach(item => {
        item.addEventListener('click', function() {
            switchTimeSystemSection(this.dataset.section);
        });
    });
    
    // Add Month button
    const addMonthBtn = document.getElementById('add-month-btn');
    if (addMonthBtn) {
        addMonthBtn.addEventListener('click', addMonth);
    }
    
    // Add Weekday button
    const addWeekdayBtn = document.getElementById('add-weekday-btn');
    if (addWeekdayBtn) {
        addWeekdayBtn.addEventListener('click', addWeekday);
    }
    
    // Use division names checkbox
    const useDivisionNamesCheckbox = document.getElementById('use-division-names');
    if (useDivisionNamesCheckbox) {
        useDivisionNamesCheckbox.addEventListener('change', toggleDivisionNames);
    }
    
    // Divisions per day input
    const divisionsPerDayInput = document.getElementById('divisions-per-day');
    if (divisionsPerDayInput) {
        divisionsPerDayInput.addEventListener('change', updateDivisionNamesInputs);
    }

    // Add Season button
    const addSeasonBtn = document.getElementById('add-season-btn');
    if (addSeasonBtn) {
        addSeasonBtn.addEventListener('click', addSeason);
    }
    
    // Date format selector
    const dateFormatSelect = document.getElementById('date-format');
    if (dateFormatSelect) {
        dateFormatSelect.addEventListener('change', updateDateFormatPreview);
    }
    
    // Time format selector
    const timeFormatSelect = document.getElementById('time-format');
    if (timeFormatSelect) {
        timeFormatSelect.addEventListener('change', updateTimeFormatPreview);
    }
    
    // Save Time System button
    const saveTimeSystemBtn = document.getElementById('save-time-system');
    if (saveTimeSystemBtn) {
        saveTimeSystemBtn.addEventListener('click', saveCurrentTimeSystem);
    }
}

// Open Time Systems Editor
function openTimeSystemsEditor() {
    populateCalendarSelector();
    
    // Set the selector to the currently selected time system from Plans Options
    const selectedSystem = infoData.plansOptions?.selectedTimeSystemId || 'default';
    document.getElementById('calendar-selector').value = selectedSystem;
    
    loadCalendarForEditing();
    // Store original state
    originalCalendarState = JSON.parse(JSON.stringify(currentEditingCalendar));
    openModal('timeSystemsEditorModal');
}

// Add new function for Cancel
function cancelTimeSystemEdits() {
    if (originalCalendarState) {
        // Restore original state
        currentEditingCalendar = JSON.parse(JSON.stringify(originalCalendarState));
    }
    closeModal('timeSystemsEditorModal');
}

// Populate the calendar selector dropdown
function populateCalendarSelector() {
    const selector = document.getElementById('calendar-selector');
    selector.innerHTML = `
        <option value="default">Default (Gregorian)</option>
        <option value="preset-chinese">Traditional Chinese</option>
    `;
    
    userTimeSystems.forEach(calendar => {
        const option = document.createElement('option');
        option.value = calendar.id;
        option.textContent = calendar.name;
        selector.appendChild(option);
    });
}

// Populate time systems dropdown in Plans Options modal
// Populate time systems dropdown in Plans Options modal
function populateTimeSystemsDropdown() {
    const dropdown = document.getElementById('plans-time-system');
    dropdown.innerHTML = `
        <option value="default">Default (Gregorian)</option>
        <option value="preset-chinese">Traditional Chinese</option>
    `;
    
    userTimeSystems.forEach(calendar => {
        const option = document.createElement('option');
        option.value = calendar.id;
        option.textContent = calendar.name;
        dropdown.appendChild(option);
    });
}

// Load a calendar for editing
function loadCalendarForEditing() {
    const selectedId = document.getElementById('calendar-selector').value;
    
    if (selectedId === 'default') {
        currentEditingCalendar = JSON.parse(JSON.stringify(DEFAULT_CALENDAR));
    } else if (selectedId === 'preset-chinese') {
        currentEditingCalendar = JSON.parse(JSON.stringify(PRESET_CHINESE_CALENDAR));
    } else {
        const calendar = userTimeSystems.find(c => c.id === selectedId);
        if (calendar) {
            currentEditingCalendar = JSON.parse(JSON.stringify(calendar));
        }
    }
    
    // Update title
    const title = document.getElementById('time-systems-editor-title');
    if (currentEditingCalendar.isDefault) {
        title.textContent = `Time Systems Editor (Viewing ${currentEditingCalendar.name} - Read Only)`;
    } else {
        title.textContent = `Time Systems Editor - ${currentEditingCalendar.name}`;
    }
    
    // Refresh all sections
    refreshAllSections();
}

// Refresh all sections with current calendar data
function refreshAllSections() {
    renderOverview();
    renderMonths();
    renderWeeks();
    renderDays();
    renderEras();
    renderSeasons();
    renderMoonPhases();
    renderSettings();
}

// Switch between sections
function switchTimeSystemSection(section) {
    // Update nav items
    document.querySelectorAll('.time-systems-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.closest('.time-systems-nav-item').classList.add('active');
    
    // Update content sections
    document.querySelectorAll('.time-section').forEach(section => {
        section.style.display = 'none';
    });
    document.getElementById(`time-section-${section}`).style.display = 'block';
}

// ============================================================================
// OVERVIEW SECTION
// ============================================================================


function openManageCalendarsModal() {
    renderCalendarsList();
    openModal('manageCalendarsModal');
}

function renderCalendarsList() {
    const container = document.getElementById('calendars-list-container');
    container.innerHTML = '';
    
    // Default Gregorian
    const gregorianItem = document.createElement('div');
    gregorianItem.className = 'calendar-list-item default';
    gregorianItem.innerHTML = `
        <div class="calendar-list-item-name">
            <strong>Default (Gregorian)</strong>
            <div style="font-size: 0.85em; color: var(--text-muted); margin-top: 2px;">
                Read-only reference calendar
            </div>
        </div>
        <div class="calendar-list-item-actions">
            <button onclick="duplicatePresetCalendar('default')" class="btn-secondary" title="Create a copy of this calendar">
                <i class="fas fa-copy"></i> Copy
            </button>
        </div>
    `;
    container.appendChild(gregorianItem);

    // Preset Chinese
    const chineseItem = document.createElement('div');
    chineseItem.className = 'calendar-list-item default';
    chineseItem.innerHTML = `
        <div class="calendar-list-item-name">
            <strong>Traditional Chinese</strong>
            <div style="font-size: 0.85em; color: var(--text-muted); margin-top: 2px;">
                Read-only reference calendar
            </div>
        </div>
        <div class="calendar-list-item-actions">
            <button onclick="duplicatePresetCalendar('preset-chinese')" class="btn-secondary" title="Create a copy of this calendar">
                <i class="fas fa-copy"></i> Copy
            </button>
        </div>
    `;
    container.appendChild(chineseItem);
    
    // User calendars
    userTimeSystems.forEach((calendar, index) => {
        const item = document.createElement('div');
        item.className = 'calendar-list-item';
        item.innerHTML = `
            <div class="calendar-list-item-name">
                <strong>${calendar.name}</strong>
            </div>
            <div class="calendar-list-item-actions">
                <button onclick="renameCalendar('${calendar.id}')" class="btn-secondary">Rename</button>
                <button onclick="deleteCalendar('${calendar.id}')" class="btn-secondary" style="color: var(--danger-color);">Delete</button>
            </div>
        `;
        container.appendChild(item);
    });
}

function duplicatePresetCalendar(presetId) {
    let preset, baseName;

    if (presetId === 'default') {
        preset = DEFAULT_CALENDAR;
        baseName = 'Gregorian Copy';
    } else if (presetId === 'preset-chinese') {
        preset = PRESET_CHINESE_CALENDAR;
        baseName = 'Chinese Copy';
    } else {
        return; // Invalid ID
    }

    const name = prompt('Enter a name for your new calendar:', baseName);
    if (!name || !name.trim()) return;

    // Create a deep copy of the selected preset
    const newCalendar = JSON.parse(JSON.stringify(preset));
    newCalendar.id = 'cal_' + Date.now();
    newCalendar.name = name.trim();
    newCalendar.isDefault = false; // Make it editable

    // Ensure calendarType exists (good practice)
    if (!newCalendar.calendarType) {
        newCalendar.calendarType = presetId === 'default' ? 'solar' : 'lunisolar';
    }

    userTimeSystems.push(newCalendar);

    // Refresh UI and save
    renderCalendarsList();
    populateCalendarSelector();
    saveUserTimeSystems();
}

function createNewCalendar() {
    const name = prompt('Enter a name for your new calendar:');
    if (!name || !name.trim()) return;
    
    // Create new calendar based on default
    const newCalendar = JSON.parse(JSON.stringify(DEFAULT_CALENDAR));
    newCalendar.id = 'cal_' + Date.now();
    newCalendar.name = name.trim();
    newCalendar.isDefault = false;
    
    // Ensure calendarType exists
    if (!newCalendar.calendarType) {
        newCalendar.calendarType = 'solar';
    }
    
    userTimeSystems.push(newCalendar);
    
    renderCalendarsList();
    populateCalendarSelector();
    saveUserTimeSystems();
}

function renameCalendar(calendarId) {
    const calendar = userTimeSystems.find(c => c.id === calendarId);
    if (!calendar) return;
    
    const newName = prompt('Enter new name:', calendar.name);
    if (!newName || !newName.trim()) return;
    
    calendar.name = newName.trim();
    
    renderCalendarsList();
    populateCalendarSelector();
    populateTimeSystemsDropdown();
    saveUserTimeSystems();
}

function deleteCalendar(calendarId) {
    const calendar = userTimeSystems.find(c => c.id === calendarId);
    if (!calendar) return;

    if (!confirm(`Are you sure you want to delete "${calendar.name}"? This cannot be undone.`)) {
        return;
    }
    
    userTimeSystems = userTimeSystems.filter(c => c.id !== calendarId);
    
    renderCalendarsList();
    populateCalendarSelector();
    populateTimeSystemsDropdown();
    saveUserTimeSystems();
}

// ============================================================================
// SAVE FUNCTIONALITY
// ============================================================================

function saveCurrentTimeSystem() {
    if (currentEditingCalendar.isDefault) {
        if (typeof showToast === 'function') {
            showToast('error', 'Cannot save changes to the default calendar.');
        } else {
            window.notifyLoreUser('Cannot save changes to the default calendar.');
        }
        return;
    }
    
    // Find and update the calendar in userTimeSystems
    const index = userTimeSystems.findIndex(c => c.id === currentEditingCalendar.id);
    if (index !== -1) {
        userTimeSystems[index] = JSON.parse(JSON.stringify(currentEditingCalendar));
    }

    // Save to backend
    saveUserTimeSystems().then(success => {
        if (success) {
            if (typeof showToast === 'function') {
                showToast('success', 'Time system saved successfully!');
            } else {
                window.notifyLoreUser('Time system saved!');
            }

            // Preserve the current selection before refreshing
            const currentSelection = document.getElementById('plans-time-system').value;

            // Refresh dropdowns
            populateTimeSystemsDropdown();

            // Restore the selection
            document.getElementById('plans-time-system').value = currentSelection;

            closeModal('timeSystemsEditorModal');
        } else {
            if (typeof showToast === 'function') {
                showToast('error', 'Failed to save time system. Please try again.');
            } else {
                window.notifyLoreUser('Failed to save time system. Please try again.');
            }
        }
    });
}

// ============================================================================
// DRAG AND DROP HELPERS
// ============================================================================

let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    if (draggedItem !== this) {
        const allItems = [...this.parentNode.children];
        const draggedIndex = parseInt(draggedItem.dataset.index);
        const targetIndex = parseInt(this.dataset.index);
        
        // Determine if we're dragging months or weekdays
        const isMergingMonths = draggedItem.parentNode.id === 'months-list';
        
        if (isMergingMonths) {
            // Reorder months array
            const [removed] = currentEditingCalendar.months.splice(draggedIndex, 1);
            currentEditingCalendar.months.splice(targetIndex, 0, removed);
            
            // Adjust era dates and end date for the reordering
            adjustDatesAfterMonthReorder(draggedIndex, targetIndex);
            
            renderMonths();
            renderEras(); // Re-render eras to show updated dates
        } else {
            // Reorder weekdays array
            const [removed] = currentEditingCalendar.weekdays.splice(draggedIndex, 1);
            currentEditingCalendar.weekdays.splice(targetIndex, 0, removed);
            renderWeeks();
        }
    }
    
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
}

// ============================================================================
// MINI CALENDAR DATE PICKER
// ============================================================================
