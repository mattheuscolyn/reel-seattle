# Daily Showtime Scraping System

This system automatically scrapes showtimes from indie theaters and AMC theaters daily, preserving historical data and tracking newly announced movies.

## Files Overview

### Core Scripts
- `webscrapetheaters.py` - Scrapes indie theaters (The Beacon, SIFF)
- `amc_logger.py` - Scrapes AMC theaters via API
- `daily_processor.py` - Processes and consolidates daily data
- `run_daily_scraping.py` - Master script that runs everything

### Data Files (created automatically)
- `public/showtimes.csv` - Latest AMC showtimes
- `public/indieshowtimes.csv` - Latest indie theater showtimes
- `public/data/showtimes_history.csv` - All historical showtime data
- `public/data/movies_announcements.csv` - Track when movies were first announced
- `public/data/newly_announced.csv` - Movies announced in last 7 days
- `public/data/daily_logs/` - Archived daily raw data

## How It Works

### Daily Process
1. **Scrape indie theaters** - Runs `webscrapetheaters.py`
2. **Scrape AMC theaters** - Runs `amc_logger.py` 
3. **Process data** - Runs `daily_processor.py`
   - Compares new data with historical data
   - Preserves all historical records
   - Tracks when movies were first announced
   - Archives daily raw data

### Data Preservation
- **New showtimes**: Added with `first_seen_date = today`
- **Existing showtimes**: Updated with `last_updated = today`
- **Missing showtimes**: Kept in historical data (not deleted)
- **Past showtimes**: Never modified

### New Movie Tracking
- Tracks when each movie was first announced at each theater
- `data/newly_announced.csv` contains movies announced in last 7 days
- Perfect for "newly announced movies" website features

## Running Manually

### Single Run
```bash
python run_daily_scraping.py
```

### Individual Scripts
```bash
# Just indie theaters
python webscrapetheaters.py

# Just AMC theaters  
python amc_logger.py

# Just process data
python daily_processor.py
```

## Automated Daily Execution

### GitHub Actions (Recommended)
- Automatically runs daily at 6 AM UTC (10 PM PST)
- Requires `AMC_API_KEY` secret in repository settings
- Commits updated data files automatically

### Local Cron Job (Alternative)
```bash
# Add to crontab
0 6 * * * cd /path/to/project && python run_daily_scraping.py
```

## Data Structure

### showtimes_history.csv
```csv
Date,Time,Theater,Film,Runtime,isAlmostSoldOut,posterDynamic,first_seen_date,last_updated,source
07/11/2025,7:00 PM,SIFF Film Center,Year of the Fox,97,None,https://...,2024-01-15,2024-01-16,indie
```

### movies_announcements.csv
```csv
Film,Theater,first_announced_date,last_seen_date
Year of the Fox,SIFF Film Center,2024-01-15,2024-01-16
```

### newly_announced.csv
```csv
Film,Theater,first_announced_date,last_seen_date
New Movie,AMC Pacific Place,2024-01-16,2024-01-16
```

## Setup for GitHub Actions

1. **Add AMC API Key Secret**:
   - Go to repository Settings → Secrets and variables → Actions
   - Add secret named `AMC_API_KEY` with your AMC API key

2. **Enable Actions**:
   - Go to repository Settings → Actions → General
   - Enable "Allow all actions and reusable workflows"

3. **First Run**:
   - Go to Actions tab
   - Click "Daily Showtime Scraping"
   - Click "Run workflow" to test

## Monitoring

### Check Recent Activity
- View `data/newly_announced.csv` for recently announced movies
- Check `data/daily_logs/` for archived daily data
- Monitor GitHub Actions tab for execution status

### Troubleshooting
- Check individual script outputs in GitHub Actions logs
- Verify `AMC_API_KEY` secret is set correctly
- Ensure all dependencies are installed

## Benefits

- **Historical Preservation**: Never lose past showtime data
- **New Movie Tracking**: Easy to find recently announced movies  
- **Data Integrity**: Track when showtimes were added/removed
- **Scalable**: Easy to add more theaters
- **Automated**: Runs daily without manual intervention
- **Version Controlled**: All data changes tracked in Git 