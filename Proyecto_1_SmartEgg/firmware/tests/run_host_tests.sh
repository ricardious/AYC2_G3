#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
firmware_dir="$script_dir/../SmartEggESP32"
output_file="${TMPDIR:-/tmp}/smartegg-esp32-control-logic-test"

g++ -std=c++17 -Wall -Wextra -Werror -pedantic \
  -I"$firmware_dir" \
  "$firmware_dir/ControlLogic.cpp" \
  "$script_dir/control_logic_test.cpp" \
  -o "$output_file"

"$output_file"
echo "SmartEgg ESP32 control logic tests passed"
