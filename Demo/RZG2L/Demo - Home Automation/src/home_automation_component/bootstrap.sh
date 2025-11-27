#!/bin/bash
set -e

LOG_FILE="/greengrass/v2/logs/home_automation_component.log"

echo "=== BOOTSTRAP DEBUG ==="
echo "IOT_ENDPOINT: $IOT_ENDPOINT"
echo "All environment variables:"
env | grep -E "(IOT|AWS|GREENGRASS)" | sort
echo "========================"


pip3 install -r requirements.txt -t .
