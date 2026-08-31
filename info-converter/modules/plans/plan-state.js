// Plan editor state
// Plan/Arc modal functions with sub-arcs support
let currentEditingEvents = []; // Track main arc events during editing session
let currentEditingSubArcs = []; // Track sub-arcs during editing session
let editingSubArcIndex = -1; // Track which sub-arc is being edited
let currentEditingSubArcEvents = []; // Track events within the current sub-arc being edited
// Global variables for subevent management
let currentEditingSubevents = []; // Working copy of subevents during event editing
let editingSubeventIndex = -1; // Track which subevent is being edited
// Event date/time editing state
let eventEditingDate = null;
let eventEditingTime = null;
let eventEditingEndDate = null; 
let eventEditingEndTime = null; 
let isSelectingEndDate = false;
