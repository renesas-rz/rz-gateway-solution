#!/bin/bash
set -euo pipefail

# Configuration
LOG_FILE="script.log"
REGION="${REGION:-us-east-1}"

# OTA-specific environment variables
export THING_NAME="${THING_NAME:-g2l_core_ota}"
export COMPONENT_NAME="${COMPONENT_NAME:-OtaUpdateComponent}"
export SOURCE_DIR="${SOURCE_DIR:-../}"
export S3_BUCKET="${S3_BUCKET:-}"  # Will auto-generate if not set
export S3_PREFIX="${S3_PREFIX:-components/${COMPONENT_NAME}}"
export DEPLOYMENT_NAME="${DEPLOYMENT_NAME:-}"  # Will auto-generate if not set
export VERSION="${VERSION:-}"  # Will auto-generate if not set

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Parent log function for subscript integration
parent_log() {
    log "$1"
}

# Export the parent_log function so subscripts can use it
export -f parent_log

validate_tools() {
    log "Validating required tools..."
    
    # Check required tools for all scripts
    local required_tools=("aws" "pip3")
    local missing_tools=()
    
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &>/dev/null; then
            missing_tools+=("$tool")
        fi
    done
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log "ERROR: Missing required tools: ${missing_tools[*]}"
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

validate_project_structure() {
    log "Validating project structure for OTA deployment..."
    
    # Check if source directory exists
    if [[ ! -d "$SOURCE_DIR" ]]; then
        log "WARNING: Source directory '$SOURCE_DIR' not found."
        log "Expected project structure for OTA deployment:"
        log "  ├── script/"
        log "  │   ├── OTA_update.sh                    // main script"
        log "  │   ├── setup_ota_client_env.sh          // to setup the client env"
        log "  │   ├── setup_ota_server_env.sh          // to setup the server env using ansible"
        log "  └── src/"
        log "      └── backend/"
        log "      │   ├── requirements.txt"
        log "      │   ├── main.py"
        log "      │   └── systemd-ota.service"
        log "      └── lambda/"
        log "          ├── download_trigger/"
        log "          │   ├── lambda_bundle.py"
        log "          │   └── requirements.txt"
        log "          ├── lambda_worker/"
        log "              ├── download_worker.py"
        log "              ├── requirements.txt"
        log "              └── bootstrap.sh"

        log "      └── FOTA_frontend/"
        log "          └── build/"
        log "  ├── playbook.yaml                        // contains all the play to setup the cloud env"
        log "  ├── download_trigger.zip         // lambda function for greengrass device"
        log "  └── lambda_worker.zip            // greengrass component for long running downloads"
        return 1
    fi
    
    # Check required files for OTA deployment
    local required_files=("download_trigger.zip" "lambda_worker.zip" )
    local missing_files=()
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$SOURCE_DIR/$file" ]]; then
            missing_files+=("$file")
        fi
    done
    
    if [[ ${#missing_files[@]} -gt 0 ]]; then
        log "ERROR: Missing required files in '$SOURCE_DIR': ${missing_files[*]}"
        log "Required files:"
        log "  - download_trigger.zip: Lambda function to be deployed as greengrass component"
        log "  - lambda_worker.zip: Greengrass component for long-running S3 downloads"
        return 1
    fi
    
    # Check for backend files
    local backend_dir="../src/backend"
    if [[ -d "$backend_dir" ]]; then
        local backend_files=("requirements.txt" "main.py" "systemd-ota.service")
        for file in "${backend_files[@]}"; do
            if [[ ! -f "$backend_dir/$file" ]]; then
                log "WARNING: Missing backend file: $backend_dir/$file"
            fi
        done
    else
        log "WARNING: Backend directory not found: $backend_dir"
    fi
    
    # Check for playbook
    if [[ ! -f "../playbook.yaml" ]]; then
        log "WARNING: playbook.yaml not found (contains cloud environment setup)"
    fi
    

    
    log "Project structure validation passed for OTA deployment"
    return 0
}

if [ "$#" -ne 4 ]; then
    echo "Usage: $0 <AWS_ACCESS_KEY_ID> <AWS_SECRET_ACCESS_KEY> <AWS_SESSION_TOKEN> <REGION>"
    echo ""
    echo "This script sets up the OTA update environment with:"
    echo "  - download_trigger.zip: Lambda function deployed as greengrass component"
    echo "  - lambda_worker.zip: Greengrass component for long-running S3 downloads"
    echo "  - Uses playbook.yaml for cloud environment setup"
    echo "  - Downloads will be stored in bundle_download/ directory"
    exit 1
fi

export AWS_ACCESS_KEY_ID="$1"
export AWS_SECRET_ACCESS_KEY="$2"
export AWS_SESSION_TOKEN="$3"
export AWS_REGION="$4"
export REGION="$4"

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

    log "$description"

    if [[ -f "$script_path" ]]; then
        chmod +x "$script_path"

        if [[ ${#remaining_args[@]} -gt 0 ]]; then
            env AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
                AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
                AWS_SESSION_TOKEN="${AWS_SESSION_TOKEN}" \
                AWS_REGION="${AWS_REGION}" \
                REGION="${REGION}" \
                THING_NAME="${THING_NAME}" \
                COMPONENT_NAME="${COMPONENT_NAME}" \
                SOURCE_DIR="${SOURCE_DIR}" \
                S3_BUCKET="${S3_BUCKET}" \
                S3_PREFIX="${S3_PREFIX}" \
                DEPLOYMENT_NAME="${DEPLOYMENT_NAME}" \
                VERSION="${VERSION}" \
                "$script_path" "${remaining_args[@]}" 2>&1 | tee -a "$LOG_FILE"
        else
            env AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
                AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
                AWS_SESSION_TOKEN="${AWS_SESSION_TOKEN}" \
                AWS_REGION="${AWS_REGION}" \
                REGION="${REGION}" \
                THING_NAME="${THING_NAME}" \
                COMPONENT_NAME="${COMPONENT_NAME}" \
                SOURCE_DIR="${SOURCE_DIR}" \
                S3_BUCKET="${S3_BUCKET}" \
                S3_PREFIX="${S3_PREFIX}" \
                DEPLOYMENT_NAME="${DEPLOYMENT_NAME}" \
                VERSION="${VERSION}" \
                "$script_path" 2>&1 | tee -a "$LOG_FILE"
        fi

        if [[ "${PIPESTATUS[0]}" -ne 0 ]]; then
            if [[ "$optional" == "true" ]]; then
                log "WARNING: $description failed but continuing (optional step)"
                return 0
            else
                log "ERROR: $description failed!"
                exit 1
            fi
        fi

        log "Completed: $description"
    else
        if [[ "$optional" == "true" ]]; then
            log "WARNING: Script not found: $script_path (optional step, skipping)"
            return 0
        else
            log "ERROR: Script not found: $script_path"
            exit 1
        fi
    fi
}

# === MAIN START ===
log "Starting OTA Update System Setup..."
log "========================================"

log "Validating credential parameters..."
if [[ -z "$AWS_ACCESS_KEY_ID" ]] || [[ -z "$AWS_SECRET_ACCESS_KEY" ]] || [[ -z "$AWS_SESSION_TOKEN" ]] || [[ -z "$AWS_REGION" ]]; then
    log "ERROR: One or more AWS credential parameters are empty!"
    log "   AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:0:10}..."
    log "   AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:+[SET]}${AWS_SECRET_ACCESS_KEY:-[EMPTY]}"
    log "   AWS_SESSION_TOKEN: ${AWS_SESSION_TOKEN:+[SET]}${AWS_SESSION_TOKEN:-[EMPTY]}"
    log "   AWS_REGION: $AWS_REGION"
    exit 1
fi
log "Credential parameters validated"

# Validate required tools
validate_tools

# Validate project structure
validate_project_structure

# Show configuration
log "Configuration:"
log "   AWS Region: $AWS_REGION"
log "   Thing Name: $THING_NAME"
log "   Component Name: $COMPONENT_NAME"
log "   Source Directory: $SOURCE_DIR"
log "========================================"

# === STEP 1: CLIENT ENV SETUP ===
run_script_with_logging "./setup_ota_client_env.sh" "Step 1: Setting up OTA client environment"

# === STEP 2: SERVER ENV SETUP ===
run_script_with_logging "./setup_ota_server_env.sh" "Step 2: Setting up OTA server environment using Ansible"

log "All setup steps completed successfully!"
log "========================================"
log "Summary:"
log "   ✓ OTA client environment setup"
log "   ✓ OTA server environment setup"
log "   ✓ Lambda components ready:"
log "     - download_trigger.zip (Lambda function for Greengrass device)"
log "     - lambda_worker.zip (Greengrass component for long-running S3 downloads)"

log "Component Roles:"
log "   - download_trigger.zip: Deployed as Lambda function on Greengrass device"
log "   - lambda_worker.zip: Acts as Greengrass component for long-running downloads from S3"
log ""
log "Useful URLs:"
log "   - IoT Console: https://${AWS_REGION}.console.aws.amazon.com/iot/home?region=${AWS_REGION}"
log "   - Greengrass Console: https://${AWS_REGION}.console.aws.amazon.com/iot/home?region=${AWS_REGION}#/greengrass/v2/core-devices"
log "   - Lambda Console: https://${AWS_REGION}.console.aws.amazon.com/lambda/home?region=${AWS_REGION}"