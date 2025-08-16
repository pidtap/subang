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

    // DOM Elements cho hộp thoại tùy chỉnh (MỚI)
    const confirmOverlay = document.getElementById('custom-confirm-overlay');
    const confirmYesBtn = document.getElementById('confirm-yes-btn');
    const confirmNoBtn = document.getElementById('confirm-no-btn');

    // === State Variables ===
    const STORAGE_KEY = 'subagEditorState';
    let frameImage = new Image();
    let productItems = [];
    let currentProductImage = new Image();
    let activeProductIndex = -1;
    let scale = 1, offset = { x: 0, y: 0 };
    let isDragging = false, startDrag = { x: 0, y: 0 };
    let initialPinchDistance = 0, lastTouch = { x: 0, y: 0 };

    // === HÀM LƯU VÀ TẢI PHIÊN LÀM VIỆC ===

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    function base64ToFile(dataUrl, filename) {
        const arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, {type: mime});
    }

    async function saveState() {
        if (productItems.length === 0) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        if (activeProductIndex > -1) {
            productItems[activeProductIndex].scale = scale;
            productItems[activeProductIndex].offset = { ...offset };
        }
        
        const savableItems = await Promise.all(productItems.map(async (item) => ({
            base64: await fileToBase64(item.file),
            name: item.file.name,
            scale: item.scale,
            offset: item.offset,
        })));

        const state = { items: savableItems, activeIndex: activeProductIndex };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        console.log("Phiên làm việc đã được lưu.");
    }
    
    async function loadState() {
        const savedStateJSON = localStorage.getItem(STORAGE_KEY);
        if (!savedStateJSON) {
            console.log("Không tìm thấy phiên làm việc cũ.");
            return;
        }
        
        try {
            const savedState = JSON.parse(savedStateJSON);
            productItems = savedState.items.map(item => ({
                file: base64ToFile(item.base64, item.name),
                scale: item.scale,
                offset: item.offset,
            }));
            activeProductIndex = savedState.activeIndex;

            if (productItems.length > 0) {
                redrawGallery();
                if (activeProductIndex > -1) {
                    loadIntoEditor(activeProductIndex, true);
                }
            }
            console.log("Phiên làm việc đã được khôi phục.");
        } catch (error) {
            console.error("Lỗi khôi phục phiên làm việc:", error);
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    /** Xóa toàn bộ phiên làm việc - ĐÃ CẬP NHẬT */
    function resetWorkspace() {
        // Hiển thị hộp thoại tùy chỉnh thay vì dùng confirm()
        confirmOverlay.classList.remove('hidden');
    }


    // === Main Functions ===

    function loadDefaultFrame() {
        frameImage.src = 'khung.png';
        frameImage.onload = () => {
             console.log('Khung ảnh mặc định đã được tải.');
             loadState();
        }
        frameImage.onerror = () => alert('Lỗi: Không tìm thấy file "khung.png".');
    }

    function handleProductSelection() {
        const newFiles = Array.from(productInput.files);
        if (newFiles.length === 0) return;
        
        const newItems = newFiles.map(file => ({
            file: file, scale: 1, offset: { x: 0, y: 0 }
        }));
        productItems = productItems.concat(newItems);
        
        productInput.value = "";
        redrawGallery();
        saveState();
    }

    function removeProductImage(indexToRemove) {
        productItems.splice(indexToRemove, 1);
        if (productItems.length === 0) activeProductIndex = -1;
        else if (activeProductIndex === indexToRemove) activeProductIndex = -1;
        else if (activeProductIndex > indexToRemove) activeProductIndex--;
        redrawGallery();
        
        if (activeProductIndex === -1) {
            editorArea.classList.add('hidden');
        } else {
            loadIntoEditor(activeProductIndex, true);
        }
        saveState();
    }

    function loadIntoEditor(index, isLoadingState = false) {
        if (!isLoadingState) {
            if (activeProductIndex !== -1 && productItems[activeProductIndex]) {
                productItems[activeProductIndex].scale = scale;
                productItems[activeProductIndex].offset = { ...offset };
            }
        }
        
        if (!frameImage.complete || index < 0 || index >= productItems.length) {
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
            editorArea.classList.remove('hidden');
            updateNavigation();
            redrawCanvas();
        };

        if (!isLoadingState) {
            saveState();
        }
    }

    function redrawGallery() {
        productGallery.innerHTML = '';
        if (productItems.length > 0) productGallery.classList.remove('hidden');
        else { productGallery.classList.add('hidden'); editorArea.classList.add('hidden'); return; }
        
        productItems.forEach((item, index) => {
            const reader = new FileReader();
            reader.onload = e => {
                const galleryItem = document.createElement('div');
                galleryItem.className = 'gallery-item';
                galleryItem.dataset.index = index;
                galleryItem.innerHTML = `<img src="${e.target.result}" alt="Sản phẩm ${index + 1}"><button class="remove-btn" title="Xóa ảnh này">×</button><div class="checkmark">✓</div>`;
                galleryItem.addEventListener('click', () => loadIntoEditor(index));
                const removeButton = galleryItem.querySelector('.remove-btn');
                removeButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    removeProductImage(index);
                });
                productGallery.appendChild(galleryItem);
                if(index === activeProductIndex) galleryItem.classList.add('active');
            };
            reader.readAsDataURL(item.file);
        });
    }

    function updateNavigation() {
        const controlsVisible = productItems.length > 1;
        prevBtn.style.visibility = nextBtn.style.visibility = imageCounter.style.visibility = controlsVisible ? 'visible' : 'hidden';
        if (controlsVisible) {
            prevBtn.disabled = (activeProductIndex === 0);
            nextBtn.disabled = (activeProductIndex === productItems.length - 1);
            imageCounter.textContent = `${activeProductIndex + 1} / ${productItems.length}`;
        }
    }
    
    function redrawCanvas() {
        if (!currentProductImage.src || !frameImage.src) return;
        ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
        const img = currentProductImage;
        let srcX, srcY, srcSize;
        if (img.width > img.height) { srcSize = img.height; srcX = (img.width - img.height) / 2; srcY = 0; }
        else { srcSize = img.width; srcX = 0; srcY = (img.height - img.width) / 2; }
        const drawSize = editorCanvas.width * scale;
        const drawX = (editorCanvas.width - drawSize) / 2 + offset.x;
        const drawY = (editorCanvas.height - drawSize) / 2 + offset.y;
        ctx.drawImage(img, srcX, srcY, srcSize, srcSize, drawX, drawY, drawSize, drawSize);
        ctx.drawImage(frameImage, 0, 0, editorCanvas.width, editorCanvas.height);
    }

    function processAndDownloadCurrentImage() {
        if (activeProductIndex === -1) return;
        productItems[activeProductIndex].scale = scale;
        productItems[activeProductIndex].offset = { ...offset };
        redrawCanvas();
        const dataURL = editorCanvas.toDataURL('image/png');
        downloadLink.href = dataURL;
        downloadLink.download = `ghep_${productItems[activeProductIndex].file.name}`;
        downloadLink.click();
        const completedItem = document.querySelector(`.gallery-item[data-index='${activeProductIndex}']`);
        if (completedItem) completedItem.classList.add('completed');
    }
    
    async function processAndDownloadAll() {
        if (productItems.length === 0) {
            alert("Chưa có ảnh nào để tải!");
            return;
        }
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
            else { srcSize = productImg.width; srcX = 0; srcY = (img.height - img.width) / 2; }
            tempCtx.drawImage(productImg, srcX, srcY, srcSize, srcSize, 0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.drawImage(frameImage, 0, 0, tempCanvas.width, tempCanvas.height);
            downloadLink.href = tempCanvas.toDataURL('image/png');
            downloadLink.download = `ghep_${item.file.name}`;
            downloadLink.click();
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = "Tải tất cả";
    }

    function loadImageFromFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function getPinchDistance(touches) { const dx = touches[0].clientX - touches[1].clientX, dy = touches[0].clientY - touches[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
    function handleTouchStart(e) { e.preventDefault(); const touches = e.touches; if (touches.length === 1) { isDragging = true; lastTouch.x = touches[0].clientX; lastTouch.y = touches[0].clientY; } else if (touches.length === 2) { isDragging = false; initialPinchDistance = getPinchDistance(touches); } }
    function handleTouchMove(e) { e.preventDefault(); const touches = e.touches; if (touches.length === 1 && isDragging) { const dx = touches[0].clientX - lastTouch.x, dy = touches[0].clientY - lastTouch.y; offset.x += dx; offset.y += dy; lastTouch.x = touches[0].clientX; lastTouch.y = touches[0].clientY; redrawCanvas(); } else if (touches.length === 2) { const newPinchDistance = getPinchDistance(touches); const scaleFactor = newPinchDistance / initialPinchDistance; scale *= scaleFactor; zoomSlider.value = scale; initialPinchDistance = newPinchDistance; redrawCanvas(); } }
    function handleTouchEnd() { isDragging = false; initialPinchDistance = 0; saveState(); }

    // === Event Listeners Setup ===
    productInput.addEventListener('change', handleProductSelection);
    zoomSlider.addEventListener('input', () => { scale = parseFloat(zoomSlider.value); redrawCanvas(); });
    zoomSlider.addEventListener('change', saveState);
    processBtn.addEventListener('click', processAndDownloadCurrentImage);
    downloadAllBtn.addEventListener('click', processAndDownloadAll);
    resetBtn.addEventListener('click', resetWorkspace);
    prevBtn.addEventListener('click', () => { if(activeProductIndex > 0) loadIntoEditor(activeProductIndex - 1); });
    nextBtn.addEventListener('click', () => { if(activeProductIndex < productItems.length - 1) loadIntoEditor(activeProductIndex + 1); });
    
    editorCanvas.addEventListener('mousedown', e => { isDragging = true; startDrag.x = e.clientX - offset.x; startDrag.y = e.clientY - offset.y; });
    editorCanvas.addEventListener('mouseup', () => { isDragging = false; saveState(); });
    editorCanvas.addEventListener('mouseleave', () => isDragging = false);
    editorCanvas.addEventListener('mousemove', e => { if (isDragging) { offset.x = e.clientX - startDrag.x; offset.y = e.clientY - startDrag.y; redrawCanvas(); } });
    
    editorCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    editorCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    editorCanvas.addEventListener('touchend', handleTouchEnd);
    editorCanvas.addEventListener('touchcancel', handleTouchEnd);
    
    window.addEventListener('beforeunload', saveState);

    // Event listeners cho hộp thoại tùy chỉnh (MỚI)
    confirmNoBtn.addEventListener('click', () => {
        confirmOverlay.classList.add('hidden');
    });

    confirmYesBtn.addEventListener('click', () => {
        productItems = [];
        activeProductIndex = -1;
        editorArea.classList.add('hidden');
        productGallery.innerHTML = '';
        productGallery.classList.add('hidden');
        localStorage.removeItem(STORAGE_KEY);
        confirmOverlay.classList.add('hidden');
        console.log("Đã làm mới lại từ đầu.");
    });


    // === Initial Load ===
    loadDefaultFrame();
});