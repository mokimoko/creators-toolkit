// Calendar week and day editor
function renderWeeks() {
    const canEdit = !currentEditingCalendar.isDefault;
    
    // Initialize calendarType if it doesn't exist
    if (!currentEditingCalendar.calendarType) {
        currentEditingCalendar.calendarType = 'solar';
    }
    
    // Initialize namedDays if using lunisolar/lunar
    if ((currentEditingCalendar.calendarType === 'lunisolar' || currentEditingCalendar.calendarType === 'lunar') 
        && !currentEditingCalendar.namedDays) {
        currentEditingCalendar.namedDays = [];
    }
    
    const container = document.getElementById('weekdays-list');
    container.innerHTML = '';
    
    // Calendar type selector
    const typeSelector = document.createElement('div');
    typeSelector.style.marginBottom = 'var(--space-lg)';
    typeSelector.innerHTML = `
        <label><strong>Calendar Type:</strong></label>
        <div style="display: flex; gap: var(--space-md); margin-top: var(--space-sm); flex-wrap: wrap;">
            <label>
                <input type="radio" name="calendar-type" value="solar" 
                    ${currentEditingCalendar.calendarType === 'solar' ? 'checked' : ''}
                    ${canEdit ? '' : 'disabled'}
                    onchange="changeCalendarType('solar')">
                Solar (Weekdays)
            </label>
            <label>
                <input type="radio" name="calendar-type" value="lunisolar" 
                    ${currentEditingCalendar.calendarType === 'lunisolar' || currentEditingCalendar.calendarType === 'lunar' ? 'checked' : ''}
                    ${canEdit ? '' : 'disabled'}
                    onchange="changeCalendarType('lunisolar')">
                Lunisolar (Numbered days)
            </label>
        </div>
        <div class="helper-text">
            Solar: Days repeat in weekly cycles (like Gregorian)<br>
            Lunisolar: Numbered days based on moon phases (like Chinese)
        </div>
    `;
    container.appendChild(typeSelector);
    
    // Render based on calendar type
    if (currentEditingCalendar.calendarType === 'solar') {
        renderWeekdaysSection(container, canEdit);
    } else {
        renderNamedDaysSection(container, canEdit);
    }
}

function renderWeekdaysSection(container, canEdit) {
    // This is your existing weekdays UI
    const weekdaysDiv = document.createElement('div');
    weekdaysDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-md); margin-top: var(--space-md);">
            <h4>Weekdays</h4>
            ${canEdit ? '<button id="add-weekday-btn" class="btn-add">+ Add Day</button>' : ''}
        </div>
        <div style="margin-bottom: var(--space-md);">
            <label for="epoch-day">Epoch Day (First day of Year 1):</label>
            <select id="epoch-day"></select>
            <div class="helper-text">Which weekday does the first year start on?</div>
        </div>
        <div id="weekdays-list-items" class="time-items-list"></div>
    `;
    container.appendChild(weekdaysDiv);
    
    // Populate weekdays list
    const weekdaysList = document.getElementById('weekdays-list-items');
    currentEditingCalendar.weekdays.forEach((day, index) => {
        const item = createWeekdayItem(day, index);
        weekdaysList.appendChild(item);
    });
    
    if (currentEditingCalendar.weekdays.length === 0) {
        weekdaysList.innerHTML = '<div class="empty-state">No weekdays defined. Add your first day above!</div>';
    }
    
    // Set up epoch day dropdown
    updateEpochDayDropdown();
    
    // Set up drag and drop for weekdays
    if (canEdit) {
        setupWeekdaysDragAndDrop();
        
        const addBtn = document.getElementById('add-weekday-btn');
        if (addBtn) {
            addBtn.onclick = addWeekday;
        }
    }
}

function renderNamedDaysSection(container, canEdit) {
    const maxDays = Math.max(...currentEditingCalendar.months.map(m => m.days));
    
    const namedDaysDiv = document.createElement('div');
    namedDaysDiv.style.marginTop = 'var(--space-md)';
    namedDaysDiv.innerHTML = `
        <p style="margin-bottom: var(--space-md);">Days are numbered 1-${maxDays} (no repeating weekdays)</p>
        <div style="display: flex; justify-content: space-between; align-items: center; margin: var(--space-md) 0;">
            <h4>Special Day Names</h4>
            ${canEdit ? '<button id="add-named-day-btn" class="btn-add">+ Add Named Day</button>' : ''}
        </div>
        <div class="helper-text">Optionally give names to specific days (e.g., Day 1 = "New Moon", Day 15 = "Full Moon")</div>
        <div id="named-days-list-items" class="time-items-list"></div>
    `;
    container.appendChild(namedDaysDiv);
    
    // Populate named days list
    const namedDaysList = document.getElementById('named-days-list-items');
    const sortedNamedDays = [...currentEditingCalendar.namedDays].sort((a, b) => a.day - b.day);
    
    sortedNamedDays.forEach((namedDay, index) => {
        const item = createNamedDayItem(namedDay, index);
        namedDaysList.appendChild(item);
    });
    
    if (currentEditingCalendar.namedDays.length === 0) {
        namedDaysList.innerHTML = '<div class="empty-state">No special day names defined.</div>';
    }
    
    // Set up add button
    if (canEdit) {
        const addBtn = document.getElementById('add-named-day-btn');
        if (addBtn) {
            addBtn.onclick = addNamedDay;
        }
    }
}

function changeCalendarType(newType) {
    if (currentEditingCalendar.isDefault) return;
    
    currentEditingCalendar.calendarType = newType;
    
    // Initialize appropriate structure
    if (newType === 'solar') {
        if (!currentEditingCalendar.weekdays || currentEditingCalendar.weekdays.length === 0) {
            currentEditingCalendar.weekdays = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];
        }
        if (currentEditingCalendar.epochDay === undefined) {
            currentEditingCalendar.epochDay = 0;
        }
    } else {
        // lunisolar or lunar
        if (!currentEditingCalendar.namedDays) {
            currentEditingCalendar.namedDays = [];
        }
    }
    
    renderWeeks();
    renderOverview();
}

function createNamedDayItem(namedDay, index) {
    const div = document.createElement('div');
    div.className = 'time-item';
    const canEdit = !currentEditingCalendar.isDefault;
    
    div.innerHTML = `
        <div class="time-item-content" style="flex: 1; display: flex; gap: var(--space-sm); align-items: baseline;">
            <label for="named-day-num-${index}" style="min-width: 80px; font-weight: 500;">Day Number:</label>
            <input type="number" 
                   id="named-day-num-${index}"
                   value="${namedDay.day}" 
                   min="1"
                   max="${Math.max(...currentEditingCalendar.months.map(m => m.days))}"
                   onchange="updateNamedDayNumber(${index}, parseInt(this.value))"
                   ${canEdit ? '' : 'readonly'}
                   style="width: 80px;">
            <input type="text" 
                   value="${namedDay.name}" 
                   onchange="updateNamedDayName(${index}, this.value)"
                   ${canEdit ? '' : 'readonly'}
                   placeholder="Day name"
                   style="flex: 1;">
        </div>
        ${canEdit ? `<span class="time-item-delete" onclick="deleteNamedDay(${index})"><i class="fas fa-trash"></i></span>` : ''}
    `;
    
    return div;
}

function addNamedDay() {
    if (currentEditingCalendar.isDefault) return;
    
    currentEditingCalendar.namedDays.push({
        day: 1,
        name: 'Special Day'
    });
    
    renderWeeks();
}

function updateNamedDayNumber(index, newDay) {
    if (currentEditingCalendar.isDefault) return;
    currentEditingCalendar.namedDays[index].day = newDay;
    renderWeeks(); // Re-render to re-sort
}

function updateNamedDayName(index, newName) {
    if (currentEditingCalendar.isDefault) return;
    currentEditingCalendar.namedDays[index].name = newName;
}

function deleteNamedDay(index) {
    if (currentEditingCalendar.isDefault) return;
    currentEditingCalendar.namedDays.splice(index, 1);
    renderWeeks();
}

function createWeekdayItem(day, index) {
    const div = document.createElement('div');
    div.className = 'time-item';
    div.dataset.index = index;
    div.draggable = !currentEditingCalendar.isDefault;
    
    const canEdit = !currentEditingCalendar.isDefault;
    
    div.innerHTML = `
        <span class="time-item-drag-handle"><i class="fas fa-grip-vertical"></i></span>
        <div class="time-item-content">
            <input type="text" value="${day}" 
                   onchange="updateWeekdayName(${index}, this.value)"
                   ${canEdit ? '' : 'readonly'}
                   style="flex: 1;">
        </div>
        ${canEdit ? `<span class="time-item-delete" onclick="deleteWeekday(${index})"><i class="fas fa-trash"></i></span>` : ''}
    `;
    
    return div;
}

function addWeekday() {
    if (currentEditingCalendar.isDefault) return;
    
    currentEditingCalendar.weekdays.push(`Day ${currentEditingCalendar.weekdays.length + 1}`);
    renderWeeks();
    renderOverview();
}

function updateWeekdayName(index, newName) {
    if (currentEditingCalendar.isDefault) return;
    currentEditingCalendar.weekdays[index] = newName;
    renderOverview();
}

function deleteWeekday(index) {
    if (currentEditingCalendar.isDefault) return;
    if (currentEditingCalendar.weekdays.length <= 1) {
        window.notifyLoreUser('Cannot delete the last weekday!');
        return;
    }
    currentEditingCalendar.weekdays.splice(index, 1);
    renderWeeks();
    renderOverview();
}

function updateEpochDayDropdown() {
    const select = document.getElementById('epoch-day');
    select.innerHTML = '';
    
    currentEditingCalendar.weekdays.forEach((day, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = day;
        select.appendChild(option);
    });
    
    select.value = currentEditingCalendar.epochDay || 0;
    select.disabled = currentEditingCalendar.isDefault;
    
    select.onchange = function() {
        if (!currentEditingCalendar.isDefault) {
            currentEditingCalendar.epochDay = parseInt(this.value);
        }
    };
}

function setupWeekdaysDragAndDrop() {
    if (currentEditingCalendar.isDefault) return;
    
    const container = document.getElementById('weekdays-list');
    const items = container.querySelectorAll('.time-item');
    
    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
    });
}

// ============================================================================
// DAYS/TIME DIVISIONS SECTION
// ============================================================================

function renderDays() {
    const div = currentEditingCalendar.timeDivisions;
    const canEdit = !currentEditingCalendar.isDefault;
    
    document.getElementById('divisions-per-day').value = div.divisionsPerDay;
    document.getElementById('divisions-per-day').disabled = !canEdit;
    
    document.getElementById('minutes-per-division').value = div.minutesPerDivision;
    document.getElementById('minutes-per-division').disabled = !canEdit;
    
    document.getElementById('subdivision-name').value = div.subdivisionName || '';
    document.getElementById('subdivision-name').disabled = !canEdit;
    
    document.getElementById('use-division-names').checked = div.useDivisionNames || false;
    document.getElementById('use-division-names').disabled = !canEdit;
    
    if (div.useDivisionNames) {
        document.getElementById('division-names-section').style.display = 'block';
        renderDivisionNames();
    } else {
        document.getElementById('division-names-section').style.display = 'none';
    }
    
    // Add change listeners
    document.getElementById('divisions-per-day').onchange = function() {
        if (!canEdit) return;
        currentEditingCalendar.timeDivisions.divisionsPerDay = parseInt(this.value) || 24;
        renderOverview();
        if (currentEditingCalendar.timeDivisions.useDivisionNames) {
            updateDivisionNamesInputs();
        }
    };
    
    document.getElementById('minutes-per-division').onchange = function() {
        if (!canEdit) return;
        currentEditingCalendar.timeDivisions.minutesPerDivision = parseInt(this.value) || 60;
        renderOverview();
    };
    
    document.getElementById('subdivision-name').onchange = function() {
        if (!canEdit) return;
        currentEditingCalendar.timeDivisions.subdivisionName = this.value;
        renderOverview();
    };
}

function toggleDivisionNames() {
    if (currentEditingCalendar.isDefault) return;
    
    const checked = document.getElementById('use-division-names').checked;
    currentEditingCalendar.timeDivisions.useDivisionNames = checked;
    
    if (checked) {
        document.getElementById('division-names-section').style.display = 'block';
        updateDivisionNamesInputs();
    } else {
        document.getElementById('division-names-section').style.display = 'none';
    }
}

function updateDivisionNamesInputs() {
    if (currentEditingCalendar.isDefault) return;
    
    const count = currentEditingCalendar.timeDivisions.divisionsPerDay;
    const container = document.getElementById('division-names-list');
    
    // Ensure divisionNames array exists and has correct length
    if (!currentEditingCalendar.timeDivisions.divisionNames) {
        currentEditingCalendar.timeDivisions.divisionNames = [];
    }
    
    while (currentEditingCalendar.timeDivisions.divisionNames.length < count) {
        currentEditingCalendar.timeDivisions.divisionNames.push('');
    }
    
    currentEditingCalendar.timeDivisions.divisionNames = 
        currentEditingCalendar.timeDivisions.divisionNames.slice(0, count);
    
    renderDivisionNames();
}

function renderDivisionNames() {
    const container = document.getElementById('division-names-list');
    container.innerHTML = '';
    
    currentEditingCalendar.timeDivisions.divisionNames.forEach((name, index) => {
        const div = document.createElement('div');
        div.style.marginBottom = 'var(--space-xs)';
        div.innerHTML = `
            <label style="display: flex; align-items: center; gap: var(--space-xs);">
                <span style="width: 80px;">Division ${index}:</span>
                <input type="text" value="${name}" 
                       onchange="updateDivisionName(${index}, this.value)"
                       placeholder="e.g., Dawn Watch, 子时"
                       style="flex: 1;">
            </label>
        `;
        container.appendChild(div);
    });
}

function updateDivisionName(index, newName) {
    if (currentEditingCalendar.isDefault) return;
    currentEditingCalendar.timeDivisions.divisionNames[index] = newName;
}

// ============================================================================
// ERAS SECTION
// ============================================================================

// ============================================================================
// ERA TIMELINE VISUALIZATION
// ============================================================================
