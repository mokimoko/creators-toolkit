export function createEditorShell(dependencies) {
    function initializeProjectControls() {
        document.getElementById('load-project-btn')?.addEventListener('click', dependencies.loadProject);
        document.getElementById('refresh-projects-btn')?.addEventListener('click', dependencies.loadProjects);
        document.getElementById('create-assets-btn')?.addEventListener('click', dependencies.createAssetsFolder);

        const projectList = document.getElementById('project-list');
        projectList?.addEventListener('change', () => {
            const loadButton = document.getElementById('load-project-btn');
            if (loadButton) loadButton.disabled = !projectList.value;
            void dependencies.checkAssetsFolder(projectList.value || undefined);
        });
    }

    function initializeNavigationControls() {
        document.getElementById('nav-load-project-btn')?.addEventListener('click', dependencies.loadNavProject);
        const projectList = document.getElementById('nav-project-list');
        projectList?.addEventListener('change', () => {
            const loadButton = document.getElementById('nav-load-project-btn');
            if (loadButton) loadButton.disabled = !projectList.value;
        });
        document.getElementById('story-roleplay-dropdown')
            ?.addEventListener('change', dependencies.handleStorylineDropdownChange);
        document.getElementById('story-import-btn')?.addEventListener('click', dependencies.handleStorylineImport);
        dependencies.initializeImageImport();
    }

    function initializeCollapsibles() {
        let collapsibleIndex = 0;
        for (const header of document.querySelectorAll('.collapsible-header')) {
            collapsibleIndex += 1;
            header.addEventListener('click', () => dependencies.toggleCollapsible(header));
            header.setAttribute('role', 'button');
            header.tabIndex = 0;
            const content = header.nextElementSibling;
            if (content) {
                if (!content.id) content.id = `collapsible-content-${collapsibleIndex}`;
                header.setAttribute('aria-controls', content.id);
                header.setAttribute('aria-expanded', String(!content.classList.contains('collapsed')));
            }
            header.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                dependencies.toggleCollapsible(header);
            });
        }
    }

    function initializeModals() {
        for (const closeButton of document.querySelectorAll('.close, .btn-cancel')) {
            closeButton.addEventListener('click', () => dependencies.closeModal(closeButton.dataset.modal));
        }
        window.addEventListener('click', event => {
            if (event.target.classList.contains('modal')) dependencies.closeModal(event.target.id);
        });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            for (const modal of document.querySelectorAll('.modal[style*="block"]')) {
                dependencies.closeModal(modal.id);
            }
        });
    }

    function initializeTabs() {
        document.addEventListener('click', event => {
            const mainTab = event.target.closest('.main-tab');
            if (mainTab) return dependencies.switchMainTab(mainTab.dataset.tab);
            const subTab = event.target.closest('.tab');
            if (subTab) dependencies.switchSubTab(subTab.dataset.tab);
        });
    }

    function initializeKeyboardShortcuts() {
        document.addEventListener('keydown', event => {
            if (!(event.ctrlKey || event.metaKey)) return;
            if (event.key === 'g') {
                event.preventDefault();
                dependencies.generateHTML();
            } else if (event.key === 's') {
                event.preventDefault();
                if (dependencies.isLocal()) dependencies.saveToSitesFolder();
                else dependencies.downloadHTML();
            } else if (event.shiftKey && event.key === 'I') {
                event.preventDefault();
                document.getElementById(dependencies.isLocal() ? 'load-project-btn' : 'import-file')?.click();
            }
        });
    }

    function initializeEventListeners() {
        dependencies.initializeAccessibility();
        initializeProjectControls();
        dependencies.initializeEditorContextMenus();
        initializeCollapsibles();
        initializeModals();
        dependencies.initializeTextEditorModal();
        initializeTabs();
        dependencies.initializeButtons();
        dependencies.initializeFormListeners();
        dependencies.initializeSidebar();
        dependencies.populateTitleFontDropdown();
        initializeNavigationControls();
        dependencies.initializeOverviewBackgroundControls();
        dependencies.initializeModalBackgroundControls();
        dependencies.initializeMainContainerBackgroundControls();
        initializeKeyboardShortcuts();
    }

    return { initializeEventListeners };
}
