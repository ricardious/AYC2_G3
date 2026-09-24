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

display_output_file="${TMPDIR:-/tmp}/smartegg-esp32-display-animation-test"
g++ -std=c++17 -Wall -Wextra -Werror -pedantic \
  -I"$script_dir/stubs" \
  -I"$firmware_dir" \
  "$firmware_dir/Display.cpp" \
  "$script_dir/display_animation_test.cpp" \
  -o "$display_output_file"

"$display_output_file"
echo "SmartEgg ESP32 display animation tests passed"
