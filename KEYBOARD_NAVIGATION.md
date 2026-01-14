# Keyboard Navigation Guide - Data Agung

## 🎹 Google Sheets-Style Navigation

The Data Agung view now supports comprehensive keyboard navigation, making it as easy to use as Google Sheets!

## Quick Reference Card

```
┌──────────────────────────────────────────────────────────┐
│                 KEYBOARD SHORTCUTS                       │
├──────────────────────────────────────────────────────────┤
│ NAVIGATION                                              │
│  ↑ ↓         Move up/down between rows                  │
│  ← →         Move left/right between tables             │
│  Home        Jump to first item in current table        │
│  End         Jump to last item in current table         │
│                                                          │
│ QUICK ACCESS                                            │
│  1           Go to Base Warehouse                       │
│  2           Go to Produk Online                        │
│  3           Go to Produk Kosong                        │
│  4           Go to Table Masuk                          │
│                                                          │
│ ACTIONS                                                 │
│  Enter       Toggle switch on selected item             │
│  Space       Toggle switch on selected item             │
│  A           Add product (in Produk Online)             │
│  /           Focus search bar                           │
│  Esc         Close modal/Cancel                         │
│  ?           Show/hide this help                        │
└──────────────────────────────────────────────────────────┘
```

## Visual Feedback

### Active Table
- **Colored Border**: The active table has a bright colored border
  - Blue for Base Warehouse
  - Green for Produk Online
  - Yellow for Produk Kosong
  - Purple for Table Masuk
- **Glow Effect**: Active table has a subtle shadow glow
- **Shortcut Badge**: Shows the number key to access (e.g., "Press 2")

### Selected Row
- **Highlighted**: Selected row has matching colored border
- **Background Tint**: Subtle colored background
- **Glow Shadow**: Soft shadow effect for depth
- **Auto-Scroll**: Automatically scrolls into view when navigating

## Usage Scenarios

### Scenario 1: Quick Product Review
```
1. Press '2' → Jump to Produk Online
2. Use ↑↓ → Browse products
3. Press Enter → Toggle product status
4. Press '4' → Check Table Masuk for restocked items
```

### Scenario 2: Adding Products
```
1. Press '2' → Go to Produk Online
2. Press 'A' → Open add product modal
3. Use Tab/Arrow keys → Select product from dropdown
4. Press Enter → Confirm addition
```

### Scenario 3: Search and Toggle
```
1. Press '3' → Go to Produk Kosong
2. Press '/' → Focus search
3. Type part number
4. Press Esc → Exit search
5. Use ↑↓ → Navigate filtered results
6. Press Enter → Toggle product back online
```

### Scenario 4: Cross-Table Review
```
1. Press '1' → Start at Base Warehouse
2. Use → → Move through all tables
3. Use ↑↓ → Check items in each table
4. Press Home/End → Jump to extremes
```

## Tips for Power Users

1. **Quick Table Switching**
   - Don't use arrow keys to move between tables
   - Use number keys 1-4 for instant access
   - Much faster for non-sequential navigation

2. **Search First, Navigate Later**
   - Press '/' to search immediately
   - Narrow down results
   - Then use ↑↓ for precise selection

3. **Keyboard-Only Workflow**
   - Never touch the mouse!
   - Start with '?' to review shortcuts
   - Practice the number keys for table switching
   - Use Enter for all actions

4. **Visual Cues**
   - Watch for colored borders (active table)
   - Look for highlighted rows (selected item)
   - Check shortcut badges in headers

5. **Modal Management**
   - Esc key closes any modal instantly
   - No need to find the X button
   - Quick cancel for any dialog

## Accessibility Features

✅ **Full Keyboard Access**: Every feature accessible via keyboard  
✅ **Visual Indicators**: Clear feedback for current state  
✅ **Auto-Scroll**: Selected items always visible  
✅ **Help System**: Built-in ? key for guidance  
✅ **Logical Flow**: Intuitive key mappings  
✅ **No Mouse Required**: Complete keyboard-only operation

## Comparison to Google Sheets

| Feature | Google Sheets | Data Agung | Notes |
|---------|--------------|------------|-------|
| Arrow Navigation | ✅ | ✅ | Same behavior |
| Home/End Keys | ✅ | ✅ | Jump to extremes |
| Number Shortcuts | ❌ | ✅ | Enhanced for tables |
| Search Shortcut | ✅ (Ctrl+F) | ✅ (/) | Simpler key |
| Help System | ❌ | ✅ (?) | Built-in |
| Visual Selection | ✅ | ✅ | Color-coded |
| Enter for Action | ✅ | ✅ | Toggle switches |

## Technical Implementation

- **React Hooks**: `useEffect` for keyboard listeners
- **Refs**: Track table and row elements for scrolling
- **State Management**: Active table and selected row tracking
- **Event Handling**: Global keyboard event capture
- **Smart Filtering**: Ignores keys when typing in inputs
- **Smooth Scrolling**: CSS smooth scroll behavior

## Future Enhancements (Ideas)

- [ ] Ctrl+C to copy selected row data
- [ ] Ctrl+V to paste data
- [ ] Tab key for form field navigation in modal
- [ ] Shift+Arrow for multi-select
- [ ] Ctrl+A to select all in table
- [ ] Page Up/Down for faster scrolling

## Troubleshooting

**Q: Keys not working?**  
A: Make sure no input field is focused. Press Esc to exit any input.

**Q: Modal won't close with Esc?**  
A: Click outside the modal first, then press Esc.

**Q: Can't see shortcuts help?**  
A: Press ? (Shift + /) or click the "Shortcuts" button in the header.

**Q: Selected row not visible?**  
A: It should auto-scroll. If not, use Home/End to reset position.

---

**Version**: 1.1  
**Feature**: Keyboard Navigation  
**Status**: ✅ Production Ready  
**Updated**: January 14, 2026
