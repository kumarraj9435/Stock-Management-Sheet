# StockManager - Stock Management Sheet

A complete web-based stock management application with SKU suggestions, Excel upload, and Stock In/Out/New management.

## Features

### 1. SKU Suggestion (Auto-complete)
- Type in any SKU field and get instant suggestions from existing stock items
- Shows SKU code, product name, and available quantity
- Works across Stock In, Stock Out, and Stock New sections

### 2. Excel Upload for Opening Stock
- Drag & drop or browse to upload Excel files (.xlsx, .xls, .csv)
- Preview data before confirming import
- Auto-maps common column names (SKU, Product Name, Category, Quantity, Unit Price)
- Download a template file for easy formatting
- Handles duplicate SKUs by adding to existing quantity

### 3. Stock New
- Add brand new stock items to the inventory
- Auto-generate unique SKU codes
- Fields: SKU, Product Name, Category, Quantity, Unit Price, Location

### 4. Stock In (Incoming Stock)
- Record incoming stock with SKU selection
- Fields: SKU, Quantity, Date, Source/Supplier, Notes
- View recent Stock In transactions

### 5. Stock Out (Outgoing Stock)
- Record outgoing stock with available stock validation
- Prevents over-issuing (checks available balance)
- Fields: SKU, Quantity, Date, Destination/Customer, Notes
- View recent Stock Out transactions

### 6. Summary Dashboard
- Real-time stats: Total Items, Total Quantity, Total Value, Low Stock alerts
- Full inventory table with Opening, In, Out, and Current Stock columns
- Search/filter by SKU, Product Name, or Category
- Export to Excel with one click

## How to Use

1. Open `index.html` in a web browser
2. Upload opening stock via Excel file, or add items manually in "Stock New"
3. Use "Stock In" to record incoming inventory
4. Use "Stock Out" to record outgoing inventory
5. View the "Summary" tab for a complete overview

## Tech Stack

- **HTML5 / CSS3 / JavaScript** (Vanilla - no framework needed)
- **SheetJS (xlsx)** for Excel file reading/writing
- **localStorage** for data persistence

## Data Persistence

All data is stored in the browser's localStorage. To reset, clear your browser's local storage for this page.

## File Structure

```
Stock-Management-Sheet/
├── index.html      # Main HTML structure
├── styles.css      # All styles
├── app.js          # Application logic
└── README.md       # Documentation
```
