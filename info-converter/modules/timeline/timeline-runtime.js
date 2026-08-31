// Generated timeline reader runtime
function generateTimelineJavaScript() {
    return `
            // Timeline filtering state
            let selectedTimelineTags = new Set();
            let timelineFilterMode = 'any';
            let currentTimelineSearch = '';
            let timelineYearFrom = null;
            let timelineYearTo = null;

            // Helper function to get time system by ID
            window.getTimeSystemById = function(id) {
                if (id === 'default') {
                    return window.DEFAULT_CALENDAR;
                }
                if (id === 'preset-chinese') {
                    return window.PRESET_CHINESE_CALENDAR;
                }
                const systems = window.userTimeSystems || [];
                return systems.find(ts => ts.id === id) || null;
            };

            // Helper function to format dates
            window.formatDateWithFormat = function(dateObj, format, calendar) {
                const monthName = calendar.months[dateObj.month]?.name || 'Unknown';
                const monthNum = String(dateObj.month + 1).padStart(2, '0');
                const day = String(dateObj.day).padStart(2, '0');
                const dayNum = dateObj.day;
                const year = Math.abs(dateObj.year);
                
                let result = format;
                result = result.replace('MMMM', monthName);
                result = result.replace('MM', monthNum);
                result = result.replace('DD', day);
                result = result.replace('D', String(dayNum));
                result = result.replace('YYYY', String(year));
                
                return result;
            };
            
            // Parse timing function - needed for timeline filtering
            window.parseTiming = function(timing) {
                // NEW FORMAT: Object with date/time/timeSystemId
                if (timing && typeof timing === 'object' && timing.date) {
                    const timeSystem = getTimeSystemById(timing.timeSystemId || 'default');
                    
                    const result = {
                        hour: null,
                        day: timing.date.day || null,
                        month: timing.date.month || null,
                        year: timing.date.year || null,
                        endYear: null,
                        endMonth: null,
                        endDay: null,
                        endHour: null,
                        originalText: '',
                        hasEndDate: false
                    };
                    
// Add time if present
                    if (timing.time) {
                        if (timing.time.hour !== undefined) {
                            result.hour = timing.time.hour;
                        } else if (timing.time.division !== undefined) {
                            result.hour = timing.time.division;
                        }
                    }
                    
                    // Add end date if present
                    if (timing.endDate) {
                        result.hasEndDate = true;
                        result.endYear = timing.endDate.year || null;
                        result.endMonth = timing.endDate.month || null;
                        result.endDay = timing.endDate.day || null;
                        
                        if (timing.endTime) {
                            if (timing.endTime.hour !== undefined) {
                                result.endHour = timing.endTime.hour;
                            } else if (timing.endTime.division !== undefined) {
                                result.endHour = timing.endTime.division;
                            }
                        }
                    }
                    
                    // Format display text using the time system
                    if (timeSystem) {
                        result.originalText = formatDateWithFormat(timing.date, timeSystem.settings.dateFormat, timeSystem);
                        
                        // Add start time if present
                        if (timing.time) {
                            const timeFormat = timeSystem.settings.timeFormat;
                            let timeStr = '';
                            
                            if (timeFormat === '12') {
                                timeStr = \` \${timing.time.hour}\`;
                                // Only add minutes if explicitly set
                                if (timing.time.minute !== undefined && timing.time.minute !== null) {
                                    timeStr += \`:\${String(timing.time.minute).padStart(2, '0')}\`;
                                }
                                timeStr += \` \${timing.time.period}\`;
                            } else if (timeFormat === '24') {
                                timeStr = \` \${String(timing.time.hour).padStart(2, '0')}\`;
                                // Only add minutes if explicitly set
                                if (timing.time.minute !== undefined && timing.time.minute !== null) {
                                    timeStr += \`:\${String(timing.time.minute).padStart(2, '0')}\`;
                                }
                            } else if (timeFormat === 'custom') {
                                const divName = timeSystem.timeDivisions.useDivisionNames && timeSystem.timeDivisions.divisionNames?.[timing.time.division]
                                    ? timeSystem.timeDivisions.divisionNames[timing.time.division]
                                    : \`Division \${timing.time.division}\`;
                                timeStr = \` \${divName}\`;
                                // Only add subdivision if explicitly set
                                if (timing.time.subdivision !== undefined && timing.time.subdivision !== null) {
                                    const subdivisionName = timeSystem.timeDivisions.subdivisionName || 'minutes';
                                    timeStr += \`, \${timing.time.subdivision} \${subdivisionName}\`;
                                }
                            }
                            
                            result.originalText += timeStr;
                        }
                        
                        // Add end date if present
                        if (timing.endDate) {
                            let endText = formatDateWithFormat(timing.endDate, timeSystem.settings.dateFormat, timeSystem);
                            
                            // Add end time if present
                            if (timing.endTime) {
                                const timeFormat = timeSystem.settings.timeFormat;
                                let endTimeStr = '';
                                
                                if (timeFormat === '12') {
                                    endTimeStr = \` \${timing.endTime.hour}\`;
                                    // Only add minutes if explicitly set
                                    if (timing.endTime.minute !== undefined && timing.endTime.minute !== null) {
                                        endTimeStr += \`:\${String(timing.endTime.minute).padStart(2, '0')}\`;
                                    }
                                    endTimeStr += \` \${timing.endTime.period}\`;
                                } else if (timeFormat === '24') {
                                    endTimeStr = \` \${String(timing.endTime.hour).padStart(2, '0')}\`;
                                    // Only add minutes if explicitly set
                                    if (timing.endTime.minute !== undefined && timing.endTime.minute !== null) {
                                        endTimeStr += \`:\${String(timing.endTime.minute).padStart(2, '0')}\`;
                                    }
                                } else if (timeFormat === 'custom') {
                                    const divName = timeSystem.timeDivisions.useDivisionNames && timeSystem.timeDivisions.divisionNames?.[timing.endTime.division]
                                        ? timeSystem.timeDivisions.divisionNames[timing.endTime.division]
                                        : \`Division \${timing.endTime.division}\`;
                                    endTimeStr = \`, \${divName}\`;
                                    // Only add subdivision if explicitly set
                                    if (timing.endTime.subdivision !== undefined && timing.endTime.subdivision !== null) {
                                        const subdivisionName = timeSystem.timeDivisions.subdivisionName || 'minutes';
                                        endTimeStr += \` \${timing.endTime.subdivision} \${subdivisionName}\`;
                                    }
                                }
                                
                                endText += endTimeStr;
                            }
                            
                            result.originalText += \` → \${endText}\`;
                        }
                    } else {
                        // Fallback if time system not found
                        result.originalText = \`Month \${result.month + 1}, Day \${result.day}, Year \${result.year}\`;
                        if (result.hasEndDate) {
                            result.originalText += \` → Month \${result.endMonth + 1}, Day \${result.endDay}, Year \${result.endYear}\`;
                        }
                    }
                    
                    return result;
                }
                
                // LEGACY FORMAT: String like "Hour 12, Day 5, Month 3, Year 1"
                if (timing && typeof timing === 'string' && typeof timing.trim === 'function') {
                    const timingStr = timing;
                    const result = {
                        hour: null,
                        day: null,
                        month: null,
                        year: null,
                        endYear: null,
                        endMonth: null,
                        endDay: null,
                        endHour: null,
                        hasEndDate: false,
                        originalText: timingStr
                    };
                    
                    const patterns = [
                        /Hour\s+(\d+)/i,
                        /Day\s+(\d+)/i,
                        /Month\s+(\d+)/i,
                        /Year\s+(\d+)/i
                    ];
                    
                    const hourMatch = timingStr.match(patterns[0]);
                    const dayMatch = timingStr.match(patterns[1]);
                    const monthMatch = timingStr.match(patterns[2]);
                    const yearMatch = timingStr.match(patterns[3]);
                    
                    if (hourMatch) result.hour = parseInt(hourMatch[1]);
                    if (dayMatch) result.day = parseInt(dayMatch[1]);
                    if (monthMatch) result.month = parseInt(monthMatch[1]) - 1;
                    if (yearMatch) result.year = parseInt(yearMatch[1]);
                    
                    // Must have at least one timing component
                    if (result.hour !== null || result.day !== null || result.month !== null || result.year !== null) {
                        return result;
                    }
                }
                
                return null;
            }
            function toggleEventSubevents(uniqueId) {
                const content = document.getElementById('subevents-content-' + uniqueId);
                const toggle = document.getElementById('subevents-toggle-' + uniqueId);
                
                if (content && toggle) {
                    if (content.classList.contains('collapsed')) {
                        content.classList.remove('collapsed');
                        toggle.innerHTML = '&#9660;';
                    } else {
                        content.classList.add('collapsed');
                        toggle.innerHTML = '&#9654;';
                    }
                }
            }

            // Plans view switching
            function switchPlansView(view) {
                
                // Update tab states
                const cardTab = document.getElementById('cards-tab');
                const timelineTab = document.getElementById('timeline-tab');
                const cardView = document.getElementById('cards-view');
                const timelineView = document.getElementById('timeline-view');
                
                console.log('🔄 Elements found:', {
                    cardTab: !!cardTab,
                    timelineTab: !!timelineTab,
                    cardView: !!cardView,
                    timelineView: !!timelineView
                });
                
                if (view === 'cards') {
                    cardTab.classList.add('active');
                    timelineTab.classList.remove('active');
                    cardView.classList.add('active');
                    timelineView.classList.remove('active');
                } else if (view === 'timeline') {
                    cardTab.classList.remove('active');
                    timelineTab.classList.add('active');
                    cardView.classList.remove('active');
                    timelineView.classList.add('active');
                    
                    console.log('🔄 After timeline switch:', {
                        timelineViewClasses: timelineView ? timelineView.className : 'not found',
                        timelineViewDisplay: timelineView ? window.getComputedStyle(timelineView).display : 'not found'
                    });
                }
            }

            // Timeline view switching function - reapply filters and detect current view
            function switchTimelineView(view) {
                const chronoContainer = document.getElementById('tl-chronological-container');
                const arcContainer = document.getElementById('tl-arc-container');
                const viewSelect = document.getElementById('timeline-view-select');
                
                if (view === 'chronological') {
                    if (chronoContainer) chronoContainer.style.display = 'block';
                    if (arcContainer) arcContainer.style.display = 'none';
                    if (viewSelect) viewSelect.value = 'chronological';
                } else if (view === 'arc') {
                    if (chronoContainer) chronoContainer.style.display = 'none';
                    if (arcContainer) arcContainer.style.display = 'block';
                    if (viewSelect) viewSelect.value = 'arc';
                }
                
                // Reapply filters after switching views
                setTimeout(() => {
                    applyTimelineFilters();
                }, 100);
            }

            // Event notes modal functions
            function showEventNotesModal(eventId) {
                if (!window.eventData || !window.eventData[eventId]) {
                    console.error('Event data not found for ID:', eventId);
                    return;
                }
                
                const eventData = window.eventData[eventId];
                
                document.getElementById('tl-event-notes-modal-title').textContent = eventData.title;
                const arcContainer = document.getElementById('tl-event-notes-modal-arc');
                arcContainer.textContent = '';
                const arcLink = document.createElement('span');
                arcLink.className = 'tl-arc-link';
                arcLink.dataset.loreAction = 'open-plan-from-timeline';
                arcLink.dataset.arcTitle = eventData.arcTitle;
                arcLink.textContent = eventData.arcTitle;
                arcContainer.appendChild(arcLink);
                document.getElementById('tl-event-notes-modal-timing').textContent = eventData.timing;
                document.getElementById('tl-event-notes-modal-notes').textContent = eventData.notes;
                
                document.getElementById('tl-event-notes-modal').classList.add('show');
            }

            function hideEventNotesModal(event) {
                if (event && event.target !== event.currentTarget) return;
                document.getElementById('tl-event-notes-modal').classList.remove('show');
            }
            
            // Initialize timeline filtering
            function initializeTimelineFiltering() {
                const searchInput = document.getElementById('timeline-search');
                const yearFromInput = document.getElementById('timeline-year-from');
                const yearToInput = document.getElementById('timeline-year-to');

                if (searchInput) {
                    searchInput.addEventListener('input', function() {
                        currentTimelineSearch = this.value.toLowerCase().trim();
                        applyTimelineFilters();
                    });
                }

                if (yearFromInput) {
                    yearFromInput.addEventListener('input', function() {
                        timelineYearFrom = this.value ? parseInt(this.value) : null;
                        applyTimelineFilters();
                    });
                }

                if (yearToInput) {
                    yearToInput.addEventListener('input', function() {
                        timelineYearTo = this.value ? parseInt(this.value) : null;
                        applyTimelineFilters();
                    });
                }

                // Initialize display
                updateTimelineTagStates();
                updateTimelineClearButtonState();
                
                // Apply initial filters to both views
                setTimeout(() => {
                    console.log('Applying initial timeline filters');
                    applyTimelineFilters();
                }, 200);
            }       

            function initializeTimelineFeatures() {
                console.log('Initializing timeline features...');
                
                // Initialize filtering
                initializeTimelineFiltering();
                
                console.log('Timeline features initialized');
            }

            // Open plan modal from timeline by arc title
            function openPlanModalFromTimeline(fullArcTitle) {                
                // Use embedded fullInfoData instead of plansData
                if (fullInfoData && fullInfoData.plans) {
                    // Extract main arc title (everything before the arrow)
                    // Split on actual arrow character instead of HTML entity
                    const mainArcTitle = fullArcTitle.split(' → ')[0].trim();
                    
                    const planIndex = fullInfoData.plans.findIndex(plan => plan.title === mainArcTitle);
                    
                    if (planIndex !== -1) {
                        hideEventNotesModal();
                        window.openPlanModal(planIndex);
                    } else {
                        console.error('Plan not found for arc:', mainArcTitle);
                        console.log('Available plans:', fullInfoData.plans.map(p => p.title));
                    }
                } else {
                    console.error('Plans data not available in fullInfoData');
                }
            }

            // Store timeline events data globally for filtering data access
            if (fullInfoData && fullInfoData.plans && fullInfoData.plans.length > 0) {
                // Collect timeline events when page loads
                const timelineEvents = [];
                fullInfoData.plans.forEach(plan => {
                    // Main events
                    if (plan.events) {
                        plan.events.forEach(event => {
                            if (event.visible !== false && event.timing && (typeof event.timing === 'string' ? event.timing.trim() : true)) {
                                const parsedTiming = window.parseTiming(event.timing);
                                if (parsedTiming) {
                                    timelineEvents.push({
                                        ...event,
                                        arcTitle: plan.title,
                                        isSubArc: false,
                                        parsedTiming: parsedTiming,
                                        characterTags: event.characterTags || [],
                                        subevents: event.subevents || event.characterMoments || []
                                    });
                                }
                            }
                        });
                    }
                    
                    // Sub-arc events
                    if (plan.subArcs) {
                        plan.subArcs.forEach(subArc => {
                            if (subArc.visible !== false && subArc.events) {
                                subArc.events.forEach(event => {
                                    if (event.visible !== false && event.timing && (typeof event.timing === 'string' ? event.timing.trim() : true)) {
                                        const parsedTiming = window.parseTiming(event.timing);
                                        if (parsedTiming) {
                                            timelineEvents.push({
                                                ...event,
                                                arcTitle: \`\${plan.title} &rarr; \${subArc.title}\`,
                                                isSubArc: true,
                                                parsedTiming: parsedTiming,
                                                characterTags: event.characterTags || [],
                                                subevents: event.subevents || event.characterMoments || []
                                            });
                                        }
                                    }
                                });
                            }
                        });
                    }
                });
                
                window.timelineAllEvents = timelineEvents;
            }

            // Close modal on Escape key
            document.addEventListener('keydown', function(event) {
                if (event.key === 'Escape') {
                    hideEventNotesModal();
                }
            });

            // Make all functions globally available
            window.switchPlansView = switchPlansView;
            window.switchTimelineView = switchTimelineView;
            window.toggleEventSubevents = toggleEventSubevents;
            window.showEventNotesModal = showEventNotesModal;
            window.hideEventNotesModal = hideEventNotesModal;
            window.initializeTimelineFiltering = initializeTimelineFiltering;

            window.openPlanModalFromTimeline = openPlanModalFromTimeline;

    `;
}

function generateTimelineFilteringJavaScript() {
    return `
        // Timeline filtering functions
        function toggleTimelineTag(tag) {
            if (selectedTimelineTags.has(tag)) {
                selectedTimelineTags.delete(tag);
            } else {
                selectedTimelineTags.add(tag);
            }
            
            updateTimelineTagStates();
            updateTimelineClearButtonState();
            applyTimelineFilters();
        }
        
        function updateTimelineTagStates() {
            document.querySelectorAll('.timeline-tag-link').forEach(link => {
                const fullTag = link.dataset.tag || link.textContent;
                const strippedTag = stripHiddenPrefix(fullTag);
                
                if (selectedTimelineTags.has(strippedTag)) {
                    link.classList.add('selected');
                } else {
                    link.classList.remove('selected');
                }
            });
        }

        function updateTimelineClearButtonState() {
            const clearBtn = document.getElementById('timeline-clear-selected-btn');
            if (clearBtn) {
                if (selectedTimelineTags.size > 0) {
                    clearBtn.classList.add('active');
                } else {
                    clearBtn.classList.remove('active');
                }
            }
        }
        
        function clearAllTimelineTags() {
            selectedTimelineTags.clear();
            updateTimelineTagStates();
            updateTimelineClearButtonState();
            applyTimelineFilters();
        }

        function setTimelineFilterMode(mode) {
            timelineFilterMode = mode;
            
            // Update UI
            document.querySelectorAll('.timeline-filter-mode-option').forEach(option => {
                option.classList.remove('active');
            });
            const activeButton = document.getElementById(\`timeline-filter-mode-\${mode}\`);
            if (activeButton) {
                activeButton.classList.add('active');
            }
            
            // Reapply filters
            applyTimelineFilters();
        }

        // Timeline navigation toggle function with consistent arrows
        function toggleTimelineNavigation() {
            const content = document.querySelector('.timeline-nav-content');
            const toggle = document.querySelector('.timeline-nav-toggle');
            
            if (content && toggle) {
                if (content.classList.contains('collapsed')) {
                    content.classList.remove('collapsed');
                    toggle.classList.add('expanded');
                    toggle.innerHTML = '&#9660;'; // Down arrow when expanded
                } else {
                    content.classList.add('collapsed');
                    toggle.classList.remove('expanded');  
                    toggle.innerHTML = '&#9654;'; // Right arrow when collapsed
                }
            }
        }

        // Main filtering function that detects current view and applies appropriate filters
        function applyTimelineFilters() {
            const chronoContainer = document.getElementById('tl-chronological-container');
            
            if (chronoContainer) {
                applyChronologicalFilters(chronoContainer);
            }
        }

        // Chronological timeline filtering (existing logic)
        function applyChronologicalFilters(timelineContainer) {
            const yearSections = timelineContainer.querySelectorAll('.tl-timeline-year');
            
            // Hide all storyline spans when any filter is active
            const storylineSpans = timelineContainer.querySelectorAll('.tl-storyline-span');
            const hasActiveFilters = selectedTimelineTags.size > 0 || 
                                    currentTimelineSearch || 
                                    timelineYearFrom || 
                                    timelineYearTo;
            
            storylineSpans.forEach(span => {
                span.style.display = hasActiveFilters ? 'none' : '';
            });
            
            yearSections.forEach(yearSection => {
                const year = parseInt(yearSection.getAttribute('data-year'));
                let yearHasVisibleEvents = false;
                
                // Check year range filter
                const yearInRange = (!timelineYearFrom || year >= timelineYearFrom) && 
                                    (!timelineYearTo || year <= timelineYearTo);
                
                if (!yearInRange) {
                    yearSection.style.display = 'none';
                    return;
                }
                
                const timelineEvents = yearSection.querySelectorAll('.tl-timeline-event');
                const monthLabels = yearSection.querySelectorAll('.tl-month-label');
                
                // Track which months have visible events
                const visibleMonths = new Set();
                
                timelineEvents.forEach(timelineEvent => {
                    const isStackedEvent = timelineEvent.querySelector('.tl-stacked-events');
                    
                    if (isStackedEvent) {
                        // STACKED EVENTS: Handle each individual event card
                        let stackHasVisibleEvents = false;
                        const nestedCards = timelineEvent.querySelectorAll('.tl-stacked-events .tl-event-card');
                        
                        nestedCards.forEach(card => {
                            let cardMatches = true;
                            
                            // Get info from this specific card
                            const title = card.querySelector('.tl-event-title')?.textContent || '';
                            const arcElement = card.querySelector('.tl-event-arc-title .tl-arc-link');
                            const arc = arcElement?.textContent || '';
                            const timing = card.querySelector('.tl-event-timing')?.textContent || '';
                            
                            // Get character tags from THIS card, not the parent
                            const characterTags = card.getAttribute('data-character-tags') || '';
                            
                            // Tag filtering for this individual card
                            if (selectedTimelineTags.size > 0) {
                                cardMatches = checkEventMatchesTags(arc, characterTags);
                            }
                            
                            // Search filter for this individual card
                            if (cardMatches && currentTimelineSearch) {
                                const searchableText = [title, arc, timing].join(' ').toLowerCase();
                                cardMatches = searchableText.includes(currentTimelineSearch);
                            }
                            
                            // Show/hide this individual card
                            if (cardMatches) {
                                card.style.display = '';
                                stackHasVisibleEvents = true;
                            } else {
                                card.style.display = 'none';
                            }
                        });
                        
                        // Show/hide the entire stacked event container
                        if (stackHasVisibleEvents) {
                            timelineEvent.style.display = '';
                            timelineEvent.classList.remove('hidden');
                            yearHasVisibleEvents = true;
                            
                            // Track this month as having visible events
                            const monthLabel = findPrecedingMonthLabel(timelineEvent);
                            if (monthLabel) {
                                visibleMonths.add(monthLabel);
                            }
                        } else {
                            timelineEvent.style.display = 'none';
                            timelineEvent.classList.add('hidden');
                        }
                        
                    } else {
                        // INDIVIDUAL EVENTS: Handle as before
                        let matches = true;
                        
                        const title = timelineEvent.querySelector('.tl-event-title')?.textContent || '';
                        const arcElement = timelineEvent.querySelector('.tl-event-arc-title .tl-arc-link');
                        const arc = arcElement?.textContent || '';
                        const timing = timelineEvent.querySelector('.tl-event-timing')?.textContent || '';
                        
                        // Get character tags from the event element
                        const characterTags = timelineEvent.getAttribute('data-character-tags') || '';
                        
                        // Tag filtering
                        if (selectedTimelineTags.size > 0) {
                            matches = checkEventMatchesTags(arc, characterTags);
                        }
                        
                        // Search filter
                        if (matches && currentTimelineSearch) {
                            const searchableText = [title, arc, timing].join(' ').toLowerCase();
                            matches = searchableText.includes(currentTimelineSearch);
                        }
                        
                        // Show/hide individual event
                        if (matches) {
                            timelineEvent.style.display = '';
                            timelineEvent.classList.remove('hidden');
                            yearHasVisibleEvents = true;
                            
                            // Track this month as having visible events
                            const monthLabel = findPrecedingMonthLabel(timelineEvent);
                            if (monthLabel) {
                                visibleMonths.add(monthLabel);
                            }
                        } else {
                            timelineEvent.style.display = 'none';
                            timelineEvent.classList.add('hidden');
                        }
                    }
                });
                
                // Show/hide month labels based on whether they have visible events
                monthLabels.forEach(label => {
                    if (visibleMonths.has(label)) {
                        label.style.display = '';
                    } else {
                        label.style.display = 'none';
                    }
                });
                
                // Show/hide year section
                yearSection.style.display = yearHasVisibleEvents ? '' : 'none';
            });
        }

        // Helper function to find the month label preceding an event
        function findPrecedingMonthLabel(eventElement) {
            let currentElement = eventElement.previousElementSibling;
            
            // Walk backwards until we find a month label or reach the beginning
            while (currentElement) {
                if (currentElement.classList.contains('tl-month-label')) {
                    return currentElement;
                }
                currentElement = currentElement.previousElementSibling;
            }
            
            return null;
        }

                    // Helper function to check if an event matches the selected tags
                    function checkEventMatchesTags(arcTitle, characterTags) {
                        if (!arcTitle || selectedTimelineTags.size === 0) {
                            return true; // No tags selected means show all
                        }
                        
                        if (typeof fullInfoData === 'undefined' || !fullInfoData.plans) {
                            return false;
                        }
                        
                        // Get arc-level filter tags
                        const mainArcTitle = arcTitle.split(' → ')[0].trim();
                        const plan = fullInfoData.plans.find(p => p.title === mainArcTitle);
                        const planFilterTags = plan?.tags || [];
                        
                        // Get event-level character tags
                        const eventCharacterTags = characterTags ? 
                            characterTags.split(',').filter(t => t.trim()) : [];
                        
                        // Combine both arc filter tags and event character tags for matching
                        const allMatchableTags = [...planFilterTags, ...eventCharacterTags];
                        
                        if (allMatchableTags.length === 0) {
                            return false; // No tags to match against
                        }
                        
                        if (timelineFilterMode === 'all') {
                            // Event must match ALL selected tags (checking across both arc and character tags)
                            return Array.from(selectedTimelineTags).every(selectedTag => 
                                allMatchableTags.some(tag => 
                                    tag.toLowerCase().includes(selectedTag.toLowerCase())
                                )
                            );
                        } else {
                            // Event must match ANY selected tag (from either arc tags or character tags)
                            return Array.from(selectedTimelineTags).some(selectedTag => 
                                allMatchableTags.some(tag => 
                                    tag.toLowerCase().includes(selectedTag.toLowerCase())
                                )
                            );
                        }
                    }


        // Make timeline filtering functions globally available
        window.toggleTimelineTag = toggleTimelineTag;
        window.updateTimelineTagStates = updateTimelineTagStates;
        window.updateTimelineClearButtonState = updateTimelineClearButtonState;
        window.clearAllTimelineTags = clearAllTimelineTags;
        window.setTimelineFilterMode = setTimelineFilterMode;
        window.toggleTimelineNavigation = toggleTimelineNavigation;
        window.applyTimelineFilters = applyTimelineFilters;
        window.applyChronologicalFilters = applyChronologicalFilters;
        window.checkEventMatchesTags = checkEventMatchesTags;

        //these may not exist anymore, not sure
        window.selectedTimelineTags = selectedTimelineTags;
        window.timelineFilterMode = timelineFilterMode;
        window.currentTimelineSearch = currentTimelineSearch;
        window.timelineYearFrom = timelineYearFrom;
        window.timelineYearTo = timelineYearTo;
     `;
}
