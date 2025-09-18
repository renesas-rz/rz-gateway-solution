#!/bin/bash
set -euo pipefail

LOG_FILE="script.log"
PLAYBOOK_SOURCE="../playbook.yaml"
ANSIBLE_DIR="ansible_start"
CREDENTIALS_FILE="$ANSIBLE_DIR/credentials.txt"
PLAYBOOK_DEST="$ANSIBLE_DIR/playbook.yaml"
SRC_BACKEND_DIR="$(realpath ../src/backend)"
SRC_FRONTEND_BUILD_DIR="$(realpath ../src/ota_frontend/build)"
SERVICE_FILE="$SRC_BACKEND_DIR/systemd-ota.service"
REQUIREMENTS_FILE="$SRC_BACKEND_DIR/requirements.txt"
LAMBDA_REQUIREMENTS_FILE="$(realpath ../src/lambda/download_trigger/requirements.txt)"
THING_NAME="g2l_core_ota"


log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

cleanup() {
    log "Cleaning up sensitive files..."
    [[ -f "$CREDENTIALS_FILE" ]] && rm -f "$CREDENTIALS_FILE"
}

trap cleanup EXIT

validate_environment() {
    log "Validating environment variables..."
    
    # Check required environment variables
    : "${REGION:?Error: REGION environment variable not set}"
    : "${AWS_ACCESS_KEY_ID:?Error: AWS_ACCESS_KEY_ID not set}"
    : "${AWS_SECRET_ACCESS_KEY:?Error: AWS_SECRET_ACCESS_KEY not set}"
    : "${AWS_SESSION_TOKEN:?Error: AWS_SESSION_TOKEN not set}"
    
    # Validate region format
    if [[ ! "$REGION" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]; then
        log "WARNING: Region format looks unusual: $REGION"
    fi
    
    log "Environment validation passed."
}

get_latest_ami() {
    local region=$1
    # log "Fetching latest Ubuntu 20.04 LTS AMI for region: $region"

    local ami_id
    ami_id=$(aws ec2 describe-images \
        --region "$region" \
        --owners 099720109477 \
        --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*" \
                  "Name=state,Values=available" \
        --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
        --output text 2>>"$LOG_FILE")

    if [[ -z "$ami_id" || "$ami_id" == "None" ]]; then
        log "ERROR: Could not fetch latest Ubuntu 20.04 AMI for region $region"
        exit 1
    fi

    echo "$ami_id"
}


set_env_vars_in_bashrc() {
    log "Exporting AWS credentials to ~/.bashrc..."
    
    # Backup existing bashrc
    [[ -f ~/.bashrc ]] && cp ~/.bashrc ~/.bashrc.backup."$(date +%s)"
    
    touch ~/.bashrc
    
    # Remove existing AWS exports
    sed -i '/^export AWS_ACCESS_KEY_ID=/d' ~/.bashrc
    sed -i '/^export AWS_SECRET_ACCESS_KEY=/d' ~/.bashrc
    sed -i '/^export AWS_SESSION_TOKEN=/d' ~/.bashrc
    sed -i '/^export AWS_REGION=/d' ~/.bashrc
    
    # Add new exports
    {
        echo "export AWS_ACCESS_KEY_ID='$AWS_ACCESS_KEY_ID'"
        echo "export AWS_SECRET_ACCESS_KEY='$AWS_SECRET_ACCESS_KEY'"
        echo "export AWS_SESSION_TOKEN='$AWS_SESSION_TOKEN'"
        echo "export AWS_REGION='$REGION'"
    } >> ~/.bashrc
    
    # Export for current session
    export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY"
    export AWS_SESSION_TOKEN="$AWS_SESSION_TOKEN"
    export AWS_REGION="$REGION"
    
    log "AWS credentials exported."
}

setup_ansible() {
    log "Setting up Ansible project structure..."
    
    mkdir -p ansible_start/group_vars/all/
    
    set_env_vars_in_bashrc
    
    log "Creating EC2 key pair..."
    mkdir -p ~/.ssh
    chmod 700 ~/.ssh
    
     local key_path="$(pwd)/ota-server-key.pem"
    
if [[ ! -f "$key_path" ]]; then
    # Local key file doesn't exist, check AWS

    if aws ec2 describe-key-pairs --key-names ota-server-key --region "$REGION" &>/dev/null; then
        log "Key pair 'ota-server-key' already exists in AWS. Deleting it to create a new one..."
        aws ec2 delete-key-pair --key-name ota-server-key --region "$REGION" || {
            log "ERROR: Failed to delete existing key pair."
            exit 1
        }
        log "Existing key pair deleted."
    fi
    aws ec2 create-key-pair \
            --key-name ota-server-key \
            --query 'KeyMaterial' \
            --output text \
            --region "$REGION" > "$key_path" || {
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
    ami_id=$(get_latest_ami "$REGION")

    [[ -f "$CREDENTIALS_FILE" ]] && rm -f "$CREDENTIALS_FILE"    
    log "Writing credentials.txt for Ansible..."
    cat > "$CREDENTIALS_FILE" <<EOF
ec2_access_key: $AWS_ACCESS_KEY_ID
ec2_secret_key: $AWS_SECRET_ACCESS_KEY
ec2_session_token: $AWS_SESSION_TOKEN
aws_region: $REGION
image: $ami_id
key_name: ota-server-key
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
        ip_addr=$(aws ec2 --region "$REGION" \
            describe-instances \
            --filters "Name=tag:Name,Values=ota-server" \
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

setup_bucket_name() {
    # Ensure aws_account_id is available
    if [ -z "$aws_account_id" ]; then
    log "ERROR: aws_account_id is not set. Run AWS CLI sts command first."
    exit 1
    fi

    # Construct bucket name
    local generated_bucket_name="fota-update-${aws_account_id}"

    # Export as environment variable
    export BUCKET_NAME="$generated_bucket_name"

    # Debug log
    log "S3 bucket name set to: $BUCKET_NAME"

}

# === MAIN EXECUTION ===
main() {
    log "Starting OTA Server Launch Setup..."
    
    validate_environment
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

    aws_account_id=$(aws sts get-caller-identity --query Account --output text)


    ROLE_ARN="arn:aws:iam::${aws_account_id}:role/GreengrassV2TokenExchangeRole"

    setup_bucket_name

    if [ -z "$BUCKET_NAME" ]; then
    log "ERROR: BUCKET_NAME environement varaible is not set. Please export before running"
    exit 1
    fi

    ansible-playbook $PLAYBOOK_DEST \
        -e "@$CREDENTIALS_FILE" \
        -e "backend_src=$SRC_BACKEND_DIR" \
        -e "service_src=$SERVICE_FILE" \
        -e "frontend_src=$SRC_FRONTEND_BUILD_DIR"\
        -e "requirements_src=$REQUIREMENTS_FILE" \
        -e "aws_account_id=$aws_account_id" \
        -e "role_arn=$ROLE_ARN" \
        -e "thing_name=$THING_NAME" \
        -e "bucket_name=$BUCKET_NAME" \
        -e "lambda_requirements_filepath=$LAMBDA_REQUIREMENTS_FILE" \
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

# Run main function
main "$@"