// ==================== DATA STORE ====================
const StockManager = {
    items: [],
    stockIn: [],
    stockOut: [],

    load() {
        const data = localStorage.getItem('stockManagerData');
        if (data) {
            const parsed = JSON.parse(data);
            this.items = parsed.items || [];
            this.stockIn = parsed.stockIn || [];
            this.stockOut = parsed.stockOut || [];
        }
    },

    save() {
        localStorage.setItem('stockManagerData', JSON.stringify({
            items: this.items,
            stockIn: this.stockIn,
            stockOut: this.stockOut
        }));
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
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'summary') renderSummary();
    });
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
        setTimeout(() => suggestions.classList.remove('visible'), 200);
    });
}

// ==================== IMAGE UPLOAD ====================
let currentImageBase64 = '';

const imageUploadArea = document.getElementById('image-upload-area');
const productImageInput = document.getElementById('product-image');
const imagePreview = document.getElementById('image-preview');
const imagePlaceholder = document.getElementById('image-placeholder');
const removeImageBtn = document.getElementById('remove-image');

imageUploadArea.addEventListener('click', (e) => {
    if (e.target === removeImageBtn || e.target.closest('.remove-image-btn')) return;
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
        currentImageBase64 = e.target.result;
        imagePreview.src = currentImageBase64;
        imagePreview.style.display = 'block';
        imagePlaceholder.style.display = 'none';
        removeImageBtn.classList.add('visible');
    };
    reader.readAsDataURL(file);
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
        `<tr>${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>`
    ).join('');

    if (data.length > 10) {
        tbody.innerHTML += `<tr><td colspan="${headers.length}" style="text-align:center;color:#999;">... +${data.length - 10} more</td></tr>`;
    }
}

document.getElementById('confirm-upload').addEventListener('click', () => {
    if (!pendingUploadData) return;

    let imported = 0;
    pendingUploadData.forEach(row => {
        const sku = row['SKU'] || row['sku'] || row['Sku'] || row['SKU Code'] || '';
        const name = row['Product Name'] || row['product_name'] || row['Name'] || row['name'] || row['Product'] || '';
        const category = row['Category'] || row['category'] || row['Cat'] || '';
        const quantity = parseInt(row['Quantity'] || row['quantity'] || row['Qty'] || row['qty'] || 0);
        const price = parseFloat(row['Unit Price'] || row['unit_price'] || row['Price'] || row['price'] || 0);

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
    showToast(`Imported ${imported} items!`, 'success');
});

document.getElementById('cancel-upload').addEventListener('click', () => {
    pendingUploadData = null;
    document.getElementById('upload-preview').classList.add('hidden');
});

document.getElementById('download-template').addEventListener('click', () => {
    const templateData = [
        { 'SKU': 'SKU-0001', 'Product Name': 'Sample Product 1', 'Category': 'Electronics', 'Quantity': 100, 'Unit Price': 250.00 },
        { 'SKU': 'SKU-0002', 'Product Name': 'Sample Product 2', 'Category': 'Clothing', 'Quantity': 50, 'Unit Price': 499.99 },
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

    showToast(`"${name}" added successfully!`, 'success');
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
    if (!item) { showToast('SKU not found! Add in Stock New first.', 'error'); return; }

    StockManager.stockIn.push({ sku, productName: item.name, quantity, date, source, notes, timestamp: new Date().toISOString() });
    StockManager.save();
    e.target.reset();
    document.getElementById('in-date').valueAsDate = new Date();
    document.getElementById('in-product-display').value = '';
    renderStockInTable();
    showToast(`Stock In: +${quantity} ${item.name}`, 'success');
});

function renderStockInTable() {
    const tbody = document.querySelector('#stock-in-table tbody');
    const recent = [...StockManager.stockIn].reverse().slice(0, 15);
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
    if (quantity > available) { showToast(`Insufficient stock! Available: ${available}`, 'error'); return; }

    StockManager.stockOut.push({ sku, productName: item.name, quantity, date, destination, notes, timestamp: new Date().toISOString() });
    StockManager.save();
    e.target.reset();
    document.getElementById('out-date').valueAsDate = new Date();
    document.getElementById('out-product-display').value = '';
    document.getElementById('out-available').value = '';
    renderStockOutTable();
    showToast(`Stock Out: -${quantity} ${item.name}`, 'success');
});

function renderStockOutTable() {
    const tbody = document.querySelector('#stock-out-table tbody');
    const recent = [...StockManager.stockOut].reverse().slice(0, 15);
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

    document.getElementById('total-items').textContent = StockManager.items.length;
    document.getElementById('total-quantity').textContent = totalQuantity;
    document.getElementById('total-value').textContent = `\u20B9${totalValue.toFixed(0)}`;
    document.getElementById('low-stock-count').textContent = lowStockCount;
}

document.getElementById('summary-search').addEventListener('input', renderSummary);

document.getElementById('export-summary').addEventListener('click', () => {
    const exportData = StockManager.items.map(item => ({
        'SKU': item.sku,
        'Product Name': item.name,
        'Category': item.category,
        'Opening Stock': item.quantity,
        'Total In': StockManager.getTotalIn(item.sku),
        'Total Out': StockManager.getTotalOut(item.sku),
        'Current Stock': StockManager.getCurrentStock(item.sku),
        'Unit Price': item.price,
        'Total Value': StockManager.getCurrentStock(item.sku) * item.price
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Summary');
    XLSX.writeFile(wb, `stock_summary_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Summary exported!', 'info');
});

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', () => {
    StockManager.load();
    renderStockInTable();
    renderStockOutTable();
    renderSummary();
});
