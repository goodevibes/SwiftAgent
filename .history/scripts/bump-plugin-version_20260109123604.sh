#!/bin/bash
# scripts/bump-plugin-version.sh

# Find the VERSION file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION_FILE="$SCRIPT_DIR/../VERSION"

BUMP_TYPE=${1:-patch}  # patch, minor, major

# Get current version
if [ -f "$VERSION_FILE" ]; then
    CURRENT_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
else
    CURRENT_VERSION="0.1.0"
fi

# Parse version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Bump based on type
case "$BUMP_TYPE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

# Update VERSION file
echo "$NEW_VERSION" > "$VERSION_FILE"

# Update root README.md with new version
ROOT_README="$SCRIPT_DIR/../README.md"

if [ -f "$ROOT_README" ]; then
  # Try platform-independent sed for the version string
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' -E "s/\*\*Version:\*\* [0-9]+\.[0-9]+\.[0-9]+/**Version:** ${NEW_VERSION}/g" "$ROOT_README"
  else
    sed -i -E "s/\*\*Version:\*\* [0-9]+\.[0-9]+\.[0-9]+/**Version:** ${NEW_VERSION}/g" "$ROOT_README"
  fi
  echo "Updated root README to version $NEW_VERSION"
fi

echo "Bumped SwiftAgent version from $CURRENT_VERSION to $NEW_VERSION"
exit 0