#!/usr/bin/env python3
"""
Daily scraping master script
Runs both indie and AMC scrapers, then processes the data
"""

import subprocess
import sys
import os
from datetime import datetime

def run_script(script_name, description):
    """Run a Python script and handle errors"""
    print(f"\n{'='*50}")
    print(f"Running {description}...")
    print(f"{'='*50}")
    
    try:
        result = subprocess.run([sys.executable, script_name], 
                              capture_output=True, text=True, check=True)
        print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error running {script_name}:")
        print(f"STDOUT: {e.stdout}")
        print(f"STDERR: {e.stderr}")
        return False

def main():
    """Run all scraping and processing steps"""
    start_time = datetime.now()
    print(f"Starting daily scraping process at {start_time}")
    
    # Step 1: Run indie theater scraper
    if not run_script("webscrapetheaters.py", "Indie Theater Scraper"):
        print("Failed to run indie theater scraper")
        return False
    
    # Step 2: Run AMC scraper
    if not run_script("amc_logger.py", "AMC Theater Scraper"):
        print("Failed to run AMC scraper")
        return False
    
    # Step 3: Process and consolidate data
    if not run_script("daily_processor.py", "Data Processor"):
        print("Failed to run data processor")
        return False
    
    end_time = datetime.now()
    duration = end_time - start_time
    print(f"\n{'='*50}")
    print(f"Daily scraping completed successfully!")
    print(f"Total duration: {duration}")
    print(f"{'='*50}")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 