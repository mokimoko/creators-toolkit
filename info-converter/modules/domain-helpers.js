(function installLoreDomainHelpers(global) {
    function getTimeSystemById(id) {
        if (id === 'default') return global.DEFAULT_CALENDAR || null;
        if (id === 'preset-chinese') return global.PRESET_CHINESE_CALENDAR || null;
        return (global.userTimeSystems || []).find(system => system.id === id) || null;
    }

    function getIconPath(category, filename) {
        return `images/item-icons/${category}/${filename}`;
    }

    function calculateDayOfWeek(date, calendar) {
        const weekdays = calendar?.weekdays || [];
        const months = calendar?.months || [];
        const earliestEra = calendar?.eras?.[0];
        if (!weekdays.length || !months.length || !earliestEra?.startDate) return 0;

        const reference = earliestEra.startDate;
        const precedesReference = date.year < reference.year
            || (date.year === reference.year && date.month < reference.month)
            || (date.year === reference.year && date.month === reference.month && date.day < reference.day);
        if (precedesReference) return calendar.epochDay || 0;

        const daysPerYear = months.reduce((total, month) => total + month.days, 0);
        let totalDays = Math.max(0, date.year - reference.year) * daysPerYear;
        for (let month = date.year === reference.year ? reference.month : 0; month < date.month; month += 1) {
            totalDays += months[month]?.days || 0;
        }
        totalDays += date.day - (date.year === reference.year && date.month === reference.month ? reference.day : 0);

        const weekdayIndex = ((calendar.epochDay || 0) + totalDays) % weekdays.length;
        return weekdayIndex < 0 ? weekdayIndex + weekdays.length : weekdayIndex;
    }

    function formatDateWithFormat(date, format, calendar) {
        if (!date || !calendar) return '';

        const monthName = calendar.months?.[date.month]?.name || 'Unknown';
        const monthNumber = String(date.month + 1).padStart(2, '0');
        const dayNumber = String(date.day).padStart(2, '0');
        const year = Math.abs(date.year);
        const weekdayName = calendar.calendarType === 'solar' && calendar.weekdays?.length
            ? calendar.weekdays[calculateDayOfWeek(date, calendar)] || 'Unknown'
            : '';
        const eras = calendar.eras || [];
        let eraAbbreviation = '';
        for (let index = eras.length - 1; index >= 0; index -= 1) {
            if (date.year >= eras[index].startDate.year) {
                eraAbbreviation = eras[index].abbreviation || '';
                break;
            }
        }

        let result = format || 'MM/DD/YYYY';
        if (weekdayName) result = result.replace('DDDD', weekdayName);
        result = result.replace('MMMM', monthName);
        result = result.replace('YYYY', String(year));
        result = result.replace('MM', monthNumber);
        result = result.replace('DD', dayNumber);
        result = result.replace(/\bM\b/g, String(date.month + 1));
        result = result.replace(/\bD\b/g, String(date.day));
        return result.replace('E', eraAbbreviation);
    }

    function getSeasonColorForDate(month, day, timeSystem) {
        if (!timeSystem?.seasons?.length) return null;
        const seasons = [...timeSystem.seasons].sort((left, right) => (
            left.startDate.month - right.startDate.month
            || left.startDate.day - right.startDate.day
        ));
        let current = seasons[seasons.length - 1];

        for (let index = 0; index < seasons.length; index += 1) {
            const season = seasons[index];
            const next = seasons[(index + 1) % seasons.length];
            const afterStart = month > season.startDate.month
                || (month === season.startDate.month && day >= season.startDate.day);
            const beforeNext = month < next.startDate.month
                || (month === next.startDate.month && day < next.startDate.day);
            const wrapsYear = next.startDate.month < season.startDate.month;
            if ((wrapsYear && (afterStart || beforeNext)) || (!wrapsYear && afterStart && beforeNext)) {
                current = season;
                break;
            }
        }
        return current.color || null;
    }

    global.LoreDomainHelpers = Object.freeze({
        formatDateWithFormat,
        getIconPath,
        getSeasonColorForDate,
        getTimeSystemById
    });
    global.formatDateWithFormat = formatDateWithFormat;
    global.getIconPath = getIconPath;
})(window);
