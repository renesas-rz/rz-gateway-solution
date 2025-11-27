#!/bin/bash
set -euo pipefail


LOG_FILE="script.log"


# Load config
chmod +x "load_config.sh"
source ./load_config.sh


log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

parent_log() {
    log "$1"
}

# Export the parent_log function so subscripts can use it
export -f parent_log

update_config() {
    local key=$1
    local value=$2
    
    python3 - <<EOF
import yaml
import sys

CONFIG_FILE = "./config.yaml"

try:
    with open(CONFIG_FILE, 'r') as f:
        config = yaml.safe_load(f)
    
    keys = "$key".split(".")
    
    # Navigate to the nested key
    current = config
    for k in keys[:-1]:
        if k not in current:
            current[k] = {}
        current = current[k]
    
    # Set the value
    current[keys[-1]] = "$value"
    
    # Write back to file
    with open(CONFIG_FILE, 'w') as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    
    print("Updated $key to: $value")
    sys.exit(0)
    
except Exception as e:
    print(f"Error updating config: {e}", file=sys.stderr)
    sys.exit(1)
EOF
}


CREDENTIALS_FROM_ARGS=false

if [ $# -eq 4 ]; then
    log "All AWS credentials provided as arguments. These will override config.yaml values."
    
    AWS_ACCESS_KEY_ARG="$1"
    AWS_SECRET_KEY_ARG="$2"
    AWS_SESSION_TOKEN_ARG="$3"
    AWS_REGION_ARG="$4"
    
    CREDENTIALS_FROM_ARGS=true
    
    log "Updating config.yaml with new credentials..."
    
    # Update config.yaml with all provided credentials (overwrite existing)
    update_config "aws.aws_access_key" "$AWS_ACCESS_KEY_ARG"
    update_config "aws.aws_secret" "$AWS_SECRET_KEY_ARG"
    update_config "aws.region" "$AWS_REGION_ARG"
    update_config "aws.aws_session_token" "$AWS_SESSION_TOKEN_ARG"
    
    log "Successfully updated all AWS credentials in config.yaml"
    log "  - AWS Region: $AWS_REGION_ARG"
    log "  - Access Key: ${AWS_ACCESS_KEY_ARG:0:10}***"
    log "  - Secret Key: ***"
    log "  - Session Token: ${AWS_SESSION_TOKEN_ARG:0:20}***"
    
elif [ $# -eq 0 ]; then
    log "No arguments provided. Using existing credentials from config.yaml..."
    log "Note: If credentials are expired, re-run with: $0 <access_key> <secret_key> <region> <session_token>"
else
    log "ERROR: Invalid number of arguments"
    echo ""
    echo "Usage:"
    echo "  $0  # Use credentials from config.yaml"
    echo "  $0 <aws_access_key> <aws_secret_key> <region> <session_token>    # Update and use new credentials"
    echo ""
    echo "Arguments:"
    echo "  aws_access_key    - AWS Access Key ID (e.g., AKIAIOSFODNN7EXAMPLE)"
    echo "  aws_secret_key    - AWS Secret Access Key"
    echo "  region            - AWS Region (e.g., us-east-1)"
    echo "  session_token     - AWS Session Token (for temporary credentials)"
    exit 1
fi



THING_NAME=$(get_config "iot.thing_name")
COMPONENT_NAME=$(get_config "greengrass.component_name")


if [ "$CREDENTIALS_FROM_ARGS" = true ]; then
    AWS_REGION="$AWS_REGION_ARG"
    AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ARG"
    AWS_SESSION_TOKEN="$AWS_SESSION_TOKEN_ARG"
    AWS_SECRET_ACCESS_KEY="$AWS_SECRET_KEY_ARG"
    log "Using credentials from command line arguments"
else
    # Load from config.yaml
    AWS_REGION=$(get_config "aws.region")
    AWS_ACCESS_KEY_ID=$(get_config "aws.aws_access_key")
    AWS_SESSION_TOKEN=$(get_config "aws.aws_session_token")
    AWS_SECRET_ACCESS_KEY=$(get_config "aws.aws_secret")
    log "Using credentials from config.yaml"
fi


# Validate that credentials are present
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ] || [ -z "$AWS_REGION" ]; then
    log "ERROR: AWS credentials are missing in config.yaml"
    log "Please either:"
    log "  1. Provide credentials as arguments: $0 <access_key> <secret_key> <aws_session> <region>"
    log "  2. Update config.yaml with valid credentials"
    exit 1
fi

log "Configuration loaded successfully"
log "AWS Region: $AWS_REGION"
log "Thing Name: $THING_NAME"
log "Component Name: $COMPONENT_NAME"

export THING_NAME COMPONENT_NAME AWS_ACCESS_KEY_ID AWS_REGION AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN




validate_tools() {
    log " Validating required tools..."
    
    # Check required tools for all scripts
    local required_tools=("aws" "pip3")
    local missing_tools=()
    
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &>/dev/null; then
            missing_tools+=("$tool")
        fi
    done
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log " ERROR: Missing required tools: ${missing_tools[*]}"
        log "Please install the missing tools:"
        for tool in "${missing_tools[@]}"; do
            case $tool in
                "aws")
                    log "  - AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
                    ;;
                "pip3")
                    log "  - pip3: sudo apt-get install python3-pip (Ubuntu/Debian) or yum install python3-pip (RHEL/CentOS)"
                    ;;
            esac
        done
        exit 1
    fi
    
    log "All required tools are available"
}


run_script_with_logging() {
    local script_path="$1"
    local description="$2"
    local optional="false"

    shift 2

    # If third arg is true/false, treat it as optional flag
    if [[ $# -ge 1 && ( "$1" == "true" || "$1" == "false" ) ]]; then
        optional="$1"
        shift
    fi

    local remaining_args=()
    for arg in "$@"; do
        remaining_args+=("$arg")
    done

    log " $description"

    if [[ -f "$script_path" ]]; then
        chmod +x "$script_path"

        if [[ ${#remaining_args[@]} -gt 0 ]]; then
            env AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
                AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
                AWS_SESSION_TOKEN="${AWS_SESSION_TOKEN}" \
                AWS_REGION="${AWS_REGION}" \
                THING_NAME="${THING_NAME}" \
                COMPONENT_NAME="${COMPONENT_NAME}" \
                "$script_path" "${remaining_args[@]}" 2>&1 | tee -a "$LOG_FILE"
        else
            env AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
                AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
                AWS_SESSION_TOKEN="${AWS_SESSION_TOKEN}" \
                AWS_REGION="${AWS_REGION}" \
                THING_NAME="${THING_NAME}" \
                COMPONENT_NAME="${COMPONENT_NAME}" \
                "$script_path" 2>&1 | tee -a "$LOG_FILE"
        fi

        if [[ "${PIPESTATUS[0]}" -ne 0 ]]; then
            if [[ "$optional" == "true" ]]; then
                log "  WARNING: $description failed but continuing (optional step)"
                return 0
            else
                log "ERROR: $description failed!"
                exit 1
            fi
        fi

        log "Completed: $description"
    else
        if [[ "$optional" == "true" ]]; then
            log "  WARNING: Script not found: $script_path (optional step, skipping)"
            return 0
        else
            log " ERROR: Script not found: $script_path"
            exit 1
        fi
    fi
}


log "Starting Home Automation Setup on RZG2L ..."
log "========================================"

log " Validating credential parameters..."
if [[ -z "$AWS_ACCESS_KEY_ID" ]] || [[ -z "$AWS_SECRET_ACCESS_KEY" ]] || [[ -z "$AWS_SESSION_TOKEN" ]] || [[ -z "$AWS_REGION" ]]; then
    log "  ERROR: One or more AWS credential parameters are empty!"
    log "   AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:0:10}..."
    log "   AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:+[SET]}${AWS_SECRET_ACCESS_KEY:-[EMPTY]}"
    log "   AWS_SESSION_TOKEN: ${AWS_SESSION_TOKEN:+[SET]}${AWS_SESSION_TOKEN:-[EMPTY]}"
    log "   AWS_REGION: $AWS_REGION"
    exit 1
fi
log "Credential parameters validated"


# Validate required tools
validate_tools

# Show configuration
log " Configuration:"
log "   AWS Region: $AWS_REGION"
log "   Greengrass Thing Name: $THING_NAME"
log "   Component Name: $COMPONENT_NAME"
log "========================================"


# === STEP 1: CLIENT ENV HOME AUTOMATION SETUP ===
run_script_with_logging "./client_env_home_automation.sh" "Step 1: Setting up client environment for home automation"

# === STEP 2: SERVER (EC2) SETUP ===
chmod +x "./server_env_home_automation.sh"

run_script_with_logging "./server_env_home_automation.sh" "Step 2: Configure the cloud enviornment"

log " All setup steps completed successfully!"
log "========================================"
log " Summary:"
log "   Home Automation client environment setup"
log "   Home Automation Backend deployment on EC2"
