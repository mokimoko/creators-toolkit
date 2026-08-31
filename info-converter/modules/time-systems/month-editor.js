// Calendar overview and month editor
function renderOverview() {
    const container = document.getElementById('time-overview-display');
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create calendar name display (no heading since it's already in HTML)
    const nameDisplay = document.createElement('div');
    nameDisplay.className = 'calendar-name-display';
    nameDisplay.textContent = currentEditingCalendar.name;
    container.appendChild(nameDisplay);
    
    // Calculate stats
    const totalDays = currentEditingCalendar.months.reduce((sum, month) => sum + month.days, 0);
    const avgMonthLength = (totalDays / currentEditingCalendar.months.length).toFixed(1);
    const weeksPerYear = (totalDays / currentEditingCalendar.weekdays.length).toFixed(1);
    const minutesPerDay = currentEditingCalendar.timeDivisions.divisionsPerDay * currentEditingCalendar.timeDivisions.minutesPerDivision;
    
    // Create prominent stats row
    const statsRow = document.createElement('div');
    statsRow.className = 'overview-stats-row';
    statsRow.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${currentEditingCalendar.timeDivisions.divisionsPerDay}</div>
            <div class="stat-label">Hours per Day</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${currentEditingCalendar.weekdays.length}</div>
            <div class="stat-label">Days per Week</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${currentEditingCalendar.months.length}</div>
            <div class="stat-label">Months per Year</div>
        </div>
    `;
    container.appendChild(statsRow);
    
    // Create regular info blocks container
    const blocksContainer = document.createElement('div');
    blocksContainer.className = 'overview-blocks';
    
    // Calculate additional stats
    const hoursPerWeek = currentEditingCalendar.timeDivisions.divisionsPerDay * currentEditingCalendar.weekdays.length;
    const hoursPerMonth = ((totalDays * currentEditingCalendar.timeDivisions.divisionsPerDay) / currentEditingCalendar.months.length).toFixed(1);

    // Add the other info blocks
    const blocks = [
        { label: 'Days per Year', value: totalDays },
        { label: 'Weeks per Year', value: weeksPerYear },
        { label: 'Hours per Week', value: hoursPerWeek.toLocaleString() },
        { label: 'Hours per Month', value: hoursPerMonth.toLocaleString() },
        { label: 'Average Month Length', value: `${avgMonthLength} days` },
        { label: 'Minutes per Day', value: minutesPerDay.toLocaleString() },
        { label: 'Minutes per Division', value: currentEditingCalendar.timeDivisions.minutesPerDivision },
        { label: 'Subdivision Name', value: currentEditingCalendar.timeDivisions.subdivisionName || 'minutes' },
        { label: 'Number of Eras', value: currentEditingCalendar.eras.length }
    ];
    
    blocks.forEach(block => {
        const blockDiv = document.createElement('div');
        blockDiv.className = 'overview-block';
        blockDiv.innerHTML = `
            <div class="block-label">${block.label}</div>
            <div class="block-value">${block.value}</div>
        `;
        blocksContainer.appendChild(blockDiv);
    });
    
    container.appendChild(blocksContainer);
    
    // Add date range at the bottom if it exists
    if (currentEditingCalendar.endDate) {
        const dateRangeDisplay = document.createElement('div');
        dateRangeDisplay.className = 'date-range-display';
        
        const firstEra = currentEditingCalendar.eras[0];
        const startMonth = currentEditingCalendar.months[firstEra.startDate.month];
        const endMonth = currentEditingCalendar.months[currentEditingCalendar.endDate.month];
        
        dateRangeDisplay.innerHTML = `
            <span class="date-range-text">
                ${startMonth.name} ${firstEra.startDate.day}, ${firstEra.startDate.year} 
                <span class="date-range-separator">→</span> 
                ${endMonth.name} ${currentEditingCalendar.endDate.day}, ${currentEditingCalendar.endDate.year}
            </span>
        `;
        
        container.appendChild(dateRangeDisplay);
    }
}

// ============================================================================
// MONTHS SECTION
// ============================================================================

function renderMonths() {
    const container = document.getElementById('months-list');
    container.innerHTML = '';
    
    currentEditingCalendar.months.forEach((month, index) => {
        const item = createMonthItem(month, index);
        container.appendChild(item);
    });
    
    setupMonthsDragAndDrop();
}

function createMonthItem(month, index) {
    const div = document.createElement('div');
    div.className = 'time-item';
    div.dataset.index = index;
    div.draggable = !currentEditingCalendar.isDefault;
    
    const canEdit = !currentEditingCalendar.isDefault;
    
    div.innerHTML = `
        <span class="time-item-drag-handle"><i class="fas fa-grip-vertical"></i></span>
        <div class="time-item-content">
            <input type="text" value="${month.name}" 
                   onchange="updateMonthName(${index}, this.value)"
                   ${canEdit ? '' : 'readonly'}
                   style="flex: 1;">
            <input type="number" value="${month.days}" min="1" max="999"
                   onchange="updateMonthDays(${index}, this.value)"
                   ${canEdit ? '' : 'readonly'}
                   style="width: 80px;">
            <span style="color: var(--text-muted);">days</span>
        </div>
        ${canEdit ? `<span class="time-item-delete" onclick="deleteMonth(${index})"><i class="fas fa-trash"></i></span>` : ''}
    `;
    
    return div;
}

function addMonth() {
    if (currentEditingCalendar.isDefault) return;
    
    currentEditingCalendar.months.push({
        name: `Month ${currentEditingCalendar.months.length + 1}`,
        days: 30
    });
    
    renderMonths();
    renderOverview();
}

function updateMonthName(index, newName) {
    if (currentEditingCalendar.isDefault) return;
    currentEditingCalendar.months[index].name = newName;
    renderOverview();
}

function updateMonthDays(index, newDays) {
    if (currentEditingCalendar.isDefault) return;
    const days = parseInt(newDays) || 30;
    currentEditingCalendar.months[index].days = days;
    
    // Check if any era dates need adjustment due to this month now having fewer days
    currentEditingCalendar.eras.forEach(era => {
        if (era.startDate.month === index && era.startDate.day > days) {
            era.startDate.day = days;
        }
    });
    
    // Check end date
    if (currentEditingCalendar.endDate && 
        currentEditingCalendar.endDate.month === index && 
        currentEditingCalendar.endDate.day > days) {
        currentEditingCalendar.endDate.day = days;
    }
    
    renderOverview();
    renderEras(); // Re-render in case dates were adjusted
}

function deleteMonth(index) {
    if (currentEditingCalendar.isDefault) return;
    if (currentEditingCalendar.months.length <= 1) {
        window.notifyLoreUser('Cannot delete the last month!');
        return;
    }
    
    // Remove the month
    currentEditingCalendar.months.splice(index, 1);
    
    // Adjust all era dates and end date
    adjustDatesAfterMonthChange(index, 'delete');
    
    renderMonths();
    renderOverview();
    renderEras(); // Re-render eras to show updated dates
}

function adjustDatesAfterMonthChange(deletedIndex, action) {
    // Adjust era start dates
    currentEditingCalendar.eras.forEach(era => {
        if (action === 'delete') {
            if (era.startDate.month === deletedIndex) {
                // The month this era references was deleted
                // Move to the previous month, or next if it's the first
                era.startDate.month = deletedIndex > 0 ? deletedIndex - 1 : 0;
                
                // Adjust day if it exceeds the new month's days
                const newMonthDays = currentEditingCalendar.months[era.startDate.month].days;
                if (era.startDate.day > newMonthDays) {
                    era.startDate.day = newMonthDays;
                }
            } else if (era.startDate.month > deletedIndex) {
                // This month is after the deleted one, so decrement the index
                era.startDate.month--;
            }
        }
    });
    
    // Adjust end date
    if (currentEditingCalendar.endDate) {
        if (action === 'delete') {
            if (currentEditingCalendar.endDate.month === deletedIndex) {
                // Move to the previous month, or next if it's the first
                currentEditingCalendar.endDate.month = deletedIndex > 0 ? deletedIndex - 1 : 0;
                
                // Adjust day if it exceeds the new month's days
                const newMonthDays = currentEditingCalendar.months[currentEditingCalendar.endDate.month].days;
                if (currentEditingCalendar.endDate.day > newMonthDays) {
                    currentEditingCalendar.endDate.day = newMonthDays;
                }
            } else if (currentEditingCalendar.endDate.month > deletedIndex) {
                currentEditingCalendar.endDate.month--;
            }
        }
    }
}

function adjustDatesAfterMonthReorder(fromIndex, toIndex) {
    // Helper function to adjust a single month index
    const adjustMonthIndex = (monthIndex) => {
        if (monthIndex === fromIndex) {
            return toIndex;
        } else if (fromIndex < toIndex) {
            // Moving forward: indices between from and to shift back
            if (monthIndex > fromIndex && monthIndex <= toIndex) {
                return monthIndex - 1;
            }
        } else {
            // Moving backward: indices between to and from shift forward
            if (monthIndex >= toIndex && monthIndex < fromIndex) {
                return monthIndex + 1;
            }
        }
        return monthIndex;
    };
    
    // Adjust all era dates
    currentEditingCalendar.eras.forEach(era => {
        era.startDate.month = adjustMonthIndex(era.startDate.month);
    });
    
    // Adjust end date
    if (currentEditingCalendar.endDate) {
        currentEditingCalendar.endDate.month = adjustMonthIndex(currentEditingCalendar.endDate.month);
    }
}

function setupMonthsDragAndDrop() {
    if (currentEditingCalendar.isDefault) return;
    
    const container = document.getElementById('months-list');
    const items = container.querySelectorAll('.time-item');
    
    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
    });
}

// ============================================================================
// WEEKS SECTION
// ============================================================================
