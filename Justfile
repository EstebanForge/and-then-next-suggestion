default:
    @just --list

# Install node dependencies
install:
    npm ci

# Run unit tests with vitest
check:
    npm test

# Compile TypeScript to JavaScript
compile:
    npm run compile

# Compile in watch mode for development
watch:
    npm run watch

# Package extension into .vsix file
package:
    npx @vscode/vsce package --no-git-tag-version

# Full local validation and package
ci: check compile package
