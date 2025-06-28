# Visual Programming Framework

A modular, extensible visual programming mini-framework that supports drag-and-drop programming elements, dynamic connections, and dual view modes (card/icon).

## Features

- **🎨 Dual View Modes**: Toggle between detailed card view and compact icon view
- **🔗 Visual Connections**: Drag to connect programming elements
- **⚡ Live Execution**: Run your visual programs with animated flow
- **💾 Save/Load**: Persist programs as JSON files
- **🎯 Extensible**: Easy to add new block types via registry system
- **📱 Responsive**: Works on desktop and tablet devices
- **⌨️ Keyboard Shortcuts**: Speed up development with hotkeys

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone or create project:**
```bash
mkdir visual-programming
cd visual-programming
```

2. **Create package.json and install dependencies:**
```bash
npm init -y
npm install vite typescript lodash-es --save-dev
npm install
```

3. **Copy all the provided files** to their respective locations:
   - `package.json` (root)
   - `vite.config.ts` (root)
   - `index.html` (root)
   - `src/main.ts`
   - `src/core/registry.ts`
   - `src/core/renderer.ts`
   - `src/core/executor.ts`
   - `src/ui/editor.ts`
   - `src/ui/viewToggle.ts`
   - `src/themes/card.css`
   - `src/themes/icon.css`

4. **Start development server:**
```bash
npm run dev
```

5. **Open browser** to `http://localhost:3000`

## Building for Production

```bash
npm run build
npm run preview
```

## Project Structure

```
/
├── package.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.ts                 # App entry point
    ├── core/
    │   ├── registry.ts         # Block type definitions
    │   ├── renderer.ts         # DOM manipulation
    │   └── executor.ts         # Program execution
    ├── ui/
    │   ├── editor.ts          # Drag & drop logic
    │   └── viewToggle.ts      # View mode switching
    └── themes/
        ├── card.css           # Detailed card view
        └── icon.css           # Compact icon view
```

## Usage

### Basic Operations

1. **Add Elements**: Click buttons in the toolbar to add programming elements
2. **Connect Elements**: Click "Connect" button, then click output → input points
3. **Drag Elements**: Click and drag any element to reposition
4. **Execute Program**: Click "Execute Code" to run your visual program
5. **Toggle Views**: Click "View" button to switch between card/icon modes

### Keyboard Shortcuts

- `Ctrl/Cmd + S`: Save program
- `Ctrl/Cmd + O`: Load program
- `Ctrl/Cmd + Enter`: Execute program
- `Escape`: Exit connect mode
- `Delete`: Remove selected element

### Adding New Block Types

The framework is designed to be easily extensible. Add new block types by registering them:

```typescript
import { BlockRegistry } from './src/core/registry.js';

BlockRegistry.register('myBlock', {
  displayName: 'My Custom Block',
  category: 'logic',
  inputs: ['input1', 'input2'],
  outputs: ['result'],
  defaultProps: { value: 'default' },
  execute: async (ctx) => {
    const result = ctx.inputs.input1 + ctx.inputs.input2;
    await ctx.go('result', result);
  },
  render: (props) => ({
    label: 'custom',
    content: `My Block: ${props.value}`
  })
});
```

## Built-in Block Types

### Data Types
- **Variable**: Store single values
- **Array**: Store collections of items
- **Object**: Store key-value pairs
- **Counter**: Increment/decrement numbers

### Control Flow
- **Function**: Define reusable functions
- **If**: Conditional branching
- **Loop**: Iterate over collections
- **Return**: Return values

### Math & Logic
- **Add**: Addition operations
- **Multiply**: Multiplication operations
- **Compare**: Compare two values

### Input/Output
- **Print**: Output messages
- **Input**: Get user input

## Architecture

### Core Principles

1. **Separation of Concerns**: Engine, rendering, and UI are separate modules
2. **Type Safety**: Full TypeScript with runtime validation
3. **Extensibility**: Plugin-like architecture for new blocks
4. **Performance**: Efficient DOM updates and execution

### Key Components

- **BlockRegistry**: Central repository for all block types and their behavior
- **Renderer**: Handles all DOM manipulation and visual updates
- **ExecutionEngine**: Manages program execution and flow control
- **Editor**: Main UI controller for user interactions
- **ViewToggle**: Manages card/icon view switching

## Configuration

### View Toggle Options

```typescript
const viewToggle = new ViewToggle({
  persistState: true,           // Save view preference
  storageKey: 'my-app-view',   // LocalStorage key
  onViewChange: (mode) => {     // View change callback
    console.log(`Switched to ${mode}`);
  }
});
```

### Execution Options

```typescript
await editor.executeProgram({
  stepDelay: 500,              // Delay between steps (ms)
  maxExecutionTime: 30000,     // Maximum runtime (ms)
  maxSteps: 100,               // Maximum execution steps
  onElementStart: (id) => {},  // Element start callback
  onElementComplete: (id) => {},// Element complete callback
  onError: (error) => {}       // Error handling
});
```

## Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## Dependencies

- **Vite**: Build tool and dev server
- **TypeScript**: Type safety and modern JavaScript
- **Lodash-ES**: Utility functions (tree-shakeable)

## Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Submit pull request

## License

MIT License - feel free to use in your projects!

## Troubleshooting

### Common Issues

**Elements not connecting**: Make sure you're in connect mode (click Connect button) and clicking output point first, then input point.

**Program not executing**: Check that elements are connected in a valid flow from a starting element (like Array or Variable).

**View toggle not working**: Ensure both CSS files are properly loaded and the JavaScript has access to modify document classes.

**Build errors**: Make sure all dependencies are installed and TypeScript files have correct imports.

### Debug Mode

Open browser dev tools and access global objects:

```javascript
// Access block registry
window.BlockRegistry.getAll()

// Access app instance (if exposed)
window.VisualProgrammingApp
```

## Roadmap

- [ ] More block types (API calls, file I/O, etc.)
- [ ] Undo/redo functionality
- [ ] Mini-map for large programs
- [ ] Plugin system for external blocks
- [ ] Collaborative editing
- [ ] Mobile touch support
- [ ] Export to other programming languages

---

🚀 **Happy Visual Programming!**
