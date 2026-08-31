// Plan editor controller
function migratePlanData() {
    // Ensure all existing plans have a tags field
    if (infoData.plans) {
        infoData.plans.forEach(plan => {
            if (!plan.hasOwnProperty('tags')) {
                plan.tags = []; // Initialize empty tags array
            }
        });
    }
}

function formatEventTiming(timing) {
    // Handle legacy string format
    if (typeof timing === 'string') {
        return timing;
    }
    
    // Handle new object format
    if (timing && timing.date) {
        const timeSystemId = timing.timeSystemId || 'default';
        
        const timeSystem = getTimeSystemById(timeSystemId);

        if (!timeSystem) {
            console.error('Time system not found:', timeSystemId);
            return 'Time system not loaded';
        }

        // Validate the date
        if (!validateEventDate(timing.date, timeSystem)) {
            return 'Invalid date';
        }

        // Format the start date
        let formatted = formatDateWithFormat(timing.date, timeSystem.settings.dateFormat, timeSystem);
        
        // Add start time if present
        if (timing.time) {
            const timeFormat = timeSystem.settings.timeFormat;
            let timeStr = '';
            
            if (timeFormat === '12') {
                timeStr = ` ${timing.time.hour}`;
                // Only add minutes if explicitly set
                if (timing.time.minute !== undefined && timing.time.minute !== null) {
                    timeStr += `:${String(timing.time.minute).padStart(2, '0')}`;
                }
                timeStr += ` ${timing.time.period}`;
            } else if (timeFormat === '24') {
                timeStr = ` ${String(timing.time.hour).padStart(2, '0')}`;
                // Only add minutes if explicitly set
                if (timing.time.minute !== undefined && timing.time.minute !== null) {
                    timeStr += `:${String(timing.time.minute).padStart(2, '0')}`;
                }
            } else if (timeFormat === 'custom') {
                const divName = timeSystem.timeDivisions.useDivisionNames && timeSystem.timeDivisions.divisionNames?.[timing.time.division]
                    ? timeSystem.timeDivisions.divisionNames[timing.time.division]
                    : `Division ${timing.time.division + 1}`;
                timeStr = `, ${divName}`;
                // Only add subdivision if explicitly set
                if (timing.time.subdivision !== undefined && timing.time.subdivision !== null) {
                    const subdivisionName = timeSystem.timeDivisions.subdivisionName || 'subdivision';
                    timeStr += ` ${timing.time.subdivision} ${subdivisionName}`;
                }
            }
            
            formatted += timeStr;
        }

        // Add end time if present
        if (timing.endTime) {
            const timeFormat = timeSystem.settings.timeFormat;
            let endTimeStr = '';
            
            if (timeFormat === '12') {
                endTimeStr = ` ${timing.endTime.hour}`;
                // Only add minutes if explicitly set
                if (timing.endTime.minute !== undefined && timing.endTime.minute !== null) {
                    endTimeStr += `:${String(timing.endTime.minute).padStart(2, '0')}`;
                }
                endTimeStr += ` ${timing.endTime.period}`;
            } else if (timeFormat === '24') {
                endTimeStr = ` ${String(timing.endTime.hour).padStart(2, '0')}`;
                // Only add minutes if explicitly set
                if (timing.endTime.minute !== undefined && timing.endTime.minute !== null) {
                    endTimeStr += `:${String(timing.endTime.minute).padStart(2, '0')}`;
                }
            } else if (timeFormat === 'custom') {
                const divName = timeSystem.timeDivisions.useDivisionNames && timeSystem.timeDivisions.divisionNames?.[timing.endTime.division]
                    ? timeSystem.timeDivisions.divisionNames[timing.endTime.division]
                    : `Division ${timing.endTime.division + 1}`;
                endTimeStr = `, ${divName}`;
                // Only add subdivision if explicitly set
                if (timing.endTime.subdivision !== undefined && timing.endTime.subdivision !== null) {
                    const subdivisionName = timeSystem.timeDivisions.subdivisionName || 'subdivision';
                    endTimeStr += ` ${timing.endTime.subdivision} ${subdivisionName}`;
                }
            }
            
            endFormatted += endTimeStr;
        }
        
        return formatted;
    }
    
    return '';
}

//MOVED from form-handlers
function openPlanModal(planData = null) {
    const modalTitle = document.getElementById('plan-modal-title');
    
    if (planData) {
        modalTitle.textContent = 'Edit Story Arc';
        // Create working copies for editing
        currentEditingEvents = planData.events ? JSON.parse(JSON.stringify(planData.events)) : [];
        currentEditingSubArcs = planData.subArcs ? JSON.parse(JSON.stringify(planData.subArcs)) : [];
        document.getElementById('plan-color').value = '#3498db';
        document.getElementById('plan-color-picker').value = '#3498db';
        document.getElementById('plan-type').value = '';
        populatePlanModal(planData);
    } else {
        modalTitle.textContent = 'Add Story Arc';
        currentEditingEvents = []; // Start with empty events for new arc
        currentEditingSubArcs = []; // Start with empty sub-arcs
        clearModalFields('planModal');
    }
    
    openModal('planModal');
    
    // Set up character tag autocomplete
    setupCharacterTagAutocomplete();
    setupPlanColorInputs();
}

function populatePlanModal(plan) {
    document.getElementById('plan-title').value = plan.title || '';
    document.getElementById('plan-overview').value = plan.overview || '';
    document.getElementById('plan-character-tags').value = (plan.characterTags || []).join(', ');
    document.getElementById('plan-filter-tags').value = (plan.tags || []).join(', ');
    document.getElementById('plan-color').value = plan.color || '#3498db';
    document.getElementById('plan-type').value = plan.type || '';
    
    const colorPicker = document.getElementById('plan-color-picker');
    if (colorPicker) {
        colorPicker.value = plan.color || '#3498db';
    }

    // Create working copies for editing
    currentEditingEvents = plan.events ? JSON.parse(JSON.stringify(plan.events)) : [];
    currentEditingSubArcs = plan.subArcs ? JSON.parse(JSON.stringify(plan.subArcs)) : [];
    
    updateEventsListInModal(currentEditingEvents);
    updateSubArcsListInModal(currentEditingSubArcs);
}

// Save plan with auto-collected character tags
function savePlan() {
    // Collect character tags from all events (main + sub-arc events)
    const autoCollectedTags = collectCharacterTagsFromEvents(currentEditingEvents, currentEditingSubArcs);
    
    // Get manually entered character tags
    const manualCharacterTags = document.getElementById('plan-character-tags').value
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag);
    
    // Combine and deduplicate character tags
    const allCharacterTags = [...new Set([...manualCharacterTags, ...autoCollectedTags])];
    
    // Get filter tags (separate from character tags)
    const filterTags = document.getElementById('plan-filter-tags').value
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag);
    
    const planData = {
        title: document.getElementById('plan-title').value.trim(),
        overview: document.getElementById('plan-overview').value.trim(),
        characterTags: allCharacterTags, // Keep existing character tags
        tags: filterTags, // Add filter tags field
        color: document.getElementById('plan-color').value.trim() || '#3498db',
        type: document.getElementById('plan-type').value.trim() || '',
        events: [...currentEditingEvents],
        subArcs: [...currentEditingSubArcs]
    };

    // Validation
    if (!planData.title) {
        window.notifyLoreUser('Arc title is required!');
        return;
    }

    if (editingIndex >= 0 && editingType === 'plan') {
        infoData.plans[editingIndex] = planData;
    } else {
        infoData.plans.push(planData);
    }

    updateContentList('plans');
    closeModal('planModal');
    markDataAsModified();
}

function setupPlanColorInputs() {
    const colorText = document.getElementById('plan-color');
    const colorPicker = document.getElementById('plan-color-picker');
    
    if (colorText && colorPicker) {
        // Sync picker to text input
        colorText.addEventListener('input', () => {
            const color = colorText.value.trim();
            if (isValidHexColor(color)) {
                colorPicker.value = color;
            }
        });
        
        // Sync text input to picker
        colorPicker.addEventListener('input', () => {
            colorText.value = colorPicker.value;
        });
    }
}

function setupSubArcColorInputs() {
    const colorText = document.getElementById('subarc-color');
    const colorPicker = document.getElementById('subarc-color-picker');
    
    if (colorText && colorPicker) {
        // Sync picker to text input
        colorText.addEventListener('input', () => {
            const color = colorText.value.trim();
            if (isValidHexColor(color)) {
                colorPicker.value = color;
            }
        });
        
        // Sync text input to picker
        colorPicker.addEventListener('input', () => {
            colorText.value = colorPicker.value;
        });
    }
}

// Handle yearly checkbox toggle to show/hide duration controls
function setupYearlyControls() {
    const yearlyCheckbox = document.getElementById('event-yearly');
    const yearlyControls = document.getElementById('yearly-controls');
    const durationInput = document.getElementById('event-yearly-duration');
    const perennialCheckbox = document.getElementById('event-yearly-perennial');
    
    if (yearlyCheckbox) {
        yearlyCheckbox.addEventListener('change', function() {
            if (this.checked) {
                yearlyControls.style.display = 'flex';
            } else {
                yearlyControls.style.display = 'none';
                durationInput.value = '';
                perennialCheckbox.checked = false;
            }
        });
    }
    
    if (perennialCheckbox) {
        perennialCheckbox.addEventListener('change', function() {
            durationInput.disabled = this.checked;
            if (this.checked) {
                durationInput.value = '';
            }
        });
    }
}

// Functions for managing sub-arcs
function addSubArc() {
    editingSubArcIndex = -1; // Reset sub-arc editing index
    openSubArcModal();
}

function editSubArc(subArcIndex) {
    if (subArcIndex >= 0 && subArcIndex < currentEditingSubArcs.length) {
        openSubArcModal(currentEditingSubArcs[subArcIndex], subArcIndex);
    }
}

function deleteSubArc(subArcIndex) {
    if (subArcIndex >= 0 && subArcIndex < currentEditingSubArcs.length) {
        const subArcTitle = currentEditingSubArcs[subArcIndex].title || 'Untitled Sub-Arc';
        if (confirm(`Are you sure you want to delete the sub-arc "${subArcTitle}" and all its events?`)) {
            currentEditingSubArcs.splice(subArcIndex, 1);
            updateSubArcsListInModal(currentEditingSubArcs);
            markDataAsModified();
        }
    }
}

// Sub-Arc modal functions
function openSubArcModal(subArcData = null, subArcIndex = -1) {
    const modalTitle = document.getElementById('subarc-modal-title');
    
    if (subArcData) {
        modalTitle.textContent = 'Edit Sub-Arc';
        // Create working copy of events for editing
        currentEditingSubArcEvents = subArcData.events ? 
            JSON.parse(JSON.stringify(subArcData.events)) : [];
        populateSubArcModal(subArcData);
    } else {
        modalTitle.textContent = 'Add Sub-Arc';
        // Start with empty events for new sub-arc
        currentEditingSubArcEvents = [];
        clearModalFields('subArcModal');
        // Set default color for new sub-arcs
        document.getElementById('subarc-color').value = '#e74c3c';
        document.getElementById('subarc-color-picker').value = '#e74c3c';
        document.getElementById('subarc-type').value = '';
    }
    
    editingSubArcIndex = subArcIndex;
    openModal('subArcModal');
    
    // Set up character tag autocomplete for sub-arc
    setupSubArcCharacterTagAutocomplete();
    // Set up color input synchronization
    setupSubArcColorInputs();
}

// Save sub-arc with auto-collected character tags
function saveSubArc() {
    // Collect character tags from sub-arc events
    const autoCollectedTags = collectCharacterTagsFromSubArcEvents(currentEditingSubArcEvents);
    
    // Get manually entered tags
    const manualTags = document.getElementById('subarc-character-tags').value
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag);
    
    // Combine and deduplicate
    const allTags = [...new Set([...manualTags, ...autoCollectedTags])];
    
    const subArcData = {
        title: document.getElementById('subarc-title').value.trim(),
        description: document.getElementById('subarc-description').value.trim(),
        characterTags: allTags, // Use combined tags
        color: document.getElementById('subarc-color').value.trim(),
        type: document.getElementById('subarc-type').value.trim(),
        visible: document.getElementById('subarc-visible').checked,
        events: [...currentEditingSubArcEvents]
    };

    // Validation
    if (!subArcData.title) {
        window.notifyLoreUser('Sub-arc title is required!');
        return;
    }

    if (editingSubArcIndex >= 0) {
        currentEditingSubArcs[editingSubArcIndex] = subArcData;
    } else {
        currentEditingSubArcs.push(subArcData);
    }

    updateSubArcsListInModal(currentEditingSubArcs);
    closeModal('subArcModal');
    markDataAsModified();
    
    // Show a message if tags were auto-collected
    if (autoCollectedTags.length > 0) {
    }
}

// Add event to currently editing sub-arc
function addEventToSubArc() {
    editingEventIndex = -1;
    editingEventContext = 'subarc';
    openEventModal(null, -1, 'subarc');
}

function updateEventsListInModal(events) {
    const container = document.getElementById('events-list-container');
    if (!container) return;
    
    if (!events || events.length === 0) {
        container.innerHTML = '<div class="empty-state">No main events added yet</div>';
        return;
    }
    
    container.innerHTML = '';
    events.forEach((event, index) => {
        const eventElement = createEventElement(event, index, 'main');
        container.appendChild(eventElement);
    });
    
    // Add drag and drop functionality
    initializeEventDragDrop(container);
}

// Update sub-arcs list in modal
function updateSubArcsListInModal(subArcs) {
    const container = document.getElementById('subarcs-list-container');
    if (!container) return;
    
    if (!subArcs || subArcs.length === 0) {
        container.innerHTML = '<div class="empty-state">No sub-arcs added yet</div>';
        return;
    }
    
    container.innerHTML = '';
    subArcs.forEach((subArc, index) => {
        const subArcElement = createSubArcElement(subArc, index);
        container.appendChild(subArcElement);
    });

    // Add drag and drop functionality
    initializeSubArcDragDrop(container);
}

// Functions for managing events within plans (now with context support)
function addEventToPlan(context = 'main') {
    editingEventIndex = -1; // Reset event editing index
    editingEventContext = context; // Set context
    openEventModal(null, -1, context);
}

function editEventInPlan(eventIndex, context = 'main') {
    editingEventContext = context; // Set context
    
    if (context === 'subarc') {
        // Editing an event within the currently selected sub-arc
        if (eventIndex >= 0 && eventIndex < currentEditingSubArcEvents.length) {
            openEventModal(currentEditingSubArcEvents[eventIndex], eventIndex, context);
        }
    } else {
        // Editing a main event
        if (eventIndex >= 0 && eventIndex < currentEditingEvents.length) {
            openEventModal(currentEditingEvents[eventIndex], eventIndex, context);
        }
    }
}

function deleteEventFromPlan(eventIndex, context = 'main') {
    if (context === 'subarc') {
        // Deleting an event from a sub-arc
        if (eventIndex >= 0 && eventIndex < currentEditingSubArcEvents.length) {
            currentEditingSubArcEvents.splice(eventIndex, 1);
            updateSubArcEventsListInModal(currentEditingSubArcEvents);
            markDataAsModified();
        }
    } else {
        // Deleting a main event
        if (eventIndex >= 0 && eventIndex < currentEditingEvents.length) {
            currentEditingEvents.splice(eventIndex, 1);
            updateEventsListInModal(currentEditingEvents);
            markDataAsModified();
        }
    }
}

//
// Toggle subevents section visibility
function toggleSubeventsSection() {
    const container = document.getElementById('subevents-container');
    const arrow = document.getElementById('subevents-arrow');
    
    if (container && arrow) {
        if (container.classList.contains('collapsed')) {
            container.classList.remove('collapsed');
            arrow.innerHTML = '&#9660;';
        } else {
            container.classList.add('collapsed');
            arrow.innerHTML = '&#9654;';
        }
    }
}

// Update subevent count display
function updateSubeventCount() {
    const countElement = document.getElementById('subevents-count');
    if (countElement) {
        const count = currentEditingSubevents.length;
        countElement.textContent = count > 0 ? `(${count})` : '(0)';
    }
}

// Display subevents in the event modal list
function updateSubeventsDisplay() {
    const container = document.getElementById('subevents-list');
    if (!container) return;
    
    if (currentEditingSubevents.length === 0) {
        container.innerHTML = '<div class="empty-state">No character moments added yet</div>';
        updateSubeventCount();
        return;
    }
    
    container.innerHTML = '';
    currentEditingSubevents.forEach((subevent, index) => {
        const subeventElement = createSubeventElement(subevent, index);
        container.appendChild(subeventElement);
    });
    
    updateSubeventCount();
}

// Create a subevent element (styled like content items)
// Create a subevent element (styled like content items)
function createSubeventElement(subevent, index) {
    const element = document.createElement('div');
    element.className = 'subevent-item';
    element.draggable = true;
    
    const characterTags = subevent.characterTags && subevent.characterTags.length > 0
        ? subevent.characterTags.map(tag => `<span class="character-tag small">${tag}</span>`).join(' ')
        : '<span class="no-tags">No characters</span>';
    
    element.innerHTML = `
        <div class="subevent-content">
            <div class="subevent-description">${subevent.description || 'Untitled moment'}</div>
            <div class="subevent-tags">${characterTags}</div>
        </div>
        <div class="subevent-actions">
            <button class="btn-edit" onclick="editSubevent(${index})" title="Edit">Edit</button>
            <button class="btn-delete" onclick="deleteSubevent(${index})" title="Delete">Delete</button>
        </div>
    `;
    
    return element;
}

// Open subevent modal for adding/editing
function openSubeventModal(subeventIndex = -1) {
    const modalTitle = document.getElementById('subevent-modal-title');
    
    if (subeventIndex >= 0) {
        modalTitle.textContent = 'Edit Character Moment';
        const subevent = currentEditingSubevents[subeventIndex];
        populateSubeventModal(subevent);
        editingSubeventIndex = subeventIndex;
    } else {
        modalTitle.textContent = 'Add Character Moment';
        clearSubeventModalFields();
        editingSubeventIndex = -1;
    }
    
    openModal('subeventModal');
}

// Populate subevent modal with data
function populateSubeventModal(subevent) {
    document.getElementById('subevent-description').value = subevent.description || '';
    document.getElementById('subevent-character-tags').value = (subevent.characterTags || []).join(', ');
}

// Clear subevent modal fields
function clearSubeventModalFields() {
    document.getElementById('subevent-description').value = '';
    document.getElementById('subevent-character-tags').value = '';
}

// Save subevent
function saveSubevent() {
    const characterTagsInput = document.getElementById('subevent-character-tags').value.trim();
    const characterTags = characterTagsInput 
        ? characterTagsInput.split(',').map(tag => tag.trim()).filter(tag => tag)
        : [];
    
    const subeventData = {
        description: document.getElementById('subevent-description').value.trim(),
        characterTags: characterTags
    };
    
    // Validation
    if (!subeventData.description) {
        window.notifyLoreUser('Description is required!');
        return;
    }
    
    if (editingSubeventIndex >= 0) {
        // Editing existing subevent
        currentEditingSubevents[editingSubeventIndex] = subeventData;
    } else {
        // Adding new subevent
        currentEditingSubevents.push(subeventData);
    }
    
    updateSubeventsDisplay();
    closeModal('subeventModal');
}

// Edit subevent
function editSubevent(index) {
    openSubeventModal(index);
}

// Delete subevent
function deleteSubevent(index) {
    const subevent = currentEditingSubevents[index];
    if (confirm(`Delete character moment: "${subevent.description}"?`)) {
        currentEditingSubevents.splice(index, 1);
        updateSubeventsDisplay();
    }
}

// Event listener setup for subevent functionality
function initializePlanEditorListeners() {
    // Add subevent button
    const addSubeventBtn = document.getElementById('add-subevent-btn');
    if (addSubeventBtn) {
        addSubeventBtn.addEventListener('click', () => openSubeventModal());
    }
    
    // Save subevent button
    const saveSubeventBtn = document.getElementById('save-subevent');
    if (saveSubeventBtn) {
        saveSubeventBtn.addEventListener('click', saveSubevent);
    }

    setupYearlyControls();
}

window.initializePlanEditorListeners = initializePlanEditorListeners;

// Update populateEventModal function to include subevents
function populateEventModal(event) {
    document.getElementById('event-title').value = event.title || '';
    document.getElementById('event-type').value = event.type || 'none';
    document.getElementById('event-character-tags').value = (event.characterTags || []).join(', ');
    // Handle timing (with backward compatibility)
    if (event.timing) {
        if (typeof event.timing === 'string') {
            // Legacy string format
            eventEditingDate = null;
            eventEditingTime = null;
            eventEditingEndDate = null;
            eventEditingEndTime = null;
            document.getElementById('selected-event-date-display').textContent = event.timing;
            document.getElementById('selected-event-date-display').style.color = 'var(--warning)';
        } else if (typeof event.timing === 'object' && event.timing.date) {
            // New structured format
            eventEditingDate = { ...event.timing.date };
            eventEditingTime = event.timing.time ? { ...event.timing.time } : null;
            eventEditingEndDate = event.timing.endDate ? { ...event.timing.endDate } : null;
            eventEditingEndTime = event.timing.endTime ? { ...event.timing.endTime } : null;
            
            updateEventDateDisplay();
        }
    } else {
        eventEditingDate = null;
        eventEditingTime = null;
        eventEditingEndDate = null;
        eventEditingEndTime = null;
        updateEventDateDisplay();
    }
    document.getElementById('event-notes').value = event.notes || '';
    
    // Set selected storylines in custom dropdown
    const storylineLinks = event.storylineLinks || [];
    selectedStorylines = [...storylineLinks];
    updateStorylineDisplay();
    updateStorylineOptions();
    
    document.getElementById('event-image').value = event.image || '';
    document.getElementById('event-background').value = event.background || ''; 
    document.getElementById('event-visible').checked = event.visible !== false;
    document.getElementById('event-yearly').checked = event.yearly === true;

    if (event.yearly) {
        document.getElementById('yearly-controls').style.display = 'flex';
        document.getElementById('event-yearly-duration').value = event.yearlyDuration || '';
        document.getElementById('event-yearly-perennial').checked = event.yearlyPerennial === true;
        document.getElementById('event-yearly-duration').disabled = event.yearlyPerennial === true;
    } else {
        document.getElementById('yearly-controls').style.display = 'none';
    }
    
    // IMPORTANT: Load subevents/character moments properly
    currentEditingSubevents = event.subevents ? JSON.parse(JSON.stringify(event.subevents)) : [];
    editingSubeventIndex = -1; // Reset subevent editing index
    
    if (typeof updateSubeventsDisplay === 'function') {
        updateSubeventsDisplay();
        
        // Collapse subevents section by default
        const subeventsContainer = document.getElementById('subevents-container');
        const subeventsArrow = document.getElementById('subevents-arrow');
        if (subeventsContainer && subeventsArrow) {
            subeventsContainer.classList.add('collapsed');
            subeventsArrow.innerHTML = '&#9654;'
        }
    }
}

// Update saveEvent function to include subevents
function saveEvent() {
    console.log('=== SAVE EVENT DEBUG ===');
    console.log('Current editing context:', editingEventContext);
    console.log('Current editing subevents:', currentEditingSubevents);
    console.log('Event index:', editingEventIndex);
    
    const characterTagsInput = document.getElementById('event-character-tags').value.trim();
    const characterTags = characterTagsInput 
        ? characterTagsInput.split(',').map(tag => tag.trim()).filter(tag => tag)
        : [];
    
    const eventData = {
        title: document.getElementById('event-title').value.trim(),
        type: document.getElementById('event-type').value,
        characterTags: characterTags,
        timing: eventEditingDate ? {
            date: { ...eventEditingDate },
            endDate: eventEditingEndDate ? { ...eventEditingEndDate } : null,
            time: eventEditingTime ? { ...eventEditingTime } : null,
            endTime: eventEditingEndTime ? { ...eventEditingEndTime } : null,
            timeSystemId: infoData.plansOptions?.selectedTimeSystemId || 'default'
        } : null,
        timingLegacy: null, // For backward compatibility migration
        notes: document.getElementById('event-notes').value.trim(),
        storylineLinks: selectedStorylines.slice(),
        image: document.getElementById('event-image').value.trim(),
        background: document.getElementById('event-background').value.trim(),
        visible: document.getElementById('event-visible').checked,
        subevents: currentEditingSubevents ? JSON.parse(JSON.stringify(currentEditingSubevents)) : [],
        yearly: document.getElementById('event-yearly').checked,
        yearlyDuration: document.getElementById('event-yearly').checked ? 
            (parseInt(document.getElementById('event-yearly-duration').value) || null) : null,
        yearlyPerennial: document.getElementById('event-yearly').checked ? 
            document.getElementById('event-yearly-perennial').checked : false
    };
        
    // Validation
    if (!eventData.title) {
        window.notifyLoreUser('Event title is required!');
        return;
    }
    
    // Save based on context (main arc vs sub-arc)
    if (editingEventContext === 'main') {
        if (editingEventIndex >= 0) {
            currentEditingEvents[editingEventIndex] = eventData;
        } else {
            currentEditingEvents.push(eventData);
        }
        updateEventsListInModal(currentEditingEvents);
    } else if (editingEventContext === 'subarc') {
        if (editingEventIndex >= 0) {
            currentEditingSubArcEvents[editingEventIndex] = eventData;
        } else {
            currentEditingSubArcEvents.push(eventData);
        }
        updateSubArcEventsListInModal(currentEditingSubArcEvents);
    }
    
    closeModal('eventModal');
    markDataAsModified();
}

// Function to collect character tags from all events in an arc
function collectCharacterTagsFromEvents(events, subArcs = []) {
    const allTags = new Set();
    
    // Collect from main events
    if (events && Array.isArray(events)) {
        events.forEach(event => {
            if (event.characterTags && Array.isArray(event.characterTags)) {
                event.characterTags.forEach(tag => allTags.add(tag));
            }
        });
    }
    
    // Collect from sub-arc events
    if (subArcs && Array.isArray(subArcs)) {
        subArcs.forEach(subArc => {
            if (subArc.events && Array.isArray(subArc.events)) {
                subArc.events.forEach(event => {
                    if (event.characterTags && Array.isArray(event.characterTags)) {
                        event.characterTags.forEach(tag => allTags.add(tag));
                    }
                });
            }
        });
    }
    
    return Array.from(allTags);
}

// Function to collect character tags from sub-arc events
function collectCharacterTagsFromSubArcEvents(events) {
    const allTags = new Set();
    
    if (events && Array.isArray(events)) {
        events.forEach(event => {
            if (event.characterTags && Array.isArray(event.characterTags)) {
                event.characterTags.forEach(tag => allTags.add(tag));
            }
        });
    }
    
    return Array.from(allTags);
}



function populateSubArcModal(subArc) {
    document.getElementById('subarc-title').value = subArc.title || '';
    document.getElementById('subarc-description').value = subArc.description || '';
    document.getElementById('subarc-character-tags').value = (subArc.characterTags || []).join(', ');
    document.getElementById('subarc-color').value = subArc.color || '#e74c3c';
    document.getElementById('subarc-color-picker').value = subArc.color || '#e74c3c';
    document.getElementById('subarc-type').value = subArc.type || '';
    document.getElementById('subarc-visible').checked = subArc.visible !== false;
    
    // Populate sub-arc events list using working copy
    updateSubArcEventsListInModal(currentEditingSubArcEvents);
}

function setupSubArcCharacterTagAutocomplete() {
    const input = document.getElementById('subarc-character-tags');
    if (!input) return;
    
    // Get all character names for autocomplete
    const characterNames = infoData.characters.map(char => char.name).filter(name => name);
    
    // Simple autocomplete implementation
    input.addEventListener('input', function(e) {
        const value = e.target.value;
        const lastComma = value.lastIndexOf(',');
        
        if (lastComma > -1) {
            const currentTag = value.substring(lastComma + 1).trim();
            // Add autocomplete suggestions logic here if needed
        }
    });
}

function updateSubArcEventsListInModal(events) {
    const container = document.getElementById('subarc-events-list-container');
    if (!container) return;
    
    if (!events || events.length === 0) {
        container.innerHTML = '<div class="empty-state">No events added yet</div>';
        return;
    }
    
    container.innerHTML = '';
    events.forEach((event, index) => {
        const eventElement = createEventElement(event, index, 'subarc');
        container.appendChild(eventElement);
    });
    
    // Add drag and drop functionality
    initializeEventDragDrop(container);
}

function setupCharacterTagAutocomplete() {
    const input = document.getElementById('plan-character-tags');
    if (!input) return;
    
    // Get all character names for autocomplete
    const characterNames = infoData.characters.map(char => char.name).filter(name => name);
    
    // Simple autocomplete implementation
    input.addEventListener('input', function(e) {
        // Could implement more sophisticated autocomplete here
        // For now, just basic functionality
        const value = e.target.value;
        const lastComma = value.lastIndexOf(',');
        
        if (lastComma > -1) {
            const currentTag = value.substring(lastComma + 1).trim();
            // Add autocomplete suggestions logic here if needed
        }
    });
}

// Create sub-arc element for display in plan modal
function createSubArcElement(subArc, index) {
    const subArcDiv = document.createElement('div');
    subArcDiv.className = 'subarc-item';
    subArcDiv.draggable = true;
    subArcDiv.setAttribute('data-index', index);
    
    const visibilityBadge = subArc.visible === false ? '<span class="hidden-badge">Hidden</span>' : '';
    const characterTags = subArc.characterTags && subArc.characterTags.length > 0 
        ? subArc.characterTags.join(', ') 
        : 'No characters tagged';
    const eventCount = subArc.events ? subArc.events.length : 0;
    const visibleEventCount = subArc.events ? subArc.events.filter(e => e.visible !== false).length : 0;
    
    subArcDiv.innerHTML = `
        <div class="subarc-content">
            <div class="subarc-header">
                <div class="subarc-title">${subArc.title || 'Untitled Sub-Arc'}</div>
                ${visibilityBadge}
            </div>
            <div class="subarc-description">${subArc.description || 'No description'}</div>
            <div class="subarc-meta">
                <div class="subarc-characters">Characters: ${characterTags}</div>
                <div class="subarc-event-count">Events: ${visibleEventCount}/${eventCount}</div>
            </div>
        </div>
        <div class="subarc-actions">
            <button type="button" class="btn-small btn-edit" onclick="editSubArc(${index})">Edit</button>
            <button type="button" class="btn-small btn-delete" onclick="deleteSubArc(${index})">Delete</button>
        </div>
    `;
    
    if (subArc.visible === false) {
        subArcDiv.classList.add('hidden-item');
    }
    
    return subArcDiv;
}

// Create event element with character tags display
// createEventElement function with improved layout
function createEventElement(event, index, context = 'main') {
    const eventDiv = document.createElement('div');
    eventDiv.className = 'event-item';
    eventDiv.draggable = true;
    eventDiv.setAttribute('data-index', index);
    eventDiv.setAttribute('data-context', context);
    
    // Get event type badge color based on current appearance
    const colors = (typeof getColorScheme === 'function') ? 
        getColorScheme() : {};
    let typeColor = colors.textSecondary || '#6c757d';
    
    switch (event.type) {
        case 'none':
            typeColor = colors.textMuted || '#696764';
            break;
        case 'exposition':
            typeColor = colors.physical || '#4D96E4';
        case 'rising':
            typeColor = colors.statusCanon || '#28a745';
            break;
        case 'setback':
            typeColor = colors.statusIdea || '#dc3545';
            break;
        case 'climax':
            typeColor = colors.statusDraft || '#ffc107';
        case 'resolution':
            typeColor = colors.hobbies || '#075AFF';
            break;
    }
    
    const visibilityBadge = event.visible === false ? '<span class="hidden-badge">Hidden</span>' : '';
    
    // Character tags display with better alignment
    const characterTags = event.characterTags && event.characterTags.length > 0 
        ? event.characterTags.map(tag => `<span class="character-tag-small">${tag}</span>`).join(' ')
        : '';
    const characterTagsDisplay = characterTags ? `<div class="event-character-tags"><span class="characters-label">Characters:</span> ${characterTags}</div>` : '';
    
    eventDiv.innerHTML = `
        <div class="event-content">
            <div class="event-header">
                <div class="event-type-badge" style="background-color: ${typeColor}">
                    ${getEventTypeDisplay(event.type)}
                </div>
                <div class="event-title">${event.title || 'Untitled Event'}</div>
                ${visibilityBadge}
            </div>
            ${characterTagsDisplay}
            <div class="event-bottom-info">
                ${event.timing ? `<span class="event-timing-badge">${formatEventTiming(event.timing)}</span>` : ''}
                ${event.notes ? `<div class="event-notes-preview">Has notes</div>` : ''}
            </div>
        </div>
        <div class="event-actions">
            <button type="button" class="btn-small btn-edit" onclick="editEventInPlan(${index}, '${context}')">Edit</button>
            <button type="button" class="btn-small btn-delete" onclick="deleteEventFromPlan(${index}, '${context}')">Delete</button>
        </div>
    `;
    
    if (event.visible === false) {
        eventDiv.classList.add('hidden-item');
    }
    
    return eventDiv;
}

function getEventTypeDisplay(type) {
    const typeMap = {
        'none': 'None',
        'exposition': 'Exposition',
        'rising': 'Rising',
        'setback': 'Setback',
        'climax': 'Climax',
        'resolution': 'Resolution'
    };
    return typeMap[type] || 'Rising';
}

// Setup character tag autocomplete for events
function setupEventCharacterTagAutocomplete() {
    const input = document.getElementById('event-character-tags');
    if (!input) return;
    
    // Get all character names for autocomplete
    const characterNames = infoData.characters.map(char => char.name).filter(name => name);
    
    // Simple autocomplete implementation
    input.addEventListener('input', function(e) {
        const value = e.target.value;
        const lastComma = value.lastIndexOf(',');
        
        if (lastComma > -1) {
            const currentTag = value.substring(lastComma + 1).trim();
            // Add autocomplete suggestions logic here if needed
        }
    });
}

// Event modal functions with character tags support
function openEventModal(eventData = null, eventIndex = -1, context = 'main') {
    const modalTitle = document.getElementById('event-modal-title');
    
    editingEventIndex = eventIndex;
    editingEventContext = context;
    
    // Set up the dropdown first
    setupStorylineDropdown();
    
    if (eventData) {
        modalTitle.textContent = 'Edit Event';
        populateEventModal(eventData);
    } else {
        modalTitle.textContent = 'Add Event';
        clearModalFields('eventModal');
        // Reset date/time
        eventEditingDate = null;
        eventEditingTime = null;
        updateEventDateDisplay();
        // IMPORTANT: Reset character moments for new events
        currentEditingSubevents = [];
        editingSubeventIndex = -1;
        // Reset for new events
        selectedStorylines = [];
        updateStorylineDisplay();
        
        document.getElementById('event-yearly').checked = false;
        document.getElementById('yearly-controls').style.display = 'none';
        document.getElementById('event-yearly-duration').value = '';
        document.getElementById('event-yearly-perennial').checked = false;
        
        // Clear the subevents display
        if (typeof updateSubeventsDisplay === 'function') {
            updateSubeventsDisplay();
        }
    }
    
    openModal('eventModal');
    setupEventCharacterTagAutocomplete();
}

// Custom storyline dropdown functions
let selectedStorylines = [];

function toggleStorylineDropdown() {
    const options = document.getElementById('event-storyline-options');
    const isVisible = options.style.display !== 'none';
    options.style.display = isVisible ? 'none' : 'block';
}

function toggleStorylineOption(storylineTitle) {
    const index = selectedStorylines.indexOf(storylineTitle);
    
    if (index > -1) {
        // Remove if already selected
        selectedStorylines.splice(index, 1);
    } else {
        // Add if not selected
        selectedStorylines.push(storylineTitle);
    }
    
    updateStorylineDisplay();
    updateStorylineOptions();
}

function updateStorylineDisplay() {
    const textSpan = document.getElementById('storyline-selected-text');
    if (selectedStorylines.length === 0) {
        textSpan.textContent = 'Click to select storylines...';
    } else if (selectedStorylines.length === 1) {
        textSpan.textContent = selectedStorylines[0];
    } else {
        textSpan.textContent = `${selectedStorylines.length} storylines selected`;
    }
}

function updateStorylineOptions() {
    const options = document.querySelectorAll('.storyline-option');
    options.forEach(option => {
        const title = option.textContent;
        if (selectedStorylines.includes(title)) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
}

// Setup custom storyline dropdown in event modal
function setupStorylineDropdown() {
    const container = document.getElementById('event-storyline-options');
    if (!container) return;
    
    container.innerHTML = '';
    selectedStorylines = []; // Reset selections
    
    if (!infoData.storylines || infoData.storylines.length === 0) {
        container.innerHTML = '<div style="padding: 8px; color: #666; font-style: italic;">No storylines available</div>';
        return;
    }
    
    infoData.storylines.forEach((storyline) => {
        const option = document.createElement('div');
        option.className = 'storyline-option';
        option.textContent = storyline.title;
        option.onclick = () => toggleStorylineOption(storyline.title);
        container.appendChild(option);
    });
    
    updateStorylineDisplay();
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const container = document.getElementById('event-storyline-container');
        if (container && !container.contains(e.target)) {
            document.getElementById('event-storyline-options').style.display = 'none';
        }
    });
}

// Generate the existing cards view
// Generate the existing cards view

async function openEventDatePicker(selectingEndDate = false) {
    await window.LoreFeatureLifecycle?.ensureFeature('timeSystems');
    const selectedTimeSystemId = infoData.plansOptions?.selectedTimeSystemId || 'default';
    const timeSystem = getTimeSystemById(selectedTimeSystemId);
    
    if (!timeSystem) {
        window.notifyLoreUser('Please select a valid time system in Plans Options.');
        return;
    }
    
    // If selecting end date but no start date, don't allow
    if (selectingEndDate && !eventEditingDate) {
        window.notifyLoreUser('Please select a start date first.');
        return;
    }
    
    isSelectingEndDate = selectingEndDate;
    
    // Set up mini-calendar for event date selection
    miniCalEditingEraIndex = 'event-date';
    currentEditingCalendar = timeSystem;
    
    // Initialize with current date or default to first era start
    const currentDate = selectingEndDate ? eventEditingEndDate : eventEditingDate;
    
    if (currentDate && validateEventDate(currentDate, timeSystem)) {
        miniCalCurrentMonth = currentDate.month;
        miniCalCurrentYear = currentDate.year;
        miniCalSelectedDate = { ...currentDate };
    } else {
        // Default to first era start (or start date if selecting end date)
        const defaultDate = selectingEndDate && eventEditingDate ? eventEditingDate : timeSystem.eras[0].startDate;
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

    // Set up era selector ONLY for event date picking (not for Time Systems Editor)
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

    // Only set up time controls if NOT hidden
    const timeSection = document.getElementById('mini-cal-time-section');
    if (timeSection) {
        // Always show time section for both start and end dates
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
        for (let i = (timeFormat === '12' ? 1 : 0); i < (timeFormat === '12' ? 13 : 24); i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = timeFormat === '12' ? `${i} ${i < 12 ? 'AM' : 'PM'}` : `${String(i).padStart(2, '0')}:00`;
            timeDivisionSelect.appendChild(option);
        }
        subdivisionInput.placeholder = 'Minutes';
        subdivisionInput.max = 59;
        subdivisionLabel.textContent = 'minutes';
    } else if (timeFormat === 'custom') {
        // Custom time divisions
        const divisionCount = timeSystem.timeDivisions.divisionsPerDay;
        for (let i = 0; i < divisionCount; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = timeSystem.timeDivisions.useDivisionNames && timeSystem.timeDivisions.divisionNames?.[i]
                ? timeSystem.timeDivisions.divisionNames[i]
                : `Division ${i + 1}`;
            timeDivisionSelect.appendChild(option);
        }
        subdivisionInput.placeholder = timeSystem.timeDivisions.subdivisionName || 'Subdivision';
        subdivisionInput.max = timeSystem.timeDivisions.subdivisionsPerDivision - 1;
        subdivisionLabel.textContent = timeSystem.timeDivisions.subdivisionName || 'subdivisions';
    }

    // Enable subdivision input when a time division is selected
    timeDivisionSelect.onchange = function() {
        subdivisionInput.disabled = !this.value;
        if (!this.value) {
            subdivisionInput.value = '';
        }
    };

    // Set current values based on which date we're selecting
    const currentTime = selectingEndDate ? eventEditingEndTime : eventEditingTime;
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

    // Pre-populate if editing existing time
    if (eventEditingTime) {
        if (timeFormat === '12' || timeFormat === '24') {
            timeDivisionSelect.value = eventEditingTime.hour;
            subdivisionInput.value = eventEditingTime.minute;
            subdivisionInput.disabled = false;
        } else if (timeFormat === 'custom') {
            timeDivisionSelect.value = eventEditingTime.division;
            subdivisionInput.value = eventEditingTime.subdivision;
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
        
        // Update era dropdown to match the year (only for event picking)
        const eraSelect = document.getElementById('mini-cal-era');
        if (eraSelect && miniCalEditingEraIndex === 'event-date') {
            const matchingEraIndex = findEraForYear(miniCalCurrentYear);
            eraSelect.value = matchingEraIndex;
        }
        
        renderMiniCalendar();
    };
    document.getElementById('mini-cal-confirm').onclick = confirmMiniCalSelection;
    
    openModal('miniCalendarModal');
}

function findEraForYear(year) {
    const timeSystem = currentEditingCalendar;
    if (!timeSystem || !timeSystem.eras) return 0;
    
    for (let i = timeSystem.eras.length - 1; i >= 0; i--) {
        if (year >= timeSystem.eras[i].startDate.year) {
            return i;
        }
    }
    return 0;
}

function validateEventDate(dateObj, timeSystem) {
    if (!dateObj || !timeSystem) return false;
    
    // Check if month index is valid
    if (dateObj.month < 0 || dateObj.month >= timeSystem.months.length) {
        return false;
    }
    
    // Check if day is valid for the month
    const monthData = timeSystem.months[dateObj.month];
    if (dateObj.day < 1 || dateObj.day > monthData.days) {
        return false;
    }
    
    // Check if year is within era bounds
    const firstEra = timeSystem.eras[0];
    const endDate = timeSystem.endDate || { year: 3000, month: 11, day: 31 };
    
    if (dateObj.year < firstEra.startDate.year || dateObj.year > endDate.year) {
        return false;
    }
    
    return true;
}

function confirmEventDateSelection() {
    if (miniCalSelectedDate) {
        const timeDivisionSelect = document.getElementById('mini-cal-time-division');
        const subdivisionInput = document.getElementById('mini-cal-time-subdivision');
        const selectedTimeSystemId = infoData.plansOptions?.selectedTimeSystemId || 'default';
        const timeSystem = getTimeSystemById(selectedTimeSystemId);
        
        // Determine which time variable to update
        let capturedTime = null;
        
        if (timeDivisionSelect.value) {
            const timeFormat = timeSystem.settings.timeFormat;
            
            if (timeFormat === '12' || timeFormat === '24') {
                capturedTime = {
                    hour: parseInt(timeDivisionSelect.value),
                    period: timeFormat === '12' ? (parseInt(timeDivisionSelect.value) < 12 ? 'AM' : 'PM') : undefined
                };
                // Only add minute if user actually entered a value
                if (subdivisionInput.value !== '' && subdivisionInput.value !== null) {
                    capturedTime.minute = parseInt(subdivisionInput.value);
                }
            } else if (timeFormat === 'custom') {
                capturedTime = {
                    division: parseInt(timeDivisionSelect.value)
                };
                // Only add subdivision if user actually entered a value
                if (subdivisionInput.value !== '' && subdivisionInput.value !== null) {
                    capturedTime.subdivision = parseInt(subdivisionInput.value);
                }
            }
        }
        
        if (isSelectingEndDate) {
            // Validate end date is after start date
            if (eventEditingDate && compareDates(miniCalSelectedDate, eventEditingDate, currentEditingCalendar) <= 0) {
                window.notifyLoreUser('End date must be after start date.');
                return;
            }
            eventEditingEndDate = { ...miniCalSelectedDate };
            eventEditingEndTime = capturedTime;
        } else {
            eventEditingDate = { ...miniCalSelectedDate };
            eventEditingTime = capturedTime;
            // Clear end date if it's now before new start date
            if (eventEditingEndDate && compareDates(eventEditingEndDate, eventEditingDate, currentEditingCalendar) <= 0) {
                eventEditingEndDate = null;
                eventEditingEndTime = null;
            }
        }
        
        updateEventDateDisplay();
        closeModal('miniCalendarModal');
    }
}

function compareDates(date1, date2, timeSystem) {
    // Returns: negative if date1 < date2, 0 if equal, positive if date1 > date2
    if (date1.year !== date2.year) return date1.year - date2.year;
    if (date1.month !== date2.month) return date1.month - date2.month;
    return date1.day - date2.day;
}

function updateEventDateDisplay() {
    const display = document.getElementById('selected-event-date-display');
    const selectedTimeSystemId = infoData.plansOptions?.selectedTimeSystemId || 'default';
    const timeSystem = getTimeSystemById(selectedTimeSystemId);
    
    if (!timeSystem) {
        display.textContent = 'Time system no longer exists';
        display.style.color = 'var(--danger)';
        return;
    }
    
    if (eventEditingDate && validateEventDate(eventEditingDate, timeSystem)) {
        let formatted = formatDateWithFormat(eventEditingDate, timeSystem.settings.dateFormat, timeSystem);
        
        // Add start time if present
        if (eventEditingTime) {
            const timeFormat = timeSystem.settings.timeFormat;
            if (timeFormat === '12') {
                let timeStr = ` ${eventEditingTime.hour}`;
                if (eventEditingTime.minute !== undefined && eventEditingTime.minute !== null) {
                    timeStr += `:${String(eventEditingTime.minute).padStart(2, '0')}`;
                }
                timeStr += ` ${eventEditingTime.period}`;
                formatted += timeStr;
            } else if (timeFormat === '24') {
                let timeStr = ` ${String(eventEditingTime.hour).padStart(2, '0')}`;
                if (eventEditingTime.minute !== undefined && eventEditingTime.minute !== null) {
                    timeStr += `:${String(eventEditingTime.minute).padStart(2, '0')}`;
                }
                formatted += timeStr;
            } else if (timeFormat === 'custom') {
                const divName = timeSystem.timeDivisions.useDivisionNames && timeSystem.timeDivisions.divisionNames?.[eventEditingTime.division]
                    ? timeSystem.timeDivisions.divisionNames[eventEditingTime.division]
                    : `Division ${eventEditingTime.division + 1}`;
                formatted += `, ${divName}`;
                if (eventEditingTime.subdivision !== undefined && eventEditingTime.subdivision !== null) {
                    const subdivisionName = timeSystem.timeDivisions.subdivisionName || 'subdivision';
                    formatted += ` ${eventEditingTime.subdivision} ${subdivisionName}`;
                }
            }
        }
        
        // If there's an end date, show date range
        if (eventEditingEndDate && validateEventDate(eventEditingEndDate, timeSystem)) {
            let endFormatted = formatDateWithFormat(eventEditingEndDate, timeSystem.settings.dateFormat, timeSystem);
            
            // Add end time if present
            if (eventEditingEndTime) {
                const timeFormat = timeSystem.settings.timeFormat;
                if (timeFormat === '12') {
                    let endTimeStr = ` ${eventEditingEndTime.hour}`;
                    if (eventEditingEndTime.minute !== undefined && eventEditingEndTime.minute !== null) {
                        endTimeStr += `:${String(eventEditingEndTime.minute).padStart(2, '0')}`;
                    }
                    endTimeStr += ` ${eventEditingEndTime.period}`;
                    endFormatted += endTimeStr;
                } else if (timeFormat === '24') {
                    let endTimeStr = ` ${String(eventEditingEndTime.hour).padStart(2, '0')}`;
                    if (eventEditingEndTime.minute !== undefined && eventEditingEndTime.minute !== null) {
                        endTimeStr += `:${String(eventEditingEndTime.minute).padStart(2, '0')}`;
                    }
                    endFormatted += endTimeStr;
                } else if (timeFormat === 'custom') {
                    const divName = timeSystem.timeDivisions.useDivisionNames && timeSystem.timeDivisions.divisionNames?.[eventEditingEndTime.division]
                        ? timeSystem.timeDivisions.divisionNames[eventEditingEndTime.division]
                        : `Division ${eventEditingEndTime.division + 1}`;
                    endFormatted += `, ${divName}`;
                    if (eventEditingEndTime.subdivision !== undefined && eventEditingEndTime.subdivision !== null) {
                        const subdivisionName = timeSystem.timeDivisions.subdivisionName || 'subdivision';
                        endFormatted += ` ${eventEditingEndTime.subdivision} ${subdivisionName}`;
                    }
                }
            }
            
            display.innerHTML = `${formatted} <span style="color: var(--text-muted); margin: 0 4px;">→</span> ${endFormatted}`;
        } else {
            display.textContent = formatted;
        }
        display.style.color = 'var(--text-color)';
        
        // Enable/disable end date button
        const endDateBtn = document.getElementById('select-event-end-date-btn');
        if (endDateBtn) {
            endDateBtn.disabled = false;
            endDateBtn.style.opacity = '1';
        }
    } else if (eventEditingDate) {
        display.textContent = 'Date invalid for current time system';
        display.style.color = 'var(--danger)';
        const endDateBtn = document.getElementById('select-event-end-date-btn');
        if (endDateBtn) {
            endDateBtn.disabled = true;
            endDateBtn.style.opacity = '0.5';
        }
    } else {
        display.textContent = 'No date selected';
        display.style.color = 'var(--text-muted)';
        const endDateBtn = document.getElementById('select-event-end-date-btn');
        if (endDateBtn) {
            endDateBtn.disabled = true;
            endDateBtn.style.opacity = '0.5';
        }
    }
}

function clearEventDate() {
    eventEditingDate = null;
    eventEditingTime = null;
    eventEditingEndDate = null;
    eventEditingEndTime = null;
    updateEventDateDisplay();
}

function getTimeSystemById(id) {
    return window.LoreDomainHelpers.getTimeSystemById(id);
}

function checkForLegacyEventTimings() {
    // Check all plans for legacy string timings
    let hasLegacy = false;
    
    infoData.plans.forEach(plan => {
        if (plan.events) {
            plan.events.forEach(event => {
                if (event.timing && typeof event.timing === 'string') {
                    hasLegacy = true;
                }
            });
        }
    });
    
    if (hasLegacy) {
        console.warn('Legacy event timings detected. Consider updating to new format.');
        // Optionally show a toast/notice to user
    }
}

// Make plan functions globally available (similar to timeline-html.js pattern)
if (typeof window !== 'undefined') {
    // Functions called from HTML onclick handlers need to be global
    window.togglePlanNavigation = function() { /* implementation */ };
    window.togglePlanTag = function(tag) { /* implementation */ };  
    window.setPlanFilterMode = function(mode) { /* implementation */ };
    window.clearAllPlanTags = function() { /* implementation */ };
    
    // Functions called from other modules  
    window.generateCardsView = generateCardsView;
    window.generatePlansContentWithTimeline = generatePlansContentWithTimeline;
}

// ============================================================================
// GLOBAL EXPORTS - Only what's actually needed
// ============================================================================

// Functions called from HTML onclick handlers
window.openPlanModal = openPlanModal;
window.savePlan = savePlan;
window.addSubArc = addSubArc;
window.editSubArc = editSubArc;
window.deleteSubArc = deleteSubArc;
window.openSubArcModal = openSubArcModal;
window.saveSubArc = saveSubArc;
window.addEventToPlan = addEventToPlan;
window.editEventInPlan = editEventInPlan;
window.deleteEventFromPlan = deleteEventFromPlan;
window.addEventToSubArc = addEventToSubArc;
window.openEventModal = openEventModal;
window.saveEvent = saveEvent;
window.openSubeventModal = openSubeventModal;
window.saveSubevent = saveSubevent;
window.editSubevent = editSubevent;
window.deleteSubevent = deleteSubevent;
window.toggleSubeventsSection = toggleSubeventsSection;
window.toggleStorylineDropdown = toggleStorylineDropdown;
window.toggleStorylineOption = toggleStorylineOption;

// Functions called from other modules (only if needed)
window.setupPlanColorInputs = setupPlanColorInputs;
window.setupSubArcColorInputs = setupSubArcColorInputs;
window.migratePlanData = migratePlanData;

window.openEventDatePicker = openEventDatePicker;
window.clearEventDate = clearEventDate;
