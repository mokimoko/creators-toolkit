(function defineMediaAssets(root) {
    'use strict';

    function extractImageInfo(htmlContent) {
        const imageInfo = {
            backgroundImage: null,
            bannerImage: null,
            storyImages: []
        };
        
        try {
            // Extract background image from CSS - improved to handle body::before
            let backgroundMatch = htmlContent.match(/body::before\s*{[\s\S]*?background-image:\s*url\(['"]([^'"]+)['"]\)/);
            if (!backgroundMatch) {
                // Fallback patterns
                backgroundMatch = htmlContent.match(/background-image:\s*url\(['"]([^'"]+)['"]\)/);
            }
            if (!backgroundMatch) {
                backgroundMatch = htmlContent.match(/background-image:\s*url\(([^)]+)\)/);
            }
            if (backgroundMatch) {
                imageInfo.backgroundImage = backgroundMatch[1].replace(/['"]/g, '');
                window.RPLogger?.debug('Found background image:', imageInfo.backgroundImage);
            }
            
            // Extract banner image from header CSS - improved to handle multiline
            let headerBgMatch = htmlContent.match(/header\s*{[\s\S]*?background-image:\s*url\(['"]([^'"]+)['"]\)/);
            if (!headerBgMatch) {
                // Try without quotes
                headerBgMatch = htmlContent.match(/header\s*{[\s\S]*?background-image:\s*url\(([^)]+)\)/);
            }
            if (headerBgMatch) {
                imageInfo.bannerImage = headerBgMatch[1].replace(/['"]/g, '');
                window.RPLogger?.debug('Found banner image:', imageInfo.bannerImage);
            }
            
            // Extract story images from gallery section
            const storyImageRegex = /<img[^>]+src="([^"]+)"[^>]*alt="Story Image"[^>]*>/g;
            let match;
            while ((match = storyImageRegex.exec(htmlContent)) !== null) {
                imageInfo.storyImages.push(match[1]);
                window.RPLogger?.debug('Found story image:', match[1]);
            }
            
        } catch (error) {
            window.RPLogger?.error('Error extracting image info:', error);
        }
        
        return imageInfo;
    }
    
    // Helper function to check images and display results
    async function checkImagesExistAndDisplay(universe, imageInfo, allImagePaths) {
        try {
            const userContext = window.userSessionManager ? window.userSessionManager.getUserContext() : { isGuest: true };
            
            window.RPLogger?.debug('Checking imported image paths');
            
            const imageExistenceData = await checkImagesExist(universe, allImagePaths, userContext);
            
            window.RPLogger?.debug('Image existence check result:', imageExistenceData);
            
            // Display images in the UI with existence info - UPDATE this call
            displayExistingImages(imageInfo.backgroundImage, imageInfo.bannerImage, imageInfo.storyImages, imageExistenceData);
            
        } catch (error) {
            window.RPLogger?.error('Error checking image existence:', error);
            // Fallback - assume all images are missing
            const fallbackData = { existingImages: [], missingImages: allImagePaths };
            displayExistingImages(imageInfo.backgroundImage, imageInfo.bannerImage, imageInfo.storyImages, fallbackData);
        }
    }
    
    // Helper function to check if images exist on server
    async function checkImagesExist(universe, imagePaths, userContext) {
        try {
            const response = await fetch('/api/roleplay/check-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    universe: universe,
                    imagePaths: imagePaths,
                    userContext: userContext
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                // Ensure result has required properties
                return {
                    existingImages: result.existingImages || [],
                    missingImages: result.missingImages || imagePaths
                };
            }
            window.RPLogger?.warn('Image check API response was not successful:', response.status);
            return { existingImages: [], missingImages: imagePaths || [] };
        } catch (error) {
            window.RPLogger?.warn('Could not check image existence:', error);
            return { existingImages: [], missingImages: imagePaths || [] };
        }
    }
    
    // Helper function to display existing images in the new UI
    function displayExistingImages(backgroundImage, bannerImage, storyImages, imageExistenceData) {
        // Safety check for undefined imageExistenceData
        if (!imageExistenceData) {
            window.RPLogger?.warn('Image existence data is unavailable; using fallback');
            imageExistenceData = { existingImages: [], missingImages: [] };
        }
        
        const backgroundContainer = document.getElementById('background-image-display');
        const bannerContainer = document.getElementById('banner-image-display');
        const storyContainer = document.getElementById('images-container');
        
        // Clear containers
        backgroundContainer.innerHTML = '';
        bannerContainer.innerHTML = '';      // ADD this
        storyContainer.innerHTML = '';
        
        // Handle background image
        if (backgroundImage) {
            const exists = imageExistenceData.existingImages.includes(backgroundImage);
            displayImagePlaceholder(backgroundContainer, backgroundImage, exists, true);
            if (exists) {
                backgroundContainer.classList.add('has-file');
            }
        } else {
            backgroundContainer.innerHTML = '<div class="file-display-empty">No background image selected</div>';
        }
        
        // Handle banner image - ADD this entire block
        if (bannerImage) {
            const exists = imageExistenceData.existingImages.includes(bannerImage);
            displayBannerImagePlaceholder(bannerImage, exists);
            if (exists) {
                bannerContainer.classList.add('has-file');
            }
        } else {
            bannerContainer.innerHTML = '<div class="file-display-empty">No banner image selected</div>';
        }
        
        // Handle story images (unchanged)
        if (storyImages.length > 0) {
            storyImages.forEach(imagePath => {
                const exists = imageExistenceData.existingImages.includes(imagePath);
                displayImagePlaceholder(storyContainer, imagePath, exists, false);
            });
        } else {
            storyContainer.innerHTML = '<div class="file-display-empty">No story images selected</div>';
        }
    }
    
    // Helper function to create image placeholders for existing images
    function displayImagePlaceholder(container, imagePath, exists, isBackground) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item' + (exists ? '' : ' missing-file');
        
        const filename = imagePath.split('/').pop();
        const statusText = exists ? 'Existing file' : 'Missing file - will be removed on save';
        
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-name">${filename}</div>
                <div class="file-size">${statusText}</div>
            </div>
            <button type="button" class="file-remove" title="Remove image">×</button>
        `;
        
        // Store image path info on the element
        fileItem._imagePath = imagePath;
        fileItem._exists = exists;
        
        // Add remove functionality
        const removeBtn = fileItem.querySelector('.file-remove');
        removeBtn.addEventListener('click', function() {
            fileItem.remove();
            if (isBackground) {
                container.classList.remove('has-file');
                container.innerHTML = '<div class="file-display-empty">No background image selected</div>';
            }
            if (container.children.length === 0 && !isBackground) {
                container.innerHTML = '<div class="file-display-empty">No story images selected</div>';
            }
        });
        
        container.appendChild(fileItem);
    }
    
    // Helper function to extract template information from imported HTML

    root.RPArchiver.define('mediaAssets', {
        checkImagesExist,
        checkImagesExistAndDisplay,
        displayExistingImages,
        displayImagePlaceholder,
        extractImageInfo
    });
})(window);

