#!/bin/bash

# Visual Programming Framework Build Script
# This script sets up the complete project structure and dependencies

set -e  # Exit on any error

echo "🚀 Setting up Visual Programming Framework..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

echo "✅ Node.js version $NODE_VERSION detected"

# Create project structure
echo "📁 Creating project structure..."

# Create directories
mkdir -p src/core
mkdir -p src/ui  
mkdir -p src/themes
mkdir -p dist

echo "✅ Directory structure created"

# Install dependencies
echo "📦 Installing dependencies..."

# Check if package.json exists, if not create it
if [ ! -f "package.json" ]; then
    echo "Creating package.json..."
    cat > package.json << 'EOF'
{
  "name": "visual-programming-framework",
  "version": "1.0.0",
  "description": "A modular visual programming mini-framework with card/icon views",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "serve": "vite --host 0.0.0.0 --port 3000",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "typescript": "^5.0.0"
  },
  "dependencies": {
    "lodash-es": "^4.17.21"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
fi

# Install npm dependencies
npm install

echo "✅ Dependencies installed"

# Create TypeScript config if it doesn't exist
if [ ! -f "tsconfig.json" ]; then
    echo "📝 Creating TypeScript configuration..."
    cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF

    cat > tsconfig.node.json << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
EOF
fi

echo "✅ TypeScript configuration created"

# Fix common import path issues
echo "🔧 Checking for import path issues..."

if [ -f "src/main.ts" ]; then
    # Fix .js extensions in imports
    sed -i.bak 's/from \.\/registry\"/from \.\/registry\.js\"/g' src/core/*.ts 2>/dev/null || true
    sed -i.bak 's/from \.\.\/core\/registry\"/from \.\.\/core\/registry\.js\"/g' src/ui/*.ts 2>/dev/null || true
    sed -i.bak 's/from \.\.\/core\/renderer\"/from \.\.\/core\/renderer\.js\"/g' src/ui/*.ts 2>/dev/null || true
    sed -i.bak 's/from \.\.\/core\/executor\"/from \.\.\/core\/executor\.js\"/g' src/ui/*.ts 2>/dev/null || true
    sed -i.bak 's/from \.\/renderer\"/from \.\/renderer\.js\"/g' src/core/*.ts 2>/dev/null || true
    sed -i.bak 's/from \.\/registry\"/from \.\/registry\.js\"/g' src/core/*.ts 2>/dev/null || true
    
    # Clean up backup files
    find src -name "*.bak" -delete 2>/dev/null || true
fi

echo "✅ Import paths checked"

# Verify all required files exist
echo "🔍 Verifying project files..."

REQUIRED_FILES=(
    "index.html"
    "vite.config.ts"
    "src/main.ts"
    "src/core/registry.ts"
    "src/core/renderer.ts"
    "src/core/executor.ts"
    "src/ui/editor.ts"
    "src/ui/viewToggle.ts"
    "src/themes/card.css"
    "src/themes/icon.css"
)

MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo "❌ Missing required files:"
    printf '%s\n' "${MISSING_FILES[@]}"
    echo ""
    echo "Please ensure all artifact files are copied to their correct locations."
    exit 1
fi

echo "✅ All required files present"

# Run type checking
echo "🔧 Running TypeScript type check..."
if npm run type-check; then
    echo "✅ TypeScript type check passed"
else
    echo "⚠️  TypeScript type check failed, but continuing..."
fi

# Build the project
echo "🏗️  Building project..."
if npm run build; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "🎉 Visual Programming Framework setup complete!"
echo ""
echo "To start development:"
echo "  npm run dev"
echo ""
echo "To build for production:"
echo "  npm run build"
echo ""
echo "To preview production build:"
echo "  npm run preview"
echo ""
echo "Quick smoke test checklist:"
echo "  1. ✅ Drag blocks, snap to 16px grid"
echo "  2. ✅ Toggle view button switches card/icon"
echo "  3. ✅ Connect blocks and execute program"
echo "  4. ✅ Ctrl+Z/Ctrl+Y undo/redo works"
echo "  5. ✅ Reload restores auto-saved state"
echo ""
echo "🚀 Happy visual programming!"
if [ ! -f "package.json" ]; then
    echo "Creating package.json..."
    cat > package.json << 'EOF'
{
  "name": "visual-programming-framework",
  "version": "1.0.0",
  "description": "A modular visual programming mini-framework with card/icon views",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "serve": "vite --host 0.0.0.0 --port 3000",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "typescript": "^5.0.0"
  },
  "dependencies": {
    "lodash-es": "^4.17.21"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
fi

# Install npm dependencies
npm install

echo "✅ Dependencies installed"

# Create TypeScript config if it doesn't exist
if [ ! -f "tsconfig.json" ]; then
    echo "📝 Creating TypeScript configuration..."
    cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF

    cat > tsconfig.node.json << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
EOF
fi

echo "✅ TypeScript configuration created"

# Verify all required files exist
echo "🔍 Verifying project files..."

REQUIRED_FILES=(
    "index.html"
    "vite.config.ts"
    "src/main.ts"
    "src/core/registry.ts"
    "src/core/renderer.ts"
    "src/core/executor.ts"
    "src/ui/editor.ts"
    "src/ui/viewToggle.ts"
    "src/themes/card.css"
    "src/themes/icon.css"
)

MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo "❌ Missing required files:"
    printf '%s\n' "${MISSING_FILES[@]}"
    echo ""
    echo "Please ensure all artifact files are copied to their correct locations."
    exit 1
fi

echo "✅ All required files present"

# Run type checking
echo "🔧 Running TypeScript type check..."
if npm run type-check; then
    echo "✅ TypeScript type check passed"
else
    echo "⚠️  TypeScript type check failed, but continuing..."
fi

# Build the project
echo "🏗️  Building project..."
if npm run build; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "🎉 Visual Programming Framework setup complete!"
echo ""
echo "To start development:"
echo "  npm run dev"
echo ""
echo "To build for production:"
echo "  npm run build"
echo ""
echo "To preview production build:"
echo "  npm run preview"
echo ""
echo "Features included:"
echo "  ✅ Modular architecture with TypeScript"
echo "  ✅ Card/Icon view toggle"
echo "  ✅ Drag & drop programming elements"
echo "  ✅ Visual execution with animations"
echo "  ✅ Save/Load programs as JSON"
echo "  ✅ Auto-save functionality"
echo "  ✅ Minimap overview"
echo "  ✅ Undo/Redo support"
echo "  ✅ Extensible block registry"
echo "  ✅ Snap-to-grid positioning"
echo "  ✅ Keyboard shortcuts"
echo ""
echo "Happy visual programming! 🚀"