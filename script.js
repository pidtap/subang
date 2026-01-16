document.addEventListener('DOMContentLoaded', function () {
    // === DOM Elements ===
    const productInput = document.getElementById('productInput');
    const productGallery = document.getElementById('product-gallery');
    const editorArea = document.getElementById('editor-area');
    const editorCanvas = document.getElementById('editor-canvas');
    const ctx = editorCanvas.getContext('2d');
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomInput = document.getElementById('zoom-input');
    const processBtn = document.getElementById('processBtn');
    const downloadLink = document.getElementById('downloadLink');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const imageCounter = document.getElementById('image-counter');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const resetBtn = document.getElementById('resetBtn');
    const confirmOverlay = document.getElementById('custom-confirm-overlay');
    const confirmYesBtn = document.getElementById('confirm-yes-btn');
    const confirmNoBtn = document.getElementById('confirm-no-btn');
    const frameToggle = document.getElementById('frameToggle');
    const watermarkToggle = document.getElementById('watermarkToggle');
    const watermarkControls = document.getElementById('watermark-controls');
    const watermarkZoomSlider = document.getElementById('watermarkZoomSlider');
    const watermarkInput = document.getElementById('watermark-input');

    // === State Variables ===
    const STORAGE_KEY = 'subagEditorState';
    let frameImage = new Image();
    let watermarkImage = new Image();
    let productItems = [];
    let currentProductImage = new Image();
    let activeProductIndex = -1;

    // Các biến trạng thái cho đối tượng đang active trên trình chỉnh sửa
    let scale = 1, offset = { x: 0, y: 0 };
    let watermarkScale = 0.3, watermarkOffset = { x: 0, y: 0 };

    // Snap State
    let isSnappedX = null;
    let isSnappedY = null;
    let isSnappedXType = 'major';
    let isSnappedYType = 'major';

    // Interaction State
    let isDragging = false, startDrag = { x: 0, y: 0 };
    let activeDragTarget = 'product';
    let initialPinchDistance = 0;



    function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error); }); }
    function base64ToFile(dataUrl, filename) { const arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1]; const bstr = atob(arr[1]); let n = bstr.length; const u8arr = new Uint8Array(n); while (n--) { u8arr[n] = bstr.charCodeAt(n); } return new File([u8arr], filename, { type: mime }); }

    async function saveState() {
        if (productItems.length === 0) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        if (activeProductIndex > -1 && productItems[activeProductIndex]) {
            const activeItem = productItems[activeProductIndex];
            activeItem.scale = scale;
            activeItem.offset = { ...offset };
            activeItem.watermarkScale = watermarkScale;
            activeItem.watermarkOffset = { ...watermarkOffset };
        }
        const savableItems = await Promise.all(productItems.map(async (item) => ({
            base64: await fileToBase64(item.file),
            name: item.file.name,
            scale: item.scale,
            offset: item.offset,
            isFrameEnabled: item.isFrameEnabled,
            isWatermarkEnabled: item.isWatermarkEnabled,
            watermarkScale: item.watermarkScale,
            watermarkOffset: item.watermarkOffset
        })));
        const state = { items: savableItems, activeIndex: activeProductIndex };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    async function loadState() {
        const savedStateJSON = localStorage.getItem(STORAGE_KEY);
        if (!savedStateJSON) return;

        try {
            const savedState = JSON.parse(savedStateJSON);

            productItems = savedState.items.map(item => ({
                file: base64ToFile(item.base64, item.name),
                scale: item.scale,
                offset: item.offset,
                isFrameEnabled: item.isFrameEnabled !== undefined ? item.isFrameEnabled : true,
                isWatermarkEnabled: item.isWatermarkEnabled !== undefined ? item.isWatermarkEnabled : false,
                watermarkScale: item.watermarkScale !== undefined ? item.watermarkScale : 0.3,
                watermarkOffset: item.watermarkOffset !== undefined ? item.watermarkOffset : { x: 0, y: 0 }
            }));
            activeProductIndex = savedState.activeIndex;

            if (productItems.length > 0) {
                redrawGallery();
                if (activeProductIndex > -1) {
                    loadIntoEditor(activeProductIndex);
                }
            }
        } catch (error) {
            console.error("Lỗi khôi phục phiên làm việc:", error);
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    function resetWorkspace() { confirmOverlay.classList.remove('hidden'); }

    // === Main Functions ===

    /** CẬP NHẬT: Tải tài nguyên và đặt độ phân giải cho canvas */
    function loadAssets() {
        watermarkImage.src = 'logo_subag.png';
        watermarkImage.onload = () => {
            console.log('Logo watermark đã tải.');
            redrawCanvas();
        };
        watermarkImage.onerror = () => console.warn('Cảnh báo: Không tìm thấy file logo watermark.');

        frameImage.src = 'khung.png';
        frameImage.onload = () => {
            console.log(`Khung ảnh đã tải. Kích thước gốc: ${frameImage.width}x${frameImage.height}`);

            // Đặt độ phân giải cho canvas theo kích thước của khung ảnh
            if (frameImage.width > 0 && frameImage.height > 0) {
                editorCanvas.width = frameImage.width;
                editorCanvas.height = frameImage.height;
            } else {
                // Giá trị dự phòng nếu không đọc được kích thước khung
                editorCanvas.width = 1080;
                editorCanvas.height = 1080;
            }
            console.log(`Độ phân giải canvas được đặt thành: ${editorCanvas.width}x${editorCanvas.height}`);

            loadState(); // Tải phiên làm việc sau khi đã có kích thước canvas
        }
        frameImage.onerror = () => {
            alert('Lỗi: Không tìm thấy file "khung.png".');
            editorCanvas.width = 1080; // Đặt kích thước dự phòng
            editorCanvas.height = 1080;
            loadState();
        };
    }

    function handleProductSelection() {
        const newFiles = Array.from(productInput.files);
        if (newFiles.length === 0) return;
        const newItems = newFiles.map(file => ({
            file: file, scale: 1, offset: { x: 0, y: 0 },
            isFrameEnabled: true, isWatermarkEnabled: false,
            watermarkScale: 0.3, watermarkOffset: { x: 0, y: 0 }
        }));
        productItems = productItems.concat(newItems);
        productInput.value = "";
        redrawGallery();
        saveState();
    }

    function removeProductImage(indexToRemove) {
        productItems.splice(indexToRemove, 1);
        if (activeProductIndex === indexToRemove) {
            activeProductIndex = -1;
        } else if (activeProductIndex > indexToRemove) {
            activeProductIndex--;
        }
        redrawGallery();
        if (activeProductIndex === -1) {
            editorArea.classList.add('hidden');
        } else {
            loadIntoEditor(activeProductIndex);
        }
        saveState();
    }

    function loadIntoEditor(index) {
        if (activeProductIndex > -1 && productItems[activeProductIndex]) {
            const activeItem = productItems[activeProductIndex];
            activeItem.scale = scale;
            activeItem.offset = { ...offset };
            activeItem.watermarkScale = watermarkScale;
            activeItem.watermarkOffset = { ...watermarkOffset };
        }
        if (index < 0 || index >= productItems.length) {
            editorArea.classList.add('hidden');
            return;
        }
        activeProductIndex = index;
        redrawGallery();
        const currentItem = productItems[index];
        currentProductImage = new Image();
        const reader = new FileReader();
        reader.onload = e => currentProductImage.src = e.target.result;
        reader.readAsDataURL(currentItem.file);
        currentProductImage.onload = () => {
            scale = currentItem.scale;
            offset = { ...currentItem.offset };
            zoomSlider.value = scale;
            watermarkScale = currentItem.watermarkScale;
            watermarkOffset = { ...currentItem.watermarkOffset };
            watermarkZoomSlider.value = watermarkScale;
            frameToggle.checked = currentItem.isFrameEnabled;
            watermarkToggle.checked = currentItem.isWatermarkEnabled;
            watermarkControls.classList.toggle('hidden', !currentItem.isWatermarkEnabled);
            editorArea.classList.remove('hidden');
            updateNavigation();
            redrawCanvas();
        };
    }

    function redrawGallery() { productGallery.innerHTML = ''; if (productItems.length > 0) productGallery.classList.remove('hidden'); else { productGallery.classList.add('hidden'); editorArea.classList.add('hidden'); return; } productItems.forEach((item, index) => { const galleryItem = document.createElement('div'); galleryItem.className = 'gallery-item'; galleryItem.dataset.index = index; if (index === activeProductIndex) { galleryItem.classList.add('active'); } galleryItem.addEventListener('click', () => loadIntoEditor(index)); productGallery.appendChild(galleryItem); const reader = new FileReader(); reader.onload = e => { galleryItem.innerHTML = `<img src="${e.target.result}" alt="Sản phẩm ${index + 1}"><button class="remove-btn" title="Xóa ảnh này">×</button><div class="checkmark">✓</div>`; const removeButton = galleryItem.querySelector('.remove-btn'); removeButton.addEventListener('click', (event) => { event.stopPropagation(); removeProductImage(index); }); }; reader.readAsDataURL(item.file); }); }
    function updateNavigation() { const controlsVisible = productItems.length > 1; prevBtn.style.visibility = nextBtn.style.visibility = imageCounter.style.visibility = controlsVisible ? 'visible' : 'hidden'; if (controlsVisible) { prevBtn.disabled = (activeProductIndex === 0); nextBtn.disabled = (activeProductIndex === productItems.length - 1); imageCounter.textContent = `${activeProductIndex + 1} / ${productItems.length}`; } }

    function redrawCanvas() {
        if (!currentProductImage.src || activeProductIndex < 0) return;
        const currentItem = productItems[activeProductIndex];
        ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
        const img = currentProductImage;
        let srcX, srcY, srcSize;
        if (img.width > img.height) { srcSize = img.height; srcX = (img.width - img.height) / 2; srcY = 0; }
        else { srcSize = img.width; srcX = 0; srcY = (img.height - img.width) / 2; }
        const drawSize = editorCanvas.width * scale;
        const drawX = (editorCanvas.width - drawSize) / 2 + offset.x;
        const drawY = (editorCanvas.height - drawSize) / 2 + offset.y;
        ctx.drawImage(img, srcX, srcY, srcSize, srcSize, drawX, drawY, drawSize, drawSize);
        if (currentItem.isFrameEnabled && frameImage.complete) { ctx.drawImage(frameImage, 0, 0, editorCanvas.width, editorCanvas.height); }
        if (currentItem.isWatermarkEnabled && watermarkImage.complete && watermarkImage.naturalWidth !== 0) {
            // Sanitize offset to prevent NaN issues from corrupted state
            if (isNaN(watermarkOffset.x) || isNaN(watermarkOffset.y)) {
                watermarkOffset = { x: 0, y: 0 };
            }

            const wmWidth = watermarkImage.width * watermarkScale;
            const wmHeight = watermarkImage.height * watermarkScale;
            const wmX = (editorCanvas.width - wmWidth) / 2 + watermarkOffset.x;
            const wmY = (editorCanvas.height - wmHeight) / 2 + watermarkOffset.y;
            ctx.drawImage(watermarkImage, wmX, wmY, wmWidth, wmHeight);

            // Draw Guides if snapped (only when dragging watermark)
            // Draw Guides if snapped (only when dragging watermark)
            if (activeDragTarget === 'watermark' && isDragging) {
                ctx.save();
                ctx.lineWidth = 1.5;
                ctx.setLineDash([5, 5]);

                if (isSnappedX !== null) {
                    // Different color for Major (1/4, 1/2, 3/4) vs Minor (1/8...)
                    ctx.strokeStyle = (typeof isSnappedXType !== 'undefined' && isSnappedXType === 'minor') ? '#2196F3' : '#D81B60';
                    ctx.beginPath();
                    ctx.moveTo(isSnappedX, 0);
                    ctx.lineTo(isSnappedX, editorCanvas.height);
                    ctx.stroke();
                }
                if (isSnappedY !== null) {
                    ctx.strokeStyle = (typeof isSnappedYType !== 'undefined' && isSnappedYType === 'minor') ? '#2196F3' : '#D81B60';
                    ctx.beginPath();
                    ctx.moveTo(0, isSnappedY);
                    ctx.lineTo(editorCanvas.width, isSnappedY);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }
    }

    // === Download Functions ===
    function processAndDownloadCurrentImage() {
        if (activeProductIndex < 0) return;
        const currentItem = productItems[activeProductIndex];

        // Temporarily clear guides for clean export
        const wasSnappedX = isSnappedX;
        const wasSnappedY = isSnappedY;
        isSnappedX = null;
        isSnappedY = null;
        redrawCanvas();

        const link = document.createElement('a');
        link.download = `san-pham-${currentItem.file.name.replace(/\.[^/.]+$/, "")}-subag.png`;
        link.href = editorCanvas.toDataURL('image/png');
        link.click();

        // Restore guides logic state (UI only, effectively resolved on next move)
        isSnappedX = wasSnappedX;
        isSnappedY = wasSnappedY;
        redrawCanvas();
    }

    async function processAndDownloadAll() {
        if (productItems.length === 0) return alert('Không có ảnh nào để tải!');

        const originalIndex = activeProductIndex;
        // Temporary canvas for batch processing preventing UI flicker
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        // Set temp canvas size based on frame
        tempCanvas.width = editorCanvas.width;
        tempCanvas.height = editorCanvas.height;

        for (let i = 0; i < productItems.length; i++) {
            const item = productItems[i];

            // Draw to temp canvas
            tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

            // Product Image
            const img = await loadImageFromFile(item.file);
            let srcX, srcY, srcSize;
            if (img.width > img.height) { srcSize = img.height; srcX = (img.width - img.height) / 2; srcY = 0; }
            else { srcSize = img.width; srcX = 0; srcY = (img.height - img.width) / 2; }
            const drawSize = tempCanvas.width * item.scale;
            const drawX = (tempCanvas.width - drawSize) / 2 + item.offset.x;
            const drawY = (tempCanvas.height - drawSize) / 2 + item.offset.y;
            tempCtx.drawImage(img, srcX, srcY, srcSize, srcSize, drawX, drawY, drawSize, drawSize);

            // Frame
            if (item.isFrameEnabled && frameImage.complete) {
                tempCtx.drawImage(frameImage, 0, 0, tempCanvas.width, tempCanvas.height);
            }

            // Watermark
            if (item.isWatermarkEnabled && watermarkImage.complete && watermarkImage.naturalWidth !== 0) {
                const wmWidth = watermarkImage.width * item.watermarkScale;
                const wmHeight = watermarkImage.height * item.watermarkScale;
                const wmX = (tempCanvas.width - wmWidth) / 2 + item.watermarkOffset.x;
                const wmY = (tempCanvas.height - wmHeight) / 2 + item.watermarkOffset.y;
                tempCtx.drawImage(watermarkImage, wmX, wmY, wmWidth, wmHeight);
            }

            // Download
            const link = document.createElement('a');
            link.download = `san-pham-${i + 1}-subag.png`;
            link.href = tempCanvas.toDataURL('image/png');
            link.click();
            await new Promise(r => setTimeout(r, 200)); // Delay for browser stability
        }

        // Restore state
        activeProductIndex = originalIndex;
        loadIntoEditor(activeProductIndex);
    }

    function loadImageFromFile(file) { return new Promise((resolve) => { const reader = new FileReader(); reader.onload = (e) => { const img = new Image(); img.onload = () => resolve(img); img.src = e.target.result; }; reader.readAsDataURL(file); }); }
    function isPointerOverWatermark(x, y) { if (activeProductIndex < 0 || !productItems[activeProductIndex]?.isWatermarkEnabled || !watermarkImage.complete) return false; const rect = editorCanvas.getBoundingClientRect(); const canvasX = (x - rect.left) * (editorCanvas.width / rect.width); const canvasY = (y - rect.top) * (editorCanvas.height / rect.height); const wmWidth = watermarkImage.width * watermarkScale; const wmHeight = watermarkImage.height * watermarkScale; const wmX = (editorCanvas.width - wmWidth) / 2 + watermarkOffset.x; const wmY = (editorCanvas.height - wmHeight) / 2 + watermarkOffset.y; return canvasX >= wmX && canvasX <= wmX + wmWidth && canvasY >= wmY && canvasY <= wmY + wmHeight; }

    function handleMouseDown(e) {
        if (isPointerOverWatermark(e.clientX, e.clientY)) {
            activeDragTarget = 'watermark';
            startDrag.x = e.clientX - watermarkOffset.x;
            startDrag.y = e.clientY - watermarkOffset.y;
        } else {
            activeDragTarget = 'product';
            startDrag.x = e.clientX - offset.x;
            startDrag.y = e.clientY - offset.y;
        }
        isDragging = true;
    }

    // Magnetic Snap Logic (7x7 Grid)
    function checkSnap(x, y) {
        if (activeDragTarget !== 'watermark') return { x, y };

        const threshold = 15;
        let newX = x;
        let newY = y;
        isSnappedX = null;
        isSnappedY = null;

        const width = editorCanvas.width;
        const height = editorCanvas.height;

        // Helper to generate grid targets (1/8 to 7/8)
        // Returns array of objects with {offset, draw, type: 'major'|'minor'}
        const getTargets = (size) => {
            const targets = [];
            for (let i = 1; i < 8; i++) {
                const isMajor = (i % 2 === 0); // 2/8, 4/8, 6/8 are Major (1/4, 1/2, 3/4)
                targets.push({
                    offset: (i * size / 8) - (size / 2),
                    draw: i * size / 8,
                    type: isMajor ? 'major' : 'minor'
                });
            }
            return targets;
        };

        const targetsX = getTargets(width);
        const targetsY = getTargets(height);

        // Check X
        for (let target of targetsX) {
            if (Math.abs(x - target.offset) < threshold) {
                newX = target.offset;
                // Store object to know type later if needed, or just position
                // For simplified visual, we can carry the type in a separate var or hack it into the value
                // Let's store the object in a temporary global or return it? 
                // Since we rely on global isSnappedX, let's make isSnappedX store the object or just the position?
                // Visual logic checks if (isSnappedX !== null).
                // Let's modify isSnappedX to be the DRAW position (number) 
                // AND add isSnappedXType for styling.
                isSnappedX = target.draw;
                isSnappedXType = target.type;
                break;
            }
        }

        // Check Y
        for (let target of targetsY) {
            if (Math.abs(y - target.offset) < threshold) {
                newY = target.offset;
                isSnappedY = target.draw;
                isSnappedYType = target.type;
                break;
            }
        }

        return { x: newX, y: newY };
    }

    function handleMouseMove(e) {
        if (!isDragging) return;
        if (activeDragTarget === 'watermark') {
            let rawX = e.clientX - startDrag.x;
            let rawY = e.clientY - startDrag.y;
            const snapped = checkSnap(rawX, rawY);
            watermarkOffset.x = snapped.x;
            watermarkOffset.y = snapped.y;
        } else {
            offset.x = e.clientX - startDrag.x;
            offset.y = e.clientY - startDrag.y;
        }
        redrawCanvas();
    }

    function handleMouseUp() {
        if (isDragging) {
            isDragging = false;
            // Clear guides
            isSnappedX = null;
            isSnappedY = null;
            redrawCanvas();
            saveState();
        }
    }

    function getPinchDistance(touches) { const dx = touches[0].clientX - touches[1].clientX, dy = touches[0].clientY - touches[1].clientY; return Math.sqrt(dx * dx + dy * dy); }

    function handleTouchStart(e) {
        e.preventDefault();
        const touches = e.touches;
        if (touches.length === 1) {
            const touch = touches[0];
            if (isPointerOverWatermark(touch.clientX, touch.clientY)) {
                activeDragTarget = 'watermark';
                startDrag.x = touch.clientX - watermarkOffset.x;
                startDrag.y = touch.clientY - watermarkOffset.y;
            } else {
                activeDragTarget = 'product';
                startDrag.x = touch.clientX - offset.x;
                startDrag.y = touch.clientY - offset.y;
            }
            isDragging = true;
        } else if (touches.length === 2) {
            isDragging = false;
            initialPinchDistance = getPinchDistance(touches);
            const midX = (touches[0].clientX + touches[1].clientX) / 2;
            const midY = (touches[0].clientY + touches[1].clientY) / 2;
            if (isPointerOverWatermark(midX, midY)) {
                activeDragTarget = 'watermark';
            } else {
                activeDragTarget = 'product';
            }
        }
    }

    function handleTouchMove(e) {
        e.preventDefault();
        const touches = e.touches;
        if (touches.length === 1 && isDragging) {
            const touch = touches[0];
            if (activeDragTarget === 'watermark') {
                let rawX = touch.clientX - startDrag.x;
                let rawY = touch.clientY - startDrag.y;
                const snapped = checkSnap(rawX, rawY);
                watermarkOffset.x = snapped.x;
                watermarkOffset.y = snapped.y;
            } else {
                offset.x = touch.clientX - startDrag.x;
                offset.y = touch.clientY - startDrag.y;
            }
            redrawCanvas();
        } else if (touches.length === 2) {
            const newPinchDistance = getPinchDistance(touches);
            if (initialPinchDistance === 0) { initialPinchDistance = newPinchDistance; return; }
            const scaleFactor = newPinchDistance / initialPinchDistance;
            if (activeDragTarget === 'watermark') {
                watermarkScale *= scaleFactor;
                watermarkZoomSlider.value = watermarkScale;
                watermarkInput.value = Math.round(watermarkScale * 100);
            } else {
                scale *= scaleFactor;
                zoomSlider.value = scale;
                zoomInput.value = Math.round(scale * 100);
            }
            initialPinchDistance = newPinchDistance;
            redrawCanvas();
        }
    }

    function handleTouchEnd() { isDragging = false; initialPinchDistance = 0; saveState(); }

    // === Event Listeners Setup ===
    // === Event Listeners Setup ===
    // Product Input
    if (productInput) productInput.addEventListener('change', handleProductSelection);
    else console.error('productInput element not found!');

    // Zoom Sync
    zoomSlider.addEventListener('input', () => {
        scale = parseFloat(zoomSlider.value);
        zoomInput.value = Math.round(scale * 100);
        redrawCanvas();
    });

    zoomInput.addEventListener('input', () => {
        let val = parseInt(zoomInput.value);
        if (isNaN(val)) return;
        scale = val / 100;
        zoomSlider.value = scale;
        redrawCanvas();
    });

    zoomInput.addEventListener('change', saveState);
    zoomSlider.addEventListener('change', saveState);

    // Watermark Zoom Sync
    watermarkZoomSlider.addEventListener('input', () => {
        watermarkScale = parseFloat(watermarkZoomSlider.value);
        watermarkInput.value = Math.round(watermarkScale * 100);
        redrawCanvas();
    });

    watermarkInput.addEventListener('input', () => {
        let val = parseInt(watermarkInput.value);
        if (isNaN(val)) return;
        watermarkScale = val / 100;
        watermarkZoomSlider.value = watermarkScale;
        redrawCanvas();
    });

    watermarkInput.addEventListener('change', saveState);
    watermarkZoomSlider.addEventListener('change', saveState);

    // Other Controls
    processBtn.addEventListener('click', processAndDownloadCurrentImage);
    downloadAllBtn.addEventListener('click', processAndDownloadAll);

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            console.log('Reset button clicked');
            resetWorkspace();
        });
    } else {
        console.error('Reset button not found');
    }

    prevBtn.addEventListener('click', () => { if (activeProductIndex > 0) loadIntoEditor(activeProductIndex - 1); });
    nextBtn.addEventListener('click', () => { if (activeProductIndex < productItems.length - 1) loadIntoEditor(activeProductIndex + 1); });

    frameToggle.addEventListener('change', () => {
        if (activeProductIndex > -1) {
            productItems[activeProductIndex].isFrameEnabled = frameToggle.checked;
            redrawCanvas();
            saveState();
        }
    });

    watermarkToggle.addEventListener('change', () => {
        console.log('Watermark toggled:', watermarkToggle.checked);
        if (activeProductIndex > -1) {
            productItems[activeProductIndex].isWatermarkEnabled = watermarkToggle.checked;
            watermarkControls.classList.toggle('hidden', !watermarkToggle.checked);
            redrawCanvas();
            saveState();
        }
    });

    editorCanvas.addEventListener('mousedown', handleMouseDown);
    editorCanvas.addEventListener('mousemove', handleMouseMove);
    editorCanvas.addEventListener('mouseup', handleMouseUp);
    editorCanvas.addEventListener('mouseleave', handleMouseUp);
    editorCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    editorCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    editorCanvas.addEventListener('touchend', handleTouchEnd);
    editorCanvas.addEventListener('touchcancel', handleTouchEnd);

    window.addEventListener('beforeunload', saveState);

    confirmNoBtn.addEventListener('click', () => { confirmOverlay.classList.add('hidden'); });

    confirmYesBtn.addEventListener('click', () => {
        console.log('Confirm Reset: Clearing state and reloading.');
        productItems = [];
        activeProductIndex = -1;
        localStorage.removeItem(STORAGE_KEY);
        confirmOverlay.classList.add('hidden');
        location.reload(); // Force reload to clear all states
    });

    // === Initial Load ===
    console.log('Initializing app...');
    loadAssets();
});