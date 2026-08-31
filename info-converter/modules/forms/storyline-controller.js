// Lore Codex form domain: storyline controller
function openStorylineModal(storylineData = null) {
    const modalTitle = document.getElementById('storyline-modal-title');
    
    if (storylineData) {
        modalTitle.textContent = 'Edit Storyline';
        populateStorylineModal(storylineData);
    } else {
        modalTitle.textContent = 'Add Storyline';
        clearModalFields('storylineModal');
    }
    
    // Populate section datalist with existing sections
    const sectionDatalist = document.getElementById('section-datalist');
    sectionDatalist.innerHTML = '';
    
    const uniqueSections = new Set();
    infoData.storylines.forEach(storyline => {
        if (storyline.section && storyline.section.trim()) {
            uniqueSections.add(storyline.section.trim());
        }
    });
    
    uniqueSections.forEach(section => {
        const option = document.createElement('option');
        option.value = section;
        sectionDatalist.appendChild(option);
    });
    
    // Set up subsection field behavior
    const sectionInput = document.getElementById('story-section');
    const subsectionInput = document.getElementById('story-subsection');
    
    // Enable/disable subsection based on section value
    if (sectionInput.value.trim()) {
        subsectionInput.disabled = false;
        populateSubsectionDatalist(sectionInput.value.trim());
    } else {
        subsectionInput.disabled = true;
        subsectionInput.value = '';
    }
    
    // Listen for changes to section field
    sectionInput.addEventListener('input', function() {
        if (this.value.trim()) {
            subsectionInput.disabled = false;
            populateSubsectionDatalist(this.value.trim());
        } else {
            subsectionInput.disabled = true;
            subsectionInput.value = '';
        }
    });
    
    openModal('storylineModal');
}

// Generate unique ID for world items based on category
function generateWorldItemId(category) {
    // Get category prefix (e.g., 'locations' -> 'loc', 'items' -> 'item')
    const prefixMap = {
        'locations': 'loc',
        'concepts': 'concept',
        'events': 'event',
        'creatures': 'creature',
        'plants': 'plant',
        'items': 'item',
        'factions': 'faction',
        'culture': 'culture',
        'cultivation': 'cultivation',
        'magic': 'magic',
        'general': 'general'
    };
    
    const prefix = prefixMap[category] || category;
    
    // Get existing IDs for this category
    const existingIds = infoData.world[category]
        ?.filter(item => item.id)
        .map(item => parseInt(item.id.replace(`${prefix}_`, '')))
        .filter(id => !isNaN(id)) || [];
    
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    return `${prefix}_${maxId + 1}`;
}

function populateSubsectionDatalist(sectionName) {
    const subsectionDatalist = document.getElementById('subsection-datalist');
    subsectionDatalist.innerHTML = '';
    
    const uniqueSubsections = new Set();
    infoData.storylines.forEach(storyline => {
        // Only include subsections from the same section
        if (storyline.section === sectionName && 
            storyline.subsection && 
            storyline.subsection.trim()) {
            uniqueSubsections.add(storyline.subsection.trim());
        }
    });
    
    uniqueSubsections.forEach(subsection => {
        const option = document.createElement('option');
        option.value = subsection;
        subsectionDatalist.appendChild(option);
    });
}

async function openStoryDatePicker(selectingEndDate = false) {
    await window.LoreFeatureLifecycle?.ensureFeature('timeSystems');

    // Get the selected time system
    const timeSystemId = infoData.plansOptions?.selectedTimeSystemId || 'default';
    const timeSystem = getTimeSystemById(timeSystemId);
    
    if (!timeSystem) {
        window.notifyLoreUser('No time system found. Please create a time system first.');
        return;
    }
    
    // If selecting end date but no start date, don't allow
    if (selectingEndDate && !storyEditingDate) {
        window.notifyLoreUser('Please select a start date first.');
        return;
    }
    
    isSelectingStoryEndDate = selectingEndDate;
    
    // Set up mini-calendar for storyline date selection
    miniCalEditingEraIndex = 'storyline-date';
    currentEditingCalendar = timeSystem;
    
    // Initialize with current date or default to first era start
    const currentDate = selectingEndDate ? storyEditingEndDate : storyEditingDate;
    
    if (currentDate && validateEventDate(currentDate, timeSystem)) {
        miniCalCurrentMonth = currentDate.month;
        miniCalCurrentYear = currentDate.year;
        miniCalSelectedDate = { ...currentDate };
    } else {
        // Default to first era start (or start date if selecting end date)
        const defaultDate = selectingEndDate && storyEditingDate ? storyEditingDate : timeSystem.eras[0].startDate;
        miniCalCurrentMonth = defaultDate.month;
        miniCalCurrentYear = defaultDate.year;
        miniCalSelectedDate = { ...defaultDate };
    }
    
    // Update modal title
    document.getElementById('mini-calendar-title').textContent = selectingEndDate ? 'Select End Date' : 'Select Start Date';
    
    // Populate month dropdown
    const monthSelect = document.getElementById('mini-cal-month');
    monthSelect.innerHTML = '';
    timeSystem.months.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = month.name;
        monthSelect.appendChild(option);
    });
    monthSelect.value = miniCalCurrentMonth;
    
    // Set year input
    document.getElementById('mini-cal-year').value = miniCalCurrentYear;

    // Set up era selector
    const eraSelector = document.getElementById('mini-cal-era-selector');
    if (eraSelector) {
        eraSelector.style.display = 'block';
        const eraSelect = document.getElementById('mini-cal-era');
        eraSelect.innerHTML = '';
        
        // Show ALL eras
        timeSystem.eras.forEach((era, idx) => {
            const option = document.createElement('option');
            option.value = idx;
            option.textContent = `${era.abbreviation} (${era.name})`;
            eraSelect.appendChild(option);
        });
        
        // Set to era containing current year
        const currentEraIndex = findEraForYear(miniCalCurrentYear);
        eraSelect.value = currentEraIndex;
        
        // When era changes, jump to that era's start year
        eraSelect.onchange = () => {
            const selectedEraIndex = parseInt(eraSelect.value);
            const selectedEra = timeSystem.eras[selectedEraIndex];
            miniCalCurrentYear = selectedEra.startDate.year;
            miniCalCurrentMonth = selectedEra.startDate.month;
            document.getElementById('mini-cal-year').value = miniCalCurrentYear;
            document.getElementById('mini-cal-month').value = miniCalCurrentMonth;
            renderMiniCalendar();
        };
    }

    // Always show time section for both start and end dates
    const timeSection = document.getElementById('mini-cal-time-section');
    if (timeSection) {
        timeSection.style.display = 'block';
    }

    const timeDivisionSelect = document.getElementById('mini-cal-time-division');
    const subdivisionInput = document.getElementById('mini-cal-time-subdivision');
    const subdivisionLabel = document.getElementById('mini-cal-subdivision-label');

    // Clear and populate time division options
    timeDivisionSelect.innerHTML = '<option value="">No specific time</option>';

    const timeFormat = timeSystem.settings.timeFormat;

    if (timeFormat === '12' || timeFormat === '24') {
        // Standard hours
        const hourCount = timeFormat === '12' ? 12 : 24;
        
        if (timeFormat === '12') {
            // 12-hour format with AM/PM
            for (let i = 1; i <= 12; i++) {
                const amOption = document.createElement('option');
                amOption.value = i;
                amOption.textContent = `${i} AM`;
                timeDivisionSelect.appendChild(amOption);
            }
            for (let i = 1; i <= 12; i++) {
                const pmOption = document.createElement('option');
                pmOption.value = i + 12;
                pmOption.textContent = `${i} PM`;
                timeDivisionSelect.appendChild(pmOption);
            }
        } else {
            // 24-hour format
            for (let i = 0; i < 24; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = String(i).padStart(2, '0') + ':00';
                timeDivisionSelect.appendChild(option);
            }
        }
        
        subdivisionLabel.textContent = 'Minute:';
        subdivisionInput.min = 0;
        subdivisionInput.max = 59;
        subdivisionInput.placeholder = '0-59';
    } else if (timeFormat === 'custom') {
        // Custom time divisions
        if (timeSystem.timeDivisions && timeSystem.timeDivisions.divisionNames) {
            timeSystem.timeDivisions.divisionNames.forEach((name, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = name;
                timeDivisionSelect.appendChild(option);
            });
        }
        
        const subdivisionName = timeSystem.timeDivisions?.subdivisionName || 'Subdivision';
        const subdivisionCount = timeSystem.timeDivisions?.subdivisionsPerDivision || 60;
        
        subdivisionLabel.textContent = `${subdivisionName}:`;
        subdivisionInput.min = 0;
        subdivisionInput.max = subdivisionCount - 1;
        subdivisionInput.placeholder = `0-${subdivisionCount - 1}`;
    }

    // Enable/disable subdivision input based on selection
    timeDivisionSelect.onchange = () => {
        if (timeDivisionSelect.value) {
            subdivisionInput.disabled = false;
            subdivisionInput.value = 0;
        } else {
            subdivisionInput.disabled = true;
            subdivisionInput.value = '';
        }
    };

    // Pre-populate time controls if editing existing time
    const currentTime = selectingEndDate ? storyEditingEndTime : storyEditingTime;
    if (currentTime) {
        if (timeFormat === '12' || timeFormat === '24') {
            timeDivisionSelect.value = currentTime.hour;
            subdivisionInput.value = currentTime.minute || 0;
            subdivisionInput.disabled = false;
        } else if (timeFormat === 'custom') {
            timeDivisionSelect.value = currentTime.division;
            subdivisionInput.value = currentTime.subdivision || 0;
            subdivisionInput.disabled = false;
        }
    } else {
        subdivisionInput.disabled = true;
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
        
        // Update era dropdown to match the year
        const eraSelect = document.getElementById('mini-cal-era');
        if (eraSelect && miniCalEditingEraIndex === 'storyline-date') {
            const matchingEraIndex = findEraForYear(miniCalCurrentYear);
            eraSelect.value = matchingEraIndex;
        }
        
        renderMiniCalendar();
    };
    document.getElementById('mini-cal-confirm').onclick = confirmStoryMiniCalSelection;
    
    openModal('miniCalendarModal');
}

function confirmStoryMiniCalSelection() {
    if (!miniCalSelectedDate) {
        window.notifyLoreUser('Please select a date first.');
        return;
    }
    
    const timeSystem = currentEditingCalendar;
    
    // Validate the selected date
    if (!validateEventDate(miniCalSelectedDate, timeSystem)) {
        window.notifyLoreUser('Invalid date selected. Please check the month/day combination.');
        return;
    }
    
    // Capture time if selected
    const timeDivisionSelect = document.getElementById('mini-cal-time-division');
    const subdivisionInput = document.getElementById('mini-cal-time-subdivision');
    const timeFormat = timeSystem.settings.timeFormat;
    
    let timeData = null;
    
    if (timeDivisionSelect.value !== '') {
        const divisionValue = parseInt(timeDivisionSelect.value);
        const subdivisionValue = subdivisionInput.value !== '' ? parseInt(subdivisionInput.value) : null;
        
        if (timeFormat === '12') {
            const hour = divisionValue;
            const period = hour > 12 ? 'PM' : 'AM';
            const displayHour = hour > 12 ? hour - 12 : hour;
            
            timeData = {
                hour: hour,
                minute: subdivisionValue,
                period: period
            };
        } else if (timeFormat === '24') {
            timeData = {
                hour: divisionValue,
                minute: subdivisionValue
            };
        } else if (timeFormat === 'custom') {
            timeData = {
                division: divisionValue,
                subdivision: subdivisionValue
            };
        }
    }
    
    // Store the date and time
    if (isSelectingStoryEndDate) {
        storyEditingEndDate = { ...miniCalSelectedDate };
        storyEditingEndTime = timeData;
    } else {
        storyEditingDate = { ...miniCalSelectedDate };
        storyEditingTime = timeData;
    }
    
    updateStoryDateDisplay();
    closeModal('miniCalendarModal');
}

function clearStoryDate() {
    storyEditingDate = null;
    storyEditingTime = null;
    storyEditingEndDate = null;
    storyEditingEndTime = null;
    updateStoryDateDisplay();
}

function updateStoryDateDisplay() {
    const displayDiv = document.getElementById('selected-story-date-display');
    const clearBtn = document.getElementById('clear-story-date-btn');
    const endDateBtn = document.getElementById('select-story-end-date-btn');
    
    if (storyEditingDate) {
        const timeSystem = getTimeSystemById(infoData.plansOptions?.selectedTimeSystemId || 'default');
        let displayText = formatDateWithFormat(storyEditingDate, timeSystem.settings.dateFormat, timeSystem);
        
        if (storyEditingTime) {
            displayText += ` at ${formatTimeDisplay(storyEditingTime, timeSystem)}`;
        }
        
        if (storyEditingEndDate) {
            displayText += ` → ${formatDateWithFormat(storyEditingEndDate, timeSystem.settings.dateFormat, timeSystem)}`;
            if (storyEditingEndTime) {
                displayText += ` at ${formatTimeDisplay(storyEditingEndTime, timeSystem)}`;
            }
        }
        
        displayDiv.textContent = displayText;
        clearBtn.style.display = 'inline-block';
        
        // Enable end date button once start date is set
        endDateBtn.disabled = false;
        endDateBtn.style.opacity = '1';
    } else {
        displayDiv.textContent = 'No date selected';
        clearBtn.style.display = 'none';
        
        // Disable end date button if no start date
        endDateBtn.disabled = true;
        endDateBtn.style.opacity = '0.5';
    }
}

function populateStorylineModal(storyline) {
    // Helper function to set value only if current field is empty
    const setIfEmpty = (fieldId, value) => {
        const field = document.getElementById(fieldId);
        if (field && !field.value.trim()) {
            field.value = value || '';
        }
    };
    
    // Always set these fields (for edit mode)
    if (!document.getElementById('story-title').value) {
        document.getElementById('story-title').value = storyline.title || '';
    }
    if (!document.getElementById('story-pairing').value) {
        document.getElementById('story-pairing').value = storyline.pairing || '';
    }
    if (!document.getElementById('story-type').value || document.getElementById('story-type').value === 'roleplay') {
        document.getElementById('story-type').value = storyline.type || 'roleplay';
    }
    if (!document.getElementById('story-section').value) {
        document.getElementById('story-section').value = storyline.section || '';
    }
    if (!document.getElementById('story-subsection').value) {
        document.getElementById('story-subsection').value = storyline.subsection || '';
    }
    if (!document.getElementById('story-tags').value) {
        document.getElementById('story-tags').value = (storyline.tags || []).join(', ');
    }
    if (!document.getElementById('story-wordcount').value) {
        document.getElementById('story-wordcount').value = storyline.wordcount || '';
    }
    if (!document.getElementById('story-last-updated').value) {
        document.getElementById('story-last-updated').value = storyline.lastUpdated || '';
    }
    if (!document.getElementById('story-description').value) {
        document.getElementById('story-description').value = storyline.description || '';
    }

    if (storyline.timing) {
        storyEditingDate = storyline.timing.date ? { ...storyline.timing.date } : null;
        storyEditingTime = storyline.timing.time ? { ...storyline.timing.time } : null;
        storyEditingEndDate = storyline.timing.endDate ? { ...storyline.timing.endDate } : null;
        storyEditingEndTime = storyline.timing.endTime ? { ...storyline.timing.endTime } : null;
        updateStoryDateDisplay();
    } else {
        storyEditingDate = null;
        storyEditingTime = null;
        storyEditingEndDate = null;
        storyEditingEndTime = null;
        updateStoryDateDisplay();
    }
    
    // Handle project link checkbox and link processing
    const isProjectLink = storyline.isProjectLink || false;
    const linkInput = document.getElementById('story-link');
    const projectCheckbox = document.getElementById('story-is-project-link');
    
    projectCheckbox.checked = isProjectLink;
    
    if (isProjectLink) {
        // Show just the filename if it's a project link
        if (!linkInput.value) {
            linkInput.value = storyline.link ? storyline.link.replace('roleplays/', '') : '';
        }
        linkInput.placeholder = 'story-title.html';
    } else {
        // Show full URL for external links
        if (!linkInput.value) {
            linkInput.value = storyline.link || '';
        }
        linkInput.placeholder = 'https://archiveofourown.org/works/123456';
    }
}

function saveStoryline() {
    // Extract and process tags
    const tagsInput = document.getElementById('story-tags').value.trim();
    const tagsArray = tagsInput 
        ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag)
        : [];

    // Parse wordcount
    const wordcountInput = document.getElementById('story-wordcount').value.trim();
    const wordcount = wordcountInput ? parseInt(wordcountInput.replace(/,/g, '')) || 0 : 0;

    // Get checkbox state and process link accordingly
    const isProjectLink = document.getElementById('story-is-project-link').checked;
    const rawLink = document.getElementById('story-link').value.trim();
    
    // Process the link based on checkbox state
    let processedLink = '';
    if (rawLink) {
        if (isProjectLink) {
            // For project links, ensure it doesn't already have roleplays/ prefix
            processedLink = rawLink.startsWith('roleplays/') ? rawLink.replace('roleplays/', '') : rawLink;
        } else {
            // For external links, use as-is
            processedLink = rawLink;
        }
    }

    const storylineData = {
        title: document.getElementById('story-title').value.trim(),
        pairing: document.getElementById('story-pairing').value.trim(),
        type: document.getElementById('story-type').value,
        section: document.getElementById('story-section').value.trim(),
        subsection: document.getElementById('story-subsection').value.trim(),
        tags: tagsArray,
        wordcount: wordcount,
        description: document.getElementById('story-description').value.trim(),
        lastUpdated: document.getElementById('story-last-updated').value.trim(),
        link: processedLink,
        isProjectLink,
        
        timing: storyEditingDate ? {
            date: { ...storyEditingDate },
            endDate: storyEditingEndDate ? { ...storyEditingEndDate } : null,
            time: storyEditingTime ? { ...storyEditingTime } : null,
            endTime: storyEditingEndTime ? { ...storyEditingEndTime } : null,
            timeSystemId: infoData.plansOptions?.selectedTimeSystemId || 'default'
        } : null,
    };

    // Validation
    if (!storylineData.title) {
        window.notifyLoreUser('Storyline title is required!');
        return;
    }

    // Additional validation for project links
    if (isProjectLink && processedLink && !processedLink.endsWith('.html')) {
        if (!confirm('Project link doesn\'t end with .html. Continue anyway?')) {
            return;
        }
    }

    if (editingIndex >= 0 && editingType === 'storyline') {
        infoData.storylines[editingIndex] = storylineData;
    } else {
        infoData.storylines.push(storylineData);
    }

    updateContentList('storylines');
    closeModal('storylineModal');
    markDataAsModified();
}

// Event drag and drop functionality (updated to handle contexts)
function initializeEventDragDrop(container) {
    const eventItems = container.querySelectorAll('.event-item');
    
    eventItems.forEach(item => {
        item.addEventListener('dragstart', function(e) {
            draggedElement = this;
            this.classList.add('dragging');
            container.classList.add('dragging');
            
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', this.outerHTML);
        });

        item.addEventListener('dragend', function(e) {
            this.classList.remove('dragging');
            container.classList.remove('dragging');
            
            const allItems = container.querySelectorAll('.event-item');
            allItems.forEach(item => item.classList.remove('drag-over'));
            
            // Update event order after drag ends
            updateEventOrder(container);
            
            draggedElement = null;
        });

        item.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const siblings = container.querySelectorAll('.event-item');
            siblings.forEach(sibling => sibling.classList.remove('drag-over'));

            if (this !== draggedElement) {
                this.classList.add('drag-over');
            }
        });

        item.addEventListener('drop', function(e) {
            e.preventDefault();
            
            if (this !== draggedElement && draggedElement) {
                const rect = this.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                
                if (e.clientY < midpoint) {
                    container.insertBefore(draggedElement, this);
                } else {
                    container.insertBefore(draggedElement, this.nextSibling);
                }
            }
            
            this.classList.remove('drag-over');
        });
    });

    container.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });

    container.addEventListener('drop', function(e) {
        e.preventDefault();
        
        if (e.target === container && draggedElement) {
            container.appendChild(draggedElement);
        }
    });
}

function updateEventOrder(container) {
    // Get the current visual order from DOM
    const eventItems = container.querySelectorAll('.event-item');
    const newOrder = [];
    
    // Determine which context we're updating
    const firstItem = eventItems[0];
    const context = firstItem ? firstItem.getAttribute('data-context') : 'main';
    
    // Get original events based on context
    let originalEvents = [];
    if (context === 'subarc') {
        originalEvents = currentEditingSubArcEvents;
    } else {
        originalEvents = currentEditingEvents;
    }
    
    eventItems.forEach(item => {
        const originalIndex = parseInt(item.getAttribute('data-index'));
        if (originalEvents[originalIndex]) {
            newOrder.push(originalEvents[originalIndex]);
        }
    });
    
    // Update the appropriate events array
    if (context === 'subarc') {
        currentEditingSubArcEvents = newOrder;
        updateSubArcEventsListInModal(newOrder);
    } else {
        currentEditingEvents = newOrder;
        updateEventsListInModal(newOrder);
    }

    markDataAsModified();
}

// Drag and drop for sub-arcs
function initializeSubArcDragDrop(container) {
    const subArcItems = container.querySelectorAll('.subarc-item');
    let draggedElement = null;
    
    subArcItems.forEach(item => {
        item.addEventListener('dragstart', function(e) {
            draggedElement = this;
            this.classList.add('dragging');
            container.classList.add('dragging');
            
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', this.outerHTML);
        });

        item.addEventListener('dragend', function(e) {
            this.classList.remove('dragging');
            container.classList.remove('dragging');
            
            const allItems = container.querySelectorAll('.subarc-item');
            allItems.forEach(item => item.classList.remove('drag-over'));
            
            // Update subarc order after drag ends
            updateSubArcOrder(container);
            
            draggedElement = null;
        });

        item.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const siblings = container.querySelectorAll('.subarc-item');
            siblings.forEach(sibling => sibling.classList.remove('drag-over'));

            if (this !== draggedElement) {
                this.classList.add('drag-over');
            }
        });

        item.addEventListener('drop', function(e) {
            e.preventDefault();
            
            if (this !== draggedElement && draggedElement) {
                const rect = this.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                
                if (e.clientY < midpoint) {
                    container.insertBefore(draggedElement, this);
                } else {
                    container.insertBefore(draggedElement, this.nextSibling);
                }
            }
            
            this.classList.remove('drag-over');
        });
    });

    container.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });

    container.addEventListener('drop', function(e) {
        e.preventDefault();
        
        if (e.target === container && draggedElement) {
            container.appendChild(draggedElement);
        }
    });
}

function updateSubArcOrder(container) {
    // Get the current visual order from DOM
    const subArcItems = container.querySelectorAll('.subarc-item');
    const newOrder = [];
    
    subArcItems.forEach(item => {
        const originalIndex = parseInt(item.getAttribute('data-index'));
        if (currentEditingSubArcs[originalIndex]) {
            newOrder.push(currentEditingSubArcs[originalIndex]);
        }
    });
    
    // Update the sub-arcs array
    currentEditingSubArcs = newOrder;
    updateSubArcsListInModal(newOrder);
    
    markDataAsModified();
}

// Location modal functions
