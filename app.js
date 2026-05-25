// ==================== DATA STORE ====================
const StockManager = {
    items: [],
    stockIn: [],
    stockOut: [],

    load() {
        try {
            const data = localStorage.getItem('stockManagerData');
            if (data) {
                const parsed = JSON.parse(data);
                this.items = parsed.items || [];
                this.stockIn = parsed.stockIn || [];
                this.stockOut = parsed.stockOut || [];
            }
        } catch (e) {
            console.error('Error loading data:', e);
        }
    },

    save() {
        try {
            localStorage.setItem('stockManagerData', JSON.stringify({
                items: this.items,
                stockIn: this.stockIn,
                stockOut: this.stockOut
            }));
        } catch (e) {
            console.error('Error saving data:', e);
            showToast('Storage full! Try removing some images.', 'error');
        }
    },

    getCurrentStock(sku) {
        const item = this.items.find(i => i.sku === sku);
        if (!item) return 0;
        const totalIn = this.stockIn.filter(t => t.sku === sku).reduce((sum, t) => sum + t.quantity, 0);
        const totalOut = this.stockOut.filter(t => t.sku === sku).reduce((sum, t) => sum + t.quantity, 0);
        return item.quantity + totalIn - totalOut;
    },

    getTotalIn(sku) {
        return this.stockIn.filter(t => t.sku === sku).reduce((sum, t) => sum + t.quantity, 0);
    },

    getTotalOut(sku) {
        return this.stockOut.filter(t => t.sku === sku).reduce((sum, t) => sum + t.quantity, 0);
    },

    searchItems(query) {
        const q = query.toLowerCase();
        return this.items.filter(item =>
            item.sku.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q)
        );
    },

    generateSKU() {
        const prefix = 'SKU';
        const num = this.items.length + 1;
        let sku = `${prefix}-${String(num).padStart(4, '0')}`;
        while (this.items.find(i => i.sku === sku)) {
            const rand = Math.floor(Math.random() * 9000) + 1000;
            sku = `${prefix}-${rand}`;
        }
        return sku;
    }
};

// ==================== TAB NAVIGATION ====================
function switchTab(tabName) {
    // Update desktop tabs
    document.querySelectorAll('.desktop-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.desktop-tabs .tab-btn').forEach(b => {
        if (b.dataset.tab === tabName) b.classList.add('active');
    });

    // Update bottom nav
    document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-btn').forEach(b => {
        if (b.dataset.tab === tabName) b.classList.add('active');
    });

    // Switch content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    if (tabName === 'summary') renderSummary();
}

// Desktop tabs
document.querySelectorAll('.desktop-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Bottom nav
document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ==================== TOAST NOTIFICATION ====================
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ==================== SKU SUGGESTION ====================
function setupSKUSuggestion(inputId, suggestionsId, onSelect) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);

    input.addEventListener('input', () => {
        const query = input.value.trim();
        if (query.length < 1) { suggestions.classList.remove('visible'); return; }

        const results = StockManager.searchItems(query);
        if (results.length === 0) { suggestions.classList.remove('visible'); return; }

        suggestions.innerHTML = results.slice(0, 8).map(item => {
            const thumbHtml = item.image
                ? `<img class="sku-thumb" src="${item.image}" alt="">`
                : '';
            return `
                <div class="sku-suggestion-item" data-sku="${item.sku}">
                    ${thumbHtml}
                    <span class="sku-code">${item.sku}</span>
                    <span class="sku-name">${item.name} (${StockManager.getCurrentStock(item.sku)})</span>
                </div>
            `;
        }).join('');

        suggestions.classList.add('visible');

        suggestions.querySelectorAll('.sku-suggestion-item').forEach(el => {
            el.addEventListener('click', () => {
                input.value = el.dataset.sku;
                suggestions.classList.remove('visible');
                if (onSelect) onSelect(el.dataset.sku);
            });
        });
    });

    input.addEventListener('blur', () => {
        setTimeout(() => suggestions.classList.remove('visible'), 250);
    });
}

// ==================== IMAGE UPLOAD (Camera + Gallery) ====================
let currentImageBase64 = '';

const imageUploadArea = document.getElementById('image-upload-area');
const productImageInput = document.getElementById('product-image');
const imagePreview = document.getElementById('image-preview');
const imagePlaceholder = document.getElementById('image-placeholder');
const removeImageBtn = document.getElementById('remove-image');

// Camera button
document.getElementById('btn-camera').addEventListener('click', (e) => {
    e.stopPropagation();
    productImageInput.setAttribute('capture', 'environment');
    productImageInput.click();
});

// Gallery button
document.getElementById('btn-gallery').addEventListener('click', (e) => {
    e.stopPropagation();
    productImageInput.removeAttribute('capture');
    productImageInput.click();
});

productImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImageFile(file);
});

function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image size should be less than 5MB', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        // Compress image for localStorage
        compressImage(e.target.result, 300, 0.7, (compressed) => {
            currentImageBase64 = compressed;
            imagePreview.src = compressed;
            imagePreview.style.display = 'block';
            imagePlaceholder.style.display = 'none';
            removeImageBtn.classList.add('visible');
        });
    };
    reader.readAsDataURL(file);
}

// Compress image to avoid localStorage quota issues
function compressImage(dataUrl, maxWidth, quality, callback) {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
}

removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentImageBase64 = '';
    imagePreview.src = '';
    imagePreview.style.display = 'none';
    imagePlaceholder.style.display = 'flex';
    removeImageBtn.classList.remove('visible');
    productImageInput.value = '';
});

// ==================== EXCEL UPLOAD ====================
let pendingUploadData = null;
const dropZone = document.getElementById('drop-zone');

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processExcelFile(file);
});

document.getElementById('excel-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processExcelFile(file);
});

function processExcelFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet);

            if (jsonData.length === 0) { showToast('File is empty!', 'error'); return; }

            pendingUploadData = jsonData;
            showPreview(jsonData);
            showToast(`Found ${jsonData.length} rows`, 'info');
        } catch (err) {
            showToast('Error reading file', 'error');
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
}

function showPreview(data) {
    const preview = document.getElementById('upload-preview');
    const thead = document.querySelector('#preview-table thead');
    const tbody = document.querySelector('#preview-table tbody');
    document.getElementById('preview-count').textContent = `(${data.length} rows)`;
    preview.classList.remove('hidden');

    const headers = Object.keys(data[0]);
    thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

    const previewRows = data.slice(0, 10);
    tbody.innerHTML = previewRows.map(row =>
        `<tr>${headers.map(h => `<td>${row[h] !== undefined ? row[h] : ''}</td>`).join('')}</tr>`
    ).join('');

    if (data.length > 10) {
        tbody.innerHTML += `<tr><td colspan="${headers.length}" style="text-align:center;color:#999;">... +${data.length - 10} more</td></tr>`;
    }
}

document.getElementById('confirm-upload').addEventListener('click', () => {
    if (!pendingUploadData) return;

    let imported = 0;
    pendingUploadData.forEach(row => {
        // Case-insensitive column matching helper
        function getVal(row, keys) {
            // First try exact match
            for (const key of keys) {
                if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
            }
            // Then try case-insensitive match on all row keys
            const rowKeys = Object.keys(row);
            for (const key of keys) {
                const found = rowKeys.find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
                if (found && row[found] !== undefined && row[found] !== null && row[found] !== '') return row[found];
            }
            return '';
        }

        const sku = getVal(row, ['SKU', 'sku', 'Sku', 'SKU Code', 'sku_code', 'Item Code', 'item_code', 'Code']);
        const name = getVal(row, ['Product Name', 'product_name', 'Name', 'name', 'Product', 'Item', 'Item Name', 'item_name', 'Description']);
        const category = getVal(row, ['Category', 'category', 'Cat', 'Type', 'Group']);
        const rawQty = getVal(row, ['Quantity', 'quantity', 'Qty', 'qty', 'QTY', 'Stock', 'stock', 'Opening Stock', 'Opening Qty', 'opening_qty', 'Qty.', 'Units', 'Count']);
        const rawPrice = getVal(row, ['Unit Price', 'unit_price', 'Price', 'price', 'Rate', 'rate', 'MRP', 'mrp', 'Cost', 'cost', 'Unit Cost']);

        const quantity = parseInt(rawQty) || 0;
        const price = parseFloat(rawPrice) || 0;

        if (sku && name) {
            const existing = StockManager.items.find(i => i.sku === sku);
            if (existing) {
                existing.quantity += quantity;
            } else {
                StockManager.items.push({
                    sku, name, category, quantity, price,
                    location: '', image: '', dateAdded: new Date().toISOString()
                });
            }
            imported++;
        }
    });

    StockManager.save();
    pendingUploadData = null;
    document.getElementById('upload-preview').classList.add('hidden');
    showToast(`Imported ${imported} items (with quantities)!`, 'success');
    renderSummary();
});

document.getElementById('cancel-upload').addEventListener('click', () => {
    pendingUploadData = null;
    document.getElementById('upload-preview').classList.add('hidden');
});

document.getElementById('download-template').addEventListener('click', () => {
    const templateData = [
        { 'SKU': 'SKU-0001', 'Product Name': 'Sample Product 1', 'Category': 'Electronics', 'Quantity': 100, 'Unit Price': 250.00 },
        { 'SKU': 'SKU-0002', 'Product Name': 'Sample Product 2', 'Category': 'Clothing', 'Quantity': 50, 'Unit Price': 499.99 },
        { 'SKU': 'SKU-0003', 'Product Name': 'Sample Product 3', 'Category': 'Food', 'Quantity': 200, 'Unit Price': 45.00 },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Opening Stock');
    XLSX.writeFile(wb, 'stock_template.xlsx');
    showToast('Template downloaded!', 'info');
});

// ==================== STOCK NEW FORM ====================
document.getElementById('generate-sku').addEventListener('click', () => {
    document.getElementById('new-sku').value = StockManager.generateSKU();
});

document.getElementById('new-stock-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const sku = document.getElementById('new-sku').value.trim();
    const name = document.getElementById('new-product').value.trim();
    const category = document.getElementById('new-category').value.trim();
    const quantity = parseInt(document.getElementById('new-quantity').value) || 0;
    const price = parseFloat(document.getElementById('new-price').value) || 0;
    const location = document.getElementById('new-location').value.trim();

    if (!sku || !name) { showToast('SKU and Product Name required', 'error'); return; }
    if (StockManager.items.find(i => i.sku === sku)) { showToast('SKU already exists!', 'error'); return; }

    StockManager.items.push({
        sku, name, category, quantity, price, location,
        image: currentImageBase64,
        dateAdded: new Date().toISOString()
    });

    StockManager.save();
    e.target.reset();
    // Reset image
    currentImageBase64 = '';
    imagePreview.src = '';
    imagePreview.style.display = 'none';
    imagePlaceholder.style.display = 'flex';
    removeImageBtn.classList.remove('visible');
    productImageInput.value = '';

    showToast(`"${name}" added!`, 'success');
});

setupSKUSuggestion('new-sku', 'new-sku-suggestions', null);

// ==================== STOCK IN ====================
setupSKUSuggestion('in-sku', 'in-sku-suggestions', (sku) => {
    const item = StockManager.items.find(i => i.sku === sku);
    if (item) document.getElementById('in-product-display').value = item.name;
});

document.getElementById('in-date').valueAsDate = new Date();
document.getElementById('out-date').valueAsDate = new Date();

document.getElementById('stock-in-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const sku = document.getElementById('in-sku').value.trim();
    const quantity = parseInt(document.getElementById('in-quantity').value) || 0;
    const date = document.getElementById('in-date').value;
    const source = document.getElementById('in-source').value.trim();
    const notes = document.getElementById('in-notes').value.trim();

    if (!sku || quantity <= 0) { showToast('Enter valid SKU and quantity', 'error'); return; }

    const item = StockManager.items.find(i => i.sku === sku);
    if (!item) { showToast('SKU not found! Add in New tab first.', 'error'); return; }

    StockManager.stockIn.push({ sku, productName: item.name, quantity, date, source, notes, timestamp: new Date().toISOString() });
    StockManager.save();
    e.target.reset();
    document.getElementById('in-date').valueAsDate = new Date();
    document.getElementById('in-product-display').value = '';
    renderStockInTable();
    showToast(`+${quantity} ${item.name} added!`, 'success');
});

function renderStockInTable() {
    const tbody = document.querySelector('#stock-in-table tbody');
    const recent = [...StockManager.stockIn].reverse().slice(0, 15);
    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">No transactions yet</td></tr>';
        return;
    }
    tbody.innerHTML = recent.map(t => `
        <tr>
            <td>${t.date}</td>
            <td><strong>${t.sku}</strong></td>
            <td>${t.productName}</td>
            <td style="color:#00b894;font-weight:700;">+${t.quantity}</td>
            <td>${t.source || '-'}</td>
        </tr>
    `).join('');
}

// ==================== STOCK OUT ====================
setupSKUSuggestion('out-sku', 'out-sku-suggestions', (sku) => {
    const item = StockManager.items.find(i => i.sku === sku);
    if (item) {
        document.getElementById('out-product-display').value = item.name;
        document.getElementById('out-available').value = StockManager.getCurrentStock(sku);
    }
});

document.getElementById('stock-out-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const sku = document.getElementById('out-sku').value.trim();
    const quantity = parseInt(document.getElementById('out-quantity').value) || 0;
    const date = document.getElementById('out-date').value;
    const destination = document.getElementById('out-destination').value.trim();
    const notes = document.getElementById('out-notes').value.trim();

    if (!sku || quantity <= 0) { showToast('Enter valid SKU and quantity', 'error'); return; }

    const item = StockManager.items.find(i => i.sku === sku);
    if (!item) { showToast('SKU not found!', 'error'); return; }

    const available = StockManager.getCurrentStock(sku);
    if (quantity > available) { showToast(`Insufficient! Available: ${available}`, 'error'); return; }

    StockManager.stockOut.push({ sku, productName: item.name, quantity, date, destination, notes, timestamp: new Date().toISOString() });
    StockManager.save();
    e.target.reset();
    document.getElementById('out-date').valueAsDate = new Date();
    document.getElementById('out-product-display').value = '';
    document.getElementById('out-available').value = '';
    renderStockOutTable();
    showToast(`-${quantity} ${item.name} recorded!`, 'success');
});

function renderStockOutTable() {
    const tbody = document.querySelector('#stock-out-table tbody');
    const recent = [...StockManager.stockOut].reverse().slice(0, 15);
    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">No transactions yet</td></tr>';
        return;
    }
    tbody.innerHTML = recent.map(t => `
        <tr>
            <td>${t.date}</td>
            <td><strong>${t.sku}</strong></td>
            <td>${t.productName}</td>
            <td style="color:#ff6b6b;font-weight:700;">-${t.quantity}</td>
            <td>${t.destination || '-'}</td>
        </tr>
    `).join('');
}

// ==================== SUMMARY ====================
function renderSummary() {
    const tbody = document.querySelector('#summary-table tbody');
    const searchQuery = document.getElementById('summary-search').value.toLowerCase();

    let filteredItems = StockManager.items;
    if (searchQuery) {
        filteredItems = filteredItems.filter(item =>
            item.sku.toLowerCase().includes(searchQuery) ||
            item.name.toLowerCase().includes(searchQuery) ||
            (item.category || '').toLowerCase().includes(searchQuery)
        );
    }

    let totalQuantity = 0, totalValue = 0, lowStockCount = 0;

    if (filteredItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:25px;">No stock items. Add items via Upload or New tab.</td></tr>';
    } else {
        tbody.innerHTML = filteredItems.map(item => {
            const totalIn = StockManager.getTotalIn(item.sku);
            const totalOut = StockManager.getTotalOut(item.sku);
            const currentStock = item.quantity + totalIn - totalOut;
            const value = currentStock * item.price;
            totalQuantity += currentStock;
            totalValue += value;
            if (currentStock <= 10) lowStockCount++;

            const stockClass = currentStock <= 10 ? 'low-stock' : '';
            const imgHtml = item.image
                ? `<img class="product-thumb" src="${item.image}" alt="${item.name}">`
                : `<span class="no-image-thumb">N/A</span>`;

            return `
                <tr>
                    <td>${imgHtml}</td>
                    <td><strong>${item.sku}</strong></td>
                    <td>${item.name}</td>
                    <td>${item.quantity}</td>
                    <td style="color:#00b894;font-weight:600;">+${totalIn}</td>
                    <td style="color:#ff6b6b;font-weight:600;">-${totalOut}</td>
                    <td class="${stockClass}">${currentStock}</td>
                    <td>&#8377;${value.toFixed(0)}</td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('total-items').textContent = StockManager.items.length;
    document.getElementById('total-quantity').textContent = totalQuantity;
    document.getElementById('total-value').textContent = `\u20B9${totalValue.toFixed(0)}`;
    document.getElementById('low-stock-count').textContent = lowStockCount;
}

document.getElementById('summary-search').addEventListener('input', renderSummary);

// ==================== EXPORT TO EXCEL ====================
document.getElementById('export-summary').addEventListener('click', () => {
    if (StockManager.items.length === 0) {
        showToast('No data to export! Add items first.', 'error');
        return;
    }

    const exportData = StockManager.items.map(item => ({
        'SKU': item.sku,
        'Product Name': item.name,
        'Category': item.category || '',
        'Location': item.location || '',
        'Opening Stock': item.quantity,
        'Total In': StockManager.getTotalIn(item.sku),
        'Total Out': StockManager.getTotalOut(item.sku),
        'Current Stock': StockManager.getCurrentStock(item.sku),
        'Unit Price': item.price,
        'Total Value': StockManager.getCurrentStock(item.sku) * item.price
    }));

    try {
        const ws = XLSX.utils.json_to_sheet(exportData);

        // Auto column width
        const colWidths = Object.keys(exportData[0]).map(key => ({
            wch: Math.max(key.length, ...exportData.map(row => String(row[key]).length)) + 2
        }));
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Stock Summary');

        // Add Stock In sheet
        if (StockManager.stockIn.length > 0) {
            const inData = StockManager.stockIn.map(t => ({
                'Date': t.date, 'SKU': t.sku, 'Product': t.productName,
                'Quantity': t.quantity, 'Source': t.source || '', 'Notes': t.notes || ''
            }));
            const wsIn = XLSX.utils.json_to_sheet(inData);
            XLSX.utils.book_append_sheet(wb, wsIn, 'Stock In');
        }

        // Add Stock Out sheet
        if (StockManager.stockOut.length > 0) {
            const outData = StockManager.stockOut.map(t => ({
                'Date': t.date, 'SKU': t.sku, 'Product': t.productName,
                'Quantity': t.quantity, 'Destination': t.destination || '', 'Notes': t.notes || ''
            }));
            const wsOut = XLSX.utils.json_to_sheet(outData);
            XLSX.utils.book_append_sheet(wb, wsOut, 'Stock Out');
        }

        const filename = `StockManager_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
        showToast(`Exported: ${filename}`, 'success');
    } catch (err) {
        console.error('Export error:', err);
        showToast('Export failed! Try again.', 'error');
    }
});

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', () => {
    StockManager.load();
    renderStockInTable();
    renderStockOutTable();
    renderSummary();
});
