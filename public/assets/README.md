# Store Logos

This directory should contain the logo files for each store:

## Required Files

1. **mjm-logo.png** - Logo for MJM86 AUTOPART
   - Recommended size: 40-48px height
   - Format: PNG with transparent background
   - Should be placed at: `/public/assets/mjm-logo.png`

2. **bjw-logo.png** - Logo for BJW AUTOPART
   - Recommended size: 40-48px height
   - Format: PNG with transparent background
   - Should be placed at: `/public/assets/bjw-logo.png`

## Usage

The logos are referenced in `config/storeConfig.ts` and will be displayed in:
- Login screen header
- Main application header
- Receipt modal (future)

If the logo files are not found, the application will fall back to displaying icon graphics.
