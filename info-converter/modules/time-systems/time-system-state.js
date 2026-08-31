// Calendar registry and editor state
// Time Systems Module for Lore Codex
// Manages custom calendar and time systems for story planning

// Current editing state
let currentEditingCalendar = null;
let originalCalendarState = null;
//let userTimeSystems = []; // Will be loaded from backend
// Mini calendar state
let miniCalCurrentMonth = 0;
let miniCalCurrentYear = 2025;
let miniCalSelectedDate = null;
let miniCalEditingEraIndex = -1;

// Initialize on window so it's globally accessible
if (typeof window.userTimeSystems === 'undefined') {
    window.userTimeSystems = [];
}
let userTimeSystems = window.userTimeSystems;

// Default calendar definition (immutable)
const DEFAULT_CALENDAR = {
    id: 'default',
    name: 'Default (Gregorian)',
    isDefault: true,
    calendarType: 'solar',
    months: [
        { name: 'January', days: 31 },
        { name: 'February', days: 28 },
        { name: 'March', days: 31 },
        { name: 'April', days: 30 },
        { name: 'May', days: 31 },
        { name: 'June', days: 30 },
        { name: 'July', days: 31 },
        { name: 'August', days: 31 },
        { name: 'September', days: 30 },
        { name: 'October', days: 31 },
        { name: 'November', days: 30 },
        { name: 'December', days: 31 }
    ],
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    epochDay: 0, // Sunday
    timeDivisions: {
        divisionsPerDay: 24,
        minutesPerDivision: 60,
        subdivisionName: 'minutes',
        useDivisionNames: false,
        divisionNames: []
    },
    eras: [
        {
            name: 'Before Common Era',
            abbreviation: 'BCE',
            startDate: { year: -1440, month: 11, day: 16 }, // December 16, 1440 BCE
            isBackward: true
        },
        {
            name: 'Common Era',
            abbreviation: 'CE',
            startDate: { year: 1, month: 0, day: 1 }, // January 1, 1 CE
            isBackward: false
        }
    ],
    endDate: { year: 3000, month: 11, day: 31 }, // December 31, 3000
    seasons: [
        {
            name: 'Spring',
            startDate: { month: 2, day: 20 }, // March 20
            color: '#7BAE9D' // green
        },
        {
            name: 'Summer',
            startDate: { month: 5, day: 21 }, // June 21
            color: '#C5B291' // orange
        },
        {
            name: 'Fall',
            startDate: { month: 8, day: 22 }, // September 22
            color: '#B18484' // red
        },
        {
            name: 'Winter',
            startDate: { month: 11, day: 21 }, // December 21
            color: '#7189AF' // blue
        }
    ],
    moonPhases: {
        enabled: false,
        cycleLength: 29.53,
        epochNewMoon: { year: 1, month: 0, day: 1 } // Use first era start as default
    },
    settings: {
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12'
    }
};

const PRESET_CHINESE_CALENDAR = {
    id: 'preset-chinese',
    name: 'Traditional Chinese',
    isDefault: true, // read-only like Gregorian
    calendarType: 'lunisolar',
    
    months: [
        { name: 'First Month', days: 30 },
        { name: 'Second Month', days: 29 },
        { name: 'Third Month', days: 30 },
        { name: 'Fourth Month', days: 29 },
        { name: 'Fifth Month', days: 30 },
        { name: 'Sixth Month', days: 29 },
        { name: 'Seventh Month', days: 30 },
        { name: 'Eighth Month', days: 29 },
        { name: 'Ninth Month', days: 30 },
        { name: 'Tenth Month', days: 29 },
        { name: 'Eleventh Month', days: 30 },
        { name: 'Twelfth Month', days: 29 }
    ],
    
    weekdays: [], // No weekdays for lunisolar
    
    namedDays: [
        { day: 1, name: 'New Moon' },
        { day: 15, name: 'Full Moon' }
    ],
    
    timeDivisions: {
        divisionsPerDay: 12,
        minutesPerDivision: 120,
        subdivisionName: 'Ke',
        useDivisionNames: true,
        divisionNames: [
            'Hour of the Rat', 'Hour of the Ox', 'Hour of the Tiger',
            'Hour of the Rabbit', 'Hour of the Dragon', 'Hour of the Snake',
            'Hour of the Horse', 'Hour of the Goat', 'Hour of the Monkey',
            'Hour of the Rooster', 'Hour of the Dog', 'Hour of the Pig'
        ]
    },
    
    eras: [
        {
            name: 'Tang Dynasty',
            abbreviation: '唐',
            // Note: Dates are mapped to Gregorian years for simplicity.
            // The actual start would be the first day of the lunar year 618.
            startDate: { year: 618, month: 0, day: 1 },
            endDate: { year: 907, month: 11, day: 29 }, // Using a generic end-of-last-month
            isBackward: false
        },
        {
            name: 'Song Dynasty',
            abbreviation: '宋',
            startDate: { year: 960, month: 0, day: 1 },
            endDate: { year: 1279, month: 11, day: 29 },
            isBackward: false
        },
        {
            name: 'Yuan Dynasty',
            abbreviation: '元',
            startDate: { year: 1271, month: 0, day: 1 },
            endDate: { year: 1368, month: 11, day: 29 },
            isBackward: false
        },
        {
            name: 'Ming Dynasty',
            abbreviation: '明',
            startDate: { year: 1368, month: 0, day: 1 },
            endDate: { year: 1644, month: 11, day: 29 },
            isBackward: false
        },
        {
            name: 'Qing Dynasty',
            abbreviation: '清',
            startDate: { year: 1644, month: 0, day: 1 },
            endDate: { year: 1912, month: 11, day: 29 },
            isBackward: false
        },
        {
            name: 'Republic of China',
            abbreviation: '民国',
            startDate: { year: 1912, month: 0, day: 1 },
            endDate: { year: 1949, month: 11, day: 29 },
            isBackward: false
        },
        {
            name: 'Modern Era',
            abbreviation: '现', // Abbreviation for Xiàndài (现代)
            startDate: { year: 1949, month: 0, day: 1 },
            // No endDate, as this era continues to the present
            isBackward: false
        }
    ],
    
    endDate: { year: 3000, month: 11, day: 29 },
    
    seasons: [
        {
            name: 'Spring',
            // Starts on the first day of the First Month (正月)
            startDate: { month: 0, day: 1 }, 
            color: '#82B193' // wood green
        },
        {
            name: 'Summer',
            // Starts on the first day of the Fourth Month (四月)
            startDate: { month: 3, day: 1 },
            color: '#BFA18B' // fire orange
        },
        {
            name: 'Autumn',
            // Starts on the first day of the Seventh Month (七月)
            startDate: { month: 6, day: 1 },
            color: '#AB997C' // metal gold
        },
        {
            name: 'Winter',
            // Starts on the first day of the Tenth Month (十月)
            startDate: { month: 9, day: 1 },
            color: '#B1C0D3' // water blue
        }
    ],
    
    moonPhases: {
        enabled: true,
        cycleLength: 29.53,
        epochNewMoon: { year: 1, month: 0, day: 1 }
    },
    
    settings: {
        dateFormat: 'MMMM D, YYYY',
        timeFormat: 'custom'
    }
};

// Shared generation helpers load before the lazy calendar editor and read presets from window.
window.DEFAULT_CALENDAR = DEFAULT_CALENDAR;
window.PRESET_CHINESE_CALENDAR = PRESET_CHINESE_CALENDAR;

// Initialize time systems
