// Mini-calendar editor runtime
function openMiniCalendar(eraIndexOrEndDate) {
    const isEndDate = eraIndexOrEndDate === 'endDate';
    
    if (isEndDate) {
        miniCalEditingEraIndex = 'endDate';
        const endDate = currentEditingCalendar.endDate || { year: 3000, month: 11, day: 31 };
        
        // Initialize with end date
        miniCalCurrentMonth = endDate.month;
        miniCalCurrentYear = endDate.year;
        miniCalSelectedDate = { ...endDate };
        
        // Update modal title
        document.getElementById('mini-calendar-title').textContent = 'Select End Date';
    } else {
        miniCalEditingEraIndex = eraIndexOrEndDate;
        const era = currentEditingCalendar.eras[eraIndexOrEndDate];
        const isBackwardEra = era.isBackward;
        
        // Initialize with era's current date
        miniCalCurrentMonth = era.startDate.month;
        miniCalCurrentYear = era.startDate.year;
        miniCalSelectedDate = { ...era.startDate };
        
        // Update modal title
        document.getElementById('mini-calendar-title').textContent = 'Select Start Date';
    }
    
    // Populate month dropdown
    const monthSelect = document.getElementById('mini-cal-month');
    monthSelect.innerHTML = '';
    currentEditingCalendar.months.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = month.name;
        monthSelect.appendChild(option);
    });
    monthSelect.value = miniCalCurrentMonth;
    
    // Set year input
    document.getElementById('mini-cal-year').value = miniCalCurrentYear;
    
    // Era selector handling
    const eraSelector = document.getElementById('mini-cal-era-selector');
    if (isEndDate) {
        // Never show era selector for end date
        eraSelector.style.display = 'none';
    } else {
        const era = currentEditingCalendar.eras[eraIndexOrEndDate];
        const isBackwardEra = era.isBackward;
        
        // Only show era selector for backward era
        if (isBackwardEra) {
            eraSelector.style.display = 'block';
            const eraSelect = document.getElementById('mini-cal-era');
            eraSelect.innerHTML = '';
            
            // Only show backward eras in selector
            currentEditingCalendar.eras.forEach((e, idx) => {
                if (e.isBackward) {
                    const option = document.createElement('option');
                    option.value = idx;
                    option.textContent = `${e.abbreviation} (${e.name})`;
                    eraSelect.appendChild(option);
                }
            });
            eraSelect.value = eraIndexOrEndDate;
        } else {
            // Hide era selector for forward eras
            eraSelector.style.display = 'none';
        }
    }
    
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

function findEraForYear(year) {
    for (let i = currentEditingCalendar.eras.length - 1; i >= 0; i--) {
        if (year >= currentEditingCalendar.eras[i].startDate.year) {
            return i;
        }
    }
    return 0;
}

function navigateMiniCalMonth(direction) {
    miniCalCurrentMonth += direction;
    
    if (miniCalCurrentMonth < 0) {
        miniCalCurrentMonth = currentEditingCalendar.months.length - 1;
        miniCalCurrentYear--;
    } else if (miniCalCurrentMonth >= currentEditingCalendar.months.length) {
        miniCalCurrentMonth = 0;
        miniCalCurrentYear++;
    }
    
    document.getElementById('mini-cal-month').value = miniCalCurrentMonth;
    document.getElementById('mini-cal-year').value = miniCalCurrentYear;
    
    renderMiniCalendar();
}

function renderMiniCalendar() {
    const grid = document.getElementById('mini-calendar-grid');
    grid.innerHTML = '';
    grid.className = 'mini-calendar-grid';
    
    if (currentEditingCalendar.calendarType === 'solar' && currentEditingCalendar.weekdays && currentEditingCalendar.weekdays.length > 0) {
        renderSolarMiniCalendar(grid);
    } else {
        renderLunarMiniCalendar(grid);
    }
    
    updateMiniCalDisplay();
}

function renderSolarMiniCalendar(grid) {
    const weekdayCount = currentEditingCalendar.weekdays.length;
    
    // Dynamically set grid columns based on number of weekdays
    grid.style.gridTemplateColumns = `repeat(${weekdayCount}, 1fr)`;
    
    // Create weekday headers
    currentEditingCalendar.weekdays.forEach(day => {
        const header = document.createElement('div');
        header.className = 'mini-cal-weekday-header';
        const truncateLength = weekdayCount > 10 ? 2 : 3;
        header.textContent = day.substring(0, truncateLength);
        grid.appendChild(header);
    });
    
    // Get days in current month
    const daysInMonth = currentEditingCalendar.months[miniCalCurrentMonth].days;
    
    // Calculate starting day of week
    const startDay = calculateDayOfWeek(miniCalCurrentYear, miniCalCurrentMonth, 1, currentEditingCalendar);
    
    // Add empty cells for days before month starts
    for (let i = 0; i < startDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'mini-cal-day empty';
        grid.appendChild(empty);
    }
    
    // Add day cells
    renderMiniCalDayCells(grid, daysInMonth);
}

function renderLunarMiniCalendar(grid) {
    // Simple grid, 7 columns for readability
    grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
    
    // Get days in current month
    const daysInMonth = currentEditingCalendar.months[miniCalCurrentMonth].days;
    
    // Add day cells (no weekday headers, no offset)
    renderMiniCalDayCells(grid, daysInMonth);
}

function renderMiniCalDayCells(grid, daysInMonth) {
    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'mini-cal-day';
        
        // Calculate moon phase if enabled
        let moonIcon = '';
        if (currentEditingCalendar.moonPhases && currentEditingCalendar.moonPhases.enabled) {
            const phase = calculateMoonPhase(miniCalCurrentYear, miniCalCurrentMonth, day, currentEditingCalendar);
            const iconHTML = getMoonPhaseIcon(phase); // Now returns HTML
            moonIcon = iconHTML ? `<span class="moon-phase-icon">${iconHTML}</span>` : '';
        }

        dayCell.innerHTML = `
            <div class="mini-cal-day-number">${day}</div>
            ${moonIcon}
        `;
        
        // Check if this is the selected date
        if (miniCalSelectedDate && 
            miniCalSelectedDate.year === miniCalCurrentYear &&
            miniCalSelectedDate.month === miniCalCurrentMonth &&
            miniCalSelectedDate.day === day) {
            dayCell.classList.add('selected');
        }
        
        dayCell.onclick = () => selectMiniCalDate(day);
        grid.appendChild(dayCell);
    }
}

function calculateDayOfWeek(year, month, day, calendar) {
    // Calculate which day of the week a date falls on in the custom calendar
    // This uses a simplified approach: count total days from epoch and mod by week length
    
    // Use the provided calendar parameter instead of global currentEditingCalendar
    const cal = calendar || currentEditingCalendar;
    
    if (!cal) {
        console.error('calculateDayOfWeek called without a valid calendar');
        return 0; // Return default day
    }
    
    const weekLength = cal.weekdays.length;
    const epochDay = cal.epochDay || 0;
    
    // Calculate total days from the first era start to this date
    let totalDays = 0;
    
    // Start from the earliest era start date
    const earliestEra = cal.eras[0];
let referenceYear = earliestEra.startDate.year;
    let referenceMonth = earliestEra.startDate.month;
    let referenceDay = earliestEra.startDate.day;
    
    // If target date is before reference, we can't calculate (shouldn't happen in practice)
    if (year < referenceYear || 
        (year === referenceYear && month < referenceMonth) ||
        (year === referenceYear && month === referenceMonth && day < referenceDay)) {
        return epochDay; // Fallback to epoch day
    }
    
    // Add days for complete years
    for (let y = referenceYear; y < year; y++) {
        totalDays += cal.months.reduce((sum, m) => sum + m.days, 0);
    }
    
    // Add days for complete months in the target year
    for (let m = (year === referenceYear ? referenceMonth : 0); m < month; m++) {
        totalDays += cal.months[m].days;
    }
    
    // Add days in the target month
    totalDays += day - (year === referenceYear && month === referenceMonth ? referenceDay : 0);
    
    // Calculate day of week
    const dayOfWeek = (epochDay + totalDays) % weekLength;
    
    return dayOfWeek < 0 ? dayOfWeek + weekLength : dayOfWeek;
}

function calculateMoonPhase(year, month, day, calendar) {
    // Returns moon phase for a given date
    // 0 = New Moon, 0.25 = First Quarter, 0.5 = Full Moon, 0.75 = Last Quarter
    
    if (!calendar.moonPhases || !calendar.moonPhases.enabled) {
        return null;
    }
    
    const moonData = calendar.moonPhases;
    const cycleLength = moonData.cycleLength;
    
    // Calculate days since epoch new moon
    const epochDate = moonData.epochNewMoon;
    let daysSinceEpoch = 0;
    
    // Simple day counting (this could be improved with actual date math)
    // For now, calculate from the epoch year
    for (let y = epochDate.year; y < year; y++) {
        daysSinceEpoch += calendar.months.reduce((sum, m) => sum + m.days, 0);
    }
    
    // Add days for complete months in target year
    for (let m = 0; m < month; m++) {
        daysSinceEpoch += calendar.months[m].days;
    }
    
    // Add days in target month
    daysSinceEpoch += day;
    
    // Subtract days for complete months in epoch year up to epoch month
    for (let m = 0; m < epochDate.month; m++) {
        daysSinceEpoch -= calendar.months[m].days;
    }
    
    // Subtract epoch day
    daysSinceEpoch -= epochDate.day;
    
    // Calculate phase (0 to 1)
    const phase = (daysSinceEpoch % cycleLength) / cycleLength;
    
    return phase < 0 ? phase + 1 : phase;
}

function getMoonPhaseIcon(phase) {
    // Returns Font Awesome HTML for moon phase icons
    if (phase === null) return '';

    // Note: The free version of Font Awesome has limited phase icons.
    // We use creative combinations of fa-circle (for new/full) and fa-moon.
    // 'fa-adjust' is a good stand-in for quarter moons.
    
    if (phase < 0.0625 || phase >= 0.9375) return '<i class="fa-solid fa-circle"></i>'; // New Moon (style with dark color)
    if (phase < 0.1875) return '<i class="fa-solid fa-moon" style="transform: scaleX(-1) rotate(-35deg);"></i>'; // Waxing Crescent
    if (phase < 0.3125) return '<i class="fa-solid fa-adjust" style="transform: rotate(180deg);"></i>';      // First Quarter
    if (phase < 0.4375) return '<i class="fa-solid fa-moon" style="transform: rotate(35deg);"></i>';         // Waxing Gibbous
    if (phase < 0.5625) return '<i class="fa-solid fa-circle"></i>'; // Full Moon (style with light color)
    if (phase < 0.6875) return '<i class="fa-solid fa-moon" style="transform: scaleX(-1) rotate(35deg);"></i>'; // Waning Gibbous
    if (phase < 0.8125) return '<i class="fa-solid fa-adjust"></i>';          // Last Quarter
    return '<i class="fa-solid fa-moon" style="transform: rotate(-35deg);"></i>'; // Waning Crescent
}

function getMoonPhaseName(phase) {
    if (phase === null) return '';
    
    if (phase < 0.0625 || phase >= 0.9375) return 'New Moon';
    if (phase < 0.1875) return 'Waxing Crescent';
    if (phase < 0.3125) return 'First Quarter';
    if (phase < 0.4375) return 'Waxing Gibbous';
    if (phase < 0.5625) return 'Full Moon';
    if (phase < 0.6875) return 'Waning Gibbous';
    if (phase < 0.8125) return 'Last Quarter';
    return 'Waning Crescent';
}

function selectMiniCalDate(day) {
    miniCalSelectedDate = {
        year: miniCalCurrentYear,
        month: miniCalCurrentMonth,
        day: day
    };
    
    renderMiniCalendar();
}

function updateMiniCalDisplay() {
    const display = document.getElementById('mini-cal-selected-display');
    if (miniCalSelectedDate) {
        const monthName = currentEditingCalendar.months[miniCalSelectedDate.month]?.name || 'Unknown';
        const day = miniCalSelectedDate.day;
        const year = Math.abs(miniCalSelectedDate.year);
        
        let formatted;
        
        if (miniCalEditingEraIndex === 'endDate') {
            // End date: no era abbreviation
            formatted = `${monthName} ${day}, ${year}`;
        } else if (miniCalEditingEraIndex === 'event-date') {
            // Event date: show with era abbreviation
            let eraAbbr = '';
            for (let i = currentEditingCalendar.eras.length - 1; i >= 0; i--) {
                const era = currentEditingCalendar.eras[i];
                if (miniCalSelectedDate.year >= era.startDate.year) {
                    eraAbbr = era.abbreviation;
                    break;
                }
            }
            formatted = `${monthName} ${day}, ${year} ${eraAbbr}`;
        } else if (miniCalEditingEraIndex === 'storyline-date') {
            // Storyline date: show with era abbreviation (same as event-date)
            let eraAbbr = '';
            for (let i = currentEditingCalendar.eras.length - 1; i >= 0; i--) {
                const era = currentEditingCalendar.eras[i];
                if (miniCalSelectedDate.year >= era.startDate.year) {
                    eraAbbr = era.abbreviation;
                    break;
                }
            }
            formatted = `${monthName} ${day}, ${year} ${eraAbbr}`;
        } else if (typeof miniCalEditingEraIndex === 'string' && miniCalEditingEraIndex.startsWith('season-')) {
            // Season date: no year needed, just month and day
            formatted = `${monthName} ${day}`;
        } else if (miniCalEditingEraIndex === 'moon-epoch') {
            // Moon epoch: show full date with era
            let eraAbbr = '';
            for (let i = currentEditingCalendar.eras.length - 1; i >= 0; i--) {
                const era = currentEditingCalendar.eras[i];
                if (miniCalSelectedDate.year >= era.startDate.year) {
                    eraAbbr = era.abbreviation;
                    break;
                }
            }
            formatted = `${monthName} ${day}, ${year} ${eraAbbr}`;
        } else {
            const era = currentEditingCalendar.eras[miniCalEditingEraIndex];
            if (era.isBackward) {
                // Show with era abbreviation for backward era
                formatted = `${monthName} ${day}, ${year} ${era.abbreviation}`;
            } else {
                // No era abbreviation for forward eras
                formatted = `${monthName} ${day}, ${year}`;
            }
        }
        
        display.textContent = formatted;
    } else {
        display.textContent = 'None';
    }
}

function confirmMiniCalSelection() {
    if (miniCalSelectedDate) {
        if (miniCalEditingEraIndex === 'endDate') {
            // Update end date
            currentEditingCalendar.endDate = { ...miniCalSelectedDate };
            renderEras();
            renderOverview();
            closeModal('miniCalendarModal');
        } else if (miniCalEditingEraIndex === 'event-date') {
            // For event date selection - use callback
            confirmEventDateSelection();
        } else if (typeof miniCalEditingEraIndex === 'string' && miniCalEditingEraIndex.startsWith('season-')) {
            // Update season start date
            const seasonIndex = parseInt(miniCalEditingEraIndex.split('-')[1]);
            currentEditingCalendar.seasons[seasonIndex].startDate = {
                month: miniCalSelectedDate.month,
                day: miniCalSelectedDate.day
            };
            renderSeasons();
            closeModal('miniCalendarModal');
        } else if (miniCalEditingEraIndex === 'moon-epoch') {
            currentEditingCalendar.moonPhases.epochNewMoon = { ...miniCalSelectedDate };
            renderMoonPhases();
            closeModal('miniCalendarModal');
        } else if (miniCalEditingEraIndex !== -1) {
            // Update era start date
            currentEditingCalendar.eras[miniCalEditingEraIndex].startDate = { ...miniCalSelectedDate };
            renderEras();
            closeModal('miniCalendarModal');
        }
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatCalendarDate(dateObj, calendar) {
    if (!dateObj) return 'N/A';
    
    const monthName = calendar.months[dateObj.month]?.name || 'Unknown';
    const day = dateObj.day;
    const year = Math.abs(dateObj.year);
    
    // Find which era this date is in
    let eraAbbr = '';
    for (let i = calendar.eras.length - 1; i >= 0; i--) {
        const era = calendar.eras[i];
        if (dateObj.year >= era.startDate.year) {
            eraAbbr = era.abbreviation;
            break;
        }
    }
    
    return `${monthName} ${day}, ${year} ${eraAbbr}`;
}

// Export functions for use in other modules
window.loadUserTimeSystems = loadUserTimeSystems;
window.initializeTimeSystems = initializeTimeSystems;
window.populateTimeSystemsDropdown = populateTimeSystemsDropdown;
window.openTimeSystemsEditor = openTimeSystemsEditor;
window.openManageCalendarsModal = openManageCalendarsModal;
window.createNewCalendar = createNewCalendar;
window.renameCalendar = renameCalendar;
window.deleteCalendar = deleteCalendar;
window.saveCurrentTimeSystem = saveCurrentTimeSystem;
window.cancelTimeSystemEdits = cancelTimeSystemEdits;
window.duplicatePresetCalendar = duplicatePresetCalendar; 

// Functions called from HTML
window.updateMonthName = updateMonthName;
window.updateMonthDays = updateMonthDays;
window.deleteMonth = deleteMonth;
window.updateWeekdayName = updateWeekdayName;
window.deleteWeekday = deleteWeekday;
window.updateDivisionName = updateDivisionName;
window.updateEraName = updateEraName;
window.updateEraAbbr = updateEraAbbr;
window.editEraDate = editEraDate;
window.deleteEra = deleteEra;
window.addBackwardEra = addBackwardEra;
window.addForwardEra = addForwardEra;
window.openMiniCalendar = openMiniCalendar;
window.editEndDate = editEndDate;
window.updateSeasonName = updateSeasonName;
window.updateSeasonColor = updateSeasonColor;
window.editSeasonDate = editSeasonDate;
window.deleteSeason = deleteSeason;
window.editMoonEpoch = editMoonEpoch;
