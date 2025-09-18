#!/bin/bash
set -e

LOG_FILE="/greengrass/v2/logs/download_worker.log"

echo "=== BOOTSTRAP DEBUG ==="
echo "IOT_ENDPOINT: $IOT_ENDPOINT"
echo "All environment variables:"
env | grep -E "(IOT|AWS|GREENGRASS)" | sort
echo "========================"

# Optional: Create virtualenv (recommended)
# python3 -m venv venv
# source venv/bin/activate
pip3 install -r requirements.txt -t .

# Run worker
# python3 download_worker.py
