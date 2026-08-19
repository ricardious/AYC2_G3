#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
firmware_dir="$script_dir/../SmartEggFirmware"
output_file="${TMPDIR:-/tmp}/smartegg-control-logic-test"

g++ -std=c++11 -Wall -Wextra -Werror -pedantic \
  -I"$script_dir/stubs" \
  -I"$firmware_dir" \
  "$firmware_dir/ControlLogic.cpp" \
  "$script_dir/control_logic_test.cpp" \
  -o "$output_file"

"$output_file"
echo "SmartEgg control logic tests passed"
