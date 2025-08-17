document.addEventListener('DOMContentLoaded', function() {
    // === DOM Elements ===
    const productInput = document.getElementById('productInput');
    const productGallery = document.getElementById('product-gallery');
    const editorArea = document.getElementById('editor-area');
    const editorCanvas = document.getElementById('editor-canvas');
    const ctx = editorCanvas.getContext('2d');
    const zoomSlider = document.getElementById('zoom-slider');
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
    // Watermark DOM
    const watermarkToggle = document.getElementById('watermarkToggle');
    const watermarkControls = document.getElementById('watermark-controls');
    const watermarkZoomSlider = document.getElementById('watermarkZoomSlider');

    // === State Variables ===
    const STORAGE_KEY = 'subagEditorState';
    let frameImage = new Image();
    let watermarkImage = new Image();
    let productItems = [];
    let currentProductImage = new Image();
    let activeProductIndex = -1;
    let isFrameEnabled = true;
    
    // Watermark State
    let isWatermarkEnabled = false;
    let watermarkScale = 0.3;
    let watermarkOffset = { x: 0, y: 0 };
    
    // Image State
    let scale = 1, offset = { x: 0, y: 0 };
    
    // Interaction State
    let isDragging = false, startDrag = { x: 0, y: 0 };
    let activeDragTarget = 'product'; // 'product' hoặc 'watermark'
    let initialPinchDistance = 0;

    // === HÀM LƯU VÀ TẢI PHIÊN LÀM VIỆC ===

    function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error); }); }
    function base64ToFile(dataUrl, filename) { const arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1]; const bstr = atob(arr[1]); let n = bstr.length; const u8arr = new Uint8Array(n); while(n--) { u8arr[n] = bstr.charCodeAt(n); } return new File([u8arr], filename, {type: mime}); }

    async function saveState() {
        if (productItems.length === 0) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        if (activeProductIndex > -1) {
            productItems[activeProductIndex].scale = scale;
            productItems[activeProductIndex].offset = { ...offset };
        }
        const savableItems = await Promise.all(productItems.map(async (item) => ({ base64: await fileToBase64(item.file), name: item.file.name, scale: item.scale, offset: item.offset, })));

        const state = {
            items: savableItems,
            activeIndex: activeProductIndex,
            isFrameEnabled: isFrameEnabled,
            isWatermarkEnabled: isWatermarkEnabled,
            watermarkScale: watermarkScale,
            watermarkOffset: watermarkOffset
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    
    async function loadState() {
        const savedStateJSON = localStorage.getItem(STORAGE_KEY);
        if (!savedStateJSON) return;
        
        try {
            const savedState = JSON.parse(savedStateJSON);
            isFrameEnabled = savedState.isFrameEnabled !== undefined ? savedState.isFrameEnabled : true;
            frameToggle.checked = isFrameEnabled;

            isWatermarkEnabled = savedState.isWatermarkEnabled || false;
            watermarkScale = savedState.watermarkScale || 0.3;
            watermarkOffset = savedState.watermarkOffset || { x: 0, y: 0 };
            watermarkToggle.checked = isWatermarkEnabled;
            watermarkZoomSlider.value = watermarkScale;
            watermarkControls.classList.toggle('hidden', !isWatermarkEnabled);

            productItems = savedState.items.map(item => ({ file: base64ToFile(item.base64, item.name), scale: item.scale, offset: item.offset, }));
            activeProductIndex = savedState.activeIndex;

            if (productItems.length > 0) {
                redrawGallery();
                if (activeProductIndex > -1) {
                    loadIntoEditor(activeProductIndex, true);
                }
            }
        } catch (error) {
            console.error("Lỗi khôi phục phiên làm việc:", error);
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    function resetWorkspace() { confirmOverlay.classList.remove('hidden'); }

    // === Main Functions ===

    function loadAssets() {
        frameImage.src = 'khung.png';
        frameImage.onload = () => {
             console.log('Khung ảnh mặc định đã được tải.');
             loadState();
        }
        frameImage.onerror = () => alert('Lỗi: Không tìm thấy file "khung.png".');
        
        watermarkImage.src = 'logo_subag.png'; 
        watermarkImage.onload = () => console.log('Watermark đã được tải.');
        watermarkImage.onerror = () => console.warn('Cảnh báo: Không tìm thấy file logo watermark.');
    }

    function handleProductSelection() { const newFiles = Array.from(productInput.files); if (newFiles.length === 0) return; const newItems = newFiles.map(file => ({ file: file, scale: 1, offset: { x: 0, y: 0 } })); productItems = productItems.concat(newItems); productInput.value = ""; redrawGallery(); saveState(); }
    function removeProductImage(indexToRemove) { productItems.splice(indexToRemove, 1); if (productItems.length === 0) activeProductIndex = -1; else if (activeProductIndex === indexToRemove) activeProductIndex = -1; else if (activeProductIndex > indexToRemove) activeProductIndex--; redrawGallery(); if (activeProductIndex === -1) { editorArea.classList.add('hidden'); } else { loadIntoEditor(activeProductIndex, true); } saveState(); }

    function loadIntoEditor(index, isLoadingState = false) {
        if (!isLoadingState) { if (activeProductIndex !== -1 && productItems[activeProductIndex]) { productItems[activeProductIndex].scale = scale; productItems[activeProductIndex].offset = { ...offset }; } }
        if (!frameImage.complete || index < 0 || index >= productItems.length) { editorArea.classList.add('hidden'); return; }
        activeProductIndex = index;
        redrawGallery();
        const currentItem = productItems[index];
        currentProductImage = new Image();
        const reader = new FileReader();
        reader.onload = e => currentProductImage.src = e.target.result;
        reader.readAsDataURL(currentItem.file);
        currentProductImage.onload = () => {
            scale = currentItem.scale; offset = { ...currentItem.offset }; zoomSlider.value = scale; editorArea.classList.remove('hidden'); updateNavigation(); redrawCanvas();
        };
        if (!isLoadingState) { saveState(); }
    }

    function redrawGallery() { productGallery.innerHTML = ''; if (productItems.length > 0) productGallery.classList.remove('hidden'); else { productGallery.classList.add('hidden'); editorArea.classList.add('hidden'); return; } productItems.forEach((item, index) => { const reader = new FileReader(); reader.onload = e => { const galleryItem = document.createElement('div'); galleryItem.className = 'gallery-item'; galleryItem.dataset.index = index; galleryItem.innerHTML = `<img src="${e.target.result}" alt="Sản phẩm ${index + 1}"><button class="remove-btn" title="Xóa ảnh này">×</button><div class="checkmark">✓</div>`; galleryItem.addEventListener('click', () => loadIntoEditor(index)); const removeButton = galleryItem.querySelector('.remove-btn'); removeButton.addEventListener('click', (event) => { event.stopPropagation(); removeProductImage(index); }); productGallery.appendChild(galleryItem); if(index === activeProductIndex) galleryItem.classList.add('active'); }; reader.readAsDataURL(item.file); }); }
    function updateNavigation() { const controlsVisible = productItems.length > 1; prevBtn.style.visibility = nextBtn.style.visibility = imageCounter.style.visibility = controlsVisible ? 'visible' : 'hidden'; if (controlsVisible) { prevBtn.disabled = (activeProductIndex === 0); nextBtn.disabled = (activeProductIndex === productItems.length - 1); imageCounter.textContent = `${activeProductIndex + 1} / ${productItems.length}`; } }
    
    function redrawCanvas() {
        if (!currentProductImage.src) return;
        ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
        
        const img = currentProductImage;
        let srcX, srcY, srcSize;
        if (img.width > img.height) { srcSize = img.height; srcX = (img.width - img.height) / 2; srcY = 0; }
        else { srcSize = img.width; srcX = 0; srcY = (img.height - img.width) / 2; }
        const drawSize = editorCanvas.width * scale;
        const drawX = (editorCanvas.width - drawSize) / 2 + offset.x;
        const drawY = (editorCanvas.height - drawSize) / 2 + offset.y;
        ctx.drawImage(img, srcX, srcY, srcSize, srcSize, drawX, drawY, drawSize, drawSize);
        
        if (isFrameEnabled && frameImage.complete) {
            ctx.drawImage(frameImage, 0, 0, editorCanvas.width, editorCanvas.height);
        }

        if (isWatermarkEnabled && watermarkImage.complete) {
            const wmWidth = watermarkImage.width * watermarkScale;
            const wmHeight = watermarkImage.height * watermarkScale;
            const wmX = (editorCanvas.width - wmWidth) / 2 + watermarkOffset.x;
            const wmY = (editorCanvas.height - wmHeight) / 2 + watermarkOffset.y;
            ctx.drawImage(watermarkImage, wmX, wmY, wmWidth, wmHeight);
        }
    }

    function processAndDownloadCurrentImage() { if (activeProductIndex === -1) return; productItems[activeProductIndex].scale = scale; productItems[activeProductIndex].offset = { ...offset }; redrawCanvas(); const dataURL = editorCanvas.toDataURL('image/png'); downloadLink.href = dataURL; downloadLink.download = `ghep_${productItems[activeProductIndex].file.name}`; downloadLink.click(); const completedItem = document.querySelector(`.gallery-item[data-index='${activeProductIndex}']`); if (completedItem) completedItem.classList.add('completed'); }
    
    async function processAndDownloadAll() {
        if (productItems.length === 0) { alert("Chưa có ảnh nào để tải!"); return; }
        downloadAllBtn.disabled = true;
        downloadAllBtn.textContent = "Đang xử lý (0%)...";
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = frameImage.width || 500;
        tempCanvas.height = frameImage.height || 500;
        for (let i = 0; i < productItems.length; i++) {
            const item = productItems[i];
            const productImg = await loadImageFromFile(item.file);
            const progress = Math.round(((i + 1) / productItems.length) * 100);
            downloadAllBtn.textContent = `Đang xử lý (${progress}%)...`;
            tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
            let srcX, srcY, srcSize;
            if (productImg.width > productImg.height) { srcSize = productImg.height; srcX = (productImg.width - productImg.height) / 2; srcY = 0; }
            else { srcSize = productImg.width; srcX = 0; srcY = (productImg.height - productImg.width) / 2; }
            const drawSize = tempCanvas.width * item.scale;
            const drawX = (tempCanvas.width - drawSize) / 2 + item.offset.x;
            const drawY = (tempCanvas.height - drawSize) / 2 + item.offset.y;
            tempCtx.drawImage(productImg, srcX, srcY, srcSize, srcSize, drawX, drawY, drawSize, drawSize);

            if (isFrameEnabled) { tempCtx.drawImage(frameImage, 0, 0, tempCanvas.width, tempCanvas.height); }
            if (isWatermarkEnabled && watermarkImage.complete) {
                const wmWidth = watermarkImage.width * watermarkScale;
                const wmHeight = watermarkImage.height * watermarkScale;
                const wmX = (tempCanvas.width - wmWidth) / 2 + watermarkOffset.x;
                const wmY = (tempCanvas.height - wmHeight) / 2 + watermarkOffset.y;
                tempCtx.drawImage(watermarkImage, wmX, wmY, wmWidth, wmHeight);
            }

            downloadLink.href = tempCanvas.toDataURL('image/png');
            downloadLink.download = `ghep_${item.file.name}`;
            downloadLink.click();
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = "Tải tất cả";
    }

    function loadImageFromFile(file) { return new Promise((resolve) => { const reader = new FileReader(); reader.onload = (e) => { const img = new Image(); img.onload = () => resolve(img); img.src = e.target.result; }; reader.readAsDataURL(file); }); }
    
    // === Xử lý sự kiện CHUỘT và CHẠM (CẬP NHẬT) ===

    function isPointerOverWatermark(x, y) {
        if (!isWatermarkEnabled || !watermarkImage.complete) return false;
        const rect = editorCanvas.getBoundingClientRect();
        // Chuyển đổi tọa độ của sự kiện (toàn màn hình) sang tọa độ của canvas
        const canvasX = (x - rect.left) * (editorCanvas.width / rect.width);
        const canvasY = (y - rect.top) * (editorCanvas.height / rect.height);

        const wmWidth = watermarkImage.width * watermarkScale;
        const wmHeight = watermarkImage.height * watermarkScale;
        const wmX = (editorCanvas.width - wmWidth) / 2 + watermarkOffset.x;
        const wmY = (editorCanvas.height - wmHeight) / 2 + watermarkOffset.y;

        return canvasX >= wmX && canvasX <= wmX + wmWidth &&
               canvasY >= wmY && canvasY <= wmY + wmHeight;
    }

    // -- Sự kiện chuột --
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

    function handleMouseMove(e) {
        if (!isDragging) return;
        if (activeDragTarget === 'watermark') {
            watermarkOffset.x = e.clientX - startDrag.x;
            watermarkOffset.y = e.clientY - startDrag.y;
        } else {
            offset.x = e.clientX - startDrag.x;
            offset.y = e.clientY - startDrag.y;
        }
        redrawCanvas();
    }

    function handleMouseUp() {
        if (isDragging) {
            isDragging = false;
            saveState();
        }
    }

    // -- Sự kiện chạm (đã viết lại hoàn toàn) --
    function getPinchDistance(touches) { const dx = touches[0].clientX - touches[1].clientX, dy = touches[0].clientY - touches[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
    
    function handleTouchStart(e) {
        e.preventDefault();
        const touches = e.touches;

        if (touches.length === 1) { // Kéo thả bằng 1 ngón
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
        } else if (touches.length === 2) { // Phóng to/thu nhỏ bằng 2 ngón
            isDragging = false;
            initialPinchDistance = getPinchDistance(touches);
            
            // Xác định đối tượng cần zoom dựa trên vị trí trung tâm
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

        if (touches.length === 1 && isDragging) { // Đang kéo bằng 1 ngón
            const touch = touches[0];
            if (activeDragTarget === 'watermark') {
                watermarkOffset.x = touch.clientX - startDrag.x;
                watermarkOffset.y = touch.clientY - startDrag.y;
            } else {
                offset.x = touch.clientX - startDrag.x;
                offset.y = touch.clientY - startDrag.y;
            }
            redrawCanvas();
        } else if (touches.length === 2) { // Đang zoom bằng 2 ngón
            const newPinchDistance = getPinchDistance(touches);
            const scaleFactor = newPinchDistance / initialPinchDistance;

            if (activeDragTarget === 'watermark') {
                watermarkScale *= scaleFactor;
                watermarkZoomSlider.value = watermarkScale;
            } else {
                scale *= scaleFactor;
                zoomSlider.value = scale;
            }

            initialPinchDistance = newPinchDistance;
            redrawCanvas();
        }
    }
    
    function handleTouchEnd() {
        isDragging = false;
        initialPinchDistance = 0;
        saveState();
    }


    // === Event Listeners Setup ===
    productInput.addEventListener('change', handleProductSelection);
    zoomSlider.addEventListener('input', () => { scale = parseFloat(zoomSlider.value); redrawCanvas(); });
    zoomSlider.addEventListener('change', saveState);
    processBtn.addEventListener('click', processAndDownloadCurrentImage);
    downloadAllBtn.addEventListener('click', processAndDownloadAll);
    resetBtn.addEventListener('click', resetWorkspace);
    prevBtn.addEventListener('click', () => { if(activeProductIndex > 0) loadIntoEditor(activeProductIndex - 1); });
    nextBtn.addEventListener('click', () => { if(activeProductIndex < productItems.length - 1) loadIntoEditor(activeProductIndex + 1); });
    
    frameToggle.addEventListener('change', () => { isFrameEnabled = frameToggle.checked; redrawCanvas(); saveState(); });

    watermarkToggle.addEventListener('change', () => {
        isWatermarkEnabled = watermarkToggle.checked;
        watermarkControls.classList.toggle('hidden', !isWatermarkEnabled);
        redrawCanvas();
        saveState();
    });
    watermarkZoomSlider.addEventListener('input', () => { watermarkScale = parseFloat(watermarkZoomSlider.value); redrawCanvas(); });
    watermarkZoomSlider.addEventListener('change', saveState);

    // Gắn các sự kiện chuột và chạm mới vào canvas
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
        productItems = []; activeProductIndex = -1; editorArea.classList.add('hidden'); productGallery.innerHTML = ''; productGallery.classList.add('hidden');
        isWatermarkEnabled = false; watermarkToggle.checked = false; watermarkControls.classList.add('hidden');
        localStorage.removeItem(STORAGE_KEY);
        confirmOverlay.classList.add('hidden');
    });

    // === Initial Load ===
    loadAssets();
});