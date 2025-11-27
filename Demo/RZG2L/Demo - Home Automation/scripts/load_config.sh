#!/bin/bash

CONFIG_FILE="./config.yaml"

get_config() {
  python3 - <<EOF
import yaml
with open("$CONFIG_FILE") as f:
    config = yaml.safe_load(f)
keys = "$1".split(".")
val = config
for k in keys:
    val = val[k]
print(val)
EOF
}