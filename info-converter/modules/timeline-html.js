// Timeline HTML Generation Functions
// Helper function to get time system by ID (needed for timeline)
function getTimeSystemById(id) {
    return window.LoreDomainHelpers.getTimeSystemById(id);
}
//GENERATING
// Generate the new timeline view with NAMESPACED classes
function generateTimelineView(data) {
    // Collect all events from all plans with timing data
    const allEvents = collectAllEventsWithTiming(data.plans);
    
    // Collect all storylines with timing data
    const allStorylines = collectStorylinesWithTiming(data.storylines || []);
    
    if (allEvents.length === 0 && allStorylines.length === 0) {
        return `
            <div class="tl-timeline-empty">
                <h3>No Timed Events or Storylines</h3>
                <p>No events or storylines with timing information found. Add timing details to see them in the timeline.</p>
            </div>`;
    }
    
    // Pass both allEvents AND plans to get plan-level tags
    const { uniqueTags, yearRange } = collectTimelineFilterData(allEvents, data.plans);
    
    let timelineHTML = '';
    
    // Add timeline navigation
    timelineHTML += generateTimelineNavigation(uniqueTags, yearRange);
    
    // Generate chronological timeline with both events and storylines
    timelineHTML += generateChronologicalTimeline(allEvents, allStorylines);
    
    return timelineHTML;
}

// Generate the chronological timeline with month grouping
function generateChronologicalTimeline(allEvents, allStorylines = []) {
    // Get the selected time system
    const selectedTimeSystemId = infoData.plansOptions?.selectedTimeSystemId || 'default';
    const timeSystem = getTimeSystemById(selectedTimeSystemId);
    
    // Group events by year
    const eventsByYear = groupEventsByYear(allEvents);
    
    // Group storylines by their start year
    const storylinesByYear = {};
    allStorylines.forEach(storyline => {
        const year = storyline.parsedTiming.year;
        if (year !== null) {
            if (!storylinesByYear[year]) {
                storylinesByYear[year] = [];
            }
            storylinesByYear[year].push(storyline);
        }
    });
    
    // Get all unique years from both events and storylines
    const allYears = new Set([
        ...Object.keys(eventsByYear),
        ...Object.keys(storylinesByYear)
    ]);
    
    let chronoHTML = '<div class="tl-timeline-container tl-chronological-view" id="tl-chronological-container">';
    
    // Generate each year section
    Array.from(allYears).sort((a, b) => parseInt(a) - parseInt(b)).forEach(year => {
        const yearInt = parseInt(year);
        const eventsInYear = eventsByYear[year] || [];
        const storylinesInYear = storylinesByYear[year] || [];
        
        // Group events within this year by month
        const eventsByMonth = {};
        eventsInYear.forEach(event => {
            const month = event.parsedTiming.month !== null ? event.parsedTiming.month : -1;
            if (!eventsByMonth[month]) {
                eventsByMonth[month] = [];
            }
            eventsByMonth[month].push(event);
        });
        
        // Group storylines within this year by month
        const storylinesByMonth = {};
        storylinesInYear.forEach(storyline => {
            const month = storyline.parsedTiming.month !== null ? storyline.parsedTiming.month : -1;
            if (!storylinesByMonth[month]) {
                storylinesByMonth[month] = [];
            }
            storylinesByMonth[month].push(storyline);
        });
        
        chronoHTML += `
            <div class="tl-timeline-year" data-year="${year}">
                <div class="tl-year-label">
                    <h3>Year ${year}</h3>
                </div>
                <div class="tl-timeline-events">`;
        
        // Track which side we're on (start with left)
        let currentSide = 'left';
        
        // Get all months that have either events or storylines
        const allMonths = new Set([
            ...Object.keys(eventsByMonth),
            ...Object.keys(storylinesByMonth)
        ]);
        
        // Sort months and generate content for each month
        Array.from(allMonths).sort((a, b) => parseInt(a) - parseInt(b)).forEach(monthIndex => {
            const monthNum = parseInt(monthIndex);
            
            // Add month label if we have a valid month and time system
            if (monthNum >= 0 && timeSystem && timeSystem.months && timeSystem.months[monthNum]) {
                chronoHTML += `<div class="tl-month-label">${timeSystem.months[monthNum].name}</div>`;
            } else if (monthNum === -1) {
                chronoHTML += `<div class="tl-month-label tl-no-month">Unspecified Month</div>`;
            }
            
            // Combine events and storylines for this month
            const monthItems = [];
            
            // Add event groups (with stacking for identical timing)
            if (eventsByMonth[monthNum]) {
                // Group events with identical timing for stacking
                const stackedEvents = {};
                eventsByMonth[monthNum].forEach(event => {
                    const timingKey = `${event.parsedTiming.month || 0}-${event.parsedTiming.day || 0}-${event.parsedTiming.hour || 0}`;
                    if (!stackedEvents[timingKey]) {
                        stackedEvents[timingKey] = [];
                    }
                    stackedEvents[timingKey].push(event);
                });
                
                // Add each event group as a single item
                Object.values(stackedEvents).forEach(eventGroup => {
                    const firstEvent = eventGroup[0];
                    monthItems.push({
                        type: 'eventGroup',
                        data: eventGroup,
                        day: firstEvent.parsedTiming.day || 0,
                        hour: firstEvent.parsedTiming.hour || 0
                    });
                });
            }
            
            // Add storylines
            if (storylinesByMonth[monthNum]) {
                storylinesByMonth[monthNum].forEach(storyline => {
                    monthItems.push({
                        type: 'storyline',
                        data: storyline,
                        day: storyline.parsedTiming.day || 0,
                        hour: storyline.parsedTiming.hour || 0
                    });
                });
            }
            
            // Sort by day, then by hour, then by type (storylines before events on same day/hour)
            monthItems.sort((a, b) => {
                if (a.day !== b.day) return a.day - b.day;
                if (a.hour !== b.hour) return a.hour - b.hour;
                // If same timing, put storylines first
                if (a.type !== b.type) return a.type === 'storyline' ? -1 : 1;
                return 0;
            });
            
            // Render items in sorted order
            monthItems.forEach(item => {
                if (item.type === 'storyline') {
                    chronoHTML += generateStorylineSpan(item.data, timeSystem);
                } else {
                    // Render event group (either single or stacked)
                    const eventGroup = item.data;
                    if (eventGroup.length === 1) {
                        // Single event
                        chronoHTML += generateSingleTimelineEventWithSide(eventGroup[0], 0, currentSide);
                    } else {
                        // Multiple events with same timing - use stacked rendering
                        chronoHTML += generateStackedTimelineEventsWithSide(eventGroup, 0, currentSide);
                    }
                    // Toggle side for next event
                    currentSide = currentSide === 'left' ? 'right' : 'left';
                }
            });
        });
        
        chronoHTML += `
                </div>
            </div>`;
    });
    
    chronoHTML += '</div>';
    return chronoHTML;
}

// Generate storyline span HTML (add after generateChronologicalTimeline)
function generateStorylineSpan(storyline, timeSystem) {
    const hasDuration = storyline.parsedTiming.hasEndDate;
    
    // Format timing display
    let timingDisplay = storyline.parsedTiming.originalText;
    
    // Create a subtle unique ID for the storyline
    const storylineId = `storyline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Generate clickable title if link exists (same logic as plan cards)
    let titleHTML;
    if (storyline.link) {
        let finalLink = '';
        if (storyline.isProjectLink) {
            finalLink = `roleplays/${storyline.link}`;
        } else {
            finalLink = storyline.link;
        }
        const safeLink = window.LoreGenerationSecurity.escapeUrl(finalLink);
        titleHTML = safeLink
            ? `<a class="tl-storyline-title tl-storyline-title-clickable" href="${safeLink}" title="Open storyline">${storyline.title || 'Untitled Storyline'}</a>`
            : `<div class="tl-storyline-title">${storyline.title || 'Untitled Storyline'}</div>`;
    } else {
        titleHTML = `<div class="tl-storyline-title">${storyline.title || 'Untitled Storyline'}</div>`;
    }
    
    return `
        <div class="tl-storyline-span ${hasDuration ? 'has-duration' : ''}" data-storyline-id="${storylineId}">
            <div class="tl-storyline-content">
                ${titleHTML}
                <div class="tl-storyline-timing">${timingDisplay}</div>
            </div>
            ${hasDuration ? '<div class="tl-storyline-duration-bar"></div>' : ''}
        </div>
    `;
}

// Generate node color based on character tags
function generateCharacterBasedColor(characterTags, fallbackColor) {
    if (!characterTags || characterTags.length === 0) {
        return fallbackColor;
    }
    
    // Get visible character tags and their colors
    const visibleTags = getVisibleTags(characterTags);
    const characterColors = visibleTags.map(tag => getCharacterColor(tag)).filter(color => color !== '#6c757d');
    
    if (characterColors.length === 0) {
        return fallbackColor;
    }
    
    if (characterColors.length === 1) {
        return characterColors[0];
    }
    
    // Mix multiple character colors by averaging HSL values
    return mixCharacterColors(characterColors);
}

// Helper function to get CSS variable value
function getCSSVariableValue(variableName) {
    const computedStyle = getComputedStyle(document.documentElement);
    return computedStyle.getPropertyValue(variableName).trim();
}
// Helper to expand yearly events into multiple instances
function expandYearlyEvents(events, yearsWithEvents) {
    const expandedEvents = [];
    
    events.forEach(event => {
        if (!event.yearly || !event.parsedTiming || event.parsedTiming.year === null) {
            expandedEvents.push(event);
            return;
        }
        
        const startYear = event.parsedTiming.year;
        const endYear = event.yearlyPerennial ? 
            Math.max(...yearsWithEvents) : 
            startYear + (event.yearlyDuration || 1) - 1;
        
        // Only create instances for years that have other (non-yearly) events
        yearsWithEvents.forEach(targetYear => {
            if (targetYear >= startYear && targetYear <= endYear) {
                const instance = { 
                    ...event, 
                    parsedTiming: { 
                        ...event.parsedTiming, 
                        year: targetYear 
                    },
                    isYearlyInstance: true,
                    originalYear: startYear
                };
                expandedEvents.push(instance);
            }
        });
    });
    
    return expandedEvents;
}

function collectAllEventsWithTiming(plans) {
    const allEvents = [];
    const regularEvents = []; // Non-yearly events
    const yearlyEvents = []; // Yearly events to expand
    
    plans.forEach(plan => {
        // Collect main arc events
        if (plan.events && Array.isArray(plan.events)) {
            plan.events.forEach(event => {
                const parsed = parseTiming(event.timing);
                if (parsed) {
                    // --- FIX 1 START ---
                    // Create a single 'arcTitle' property instead of 'planTitle'
                    const eventWithParsing = { ...event, parsedTiming: parsed, arcTitle: plan.title };
                    // --- FIX 1 END ---
                    if (event.yearly) {
                        yearlyEvents.push(eventWithParsing);
                    } else {
                        regularEvents.push(eventWithParsing);
                    }
                }
            });
        }
        
        // Collect sub-arc events
        if (plan.subArcs && Array.isArray(plan.subArcs)) {
            plan.subArcs.forEach(subArc => {
                if (subArc.events && Array.isArray(subArc.events)) {
                    subArc.events.forEach(event => {
                        const parsed = parseTiming(event.timing);
                        if (parsed) {
                            // --- FIX 2 START ---
                            // Create a combined 'arcTitle' property with the correct arrow separator
                            const eventWithParsing = { 
                                ...event, 
                                parsedTiming: parsed, 
                                arcTitle: `${plan.title} → ${subArc.title}` // Use the actual arrow character with spaces
                            };
                            // --- FIX 2 END ---
                            if (event.yearly) {
                                yearlyEvents.push(eventWithParsing);
                            } else {
                                regularEvents.push(eventWithParsing);
                            }
                        }
                    });
                }
            });
        }
    });
    
    // Get years that have regular events
    const yearsWithEvents = [...new Set(regularEvents.map(e => e.parsedTiming.year))];
    
    // Expand yearly events only for those years
    const expandedYearlyEvents = expandYearlyEvents(yearlyEvents, yearsWithEvents);
    
    return [...regularEvents, ...expandedYearlyEvents];
}

// Collect storylines with timing information (add after collectAllEventsWithTiming)
function collectStorylinesWithTiming(storylines) {
    const timedStorylines = [];
    
    if (!storylines || !Array.isArray(storylines)) {
        return timedStorylines;
    }
    
    storylines.forEach(storyline => {
        // Only include visible storylines with timing
        if (storyline.visible !== false && storyline.timing) {
            const parsed = parseTiming(storyline.timing);
            if (parsed) {
                timedStorylines.push({
                    ...storyline,
                    parsedTiming: parsed,
                    isStoryline: true // Flag to identify storylines
                });
            }
        }
    });
    
    return timedStorylines;
}

// collectTimelineFilterData function in timeline-html.js
// Change this function to collect from plan.tags instead of plan.characterTags
function collectTimelineFilterData(allEvents, plans) {
    const uniqueTags = new Set();
    let minYear = Infinity;
    let maxYear = -Infinity;
    
    // Collect VISIBLE tags from plan-level filter tags (plan.tags) 
    if (plans && Array.isArray(plans)) {
        plans.forEach(plan => {
            if (plan.tags && Array.isArray(plan.tags)) {
                const visibleTags = getVisibleTags(plan.tags);
                visibleTags.forEach(tag => {
                    if (tag && tag.trim()) {
                        uniqueTags.add(tag.trim());
                    }
                });
            }
        });
    }
    
    // Also collect character tags from events
    if (allEvents && Array.isArray(allEvents)) {
        allEvents.forEach(event => {
            // Collect character tags
            if (event.characterTags && Array.isArray(event.characterTags)) {
                const visibleCharacterTags = getVisibleTags(event.characterTags);
                visibleCharacterTags.forEach(tag => {
                    if (tag && tag.trim()) {
                        uniqueTags.add(tag.trim());
                    }
                });
            }
            
            // Collect year range
            if (event.parsedTiming && event.parsedTiming.year !== null) {
                minYear = Math.min(minYear, event.parsedTiming.year);
                maxYear = Math.max(maxYear, event.parsedTiming.year);
            }
        });
    }
    
    // Handle case where no years are found
    if (minYear === Infinity) {
        minYear = null;
        maxYear = null;
    }
    
    return {
        uniqueTags: Array.from(uniqueTags).sort(),
        yearRange: { min: minYear, max: maxYear }
    };
}


// Generate timeline navigation with proper arrow character and theme colors
function generateTimelineNavigation(uniqueTags, yearRange) {
    let navHTML = `
        <div class="timeline-navigation" id="timeline-nav">
            <div class="timeline-nav-header" data-lore-action="toggle-timeline-navigation">
                <span class="timeline-nav-title">Filter Timeline</span>
                <span class="timeline-nav-toggle">&#9654;</span>
            </div>
            <div class="timeline-nav-content collapsed">
                <div class="timeline-filter-controls">
                    <input type="text" class="timeline-search" id="timeline-search" placeholder="Search events...">
                    <div class="timeline-filter-mode-buttons">
                        <button class="timeline-filter-mode-option active" id="timeline-filter-mode-any" data-lore-action="set-timeline-filter-mode" data-mode="any">Any</button>
                        <button class="timeline-filter-mode-option" id="timeline-filter-mode-all" data-lore-action="set-timeline-filter-mode" data-mode="all">All</button>
                    </div>
                    <button class="timeline-clear-selected-btn" id="timeline-clear-selected-btn" data-lore-action="clear-timeline-tags">Clear</button>
                </div>`;

    // Character tags section - only show visible tags
    if (uniqueTags.length > 0) {
        navHTML += '<div class="timeline-tag-links">';
        
        uniqueTags.forEach(tag => {
            const parsed = parseTagWithColor(tag);
            let styleAttr = '';
            if (parsed.bgColor) {
                const textColor = parsed.textColor || getContrastingTextColor(parsed.bgColor);
                const hoverColor = parsed.hoverColor || parsed.bgColor;
                styleAttr = ` style="background-color: ${parsed.bgColor}; color: ${textColor}; --hover-color: ${hoverColor};"`;
            }
            const escapedTag = window.LoreGenerationSecurity.escapeAttribute(tag);
            navHTML += `<div class="timeline-tag-link" data-lore-action="toggle-timeline-tag" data-tag="${escapedTag}"${styleAttr}>${parsed.name}</div>`;
        });
        
        navHTML += '</div>';
    }

    // Year range section
    if (yearRange.min !== null && yearRange.max !== null) {
        navHTML += `
                <div class="timeline-year-range">
                    <label>From: <input type="number" class="timeline-year-input" id="timeline-year-from" min="${yearRange.min}" max="${yearRange.max}" placeholder="${yearRange.min}"></label>
                    <label>To: <input type="number" class="timeline-year-input" id="timeline-year-to" min="${yearRange.min}" max="${yearRange.max}" placeholder="${yearRange.max}"></label>
                </div>`;
    }

    navHTML += `
            </div>
        </div>`;
    
    return navHTML;
}

// Parse timing string (Hour X, Day Y, Month Z, Year W)
// Parse timing - handles both NEW object format and LEGACY string format
function parseTiming(timing) {
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
                timeStr = ` ${timing.time.hour}`;
                if (timing.time.minute !== undefined && timing.time.minute !== null) {
                    timeStr += `:${String(timing.time.minute).padStart(2, '0')}`;
                }
                timeStr += ` ${timing.time.period}`;
            } else if (timeFormat === '24') {
                timeStr = ` ${String(timing.time.hour).padStart(2, '0')}`;
                if (timing.time.minute !== undefined && timing.time.minute !== null) {
                    timeStr += `:${String(timing.time.minute).padStart(2, '0')}`;
                }
            } else if (timeFormat === 'custom') {
                const divName = timeSystem.timeDivisions.useDivisionNames && timeSystem.timeDivisions.divisionNames?.[timing.time.division]
                    ? timeSystem.timeDivisions.divisionNames[timing.time.division]
                    : `Division ${timing.time.division}`;
                const subdivisionName = timeSystem.timeDivisions.subdivisionName || 'minutes';
                timeStr = ` ${divName}`;
                if (timing.time.subdivision !== undefined && timing.time.subdivision !== null) {
                    timeStr += `, ${timing.time.subdivision} ${subdivisionName}`;
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
                        : `Division ${timing.endTime.division}`;
                    endTimeStr = `, ${divName}`;
                    // Only add subdivision if explicitly set
                    if (timing.endTime.subdivision !== undefined && timing.endTime.subdivision !== null) {
                        const subdivisionName = timeSystem.timeDivisions.subdivisionName || 'minutes';
                        endTimeStr += ` ${timing.endTime.subdivision} ${subdivisionName}`;
                    }
                }
                
                endText += endTimeStr;
            }
            
            result.originalText += ` → ${endText}`;
        }
        } else {
            // Fallback if time system not found
            result.originalText = `Month ${result.month + 1}, Day ${result.day}, Year ${result.year}`;
            if (result.hasEndDate) {
                result.originalText += ` → Month ${result.endMonth + 1}, Day ${result.endDay}, Year ${result.endYear}`;
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

// Group events by year
function groupEventsByYear(events) {
    const eventsByYear = {};
    
    events.forEach(event => {
        const year = event.parsedTiming.year || 0; // Default to Year 0 if no year specified
        if (!eventsByYear[year]) {
            eventsByYear[year] = [];
        }
        eventsByYear[year].push(event);
    });
    
    // Sort events within each year
    Object.keys(eventsByYear).forEach(year => {
        eventsByYear[year].sort((a, b) => {
            const aTime = a.parsedTiming;
            const bTime = b.parsedTiming;
            
            // Sort by month, then day, then hour
            if ((aTime.month || 0) !== (bTime.month || 0)) {
                return (aTime.month || 0) - (bTime.month || 0);
            }
            if ((aTime.day || 0) !== (bTime.day || 0)) {
                return (aTime.day || 0) - (bTime.day || 0);
            }
            if ((aTime.hour || 0) !== (bTime.hour || 0)) {
                return (aTime.hour || 0) - (bTime.hour || 0);
            }
            
            // If timing is identical, sort alphabetically by title
            return (a.title || '').localeCompare(b.title || '');
        });
    });
    
    return eventsByYear;
}

// Generate events for a specific year with NAMESPACED classes
function generateYearEvents(events) {
    let eventsHTML = '';
    
    // Group events with identical timing for stacking
    const stackedEvents = {};
    events.forEach((event, index) => {
        const timingKey = `${event.parsedTiming.month || 0}-${event.parsedTiming.day || 0}-${event.parsedTiming.hour || 0}`;
        if (!stackedEvents[timingKey]) {
            stackedEvents[timingKey] = [];
        }
        stackedEvents[timingKey].push(event);
    });
    
    let eventIndex = 0;
    Object.values(stackedEvents).forEach(eventGroup => {
        if (eventGroup.length === 1) {
            // Single event
            eventsHTML += generateSingleTimelineEvent(eventGroup[0], eventIndex);
        } else {
            // Multiple events with same timing
            eventsHTML += generateStackedTimelineEvents(eventGroup, eventIndex);
        }
        eventIndex++;
    });
    
    return eventsHTML;
}

// Generate events for a specific year WITH side tracking
function generateYearEventsWithSide(events, startSide) {
    let eventsHTML = '';
    let currentSide = startSide;
    
    // Group events with identical timing for stacking
    const stackedEvents = {};
    events.forEach((event, index) => {
        const timingKey = `${event.parsedTiming.month || 0}-${event.parsedTiming.day || 0}-${event.parsedTiming.hour || 0}`;
        if (!stackedEvents[timingKey]) {
            stackedEvents[timingKey] = [];
        }
        stackedEvents[timingKey].push(event);
    });
    
    let eventIndex = 0;
    Object.values(stackedEvents).forEach(eventGroup => {
        if (eventGroup.length === 1) {
            // Single event
            eventsHTML += generateSingleTimelineEventWithSide(eventGroup[0], eventIndex, currentSide);
        } else {
            // Multiple events with same timing
            eventsHTML += generateStackedTimelineEventsWithSide(eventGroup, eventIndex, currentSide);
        }
        // Toggle side for next event
        currentSide = currentSide === 'left' ? 'right' : 'left';
        eventIndex++;
    });
    
    return { html: eventsHTML, endSide: currentSide };
}

// =============================================================================
// HELPER FUNCTIONS FOR COLORS AND TOOLTIPS - KEEP ALL OF THESE
// =============================================================================

// Get arc/subarc color from arcTitle
function getArcColorFromTitle(arcTitle) {
    if (!arcTitle || typeof infoData === 'undefined' || !infoData.plans) {
        return '#6c757d'; // Default gray
    }
    
    // Check if it's a sub-arc (contains →)
    if (arcTitle.includes('→')) {
        const [mainArcTitle, subArcTitle] = arcTitle.split('→').map(s => s.trim());
        
        // Find the main arc
        const mainArc = infoData.plans.find(p => p.title === mainArcTitle);
        if (!mainArc) return '#6c757d';
        
        // Find the sub-arc
        if (mainArc.subArcs) {
            const subArc = mainArc.subArcs.find(sa => sa.title === subArcTitle);
            if (subArc && subArc.color) {
                return subArc.color;
            }
            // If sub-arc doesn't have its own color, use adjusted main arc color
            if (mainArc.color) {
                return adjustColorBrightness(mainArc.color, 30);
            }
        }
    } else {
        // It's a main arc
        const arc = infoData.plans.find(p => p.title === arcTitle);
        if (arc && arc.color) {
            return arc.color;
        }
    }
    
    return '#6c757d';
}

// Utility function to adjust color brightness
function adjustColorBrightness(hex, percent) {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Parse RGB
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Adjust brightness
    const newR = Math.min(255, Math.max(0, r + (255 - r) * percent / 100));
    const newG = Math.min(255, Math.max(0, g + (255 - g) * percent / 100));
    const newB = Math.min(255, Math.max(0, b + (255 - b) * percent / 100));
    
    // Convert back to hex
    return `#${Math.round(newR).toString(16).padStart(2, '0')}${Math.round(newG).toString(16).padStart(2, '0')}${Math.round(newB).toString(16).padStart(2, '0')}`;
}

// Get character color by name
function getCharacterColor(characterName) {
    if (typeof infoData !== 'undefined' && infoData.characters) {
        const character = infoData.characters.find(char => 
            char.name && char.name.toLowerCase() === characterName.toLowerCase()
        );
        if (character && character.color) {
            return character.color;
        }
    }
    
    // Fallback to a default color
    return '#6c757d';
}

// Helper function to convert hex to HSL
function hexToHsl(hex) {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Parse RGB
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    
    return {
        h: h * 360,
        s: s * 100,
        l: l * 100
    };
}

// Mix multiple character colors
function mixCharacterColors(colors) {
    let totalH = 0, totalS = 0, totalL = 0;
    let validColors = 0;
    
    colors.forEach(color => {
        const hsl = hexToHsl(color);
        totalH += hsl.h;
        totalS += hsl.s;
        totalL += hsl.l;
        validColors++;
    });
    
    const avgH = totalH / validColors;
    const avgS = totalS / validColors;
    const avgL = Math.max(30, Math.min(70, totalL / validColors)); // Keep it readable
    
    return `hsl(${Math.round(avgH)}, ${Math.round(avgS)}%, ${Math.round(avgL)}%)`;
}

// Generate rich tooltip content with character tags using their colors
function generateRichTooltip(event) {
    let content = event.title || 'Untitled Event';
    
    // Add timing information with full date range
    if (event.parsedTiming && event.parsedTiming.originalText) {
        content += `<div class="tl-tooltip-timing">${event.parsedTiming.originalText}</div>`;
    }
    
    // Add duration indicator if it's a date range
    if (event.parsedTiming && event.parsedTiming.hasEndDate) {
        content += `<div class="tl-tooltip-duration" style="font-style: italic; color: var(--text-muted); font-size: 0.85em;">Duration event</div>`;
    }
    
    // Add character tags with colors if they exist - only show visible tags
    if (event.characterTags && event.characterTags.length > 0) {
        const visibleCharacterTags = getVisibleTags(event.characterTags);
        if (visibleCharacterTags.length > 0) {
            const characterTagsHTML = visibleCharacterTags.map(tag => {
                const characterColor = getCharacterColor(tag);
                return `<span class="tl-tooltip-character-tag" style="color: ${characterColor}">${tag}</span>`;
            }).join(' ');
            
            content += `<div class="tl-tooltip-characters">Characters: ${characterTagsHTML}</div>`;
        }
    }
    
    // Add notes preview if available
    if (event.notes && event.notes.trim()) {
        const notesPreview = event.notes.length > 100 
            ? event.notes.substring(0, 100) + '...' 
            : event.notes;
        content += `<div class="tl-tooltip-notes">${notesPreview}</div>`;
    }
    
    return `<div class="tl-node-tooltip">${content}</div>`;
}

// =============================================================================
// UPDATED CHRONOLOGICAL TIMELINE EVENT GENERATION
// =============================================================================

// Single timeline event - now uses arc color for marker and rich tooltips
// Single timeline event with explicit side
function generateSingleTimelineEventWithSide(event, index, side) {
    const isYearly = event.isYearlyInstance === true;
    const yearlyClass = isYearly ? ' tl-yearly-event' : '';
    const hasNotes = event.notes && event.notes.trim();
    const hasImage = event.image && event.image.trim();
    const hasDuration = event.parsedTiming && event.parsedTiming.hasEndDate;
    
    const arcColor = getArcColorFromTitle(event.arcTitle);
    const borderColor = hasImage ? arcColor : '';
    const allCharacterTagsStripped = event.characterTags ? event.characterTags.map(stripHiddenPrefix).join(',').toLowerCase() : '';
    const eventId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const seasonalBg = setSeasonalBackground(event);
    const richTooltip = generateRichTooltip(event);

    return `
            <div class="tl-timeline-event tl-${side}-side ${hasImage ? 'has-image' : ''}${yearlyClass}"
            data-character-tags="${allCharacterTagsStripped}"
            data-event-type="${event.type || 'rising'}"
            data-year="${event.parsedTiming.year || 0}">
            <div class="tl-event-card" ${seasonalBg} ${hasNotes ? `data-lore-action="show-event-notes" data-event-id="${eventId}"` : ''}>
                <div class="tl-event-arc-title"><span class="tl-arc-link" data-lore-action="open-plan-from-timeline" data-arc-title="${window.LoreGenerationSecurity.escapeAttribute(event.arcTitle || 'Unknown Arc')}">${event.arcTitle || 'Unknown Arc'}</span></div>
                <div class="tl-event-title">
                    ${event.title || 'Untitled Event'}
                    ${hasDuration ? '<span class="tl-duration-badge" title="Duration event">⏱</span>' : ''}
                </div>
                <div class="tl-event-timing">${event.parsedTiming.originalText}</div>
                ${hasImage ? `<div class="tl-event-image" style="border-color: ${borderColor};"><img src="${event.image}" alt="${event.title}" /></div>` : ''}
                ${hasNotes ? '<div class="tl-chrono-notes-indicator">♦</div>' : ''}
                ${richTooltip}
            </div>
            <div class="tl-timeline-marker" style="background-color: ${arcColor};"></div>
            ${hasNotes ? `<script>window.eventData = window.eventData || {}; window.eventData['${eventId}'] = ${JSON.stringify({
                title: event.title || 'Untitled Event',
                arcTitle: event.arcTitle || 'Unknown Arc',
                timing: event.parsedTiming.originalText,
                notes: event.notes || '',
                characterTags: event.characterTags || []
            })};</script>` : ''}
        </div>`;
}

// Stacked timeline events - now uses arc color for marker and rich tooltips
// Stacked timeline events with explicit side
function generateStackedTimelineEventsWithSide(events, index, side) {
    const isYearly = events.isYearlyInstance === true;
    const yearlyClass = isYearly ? ' tl-yearly-event' : '';
    const allCharacterTags = new Set();
    events.forEach(event => {
        if (event.characterTags && Array.isArray(event.characterTags)) {
            event.characterTags.forEach(tag => allCharacterTags.add(stripHiddenPrefix(tag)));
        }
    });
    const combinedTagsForFiltering = Array.from(allCharacterTags).join(',').toLowerCase();
    const containerSeasonalBg = setSeasonalBackground(events[0]);
    const arcColor = getArcColorFromTitle(events[0].arcTitle);

// Check if any event in the stack has an image
    const stackHasImage = events.some(e => e.image && e.image.trim());

    let stackedHTML = `
        <div class="tl-timeline-event tl-${side}-side ${stackHasImage ? 'has-image' : ''}${yearlyClass}"
            data-character-tags="${combinedTagsForFiltering}"
            data-event-type="${events[0].type || 'rising'}"
            data-year="${events[0].parsedTiming.year || 0}">
            <div class="tl-stacked-events" ${containerSeasonalBg}>`;
    
    events.forEach((event, eventIndex) => {
        const hasNotes = event.notes && event.notes.trim();
        const hasImage = event.image && event.image.trim();
        const hasDuration = event.parsedTiming && event.parsedTiming.hasEndDate;
        const eventArcColor = getArcColorFromTitle(event.arcTitle);
        const borderColor = hasImage ? eventArcColor : '';
        const eventId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const richTooltip = generateRichTooltip(event);
        
        // Get this specific event's character tags
        const eventCharTags = event.characterTags ? 
            event.characterTags.map(tag => stripHiddenPrefix(tag)).join(',').toLowerCase() : '';

        stackedHTML += `
            <div class="tl-event-card" 
                data-character-tags="${eventCharTags}"
                ${hasNotes ? `data-lore-action="show-event-notes" data-event-id="${eventId}"` : ''}>
                <div class="tl-event-arc-title"><span class="tl-arc-link" data-lore-action="open-plan-from-timeline" data-arc-title="${window.LoreGenerationSecurity.escapeAttribute(event.arcTitle || 'Unknown Arc')}">${event.arcTitle || 'Unknown Arc'}</span></div>
                <div class="tl-event-title">
                    ${event.title || 'Untitled Event'}
                    ${hasDuration ? '<span class="tl-duration-badge" title="Duration event">⏱</span>' : ''}
                </div>
                <div class="tl-event-timing">${event.parsedTiming.originalText}</div>
                ${hasImage ? `<div class="tl-event-image" style="border-color: ${borderColor};"><img src="${event.image}" alt="${event.title}" /></div>` : ''}
                ${hasNotes ? '<div class="tl-chrono-notes-indicator">♦</div>' : ''}
                ${richTooltip}
            </div>
            ${hasNotes ? `<script>window.eventData = window.eventData || {}; window.eventData['${eventId}'] = ${JSON.stringify({
                title: event.title || 'Untitled Event',
                arcTitle: event.arcTitle || 'Unknown Arc',
                timing: event.parsedTiming.originalText,
                notes: event.notes || '',
                characterTags: event.characterTags || []
            })};</script>` : ''}`;
    });
    
    stackedHTML += `
            </div>
            <div class="tl-timeline-marker" style="background-color: ${arcColor};"></div>
        </div>`;
    
    return stackedHTML;
}

// SEASONAL BACKGROUND FUNCTION with background image support
function setSeasonalBackground(event) {
    // CHECK FOR BACKGROUND IMAGE FIRST
    if (event.background && event.background.trim()) {
        // Set as CSS custom property so pseudo-element can use it
        return `style="--event-bg-image: url('${event.background}');"`;
    }
    
    // FALLBACK TO SEASONAL COLOR (existing logic)
    let month = null;
    let day = null;
    let timeSystemId = (typeof infoData !== 'undefined' && infoData.plansOptions?.selectedTimeSystemId) 
        ? infoData.plansOptions.selectedTimeSystemId 
        : 'default';
    
    // Check if event has parsedTiming (from timeline)
    if (event.parsedTiming?.month !== undefined && event.parsedTiming?.month !== null) {
        month = event.parsedTiming.month;
        day = event.parsedTiming.day || 1;
    } 
    // Check if event has new structured timing format
    else if (event.timing && typeof event.timing === 'object' && event.timing.date) {
        month = event.timing.date.month;
        day = event.timing.date.day || 1;
        timeSystemId = event.timing.timeSystemId || 'default';
    }
    // Check if event has legacy string timing
    else if (event.timing && typeof event.timing === 'string') {
        const timing = event.timing;
        
        const monthMatch = timing.match(/month\s+(\d+)|(\d+)\s*(?:st|nd|rd|th)?\s*month/i);
        if (monthMatch) {
            month = parseInt(monthMatch[1] || monthMatch[2]) - 1;
        }
        
        const dayMatch = timing.match(/day\s+(\d+)|(\d+)\s*(?:st|nd|rd|th)?\s*day/i);
        if (dayMatch) {
            day = parseInt(dayMatch[1] || dayMatch[2]);
        }
    }
    
    // If we have a month, find which season it belongs to
    if (month !== null) {
        const timeSystem = getTimeSystemById(timeSystemId);
        
        if (timeSystem && timeSystem.seasons && timeSystem.seasons.length > 0) {
            const seasonColor = getSeasonColorForDate(month, day || 1, timeSystem);
            if (seasonColor) {
                return `style="--seasonal-bg: ${seasonColor}"`;
            }
        }
    }
    
    // Fallback to default container background
    const colors = (typeof getColorScheme === 'function') ? getColorScheme() : {
        containerBg: '#ffffff'
    };
    return `style="--seasonal-bg: ${colors.containerBg}"`;
}

// Helper function to determine which season a date falls into
function getSeasonColorForDate(month, day, timeSystem) {
    return window.LoreDomainHelpers.getSeasonColorForDate(month, day, timeSystem);
}

function getEventTypeColor(type) {
    // You can access your color scheme here
    const colors = (typeof getColorScheme === 'function') ? getColorScheme() : {};
    
    switch (type) {
        case 'none':
            return colors.textMuted || '#696764';
        case 'exposition':
            return colors.physical || '#4D96E4';
        case 'rising':
            return colors.statusCanon || '#28a745';
        case 'setback':
            return colors.statusIdea || '#dc3545';
        case 'climax':
            return colors.statusDraft || '#ffc107';
        case 'resolution':
            return colors.hobbies || '#075AFF';
        default:
            return colors.statusCanon || '#696764';
    }
}

// Generate the event notes modal with NAMESPACED classes
function generateEventNotesModal() {
    return `
        <div id="tl-event-notes-modal" class="tl-event-notes-modal" data-lore-action="hide-event-notes">
            <div class="tl-event-notes-modal-content">
                <div class="tl-event-notes-modal-header">
                    <h3 id="tl-event-notes-modal-title" class="tl-event-notes-modal-title"></h3>
                    <button class="tl-event-notes-modal-close" data-lore-action="hide-event-notes">&times;</button>
                </div>
                <div id="tl-event-notes-modal-arc" class="tl-event-notes-modal-arc"></div>
                <div id="tl-event-notes-modal-timing" class="tl-event-notes-modal-timing"></div>
                <div id="tl-event-notes-modal-notes" class="tl-event-notes-modal-notes"></div>
            </div>
        </div>`;
}

// Enhanced version that keeps ALL your existing functionality with compact filtering
// Timeline JavaScript generation with proper Arc view filtering and Unicode arrows
