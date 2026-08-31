// Sidebar navigation and compact range-value display for RP Archiver.

function initializeSidebar() {
    const sidebar = document.querySelector('.content-sidebar');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const mobilePicker = document.getElementById('mobile-section-picker');

    if (!sidebar) return;

    if (sidebar.dataset.rpInitialized !== 'true') {
        sidebar.dataset.rpInitialized = 'true';

        sidebar.addEventListener('click', event => {
            const item = event.target.closest('.sidebar-item');
            if (!item || !sidebar.contains(item)) return;

            const category = item.getAttribute('data-category');
            if (category) switchToSection(category);
        });

        collapseBtn?.addEventListener('click', toggleSidebar);
        mobilePicker?.addEventListener('change', event => switchToSection(event.target.value));
    }

    initializeRangeSliders();

    const activeItem = document.querySelector('.sidebar-item.active');
    switchToSection(activeItem?.getAttribute('data-category') || 'story-info');
}

function toggleSidebar() {
    const sidebar = document.querySelector('.content-sidebar');
    const button = document.getElementById('sidebar-collapse-btn');
    if (!sidebar || !button) return;

    const collapsed = sidebar.classList.toggle('collapsed');
    button.textContent = collapsed ? '›' : '‹';
    button.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-expanded', String(!collapsed));
}

function switchToSection(sectionName) {
    document.querySelectorAll('.sidebar-item').forEach(item => {
        const active = item.getAttribute('data-category') === sectionName;
        item.classList.toggle('active', active);
        item.setAttribute('aria-current', active ? 'step' : 'false');
    });

    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.toggle('active', section.id === `${sectionName}-section`);
    });

    const mobilePicker = document.getElementById('mobile-section-picker');
    if (mobilePicker && mobilePicker.value !== sectionName) mobilePicker.value = sectionName;
}

function bindRangeValue(inputId, outputId, suffix) {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    if (!input || !output || input.dataset.rpRangeInitialized === 'true') return;

    input.dataset.rpRangeInitialized = 'true';
    const update = () => {
        output.textContent = input.value + suffix;
    };
    input.addEventListener('input', update);
    update();
}

function initializeRangeSliders() {
    bindRangeValue('title-font-size-banner', 'title-font-size-banner-value', 'px');
    bindRangeValue('title-font-size', 'title-font-size-value', 'px');
    bindRangeValue('background-opacity', 'opacity-value', '%');
    bindRangeValue('background-blur', 'blur-value', 'px');
}
