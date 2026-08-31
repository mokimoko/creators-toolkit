// Calendar era, season, moon, and display settings editor
function renderEraTimeline() {
    // Calculate the duration of each era in years
    const eraData = [];
    const eras = currentEditingCalendar.eras;
    const endDate = currentEditingCalendar.endDate || { year: 3000, month: 11, day: 31 };
    
    // Separate backward and forward eras
    const backwardEra = eras[0]?.isBackward ? eras[0] : null;
    const forwardEras = backwardEra ? eras.slice(1) : eras;
    
    // Calculate backward era duration (if exists)
    if (backwardEra) {
        const firstForwardEra = forwardEras[0];
        const duration = Math.abs(backwardEra.startDate.year - firstForwardEra.startDate.year);
        eraData.push({
            name: backwardEra.name,
            abbreviation: backwardEra.abbreviation,
            duration: duration,
            startDate: backwardEra.startDate,
            endDate: firstForwardEra.startDate,
            isBackward: true
        });
    }
    
    // Calculate forward eras durations
    forwardEras.forEach((era, index) => {
        let duration;
        let endDateObj;
        
        if (index < forwardEras.length - 1) {
            // Not the last era - duration is until next era
            const nextEra = forwardEras[index + 1];
            duration = nextEra.startDate.year - era.startDate.year;
            endDateObj = nextEra.startDate;
        } else {
            // Last era - duration is until end date
            duration = endDate.year - era.startDate.year;
            endDateObj = endDate;
        }
        
        eraData.push({
            name: era.name,
            abbreviation: era.abbreviation,
            duration: duration,
            startDate: era.startDate,
            endDate: endDateObj,
            isBackward: false
        });
    });
    
    // Calculate total duration for proportions
    const totalDuration = eraData.reduce((sum, era) => sum + era.duration, 0);
    
    // Helper function to format date
    const formatDate = (dateObj, showEra = false) => {
        const monthName = currentEditingCalendar.months[dateObj.month]?.name || 'Unknown';
        const monthAbbr = monthName.substring(0, 3); // CHANGED: Abbreviate to 3 letters
        const day = dateObj.day;
        const year = Math.abs(dateObj.year);
        
        if (showEra && backwardEra) {
            return `${monthAbbr} ${day}, ${year} ${backwardEra.abbreviation}`;
        }
        return `${monthAbbr} ${day}, ${year}`;
    };
    
    // Build HTML
    let html = '<div class="era-timeline-display">';
    html += '<div class="era-timeline-bar">';
    
    // Track cumulative percentage for year markers
    let cumulativePercentage = 0;
    
    eraData.forEach((era, index) => {
        const percentage = (era.duration / totalDuration) * 100;
        const displayText = percentage > 8 ? era.abbreviation : '';
        
        // Add year marker at the start of this segment
        if (index === 0) {
            html += `<div class="era-year-marker start">
                ${era.isBackward ? Math.abs(era.startDate.year) + ' ' + era.abbreviation : era.startDate.year}
            </div>`;
        }
        
        // Format dates for tooltip
        const startDateStr = formatDate(era.startDate, era.isBackward);
        const endDateStr = formatDate(era.endDate, false);
        
        html += `
            <div class="era-segment ${era.isBackward ? 'backward' : 'forward'}" 
                 style="flex-basis: ${percentage}%;">
                ${displayText}
                <div class="era-tooltip">
                    <strong>${era.name}</strong><br>
                    ${startDateStr} to ${endDateStr}
                </div>
            </div>
        `;
        
        // Add year marker at the end of this segment (which is the start of the next)
        cumulativePercentage += percentage;
        if (index < eraData.length - 1) {
            const nextEra = eraData[index + 1];
            html += `<div class="era-year-marker" style="left: ${cumulativePercentage}%;">
                ${nextEra.startDate.year}
            </div>`;
        } else {
            // Last segment - add end marker
            html += `<div class="era-year-marker end">
                ${era.endDate.year}
            </div>`;
        }
    });
    
    html += '</div>';
    html += '</div>';
    
    return html;
}

function renderEras() {
    const container = document.getElementById('eras-list');
    container.innerHTML = '';
    
    // Add timeline visualization at the top
    const timelineDiv = document.createElement('div');
    timelineDiv.innerHTML = renderEraTimeline();
    container.appendChild(timelineDiv.firstChild);
    
    // Separate backward era (first era if it's backward) from forward eras
    const backwardEra = currentEditingCalendar.eras[0]?.isBackward ? currentEditingCalendar.eras[0] : null;
    const forwardEras = backwardEra ? currentEditingCalendar.eras.slice(1) : currentEditingCalendar.eras;
    
    // Backward Era Section
    const backwardSection = document.createElement('div');
    backwardSection.style.marginBottom = 'var(--space-lg)';
    backwardSection.innerHTML = `
        <h4 style="margin-bottom: var(--space-sm); color: var(--text-color);">Backward Era (Optional)</h4>
        <div class="helper-text" style="margin-bottom: var(--space-sm); font-size: 0.9em;">
            A backward era counts backwards from its start date (like BCE). Only one backward era allowed.
        </div>
    `;
    
    if (backwardEra) {
        backwardSection.appendChild(createEraItem(backwardEra, 0, true));
    } else if (!currentEditingCalendar.isDefault) {
        const addBtn = document.createElement('button');
        addBtn.className = 'btn-secondary';
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Add Backward Era';
        addBtn.onclick = addBackwardEra;
        backwardSection.appendChild(addBtn);
    }
    
    container.appendChild(backwardSection);
    
    // Forward Eras Section
    const forwardSection = document.createElement('div');
    forwardSection.innerHTML = `
        <h4 style="margin-bottom: var(--space-sm); color: var(--text-color);">Forward Eras</h4>
        <div class="helper-text" style="margin-bottom: var(--space-sm); font-size: 0.9em;">
            Forward eras count forward from their start dates.
        </div>
    `;
    
    const forwardList = document.createElement('div');
    const startIndex = backwardEra ? 1 : 0;
    forwardEras.forEach((era, idx) => {
        forwardList.appendChild(createEraItem(era, startIndex + idx, false));
    });
    forwardSection.appendChild(forwardList);
    
    // Add Era button for forward eras
    if (!currentEditingCalendar.isDefault) {
        const addBtn = document.createElement('button');
        addBtn.className = 'btn-secondary';
        addBtn.style.marginTop = 'var(--space-sm)';
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Add Era';
        addBtn.onclick = addForwardEra;
        forwardSection.appendChild(addBtn);
    }
    
    container.appendChild(forwardSection);
    
    // Add End Date section at the bottom
    const endDateSection = document.createElement('div');
    endDateSection.style.marginTop = 'var(--space-xl)';
    endDateSection.style.paddingTop = 'var(--space-lg)';
    endDateSection.style.borderTop = '1px solid var(--border-primary)';
    
    const canEdit = !currentEditingCalendar.isDefault;
    const endDate = currentEditingCalendar.endDate || { year: 3000, month: 11, day: 31 };
    
    // Format end date (no era abbreviation, just the date)
    const monthName = currentEditingCalendar.months[endDate.month]?.name || 'Unknown';
    const day = endDate.day;
    const year = endDate.year;
    const endDateStr = `${monthName} ${day}, ${year}`;
    
    endDateSection.innerHTML = `
        <div style="display: flex; align-items: center; gap: var(--space-md);">
            <label style="color: var(--text-secondary); font-size: var(--font-size-sm); margin: 0;">
                Calendar ends on:
            </label>
            <div class="era-date-display ${canEdit ? 'clickable' : ''}" 
                 ${canEdit ? 'onclick="editEndDate()"' : ''}
                 style="padding: 6px 12px; background: var(--bg-tertiary); border-radius: 4px; cursor: ${canEdit ? 'pointer' : 'default'}; min-width: 180px; text-align: center; font-size: var(--font-size-sm); opacity: 0.85;">
                ${endDateStr}
            </div>
        </div>
        <div class="helper-text" style="margin-top: var(--space-xs); font-size: 0.85em;">
            The latest date available in this calendar system. This determines the overall span of your timeline.
        </div>
    `;
    
    container.appendChild(endDateSection);
}

function createEraItem(era, index, isBackward) {
    const div = document.createElement('div');
    div.className = 'time-item';
    div.style.display = 'flex';
    div.style.gap = 'var(--space-sm)';
    div.style.alignItems = 'center';
    div.style.marginBottom = 'var(--space-sm)';
    
    const canEdit = !currentEditingCalendar.isDefault;
    
    // Format start date based on era type
    const monthName = currentEditingCalendar.months[era.startDate.month]?.name || 'Unknown';
    const day = era.startDate.day;
    const year = Math.abs(era.startDate.year);
    
    let startDateStr;
    if (isBackward) {
        // Backward era: show with abbreviation
        startDateStr = `${monthName} ${day}, ${year} ${era.abbreviation}`;
    } else {
        // Forward era: show relative to first forward era (no abbreviation)
        startDateStr = `${monthName} ${day}, ${year}`;
    }
    
    // Determine if delete button should show
    let showDelete = false;
    if (canEdit) {
        if (isBackward) {
            // Can delete backward era if there are other eras
            showDelete = currentEditingCalendar.eras.length > 1;
        } else {
            // Can delete forward era if there's more than 1 forward era
            const forwardErasCount = currentEditingCalendar.eras.filter(e => !e.isBackward).length;
            showDelete = forwardErasCount > 1;
        }
    }
    
    // All three fields on one row: Abr | Name | Start Date | Delete
    div.innerHTML = `
        <input type="text" 
               value="${era.abbreviation}" 
               onchange="updateEraAbbr(${index}, this.value)"
               ${canEdit ? '' : 'readonly'}
               placeholder="Abbr"
               style="width: 100px; padding: 6px 8px; font-size: 0.95em;">
        
        <input type="text" 
               value="${era.name}" 
               onchange="updateEraName(${index}, this.value)"
               ${canEdit ? '' : 'readonly'}
               placeholder="Era Name"
               style="flex: 1; padding: 6px 8px;">
        
        <div class="era-date-display ${canEdit ? 'clickable' : ''}" 
             ${canEdit ? `onclick="editEraDate(${index})"` : ''}
             style="padding: 6px 12px; background: var(--bg-secondary); border-radius: 4px; cursor: ${canEdit ? 'pointer' : 'default'}; min-width: 200px; text-align: center; white-space: nowrap;">
            ${startDateStr}
        </div>
        
        ${showDelete ? `
            <span class="time-item-delete" onclick="deleteEra(${index})" style="flex-shrink: 0;">
                <i class="fas fa-trash"></i>
            </span>
        ` : ''}
    `;
    
    return div;
}

function addBackwardEra() {
    if (currentEditingCalendar.isDefault) return;
    
    // Create backward era at the beginning
    const newEra = {
        name: 'Ancient Era',
        abbreviation: 'BCE',
        startDate: { year: -1440, month: 11, day: 16 },
        isBackward: true
    };
    
    currentEditingCalendar.eras.unshift(newEra);
    renderEras();
}

function addForwardEra() {
    if (currentEditingCalendar.isDefault) return;
    
    const hasBackward = currentEditingCalendar.eras[0]?.isBackward;
    const lastEra = currentEditingCalendar.eras[currentEditingCalendar.eras.length - 1];
    const eraCount = hasBackward ? currentEditingCalendar.eras.length : currentEditingCalendar.eras.length + 1;
    
    const newEra = {
        name: `Era ${eraCount}`,
        abbreviation: `E${eraCount}`,
        startDate: { ...lastEra.startDate },
        isBackward: false
    };
    
    currentEditingCalendar.eras.push(newEra);
    renderEras();
}

function updateEraName(index, newName) {
    if (currentEditingCalendar.isDefault) return;
    currentEditingCalendar.eras[index].name = newName;
}

function updateEraAbbr(index, newAbbr) {
    if (currentEditingCalendar.isDefault) return;
    currentEditingCalendar.eras[index].abbreviation = newAbbr;
}

function editEraDate(index) {
    if (currentEditingCalendar.isDefault) return;
    openMiniCalendar(index);
}

function editEndDate() {
    if (currentEditingCalendar.isDefault) return;
    openMiniCalendar('endDate');
}

function deleteEra(index) {
    if (currentEditingCalendar.isDefault) return;
    
    const isBackward = currentEditingCalendar.eras[index]?.isBackward;
    
    // Can't delete if it's the only era or the only forward era
    if (isBackward && currentEditingCalendar.eras.length === 1) {
        window.notifyLoreUser('Cannot delete the only era!');
        return;
    }
    
    const forwardErasCount = currentEditingCalendar.eras.filter(e => !e.isBackward).length;
    if (!isBackward && forwardErasCount === 1) {
        window.notifyLoreUser('Cannot delete the last forward era!');
        return;
    }
    
    currentEditingCalendar.eras.splice(index, 1);
    renderEras();
}

// ============================================================================
// SEASONS SECTION
// ============================================================================

function renderSeasons() {
    const container = document.getElementById('seasons-list');
    container.innerHTML = '';
    
    if (!currentEditingCalendar.seasons) {
        currentEditingCalendar.seasons = [];
    }
    
    currentEditingCalendar.seasons.forEach((season, index) => {
        const item = createSeasonItem(season, index);
        container.appendChild(item);
    });
    
    if (currentEditingCalendar.seasons.length === 0) {
        container.innerHTML = '<div class="empty-state">No seasons defined. Add your first season above!</div>';
    }
}

function renderMoonPhases() {
    const container = document.getElementById('moon-phases-display');
    const canEdit = !currentEditingCalendar.isDefault;
    
    if (!currentEditingCalendar.moonPhases) {
        // Initialize with first era's start date
        const firstEraStart = currentEditingCalendar.eras[0]?.startDate || { year: 1, month: 0, day: 1 };
        currentEditingCalendar.moonPhases = {
            enabled: false,
            cycleLength: 29.53,
            epochNewMoon: { ...firstEraStart }
        };
    }
    
    const moonData = currentEditingCalendar.moonPhases;
    
    container.innerHTML = `
        <div style="margin-bottom: var(--space-md);">
            <label>
                <input type="checkbox" id="moon-phases-enabled" 
                    ${moonData.enabled ? 'checked' : ''} 
                    ${canEdit ? '' : 'disabled'}>
                Enable Moon Phases
            </label>
            <div class="helper-text">Display moon phases in calendar view</div>
        </div>
        
        <div style="margin-bottom: var(--space-md);">
            <label for="moon-cycle-length">Lunar Cycle Length (days):</label>
            <input type="number" id="moon-cycle-length" 
                value="${moonData.cycleLength}" 
                step="0.1" min="20" max="35" style="max-width: 100px;"
                ${canEdit ? '' : 'readonly'}>
            <div class="helper-text">Standard: 29.53 days (Earth's moon)</div>
        </div>
        
        <div style="margin-bottom: var(--space-md);">
            <label>Reference New Moon:</label>
            <div class="season-date-display ${canEdit ? 'clickable' : ''}" 
                ${canEdit ? `onclick="editMoonEpoch()"` : ''}
                style="padding: 6px 12px; background: var(--bg-tertiary); border-radius: 4px; cursor: ${canEdit ? 'pointer' : 'default'}; max-width: 200px; text-align: center; font-size: var(--font-size-sm); margin-bottom: 12px;">
                ${formatCalendarDate(moonData.epochNewMoon, currentEditingCalendar)}
            </div>
            <div class="helper-text">A known new moon date for accurate calculations</div>
        </div>
    `;
    
    // Add event listener for checkbox
    const checkbox = document.getElementById('moon-phases-enabled');
    if (checkbox && canEdit) {
        checkbox.onchange = function() {
            currentEditingCalendar.moonPhases.enabled = this.checked;
            renderMoonPhases();
        };
    }
    
    // Add event listener for cycle length
    const cycleInput = document.getElementById('moon-cycle-length');
    if (cycleInput && canEdit) {
        cycleInput.onchange = function() {
            currentEditingCalendar.moonPhases.cycleLength = parseFloat(this.value) || 29.53;
        };
    }
}

function createSeasonItem(season, index) {
    const div = document.createElement('div');
    div.className = 'time-item';

    const canEdit = !currentEditingCalendar.isDefault;
    
    const monthName = currentEditingCalendar.months[season.startDate.month]?.name || 'Unknown';
    const startDateStr = `${monthName} ${season.startDate.day}`;
    
    div.innerHTML = `
        <div class="time-item-content" style="flex: 1; display: flex; gap: var(--space-sm); align-items: baseline;">
            <input type="color" 
                value="${season.color || '#6366f1'}" 
                onchange="updateSeasonColor(${index}, this.value)"
                ${canEdit ? '' : 'disabled'}
                style="width: 40px; height: 40px; border: none; cursor: pointer; border-radius: 4px; align-self: center; margin-bottom: 10px;">
            
            <input type="text" 
                   value="${season.name}" 
                   onchange="updateSeasonName(${index}, this.value)"
                   ${canEdit ? '' : 'readonly'}
                   placeholder="Season Name"
                   style="flex: 1;">
            
            <div class="season-date-display ${canEdit ? 'clickable' : ''}" 
                 ${canEdit ? `onclick="editSeasonDate(${index})"` : ''}
                 style="padding: 6px 12px; background: var(--bg-tertiary); border-radius: 4px; cursor: ${canEdit ? 'pointer' : 'default'}; min-width: 120px; text-align: center; font-size: var(--font-size-sm);">
                ${startDateStr}
            </div>
        </div>
        ${canEdit ? `<span class="time-item-delete" onclick="deleteSeason(${index})"><i class="fas fa-trash"></i></span>` : ''}
    `;
    
    return div;
}

function addSeason() {
    if (currentEditingCalendar.isDefault) return;
    
    if (!currentEditingCalendar.seasons) {
        currentEditingCalendar.seasons = [];
    }
    
    // Default to first day of first month
    currentEditingCalendar.seasons.push({
        name: `Season ${currentEditingCalendar.seasons.length + 1}`,
        startDate: { month: 0, day: 1 },
        color: '#6366f1'
    });
    
    renderSeasons();
}

function updateSeasonName(index, newName) {
    if (currentEditingCalendar.isDefault) return;
    currentEditingCalendar.seasons[index].name = newName;
}

function updateSeasonColor(index, newColor) {
    if (currentEditingCalendar.isDefault) return;
    currentEditingCalendar.seasons[index].color = newColor;
    renderSeasons(); // Re-render to update the border color
}

function editSeasonDate(index) {
    if (currentEditingCalendar.isDefault) return;
    
    miniCalEditingEraIndex = `season-${index}`;
    const season = currentEditingCalendar.seasons[index];
    
    // Initialize with season's current date (using first era's year as reference)
    const referenceYear = currentEditingCalendar.eras[0]?.startDate.year || 1;
    miniCalCurrentMonth = season.startDate.month;
    miniCalCurrentYear = referenceYear;
    miniCalSelectedDate = { 
        year: referenceYear, 
        month: season.startDate.month, 
        day: season.startDate.day 
    };
    
    // Update modal title
    document.getElementById('mini-calendar-title').textContent = `Select Start Date for ${season.name}`;
    
    // Populate month dropdown
    const monthSelect = document.getElementById('mini-cal-month');
    monthSelect.innerHTML = '';
    currentEditingCalendar.months.forEach((month, idx) => {
        const option = document.createElement('option');
        option.value = idx;
        option.textContent = month.name;
        monthSelect.appendChild(option);
    });
    monthSelect.value = miniCalCurrentMonth;
    
    // Set year input
    document.getElementById('mini-cal-year').value = miniCalCurrentYear;
    
    // Hide era selector for seasons
    document.getElementById('mini-cal-era-selector').style.display = 'none';
    
    // Render calendar
    renderMiniCalendar();
    
    // Set up event listeners
    document.getElementById('mini-cal-prev-month').onclick = () => navigateMiniCalMonth(-1);
    document.getElementById('mini-cal-next-month').onclick = () => navigateMiniCalMonth(1);
    document.getElementById('mini-cal-month').onchange = (e) => {
        miniCalCurrentMonth = parseInt(e.target.value);
        renderMiniCalendar();
    };
    document.getElementById('mini-cal-year').onchange = (e) => {
        miniCalCurrentYear = parseInt(e.target.value) || miniCalCurrentYear;
        renderMiniCalendar();
    };
    document.getElementById('mini-cal-confirm').onclick = confirmMiniCalSelection;
    
    openModal('miniCalendarModal');
}

function editMoonEpoch() {
    if (currentEditingCalendar.isDefault) return;
    
    miniCalEditingEraIndex = 'moon-epoch';
    const epoch = currentEditingCalendar.moonPhases.epochNewMoon;
    
    miniCalCurrentMonth = epoch.month;
    miniCalCurrentYear = epoch.year;
    miniCalSelectedDate = { ...epoch };
    
    document.getElementById('mini-calendar-title').textContent = 'Select Reference New Moon Date';
    
    // Populate month dropdown
    const monthSelect = document.getElementById('mini-cal-month');
    monthSelect.innerHTML = '';
    currentEditingCalendar.months.forEach((month, idx) => {
        const option = document.createElement('option');
        option.value = idx;
        option.textContent = month.name;
        monthSelect.appendChild(option);
    });
    monthSelect.value = miniCalCurrentMonth;
    
    document.getElementById('mini-cal-year').value = miniCalCurrentYear;
    document.getElementById('mini-cal-era-selector').style.display = 'none';
    
    renderMiniCalendar();
    
    document.getElementById('mini-cal-prev-month').onclick = () => navigateMiniCalMonth(-1);
    document.getElementById('mini-cal-next-month').onclick = () => navigateMiniCalMonth(1);
    document.getElementById('mini-cal-month').onchange = (e) => {
        miniCalCurrentMonth = parseInt(e.target.value);
        renderMiniCalendar();
    };
    document.getElementById('mini-cal-year').onchange = (e) => {
        miniCalCurrentYear = parseInt(e.target.value) || miniCalCurrentYear;
        renderMiniCalendar();
    };
    document.getElementById('mini-cal-confirm').onclick = confirmMiniCalSelection;
    
    openModal('miniCalendarModal');
}

function deleteSeason(index) {
    if (currentEditingCalendar.isDefault) return;
    
    if (confirm(`Delete "${currentEditingCalendar.seasons[index].name}"?`)) {
        currentEditingCalendar.seasons.splice(index, 1);
        renderSeasons();
    }
}

// ============================================================================
// SETTINGS SECTION
// ============================================================================

function renderSettings() {
    const settings = currentEditingCalendar.settings;
    const canEdit = !currentEditingCalendar.isDefault;
    
    document.getElementById('date-format').value = settings.dateFormat;
    document.getElementById('date-format').disabled = !canEdit;
    
    document.getElementById('time-format').value = settings.timeFormat;
    document.getElementById('time-format').disabled = !canEdit;
    
    updateDateFormatPreview();
    updateTimeFormatPreview();
}

function updateDateFormatPreview() {
    const format = document.getElementById('date-format').value;
    const preview = document.getElementById('date-format-preview');
    
    // Use an example date from the current calendar
    // Use the first month, day 15 (or max days if month has fewer)
    const firstMonth = currentEditingCalendar.months[0];
    const exampleDay = Math.min(15, firstMonth.days);
    const exampleDate = { 
        year: currentEditingCalendar.eras[0]?.startDate.year || 1, 
        month: 0, 
        day: exampleDay 
    };
    
    const formatted = formatDateWithFormat(exampleDate, format, currentEditingCalendar);
    
    preview.textContent = formatted;
    
    if (!currentEditingCalendar.isDefault) {
        currentEditingCalendar.settings.dateFormat = format;
    }
}

function updateTimeFormatPreview() {
    const format = document.getElementById('time-format').value;
    const preview = document.getElementById('time-format-preview');
    
    let exampleTime = '';
    if (format === '12') {
        exampleTime = '3:45 PM';
    } else if (format === '24') {
        exampleTime = '15:45';
    } else {
        // Custom divisions
        const divisionCount = currentEditingCalendar.timeDivisions.divisionsPerDay;
        // Use a division around the middle for the example (or division 7 if available)
        const exampleDivisionIndex = Math.min(7, Math.floor(divisionCount / 2));
        const divName = currentEditingCalendar.timeDivisions.divisionNames?.[exampleDivisionIndex] 
                       || `Division ${exampleDivisionIndex + 1}`;
        const subdivisionName = currentEditingCalendar.timeDivisions.subdivisionName || 'minutes';
        exampleTime = `${divName}, 45 ${subdivisionName}`;
    }
    
    preview.textContent = exampleTime;
    
    if (!currentEditingCalendar.isDefault) {
        currentEditingCalendar.settings.timeFormat = format;
    }
}

// ============================================================================
// MANAGE CALENDARS MODAL
// ============================================================================
