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

        console.log(`Row: SKU=${sku}, Name=${name}, Qty=${quantity}, Price=${price}`);

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
                ? `<img class="product-thumb add-image-btn" src="${item.image}" alt="${item.name}" data-sku="${item.sku}" title="Tap to change image">`
                : `<span class="no-image-thumb add-image-btn" data-sku="${item.sku}" title="Tap to add image">+</span>`;

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
                
                if (!sku || !name) { failed++; return; }
                
                const existing = StockManager.items.find(i => i.sku === sku);
                if (existing) {
                    existing.quantity += quantity;
                    if (price > 0) existing.price = price;
                    if (category) existing.category = category;
                    updated++;
                } else {
                    StockManager.items.push({
                        sku, name, category, quantity, price,
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

    // Check if already logged in this session
    if (sessionStorage.getItem('stockManagerLoggedIn') === 'true') {
        loginModal.classList.add('hidden');
        mainApp.style.display = 'block';
        document.getElementById('bottom-nav-bar').style.display = '';
        return true;
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
            loginModal.classList.add('hidden');
            mainApp.style.display = 'block';
            document.getElementById('bottom-nav-bar').style.display = '';
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
