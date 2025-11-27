#!/bin/bash
set -euo pipefail

LOG_FILE="script.log"

source ./load_config.sh

THING_NAME=$(get_config "iot.thing_name")
PLAYBOOK_SOURCE=$(get_config "project.playbook_source")
COMPONENT_ZIP_FILE=$(get_config "project.component_zip_file") 
SRC_BACKEND_DIR=$(get_config "project.src_backend_dir")
SRC_FRONTEND_BUILD_DIR=$(get_config "project.src_frontend_build_dir")
SERVICE_FILE=$(get_config "project.systemd_file")
REQUIREMENTS_FILE=$(get_config "project.requirements_file")
COMPONENT_NAME=$(get_config "greengrass.component_name")
COMPONENT_VERSION=$(get_config "greengrass.component_version")
DATABASE_NAME=$(get_config "awstimestream.database_name")
TABLE_NAME=$(get_config "awstimestream.table_name")
ELASTIC_IP=$(get_config "aws.elastic_ip")


ANSIBLE_DIR="ansible_start"
CREDENTIALS_FILE="$ANSIBLE_DIR/credentials.txt"
PLAYBOOK_DEST="$ANSIBLE_DIR/playbook.yaml"


log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}


validate_environment() {
    log "Validating environment variables..."
    
    # Check required environment variables
    : "${AWS_REGION:?Error: AWS_REGION environment variable not set}"
    : "${AWS_ACCESS_KEY_ID:?Error: AWS_ACCESS_KEY_ID not set}"
    : "${AWS_SECRET_ACCESS_KEY:?Error: AWS_SECRET_ACCESS_KEY not set}"
    : "${AWS_SESSION_TOKEN:?Error: AWS_SESSION_TOKEN not set}"
    
    # Validate region format
    if [[ ! "$AWS_REGION" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]; then
        log "WARNING: Region format looks unusual: $AWS_REGION"
    fi
    
    log "Environment validation passed."
}

install_ansible_and_python_packages() {
    log "Installing Python + Ansible AWS packages..."

    # Install pip3 if not available
    if ! command -v pip3 &>/dev/null; then
        log "Installing pip3..."
        sudo apt-get update >>"$LOG_FILE" 2>&1
        sudo apt-get install -y python3-pip >>"$LOG_FILE" 2>&1
    fi

    # Ensure ~/.local/bin exists in PATH for the current shell + future logins
    export PATH="$HOME/.local/bin:$PATH"
    if ! grep -q 'export PATH="$HOME/.local/bin:$PATH"' ~/.bashrc; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    fi

    # Install Python packages (with --user for safety)
    pip3 install  --upgrade --no-cache-dir boto boto3 botocore ansible ansible-core==2.13.12 asyncio >>"$LOG_FILE" 2>&1 || {
        log "ERROR: Failed to install Python packages."
        exit 1
    }

    # Rehash PATH so the shell finds ansible-playbook immediately
    hash -r

    # Sanity check: ansible-playbook binary should now be available
    if ! command -v ansible-playbook &>/dev/null; then
        log "ERROR: ansible-playbook not found in PATH. Check ~/.local/bin"
        ls -l "$HOME/.local/bin/" | grep ansible >>"$LOG_FILE" 2>&1
        exit 1
    fi

    # Install Ansible collections
    ansible-galaxy collection install amazon.aws community.aws community.general --force --upgrade >>"$LOG_FILE" 2>&1 || {
        log "ERROR: Failed to install Ansible collections."
        exit 1
    }

    # Verify installation
    log "Verifying Ansible collections..."
    ansible-galaxy collection list amazon.aws >>"$LOG_FILE" 2>&1
    ansible-galaxy collection list community.aws >>"$LOG_FILE" 2>&1

    if ! ansible localhost -m amazon.aws.aws_caller_info >>"$LOG_FILE" 2>&1; then
        log "WARNING: AWS modules may not be working properly. Check boto3 installation."
    fi

    log "Ansible + Python dependencies installed successfully."
}


get_latest_ami() {

    local ami_id
    ami_id=$(aws ec2 describe-images \
        --region "$AWS_REGION" \
        --owners 099720109477 \
        --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*" \
                  "Name=state,Values=available" \
        --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
        --output text 2>>"$LOG_FILE")

    if [[ -z "$ami_id" || "$ami_id" == "None" ]]; then
        log "ERROR: Could not fetch latest Ubuntu 20.04 AMI for region $AWS_REGION"
        exit 1
    fi

    echo "$ami_id"
}

setup_ansible() {
    log "Setting up Ansible project structure..."
    
    mkdir -p ansible_start/group_vars/all/
        
    log "Creating EC2 key pair..."
    mkdir -p ~/.ssh
    chmod 700 ~/.ssh
    
     local key_path="$(pwd)/homeautomation-server-key.pem"
    
if [[ ! -f "$key_path" ]]; then
    # Local key file doesn't exist, check AWS

    if aws ec2 describe-key-pairs --key-names homeautomation-server-key --region "$AWS_REGION" &>/dev/null; then
        log "Key pair 'homeautomation-server-key' already exists in AWS. Deleting it to create a new one..."
        aws ec2 delete-key-pair --key-name homeautomation-server-key --region "$AWS_REGION" || {
            log "ERROR: Failed to delete existing key pair."
            exit 1
        }
        log "Existing key pair deleted."
    fi
    aws ec2 create-key-pair \
            --key-name homeautomation-server-key \
            --query 'KeyMaterial' \
            --output text \
            --region "$AWS_REGION" > "$key_path" || {
            log "ERROR: Failed to create EC2 key pair."
            exit 1
        }
        chmod 400 "$key_path"
        log "EC2 key pair saved to $key_path"
    # fi
else
    log "Key pair already exists at $key_path. Skipping creation."
fi
    
    # Get latest AMI instead of hardcoded one
    local ami_id
    ami_id=$(get_latest_ami "$AWS_REGION")

    [[ -f "$CREDENTIALS_FILE" ]] && rm -f "$CREDENTIALS_FILE"    
    log "Writing credentials.txt for Ansible..."
    cat > "$CREDENTIALS_FILE" <<EOF
ec2_access_key: $AWS_ACCESS_KEY_ID
ec2_secret_key: $AWS_SECRET_ACCESS_KEY
ec2_session_token: $AWS_SESSION_TOKEN
aws_region: $AWS_REGION
image: $ami_id
key_name: homeautomation-server-key
key_path: $key_path
EOF
    
    # Set restrictive permissions on credentials file
    chmod 600 "$CREDENTIALS_FILE"

    log "Validating credentials file format..."
    if ! python3 -c "import yaml; yaml.safe_load(open('$CREDENTIALS_FILE'))" 2>>"$LOG_FILE"; then
        log "ERROR: Generated credentials file has invalid YAML format"
        log "Contents of credentials file:"
        cat "$CREDENTIALS_FILE" >> "$LOG_FILE"
        exit 1
    fi
    log "Credentials file validated successfully."
}

get_ip_address() {  
    local max_attempts=5
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log "Attempting to get IP address (attempt $attempt/$max_attempts)..."
        
        local ip_addr
        ip_addr=$(aws ec2 --region "$AWS_REGION" \
            describe-instances \
            --filters "Name=tag:Name,Values=homeautomation-instance" \
                     "Name=instance-state-name,Values=running" \
            --query "Reservations[*].Instances[*].PublicIpAddress" \
            --output text 2>>"$LOG_FILE")
        
        if [[ -n "$ip_addr" && "$ip_addr" != "None" ]]; then
            echo "$ip_addr"
            return 0
        fi
        
        log "No IP found, waiting 10 seconds before retry..."
        sleep 10
        ((attempt++))
    done
    
    log "ERROR: Failed to retrieve IP after $max_attempts attempts"
    return 1
}

main() {
    log "Starting Home Automation Server Launch Setup..."
    
    validate_environment
    install_ansible_and_python_packages
    setup_ansible
    
    log "Running Ansible playbook to create EC2 and deploy FastAPI..."

    if [[ ! -f "$PLAYBOOK_SOURCE" ]]; then
    log "ERROR: Playbook not found at $PLAYBOOK_SOURCE"
    exit 1
    fi

    log "Copying playbook from $PLAYBOOK_SOURCE to $PLAYBOOK_DEST..."
    cp "$PLAYBOOK_SOURCE" "$PLAYBOOK_DEST" || {
    log "ERROR: Failed to copy playbook to ansible directory."
    exit 1
    }

    export ANSIBLE_SCP_IF_SSH=true

    aws_account_id=$(aws sts get-caller-identity --query Account --output text)\
    
    ansible-playbook $PLAYBOOK_DEST \
        -e "@$CREDENTIALS_FILE" \
        -e "backend_src=$SRC_BACKEND_DIR" \
        -e "frontend_src=$SRC_FRONTEND_BUILD_DIR"\
        -e "service_src=$SERVICE_FILE" \
        -e "requirements_src=$REQUIREMENTS_FILE" \
        -e "aws_account_id=$aws_account_id" \
        -e "thing_name=$THING_NAME" \
        -e "component_zip_file=$COMPONENT_ZIP_FILE" \
        -e "component_name=$COMPONENT_NAME" \
        -e "component_version=$COMPONENT_VERSION" \
        -e "database_name=$DATABASE_NAME" \
        -e "table_name=$TABLE_NAME" \
        -e "elastic_ip_name=$ELASTIC_IP" \
        2>&1 | tee -a "$LOG_FILE"

    status=${PIPESTATUS[0]}

    if [ "$status" -ne 0 ]; then
    log "ERROR: Ansible provisioning failed. Check logs."
    exit 1
    fi
    
    local instance_ip
    if ! instance_ip=$(get_ip_address); then
        log "ERROR: Failed to retrieve EC2 instance public IP."
        exit 1
    fi
    
    log "EC2 launched successfully at IP: $instance_ip"
    log "Setup completed successfully!"
}


main


cleanup() {
    log "Cleaning up sensitive files..."
    [[ -f "$CREDENTIALS_FILE" ]] && rm -f "$CREDENTIALS_FILE"
}

trap cleanup EXIT
