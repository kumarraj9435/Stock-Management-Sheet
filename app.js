// ==================== FIREBASE CONFIGURATION ====================
const firebaseConfig = {
    apiKey: "AIzaSyCZ2174ywVcOkWq2dQreDHC8MwU_iJkpsc",
    authDomain: "stock-management-2e0f8.firebaseapp.com",
    projectId: "stock-management-2e0f8",
    databaseURL: "https://stock-management-2e0f8-default-rtdb.asia-southeast1.firebasedatabase.app",
    storageBucket: "stock-management-2e0f8.firebasestorage.app",
    messagingSenderId: "500168775603",
    appId: "1:500168775603:web:ba214ea56c4d3cc7feddc6"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==================== COMPANY MANAGEMENT ====================
let currentCompanyId = '';

async function loadCompanies() {
    // Migrate old data if exists
    const oldDataSnapshot = await db.ref('stockData').once('value');
    const oldData = oldDataSnapshot.val();
    
    const snapshot = await db.ref('companies').once('value');
    let companies = snapshot.val();
    
    if (!companies) {
        // Create default company
        await db.ref('companies/default').set({ name: 'My Company', createdAt: new Date().toISOString() });
        // Migrate old data to default company
        if (oldData) {
            await db.ref('companies/default/stockData').set(oldData);
            await db.ref('stockData').remove(); // Clean old location
        }
        companies = { default: { name: 'My Company' } };
    }
    return companies;
}

function renderCompanySelector(companies) {
    const select = document.getElementById('company-select');
    select.innerHTML = '';
    Object.keys(companies).forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = companies[id].name;
        select.appendChild(opt);
    });
    // Restore last selected
    const saved = localStorage.getItem('currentCompanyId');
    if (saved && companies[saved]) {
        select.value = saved;
        currentCompanyId = saved;
    } else {
        currentCompanyId = Object.keys(companies)[0];
        select.value = currentCompanyId;
    }
}

function setupCompanySwitcher() {
    const select = document.getElementById('company-select');
    const addBtn = document.getElementById('add-company-btn');
    const delBtn = document.getElementById('delete-company-btn');

    select.addEventListener('change', () => {
        currentCompanyId = select.value;
        localStorage.setItem('currentCompanyId', currentCompanyId);
        // Detach old listener and attach new
        StockManager._listenersAttached = false;
        db.ref(`companies/${select.value}/stockData`).off();
        // Reload for new company
        StockManager.load().then(() => {
            StockManager.attachRealtimeListener();
            renderStockInTable();
            renderStockOutTable();
            renderSummary();
            showToast(`Switched to: ${select.options[select.selectedIndex].text}`, 'info');
        });
    });

    addBtn.addEventListener('click', () => {
        const pwd = prompt('Password enter karo:');
        if (pwd !== 'Raj@9435') { showToast('Wrong password!', 'error'); return; }
        const name = prompt('New company ka naam enter karo:');
        if (!name || !name.trim()) return;
        const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
        db.ref(`companies/${id}`).set({ name: name.trim(), createdAt: new Date().toISOString() }).then(() => {
            loadCompanies().then(companies => {
                renderCompanySelector(companies);
                // Switch to new company
                document.getElementById('company-select').value = id;
                currentCompanyId = id;
                localStorage.setItem('currentCompanyId', id);
                StockManager._listenersAttached = false;
                StockManager.items = [];
                StockManager.stockIn = [];
                StockManager.stockOut = [];
                StockManager.attachRealtimeListener();
                renderStockInTable();
                renderStockOutTable();
                renderSummary();
                showToast(`"${name.trim()}" company added!`, 'success');
            });
        });
    });

    delBtn.addEventListener('click', () => {
        const pwd = prompt('Password enter karo:');
        if (pwd !== 'Raj@9435') { showToast('Wrong password!', 'error'); return; }
        const select = document.getElementById('company-select');
        if (select.options.length <= 1) {
            showToast('Last company delete nahi kar sakte!', 'error');
            return;
        }
        const name = select.options[select.selectedIndex].text;
        if (!confirm(`"${name}" company ka SAARA data delete ho jayega! Sure?`)) return;
        const delId = currentCompanyId;
        db.ref(`companies/${delId}`).remove().then(() => {
            loadCompanies().then(companies => {
                renderCompanySelector(companies);
                currentCompanyId = Object.keys(companies)[0];
                select.value = currentCompanyId;
                localStorage.setItem('currentCompanyId', currentCompanyId);
                StockManager._listenersAttached = false;
                StockManager.load().then(() => {
                    StockManager.attachRealtimeListener();
                    renderStockInTable();
                    renderStockOutTable();
                    renderSummary();
                    showToast(`"${name}" deleted!`, 'success');
                });
            });
        });
    });
}

// ==================== DATA STORE (Firebase Realtime DB) ====================
const StockManager = {
    items: [],
    stockIn: [],
    stockOut: [],
    _listenersAttached: false,

    // Load data from Firebase for current company
    async load() {
        try {
            const snapshot = await db.ref(`companies/${currentCompanyId}/stockData`).once('value');
            const data = snapshot.val();
            if (data) {
                this.items = data.items || [];
                this.stockIn = data.stockIn || [];
                this.stockOut = data.stockOut || [];
            } else {
                this.items = [];
                this.stockIn = [];
                this.stockOut = [];
            }
        } catch (e) {
            console.error('Error loading from Firebase:', e);
            this._loadFromLocalStorage();
        }
    },

    _loadFromLocalStorage() {
        try {
            const data = localStorage.getItem('stockManagerData');
            if (data) {
                const parsed = JSON.parse(data);
                this.items = parsed.items || [];
                this.stockIn = parsed.stockIn || [];
                this.stockOut = parsed.stockOut || [];
            }
        } catch (e) {
            console.error('Error loading from localStorage:', e);
        }
    },


    // Save data to Firebase for current company
    save() {
        try {
            const data = {
                items: this.items,
                stockIn: this.stockIn,
                stockOut: this.stockOut
            };
            db.ref(`companies/${currentCompanyId}/stockData`).set(data).catch(err => {
                console.error('Firebase save error:', err);
                showToast('Sync error! Data saved locally.', 'error');
            });
            localStorage.setItem('stockManagerData', JSON.stringify(data));
        } catch (e) {
            console.error('Error saving data:', e);
            showToast('Storage error!', 'error');
        }
    },

    // Attach real-time listener for current company
    attachRealtimeListener() {
        if (this._listenersAttached) return;
        this._listenersAttached = true;

        db.ref(`companies/${currentCompanyId}/stockData`).on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                this.items = data.items || [];
                this.stockIn = data.stockIn || [];
                this.stockOut = data.stockOut || [];
            } else {
                this.items = [];
                this.stockIn = [];
                this.stockOut = [];
            }
            renderStockInTable();
            renderStockOutTable();
            renderSummary();
        }, (error) => {
            console.error('Realtime listener error:', error);
            showToast('Connection lost! Working offline.', 'error');
        });
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
            item.name.toLowerCase().includes(q) ||
            (item.ean || '').toLowerCase().includes(q)
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
    document.querySelectorAll('.desktop-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.desktop-tabs .tab-btn').forEach(b => {
        if (b.dataset.tab === tabName) b.classList.add('active');
    });

    document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-btn').forEach(b => {
        if (b.dataset.tab === tabName) b.classList.add('active');
    });

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    if (tabName === 'summary') renderSummary();
}

document.querySelectorAll('.desktop-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

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

document.getElementById('btn-camera').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('product-image-camera').click();
});

document.getElementById('btn-gallery').addEventListener('click', (e) => {
    e.stopPropagation();
    productImageInput.removeAttribute('capture');
    productImageInput.click();
});

productImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImageFile(file);
});

document.getElementById('product-image-camera').addEventListener('change', (e) => {
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

// Compress image to reduce size for Firebase DB storage
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
    let qtyImported = 0;

    console.log('Excel columns detected:', Object.keys(pendingUploadData[0]));
    console.log('First row data:', pendingUploadData[0]);

    pendingUploadData.forEach(row => {
        const rowKeys = Object.keys(row);

        function getVal(possibleNames) {
            for (const name of possibleNames) {
                if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') {
                    return row[name];
                }
            }
            for (const name of possibleNames) {
                const found = rowKeys.find(k => k.toLowerCase().trim() === name.toLowerCase().trim());
                if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') {
                    return row[found];
                }
            }
            for (const name of possibleNames) {
                const found = rowKeys.find(k => k.toLowerCase().trim().includes(name.toLowerCase().trim()));
                if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') {
                    return row[found];
                }
            }
            return '';
        }

        const sku = String(getVal(['SKU', 'sku', 'Sku', 'SKU Code', 'sku_code', 'Item Code', 'item_code', 'Code', 'code', 'Product Code', 'product_code', 'Article'])).trim();
        const name = String(getVal(['Product Name', 'product_name', 'Name', 'name', 'Product', 'Item', 'Item Name', 'item_name', 'Description', 'description', 'Title', 'title', 'Product Title'])).trim();
        const category = String(getVal(['Category', 'category', 'Cat', 'Type', 'Group', 'group', 'Section'])).trim();
        
        let rawQty = getVal(['Quantity', 'quantity', 'Qty', 'qty', 'QTY', 'QUANTITY', 'Stock', 'stock', 'STOCK', 'Opening Stock', 'Opening Qty', 'opening_qty', 'Qty.', 'Units', 'units', 'Count', 'count', 'Pcs', 'pcs', 'Nos', 'nos', 'Available', 'available', 'Balance', 'balance', 'In Hand', 'On Hand', 'Opening', 'opening']);
        
        if (rawQty === '') {
            const priceKeys = ['Unit Price', 'unit_price', 'Price', 'price', 'Rate', 'rate', 'MRP', 'mrp', 'Cost', 'cost'];
            const skipKeys = [...priceKeys, 'Sr', 'sr', 'S.No', 'S.no', 'No', 'no', 'Sr.', 'sr.', 'Sl', 'sl'];
            for (const key of rowKeys) {
                const val = row[key];
                const keyLower = key.toLowerCase().trim();
                if (skipKeys.some(s => keyLower === s.toLowerCase())) continue;
                if (keyLower.includes('sku') || keyLower.includes('name') || keyLower.includes('product') || keyLower.includes('category') || keyLower.includes('price') || keyLower.includes('rate') || keyLower.includes('mrp') || keyLower.includes('cost') || keyLower.includes('description') || keyLower.includes('code')) continue;
                if (val !== undefined && val !== null && !isNaN(Number(val)) && Number(val) > 0) {
                    rawQty = val;
                    console.log(`Auto-detected quantity column: "${key}" = ${val}`);
                    break;
                }
            }
        }
        
        let quantity = 0;
        if (rawQty !== '') {
            const cleaned = String(rawQty).replace(/[^0-9.\-]/g, '');
            quantity = parseInt(cleaned) || 0;
        }

        let rawPrice = getVal(['Unit Price', 'unit_price', 'Price', 'price', 'PRICE', 'Rate', 'rate', 'MRP', 'mrp', 'Cost', 'cost', 'Unit Cost', 'unit_cost', 'Selling Price', 'selling_price', 'Amount']);
        let price = 0;
        if (rawPrice !== '') {
            const cleanedPrice = String(rawPrice).replace(/[^0-9.\-]/g, '');
            price = parseFloat(cleanedPrice) || 0;
        }

        const ean = String(getVal(['EAN', 'ean', 'Barcode', 'barcode', 'BARCODE', 'EAN Code', 'ean_code', 'EAN-13', 'UPC', 'upc', 'GTIN', 'gtin'])).trim();

        console.log(`Row: SKU=${sku}, Name=${name}, Qty=${quantity}, Price=${price}, EAN=${ean}`);

        if (sku && name) {
            const existing = StockManager.items.find(i => i.sku === sku);
            if (existing) {
                existing.quantity += quantity;
                if (ean) existing.ean = ean;
            } else {
                StockManager.items.push({
                    sku, name, category, quantity, price, ean,
                    location: '', image: '', dateAdded: new Date().toISOString()
                });
            }
            imported++;
            if (quantity > 0) qtyImported++;
        }
    });

    StockManager.save();
    pendingUploadData = null;
    document.getElementById('upload-preview').classList.add('hidden');
    
    if (qtyImported === 0 && imported > 0) {
        showToast(`${imported} items imported but Quantity column not found! Check column header name.`, 'error');
    } else {
        showToast(`Imported ${imported} items with quantities!`, 'success');
    }
    renderSummary();
});

document.getElementById('cancel-upload').addEventListener('click', () => {
    pendingUploadData = null;
    document.getElementById('upload-preview').classList.add('hidden');
});


document.getElementById('download-template').addEventListener('click', () => {
    const templateData = [
        { 'SKU': 'SKU-0001', 'Product Name': 'Sample Product 1', 'Category': 'Electronics', 'Quantity': 100, 'Unit Price': 250.00, 'EAN': '8901234567890' },
        { 'SKU': 'SKU-0002', 'Product Name': 'Sample Product 2', 'Category': 'Clothing', 'Quantity': 50, 'Unit Price': 499.99, 'EAN': '8901234567891' },
        { 'SKU': 'SKU-0003', 'Product Name': 'Sample Product 3', 'Category': 'Food', 'Quantity': 200, 'Unit Price': 45.00, 'EAN': '8901234567892' },
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
    const ean = document.getElementById('new-ean').value.trim();
    const location = document.getElementById('new-location').value.trim();

    if (!sku || !name) { showToast('SKU and Product Name required', 'error'); return; }
    if (StockManager.items.find(i => i.sku === sku)) { showToast('SKU already exists!', 'error'); return; }

    StockManager.items.push({
        sku, name, category, quantity, price, location, ean,
        image: currentImageBase64,
        dateAdded: new Date().toISOString()
    });

    StockManager.save();
    e.target.reset();
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
let inImageBase64 = '';

document.getElementById('in-btn-camera').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('in-product-image-camera').click();
});

document.getElementById('in-btn-gallery').addEventListener('click', (e) => {
    e.stopPropagation();
    const input = document.getElementById('in-product-image');
    input.removeAttribute('capture');
    input.click();
});

document.getElementById('in-product-image').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            compressImage(ev.target.result, 300, 0.7, (compressed) => {
                inImageBase64 = compressed;
                document.getElementById('in-image-preview').src = compressed;
                document.getElementById('in-image-preview').style.display = 'block';
                document.getElementById('in-image-placeholder').style.display = 'none';
                document.getElementById('in-remove-image').classList.add('visible');
            });
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('in-product-image-camera').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            compressImage(ev.target.result, 300, 0.7, (compressed) => {
                inImageBase64 = compressed;
                document.getElementById('in-image-preview').src = compressed;
                document.getElementById('in-image-preview').style.display = 'block';
                document.getElementById('in-image-placeholder').style.display = 'none';
                document.getElementById('in-remove-image').classList.add('visible');
            });
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('in-remove-image').addEventListener('click', (e) => {
    e.stopPropagation();
    inImageBase64 = '';
    document.getElementById('in-image-preview').src = '';
    document.getElementById('in-image-preview').style.display = 'none';
    document.getElementById('in-image-placeholder').style.display = 'flex';
    document.getElementById('in-remove-image').classList.remove('visible');
    document.getElementById('in-product-image').value = '';
});

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

    StockManager.stockIn.push({ sku, productName: item.name, quantity, date, source, notes, image: inImageBase64, timestamp: new Date().toISOString() });
    StockManager.save();
    e.target.reset();
    document.getElementById('in-date').valueAsDate = new Date();
    document.getElementById('in-product-display').value = '';
    inImageBase64 = '';
    document.getElementById('in-image-preview').src = '';
    document.getElementById('in-image-preview').style.display = 'none';
    document.getElementById('in-image-placeholder').style.display = 'flex';
    document.getElementById('in-remove-image').classList.remove('visible');
    document.getElementById('in-product-image').value = '';
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
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#999;padding:25px;">No stock items. Add items via Upload or New tab.</td></tr>';
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
                ? `<img class="product-thumb add-image-btn" src="${item.image}" alt="${item.name}" data-sku="${item.sku}" title="Tap to change image">`
                : `<span class="no-image-thumb add-image-btn" data-sku="${item.sku}" title="Tap to add image">+</span>`;

            return `
                <tr>
                    <td>${imgHtml}</td>
                    <td><strong>${item.sku}</strong></td>
                    <td style="font-size:0.7rem;color:#888;">${item.ean || '-'}</td>
                    <td>${item.name}</td>
                    <td>${item.quantity}</td>
                    <td style="color:#00b894;font-weight:600;">+${totalIn}</td>
                    <td style="color:#ff6b6b;font-weight:600;">-${totalOut}</td>
                    <td class="${stockClass}">${currentStock}</td>
                    <td>&#8377;${value.toFixed(0)}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn-edit-item" data-sku="${item.sku}" title="Edit" style="background:none;border:none;cursor:pointer;font-size:1rem;padding:2px 5px;">&#9998;</button>
                        <button class="btn-delete-item" data-sku="${item.sku}" title="Delete" style="background:none;border:none;cursor:pointer;font-size:1rem;padding:2px 5px;color:#ff6b6b;">&#128465;</button>
                    </td>
                </tr>
            `;
        }).join('');

        // Add click handlers for image upload on each item
        document.querySelectorAll('.add-image-btn').forEach(el => {
            el.addEventListener('click', () => {
                const sku = el.dataset.sku;
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        compressImage(ev.target.result, 300, 0.7, (compressed) => {
                            const item = StockManager.items.find(i => i.sku === sku);
                            if (item) {
                                item.image = compressed;
                                StockManager.save();
                                renderSummary();
                                showToast(`Image added for ${item.name}!`, 'success');
                            }
                        });
                    };
                    reader.readAsDataURL(file);
                };
                input.click();
            });
        });

        // Edit item handlers
        document.querySelectorAll('.btn-edit-item').forEach(el => {
            el.addEventListener('click', () => {
                const sku = el.dataset.sku;
                const item = StockManager.items.find(i => i.sku === sku);
                if (!item) return;
                document.getElementById('edit-sku-original').value = sku;
                document.getElementById('edit-sku').value = item.sku;
                document.getElementById('edit-ean').value = item.ean || '';
                document.getElementById('edit-name').value = item.name;
                document.getElementById('edit-category').value = item.category || '';
                document.getElementById('edit-quantity').value = item.quantity;
                document.getElementById('edit-price').value = item.price;
                document.getElementById('edit-location').value = item.location || '';
                document.getElementById('edit-modal').classList.remove('hidden');
            });
        });

        // Delete item handlers
        document.querySelectorAll('.btn-delete-item').forEach(el => {
            el.addEventListener('click', () => {
                const sku = el.dataset.sku;
                const item = StockManager.items.find(i => i.sku === sku);
                if (!item) return;
                const pwd = prompt('Delete karne ke liye password enter karo:');
                if (pwd !== 'Raj@9435') { showToast('Wrong password!', 'error'); return; }
                if (!confirm(`"${item.name}" (${sku}) delete karna hai? Ye undo nahi hoga!`)) return;
                StockManager.items = StockManager.items.filter(i => i.sku !== sku);
                StockManager.save();
                renderSummary();
                showToast(`"${item.name}" deleted!`, 'success');
            });
        });
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
        'EAN': item.ean || '',
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
        const colWidths = Object.keys(exportData[0]).map(key => ({
            wch: Math.max(key.length, ...exportData.map(row => String(row[key]).length)) + 2
        }));
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Stock Summary');

        if (StockManager.stockIn.length > 0) {
            const inData = StockManager.stockIn.map(t => ({
                'Date': t.date, 'SKU': t.sku, 'Product': t.productName,
                'Quantity': t.quantity, 'Source': t.source || '', 'Notes': t.notes || ''
            }));
            const wsIn = XLSX.utils.json_to_sheet(inData);
            XLSX.utils.book_append_sheet(wb, wsIn, 'Stock In');
        }

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


// ==================== BACKUP ====================
function createBackup() {
    if (StockManager.items.length === 0) {
        showToast('No data to backup!', 'error');
        return;
    }

    const exportData = StockManager.items.map(item => ({
        'SKU': item.sku,
        'Product Name': item.name,
        'Category': item.category || '',
        'Opening Stock': item.quantity,
        'Total In': StockManager.getTotalIn(item.sku),
        'Total Out': StockManager.getTotalOut(item.sku),
        'Current Stock': StockManager.getCurrentStock(item.sku),
        'Unit Price': item.price,
        'Total Value': StockManager.getCurrentStock(item.sku) * item.price
    }));

    try {
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Stock Summary');

        if (StockManager.stockIn.length > 0) {
            const inData = StockManager.stockIn.map(t => ({
                'Date': t.date, 'SKU': t.sku, 'Product': t.productName,
                'Quantity': t.quantity, 'Source': t.source || '', 'Notes': t.notes || ''
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inData), 'Stock In');
        }

        if (StockManager.stockOut.length > 0) {
            const outData = StockManager.stockOut.map(t => ({
                'Date': t.date, 'SKU': t.sku, 'Product': t.productName,
                'Quantity': t.quantity, 'Destination': t.destination || '', 'Notes': t.notes || ''
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outData), 'Stock Out');
        }

        const now = new Date();
        const filename = `Backup_StockManager_${now.toISOString().slice(0, 10)}_${now.getHours()}${now.getMinutes()}.xlsx`;
        XLSX.writeFile(wb, filename);
        showToast(`Backup saved: ${filename}`, 'success');
    } catch (err) {
        console.error('Backup error:', err);
        showToast('Backup failed!', 'error');
    }
}

document.getElementById('backup-now').addEventListener('click', createBackup);


// ==================== CLEAR ALL DATA ====================
const CLEAR_PASSWORD = 'Raj@9435';

document.getElementById('clear-all-btn').addEventListener('click', () => {
    document.getElementById('clear-modal').classList.remove('hidden');
    document.getElementById('clear-password').value = '';
    document.getElementById('clear-error').style.display = 'none';
});

document.getElementById('clear-cancel').addEventListener('click', () => {
    document.getElementById('clear-modal').classList.add('hidden');
});

document.getElementById('clear-confirm').addEventListener('click', () => {
    const password = document.getElementById('clear-password').value.trim();
    
    if (password !== CLEAR_PASSWORD) {
        document.getElementById('clear-error').textContent = 'Wrong password! Try again.';
        document.getElementById('clear-error').style.display = 'block';
        return;
    }

    if (!confirm('Are you SURE? Sab data permanently delete ho jayega! Ye action undo nahi ho sakta.')) {
        return;
    }

    // Create backup before clearing
    createBackup();

    // Clear all data from Firebase
    StockManager.items = [];
    StockManager.stockIn = [];
    StockManager.stockOut = [];
    
    // Clear from Firebase DB for current company
    db.ref(`companies/${currentCompanyId}/stockData`).set({
        items: [],
        stockIn: [],
        stockOut: []
    });

    // Also clear localStorage
    localStorage.removeItem('stockManagerData');
    localStorage.removeItem('stockManagerBackup');

    document.getElementById('clear-modal').classList.add('hidden');

    renderStockInTable();
    renderStockOutTable();
    renderSummary();

    showToast('All data cleared! Backup downloaded.', 'success');
});

document.getElementById('clear-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('clear-modal')) {
        document.getElementById('clear-modal').classList.add('hidden');
    }
});


// ==================== BULK OPERATIONS ====================

// Bulk Stock In
document.getElementById('bulk-in-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = new Uint8Array(ev.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            
            if (rows.length === 0) { showToast('File is empty!', 'error'); return; }
            
            let success = 0, failed = 0;
            const today = new Date().toISOString().slice(0, 10);
            
            rows.forEach(row => {
                const rowKeys = Object.keys(row);
                function getVal(names) {
                    for (const n of names) {
                        if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return row[n];
                        const found = rowKeys.find(k => k.toLowerCase().trim() === n.toLowerCase().trim());
                        if (found && row[found] !== undefined && String(row[found]).trim() !== '') return row[found];
                        const partial = rowKeys.find(k => k.toLowerCase().includes(n.toLowerCase()));
                        if (partial && row[partial] !== undefined && String(row[partial]).trim() !== '') return row[partial];
                    }
                    return '';
                }
                
                const sku = String(getVal(['SKU', 'sku', 'Code', 'Item Code'])).trim();
                const rawQty = getVal(['Quantity', 'Qty', 'qty', 'QTY', 'Stock', 'Units', 'Count', 'Pcs']);
                const quantity = parseInt(String(rawQty).replace(/[^0-9]/g, '')) || 0;
                const source = String(getVal(['Source', 'Supplier', 'From', 'Vendor'])).trim();
                const date = String(getVal(['Date', 'date'])).trim() || today;
                
                if (!sku || quantity <= 0) { failed++; return; }
                
                const item = StockManager.items.find(i => i.sku === sku);
                if (!item) { failed++; return; }
                
                StockManager.stockIn.push({
                    sku, productName: item.name, quantity, date, source,
                    notes: 'Bulk Import', image: '', timestamp: new Date().toISOString()
                });
                success++;
            });
            
            StockManager.save();
            renderStockInTable();
            renderSummary();
            e.target.value = '';
            
            if (failed > 0) {
                showToast(`Stock In: ${success} done, ${failed} failed (SKU not found or qty=0)`, 'info');
            } else {
                showToast(`Bulk Stock In: ${success} entries added!`, 'success');
            }
        } catch (err) {
            showToast('Error reading file', 'error');
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
});


// Bulk Stock Out
document.getElementById('bulk-out-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = new Uint8Array(ev.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            
            if (rows.length === 0) { showToast('File is empty!', 'error'); return; }
            
            let success = 0, failed = 0, insufficient = 0;
            const today = new Date().toISOString().slice(0, 10);
            
            rows.forEach(row => {
                const rowKeys = Object.keys(row);
                function getVal(names) {
                    for (const n of names) {
                        if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return row[n];
                        const found = rowKeys.find(k => k.toLowerCase().trim() === n.toLowerCase().trim());
                        if (found && row[found] !== undefined && String(row[found]).trim() !== '') return row[found];
                        const partial = rowKeys.find(k => k.toLowerCase().includes(n.toLowerCase()));
                        if (partial && row[partial] !== undefined && String(row[partial]).trim() !== '') return row[partial];
                    }
                    return '';
                }
                
                const sku = String(getVal(['SKU', 'sku', 'Code', 'Item Code'])).trim();
                const rawQty = getVal(['Quantity', 'Qty', 'qty', 'QTY', 'Stock', 'Units', 'Count', 'Pcs']);
                const quantity = parseInt(String(rawQty).replace(/[^0-9]/g, '')) || 0;
                const destination = String(getVal(['Destination', 'Customer', 'To', 'Buyer'])).trim();
                const date = String(getVal(['Date', 'date'])).trim() || today;
                
                if (!sku || quantity <= 0) { failed++; return; }
                
                const item = StockManager.items.find(i => i.sku === sku);
                if (!item) { failed++; return; }
                
                const available = StockManager.getCurrentStock(sku);
                if (quantity > available) { insufficient++; return; }
                
                StockManager.stockOut.push({
                    sku, productName: item.name, quantity, date, destination,
                    notes: 'Bulk Import', timestamp: new Date().toISOString()
                });
                success++;
            });
            
            StockManager.save();
            renderStockOutTable();
            renderSummary();
            e.target.value = '';
            
            let msg = `Bulk Stock Out: ${success} done`;
            if (failed > 0) msg += `, ${failed} failed`;
            if (insufficient > 0) msg += `, ${insufficient} insufficient stock`;
            showToast(msg, success > 0 ? 'success' : 'error');
        } catch (err) {
            showToast('Error reading file', 'error');
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
});


// Bulk New Stock
document.getElementById('bulk-new-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = new Uint8Array(ev.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            
            if (rows.length === 0) { showToast('File is empty!', 'error'); return; }
            
            let added = 0, updated = 0, failed = 0;
            
            rows.forEach(row => {
                const rowKeys = Object.keys(row);
                function getVal(names) {
                    for (const n of names) {
                        if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return row[n];
                        const found = rowKeys.find(k => k.toLowerCase().trim() === n.toLowerCase().trim());
                        if (found && row[found] !== undefined && String(row[found]).trim() !== '') return row[found];
                        const partial = rowKeys.find(k => k.toLowerCase().includes(n.toLowerCase()));
                        if (partial && row[partial] !== undefined && String(row[partial]).trim() !== '') return row[partial];
                    }
                    return '';
                }
                
                const sku = String(getVal(['SKU', 'sku', 'Code', 'Item Code', 'Product Code'])).trim();
                const name = String(getVal(['Product Name', 'Name', 'Product', 'Item', 'Item Name', 'Description', 'Title'])).trim();
                const category = String(getVal(['Category', 'Cat', 'Type', 'Group'])).trim();
                const rawQty = getVal(['Quantity', 'Qty', 'qty', 'QTY', 'Stock', 'Opening Stock', 'Units', 'Count', 'Pcs', 'Opening']);
                const quantity = parseInt(String(rawQty).replace(/[^0-9]/g, '')) || 0;
                const rawPrice = getVal(['Unit Price', 'Price', 'Rate', 'MRP', 'Cost']);
                const price = parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 0;
                const ean = String(getVal(['EAN', 'ean', 'Barcode', 'barcode', 'BARCODE', 'EAN Code', 'ean_code', 'EAN-13', 'UPC', 'upc', 'GTIN', 'gtin'])).trim();
                
                if (!sku || !name) { failed++; return; }
                
                const existing = StockManager.items.find(i => i.sku === sku);
                if (existing) {
                    existing.quantity += quantity;
                    if (price > 0) existing.price = price;
                    if (category) existing.category = category;
                    if (ean) existing.ean = ean;
                    updated++;
                } else {
                    StockManager.items.push({
                        sku, name, category, quantity, price, ean,
                        location: '', image: '', dateAdded: new Date().toISOString()
                    });
                    added++;
                }
            });
            
            StockManager.save();
            renderSummary();
            e.target.value = '';
            showToast(`Bulk: ${added} new + ${updated} updated${failed > 0 ? ', ' + failed + ' failed' : ''}`, 'success');
        } catch (err) {
            showToast('Error reading file', 'error');
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
});


// ==================== LOGIN SYSTEM ====================
const APP_PASSWORD = 'Raj@9436';

function setupLogin() {
    const loginModal = document.getElementById('login-modal');
    const loginBtn = document.getElementById('login-btn');
    const loginPassword = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');
    const mainApp = document.getElementById('main-app');

    // Check if already logged in (within 20 minutes)
    const loginTime = sessionStorage.getItem('stockManagerLoginTime');
    if (sessionStorage.getItem('stockManagerLoggedIn') === 'true' && loginTime) {
        const elapsed = Date.now() - parseInt(loginTime);
        if (elapsed < 20 * 60 * 1000) { // 20 minutes
            loginModal.classList.add('hidden');
            mainApp.style.display = 'block';
            document.getElementById('bottom-nav-bar').style.display = '';
            // Set timeout for remaining time
            const remaining = (20 * 60 * 1000) - elapsed;
            setTimeout(() => {
                sessionStorage.removeItem('stockManagerLoggedIn');
                sessionStorage.removeItem('stockManagerLoginTime');
                location.reload();
            }, remaining);
            return true;
        } else {
            // Session expired
            sessionStorage.removeItem('stockManagerLoggedIn');
            sessionStorage.removeItem('stockManagerLoginTime');
        }
    }

    // Login button click
    loginBtn.addEventListener('click', () => {
        attemptLogin();
    });

    // Enter key on password field
    loginPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') attemptLogin();
    });

    function attemptLogin() {
        const pwd = loginPassword.value.trim();
        if (pwd === APP_PASSWORD) {
            sessionStorage.setItem('stockManagerLoggedIn', 'true');
            sessionStorage.setItem('stockManagerLoginTime', Date.now().toString());
            loginModal.classList.add('hidden');
            mainApp.style.display = 'block';
            document.getElementById('bottom-nav-bar').style.display = '';
            // Auto-expire after 20 minutes
            setTimeout(() => {
                sessionStorage.removeItem('stockManagerLoggedIn');
                sessionStorage.removeItem('stockManagerLoginTime');
                location.reload();
            }, 20 * 60 * 1000);
            initApp();
        } else {
            loginError.textContent = 'Wrong password! Try again.';
            loginError.style.display = 'block';
            loginPassword.value = '';
            loginPassword.focus();
        }
    }

    return false;
}

// ==================== INITIALIZE ====================
async function initApp() {
    showToast('Connecting to database...', 'info');
    
    // Load companies and setup switcher
    const companies = await loadCompanies();
    renderCompanySelector(companies);
    setupCompanySwitcher();
    
    // Load data for current company
    await StockManager.load();
    StockManager.attachRealtimeListener();
    renderStockInTable();
    renderStockOutTable();
    renderSummary();
    showToast('Connected! Real-time sync active.', 'success');
}

document.addEventListener('DOMContentLoaded', () => {
    const alreadyLoggedIn = setupLogin();
    if (alreadyLoggedIn) {
        initApp();
    }
});



// ==================== EDIT ITEM MODAL ====================
document.getElementById('edit-cancel').addEventListener('click', () => {
    document.getElementById('edit-modal').classList.add('hidden');
});

document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-modal')) {
        document.getElementById('edit-modal').classList.add('hidden');
    }
});

document.getElementById('edit-item-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const sku = document.getElementById('edit-sku-original').value;
    const item = StockManager.items.find(i => i.sku === sku);
    if (!item) { showToast('Item not found!', 'error'); return; }

    item.name = document.getElementById('edit-name').value.trim();
    item.ean = document.getElementById('edit-ean').value.trim();
    item.category = document.getElementById('edit-category').value.trim();
    item.quantity = parseInt(document.getElementById('edit-quantity').value) || 0;
    item.price = parseFloat(document.getElementById('edit-price').value) || 0;
    item.location = document.getElementById('edit-location').value.trim();

    StockManager.save();
    document.getElementById('edit-modal').classList.add('hidden');
    renderSummary();
    showToast(`"${item.name}" updated!`, 'success');
});


// ==================== BARCODE SCANNER ====================
let html5QrcodeScanner = null;
let barcodeTargetInput = null;

function openBarcodeScanner(targetInputId) {
    barcodeTargetInput = targetInputId;
    const modal = document.getElementById('barcode-modal');
    const resultDiv = document.getElementById('barcode-result');
    resultDiv.textContent = '';
    modal.classList.remove('hidden');

    // Initialize scanner
    setTimeout(() => {
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear().catch(() => {});
        }

        html5QrcodeScanner = new Html5QrcodeScanner(
            "barcode-reader",
            {
                fps: 10,
                qrbox: { width: 250, height: 150 },
                rememberLastUsedCamera: true,
                supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.CODE_93,
                    Html5QrcodeSupportedFormats.ITF,
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.DATA_MATRIX,
                    Html5QrcodeSupportedFormats.CODABAR
                ]
            },
            false
        );

        html5QrcodeScanner.render(onBarcodeScanSuccess, onBarcodeScanFailure);
    }, 300);
}

function onBarcodeScanSuccess(decodedText, decodedResult) {
    // Barcode successfully scanned
    const resultDiv = document.getElementById('barcode-result');
    resultDiv.textContent = `Scanned: ${decodedText}`;

    // Fill the target input
    if (barcodeTargetInput) {
        const input = document.getElementById(barcodeTargetInput);
        
        // Try to find item by SKU or EAN
        let item = StockManager.items.find(i => i.sku === decodedText);
        if (!item) {
            item = StockManager.items.find(i => i.ean && i.ean === decodedText);
        }

        if (item) {
            // Found by EAN or SKU - fill the SKU value
            if (input) {
                input.value = item.sku;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.classList.add('barcode-scan-success');
                setTimeout(() => input.classList.remove('barcode-scan-success'), 600);
            }
            if (barcodeTargetInput === 'in-sku') {
                document.getElementById('in-product-display').value = item.name;
            } else if (barcodeTargetInput === 'out-sku') {
                document.getElementById('out-product-display').value = item.name;
                document.getElementById('out-available').value = StockManager.getCurrentStock(item.sku);
            }
            showToast(`Found: ${item.name} (Stock: ${StockManager.getCurrentStock(item.sku)})`, 'success');
        } else {
            // Not found - just fill the scanned value as SKU
            if (input) {
                input.value = decodedText;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.classList.add('barcode-scan-success');
                setTimeout(() => input.classList.remove('barcode-scan-success'), 600);
            }
            // If on new-sku, also fill EAN field
            if (barcodeTargetInput === 'new-sku') {
                document.getElementById('new-ean').value = decodedText;
            }
            showToast(`Barcode scanned: ${decodedText}`, 'info');
        }
    }

    // Close scanner after successful scan
    closeBarcodeScanner();
}

function onBarcodeScanFailure(error) {
    // Scan failure is normal while scanning - no action needed
}

function closeBarcodeScanner() {
    const modal = document.getElementById('barcode-modal');
    modal.classList.add('hidden');

    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch((err) => {
            console.log('Scanner clear error:', err);
        });
        html5QrcodeScanner = null;
    }
}

// Barcode scan button click handlers
document.querySelectorAll('.btn-barcode').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = btn.dataset.target;
        openBarcodeScanner(targetId);
    });
});

// Close barcode modal
document.getElementById('barcode-cancel').addEventListener('click', () => {
    closeBarcodeScanner();
});

// Close on backdrop click
document.getElementById('barcode-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('barcode-modal')) {
        closeBarcodeScanner();
    }
});



// ==================== GOOGLE SHEET LIVE STOCK (UNIGEN ONLY) ====================
// Supports ALL sheets from the spreadsheet with sheet selector

/**
 * IMPORTANT: Replace this URL with your deployed Google Apps Script Web App URL
 * Deploy the google-apps-script.js code as a Web App and paste the URL here.
 */
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzJQ5nS4BTtPvLHvioPkdi5zUp_rLUStCkvkhWWdS_JqIymXYDH4O0f_BINGjfUA5ILxw/exec';

// Live Stock State
const LiveStock = {
    data: [],
    headers: [],
    filteredData: [],
    allSheetsData: {},    // { sheetName: { headers, data, totalRows } }
    sheetNames: [],       // list of all sheet names
    currentSheet: '',     // currently selected sheet
    autoRefreshInterval: null,
    isLoading: false,
    lastSynced: null,

    // Check if current company is Unigen
    isUnigen() {
        const select = document.getElementById('company-select');
        if (!select) return false;
        const selectedText = select.options[select.selectedIndex]?.text || '';
        const selectedValue = select.value || '';
        return selectedText.toLowerCase().includes('unigen') || selectedValue.toLowerCase().includes('unigen');
    },

    // Show/Hide Live Stock tab based on company
    toggleLiveStockTab() {
        const isUnigen = this.isUnigen();
        document.querySelectorAll('.unigen-only-tab').forEach(el => {
            el.style.display = isUnigen ? '' : 'none';
        });

        // If switching away from Unigen and live-stock tab is active, switch to upload tab
        if (!isUnigen) {
            const liveStockSection = document.getElementById('live-stock');
            if (liveStockSection && liveStockSection.classList.contains('active')) {
                switchTab('opening-stock');
            }
            this.stopAutoRefresh();
        } else {
            this.startAutoRefresh();
        }
    },

    // Fetch ALL sheets data from Google Sheet
    async fetchData() {
        if (GOOGLE_SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
            this.showError('Google Apps Script URL not configured! Edit app.js and set GOOGLE_SCRIPT_URL.');
            return;
        }

        this.isLoading = true;
        this.updateLoadingUI(true);
        this.updateSyncIndicator('syncing');

        try {
            const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=readAll`);
            const result = await response.json();

            if (result.success) {
                this.allSheetsData = result.sheets || {};
                this.sheetNames = Object.keys(this.allSheetsData);
                this.lastSynced = new Date();

                // Render sheet selector
                this.renderSheetSelector();

                // If no current sheet selected, pick first one (prefer Master Sheet 2026)
                if (!this.currentSheet || !this.allSheetsData[this.currentSheet]) {
                    this.currentSheet = this.sheetNames.find(s => s.includes('Master Sheet')) || this.sheetNames[0] || '';
                }

                // Load current sheet data
                this.loadSheetData(this.currentSheet);
                this.updateSyncIndicator('connected');
                this.updateLastSyncTime();
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Live Stock fetch error:', error);
            this.updateSyncIndicator('error');
            showToast('Google Sheet sync failed: ' + error.message, 'error');
        } finally {
            this.isLoading = false;
            this.updateLoadingUI(false);
        }
    },

    // Load a specific sheet's data into the table
    loadSheetData(sheetName) {
        if (!sheetName || !this.allSheetsData[sheetName]) return;
        this.currentSheet = sheetName;
        const sheetData = this.allSheetsData[sheetName];
        this.data = sheetData.data || [];
        this.headers = sheetData.headers || [];
        this.filteredData = [...this.data];

        // Update sheet selector value
        const selector = document.getElementById('live-stock-sheet-select');
        if (selector) selector.value = sheetName;

        this.renderTable();
        document.getElementById('live-stock-row-count').textContent = `${this.data.length} rows in "${sheetName}"`;
    },

    // Render sheet selector dropdown
    renderSheetSelector() {
        const selector = document.getElementById('live-stock-sheet-select');
        if (!selector) return;
        const prevValue = selector.value;
        selector.innerHTML = this.sheetNames.map(name => {
            const rows = this.allSheetsData[name]?.totalRows || 0;
            return `<option value="${name}">${name} (${rows})</option>`;
        }).join('');
        // Restore previous selection
        if (prevValue && this.sheetNames.includes(prevValue)) {
            selector.value = prevValue;
        } else if (this.currentSheet) {
            selector.value = this.currentSheet;
        }
    },

    // Update a cell in Google Sheet
    async updateCell(masterSKU, columnName, newValue) {
        if (GOOGLE_SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
            showToast('Google Apps Script URL not configured!', 'error');
            return false;
        }

        this.updateSyncIndicator('syncing');

        try {
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'update',
                    sheet: this.currentSheet,
                    masterSKU: masterSKU,
                    updates: { [columnName]: newValue }
                })
            });

            const result = await response.json();

            if (result.success) {
                // Update local data
                const row = this.data.find(r => {
                    const skuKey = this.headers.find(h => h.toLowerCase().includes('master sku')) || 'Master SKU';
                    return String(r[skuKey]).trim() === String(masterSKU).trim();
                });
                if (row) {
                    row[columnName] = newValue;
                }
                this.updateSyncIndicator('connected');
                showToast(`Updated: ${columnName} = ${newValue}`, 'success');
                this.renderTable();
                return true;
            } else {
                throw new Error(result.error || 'Update failed');
            }
        } catch (error) {
            console.error('Live Stock update error:', error);
            this.updateSyncIndicator('error');
            showToast('Update failed: ' + error.message, 'error');
            return false;
        }
    },

    // Add a new row to Google Sheet
    async addRow(rowData) {
        if (GOOGLE_SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
            showToast('Google Apps Script URL not configured!', 'error');
            return false;
        }

        this.updateSyncIndicator('syncing');

        try {
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'add',
                    sheet: this.currentSheet,
                    rowData: rowData
                })
            });

            const result = await response.json();

            if (result.success) {
                this.updateSyncIndicator('connected');
                showToast('New row added to Google Sheet!', 'success');
                // Refresh to get latest data
                await this.fetchData();
                return true;
            } else {
                throw new Error(result.error || 'Add failed');
            }
        } catch (error) {
            console.error('Live Stock add error:', error);
            this.updateSyncIndicator('error');
            showToast('Add failed: ' + error.message, 'error');
            return false;
        }
    },

    // Render the table
    renderTable() {
        const thead = document.getElementById('live-stock-thead');
        const tbody = document.getElementById('live-stock-tbody');

        if (!thead || !tbody) return;

        // Filter out internal columns
        const displayHeaders = this.headers.filter(h => !h.startsWith('_'));

        // Render headers
        thead.innerHTML = `<tr>${displayHeaders.map(h => `<th>${h}</th>`).join('')}</tr>`;

        // Render data
        if (this.filteredData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${displayHeaders.length}" style="text-align:center;color:#999;padding:25px;">No data found</td></tr>`;
            return;
        }

        // Find the best identifier column (Master SKU > SKU > EAN > first column)
        const skuKey = this.headers.find(h => h.toLowerCase().includes('master sku'))
            || this.headers.find(h => h.toLowerCase() === 'sku')
            || this.headers.find(h => h.toLowerCase().includes('ean'))
            || this.headers[0] || '';

        tbody.innerHTML = this.filteredData.map(row => {
            const masterSKU = row[skuKey] || '';

            return `<tr>${displayHeaders.map(header => {
                const value = row[header] !== undefined && row[header] !== null ? row[header] : '';
                const isEditable = masterSKU ? 'editable-cell' : '';
                return `<td class="${isEditable}" data-sku="${masterSKU}" data-column="${header}" title="Click to edit">${value}</td>`;
            }).join('')}</tr>`;
        }).join('');

        // Add click handlers for editable cells
        tbody.querySelectorAll('.editable-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const sku = cell.dataset.sku;
                const column = cell.dataset.column;
                const currentValue = cell.textContent;
                this.openEditCellModal(sku, column, currentValue);
            });
        });
    },

    // Search/Filter
    filterData(query) {
        if (!query) {
            this.filteredData = [...this.data];
        } else {
            const q = query.toLowerCase();
            this.filteredData = this.data.filter(row => {
                return Object.values(row).some(val =>
                    String(val).toLowerCase().includes(q)
                );
            });
        }
        this.renderTable();
        document.getElementById('live-stock-row-count').textContent = `${this.filteredData.length} of ${this.data.length} rows`;
    },

    // Open edit cell modal
    openEditCellModal(sku, column, currentValue) {
        document.getElementById('edit-cell-sku').textContent = sku;
        document.getElementById('edit-cell-column').textContent = column;
        document.getElementById('edit-cell-value').value = currentValue;
        document.getElementById('edit-cell-modal').classList.remove('hidden');

        // Store current edit context
        this._editContext = { sku, column };
    },

    // UI Helpers
    updateLoadingUI(isLoading) {
        const loadingEl = document.getElementById('live-stock-loading');
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
        }
    },

    updateSyncIndicator(status) {
        const indicator = document.getElementById('sync-indicator');
        const statusText = document.getElementById('sync-status-text');
        if (!indicator || !statusText) return;

        indicator.className = 'sync-indicator';
        switch (status) {
            case 'connected':
                indicator.classList.add('sync-connected');
                statusText.textContent = 'Connected';
                break;
            case 'syncing':
                indicator.classList.add('sync-syncing');
                statusText.textContent = 'Syncing...';
                break;
            case 'error':
                indicator.classList.add('sync-error');
                statusText.textContent = 'Error';
                break;
            default:
                statusText.textContent = 'Disconnected';
        }
    },

    updateLastSyncTime() {
        const el = document.getElementById('live-stock-last-sync');
        if (el && this.lastSynced) {
            el.textContent = `Last sync: ${this.lastSynced.toLocaleTimeString()}`;
        }
    },

    showError(msg) {
        const tbody = document.getElementById('live-stock-tbody');
        const thead = document.getElementById('live-stock-thead');
        if (thead) thead.innerHTML = '';
        if (tbody) {
            tbody.innerHTML = `<tr><td style="text-align:center;color:#ff6b6b;padding:25px;">${msg}</td></tr>`;
        }
        this.updateLoadingUI(false);
    },

    // Auto-refresh every 30 seconds
    startAutoRefresh() {
        this.stopAutoRefresh();
        if (this.isUnigen()) {
            this.fetchData();
            this.autoRefreshInterval = setInterval(() => {
                if (this.isUnigen() && !this.isLoading) {
                    this.fetchData();
                }
            }, 30000); // 30 seconds
        }
    },

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }
};

// ==================== LIVE STOCK EVENT HANDLERS ====================

// Refresh button
document.getElementById('live-stock-refresh')?.addEventListener('click', () => {
    LiveStock.fetchData();
});

// Sheet selector change
document.getElementById('live-stock-sheet-select')?.addEventListener('change', (e) => {
    const sheetName = e.target.value;
    if (sheetName) {
        LiveStock.loadSheetData(sheetName);
        // Clear search when switching sheets
        const searchInput = document.getElementById('live-stock-search-input');
        if (searchInput) searchInput.value = '';
    }
});

// Import to App button - sync Master Sheet data to Firebase/App Summary
document.getElementById('live-stock-import-to-app')?.addEventListener('click', async () => {
    if (LiveStock.data.length === 0) {
        showToast('Pehle data load hone do! Refresh karo.', 'error');
        return;
    }

    const pwd = prompt('Import karne ke liye password enter karo:');
    if (pwd !== 'Raj@9435') { showToast('Wrong password!', 'error'); return; }

    const sheetData = LiveStock.data;
    const headers = LiveStock.headers;

    // Find relevant columns dynamically
    const skuKey = headers.find(h => h.toLowerCase().includes('master sku')) || headers.find(h => h.toLowerCase() === 'sku') || '';
    const nameKey = headers.find(h => h.toLowerCase().includes('product name')) || headers.find(h => h.toLowerCase() === 'name') || '';
    const categoryKey = headers.find(h => h.toLowerCase().includes('category')) || '';
    const eanKey = headers.find(h => h.toLowerCase().includes('ean') || h.toLowerCase().includes('barcode')) || '';
    const statusKey = headers.find(h => h.toLowerCase().includes('status')) || '';

    // Find stock/quantity columns - look for Opening Stock or any numeric month columns
    const openingKey = headers.find(h => h.toLowerCase().includes('opening stock') || h.toLowerCase().includes('opening')) || '';

    // Calculate current stock from monthly data if available
    const monthKeys = headers.filter(h => {
        const lower = h.toLowerCase();
        return lower === 'jan' || lower === 'feb' || lower === 'mar' || lower === 'apr' || 
               lower === 'may' || lower === 'jun' || lower === 'jul' || lower === 'aug' || 
               lower === 'sep' || lower === 'oct' || lower === 'nov' || lower === 'dec' ||
               lower.includes('january') || lower.includes('february') || lower.includes('march') ||
               lower.includes('april') || lower.includes('may') || lower.includes('june') ||
               lower.includes('july') || lower.includes('august') || lower.includes('september') ||
               lower.includes('october') || lower.includes('november') || lower.includes('december');
    });

    if (!skuKey || !nameKey) {
        showToast('Sheet mein Master SKU ya Product Name column nahi mila!', 'error');
        return;
    }

    let imported = 0, updated = 0, skipped = 0;

    sheetData.forEach(row => {
        const sku = String(row[skuKey] || '').trim();
        const name = String(row[nameKey] || '').trim();
        const category = categoryKey ? String(row[categoryKey] || '').trim() : '';
        const ean = eanKey ? String(row[eanKey] || '').trim() : '';
        const status = statusKey ? String(row[statusKey] || '').trim() : '';

        // Skip inactive/discontinued or empty rows
        if (!sku || !name) { skipped++; return; }
        if (status && (status.toLowerCase() === 'inactive' || status.toLowerCase() === 'discontinued')) { skipped++; return; }

        // Calculate quantity: Opening Stock + sum of monthly data
        let quantity = 0;
        if (openingKey && row[openingKey] !== '' && row[openingKey] !== undefined) {
            quantity = parseInt(String(row[openingKey]).replace(/[^0-9\-]/g, '')) || 0;
        }

        // If there are monthly columns, sum them up (they represent adjustments/sales)
        // But typically Master Sheet 2026 has Opening Stock as the base
        // If no opening stock found, try to find any numeric column as quantity
        if (quantity === 0 && monthKeys.length > 0) {
            // Sum all month values as total stock movement
            monthKeys.forEach(mk => {
                const val = parseInt(String(row[mk] || '0').replace(/[^0-9\-]/g, '')) || 0;
                quantity += val;
            });
        }

        // Update or add to StockManager
        const existing = StockManager.items.find(i => i.sku === sku);
        if (existing) {
            // Update existing item
            existing.name = name;
            if (category) existing.category = category;
            if (ean) existing.ean = ean;
            existing.quantity = quantity; // Override with sheet's current stock
            updated++;
        } else {
            // Add new item
            StockManager.items.push({
                sku, name, category, quantity, price: 0, ean,
                location: '', image: '', dateAdded: new Date().toISOString()
            });
            imported++;
        }
    });

    // Save to Firebase
    StockManager.save();
    renderSummary();

    showToast(`Import Done! ${imported} new + ${updated} updated + ${skipped} skipped`, 'success');
});

// Search input
document.getElementById('live-stock-search-input')?.addEventListener('input', (e) => {
    LiveStock.filterData(e.target.value.trim());
});

// Add Row button - open modal
document.getElementById('live-stock-add-row')?.addEventListener('click', () => {
    document.getElementById('add-row-modal').classList.remove('hidden');
    document.getElementById('add-row-form').reset();
});

// Add Row form submit
document.getElementById('add-row-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const rowData = {};
    // Map form fields to column names (flexible matching)
    const category = document.getElementById('add-row-category').value.trim();
    const sku = document.getElementById('add-row-sku').value.trim();
    const product = document.getElementById('add-row-product').value.trim();
    const title = document.getElementById('add-row-title').value.trim();
    const ean = document.getElementById('add-row-ean').value.trim();
    const status = document.getElementById('add-row-status').value;
    const opening = document.getElementById('add-row-opening').value || '0';

    if (!sku || !product) {
        showToast('Master SKU and Product Name required!', 'error');
        return;
    }

    // Match to actual sheet headers
    LiveStock.headers.forEach(header => {
        const h = header.toLowerCase();
        if (h.includes('category')) rowData[header] = category;
        else if (h.includes('master sku') || h === 'master sku') rowData[header] = sku;
        else if (h.includes('product name')) rowData[header] = product;
        else if (h === 'title' || h.includes('title')) rowData[header] = title;
        else if (h.includes('ean') || h.includes('barcode')) rowData[header] = ean;
        else if (h.includes('status')) rowData[header] = status;
        else if (h.includes('opening')) rowData[header] = parseInt(opening) || 0;
    });

    const success = await LiveStock.addRow(rowData);
    if (success) {
        document.getElementById('add-row-modal').classList.add('hidden');
        document.getElementById('add-row-form').reset();
    }
});

// Add Row cancel
document.getElementById('add-row-cancel')?.addEventListener('click', () => {
    document.getElementById('add-row-modal').classList.add('hidden');
});

// Edit Cell save
document.getElementById('edit-cell-save')?.addEventListener('click', async () => {
    if (!LiveStock._editContext) return;
    const { sku, column, sheet } = LiveStock._editContext;
    const newValue = document.getElementById('edit-cell-value').value;
    const targetSheet = sheet || LiveStock.currentSheet;

    LiveStock.updateSyncIndicator('syncing');
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'update',
                sheet: targetSheet,
                masterSKU: sku,
                updates: { [column]: newValue }
            })
        });
        const result = await response.json();
        if (result.success) {
            LiveStock.updateSyncIndicator('connected');
            showToast(`Updated: ${column} = ${newValue}`, 'success');
            // Refresh the relevant table
            if (sheet && sheet !== LiveStock.currentSheet) {
                // It's from SheetInOut sections
                if (SheetInOut.inCurrentSheet === sheet) SheetInOut.loadSheet(sheet, 'in');
                else if (SheetInOut.outCurrentSheet === sheet) SheetInOut.loadSheet(sheet, 'out');
            } else {
                // Update LiveStock local data
                const row = LiveStock.data.find(r => {
                    const skuKey = LiveStock.headers.find(h => h.toLowerCase().includes('master sku')) || 'Master SKU';
                    return String(r[skuKey]).trim() === String(sku).trim();
                });
                if (row) row[column] = newValue;
                LiveStock.renderTable();
            }
        } else {
            throw new Error(result.error || 'Update failed');
        }
    } catch (error) {
        LiveStock.updateSyncIndicator('error');
        showToast('Update failed: ' + error.message, 'error');
    }
    document.getElementById('edit-cell-modal').classList.add('hidden');
});

// Edit Cell cancel
document.getElementById('edit-cell-cancel')?.addEventListener('click', () => {
    document.getElementById('edit-cell-modal').classList.add('hidden');
});

// Close modals on backdrop click
document.getElementById('add-row-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('add-row-modal')) {
        document.getElementById('add-row-modal').classList.add('hidden');
    }
});

document.getElementById('edit-cell-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-cell-modal')) {
        document.getElementById('edit-cell-modal').classList.add('hidden');
    }
});

// Enter key on edit cell input
document.getElementById('edit-cell-value')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('edit-cell-save').click();
    }
});

// ==================== HOOK INTO COMPANY SWITCHER ====================

// Override the company-select change to also toggle Live Stock
const _originalCompanySelect = document.getElementById('company-select');
if (_originalCompanySelect) {
    _originalCompanySelect.addEventListener('change', () => {
        // Small delay to ensure currentCompanyId is updated
        setTimeout(() => {
            LiveStock.toggleLiveStockTab();
        }, 100);
    });
}

// Hook into initApp to check Unigen on startup
const _originalInitApp = initApp;
initApp = async function() {
    await _originalInitApp();
    // After app initializes, check if Unigen is selected
    setTimeout(() => {
        LiveStock.toggleLiveStockTab();
    }, 500);
};

// Also hook tab switching for live-stock tab
const _originalSwitchTab = switchTab;
switchTab = function(tabName) {
    _originalSwitchTab(tabName);
    if (tabName === 'live-stock' && LiveStock.isUnigen()) {
        if (LiveStock.data.length === 0) {
            LiveStock.fetchData();
        }
    }
};



// ==================== GOOGLE SHEET IN/OUT SECTIONS (UNIGEN ONLY) ====================
// Shows selected Google Sheet data in Stock In/Out tabs with bidirectional edit

const SheetInOut = {
    inData: [], inHeaders: [], inFilteredData: [], inCurrentSheet: '',
    outData: [], outHeaders: [], outFilteredData: [], outCurrentSheet: '',

    async loadSheet(sheetName, type) {
        if (!sheetName || GOOGLE_SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') return;
        
        showToast(`Loading ${sheetName}...`, 'info');
        try {
            const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=read&sheet=${encodeURIComponent(sheetName)}`);
            const result = await response.json();
            
            if (result.success) {
                if (type === 'in') {
                    this.inData = result.data || [];
                    this.inHeaders = result.headers || [];
                    this.inFilteredData = [...this.inData];
                    this.inCurrentSheet = sheetName;
                    this.renderTable('in');
                    document.getElementById('sheet-in-count').textContent = `${this.inData.length} rows in "${sheetName}"`;
                } else {
                    this.outData = result.data || [];
                    this.outHeaders = result.headers || [];
                    this.outFilteredData = [...this.outData];
                    this.outCurrentSheet = sheetName;
                    this.renderTable('out');
                    document.getElementById('sheet-out-count').textContent = `${this.outData.length} rows in "${sheetName}"`;
                }
                showToast(`${sheetName} loaded!`, 'success');
            } else {
                showToast('Error: ' + (result.error || 'Failed'), 'error');
            }
        } catch (err) {
            showToast('Sheet load failed: ' + err.message, 'error');
        }
    },

    renderTable(type) {
        const headers = type === 'in' ? this.inHeaders : this.outHeaders;
        const data = type === 'in' ? this.inFilteredData : this.outFilteredData;
        const thead = document.getElementById(`sheet-${type}-thead`);
        const tbody = document.getElementById(`sheet-${type}-tbody`);
        if (!thead || !tbody) return;

        const displayHeaders = headers.filter(h => !h.startsWith('_'));
        thead.innerHTML = `<tr>${displayHeaders.map(h => `<th>${h}</th>`).join('')}</tr>`;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${displayHeaders.length}" style="text-align:center;color:#999;padding:20px;">No data</td></tr>`;
            return;
        }

        // Find identifier column
        const skuKey = headers.find(h => h.toLowerCase().includes('sku') || h.toLowerCase().includes('ean')) || headers[0] || '';
        const currentSheet = type === 'in' ? this.inCurrentSheet : this.outCurrentSheet;

        tbody.innerHTML = data.slice(0, 100).map(row => {
            const id = row[skuKey] || '';
            return `<tr>${displayHeaders.map(header => {
                const value = row[header] !== undefined && row[header] !== null ? row[header] : '';
                return `<td class="editable-cell" data-sku="${id}" data-column="${header}" data-sheet="${currentSheet}" data-type="${type}" title="Click to edit">${value}</td>`;
            }).join('')}</tr>`;
        }).join('');

        // Click to edit
        tbody.querySelectorAll('.editable-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const sku = cell.dataset.sku;
                const column = cell.dataset.column;
                const currentValue = cell.textContent;
                document.getElementById('edit-cell-sku').textContent = sku;
                document.getElementById('edit-cell-column').textContent = column;
                document.getElementById('edit-cell-value').value = currentValue;
                document.getElementById('edit-cell-modal').classList.remove('hidden');
                LiveStock._editContext = { sku, column, sheet: cell.dataset.sheet };
            });
        });
    },

    filter(type, query) {
        const data = type === 'in' ? this.inData : this.outData;
        if (!query) {
            if (type === 'in') this.inFilteredData = [...data];
            else this.outFilteredData = [...data];
        } else {
            const q = query.toLowerCase();
            const filtered = data.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(q)));
            if (type === 'in') this.inFilteredData = filtered;
            else this.outFilteredData = filtered;
        }
        this.renderTable(type);
    }
};

// Sheet In selector change
document.getElementById('sheet-in-select')?.addEventListener('change', (e) => {
    const sheetName = e.target.value;
    if (sheetName) SheetInOut.loadSheet(sheetName, 'in');
});

// Sheet Out selector change
document.getElementById('sheet-out-select')?.addEventListener('change', (e) => {
    const sheetName = e.target.value;
    if (sheetName) SheetInOut.loadSheet(sheetName, 'out');
});

// Search filters
document.getElementById('sheet-in-search')?.addEventListener('input', (e) => {
    SheetInOut.filter('in', e.target.value.trim());
});

document.getElementById('sheet-out-search')?.addEventListener('input', (e) => {
    SheetInOut.filter('out', e.target.value.trim());
});



// ==================== SHEET IN/OUT ADD ENTRY BUTTONS ====================

// Add Entry to In Sheet
document.getElementById('sheet-in-add-entry')?.addEventListener('click', async () => {
    const sheetName = document.getElementById('sheet-in-select')?.value;
    if (!sheetName) { showToast('Pehle sheet select karo!', 'error'); return; }

    const sku = document.getElementById('sheet-in-sku-input')?.value.trim();
    const qty = document.getElementById('sheet-in-qty-input')?.value.trim();
    const notes = document.getElementById('sheet-in-notes-input')?.value.trim();

    if (!sku || !qty) { showToast('EAN/SKU aur Qty dono required hai!', 'error'); return; }

    const today = new Date().toISOString().slice(0, 10);
    const rowData = {};

    // Map to sheet headers
    const headers = SheetInOut.inHeaders;
    headers.forEach(h => {
        const lower = h.toLowerCase();
        if (lower.includes('ean') || lower.includes('barcode') || lower.includes('sku')) rowData[h] = sku;
        else if (lower.includes('qty') || lower.includes('quantity') || lower.includes('stock') || lower.includes('pcs') || lower.includes('units')) rowData[h] = parseInt(qty) || 0;
        else if (lower.includes('date')) rowData[h] = today;
        else if (lower.includes('source') || lower.includes('notes') || lower.includes('remark') || lower.includes('from')) rowData[h] = notes;
    });

    // If no header matched for SKU, put in first column
    if (Object.keys(rowData).length === 0 || !Object.values(rowData).some(v => v === sku)) {
        if (headers[0]) rowData[headers[0]] = sku;
        if (headers[1]) rowData[headers[1]] = parseInt(qty) || 0;
        if (headers[2]) rowData[headers[2]] = today;
        if (headers[3]) rowData[headers[3]] = notes;
    }

    showToast('Adding entry...', 'info');
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'add', sheet: sheetName, rowData: rowData })
        });
        const result = await response.json();
        if (result.success) {
            showToast('Entry added to ' + sheetName + '!', 'success');
            document.getElementById('sheet-in-sku-input').value = '';
            document.getElementById('sheet-in-qty-input').value = '';
            document.getElementById('sheet-in-notes-input').value = '';
            // Reload sheet data
            SheetInOut.loadSheet(sheetName, 'in');
        } else {
            showToast('Failed: ' + (result.error || 'Unknown'), 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
});

// Add Entry to Out Sheet
document.getElementById('sheet-out-add-entry')?.addEventListener('click', async () => {
    const sheetName = document.getElementById('sheet-out-select')?.value;
    if (!sheetName) { showToast('Pehle sheet select karo!', 'error'); return; }

    const sku = document.getElementById('sheet-out-sku-input')?.value.trim();
    const qty = document.getElementById('sheet-out-qty-input')?.value.trim();
    const notes = document.getElementById('sheet-out-notes-input')?.value.trim();

    if (!sku || !qty) { showToast('EAN/SKU aur Qty dono required hai!', 'error'); return; }

    const today = new Date().toISOString().slice(0, 10);
    const rowData = {};

    // Map to sheet headers
    const headers = SheetInOut.outHeaders;
    headers.forEach(h => {
        const lower = h.toLowerCase();
        if (lower.includes('ean') || lower.includes('barcode') || lower.includes('sku')) rowData[h] = sku;
        else if (lower.includes('qty') || lower.includes('quantity') || lower.includes('stock') || lower.includes('pcs') || lower.includes('units')) rowData[h] = parseInt(qty) || 0;
        else if (lower.includes('date')) rowData[h] = today;
        else if (lower.includes('destination') || lower.includes('customer') || lower.includes('notes') || lower.includes('remark') || lower.includes('to') || lower.includes('portal')) rowData[h] = notes;
    });

    // If no header matched for SKU, put in first column
    if (Object.keys(rowData).length === 0 || !Object.values(rowData).some(v => v === sku)) {
        if (headers[0]) rowData[headers[0]] = sku;
        if (headers[1]) rowData[headers[1]] = parseInt(qty) || 0;
        if (headers[2]) rowData[headers[2]] = today;
        if (headers[3]) rowData[headers[3]] = notes;
    }

    showToast('Adding entry...', 'info');
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'add', sheet: sheetName, rowData: rowData })
        });
        const result = await response.json();
        if (result.success) {
            showToast('Entry added to ' + sheetName + '!', 'success');
            document.getElementById('sheet-out-sku-input').value = '';
            document.getElementById('sheet-out-qty-input').value = '';
            document.getElementById('sheet-out-notes-input').value = '';
            // Reload sheet data
            SheetInOut.loadSheet(sheetName, 'out');
        } else {
            showToast('Failed: ' + (result.error || 'Unknown'), 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
});
