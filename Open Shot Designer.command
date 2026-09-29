#!/bin/zsh
# Double-click this file in Finder to build and open the desktop workspace.
set -eu

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

fail() {
  print -r -- "$1"
  read -r "?Press Return to close this window."
  exit 1
}

command -v npm >/dev/null 2>&1 || fail "Node.js is missing. Install Node.js before opening Shot Designer."
ELECTRON_APP="$PROJECT_DIR/node_modules/electron/dist/Electron.app"
[[ -d "$ELECTRON_APP" ]] || fail "App dependencies are missing. Run npm install in the Shotdesigner folder first."

print "Preparing Shot Designer…"
npm run build || fail "The app could not be built. The error is shown above."

# Finder launches do not inherit the project working directory. Pass it explicitly
# so the desktop app continues to use this folder's scenes and shot lists.
/usr/bin/open -a "$ELECTRON_APP" --args "$PROJECT_DIR" --shotdesigner-desktop "--shotdesigner-workspace=$PROJECT_DIR" || fail "Shot Designer could not open."

print ""
print "Shot Designer is open as a desktop app. No web server is running."
print "You can close this Terminal window. Quit the app with Command-Q."
