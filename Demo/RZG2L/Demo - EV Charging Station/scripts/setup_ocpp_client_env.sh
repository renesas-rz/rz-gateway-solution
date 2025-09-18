#!/bin/bash

set -euo pipefail

LOG_FILE="script.log"
GREENGRASS_VERSION="2.12.0"
THING_NAME="g2l_core_ocpp"
THING_GROUP_NAME="g2l_ocpp_update_group"
# Updated: separate role name and role alias
ROLE_NAME="GreengrassV2TokenExchangeRole"
ROLE_ACCESS="GreengrassV2TokenExchangeRoleAccess"
ROLE_ALIAS="GreengrassV2TokenExchangeRoleAlias"

CERTS_DIR="/opt/greengrass/certs"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | sudo tee -a "$LOG_FILE"
}

check_prerequisites() {
    log " Checking prerequisites..."
    
    if [[ $EUID -eq 0 ]]; then
        log "  WARNING: Running as root. Consider using a dedicated user."
    fi
    
    log " Checking AWS credential environment variables..."
    if [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
        log " AWS_ACCESS_KEY_ID is set (${AWS_ACCESS_KEY_ID:0:10}...)"
    else
        log " AWS_ACCESS_KEY_ID is not set"
    fi
    
    if [[ -n "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
        log " AWS_SECRET_ACCESS_KEY is set"
    else
        log " AWS_SECRET_ACCESS_KEY is not set"
    fi
    
    if [[ -n "${AWS_SESSION_TOKEN:-}" ]]; then
        log " AWS_SESSION_TOKEN is set"
    else
        log " AWS_SESSION_TOKEN is not set"
    fi
    
    if [[ -n "${AWS_REGION:-}" ]]; then
        log " AWS_REGION is set to: $AWS_REGION"
    else
        log " AWS_REGION is not set"
    fi
    
    # Set default region globally
    export REGION="${AWS_REGION:-${REGION:-us-east-1}}"
    export AWS_DEFAULT_REGION="$REGION"
    
    log " Prerequisites check passed."
}

install_java() {
    log "Installing Java 11..."
    
    if ! command -v java &>/dev/null; then
        sudo apt-get update
        sudo apt-get install -y openjdk-11-jdk >>"$LOG_FILE" 2>&1 || {
            log " ERROR: Failed to install Java."
            exit 1
        }
        log " Java 11 installed successfully."
    else
        java_version=$(java -version 2>&1 | head -n 1)
        log " Java already installed: $java_version"
    fi
    
    export JAVA_HOME="/usr/lib/jvm/java-11-openjdk-amd64"
    
    # Add JAVA_HOME export line if not already present
    if ! grep -q "^export JAVA_HOME=" ~/.bashrc 2>/dev/null; then
        echo "export JAVA_HOME=$JAVA_HOME" >> ~/.bashrc
    fi
}

check_and_install_pip3() {
    log " Checking for pip3..."

    if ! command -v pip3 &>/dev/null; then
        log " pip3 not found. Installing..."
        sudo apt-get update
        sudo apt-get install -y python3 python3-pip wget >>"$LOG_FILE" 2>&1
        log " pip3 installed successfully."
    else
        log " pip3 is already installed."
    fi
}

install_python_packages() {
    log " Installing Python packages..."
    pip3 install --upgrade --no-cache-dir boto boto3 ansible ocpp websockets asyncio >>"$LOG_FILE" 2>&1 || {
        log " ERROR: Failed to install Python packages."
        exit 1
    }
    log " Python packages installed."
}

install_ansible_collections() {
    log "Installing Ansible AWS collection..."
    
    pip3 install --upgrade pip boto3 botocore >>"$LOG_FILE" 2>&1
    
    ansible-galaxy collection install amazon.aws community.general community.aws --force --upgrade >>"$LOG_FILE" 2>&1 || {
        log "ERROR: Failed to install Ansible collections."
        exit 1
    }
    
    log "Verifying collection installations..."
    ansible-galaxy collection list amazon.aws >>"$LOG_FILE" 2>&1
    ansible-galaxy collection list community.aws >>"$LOG_FILE" 2>&1
    
    if ! ansible localhost -m amazon.aws.aws_caller_info >>"$LOG_FILE" 2>&1; then
        log "WARNING: AWS modules may not be working properly. Check boto3 installation."
    fi
    
    log "Ansible collections installed."
}

install_aws_cli() {
    log " Installing AWS CLI..."
    
    if ! command -v aws &>/dev/null; then
        sudo apt-get update
        sudo apt-get install -y awscli >>"$LOG_FILE" 2>&1 || {
            log " ERROR: Failed to install AWS CLI."
            exit 1
        }
        log " AWS CLI installed."
    else
        aws_version=$(aws --version)
        log " AWS CLI already installed: $aws_version"
    fi
}

create_iot_policy() {
    log " Creating IoT policy..."
    export AWS_CLI_SSL_VERIFY=false
    
    # Check if policy exists
    if aws iot get-policy --policy-name "$POLICY_NAME" --region "$REGION" &>/dev/null; then
        log " IoT policy already exists: $POLICY_NAME"
        return 0
    fi
    
    # Create IoT policy file
    cat > /tmp/iot-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iot:Connect",
        "iot:Publish",
        "iot:Subscribe",
        "iot:Receive"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "greengrass:*"
      ],
      "Resource": "*"
    }
  ]
}
EOF

    aws iot create-policy \
        --policy-name "$POLICY_NAME" \
        --policy-document file:///tmp/iot-policy.json \
        --region "$REGION" || {
        log " ERROR: Failed to create IoT policy."
        exit 1
    }
    
    rm -f /tmp/iot-policy.json
    log " IoT policy created: $POLICY_NAME"
}

# IAM Role and Policy fix with a custom inline policy granting IoT & Greengrass permission for MQTT

create_iam_role() {
    log "Creating IAM role for Greengrass with custom inline policy..."

    # Check if role exists
    if aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
        log " IAM role already exists: $ROLE_NAME"
    else
        # Create trust policy for IoT credentials service
        cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "credentials.iot.amazonaws.com",
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

        aws iam create-role \
            --role-name "$ROLE_NAME" \
            --assume-role-policy-document file:///tmp/trust-policy.json || {
            log " ERROR: Failed to create IAM role."
            exit 1
        }
        log " IAM role created: $ROLE_NAME"
    fi

    # Create custom inline policy JSON granting required permissions for MQTT & Greengrass
    cat > /tmp/custom-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "iot:Connect",
                "iot:Publish",
                "iot:Subscribe",
                "iot:Receive",
                "iot:GetThingShadow",
                "iot:UpdateThingShadow",
                "iot:DeleteThingShadow"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "greengrass:*"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
              "s3:GetObject",
              "s3:PutObject"
            ],
            "Resource": "*"
        }
    ]
}
EOF

    # Put or update the inline policy on the role
    aws iam put-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-name "GreengrassCustomMQTTPolicy" \
        --policy-document file:///tmp/custom-policy.json || {
        log " ERROR: Failed to attach inline policy to IAM role."
        exit 1
    }
    log " Custom inline IAM policy attached"

    # Create role alias if it does not exist
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

    if ! aws iot describe-role-alias --role-alias "$ROLE_ALIAS" &>/dev/null; then
        aws iot create-role-alias --role-alias "$ROLE_ALIAS" --role-arn "$ROLE_ARN" || {
            log " ERROR: Failed to create role alias."
            exit 1
        }
        log " Role alias created: $ROLE_ALIAS"
    else
        log " Role alias already exists: $ROLE_ALIAS"
    fi

    # create a device role access policy
    cat greengrass-v2-iot-policy.json > /tmp/role-access-policy.json
    aws iam get-policy \
        --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/${ROLE_ACCESS} \
        --region "$REGION" &>/dev/null || {
    log " Creating IAM policy: $ROLE_ACCESS"
    aws iam create-policy \
	 --policy-name "$ROLE_ACCESS" \
	 --policy-document file:///tmp/role-access-policy.json \
         --region "$REGION"
    }

    # Attach managed policies
    log " Attaching IAM policy: $ROLE_ACCESS"
    aws iam attach-role-policy \
        --role-name "${ROLE_NAME}" \
        --policy-arn arn:aws:iam::$ACCOUNT_ID:policy/"$ROLE_ACCESS" \
        --region "$REGION"

    log " Update IAM policy: $ROLE_ACCESS"
    aws iam put-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name "$ROLE_ACCESS" \
    --policy-document file:///tmp/role-access-policy.json \
    --region "$REGION"

    rm -f /tmp/trust-policy.json /tmp/custom-policy.json /tmp/role-access-policy.json
}

deploy_nucleus_12_0_0() {
    sleep 10
    target_arn=`aws iot describe-thing --thing-name $THING_NAME --region "$REGION" | grep thingArn`
    target_arn=$(echo "$target_arn" | sed "s/thingArn/targetArn/g")
    # Update the greengrass core to 2.12.0
cat > /tmp/deploy_nucleus.json <<EOF
{
    "targetArn":
    "deploymentName": "Deployment for GreengrassCoreDevice",
    "components": {
        "aws.greengrass.Nucleus": {
            "componentVersion": "2.12.0",
            "configurationUpdate": {
                "reset": [
                    "/networkProxy",
                    "/mqtt"
                ]
            }
        },
        "aws.greengrass.Cli": {
            "componentVersion": "2.12.0"
        }
    },
    "deploymentPolicies": {
        "failureHandlingPolicy": "ROLLBACK",
        "componentUpdatePolicy": {
            "timeoutInSeconds": 60,
            "action": "NOTIFY_COMPONENTS"
        },
        "configurationValidationPolicy": {
            "timeoutInSeconds": 60
        }
    },
    "iotJobConfiguration": {}
}
EOF
    sed -i '/"targetArn"/c\'"${target_arn}" "/tmp/deploy_nucleus.json"
    log " Update the greengrass core to 2.12.0"
    aws greengrassv2 create-deployment \
	    --cli-input-json file:///tmp/deploy_nucleus.json \
	    --region "$REGION"

    rm -rf /tmp/deploy_nucleus.json
}

download_greengrass_core() {
    log "Downloading Greengrass Core software..."

    mkdir -p /tmp/greengrass-installer
    cd /tmp/greengrass-installer

    if [[ ! -f "greengrass-${GREENGRASS_VERSION}.zip" ]]; then
        curl -O "https://d2s8p88vqu9w66.cloudfront.net/releases/greengrass-${GREENGRASS_VERSION}.zip"
    fi

    # Always clean before extracting
    rm -rf GreengrassInstaller
    mkdir -p GreengrassInstaller
    unzip "greengrass-${GREENGRASS_VERSION}.zip" -d GreengrassInstaller

    # Clean previous broken installs if needed
    sudo systemctl stop greengrass.service || true
    sudo rm -rf /greengrass/v2

    sudo -E java -Droot="/greengrass/v2" -Dlog.store=FILE \
        -jar ./GreengrassInstaller/lib/Greengrass.jar \
        --aws-region "$REGION" \
        --thing-name "$THING_NAME" \
        --thing-group-name "$THING_GROUP_NAME" \
        --component-default-user ggc_user:ggc_group \
        --provision true \
        --setup-system-service true \
        --deploy-dev-tools true

    sleep 10
    deploy_nucleus_12_0_0

    log "Greengrass Core installed at /greengrass/v2"
    cd - > /dev/null
}

configure_greengrass_core() {
    log " Configuring Greengrass Core device..."

    # Ensure REGION and POLICY_NAME variables are set globally

    # Create IoT Thing if it doesn't already exist
    if ! aws iot describe-thing --thing-name "$THING_NAME" --region "$REGION" &>/dev/null; then
        aws iot create-thing --thing-name "$THING_NAME" --region "$REGION"
    else
        log " IoT Thing already exists: $THING_NAME"
    fi

    # Create certificates directory
    sudo mkdir -p "$CERTS_DIR"
    cd "$CERTS_DIR"

    # Delete existing certificate files if any, to always recreate fresh certs
    if [[ -f "cert.pem" ]] || [[ -f "private.key" ]] || [[ -f "public.key" ]] || [[ -f "cert.json" ]]; then
        log "Existing certificates found. Removing them to create new ones..."
        sudo rm -f cert.pem private.key public.key cert.json
    fi

    log "Creating new certificates..."
    sudo -E aws iot create-keys-and-certificate \
        --set-as-active \
        --certificate-pem-outfile cert.pem \
        --public-key-outfile public.key \
        --private-key-outfile private.key \
        --region "$REGION" | sudo tee cert.json >/dev/null

    # Extract certificate ARN from cert.json
    CERT_ARN=$(grep -o '"certificateArn": *"[^"]*"' cert.json | sed -r 's/.*: *"([^"]*)"/\1/')

    # Attach the IoT policy to the certificate
    aws iot attach-policy --policy-name "$POLICY_NAME" --target "$CERT_ARN" --region "$REGION"

    # Attach the certificate to the IoT Thing principal
    aws iot attach-thing-principal --thing-name "$THING_NAME" --principal "$CERT_ARN" --region "$REGION"

    # Secure certificate files
    sudo chmod 644 private.key
    sudo chmod 644 cert.pem public.key cert.json

    log "Certificates created, policy and principal attached, and files secured"

#    # Continue with the rest of configuration: create config.yaml etc.
#
#    sudo mkdir -p /opt/greengrass/config
#
#    IOT_DATA_ENDPOINT=$(aws iot describe-endpoint --query endpointAddress --output text --region "$REGION")
#    IOT_CRED_ENDPOINT=$(aws iot describe-endpoint --query endpointAddress --endpoint-type iot:CredentialProvider --output text --region "$REGION")
#
#    sudo tee /opt/greengrass/config/config.yaml > /dev/null <<EOF
#system:
#  certificateFilePath: "$CERTS_DIR/cert.pem"
#  privateKeyPath: "$CERTS_DIR/private.key"
#  rootCaPath: "$CERTS_DIR/AmazonRootCA1.pem"
#  rootpath: "/opt/greengrass/v2"
#  thingName: "$THING_NAME"
#
#services:
#  aws.greengrass.Nucleus:
#    componentType: "NUCLEUS"
#    version: "$GREENGRASS_VERSION"
#    configuration:
#      awsRegion: "$REGION"
#      iotRoleAlias: "$ROLE_ALIAS"
#      iotDataEndpoint: "$IOT_DATA_ENDPOINT"
#      iotCredEndpoint: "$IOT_CRED_ENDPOINT"
#      thingName: "$THING_NAME"
#      deploymentPollingFrequencyMs: 15000
#      componentStoreMaxSizeBytes: 10000000000
#      platformOverride: {}
#EOF

    # Download Amazon Root CA if missing
    if [[ ! -f "$CERTS_DIR/AmazonRootCA1.pem" ]]; then
        sudo wget -O "$CERTS_DIR/AmazonRootCA1.pem" \
            https://www.amazontrust.com/repository/AmazonRootCA1.pem
    fi

    cd - > /dev/null
#    log " Greengrass config.yaml created"
}


create_systemd_service() {
    log " Creating systemd service for Greengrass..."
    
    sudo tee /etc/systemd/system/greengrass.service > /dev/null <<EOF
[Unit]
Description=AWS IoT Greengrass Core
After=network.target

[Service]
Type=forking
User=ggc_user
Group=ggc_group
ExecStart=/opt/greengrass/v2/GreengrassCore/bin/greengrass -start
ExecStop=/opt/greengrass/v2/GreengrassCore/bin/greengrass -stop
Restart=always
RestartSec=10
Environment=JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64

[Install]
WantedBy=multi-user.target
EOF

    sudo groupadd --system ggc_group 2>/dev/null || true
    sudo useradd --system --gid ggc_group --home-dir /opt/greengrass --shell /bin/false ggc_user 2>/dev/null || true
    
    sudo chown -R ggc_user:ggc_group /opt/greengrass
    sudo chown -R ggc_user:ggc_group "$CERTS_DIR"
    
    sudo systemctl daemon-reload
    sudo systemctl enable greengrass
    
    log " Systemd service created"
}

start_greengrass_core() {
    log "Starting Greengrass Core..."
    
    if sudo systemctl start greengrass; then
        sleep 15
        if sudo systemctl is-active --quiet greengrass; then
            log " Greengrass Core started via systemd"
            return 0
        fi
    fi
    
    log " Systemd failed, starting manually..."
    sudo -u ggc_user JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64 \
        /opt/greengrass/v2/GreengrassCore/bin/greengrass \
        -root /opt/greengrass/v2 \
        -init-config /opt/greengrass/config/config.yaml \
        -start &
        
    sleep 15
    log " Greengrass Core started manually"
}

verify_greengrass_status() {
    log " Verifying Greengrass status..."

    if [ "`systemctl is-active greengrass`" = "active" ]; then
        log " Greengrass process is running"
    else
        log " Greengrass process not found"
        return 1
    fi

    local log_path="/greengrass/v2/logs/greengrass.log"
    if [[ -f "$log_path" ]]; then
        log " Recent Greengrass logs:"
        tail -n 5 "$log_path" | while read -r line; do
            log "  $line"
        done
    else
        log " Greengrass log file not found at $log_path"
    fi
}

print_versions() {
    log " Installed versions:"
    python3 --version 2>&1 | sed 's/^/  /'
    pip3 --version 2>&1 | sed 's/^/  /'
    ansible --version 2>&1 | head -n 1 | sed 's/^/  /'
    aws --version 2>&1 | sed 's/^/  /'
    java -version 2>&1 | head -n 1 | sed 's/^/  /'
}

cleanup_on_exit() {
    log " Cleaning up temporary files..."
    rm -f /tmp/iot-policy.json /tmp/trust-policy.json
}

# === Main Execution ===
trap cleanup_on_exit EXIT

# Set global region variable for script
REGION=""
POLICY_NAME="GreengrassV2IoTThingPolicy"

log " Starting OCPP Client (Greengrass) environment setup..."

check_prerequisites
install_java
check_and_install_pip3
install_python_packages
install_ansible_collections
install_aws_cli
create_iot_policy
create_iam_role
download_greengrass_core
configure_greengrass_core
deploy_nucleus_12_0_0
# create_systemd_service
# start_greengrass_core
verify_greengrass_status
print_versions

log "OCPP Client setup complete with Greengrass Core"
